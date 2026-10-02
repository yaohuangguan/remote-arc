// Bounded factual state for the existing Agent Goal. No transport or second
// scheduler lives here; automations.ts owns leases, effects and checkpoints.
export type GoalCheck = { name: string; command: string; cwd?: string; timeout_seconds: number };
export type GoalPhase = {
  id: string; objective: string; success_criteria: string;
  verify_command?: string; verify_cwd?: string;
  min_duration_seconds?: number; max_duration_seconds?: number;
  depends_on: string[]; execution_slice?: GoalCheck[];
  selection?: { value: number; risk: number; confidence: number; estimated_seconds: number; justification: string };
};
export type GoalPlan = {
  planning_mode: "fixed" | "guided" | "autonomous";
  priorities: string[]; phases: GoalPhase[];
  time_policy: { min_duration_seconds?: number; max_duration_seconds?: number; end_at?: string; timezone?: string; finalization_reserve_seconds: number };
  quality_policy?: { promotion: "green_only"; required_checks: GoalCheck[]; rollback_on_regression: boolean };
  recovery_policy: { same_failure_limit: number; no_progress_iteration_limit: number; max_strategy_retries: number; on_stuck: "replan"; on_repeated_failure: "rollback_and_switch"; on_blocked: "park_and_continue" };
  continuation: { mode: "none" | "highest_value_safe_work" };
};
export type PhaseOutcome = "completed" | "partial" | "blocked" | "failed" | "skipped";
export type PhaseResult = { id: string; started_at?: string; ended_at: string; spent_seconds: number; useful_seconds: number; outcome: PhaseOutcome; evidence: string; remaining_work: string; blocker?: string; checkpoint?: string };
export type CheckResult = { name: string; exit_code: number | null; passed: boolean; evidence: string; at: string };
export type PlannedState = {
  version: 1; plan: GoalPlan; started_at: string; active_phase?: string; phase_started_at?: string;
  useful_seconds?: number; phase_useful_seconds?: number;
  plan_memory: string; phase_memory: string; outcomes: PhaseResult[];
  revisions: { revision: number; at: string; reason: string; phase_ids: string[] }[];
  plan_revision: number; replan_reason?: string; needs_reasoning?: string;
  watchdog: { signature?: string; repeated: number; no_progress: number; strategy_retries: number; rejected_signatures: string[] };
  workspace?: { path: string; root: string; frontier: string; generation: number };
  green_frontier?: { checkpoint: string; at: string; phase_id?: string; checks: CheckResult[] };
  candidate?: { status: "working" | "evaluating" | "accepted" | "rejected" | "unknown"; phase_id?: string; evidence?: string; path?: string };
  rejected: { phase_id?: string; evidence: string; path?: string; at: string }[];
  checks: CheckResult[];
  slice?: { purpose: "execution" | "baseline" | "quality" | "final"; steps: GoalCheck[]; index: number; started_at?: string; completion_evidence?: string; candidate_tree?: string };
  process_started_at?: string; process_timeout_seconds?: number;
  finalizing?: boolean; finished_at?: string; report?: ReturnType<typeof plannedReport>;
  git_status?: string;
  inspection_required?: boolean;
};
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Expected a plan object."); return v as Obj; };
const text = (v: unknown, max: number, optional = false): string => {
  if (optional && v === undefined) return "";
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error("Invalid bounded plan text.");
  return v.trim();
};
const number = (v: unknown, fallback: number | undefined, min = 1, max = 7 * 86400): number | undefined => {
  if (v === undefined) return fallback;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new Error("Invalid plan duration or recovery limit.");
  return v;
};
const list = (v: unknown, limit: number): unknown[] => { if (v === undefined) return []; if (!Array.isArray(v) || v.length > limit) throw new Error("Plan list exceeds its bound."); return v; };
export function sanitizeChecks(value: unknown, workspace?: string): GoalCheck[] {
  return list(value, 8).map(item => { const check = obj(item); return {
    name: text(check.name, 80), command: text(check.command, 4000),
    ...(check.cwd !== undefined || workspace ? { cwd: text(check.cwd ?? workspace, 500) } : {}),
    timeout_seconds: number(check.timeout_seconds, 300, 1, 3600)!,
  }; });
}
export function sanitizePhases(value: unknown, workspace?: string): GoalPhase[] {
  const phases = list(value, 24).map(item => {
    const p = obj(item), id = text(p.id, 80);
    if (!/^[A-Za-z0-9_.-]+$/.test(id)) throw new Error("Invalid phase id.");
    const min = number(p.min_duration_seconds, undefined), max = number(p.max_duration_seconds, undefined);
    if (min && max && min > max) throw new Error("Phase minimum exceeds maximum.");
    const selection = p.selection === undefined ? undefined : obj(p.selection);
    if (selection && ["value", "risk", "confidence", "estimated_seconds"].some(k => selection[k] === undefined)) throw new Error("Adaptive selection requires value, risk, confidence and effort.");
    return { id, objective: text(p.objective, 2000), success_criteria: text(p.success_criteria, 2000),
      ...(p.verify_command !== undefined ? { verify_command: text(p.verify_command, 4000), verify_cwd: text(p.verify_cwd ?? workspace, 500, true) || undefined } : {}),
      ...(min ? { min_duration_seconds: min } : {}), ...(max ? { max_duration_seconds: max } : {}),
      depends_on: list(p.depends_on, 24).map(d => text(d, 80)),
      ...(p.execution_slice !== undefined ? { execution_slice: sanitizeChecks(p.execution_slice, workspace) } : {}),
      ...(selection ? { selection: { value: number(selection.value, undefined, 1, 100)!, risk: number(selection.risk, undefined, 0, 100)!, confidence: number(selection.confidence, undefined, 1, 100)!, estimated_seconds: number(selection.estimated_seconds, undefined)!, justification: text(selection.justification, 1200) } } : {}),
    } satisfies GoalPhase;
  });
  const ids = new Set(phases.map(p => p.id));
  if (ids.size !== phases.length) throw new Error("Duplicate phase ids.");
  const visit = (id: string, ancestors: Set<string>) => {
    if (ancestors.has(id)) throw new Error("Cyclic phase dependency.");
    const p = phases.find(x => x.id === id);
    if (!p) throw new Error("Unknown phase dependency.");
    for (const d of p.depends_on) visit(d, new Set([...ancestors, id]));
  };
  for (const p of phases) visit(p.id, new Set());
  return phases;
}
export function sanitizePlan(value: unknown, workspace?: string, terminal = true): GoalPlan {
  if (JSON.stringify(value).length > 96000) throw new Error("Plan exceeds bounded context budget.");
  const raw = obj(value);
  if (!["fixed", "guided", "autonomous"].includes(String(raw.planning_mode))) throw new Error("Invalid planning_mode.");
  const t = obj(raw.time_policy ?? {}), min = number(t.min_duration_seconds, undefined), max = number(t.max_duration_seconds, undefined);
  if (min && max && min > max) throw new Error("Minimum useful duration exceeds maximum.");
  let end: string | undefined;
  if (t.end_at !== undefined) {
    end = text(t.end_at, 64);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(end) || !Number.isFinite(Date.parse(end))) throw new Error("end_at requires an ISO timestamp with timezone offset.");
    end = new Date(end).toISOString();
  }
  const timezone = text(t.timezone, 80, true);
  if (timezone) try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new Error("Invalid IANA timezone."); }
  const reserve = number(t.finalization_reserve_seconds, 120, 0, 3600)!;
  if (max && reserve >= max) throw new Error("Finalization reserve must be smaller than maximum duration.");
  const phases = sanitizePhases(raw.phases, workspace);
  if (raw.planning_mode === "fixed" && !phases.length) throw new Error("Fixed plan requires phases.");
  const q = raw.quality_policy === undefined ? undefined : obj(raw.quality_policy);
  if (q && (q.promotion !== "green_only" || typeof q.rollback_on_regression !== "boolean")) throw new Error("Invalid quality policy.");
  const checks = q ? sanitizeChecks(q.required_checks, workspace) : [];
  if (q && (!checks.length || !workspace)) throw new Error("Green-only quality requires checks and an explicit Git workspace.");
  if (!terminal && (q || phases.some(p => p.verify_command || p.execution_slice?.length))) throw new Error("Plan commands require approved terminal access.");
  const r = obj(raw.recovery_policy ?? {}), c = obj(raw.continuation ?? {});
  if (c.mode !== undefined && !["none", "highest_value_safe_work"].includes(String(c.mode))) throw new Error("Invalid continuation mode.");
  for (const [key, expected] of Object.entries({ on_stuck: "replan", on_repeated_failure: "rollback_and_switch", on_blocked: "park_and_continue" })) {
    if (r[key] !== undefined && r[key] !== expected) throw new Error("Unsupported recovery policy.");
  }
  return { planning_mode: raw.planning_mode as GoalPlan["planning_mode"],
    priorities: list(raw.priorities, 16).map(p => text(p, 800)), phases,
    time_policy: { ...(min ? { min_duration_seconds: min } : {}), ...(max ? { max_duration_seconds: max } : {}), ...(end ? { end_at: end } : {}), ...(timezone ? { timezone } : {}), finalization_reserve_seconds: reserve },
    ...(q ? { quality_policy: { promotion: "green_only", required_checks: checks, rollback_on_regression: q.rollback_on_regression as boolean } } : {}),
    recovery_policy: { same_failure_limit: number(r.same_failure_limit, 3, 1, 20)!, no_progress_iteration_limit: number(r.no_progress_iteration_limit, 8, 1, 100)!, max_strategy_retries: number(r.max_strategy_retries, 2, 0, 10)!, on_stuck: "replan", on_repeated_failure: "rollback_and_switch", on_blocked: "park_and_continue" },
    continuation: { mode: (c.mode ?? "none") as GoalPlan["continuation"]["mode"] },
  };
}
export function initialPlannedState(plan: GoalPlan, now: string): PlannedState {
  return { version: 1, plan: structuredClone(plan), started_at: now, plan_memory: "", phase_memory: "", outcomes: [], revisions: [], plan_revision: 0,
    watchdog: { repeated: 0, no_progress: 0, strategy_retries: 0, rejected_signatures: [] }, checks: [], rejected: [] };
}
export function timeBudget(state: PlannedState, now: string, expiresAt?: string | null) {
  const start = Date.parse(state.started_at), current = Date.parse(now), policy = state.plan.time_policy;
  const bounds = [expiresAt, policy.end_at].filter(Boolean).map(t => Date.parse(t!));
  if (policy.max_duration_seconds) bounds.push(start + policy.max_duration_seconds * 1000);
  const deadline = bounds.length ? Math.min(...bounds) : undefined;
  const remaining = deadline === undefined ? null : Math.max(0, (deadline - current) / 1000);
  return { elapsed_seconds: Math.max(0, (current - start) / 1000), recorded_execution_seconds: sUseful(state), remaining_seconds: remaining,
    safe_seconds: remaining === null ? null : Math.max(0, remaining - policy.finalization_reserve_seconds),
    deadline: deadline === undefined ? null : new Date(deadline).toISOString(),
    finalization_due: remaining !== null && remaining <= policy.finalization_reserve_seconds, hard_stop: remaining === 0 };
}
export const activePhase = (s: PlannedState) => s.plan.phases.find(p => p.id === s.active_phase);
export function selectPhase(s: PlannedState, now: string, expiresAt?: string | null) {
  const available = s.plan.phases.filter(p => !s.outcomes.some(o => o.id === p.id) && p.depends_on.every(d => s.outcomes.some(o => o.id === d && o.outcome === "completed")));
  const safe = timeBudget(s, now, expiresAt).safe_seconds;
  return available.find(p => safe === null || (p.selection?.estimated_seconds ?? p.min_duration_seconds ?? p.execution_slice?.reduce((n, c) => n + c.timeout_seconds, 0) ?? 1) <= safe);
}
export function startPhase(s: PlannedState, p: GoalPhase, now: string) {
  s.active_phase = p.id; s.phase_started_at = now; s.phase_memory = ""; s.checks = []; s.phase_useful_seconds = 0;
  s.watchdog.signature = undefined; s.watchdog.repeated = 0; s.watchdog.no_progress = 0;
  s.candidate = { status: "working", phase_id: p.id, path: s.workspace?.path };
  if (p.execution_slice?.length) s.slice = { purpose: "execution", steps: p.execution_slice, index: 0 };
}
export function finishPhase(s: PlannedState, outcome: PhaseOutcome, now: string, evidence: string, remaining = "", blocker?: string) {
  if (!s.active_phase) throw new Error("No current phase.");
  const result: PhaseResult = { id: s.active_phase, started_at: s.phase_started_at, ended_at: now,
    spent_seconds: Math.max(0, (Date.parse(now) - Date.parse(s.phase_started_at || now)) / 1000), outcome,
    useful_seconds: s.phase_useful_seconds || 0,
    evidence: evidence.slice(0, 3000), remaining_work: remaining.slice(0, 2000), ...(blocker ? { blocker: blocker.slice(0, 2000) } : {}),
    ...(outcome === "completed" && s.green_frontier ? { checkpoint: s.green_frontier.checkpoint } : {}) };
  s.outcomes.push(result); s.outcomes = s.outcomes.slice(-96);
  s.plan_memory = (s.plan_memory + "\n" + JSON.stringify(result) + "\nFacts: " + s.phase_memory.slice(0, 1600)).slice(-12000);
  s.phase_memory = ""; s.active_phase = undefined; s.phase_started_at = undefined; s.slice = undefined;
  s.replan_reason = "Phase " + result.id + " ended: " + outcome;
  return result;
}
const sUseful = (s: PlannedState) => s.useful_seconds || 0;
export function failureSignature(value: string) { return value.toLowerCase().replace(/\b(?:[a-f0-9]{12,}|\d+)\b/g, "#").replace(/\s+/g, " ").slice(0, 1500); }
export function recordProgress(s: PlannedState, signature: string, material: boolean, failed: boolean) {
  const w = s.watchdog;
  if (material) w.no_progress = 0;
  else w.no_progress++;
  if (failed) {
    const normalized = failureSignature(signature);
    w.repeated = w.signature === normalized ? w.repeated + 1 : 1; w.signature = normalized;
  }
  const stuck = w.repeated >= s.plan.recovery_policy.same_failure_limit || w.no_progress >= s.plan.recovery_policy.no_progress_iteration_limit;
  if (stuck) {
    if (w.signature) w.rejected_signatures = [...new Set([...w.rejected_signatures, w.signature])].slice(-24);
    w.strategy_retries++; s.replan_reason = "Strategy stuck: " + (w.signature || "no material progress");
  }
  return stuck;
}
export function revisePhases(s: PlannedState, phases: GoalPhase[], reason: string, now: string) {
  if (s.plan_revision >= 32) throw new Error("Plan revision budget exhausted.");
  if (s.active_phase || s.slice) throw new Error("Settle the current phase before revising its plan.");
  const done = s.plan.phases.filter(p => s.outcomes.some(o => o.id === p.id));
  for (const p of phases) {
    const failures = done.filter(d => d.objective === p.objective && s.outcomes.some(o => o.id === d.id && ["blocked", "failed", "partial"].includes(o.outcome))).length;
    if (failures > s.plan.recovery_policy.max_strategy_retries) throw new Error("Strategy retry budget exhausted for this objective; choose independent work or request user reasoning.");
  }
  for (const p of phases) if (done.some(d => d.id === p.id)) throw new Error("A phase id cannot be reused after a recorded outcome.");
  if (done.length + phases.length > 24) throw new Error("Active plan phase bound exceeded.");
  // Include settled prerequisites in graph validation; callers may refer to them.
  const revised = sanitizePhases([...done, ...phases]);
  if (JSON.stringify({ ...s.plan, phases: revised }).length > 96000) throw new Error("Revised plan exceeds bounded context budget.");
  s.plan.phases = revised;
  s.plan_memory = (s.plan_memory + "\nPlanning inspection facts: " + s.phase_memory.slice(0, 2000)).slice(-12000);
  s.phase_memory = "";
  s.plan_revision++; s.revisions.push({ revision: s.plan_revision, at: now, reason: reason.slice(0, 1200), phase_ids: phases.map(p => p.id) });
  s.revisions = s.revisions.slice(-32); s.replan_reason = undefined; s.needs_reasoning = undefined;
}
export function adaptiveCandidates(phases: GoalPhase[], s: PlannedState, now: string, expiresAt?: string | null) {
  const safe = timeBudget(s, now, expiresAt).safe_seconds;
  return phases.filter(p => p.selection && (p.verify_command || p.execution_slice?.length) &&
    (safe === null || p.selection.estimated_seconds <= safe) &&
    p.depends_on.every(d => s.outcomes.some(o => o.id === d && o.outcome === "completed")))
    .sort((a, b) => (b.selection!.value * b.selection!.confidence / (1 + b.selection!.risk)) - (a.selection!.value * a.selection!.confidence / (1 + a.selection!.risk)));
}
export function plannedReport(s: PlannedState) {
  return { accepted: s.outcomes.filter(o => o.outcome === "completed"), rejected: s.rejected,
    partial: s.outcomes.filter(o => o.outcome === "partial"), blocked: s.outcomes.filter(o => o.outcome === "blocked"),
    failed: s.outcomes.filter(o => o.outcome === "failed"), skipped: s.outcomes.filter(o => o.outcome === "skipped"),
    untouched: s.plan.phases.filter(p => !s.outcomes.some(o => o.id === p.id)).map(p => ({ id: p.id, objective: p.objective })),
    green_frontier: s.green_frontier || null, latest_checks: s.checks, candidate: s.candidate || null,
    git_status: s.git_status || null,
    needs_reasoning: s.needs_reasoning || null, finished_at: s.finished_at || null };
}
