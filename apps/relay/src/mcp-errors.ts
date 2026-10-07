import { McpServer } from "@modelcontextprotocol/server";

export type ExpectedMcpError = {
  code: string;
  message: string;
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const codeOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";

export function classifyExpectedMcpError(error: unknown): ExpectedMcpError | null {
  const message = messageOf(error);
  const code = codeOf(error);

  if (code === "MONTHLY_LIMIT_REACHED") return { code, message };
  if (code === "PLAN_UPGRADE_REQUIRED" || /^Remote Arc Plus is required for /i.test(message)) {
    return { code: "PLAN_UPGRADE_REQUIRED", message };
  }

  const rules: Array<[RegExp, string]> = [
    [/requires cwd when multiple Trusted Write Locations/i, "WORKSPACE_CWD_REQUIRED"],
    [/requires a Trusted Write Location/i, "WORKSPACE_REQUIRED"],
    [/^Blocked by Remote Arc Trusted Write Locations:/i, "WORKSPACE_DENIED"],
    [/^Blocked by Remote Arc Workspace Scope:/i, "WORKSPACE_DENIED"],
    [/^Blocked by Remote Arc Task Workspace:/i, "WORKSPACE_DENIED"],
    [/^Remote Arc approval required/i, "APPROVAL_REQUIRED"],
    [/^Blocked by Remote Arc Sensitive Path Policy/i, "SENSITIVE_PATH_BLOCKED"],
    [/^Blocked by Remote Arc Safety Guard:/i, "SAFETY_GUARD_BLOCKED"],
    [/^tool ".+" is disabled/i, "TOOL_DISABLED"],
    [/disabled for this device\.?$/i, "TOOL_DISABLED"],
    [/Local Undo is disabled for this device/i, "TOOL_DISABLED"],

    [/device call timed out/i, "DEVICE_TIMEOUT"],
    [/device offline/i, "DEVICE_OFFLINE"],
    [/device not found or revoked/i, "DEVICE_NOT_FOUND"],
    [/^device not found\.?$/i, "DEVICE_NOT_FOUND"],
    [/^This device does not currently allow /i, "DEVICE_POLICY_DENIED"],
    [/^Device permission policy changed/i, "DEVICE_POLICY_CHANGED"],
    [/^Device did not return (?:a process_id|managed process id)/i, "DEVICE_PROTOCOL_ERROR"],
    [/^Device lacks owned checkpoint support/i, "DEVICE_VERSION_UNSUPPORTED"],
    [/^This computer could not acquire its task keep-awake lease/i, "KEEP_AWAKE_UNAVAILABLE"],

    [/^Account not found\.?$/i, "ACCOUNT_NOT_FOUND"],
    [/^automation not found\.?$/i, "AUTOMATION_NOT_FOUND"],
    [/cannot be (?:paused|resumed)/i, "AUTOMATION_STATE_CONFLICT"],
    [/^Durable Agent Goals are not configured/i, "FEATURE_NOT_CONFIGURED"],
    [/^GitHub App automation is not configured/i, "FEATURE_NOT_CONFIGURED"],

    [/^File resource not found\.?$/i, "RESOURCE_NOT_FOUND"],
    [/^Device did not return a valid binary file resource descriptor/i, "RESOURCE_ERROR"],
    [/^File resource could not be revoked/i, "RESOURCE_ERROR"],
    [/^Invalid or changed binary resource chunk/i, "RESOURCE_ERROR"],
    [/^Binary resource chunk length mismatch/i, "RESOURCE_ERROR"],

    [/^trigger requires task_version=1/i, "INVALID_TOOL_REQUEST"],
    [/^Use trigger instead of legacy schedule/i, "INVALID_TOOL_REQUEST"],
    [/^Select source or hosted explicitly/i, "INVALID_TOOL_REQUEST"],
    [/^Agent Goal .*required/i, "INVALID_TOOL_REQUEST"],
    [/^No approved device tools are available/i, "INVALID_TOOL_REQUEST"],
    [/^GitHub .*invalid/i, "INVALID_TOOL_REQUEST"],
    [/^GitHub .*requires/i, "INVALID_TOOL_REQUEST"],
    [/^GitHub merge actions cannot/i, "INVALID_TOOL_REQUEST"],
    [/^Automation .*must|^Automation .*requires/i, "INVALID_TOOL_REQUEST"],
    [/^Each command must|^cwd must|^Goal .*must|^expected_exit_code must/i, "INVALID_TOOL_REQUEST"],
    [/^Condition match|^schedule\.at must|^expires_at must|^max_runs must/i, "INVALID_TOOL_REQUEST"],
    [/^A versioned task contract cannot|^Unsupported automation kind/i, "INVALID_TOOL_REQUEST"],
    [/^device_id is required for device-backed automation/i, "INVALID_TOOL_REQUEST"],

    [/^Goal not found\.?$/i, "GOAL_NOT_FOUND"],
    [/^Task is not an Agent Goal\.?$/i, "INVALID_GOAL_STATE"],
    [/^Goal is not source-controlled\.?$/i, "INVALID_GOAL_STATE"],
    [/^Goal belongs to another source client\.?$/i, "GOAL_ACCESS_DENIED"],
    [/^Invalid revision or idempotency key\.?$/i, "GOAL_DECISION_CONFLICT"],
    [/^Completion requires evidence\.?$/i, "GOAL_DECISION_CONFLICT"],
    [/^Idempotency key was already used/i, "GOAL_DECISION_CONFLICT"],
    [/^Goal revision changed or it is not awaiting a decision/i, "GOAL_DECISION_CONFLICT"],
    [/^Planned goal time boundary/i, "GOAL_TIME_BOUNDARY"],
    [/^Planned decision requires/i, "INVALID_GOAL_STATE"],
    [/^Phase result requires/i, "INVALID_GOAL_STATE"],
    [/^Unknown prior effect requires/i, "INVALID_GOAL_STATE"],
    [/^Settle the current phase/i, "INVALID_GOAL_STATE"],
    [/^Plan revision requires/i, "INVALID_GOAL_STATE"],
    [/^Adaptive continuation was not authorized/i, "INVALID_GOAL_STATE"],
    [/^Phase commands require/i, "INVALID_GOAL_STATE"],
    [/^Execution slice requires/i, "INVALID_GOAL_STATE"],
    [/^Invalid phase outcome/i, "INVALID_GOAL_STATE"],
    [/^Task is finalizing/i, "INVALID_GOAL_STATE"],
    [/^Candidate paths cannot/i, "WORKSPACE_DENIED"],
    [/^Planned quality work must stay/i, "WORKSPACE_DENIED"],
    [/^Hard deadline reached/i, "GOAL_TIME_BOUNDARY"],
    [/^No current phase/i, "INVALID_GOAL_STATE"],
    [/^Unapproved planned goal tool/i, "INVALID_GOAL_STATE"],
    [/^Persist an authorized phase/i, "INVALID_GOAL_STATE"],

    [/^Expected a plan object/i, "INVALID_TOOL_REQUEST"],
    [/^Invalid bounded plan text/i, "INVALID_TOOL_REQUEST"],
    [/^Invalid plan duration or recovery limit/i, "INVALID_TOOL_REQUEST"],
    [/^Plan list exceeds its bound/i, "INVALID_TOOL_REQUEST"],
    [/^Invalid phase id/i, "INVALID_TOOL_REQUEST"],
    [/^Phase minimum exceeds maximum/i, "INVALID_TOOL_REQUEST"],
    [/^Adaptive selection requires/i, "INVALID_TOOL_REQUEST"],
    [/^Duplicate phase ids/i, "INVALID_TOOL_REQUEST"],
    [/^Cyclic phase dependency/i, "INVALID_TOOL_REQUEST"],
    [/^Unknown phase dependency/i, "INVALID_TOOL_REQUEST"],
    [/^Plan exceeds bounded context budget/i, "INVALID_TOOL_REQUEST"],
    [/^Invalid planning_mode/i, "INVALID_TOOL_REQUEST"],
    [/^Minimum useful duration exceeds maximum/i, "INVALID_TOOL_REQUEST"],
    [/^end_at requires an ISO timestamp/i, "INVALID_TOOL_REQUEST"],
    [/^Invalid IANA timezone/i, "INVALID_TOOL_REQUEST"],
    [/^Finalization reserve must be smaller/i, "INVALID_TOOL_REQUEST"],
    [/^Fixed plan requires phases/i, "INVALID_TOOL_REQUEST"],
    [/^Invalid quality policy/i, "INVALID_TOOL_REQUEST"],
    [/^Green-only quality requires/i, "INVALID_TOOL_REQUEST"],
    [/^Plan commands require approved terminal access/i, "INVALID_TOOL_REQUEST"],
    [/^Invalid continuation mode/i, "INVALID_TOOL_REQUEST"],
    [/^Unsupported recovery policy/i, "INVALID_TOOL_REQUEST"],
    [/^Plan revision budget exhausted/i, "INVALID_GOAL_STATE"],
    [/^Strategy retry budget exhausted/i, "INVALID_GOAL_STATE"],
    [/^A phase id cannot be reused/i, "INVALID_GOAL_STATE"],
    [/^Active plan phase bound exceeded/i, "INVALID_GOAL_STATE"],
    [/^Revised plan exceeds bounded context budget/i, "INVALID_GOAL_STATE"],
  ];

  for (const [pattern, mappedCode] of rules) {
    if (pattern.test(message)) return { code: mappedCode, message };
  }

  return null;
}

const errorResult = (error: ExpectedMcpError) => ({
  content: [
    {
      type: "text" as const,
      text: `Remote Arc error: ${error.message}\n\nCode: ${error.code}`,
    },
  ],
  isError: true,
});

export function registerMcpTool(
  server: McpServer,
  name: string,
  definition: unknown,
  handler: (...args: any[]) => unknown,
) {
  const register = server.registerTool.bind(server) as (...args: any[]) => unknown;
  return register(name, definition, async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      const expected = classifyExpectedMcpError(error);
      if (!expected) throw error;
      console.warn("[Remote Arc MCP expected error]", {
        tool: name,
        code: expected.code,
        message: expected.message,
      });
      return errorResult(expected);
    }
  });
}
