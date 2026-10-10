import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/server";
import { classifyExpectedMcpError, registerMcpTool } from "../src/mcp-errors.js";
import { consumeToolCall, getMonthlyUsage } from "../src/usage.js";
import { createRemoteLinkMcp } from "../src/mcp.js";
import type { OAuthIdentity } from "../src/auth.js";

const expectedCases: Array<[Error, string]> = [
  [new Error("start_process requires cwd when multiple Trusted Write Locations are configured."), "WORKSPACE_CWD_REQUIRED"],
  [new Error('tool "write_file" requires a Trusted Write Location on this device'), "WORKSPACE_REQUIRED"],
  [new Error("Blocked by Remote Arc Trusted Write Locations: path is outside the allowed write roots."), "WORKSPACE_DENIED"],
  [new Error("Blocked by Remote Arc Task Workspace: path escapes the owned candidate."), "WORKSPACE_DENIED"],
  [new Error("Remote Arc approval required before this out-of-scope write"), "APPROVAL_REQUIRED"],
  [new Error("Blocked by Remote Arc Sensitive Path Policy. Add a narrow sensitive-path exception for this device if you intentionally need access."), "SENSITIVE_PATH_BLOCKED"],
  [new Error("Blocked by Remote Arc Safety Guard: system shutdown or reboot."), "SAFETY_GUARD_BLOCKED"],
  [new Error('tool "start_process" is disabled for this device'), "TOOL_DISABLED"],
  [new Error("device offline"), "DEVICE_OFFLINE"],
  [new Error("device call timed out"), "DEVICE_TIMEOUT"],
  [new Error("device not found or revoked"), "DEVICE_NOT_FOUND"],
  [new Error("device not found"), "DEVICE_NOT_FOUND"],
  [new Error("trigger requires task_version=1."), "INVALID_TOOL_REQUEST"],
  [new Error("Goal not found."), "GOAL_NOT_FOUND"],
  [new Error("Goal revision changed or it is not awaiting a decision. Read context again."), "GOAL_DECISION_CONFLICT"],
  [new Error("Device did not return managed process id."), "DEVICE_PROTOCOL_ERROR"],
  [new Error("Trusted Write Locations are enabled. start_process requires an in-scope cwd. Terminal commands are not an OS sandbox and may still access paths outside that directory."), "WORKSPACE_CWD_REQUIRED"],
  [new Error("Managed process not found or its local retention window has expired."), "PROCESS_NOT_FOUND"],
  [new Error("ENOENT: no such file or directory, stat '/tmp/missing'"), "PATH_NOT_FOUND"],
  [new Error("Path is not a file: /tmp/folder"), "PATH_TYPE_MISMATCH"],
  [new Error("Binary file detected. read_file currently supports text files only."), "BINARY_FILE_REQUIRES_BINARY_READ"],
  [new Error("Expected 1 replacement(s) in /tmp/a.txt, found 0. No changes were written."), "EDIT_CONFLICT"],
  [new Error("No reversible Remote Arc file change is available on this device."), "UNDO_UNAVAILABLE"],
];

for (const [error, code] of expectedCases) {
  assert.equal(classifyExpectedMcpError(error)?.code, code);
}

const quota = new Error("Monthly Remote Arc tool-call limit reached (10000/10000).") as Error & { code?: string };
quota.code = "MONTHLY_LIMIT_REACHED";
assert.equal(classifyExpectedMcpError(quota)?.code, "MONTHLY_LIMIT_REACHED");

const plan = new Error("Remote Arc Plus is required for binary read.") as Error & { code?: string };
plan.code = "PLAN_UPGRADE_REQUIRED";
assert.equal(classifyExpectedMcpError(plan)?.code, "PLAN_UPGRADE_REQUIRED");

assert.equal(
  classifyExpectedMcpError(new Error("D1_ERROR: database corrupted unexpectedly")),
  null,
  "unknown infrastructure failures must remain true internal errors",
);

let registeredHandler: ((...args: any[]) => Promise<any>) | undefined;
const fakeServer = {
  registerTool(_name: string, _definition: unknown, handler: (...args: any[]) => Promise<any>) {
    registeredHandler = handler;
    return {};
  },
} as unknown as McpServer;

registerMcpTool(fakeServer, "start_process", {}, async () => {
  throw new Error("start_process requires cwd when multiple Trusted Write Locations are configured.");
});
assert(registeredHandler, "safe MCP handler was not registered");
const structured = await registeredHandler!({});
assert.equal(structured.isError, undefined);
const structuredPayload = JSON.parse(structured.content[0].text);
assert.equal(structuredPayload.ok, false);
assert.equal(structuredPayload.error.code, "WORKSPACE_CWD_REQUIRED");
assert.match(structuredPayload.error.message, /requires cwd/);

registerMcpTool(fakeServer, "internal_probe", {}, async () => {
  throw new Error("D1_ERROR: unexpected storage failure");
});
await assert.rejects(() => registeredHandler!({}), /D1_ERROR/);

type UserRow = { role: string; email: string; plan?: string; has_plus_grant?: number };
function usageDb(user: UserRow, toolCalls: number) {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM users u WHERE u.id") || sql.includes("SELECT role, email FROM users")) return user;
              if (sql.includes("SELECT tool_calls FROM user_monthly_usage")) {
                return { tool_calls: toolCalls };
              }
              if (sql.includes("INSERT INTO user_monthly_usage")) {
                return { tool_calls: toolCalls + 1 };
              }
              return null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

const adminEnv = {
  DB: usageDb({ role: "admin", email: "admin@example.com" }, 25000),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
};
const adminUsage = await getMonthlyUsage(adminEnv, "admin-user");
assert.equal(adminUsage.unlimited, true);
assert.equal(adminUsage.limit, null);
assert.equal(adminUsage.remaining, null);
const adminConsumed = await consumeToolCall(adminEnv, "admin-user");
assert.equal(adminConsumed.unlimited, true);
assert.equal(adminConsumed.limit, null);

const operatorEnv = {
  DB: usageDb({ role: "user", email: "operator@example.com" }, 25000),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  OPERATOR_EMAIL: "Operator@Example.com",
};
const operatorUsage = await getMonthlyUsage(operatorEnv, "operator-user");
assert.equal(operatorUsage.unlimited, true);
assert.equal(operatorUsage.limit, null);

const normalEnv = {
  DB: usageDb({ role: "user", email: "normal@example.com" }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
};
const normalUsage = await getMonthlyUsage(normalEnv, "normal-user");
assert.equal(normalUsage.unlimited, false);
assert.equal(normalUsage.limit, 10000);
assert.equal(normalUsage.remaining, 9877);

const freeLimitedEnv = {
  DB: usageDb({ role: "user", email: "free@example.com", plan: "free", has_plus_grant: 0 }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  FREE_MONTHLY_TOOL_CALL_LIMIT: "1000",
};
assert.equal((await getMonthlyUsage(freeLimitedEnv, "free-user")).limit, 1000);

const paidEnv = {
  DB: usageDb({ role: "user", email: "plus@example.com", plan: "plus", has_plus_grant: 0 }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  FREE_MONTHLY_TOOL_CALL_LIMIT: "1000",
};
assert.equal((await getMonthlyUsage(paidEnv, "plus-user")).limit, 10000);

const grantEnv = {
  DB: usageDb({ role: "user", email: "grant@example.com", plan: "free", has_plus_grant: 1 }, 123),
  MONTHLY_TOOL_CALL_LIMIT: "10000",
  FREE_MONTHLY_TOOL_CALL_LIMIT: "1000",
};
assert.equal((await getMonthlyUsage(grantEnv, "grant-user")).limit, 10000);

const authEnv = {
  PUBLIC_ORIGIN: "https://mcp.remotearc.app",
  DB: { prepare() { throw new Error("An OAuth scope challenge must not access storage"); } } as unknown as D1Database,
  REGISTRY: {} as DurableObjectNamespace,
};
const authIdentity = (scope: string): OAuthIdentity => ({
  userId: "scope-test-user", clientId: "scope-test-client", grantId: null,
  resource: authEnv.PUBLIC_ORIGIN + "/mcp", scope,
});
async function challengedScopes(identity: OAuthIdentity | null, name: string, args: Record<string, unknown>) {
  const response = await createRemoteLinkMcp(authEnv, identity).fetch(new Request(authEnv.PUBLIC_ORIGIN + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
  const text = await response.text();
  assert(response.ok, text);
  const payload = JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: "))!.slice(6));
  assert(!payload.error, JSON.stringify(payload));
  assert.equal(payload.result.isError, true, "missing scopes must still block execution");
  const challenge = payload.result._meta?.["mcp/www_authenticate"]?.[0] || "";
  const scopes = /scope="([^"]+)"/.exec(challenge)?.[1].split(/\s+/) || [];
  assert.equal(new Set(scopes).size, scopes.length, "challenge scopes must be unique");
  return new Set(scopes);
}

assert.deepEqual(await challengedScopes(null, "list_devices", {}), new Set(["devices:read", "computer:read", "computer:write", "browser:read", "offline_access"]));
assert.deepEqual(await challengedScopes(authIdentity("devices:read"), "read_file", {
  device_id: "scope-test-device", path: "/scope-test.txt",
}), new Set(["devices:read", "computer:read", "offline_access"]));
assert.deepEqual(await challengedScopes(authIdentity("computer:read"), "list_devices", {}),
  new Set(["computer:read", "devices:read", "offline_access"]));
assert.deepEqual(await challengedScopes(authIdentity("devices:read computer:read computer:read offline_access"), "write_file", {
  device_id: "scope-test-device", path: "/scope-test.txt", content: "scope test",
}), new Set(["devices:read", "computer:read", "computer:write", "offline_access"]));

// Production deliberately disables experimental goal creation/decisions, but
// read-only context for an existing goal must still be discoverable by clients.
const disabledGoalsMcp = createRemoteLinkMcp(
  { ...authEnv, ENABLE_EXPERIMENTAL_AGENT_GOALS: "0" },
  authIdentity("automation:read"),
);
const listed = await disabledGoalsMcp.fetch(new Request(authEnv.PUBLIC_ORIGIN + "/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
}));
const listedText = await listed.text();
assert(listed.ok, listedText);
const listedJson = JSON.parse(listedText.trim().startsWith("{")
  ? listedText : listedText.split("\n").find(line => line.startsWith("data: "))!.slice(6));
assert(!listedJson.error, listedText);
const listedNames = new Set<string>(listedJson.result.tools.map((tool: { name: string }) => tool.name));
assert(listedNames.has("get_goal_context"), "existing goal checkpoints remain readable in production");
assert(!listedNames.has("create_agent_goal"), "experimental goal creation must stay disabled");
assert(!listedNames.has("submit_goal_decision"), "experimental mutations must stay disabled");

console.log("PASS: MCP error contract, incremental OAuth scopes, and admin/operator unlimited usage regressions");
