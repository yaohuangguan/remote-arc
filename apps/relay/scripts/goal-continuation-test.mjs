// Real relay functions + real SQLite SQL, using an in-memory D1 adapter and
// authenticated device transport stub. No model, cloud or GitHub effects.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
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
  let input = fs.readFileSync(path.join(relay, "src", name), "utf8");
  if (name === "mcp.ts") for (const packageName of ["@modelcontextprotocol/server", "zod"]) {
    input = input.replace('from "' + packageName + '"', 'from "' + pathToFileURL(createRequire(path.join(relay, "package.json")).resolve(packageName)).href + '"');
  }
  const js = ts.transpileModule(input, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  fs.writeFileSync(path.join(compiled, name.replace(/\.ts$/, ".js")), js);
}
const importSource = name => import(pathToFileURL(path.join(compiled, name + ".js")).href);

try {
  const runtime = await importSource("automations");
  const store = await importSource("automation-store");
  const source = await importSource("source-goals");
  const events = await importSource("task-events");
  const settings = await importSource("device-task-settings");
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
        runSync() { const r = stmt.run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
      });
      return { ...bound([]), bind(...args) { assert(!args.includes(undefined)); return bound(args); } };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = statements.map(s => s.runSync()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO users(id,google_sub,email,created_at,plan) VALUES(?,?,?,?,\'plus\')").run("owner", "test-owner", "owner@test.invalid", now);
  const tools = ["read_file", "edit_block", "write_file", "start_process", "process_status", "process_output", "stop_process"];
  sqlite.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools) VALUES(?,?,?,?,?,?,?)")
    .run("device", "owner", "Test device", "linux", "fixture-hash", now, JSON.stringify(tools));
  sqlite.prepare("UPDATE devices SET automation_permissions = ? WHERE id = 'device'").run(JSON.stringify({
    background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: true, keep_awake: false,
  }));
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

  const downgradeFenceId = await create("Plan downgrade fence");
  await runtime.pauseAutomation(env, "owner", downgradeFenceId);
  sqlite.prepare("UPDATE users SET plan = 'free' WHERE id = 'owner'").run();
  await assert.rejects(
    create("Free plan must not create Agent Goals"),
    /Remote Arc Plus is required for planned agent goals/,
  );
  await assert.rejects(
    runtime.resumeAutomation(env, "owner", downgradeFenceId),
    /Remote Arc Plus is required for durable tasks/,
  );
  sqlite.prepare("UPDATE users SET plan = 'plus' WHERE id = 'owner'").run();
  await runtime.cancelAutomation(env, "owner", downgradeFenceId);

  const taskId = await create("Source protocol");
  await tick(taskId);
  let context = await source.getGoalContext(db, "owner", taskId);
  assert(context.ready_for_decision);
  assert.equal(context.controller, "source");
  assert.equal(calls.length, 0);
  const read = decision("tool", "read_file", { path: "/workspace/app.ts", length: 200 });
  const concurrent = await Promise.all([
    source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", read),
    source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", decision("tool", "read_file", { length: 200, path: "/workspace/app.ts" })),
  ]);
  assert.equal(concurrent.filter(result => result.duplicate).length, 1, "Concurrent retry must acknowledge the same decision despite argument key order");
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM automation_decisions WHERE automation_id = ?").get(taskId).n, 1);
  await assert.rejects(source.submitGoalDecision(db, identity, taskId, context.revision, "read-1", decision("tool", "read_file", { path: "/workspace/different.ts" })), /different decision/);
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

  const recurringId = await create("Recurring source", { schedule: { every_seconds: 60 }, max_runs: 2 });
  await tick(recurringId);
  context = await source.getGoalContext(db, "owner", recurringId);
  await source.submitGoalDecision(db, identity, recurringId, context.revision, "recurring-finish-1", decision("complete", "none", {}, "Ready for verifier"));
  await tick(recurringId); await tick(recurringId);
  let recurring = await get(recurringId);
  assert.equal(recurring.run_count, 1);
  assert.equal(recurring.status, "waiting");
  assert(Date.parse(recurring.next_run_at) > Date.now());
  assert.equal(JSON.parse(recurring.state_json).agent.iteration, 0);
  await tick(recurringId);
  context = await source.getGoalContext(db, "owner", recurringId);
  await source.submitGoalDecision(db, identity, recurringId, context.revision, "recurring-finish-2", decision("complete", "none", {}, "Second independent run ready"));
  await tick(recurringId); await tick(recurringId);
  assert.equal((await get(recurringId)).status, "completed");
  assert.equal((await runtime.listAutomationRuns(env, "owner", recurringId)).length, 2);

  // Failed deterministic verification is an observation for a new decision.
  const failedCheckId = await create("Failed verification");
  await tick(failedCheckId);
  context = await source.getGoalContext(db, "owner", failedCheckId);
  await source.submitGoalDecision(db, identity, failedCheckId, context.revision, "failed-check", decision("complete", "none", {}, "Run the acceptance check"));
  await tick(failedCheckId);
  deviceHandler = body => body.tool === "process_status" ? { status: "completed", exit_code: 1 } : normalHandler(body);
  await tick(failedCheckId); deviceHandler = normalHandler;
  context = await source.getGoalContext(db, "owner", failedCheckId);
  assert(context.ready_for_decision && context.latest_observation.includes("exit code 1"));
  await runtime.cancelAutomation(env, "owner", failedCheckId);

  const hostedGoal = { controller: "hosted", objective: "Check the result", success_criteria: "Evidence available", allowed_tools: ["read_file"], max_iterations: 10 };
  let providerCalls = 0;
  env.AI = { async run() { if (++providerCalls === 1) throw new Error("temporary upstream failure"); return { response: decision("complete", "none", {}, "Inspection evidence available") }; } };
  const retryId = await create("Provider retry", { agent_goal: hostedGoal });
  await tick(retryId);
  assert.equal((await get(retryId)).status, "waiting");
  assert.equal(JSON.parse((await get(retryId)).state_json).retry_count, 1);
  await tick(retryId);
  assert.equal((await get(retryId)).status, "completed");
  const pausedId = await create("Pause during planner", { agent_goal: hostedGoal });
  env.AI = { async run() { await runtime.pauseAutomation(env, "owner", pausedId); return { response: decision("tool", "read_file", { path: "/workspace/app.ts" }) }; } };
  const beforePause = calls.length;
  await tick(pausedId);
  assert.equal((await get(pausedId)).status, "paused");
  assert.equal(calls.length, beforePause);
  await runtime.cancelAutomation(env, "owner", pausedId);
  delete env.AI;

  // Account-authenticated device switches cancel only affected modes.
  const sessionToken = "test-only-session";
  sqlite.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)")
    .run(createHash("sha256").update(sessionToken).digest("hex"), "owner", new Date(Date.now() + 3600000).toISOString(), now);
  const permissions = { background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: true, keep_awake: false };
  const switchRequest = (body, id = "device") => new Request(env.PUBLIC_ORIGIN + "/api/devices/" + id + "/task-permissions", {
    method: "POST", headers: { cookie: "rl_session=" + sessionToken, "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const stopped = await settings.handleDeviceTaskSettings(switchRequest({ ...permissions, source_agent: false }), env);
  assert(stopped.ok);
  assert.equal((await get(scheduledId)).status, "cancelled");
  await assert.rejects(create("Disallowed source"), /disabled/);
  assert.equal((await settings.handleDeviceTaskSettings(switchRequest(permissions, "foreign-device"), env)).status, 404);
  assert((await settings.handleDeviceTaskSettings(switchRequest(permissions), env)).ok);

  // Secure callbacks are required and use standard HMAC signatures. Retry
  // keeps the delivery ID; unsubscribe and grant revocation stop delivery.
  const eventTask = await create("Event source");
  const signingSecret = "whsec_" + Buffer.alloc(32, 7).toString("base64");
  let appRequests = [], callbackCalls = 0, callbackFailure = true;
  const eventEnv = { ...env, MCP_EVENT_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString("base64"), MCP_EVENT_EGRESS: { async fetch(request) {
    callbackCalls++;
    const body = await request.text(), payload = JSON.parse(body);
    const id = request.headers.get("webhook-id"), timestamp = request.headers.get("webhook-timestamp");
    const signature = "v1," + createHmac("sha256", Buffer.from(signingSecret.slice(6), "base64")).update(id + "." + timestamp + "." + body).digest("base64");
    assert(request.headers.get("webhook-signature").split(" ").includes(signature));
    assert.equal(request.redirect, "error");
    if (payload.type === "verification") return Response.json({ challenge: payload.challenge });
    assert.equal(id, payload.eventId);
    appRequests.push(payload);
    return new Response(null, { status: callbackFailure ? 503 : 204 });
  } } };
  const subscribeParams = { name: "automation.updated", arguments: { automation_id: eventTask }, delivery: { mode: "webhook", url: "https://callbacks.example.com/task", secret: signingSecret } };
  const rpc = async (method, params, who = identity, targetEnv = eventEnv) => {
    const request = new Request(env.PUBLIC_ORIGIN + "/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    return (await events.handleTaskEventRpc(request, targetEnv, who)).json();
  };
  assert.equal((await rpc("events/list", {}, null)).error.code, -32001);
  assert(!("events" in (await rpc("server/discover", {}, null, env)).result.capabilities));
  const callbackBefore = callbackCalls;
  assert((await rpc("events/subscribe", { ...subscribeParams, delivery: { ...subscribeParams.delivery, url: "https://127.0.0.1/private" } })).error);
  assert.equal(callbackCalls, callbackBefore);
  assert((await rpc("events/subscribe", subscribeParams, { ...identity, userId: "foreign-user" })).error);
  const subscription = (await rpc("events/subscribe", subscribeParams)).result;
  assert(subscription.id);
  assert.equal((await rpc("events/subscribe", subscribeParams)).result.id, subscription.id);
  assert(!sqlite.prepare("SELECT secret_ciphertext FROM task_event_subscriptions WHERE id = ?").get(subscription.id).secret_ciphertext.includes(signingSecret));
  sqlite.prepare("INSERT INTO oauth_tokens(access_token_hash,client_id,user_id,resource,scope,expires_at,created_at) VALUES(?,?,?,?,?,?,?)")
    .run("test-access-hash", identity.clientId, "owner", identity.resource, identity.scope, new Date(Date.now() + 3600000).toISOString(), now);
  await tick(eventTask);
  assert.equal((await events.deliverTaskEvents(eventEnv)).delivered, 0);
  assert.equal(appRequests.length, 1);
  callbackFailure = false;
  sqlite.prepare("UPDATE task_event_deliveries SET next_attempt_at = ?").run(new Date().toISOString());
  assert.equal((await events.deliverTaskEvents(eventEnv)).delivered, 1);
  assert.equal(appRequests.length, 2);
  assert.equal(appRequests[0].eventId, appRequests[1].eventId);
  assert.equal(appRequests[1].data.event, "needs_agent");
  await rpc("events/unsubscribe", subscribeParams);
  assert.equal(sqlite.prepare("SELECT active FROM task_event_subscriptions WHERE id = ?").get(subscription.id).active, 0);
  await rpc("events/subscribe", subscribeParams);
  sqlite.prepare("UPDATE oauth_tokens SET revoked_at = ? WHERE client_id = ?").run(new Date().toISOString(), identity.clientId);
  const beforeRevocation = callbackCalls;
  await events.deliverTaskEvents(eventEnv);
  assert.equal(callbackCalls, beforeRevocation);
  assert.equal(sqlite.prepare("SELECT active FROM task_event_subscriptions WHERE id = ?").get(subscription.id).active, 0);

  // Power leases are bounded, shared and cleaned up without changing OS policy.
  const deviceCalls = await importSource("device-call");
  sqlite.prepare("UPDATE devices SET automation_permissions = json_set(automation_permissions, '$.keep_awake', json('false')) WHERE id = 'device'").run();
  await assert.rejects(deviceCalls.callDevice(env, identity, "device", "set_task_keep_awake", { task_id: taskId, seconds: 180 }), /disabled/);
  await deviceCalls.callDevice(env, identity, "device", "set_task_keep_awake", { task_id: taskId, seconds: 0 });
  assert.equal(calls.at(-1), "set_task_keep_awake", "Revoked power permission must still allow releasing an existing lease");
  const powerFile = path.join(relay, "../../packages/cli/src/keep-awake.ts");
  fs.writeFileSync(path.join(compiled, "keep-awake.js"), ts.transpileModule(fs.readFileSync(powerFile, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const power = await importSource("keep-awake");
  let clock = 1000, launches = [];
  const manager = power.createTaskKeepAwakeManager({ platform: "win32", now: () => clock, spawn(command, args, options) {
    const child = new EventEmitter(); child.kill = () => { child.killed = true; child.emit("exit", null); };
    launches.push({ command, args, options, child }); queueMicrotask(() => child.emit("spawn")); return child;
  } });
  assert((await manager.set("task-1", 180)).active);
  assert((await manager.set("task-2", 180)).active);
  assert.equal(launches.length, 1);
  assert(launches[0].options.windowsHide && launches[0].args.includes("Hidden"));
  assert((await manager.set("task-1", 0)).active);
  clock += 181000;
  assert(!manager.status().active);
  assert(launches[0].child.killed);
  manager.close();

  // Exercise actual MCP SDK registration/HTTP dispatch, not only helpers.
  const mcp = await importSource("mcp");
  const callMcp = async (method, params, who = identity) => {
    const handler = mcp.createRemoteLinkMcp(env, who);
    const response = await handler.fetch(new Request(env.PUBLIC_ORIGIN + "/mcp", { method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    const text = await response.text();
    assert(response.ok, text);
    const payload = JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: ")).slice(6));
    assert(!payload.error, JSON.stringify(payload));
    return payload.result;
  };
  const toolList = await callMcp("tools/list", {});
  assert(toolList.tools.some(tool => tool.name === "get_goal_context"));
  assert(toolList.tools.some(tool => tool.name === "submit_goal_decision" && tool.securitySchemes));
  const createdMcp = await callMcp("tools/call", { name: "create_agent_goal", arguments: {
    name: "MCP source goal", device_id: "device", controller: "source", objective: "Inspect file", success_criteria: "File inspected", allowed_tools: ["read_file"],
  } });
  assert(!createdMcp.isError, JSON.stringify(createdMcp));
  const mcpTask = JSON.parse(createdMcp.content[0].text).automation.id;
  await tick(mcpTask);
  const contextMcp = await callMcp("tools/call", { name: "get_goal_context", arguments: { automation_id: mcpTask } });
  assert(JSON.parse(contextMcp.content[0].text).ready_for_decision);
  const deniedMcp = await callMcp("tools/call", { name: "submit_goal_decision", arguments: {
    automation_id: mcpTask, expected_revision: 0, idempotency_key: "denied", decision: "pause", tool: "none", decision_summary: "Blocked",
  } }, { ...identity, scope: "computer:write" });
  assert(deniedMcp.isError);

  await assert.rejects(runtime.createAutomation({ ...env, GITHUB_APP_ID: "test", GITHUB_APP_PRIVATE_KEY: "not-used", GITHUB_APP_INSTALLATION_ID: "7" }, "owner", {
    name: "Unauthorized cloud merge", kind: "condition_watch", github_merge: { owner: "owner", repo: "repo", pull_number: 1 },
  }), /permission binding/);

  sqlite.close();
  console.log("PASS: source protocol, fences/recovery, verification/retry, recurring goals, device permissions, signed events/retry/revocation, bounded power leases, cloud action ownership");
} finally {
  if (!path.basename(compiled).startsWith("remote-arc-goal-test-") || path.dirname(compiled) !== os.tmpdir()) throw new Error("Invalid cleanup directory");
  fs.rmSync(compiled, { recursive: true, force: true });
}
