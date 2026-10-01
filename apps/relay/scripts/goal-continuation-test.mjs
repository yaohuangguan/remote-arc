// Real relay functions + real SQLite SQL, using an in-memory D1 adapter and
// authenticated device transport stub. No model, cloud or GitHub effects.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const relay = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(relay, "package.json"))("typescript");
const compiled = fs.mkdtempSync(path.join(os.tmpdir(), "remote-arc-goal-test-"));
fs.writeFileSync(path.join(compiled, "package.json"), '{"type":"module"}');
for (const name of fs.readdirSync(path.join(relay, "src")).filter(n => n.endsWith(".ts"))) {
  const js = ts.transpileModule(fs.readFileSync(path.join(relay, "src", name), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(compiled, name.replace(/\.ts$/, ".js")), js);
}
const importSource = name => import(pathToFileURL(path.join(compiled, name + ".js")).href);

try {
  const runtime = await importSource("automations");
  const store = await importSource("automation-store");
  const source = await importSource("source-goals");
  const sqlite = new DatabaseSync(":memory:");
  for (const name of fs.readdirSync(path.join(relay, "migrations")).filter(n => n.endsWith(".sql")).sort()) {
    sqlite.exec(fs.readFileSync(path.join(relay, "migrations", name), "utf8"));
  }
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const bound = args => ({
        async first() { return stmt.get(...args) || null; },
        async all() { return { results: stmt.all(...args) }; },
        async run() { const r = stmt.run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      });
      return { ...bound([]), bind(...args) { assert(!args.includes(undefined)); return bound(args); } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO users(id,google_sub,email,created_at) VALUES(?,?,?,?)").run("owner", "test-owner", "owner@test.invalid", now);
  const tools = ["read_file", "edit_block", "write_file", "start_process", "process_status", "process_output", "stop_process"];
  sqlite.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools) VALUES(?,?,?,?,?,?,?)")
    .run("device", "owner", "Test device", "linux", "fixture-hash", now, JSON.stringify(tools));
  let calls = [], processCounter = 0;
  let deviceHandler = body => {
    calls.push(body.tool);
    if (body.tool === "start_process") return { process_id: "process-" + (++processCounter) };
    if (body.tool === "process_status") return { status: "completed", exit_code: 0 };
    if (body.tool === "process_output") return { stdout: "PASS: acceptance check", stderr: "" };
    if (body.tool === "read_file") return "implementation contents";
    return { ok: true };
  };
  const env = { DB: db, PUBLIC_ORIGIN: "https://relay.test.invalid", REGISTRY: { getByName() { return {
    async fetch(request) { return Response.json({ result: await deviceHandler(await request.json()) }); },
  }; } } };
  const identity = { userId: "owner", clientId: "source-client", scope: "automation:read automation:write agent:write", resource: env.PUBLIC_ORIGIN + "/mcp" };
  const create = async (name, extra = {}) => (await runtime.createAutomation(env, "owner", { name, kind: "agent_goal", device_id: "device", agent_goal: {
    controller: "source", controller_client_id: identity.clientId, objective: "Fix the implementation", success_criteria: "Acceptance check passes",
    allowed_tools: ["read_file", "edit_block", "start_process"], verify_command: "verify", max_iterations: 20,
  }, ...extra })).automation.id;
  const get = id => runtime.getAutomation(env, "owner", id);
  const tick = async id => { sqlite.prepare("UPDATE automations SET next_run_at = ? WHERE id = ? AND status != 'waiting_for_event'").run(new Date().toISOString(), id); await runtime.runAutomationTick(env); };
  const decision = (kind, tool = "none", args = {}, evidence = "") => ({ decision: kind, tool, arguments_json: JSON.stringify(args), decision_summary: "Next bounded action", memory: "Factual checkpoint", completion_evidence: evidence });

  const taskId = await create("Source protocol");
  await tick(taskId);
  let context = await source.getGoalContext(db, "owner", taskId);
  assert(context.ready_for_decision);
  assert.equal(context.controller, "source");
  assert.equal(calls.length, 0);
  const read = decision("tool", "read_file", { path: "/workspace/app.ts" });
  await source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", read);
  assert((await source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", read)).duplicate);
  await assert.rejects(source.submitGoalDecision(db, identity, taskId, context.revision, "stale", read), /revision/);
  await tick(taskId);
  context = await source.getGoalContext(db, "owner", taskId);
  assert(context.ready_for_decision && context.latest_observation.includes("implementation contents"));
  assert.equal(calls.filter(t => t === "read_file").length, 1);
  await assert.rejects(source.getGoalContext(db, "stranger", taskId), /not found/);
  await assert.rejects(source.submitGoalDecision(db, { ...identity, clientId: "other-client" }, taskId, context.revision, "other", read), /another source client/);
  await assert.rejects(source.submitGoalDecision(db, identity, taskId, context.revision, "no-evidence", decision("complete")), /evidence/);
  await source.submitGoalDecision(db, identity, taskId, context.revision, "finish", decision("complete", "none", {}, "Implementation inspected; acceptance is ready."));
  await tick(taskId);
  assert.equal((await get(taskId)).status, "running", "Completion must wait for verifier");
  await tick(taskId);
  assert.equal((await get(taskId)).status, "completed");
  context = await source.getGoalContext(db, "owner", taskId);
  assert(context.completion_evidence.includes("verification succeeded"));
  assert(context.journal.some(e => e.event === "needs_agent"));
  assert(context.journal.some(e => e.event === "run_completed"));

  const cancelledId = await create("Cancel race");
  sqlite.prepare("UPDATE automations SET lease_token = 'old', lease_until = ?, status = 'running' WHERE id = ?")
    .run(new Date(Date.now() + 150000).toISOString(), cancelledId);
  const stale = await get(cancelledId);
  await runtime.cancelAutomation(env, "owner", cancelledId);
  await assert.rejects(store.checkpointTask(db, stale, {}, "running", now, null), store.LeaseLostError);
  assert.equal((await get(cancelledId)).status, "cancelled");
  const takeoverId = await create("Lease takeover");
  sqlite.prepare("UPDATE automations SET lease_token = 'old', lease_until = ?,status = 'running' WHERE id = ?")
    .run(new Date(Date.now() + 150000).toISOString(), takeoverId);
  const oldWorker = await get(takeoverId);
  sqlite.prepare("UPDATE automations SET lease_token = 'new' WHERE id = ?").run(takeoverId);
  await assert.rejects(store.checkpointTask(db, oldWorker, {}, "running", now, null), store.LeaseLostError);
  assert.equal((await get(takeoverId)).lease_token, "new");
  await runtime.cancelAutomation(env, "owner", takeoverId);

  const uncertainId = await create("Unknown effect");
  sqlite.prepare("UPDATE automations SET state_json = ? WHERE id = ?")
    .run(JSON.stringify({ phase: "idle", inflight_action: { id: "crashed", tool: "start_process" }, agent: { iteration: 1, memory: "", observation: "" } }), uncertainId);
  const before = calls.length;
  await tick(uncertainId);
  assert.equal(calls.length, before);
  assert((await source.getGoalContext(db, "owner", uncertainId)).latest_observation.includes("unknown outcome"));
  await runtime.cancelAutomation(env, "owner", uncertainId);

  const lateId = await create("Late process");
  await tick(lateId);
  context = await source.getGoalContext(db, "owner", lateId);
  await source.submitGoalDecision(db, identity, lateId, context.revision, "start", decision("tool", "start_process", { command: "slow" }));
  const normalHandler = deviceHandler;
  deviceHandler = async body => { if (body.tool === "start_process") await runtime.cancelAutomation(env, "owner", lateId); return normalHandler(body); };
  await tick(lateId);
  deviceHandler = normalHandler;
  assert.equal((await get(lateId)).status, "cancelled");
  assert.equal(calls.at(-1), "stop_process");

  const future = new Date(Date.now() + 3600000).toISOString();
  const scheduledId = await create("Future goal", { schedule: { at: future } });
  await runtime.runAutomationTick(env);
  assert.equal((await get(scheduledId)).next_run_at, future);
  assert.equal((await source.getGoalContext(db, "owner", scheduledId)).ready_for_decision, false);

  sqlite.close();
  console.log("PASS: source protocol/dedup/isolation/evidence, cancellation, lease takeover, unknown effects, late process cleanup, future goal");
} finally {
  if (!path.basename(compiled).startsWith("remote-arc-goal-test-") || path.dirname(compiled) !== os.tmpdir()) throw new Error("Invalid cleanup directory");
  fs.rmSync(compiled, { recursive: true, force: true });
}
