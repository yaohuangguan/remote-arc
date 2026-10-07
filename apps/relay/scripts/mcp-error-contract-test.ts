import assert from "node:assert/strict";
import type { McpServer } from "@modelcontextprotocol/server";
import { classifyExpectedMcpError, registerMcpTool } from "../src/mcp-errors.js";
import { consumeToolCall, getMonthlyUsage } from "../src/usage.js";

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
assert.equal(structured.isError, true);
assert.match(structured.content[0].text, /WORKSPACE_CWD_REQUIRED/);
assert.match(structured.content[0].text, /requires cwd/);

registerMcpTool(fakeServer, "internal_probe", {}, async () => {
  throw new Error("D1_ERROR: unexpected storage failure");
});
await assert.rejects(() => registeredHandler!({}), /D1_ERROR/);

type UserRow = { role: string; email: string };
function usageDb(user: UserRow, toolCalls: number) {
  return {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first() {
              if (sql.includes("SELECT role, email FROM users")) return user;
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

console.log("PASS: MCP error contract and admin/operator unlimited usage regressions");
