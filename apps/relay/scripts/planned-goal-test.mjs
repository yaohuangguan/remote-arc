// Actual scheduler/source functions and SQLite; fake device results, no model or
// real host lifetime claims. See the coverage map in the implementation plan.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const relay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(relay, "package.json"))("typescript");
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), "remote-arc-plan-test-"));
fs.writeFileSync(path.join(compiled, "package.json"), '{"type":"module"}');
for (const name of fs.readdirSync(path.join(relay, "src")).filter(n => n.endsWith(".ts") && n !== "mcp.ts")) {
  fs.writeFileSync(path.join(compiled, name.replace(/\.ts$/, ".js")), ts.transpileModule(fs.readFileSync(path.join(relay, "src", name), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
}
try {
  const load = name => import(pathToFileURL(path.join(compiled, name + ".js")).href);
  const runtime = await load("automations"), source = await load("source-goals"), plan = await load("planned-goals");
  const sqlite = new DatabaseSync(":memory:");
  for (const name of fs.readdirSync(path.join(relay, "migrations")).filter(n => n.endsWith(".sql")).sort()) sqlite.exec(fs.readFileSync(path.join(relay, "migrations", name), "utf8"));
  const db = { prepare(sql) {
    const stmt = sqlite.prepare(sql);
    const bind = args => ({ async first() { return stmt.get(...args) || null; }, async all() { return { results: stmt.all(...args) }; }, async run() { return { meta: { changes: Number(stmt.run(...args).changes) } }; }, runSync() { return { meta: { changes: Number(stmt.run(...args).changes) } }; } });
    return { ...bind([]), bind(...args) { assert(!args.includes(undefined), sql); return bind(args); } };
  }, async batch(statements) { sqlite.exec("BEGIN"); try { const r = statements.map(s => s.runSync()); sqlite.exec("COMMIT"); return r; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO users(id,google_sub,email,created_at,plan) VALUES(?,?,?,?,\'plus\')").run("owner", "owner", "owner@test.invalid", now);
  const permissions = { background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: true, keep_awake: false };
  sqlite.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools,automation_permissions) VALUES(?,?,?,?,?,?,?,?)")
    .run("device", "owner", "Test", "linux", "hash", now, JSON.stringify(["read_file", "write_file", "edit_block", "start_process", "process_status", "process_output", "stop_process"]), JSON.stringify(permissions));
  let calls = [], counter = 0, frontier = "initial", generation = 0, exit = 0, running = false, offline = false, nativeEnvelope = false;
  let unknownDispatch = false, unknownWrite = false, unknownCapture = false, lostProcess = false, cancelOnStart;
  const env = { DB: db, PUBLIC_ORIGIN: "https://relay.test.invalid", REGISTRY: { getByName() { return { async fetch(req) {
    const body = await req.json(); calls.push(body);
    if (offline) return Response.json({ error: "device offline" }, { status: 503 });
    if (body.tool === "start_process" && unknownDispatch) { unknownDispatch = false; return Response.json({ error: "device call timed out" }, { status: 504 }); }
    if (body.tool === "write_file" && unknownWrite) { unknownWrite = false; return Response.json({ error: "device call timed out" }, { status: 504 }); }
    if (body.tool === "process_status" && lostProcess) return Response.json({ error: "Managed process not found after restart" }, { status: 504 });
    let result = { ok: true };
    if (body.tool === "start_process") result = { process_id: "process-" + (++counter) };
    if (body.tool === "start_process" && cancelOnStart) { const target = cancelOnStart; cancelOnStart = undefined; await runtime.cancelAutomation(env, "owner", target); }
    if (body.tool === "process_status") result = { status: running ? "running" : "exited", exit_code: exit };
    if (body.tool === "process_output") result = { stdout: exit ? "ERROR test number 100 failed" : "PASS", stderr: "" };
    if (body.tool === "read_file") result = "unchanged source";
    if (body.tool === "goal_workspace") {
      if (body.arguments.action === "capture") frontier = "green-" + counter;
      if (body.arguments.action === "capture" && unknownCapture) { unknownCapture = false; return Response.json({ error: "checkpoint acknowledgement lost" }, { status: 504 }); }
      if (body.arguments.action === "reject") generation++;
      result = { path: "/workspace/candidate-" + generation, root: "/workspace", frontier, generation, tree: "tree" };
    }
    return Response.json({ result: nativeEnvelope && body.tool !== "goal_workspace" ? { content: [{ type: "text", text: JSON.stringify(result) }] } : result });
  } }; } } };
  const identity = { userId: "owner", clientId: "client", scope: "automation:read automation:write agent:write", resource: env.PUBLIC_ORIGIN + "/mcp" };
  const phase = (id, extra = {}) => ({ id, objective: "Useful work " + id, success_criteria: "Evidence " + id, depends_on: [], ...extra });
  const step = (name = "test") => ({ name, command: name, timeout_seconds: 10 });
  const fixed = phases => ({ planning_mode: "fixed", phases, time_policy: { max_duration_seconds: 3600, finalization_reserve_seconds: 60 } });
  const create = async (p, extra = {}) => (await runtime.createAutomation(env, "owner", { name: "Planned", kind: "agent_goal", device_id: "device", agent_goal: {
    controller: "source", controller_client_id: "client", objective: "Improve useful engineering", success_criteria: "Verified phases", workspace: "/workspace", allowed_tools: ["read_file", "write_file", "edit_block", "start_process"], max_iterations: 40, plan: p, ...extra,
  } })).automation.id;
  const get = id => runtime.getAutomation(env, "owner", id);
  const state = async id => JSON.parse((await get(id)).state_json);
  const writeState = async (id, change) => { const s = await state(id); change(s); sqlite.prepare("UPDATE automations SET state_json=? WHERE id=?").run(JSON.stringify(s), id); };
  const tick = async id => { const row = await get(id); if (["waiting", "running", "waiting_for_device"].includes(row.status)) sqlite.prepare("UPDATE automations SET next_run_at=? WHERE id=?").run(new Date().toISOString(), id); await runtime.runAutomationTick(env); };
  const settle = async (id, n = 20) => { for (let i = 0; i < n; i++) { await tick(id); if (["completed", "failed", "cancelled", "waiting_for_event"].includes((await get(id)).status)) break; } };
  let key = 0;
  const submit = async (id, decision, args = {}, evidence = "Evidence from saved observations", tool = "none") => {
    const c = await source.getGoalContext(db, "owner", id);
    return source.submitGoalDecision(db, identity, id, c.revision, "decision-" + (++key), { decision, tool, arguments_json: JSON.stringify(args), decision_summary: "Bounded step", memory: "Established factual context", completion_evidence: evidence });
  };

  // 1, 2, 15: three saved slices continue in order without another source turn.
  const order = await create(fixed([phase("one", { execution_slice: [step("one")] }), phase("two", { depends_on: ["one"], execution_slice: [step("two")] }), phase("three", { depends_on: ["two"], execution_slice: [step("three")] })]));
  const offset = calls.length; await settle(order);
  assert.equal((await get(order)).status, "completed");
  assert.deepEqual(calls.slice(offset).filter(c => c.tool === "start_process").map(c => c.arguments.command), ["one", "two", "three"]);
  assert.deepEqual((await state(order)).planned.outcomes.map(o => o.outcome), ["completed", "completed", "completed"]);
  nativeEnvelope = true;
  const native = await create(fixed([phase("native", { execution_slice: [step("native-envelope")] })])); await settle(native); nativeEnvelope = false;
  assert.equal((await get(native)).status, "completed", "Actual CLI MCP result envelopes must be decoded for process tracking");
  assert.throws(() => runtime.unwrapAutomationResult({ isError: true, content: [{ type: "text", text: "Guard blocked" }] }), /Guard blocked/);
  const uncertain = await create(fixed([phase("uncertain", { execution_slice: [step("unknown-effect")] })]));
  unknownDispatch = true; await tick(uncertain); await tick(uncertain);
  assert.equal(calls.filter(c => c.arguments.command === "unknown-effect").length, 1, "Unacknowledged slice must not replay");
  assert((await source.getGoalContext(db, "owner", uncertain)).planned.inspection_required);
  await assert.rejects(submit(uncertain, "execution_slice", { steps: [step("unknown-effect")] }), /read-only inspection/);
  await submit(uncertain, "tool", { path: "/workspace/status.txt" }, "", "read_file"); await tick(uncertain);
  assert.equal((await source.getGoalContext(db, "owner", uncertain)).planned.inspection_required, false);
  const uncertainEdit = await create(fixed([phase("uncertain-edit")])); await tick(uncertainEdit);
  await submit(uncertainEdit, "tool", { path: "/workspace/change.txt", content: "candidate" }, "", "write_file"); unknownWrite = true; await tick(uncertainEdit);
  assert((await state(uncertainEdit)).planned.inspection_required, "Dynamic effects also require inspection after lost acknowledgement");
  await assert.rejects(submit(uncertainEdit, "complete"), /read-only inspection/);
  const lostId = await create(fixed([phase("lost", { execution_slice: [step("lost-process")] })])); await tick(lostId); lostProcess = true; await tick(lostId); lostProcess = false;
  assert.equal((await get(lostId)).status, "waiting_for_event"); assert((await state(lostId)).planned.inspection_required);
  const cancelled = await create(fixed([phase("cancel", { execution_slice: [step("cancel-race")] })])); cancelOnStart = cancelled; await tick(cancelled);
  assert.equal((await get(cancelled)).status, "cancelled", "Late slice acknowledgement cannot resurrect cancellation");

  // 3, 4, 13: time exhaustion parks foundation and skips unsafe dependent work.
  const gate = await create(fixed([phase("foundation", { max_duration_seconds: 1 }), phase("dependent", { depends_on: ["foundation"], execution_slice: [step("must-not-run")] }), phase("independent", { execution_slice: [step("independent")] })]));
  await tick(gate); await writeState(gate, s => { s.planned.phase_started_at = new Date(Date.now() - 5000).toISOString(); });
  sqlite.prepare("UPDATE automations SET next_run_at=? WHERE id=?").run(new Date().toISOString(), gate);
  await tick(gate); assert.equal((await state(gate)).planned.outcomes[0].outcome, "partial"); await settle(gate);
  const gated = (await state(gate)).planned; assert(gated.outcomes.some(o => o.id === "independent" && o.outcome === "completed")); assert(!gated.outcomes.some(o => o.id === "dependent"));
  assert(!calls.some(c => c.arguments.command === "must-not-run"));

  // 5, 16, 17, 22: no filler edits, persisted next-turn handoff, no hidden model.
  const minimum = await create({ ...fixed([phase("first", { execution_slice: [step()] })]), time_policy: { min_duration_seconds: 1800, max_duration_seconds: 3600, finalization_reserve_seconds: 60 } });
  const before = calls.length; await settle(minimum);
  const context = await source.getGoalContext(db, "owner", minimum);
  assert(context.ready_for_decision && context.planned.needs_reasoning);
  assert.equal(context.source_capabilities.autonomous_event_wakeup, false);
  assert(!calls.slice(before).some(c => ["write_file", "edit_block"].includes(c.tool)));
  assert.equal(context.controller, "source"); assert(context.planned.plan && context.planned.outcomes.length === 1);
  await submit(minimum, "complete", {}, "No further justified safe work remains."); await settle(minimum); assert.equal((await get(minimum)).status, "completed");

  // 6, 7, 23: source wait still has a due finalization alarm, including reconnect.
  const deadline = await create(fixed([phase("unfinished")])); await tick(deadline);
  await writeState(deadline, s => { s.planned.plan.time_policy.end_at = new Date(Date.now() + 20_000).toISOString(); });
  sqlite.prepare("UPDATE automations SET next_run_at=? WHERE id=?").run(new Date().toISOString(), deadline);
  await tick(deadline); assert.equal((await get(deadline)).status, "completed");
  assert.equal((await state(deadline)).planned.report.partial[0].id, "unfinished");
  const finalFailure = await create(fixed([phase("unverified")]), { verify_command: "final-check" }); await tick(finalFailure);
  await writeState(finalFailure, s => { s.planned.plan.time_policy.end_at = new Date(Date.now() + 20_000).toISOString(); });
  sqlite.prepare("UPDATE automations SET next_run_at=? WHERE id=?").run(new Date().toISOString(), finalFailure);
  await tick(finalFailure); exit = 1; await settle(finalFailure); exit = 0;
  const finalReport = (await state(finalFailure)).planned.report;
  assert.equal((await get(finalFailure)).status, "completed", "Finalized is distinct from accepted work");
  assert(finalReport.needs_reasoning && finalReport.latest_checks.some(c => !c.passed));
  assert.equal(finalReport.accepted.length, 0);
  const pure = plan.initialPlannedState(plan.sanitizePlan(fixed([phase("large", { execution_slice: [{ ...step(), timeout_seconds: 300 }] })]), "/workspace"), now);
  pure.plan.time_policy.end_at = new Date(Date.parse(now) + 180_000).toISOString(); assert.equal(plan.selectPhase(pure, now), undefined);
  pure.plan.phases[0].min_duration_seconds = 1; assert.equal(plan.selectPhase(pure, now), undefined, "A small minimum must not hide an oversized saved slice");
  assert.throws(() => plan.sanitizePlan({ ...fixed([phase("bad")]), time_policy: { end_at: "2030-01-01T07:00:00" } }), /offset/);

  // 8: cross-phase facts retained; phase-local memory cleared.
  const memory = plan.initialPlannedState(plan.sanitizePlan(fixed([phase("a"), phase("b")]), "/workspace"), now);
  plan.startPhase(memory, memory.plan.phases[0], now); memory.phase_memory = "API contract established";
  plan.finishPhase(memory, "completed", now, "test passes"); plan.startPhase(memory, memory.plan.phases[1], now);
  assert(memory.plan_memory.includes("API contract established")); assert.equal(memory.phase_memory, "");

  // 9, 10: baseline green, passing candidate promotes; regression preserves it.
  const quality = { ...fixed([phase("candidate")]), quality_policy: { promotion: "green_only", required_checks: [step("quality")], rollback_on_regression: true } };
  const captureLost = await create(quality); unknownCapture = true; await settle(captureLost);
  assert((await state(captureLost)).planned.inspection_required, "Unknown checkpoint capture must not be accepted or silently replayed");
  assert.equal((await state(captureLost)).planned.green_frontier, undefined);
  const good = await create(quality); await settle(good); const baseline = (await state(good)).planned.green_frontier.checkpoint;
  await submit(good, "complete"); await settle(good); const promoted = (await state(good)).planned.green_frontier.checkpoint; assert.notEqual(promoted, baseline);
  const bad = await create(quality); await settle(bad); const prior = (await state(bad)).planned.green_frontier.checkpoint;
  exit = 1; await submit(bad, "complete"); await settle(bad); exit = 0;
  const rejected = (await state(bad)).planned; assert.equal(rejected.green_frontier.checkpoint, prior); assert.equal(rejected.candidate.status, "rejected"); assert(rejected.rejected.length);

  // 11, 12: equivalent failures/stuck strategy and no-progress revision limits.
  const watchdog = plan.initialPlannedState(plan.sanitizePlan(fixed([phase("stuck")]), "/workspace"), now);
  assert(!plan.recordProgress(watchdog, "test at line 123 failed", false, true)); assert(!plan.recordProgress(watchdog, "test at line 456 failed", false, true)); assert(plan.recordProgress(watchdog, "test at line 789 failed", false, true));
  assert(watchdog.replan_reason.includes("stuck")); assert.equal(watchdog.watchdog.strategy_retries, 1);
  const revise = await create({ planning_mode: "autonomous", phases: [], time_policy: { max_duration_seconds: 3600, finalization_reserve_seconds: 60 }, recovery_policy: { no_progress_iteration_limit: 2 } });
  await tick(revise);
  await submit(revise, "tool", { path: "/workspace/README.md" }, "", "read_file"); await tick(revise); await tick(revise);
  await submit(revise, "revise_plan", { phases: [phase("r1")], reason: "Initial bounded plan" }); await tick(revise); await tick(revise);
  assert((await state(revise)).planned.plan_memory.includes("Established factual context"), "Pre-plan inspection facts survive initial phase planning");
  await submit(revise, "phase_result", { outcome: "blocked", blocker: "dependency absent" }); await tick(revise); await tick(revise);
  assert.equal((await state(revise)).planned.active_phase, undefined, JSON.stringify(await source.getGoalContext(db, "owner", revise)));
  await submit(revise, "revise_plan", { phases: [phase("r2")], reason: "Independent strategy" }); await tick(revise);
  assert((await state(revise)).planned.plan_revision >= 2);
  assert.throws(() => plan.revisePhases({ ...watchdog, active_phase: undefined, plan_revision: 32 }, [], "retry", now), /budget/);

  // 14: adaptive work scores value/confidence/risk and rejects oversized work.
  const adaptive = plan.initialPlannedState(plan.sanitizePlan({ ...fixed([phase("seed")]), continuation: { mode: "highest_value_safe_work" } }, "/workspace"), now);
  const candidates = plan.sanitizePhases([phase("low", { verify_command: "test", selection: { value: 5, risk: 1, confidence: 50, estimated_seconds: 60, justification: "Small value" } }), phase("valuable", { verify_command: "test", selection: { value: 80, risk: 5, confidence: 90, estimated_seconds: 120, justification: "High value and testable" } }), phase("too-large", { verify_command: "test", selection: { value: 100, risk: 1, confidence: 100, estimated_seconds: 8000, justification: "Too large" } })], "/workspace");
  assert.equal(plan.adaptiveCandidates(candidates, adaptive, now)[0].id, "valuable");

  // 18, 19: real CAS duplicate submission and paused-worker effect fence.
  const race = await create(fixed([phase("race")])); await tick(race);
  const c = await source.getGoalContext(db, "owner", race), raw = { decision: "execution_slice", tool: "none", arguments_json: JSON.stringify({ steps: [step("race-effect")] }), decision_summary: "Validate", memory: "Saved", completion_evidence: "" };
  const replies = await Promise.all([source.submitGoalDecision(db, identity, race, c.revision, "same-key", raw), source.submitGoalDecision(db, identity, race, c.revision, "same-key", raw)]);
  assert.equal(replies.filter(r => r.duplicate).length, 1); await tick(race); await tick(race); await tick(race);
  assert.equal(calls.filter(c => c.arguments.command === "race-effect").length, 1);
  assert((await source.submitGoalDecision(db, identity, race, c.revision, "same-key", raw)).duplicate, "Idempotent acknowledgement remains valid after phase transition");
  await runtime.pauseAutomation(env, "owner", race); await tick(race); assert.equal((await get(race)).status, "paused");

  // 20: task permission revocation fences future deterministic slices.
  const revoked = await create(fixed([phase("revoked", { execution_slice: [step("revoked-effect")] })]));
  sqlite.prepare("UPDATE devices SET automation_permissions=? WHERE id='device'").run(JSON.stringify({ ...permissions, background_tasks: false }));
  await tick(revoked); assert.equal((await get(revoked)).status, "failed"); assert(!calls.some(c => c.arguments.command === "revoked-effect"));
  sqlite.prepare("UPDATE devices SET automation_permissions=? WHERE id='device'").run(JSON.stringify(permissions));

  // 23: offline progress persists; reconnect resumes once, process loss waits.
  const reconnect = await create(fixed([phase("reconnect", { execution_slice: [step("reconnect")] })])); offline = true; await tick(reconnect); offline = false;
  assert.equal((await get(reconnect)).status, "waiting_for_device"); await settle(reconnect); assert.equal((await get(reconnect)).status, "completed");
  assert.equal(calls.filter(c => c.arguments.command === "reconnect" && c.tool === "start_process").length, 2, "One explicit offline failure and one acknowledged dispatch");

  // 24: factual report separates accepted, rejected, partial, blocked/untouched.
  const reportState = plan.initialPlannedState(plan.sanitizePlan(fixed([phase("accepted"), phase("partial"), phase("blocked"), phase("untouched")]), "/workspace"), now);
  for (const [id, outcome] of [["accepted", "completed"], ["partial", "partial"], ["blocked", "blocked"]]) { plan.startPhase(reportState, reportState.plan.phases.find(p => p.id === id), now); plan.finishPhase(reportState, outcome, now, "Evidence"); }
  reportState.rejected.push({ evidence: "Failed attempted change", at: now }); const report = plan.plannedReport(reportState);
  assert.equal(report.accepted.length, 1); assert.equal(report.rejected.length, 1); assert.equal(report.partial.length, 1); assert.equal(report.blocked.length, 1); assert.equal(report.untouched.length, 1);
  assert.throws(() => plan.sanitizePlan(fixed([phase("a", { depends_on: ["b"] }), phase("b", { depends_on: ["a"] })])), /Cyclic/);
  sqlite.close(); console.log("PASS: planned phases, time/dependencies, source loss/handoff, slices, green quality, watchdog/adaptive, CAS/pause/revocation/reconnect, categorized reports");
} finally {
  if (path.dirname(compiled) !== os.tmpdir() || !path.basename(compiled).startsWith("remote-arc-plan-test-")) throw new Error("Invalid cleanup path");
  fs.rmSync(compiled, { recursive: true, force: true });
}
