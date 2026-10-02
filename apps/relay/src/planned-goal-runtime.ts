import { nowIso, sha256Hex } from "./auth.js";
import { LeaseLostError } from "./automation-store.js";
import { planAgentTurn, PlannerTransientError, type AgentPlannerDecision } from "./agent-planner.js";
import { validateAgentToolArguments } from "./agent-tools.js";
import { takeSourceDecision } from "./source-goals.js";
import type { AgentGoalSpec, AutomationEnv, AutomationRow, AutomationStatus, RuntimeState } from "./automations.js";
import { activePhase, adaptiveCandidates, finishPhase, initialPlannedState, plannedReport, recordProgress, revisePhases, sanitizeChecks, sanitizePhases, selectPhase, startPhase, timeBudget, type GoalCheck, type PlannedState, type PhaseOutcome } from "./planned-goals.js";

type Ops = {
  call(tool: string, args: Record<string, unknown>): Promise<unknown>;
  save(status: AutomationStatus, next: string | null, error: string | null, event: string, retainLease?: boolean): Promise<void>;
  finish(summary: string, status: AutomationStatus): Promise<void>;
};
const compact = (v: unknown, max = 4000) => (typeof v === "string" ? v : JSON.stringify(v)).slice(0, max);
const offline = (e: unknown) => String(e).toLowerCase().includes("device offline");
const lost = (e: unknown) => /managed process not found|retention window has expired/i.test(String(e));
const nextTick = (task: AutomationRow, s: PlannedState) => {
  const now = nowIso(), b = timeBudget(s, now, task.expires_at);
  return new Date(Math.min(Date.parse(now) + task.interval_seconds * 1000,
    b.deadline ? Date.parse(b.deadline) - (s.finalizing ? 0 : s.plan.time_policy.finalization_reserve_seconds * 1000) : Infinity)).toISOString();
};
const wakeAt = (task: AutomationRow, s: PlannedState) => {
  const b = timeBudget(s, nowIso(), task.expires_at);
  const phase = activePhase(s);
  const phaseEnd = phase?.max_duration_seconds && s.phase_started_at ? Date.parse(s.phase_started_at) + phase.max_duration_seconds * 1000 : Infinity;
  const finalization = b.deadline ? Date.parse(b.deadline) - s.plan.time_policy.finalization_reserve_seconds * 1000 : Infinity;
  const alarm = Math.min(phaseEnd, finalization);
  return Number.isFinite(alarm) ? new Date(Math.max(Date.now(), alarm)).toISOString() : null;
};
export function plannedContext(s: PlannedState, task: Pick<AutomationRow, "expires_at">) {
  return { plan: s.plan, plan_revision: s.plan_revision, current_phase: activePhase(s) || null,
    time: timeBudget(s, nowIso(), task.expires_at), plan_memory: s.plan_memory, phase_memory: s.phase_memory,
    outcomes: s.outcomes, revisions: s.revisions, green_frontier: s.green_frontier || null, candidate: s.candidate || null,
    quality_results: s.checks, execution_slice: s.slice ? { purpose: s.slice.purpose, index: s.slice.index, checks: s.slice.steps.map(c => c.name) } : null,
    local_progress: Boolean(s.slice || s.process_started_at), needs_reasoning: s.needs_reasoning || null,
    replan_reason: s.replan_reason || null, watchdog: s.watchdog,
    next_safe_action_class: s.finalizing ? "finalization" : s.needs_reasoning ? "source_reasoning" : s.slice ? "deterministic_execution" : "phase_decision",
    inspection_required: s.inspection_required === true, workspace: s.workspace || null, final_report: s.report || null };
}
export function validatePlannedDecision(decision: AgentPlannerDecision, goal: AgentGoalSpec, s?: PlannedState) {
  if (!goal.plan) {
    if (!["tool", "complete", "pause"].includes(decision.decision)) throw new Error("Planned decision requires a planned Agent Goal.");
    return;
  }
  if (["complete", "phase_result"].includes(decision.decision) && !decision.completionEvidence.trim()) throw new Error("Phase result requires factual evidence.");
  if (s?.inspection_required && !["pause", "needs_reasoning"].includes(decision.decision) &&
    !(decision.decision === "tool" && ["read_file", "list_directory", "get_file_info"].includes(decision.tool))) {
    throw new Error("Unknown prior effect requires a bounded read-only inspection before new effects or completion.");
  }
  const args = decision.arguments;
  if (decision.decision === "revise_plan") {
    if (s?.active_phase || s?.slice || s?.finalizing) throw new Error("Settle the current phase before revising.");
    // Existing settled phases are needed to validate dependencies on prior work.
    const settled = s?.plan.phases.filter(p => s.outcomes.some(o => o.id === p.id)) || [];
    const phases = sanitizePhases([...settled, ...(Array.isArray(args.phases) ? args.phases : [])], goal.workspace);
    if (!Array.isArray(args.phases) || !args.phases.length) throw new Error("Plan revision requires bounded justified phases.");
    if (args.adaptive && goal.plan.continuation.mode !== "highest_value_safe_work") throw new Error("Adaptive continuation was not authorized.");
    for (const p of phases) if ((p.verify_command || p.execution_slice?.length) && !goal.allowed_tools.includes("start_process")) throw new Error("Phase commands require terminal authority.");
  }
  if (decision.decision === "execution_slice") {
    if (!goal.allowed_tools.includes("start_process") || !s?.active_phase) throw new Error("Execution slice requires an active phase and terminal access.");
    if (!sanitizeChecks(args.steps, goal.workspace).length) throw new Error("Execution slice requires steps.");
  }
  if (decision.decision === "phase_result" && !["completed", "partial", "blocked", "failed", "skipped"].includes(String(args.outcome))) throw new Error("Invalid phase outcome.");
  if (s?.finalizing && !["needs_reasoning", "pause"].includes(decision.decision)) throw new Error("Task is finalizing; new work is closed.");
}

export async function executePlannedGoal(env: AutomationEnv, task: AutomationRow, goal: AgentGoalSpec, state: RuntimeState, ops: Ops) {
  const now = nowIso();
  const s = state.planned ||= initialPlannedState(goal.plan!, now);
  state.agent ||= { iteration: 0, memory: "", observation: "Initial planned goal." };
  const agent = state.agent;
  const save = (event = "planned_checkpoint", status: AutomationStatus = "waiting", error: string | null = null, retain = false) =>
    ops.save(status, nextTick(task, s), error, event, retain);
  const wait = async (reason: string, continueHosted = true) => {
    s.needs_reasoning = reason.slice(0, 2000); state.phase = "needs_reasoning";
    agent.observation = s.needs_reasoning;
    const hosted = goal.controller !== "source" && continueHosted && agent.iteration < goal.max_iterations && s.watchdog.strategy_retries <= s.plan.recovery_policy.max_strategy_retries;
    await ops.save(hosted ? "waiting" : "waiting_for_event", hosted ? nextTick(task, s) : wakeAt(task, s), reason, hosted ? "replan_required" : "needs_agent");
  };
  const mapPath = (p: string | undefined) => {
    if (!s.workspace) return p;
    const root = goal.workspace!.replace(/[\\/]+$/, ""), compare = p?.replaceAll("\\", "/"), normalized = root.replaceAll("\\", "/");
    if (compare?.split("/").includes("..")) throw new Error("Candidate paths cannot traverse out of the owned worktree.");
    const candidate = s.workspace.path.replaceAll("\\", "/").replace(/\/+$/, "");
    const fold = (v: string) => /^[A-Za-z]:/.test(normalized) ? v.toLowerCase() : v;
    if (compare && (fold(compare) === fold(candidate) || fold(compare).startsWith(fold(candidate) + "/"))) return p;
    if (!p || fold(compare!) === fold(normalized)) return s.workspace.path;
    if (compare && fold(compare).startsWith(fold(normalized) + "/")) return s.workspace.path + "/" + compare.slice(normalized.length + 1);
    throw new Error("Planned quality work must stay in its isolated task workspace.");
  };
  const checks = (phase = activePhase(s)): GoalCheck[] => {
    const result = [...(s.plan.quality_policy?.required_checks || [])];
    if (goal.verify) result.push({ name: "goal-verification", command: goal.verify.command, cwd: goal.verify.cwd, timeout_seconds: 300 });
    if (phase?.verify_command) result.push({ name: "phase-" + phase.id, command: phase.verify_command, cwd: phase.verify_cwd || goal.workspace, timeout_seconds: 300 });
    return result;
  };
  const workspace = async (action: string, tree?: string) => {
    if (timeBudget(s, nowIso(), task.expires_at).hard_stop) throw new Error("Hard deadline reached; checkpoint mutation closed.");
    const operationId = await sha256Hex(JSON.stringify([state.run_id, s.plan_revision, s.active_phase || "baseline", action, s.workspace?.generation || 0]));
    const result = await ops.call("goal_workspace", { task_id: task.id + "_" + state.run_id, workspace: goal.workspace!, action,
      operation_id: operationId,
      ...(s.workspace ? { expected_frontier: s.workspace.frontier } : {}),
      ...(tree ? { expected_tree: tree } : {}) }) as NonNullable<PlannedState["workspace"]> & { tree?: string; git_status?: string };
    if (!result.path || !result.frontier || !result.root || !Number.isInteger(result.generation)) throw new Error("Device lacks owned checkpoint support; update remotelink.");
    s.workspace = result;
    if (typeof result.git_status === "string") s.git_status = result.git_status;
    return result.tree;
  };
  const reject = async (evidence: string) => {
    s.candidate = { ...s.candidate, status: "rejected", evidence, path: s.workspace?.path };
    s.rejected.push({ phase_id: s.active_phase, evidence: evidence.slice(0, 3000), path: s.workspace?.path, at: nowIso() }); s.rejected = s.rejected.slice(-48);
    if (s.workspace && s.plan.quality_policy?.rollback_on_regression) await workspace("reject");
  };
  const phaseEnd = async (outcome: PhaseOutcome, evidence: string, remaining = "", blocker?: string) => {
    finishPhase(s, outcome, nowIso(), evidence, remaining, blocker); agent.memory = ""; agent.completion_evidence = undefined;
    s.process_started_at = undefined; s.process_timeout_seconds = undefined; state.phase = "idle";
    const next = selectPhase(s, nowIso(), task.expires_at);
    if (next && !s.finalizing) startPhase(s, next, nowIso());
    await ops.save("waiting", nowIso(), null, "phase_finished");
  };
  const finalize = async (reason: string) => {
    if (!s.finalizing) {
      s.finalizing = true; s.needs_reasoning = undefined; s.slice = undefined;
      if (state.process_id) {
        const pid = state.process_id; state.process_id = undefined;
        await ops.call("stop_process", { process_id: pid }).catch(e => {
          agent.observation = "Process settlement unavailable for " + pid + ": " + String(e);
          s.needs_reasoning = agent.observation;
          s.candidate = { ...s.candidate, status: "unknown", evidence: agent.observation };
        });
      }
      if (s.active_phase) finishPhase(s, "partial", nowIso(), reason, "Unfinished work preserved before deadline.");
      if (s.candidate?.status === "working" || s.candidate?.status === "evaluating") {
        await reject("Unaccepted candidate at finalization.").catch(e => { s.needs_reasoning = "Candidate recovery unavailable: " + String(e); });
      }
      s.slice = { purpose: "final", steps: checks(undefined), index: 0 }; s.checks = []; state.phase = "finalizing";
      await save("finalization_started", "waiting", reason, true);
    }
    if (!s.slice?.steps.length || timeBudget(s, nowIso(), task.expires_at).hard_stop) {
      if (s.slice && s.slice.index < s.slice.steps.length) s.checks.push({ name: s.slice.steps[s.slice.index]!.name, exit_code: null, passed: false, evidence: "Deadline prevents remaining checks.", at: nowIso() });
      s.slice = undefined; s.finished_at = nowIso(); s.report = plannedReport(s); state.phase = "finalizing";
      await ops.finish(compact(s.report, 6000), "completed"); return true;
    }
    return false;
  };
  try {
    let b = timeBudget(s, now, task.expires_at);
    if (b.finalization_due || s.finalizing) if (await finalize("Authorized time window reached; settle and report.")) return;
    const phase = activePhase(s);
    if (!s.finalizing && phase?.max_duration_seconds && s.phase_started_at && Date.parse(now) - Date.parse(s.phase_started_at) >= phase.max_duration_seconds * 1000) {
      if (state.process_id) await ops.call("stop_process", { process_id: state.process_id });
      state.process_id = undefined; await reject("Phase maximum duration exhausted.");
      await phaseEnd("partial", "Phase maximum duration exhausted.", "Phase work is incomplete."); return;
    }
    if (state.process_id) {
      const pid = state.process_id;
      let status: { status?: string; exit_code?: number | null };
      try { status = await ops.call("process_status", { process_id: pid }) as typeof status; }
      catch (e) {
        if (!lost(e)) throw e;
        state.process_id = undefined; s.slice = undefined; s.process_started_at = undefined;
        s.inspection_required = true;
        s.candidate = { ...s.candidate, status: "unknown", evidence: "Process handle lost after reconnect; do not replay." };
        await wait("Managed process outcome unknown. Inspect saved candidate before deciding to retry."); return;
      }
      if (status.status === "running") {
        if (s.process_started_at && s.process_timeout_seconds && Date.now() - Date.parse(s.process_started_at) >= s.process_timeout_seconds * 1000) {
          await ops.call("stop_process", { process_id: pid }); status = { exit_code: null, status: "timed_out" };
        } else { await save("process_wait", "running"); return; }
      }
      const output = await ops.call("process_output", { process_id: pid }).catch(e => ({ error: String(e) }));
      const processDuration = Math.max(0, (Date.now() - Date.parse(s.process_started_at || nowIso())) / 1000);
      s.useful_seconds = (s.useful_seconds || 0) + processDuration;
      s.phase_useful_seconds = (s.phase_useful_seconds || 0) + processDuration;
      state.process_id = undefined; s.process_started_at = undefined;
      const passed = status.exit_code === 0;
      const evidence = compact({ exit_code: status.exit_code ?? null, output }); agent.observation = evidence;
      if (s.slice) {
        const check = s.slice.steps[s.slice.index]!;
        s.checks.push({ name: check.name, exit_code: status.exit_code ?? null, passed, evidence, at: nowIso() }); s.checks = s.checks.slice(-16);
        s.slice.index++;
        if (!passed) {
          const purpose = s.slice.purpose; s.slice = undefined;
          if (purpose === "final") { s.needs_reasoning = "Final check did not pass; inspect the final report and accepted frontier."; await finalize("Final checks stopped on failure."); s.slice = undefined; }
          else if (purpose === "baseline") { s.replan_reason = "Baseline checks failed; no green frontier established."; }
          else {
            const stuck = recordProgress(s, evidence, false, true);
            await reject(evidence);
            if (stuck || purpose === "execution") await phaseEnd("blocked", evidence, "Check failure requires another strategy.", evidence);
            else { await wait("Quality regression. Candidate isolated; source must change strategy before further work."); return; }
          }
        }
      } else {
        if (recordProgress(s, evidence, passed, !passed)) {
          await reject(evidence); await phaseEnd("blocked", evidence, "Repeated strategy failed.", evidence); return;
        }
      }
      await save("process_result", "waiting", null, true);
    }
    if (s.finalizing && !s.slice) { s.finished_at = nowIso(); s.report = plannedReport(s); await ops.finish(compact(s.report, 6000), "completed"); return; }
    if (s.slice && s.slice.index >= s.slice.steps.length) {
      const slice = s.slice; s.slice = undefined;
      if (slice.purpose === "baseline" || slice.purpose === "quality") {
        if (s.workspace) await workspace("capture", slice.candidate_tree);
        if (s.checks.length && s.checks.every(c => c.passed)) s.green_frontier = { checkpoint: s.workspace?.frontier || "verified-" + task.revision, at: nowIso(), ...(s.active_phase ? { phase_id: s.active_phase } : {}), checks: structuredClone(s.checks) };
        s.candidate = { ...s.candidate, status: "accepted", evidence: compact(s.checks), path: s.workspace?.path };
        if (slice.purpose === "quality") { await phaseEnd("completed", slice.completion_evidence || compact(s.checks)); return; }
      } else if (slice.purpose === "execution") {
        const required = checks();
        if (required.length) { const evidence = compact(s.checks); s.checks = []; s.slice = { purpose: "quality", steps: required, index: 0, completion_evidence: evidence }; }
        else { await phaseEnd("completed", "All authorized deterministic slice steps passed."); return; }
      } else { if (s.workspace) await workspace("status"); s.finished_at = nowIso(); s.report = plannedReport(s); await ops.finish(compact(s.report, 6000), "completed"); return; }
      await save("slice_completed", "waiting", null, true);
    }
    if (!s.workspace && s.plan.quality_policy) {
      await workspace("create"); s.checks = []; s.slice = { purpose: "baseline", steps: s.plan.quality_policy.required_checks, index: 0 };
      await save("workspace_isolated", "waiting", null, true);
    }
    if (!s.active_phase && !s.slice && !s.finalizing && !s.needs_reasoning) {
      const next = selectPhase(s, nowIso(), task.expires_at);
      if (next) { startPhase(s, next, nowIso()); await save("phase_started", "waiting", null, true); }
      else {
        const pending = s.plan.phases.filter(p => !s.outcomes.some(o => o.id === p.id));
        const usefulMin = s.plan.time_policy.min_duration_seconds || 0;
        if (pending.length || s.outcomes.some(o => o.outcome !== "completed") || s.plan.continuation.mode === "highest_value_safe_work" || (s.useful_seconds || 0) < usefulMin || !s.plan.phases.length) {
          s.replan_reason = pending.length ? "Remaining phases are dependency-blocked or do not fit the safe window." : "Inspect for worthwhile bounded work; minimum time never authorizes filler.";
        } else { if (await finalize("All authorized phases settled.")) return; }
      }
    }
    if (s.slice) {
      if (s.workspace && ["baseline", "quality"].includes(s.slice.purpose) && !s.slice.candidate_tree) {
        s.slice.candidate_tree = await workspace("fingerprint");
        await save("candidate_fingerprinted", "waiting", null, true);
      }
      const step = s.slice.steps[s.slice.index]!; b = timeBudget(s, nowIso(), task.expires_at);
      const window = s.finalizing ? b.remaining_seconds : b.safe_seconds;
      if (window !== null && window < 1) { if (await finalize("No safe execution window remains.")) return; }
      else {
        const phaseNow = activePhase(s), phaseLeft = phaseNow?.max_duration_seconds && s.phase_started_at ? phaseNow.max_duration_seconds - (Date.now() - Date.parse(s.phase_started_at)) / 1000 : Infinity;
        const timeout = Math.max(1, Math.floor(Math.min(step.timeout_seconds, window ?? Infinity, phaseLeft)));
        s.slice.started_at = nowIso(); s.process_started_at = nowIso(); s.process_timeout_seconds = timeout;
        await save("slice_step_intent", "waiting", null, true);
        const started = await ops.call("start_process", { command: step.command, cwd: mapPath(step.cwd || goal.workspace), background: true, max_duration_seconds: timeout }) as { process_id?: string };
        if (!started.process_id) throw new Error("Device did not return managed process id."); state.process_id = started.process_id; state.phase = "planned_process_running";
        await save("slice_step_running", "running"); return;
      }
    }
    if (s.finalizing) return;
    if (agent.iteration >= goal.max_iterations) { await wait("Planning iteration budget exhausted; saved work is preserved.", false); return; }
    const p = activePhase(s);
    const decision = goal.controller === "source" ? await takeSourceDecision(env.DB, task) : await planAgentTurn(env, {
      objective: p?.objective || goal.objective, successCriteria: p?.success_criteria || goal.success_criteria, workspace: s.workspace?.path || goal.workspace,
      iteration: agent.iteration + 1, maxIterations: goal.max_iterations, allowedTools: goal.allowed_tools,
      memory: s.phase_memory, observation: agent.observation, plannedContext: plannedContext(s, task),
    });
    if (!decision) { await wait(s.replan_reason || "Next action requires the source AI; saved deterministic work has settled."); return; }
    validatePlannedDecision(decision, goal, s); agent.iteration++; agent.last_decision_summary = decision.decisionSummary;
    agent.memory = decision.memory; s.phase_memory = decision.memory; s.needs_reasoning = undefined;
    await save("planned_decision", "waiting", null, true);
    if (decision.decision === "pause") { await ops.save("paused", null, decision.decisionSummary, "paused"); return; }
    if (decision.decision === "needs_reasoning") { await wait(decision.decisionSummary || "New high-level judgment is required.", false); return; }
    if (decision.decision === "revise_plan") {
      const settled = s.plan.phases.filter(x => s.outcomes.some(o => o.id === x.id));
      let phases = sanitizePhases([...settled, ...(decision.arguments.phases as unknown[])], goal.workspace).filter(x => !settled.some(d => d.id === x.id));
      if (decision.arguments.adaptive) {
        phases = adaptiveCandidates(phases, s, nowIso(), task.expires_at).slice(0, 1);
        if (!phases.length) { await wait("No justified verifiable adaptive candidate fits remaining safe time."); return; }
      }
      revisePhases(s, phases, String(decision.arguments.reason || decision.decisionSummary), nowIso());
      if (recordProgress(s, JSON.stringify(phases), false, false)) { await wait("Repeated planning without execution; new strategy required."); return; }
      await save("plan_revised"); return;
    }
    if (decision.decision === "execution_slice") {
      s.checks = []; s.slice = { purpose: "execution", steps: sanitizeChecks(decision.arguments.steps, goal.workspace), index: 0 };
      await save("slice_saved"); return;
    }
    if (decision.decision === "complete" || decision.decision === "phase_result") {
      if (!s.active_phase) {
        if (decision.decision === "complete") { if (await finalize(decision.completionEvidence)) return; await save("finalization_ready"); return; }
        throw new Error("No current phase to settle.");
      }
      const outcome = decision.decision === "complete" ? "completed" : decision.arguments.outcome as PhaseOutcome;
      if (outcome === "completed") {
        const required = checks();
        if (required.length) { s.candidate = { ...s.candidate, status: "evaluating" }; s.checks = []; s.slice = { purpose: "quality", steps: required, index: 0, completion_evidence: decision.completionEvidence }; await save("quality_gate_saved"); }
        else await phaseEnd("completed", decision.completionEvidence);
      } else { await reject(decision.completionEvidence); await phaseEnd(outcome, decision.completionEvidence, String(decision.arguments.remaining_work || ""), String(decision.arguments.blocker || "")); }
      return;
    }
    if (decision.tool === "none" || !goal.allowed_tools.includes(decision.tool)) throw new Error("Unapproved planned goal tool.");
    if (!s.active_phase && !["read_file", "list_directory", "get_file_info"].includes(decision.tool)) throw new Error("Persist an authorized phase before significant execution.");
    const args: Record<string, unknown> = validateAgentToolArguments(decision.tool, decision.arguments);
    for (const key of ["path", "file_path"]) if (args[key] !== undefined) args[key] = mapPath(String(args[key]));
    b = timeBudget(s, nowIso(), task.expires_at);
    if (b.finalization_due) { if (await finalize("Planning consumed the safe execution window.")) return; await save("finalization_ready"); return; }
    if (decision.tool === "start_process") {
      args.cwd = mapPath(typeof args.cwd === "string" ? args.cwd : goal.workspace);
      const max = activePhase(s)?.max_duration_seconds;
      const phaseLeft = max && s.phase_started_at ? max - (Date.now() - Date.parse(s.phase_started_at)) / 1000 : Infinity;
      args.max_duration_seconds = Math.max(1, Math.floor(Math.min(300, b.safe_seconds ?? Infinity, phaseLeft)));
      s.process_started_at = nowIso(); s.process_timeout_seconds = Number(args.max_duration_seconds);
    }
    const result = await ops.call(decision.tool, args); agent.observation = compact(result, 12000);
    if (["read_file", "list_directory", "get_file_info"].includes(decision.tool)) s.inspection_required = false;
    if (decision.tool === "start_process") state.process_id = (result as { process_id?: string }).process_id;
    // File edits are candidate progress, not accepted progress. Reads/repeated
    // identical observations count toward the bounded no-progress watchdog.
    const material = ["write_file", "edit_block"].includes(decision.tool);
    if (recordProgress(s, agent.observation, material, false)) { await reject("No material progress within policy."); await phaseEnd("blocked", "No material progress within policy."); return; }
    await save("planned_observation", state.process_id ? "running" : "waiting");
  } catch (e) {
    if (e instanceof LeaseLostError) throw e;
    if (e instanceof PlannerTransientError) throw e;
    if (offline(e)) { await save("device_wait", "waiting_for_device", "Device offline; planned checkpoint retained."); return; }
    if (s.finalizing) { s.needs_reasoning = String(e).slice(0, 2000); s.finished_at = nowIso(); s.report = plannedReport(s); await ops.finish(compact(s.report, 6000), "completed"); return; }
    // An unacknowledged slice step must not be replayed when a source submits
    // the next turn or a hosted planner retries. Preserve facts for inspection.
    if (s.slice && !state.process_id) {
      s.slice = undefined;
      s.inspection_required = true;
      s.candidate = { ...s.candidate, status: "unknown", evidence: "Execution/checkpoint outcome requires inspection: " + String(e) };
    }
    if (recordProgress(s, String(e), false, true) && s.active_phase) {
      await reject(String(e)).catch(() => undefined); await phaseEnd("blocked", String(e), "Safe strategy exhausted.", String(e)); return;
    }
    await wait("Checkpoint preserved; reasoning required: " + String(e));
  }
}
