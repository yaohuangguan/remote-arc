import { requireTaskPermission } from "./device-task-policy.js";
import { isPlanUpgradeRequiredError, requireEntitledFeatures, requireFeatures, type AccountFeature, type PlanEntitlements } from "./entitlements.js";
import { validateAgentToolArguments } from "./agent-tools.js";
import {
  getSessionUser,
  nowIso,
  randomToken,
  sha256Hex,
  type OAuthIdentity,
} from "./auth.js";
import { checkpointTask, journalStatement, LeaseLostError, renewTaskLease } from "./automation-store.js";
import { callDevice, isDeviceCallTimeoutError, UncertainDeviceDispatchError, type DeviceCallEnv } from "./device-call.js";
import {
  agentPlannerConfigured,
  planAgentTurn,
  PlannerTransientError,
  type AgentPlannerEnv,
  type AgentToolName,
} from "./agent-planner.js";
import { takeSourceDecision } from "./source-goals.js";
import { normalizeTaskContract, type TaskContract } from "./task-contract.js";
import { taskSchedulerHealth } from "./task-scheduler.js";
import { binaryBytesRead, finishAutomationRunWithUsage, recordPlusUsage } from "./plus-usage.js";
import { sanitizePlan, finishPhase, plannedReport, timeBudget, type GoalPlan, type PlannedState } from "./planned-goals.js";
import { executePlannedGoal } from "./planned-goal-runtime.js";
import {
  githubAutomationConfigured,
  mergeGitHubPullRequest,
  type GitHubAutomationEnv,
  type GitHubMergeSpec,
} from "./github-automation.js";

export type AutomationKind =
  | "long_task"
  | "condition_watch"
  | "schedule_watch"
  | "goal_loop";

export type AutomationCreateKind = AutomationKind | "agent_goal";

export type AutomationStatus =
  | "waiting"
  | "running"
  | "waiting_for_device"
  | "waiting_for_event"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type AutomationEnv = DeviceCallEnv &
  AgentPlannerEnv &
  GitHubAutomationEnv & {
    PUBLIC_ORIGIN: string;
    APP_ORIGIN?: string;
    ENABLE_EXPERIMENTAL_AGENT_GOALS?: string;
  };

type JsonPrimitive = string | number | boolean | null;

type DeviceCommandStep = {
  type: "device_command";
  command: string;
  cwd?: string;
};

type AutomationStep = DeviceCommandStep | GitHubMergeSpec;

type ActionPlan = {
  keep_awake?: boolean;
  steps: AutomationStep[];
  recovery?: "restart" | "fail";
};

type CommandGoalSpec = {
  type: "command_exit";
  command: string;
  cwd?: string;
  expected_exit_code: number;
};

export type AgentGoalSpec = {
  type: "agent_goal";
  controller?: "hosted" | "source";
  controller_client_id?: string;
  objective: string;
  success_criteria: string;
  workspace?: string;
  verify?: {
    command: string;
    cwd?: string;
    expected_exit_code: number;
  };
  allowed_tools: AgentToolName[];
  max_iterations: number;
  plan?: GoalPlan;
  source_capabilities?: { durable_context: boolean; resume_on_next_turn: boolean; autonomous_event_wakeup: boolean };
};

type GoalSpec = CommandGoalSpec | AgentGoalSpec;

type TriggerSpec =
  | { type: "immediate" }
  | { type: "interval"; every_seconds: number; start_at?: string }
  | { type: "at"; at: string }
  | {
      type: "webhook";
      source: "github" | "generic";
      event?: string;
      match?: Record<string, JsonPrimitive>;
    };

export type RuntimeState = {
  inflight_action?: { id: string; tool: string };
  retry_count?: number;
  phase?:
    | "idle"
    | "awaiting_agent"
    | "needs_reasoning"
    | "planned_process_running"
    | "finalizing"
    | "step_running"
    | "goal_running"
    | "agent_process_running"
    | "agent_verify_running";
  step_index?: number;
  process_id?: string;
  run_id?: string;
  trigger?: {
    source?: string;
    event_name?: string | null;
    delivery_id?: string | null;
  };
  agent?: {
    iteration: number;
    memory: string;
    observation: string;
    last_decision_summary?: string;
    completion_evidence?: string;
  };
  planned?: PlannedState;
};

export type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  kind: AutomationKind;
  status: AutomationStatus;
  device_id: string | null;
  trigger_json: string | null;
  action_json: string;
  goal_json: string | null;
  state_json: string | null;
  permission_snapshot_json: string | null;
  interval_seconds: number;
  next_run_at: string | null;
  expires_at: string | null;
  max_runs: number;
  run_count: number;
  run_started_count?: number;
  last_run_at: string | null;
  last_error: string | null;
  lease_token: string | null;
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
};

type AutomationRunRow = {
  id: string;
  automation_id: string;
  user_id: string;
  attempt: number;
  status: string;
  process_id: string | null;
  exit_code: number | null;
  output_summary: string | null;
  trigger_payload: string | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

type DevicePolicySnapshot = {
  device_id: string;
  allowed_tools: string[];
  workspace_roots: string[];
  sensitive_paths: string[];
  sensitive_allow_paths: string[];
  protect_sensitive_paths: boolean;
  undo_enabled: boolean;
};

export type CreateAutomationInput = {
  task?: TaskContract;
  keep_awake?: boolean;
  name?: string;
  kind?: AutomationCreateKind;
  device_id?: string;
  command?: string;
  cwd?: string;
  steps?: Array<{ command?: string; cwd?: string }>;
  goal?: {
    command?: string;
    cwd?: string;
    expected_exit_code?: number;
  };
  agent_goal?: {
    controller?: "hosted" | "source";
    controller_client_id?: string;
    objective?: string;
    success_criteria?: string;
    workspace?: string;
    verify_command?: string;
    verify_cwd?: string;
    allowed_tools?: AgentToolName[];
    max_iterations?: number;
    plan?: unknown;
    source_capabilities?: { durable_context: boolean; resume_on_next_turn: boolean; autonomous_event_wakeup: boolean };
  };
  github_merge?: {
    owner?: string;
    repo?: string;
    pull_number?: number;
    installation_id?: string;
    merge_method?: "merge" | "squash" | "rebase";
    expected_head_sha?: string;
  };
  condition?: {
    source?: "github" | "generic";
    event?: string;
    match?: Record<string, JsonPrimitive>;
  };
  schedule?: {
    at?: string;
    every_seconds?: number;
    start_at?: string;
  };
  interval_seconds?: number;
  max_runs?: number;
  expires_at?: string | null;
  recovery?: "restart" | "fail";
};

const isTerminalStatus = (status: AutomationStatus) =>
  ["completed", "failed", "cancelled", "expired"].includes(status);

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export function requiredAutomationFeatures(input: Pick<CreateAutomationInput, "kind" | "schedule" | "keep_awake">) {
  const requestedKind = input.kind || "long_task";
  const features: AccountFeature[] =
    requestedKind === "agent_goal"
      ? ["planned_agent_goals", "durable_tasks"]
      : ["durable_tasks"];
  if (requestedKind === "schedule_watch" || input.schedule) features.push("scheduled_tasks");
  if (input.keep_awake) features.push("keep_awake");
  return features;
}

function requiredAutomationRowFeatures(automation: AutomationRow) {
  const features: AccountFeature[] = ["durable_tasks"];
  const goal = parseJson<GoalSpec | null>(automation.goal_json, null);
  if (goal?.type === "agent_goal") features.push("planned_agent_goals");
  const trigger = parseJson<TriggerSpec | null>(automation.trigger_json, null);
  if (trigger?.type === "interval" || trigger?.type === "at") features.push("scheduled_tasks");
  const action = parseJson<ActionPlan>(automation.action_json, { steps: [] });
  if (action.keep_awake) features.push("keep_awake");
  return features;
}

async function requireAutomationEntitlements(
  env: AutomationEnv,
  userId: string,
  automation: AutomationRow,
) {
  return requireFeatures(env, userId, requiredAutomationRowFeatures(automation));
}

const parseStringArray = (value: string | null) => {
  const parsed = parseJson<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string").sort()
    : [];
};

const stableJson = (value: unknown) => JSON.stringify(value);

const addSeconds = (iso: string, seconds: number) =>
  new Date(Date.parse(iso) + seconds * 1000).toISOString();

const addHours = (iso: string, hours: number) =>
  addSeconds(iso, hours * 3600);

const isValidIso = (value: string | null | undefined) =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  value.length <= 64;

const clampInterval = (value: unknown, fallback = 300) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), 60), 30 * 86400);
};

const automationIdentity = (
  automation: Pick<AutomationRow, "id" | "user_id">,
  env: AutomationEnv,
): OAuthIdentity => ({
  userId: automation.user_id,
  clientId: "automation:" + automation.id,
  grantId: null,
  scope: "devices:read computer:read computer:write",
  resource: env.PUBLIC_ORIGIN + "/mcp",
});

async function devicePolicySnapshot(
  env: AutomationEnv,
  userId: string,
  deviceId: string,
): Promise<DevicePolicySnapshot | null> {
  const row = await env.DB.prepare(
    `SELECT id, allowed_tools, workspace_roots, sensitive_paths,
            sensitive_allow_paths, protect_sensitive_paths, undo_enabled
     FROM devices
     WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
  )
    .bind(deviceId, userId)
    .first<{
      id: string;
      allowed_tools: string | null;
      workspace_roots: string | null;
      sensitive_paths: string | null;
      sensitive_allow_paths: string | null;
      protect_sensitive_paths: number;
      undo_enabled: number;
    }>();

  if (!row) return null;

  return {
    device_id: row.id,
    allowed_tools: parseStringArray(row.allowed_tools),
    workspace_roots: parseStringArray(row.workspace_roots),
    sensitive_paths: parseStringArray(row.sensitive_paths),
    sensitive_allow_paths: parseStringArray(row.sensitive_allow_paths),
    protect_sensitive_paths: row.protect_sensitive_paths !== 0,
    undo_enabled: row.undo_enabled !== 0,
  };
}

const AGENT_TOOL_NAMES: AgentToolName[] = [
  "list_directory",
  "read_file",
  "read_binary_file",
  "get_file_info",
  "write_file",
  "edit_block",
  "start_process",
];

const policyAllowsTool = (policy: DevicePolicySnapshot, tool: string) =>
  policy.allowed_tools.length === 0 || policy.allowed_tools.includes(tool);

const policySupportsCommandAutomation = (policy: DevicePolicySnapshot) =>
  ["start_process", "process_status", "stop_process"].every((tool) =>
    policyAllowsTool(policy, tool),
  );

const normalizeAgentTools = (
  policy: DevicePolicySnapshot,
  requested: AgentToolName[] | undefined,
) => {
  if (!Array.isArray(requested) || requested.length === 0) {
    throw new Error("Agent Goal requires an explicit allowed_tools list.");
  }
  const unique = [...new Set(requested)].filter((tool): tool is AgentToolName =>
    AGENT_TOOL_NAMES.includes(tool as AgentToolName),
  );
  const allowed = unique.filter((tool) => policyAllowsTool(policy, tool));
  if (allowed.includes("start_process")) {
    for (const dependency of ["process_status", "process_output", "stop_process"]) {
      if (!policyAllowsTool(policy, dependency)) {
        throw new Error(
          "Agent Goal terminal access also requires process_status, process_output and stop_process.",
        );
      }
    }
  }
  if (!allowed.length) {
    throw new Error("No approved device tools are available for this Agent Goal.");
  }
  return allowed;
};

function sanitizeGitHubMerge(input: CreateAutomationInput): GitHubMergeSpec | null {
  if (!input.github_merge) return null;
  const owner = (input.github_merge.owner || "").trim();
  const repo = (input.github_merge.repo || "").trim();
  const installationId = (input.github_merge.installation_id || "").trim();
  const expectedHeadSha = (input.github_merge.expected_head_sha || "").trim();
  const pullNumber = Number(input.github_merge.pull_number);
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner)) {
    throw new Error("GitHub owner is invalid.");
  }
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    throw new Error("GitHub repository name is invalid.");
  }
  if (!Number.isInteger(pullNumber) || pullNumber < 1) {
    throw new Error("GitHub pull_number must be a positive integer.");
  }
  if (installationId && !/^\d+$/.test(installationId)) {
    throw new Error("GitHub installation_id must be numeric.");
  }
  if (expectedHeadSha && !/^[a-f0-9]{7,64}$/i.test(expectedHeadSha)) {
    throw new Error("GitHub expected_head_sha is invalid.");
  }
  return {
    type: "github_merge_pr",
    owner,
    repo,
    pull_number: pullNumber,
    ...(installationId ? { installation_id: installationId } : {}),
    merge_method: input.github_merge.merge_method || "merge",
    ...(expectedHeadSha ? { expected_head_sha: expectedHeadSha } : {}),
  };
}

function sanitizeSteps(input: CreateAutomationInput): ActionPlan {
  if (input.kind === "agent_goal") {
    return {
      steps: [],
      recovery: input.recovery === "fail" ? "fail" : "restart",
    };
  }

  const githubMerge = sanitizeGitHubMerge(input);
  if (githubMerge) {
    if (input.command || (Array.isArray(input.steps) && input.steps.length)) {
      throw new Error("GitHub merge actions cannot be combined with device command steps.");
    }
    return {
      steps: [githubMerge],
      recovery: "fail",
    };
  }

  const source =
    Array.isArray(input.steps) && input.steps.length > 0
      ? input.steps
      : input.command
        ? [{ command: input.command, cwd: input.cwd }]
        : [];

  if (source.length === 0 || source.length > 8) {
    throw new Error("Automation requires between 1 and 8 command steps.");
  }

  const steps: DeviceCommandStep[] = source.map((step) => {
    const command = (step.command || "").trim();
    const cwd = (step.cwd || "").trim();
    if (!command || command.length > 4000) {
      throw new Error("Each command must be between 1 and 4000 characters.");
    }
    if (cwd.length > 500) {
      throw new Error("cwd must be 500 characters or fewer.");
    }
    return {
      type: "device_command",
      command,
      ...(cwd ? { cwd } : {}),
    };
  });

  return {
    steps,
    recovery: input.recovery === "fail" ? "fail" : "restart",
  };
}

function sanitizeGoal(
  input: CreateAutomationInput,
  policy?: DevicePolicySnapshot | null,
): GoalSpec | null {
  if (input.kind === "agent_goal") {
    if (!policy) throw new Error("Agent Goal requires a paired device.");
    const objective = (input.agent_goal?.objective || "").trim();
    const successCriteria = (input.agent_goal?.success_criteria || "").trim();
    const workspace = (input.agent_goal?.workspace || "").trim();
    const verifyCommand = (input.agent_goal?.verify_command || "").trim();
    const verifyCwd = (input.agent_goal?.verify_cwd || workspace || "").trim();
    if (!objective || objective.length > 6000) {
      throw new Error("Agent Goal objective must be between 1 and 6000 characters.");
    }
    if (!successCriteria || successCriteria.length > 4000) {
      throw new Error("Agent Goal success criteria must be between 1 and 4000 characters.");
    }
    if (workspace.length > 500 || verifyCwd.length > 500) {
      throw new Error("Agent Goal workspace paths must be 500 characters or fewer.");
    }
    if (verifyCommand.length > 4000) {
      throw new Error("Agent Goal verification command is too long.");
    }
    const maxIterations = Number(input.agent_goal?.max_iterations ?? 30);
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 2000) {
      throw new Error("Agent Goal max_iterations must be between 1 and 2000.");
    }
    const allowedTools = normalizeAgentTools(policy, input.agent_goal?.allowed_tools);
    return {
      type: "agent_goal",
      controller: input.agent_goal?.controller === "source" ? "source" : "hosted",
      ...(input.agent_goal?.controller_client_id ? { controller_client_id: input.agent_goal.controller_client_id } : {}),
      objective,
      success_criteria: successCriteria,
      ...(workspace ? { workspace } : {}),
      ...(verifyCommand
        ? {
            verify: {
              command: verifyCommand,
              ...(verifyCwd ? { cwd: verifyCwd } : {}),
              expected_exit_code: 0,
            },
          }
        : {}),
      allowed_tools: allowedTools,
      max_iterations: maxIterations,
      ...(input.agent_goal?.plan !== undefined ? { plan: sanitizePlan(input.agent_goal.plan, workspace || undefined, allowedTools.includes("start_process")) } : {}),
      ...(input.agent_goal?.source_capabilities ? { source_capabilities: {
        durable_context: input.agent_goal.source_capabilities.durable_context === true,
        resume_on_next_turn: input.agent_goal.source_capabilities.resume_on_next_turn === true,
        autonomous_event_wakeup: input.agent_goal.source_capabilities.autonomous_event_wakeup === true,
      } } : {}),
    };
  }

  if (input.kind !== "goal_loop") return null;
  const command = (input.goal?.command || "").trim();
  const cwd = (input.goal?.cwd || "").trim();
  if (!command || command.length > 4000) {
    throw new Error("Goal loop requires a verification command.");
  }
  if (cwd.length > 500) {
    throw new Error("Goal cwd must be 500 characters or fewer.");
  }
  const expected = Number(input.goal?.expected_exit_code ?? 0);
  if (!Number.isInteger(expected) || expected < 0 || expected > 255) {
    throw new Error("expected_exit_code must be an integer between 0 and 255.");
  }
  return {
    type: "command_exit",
    command,
    ...(cwd ? { cwd } : {}),
    expected_exit_code: expected,
  };
}

function sanitizeTrigger(
  kind: AutomationKind,
  input: CreateAutomationInput,
  now: string,
): { trigger: TriggerSpec; nextRunAt: string | null; initialStatus: AutomationStatus } {
  if (kind === "condition_watch") {
    const source = input.condition?.source || "generic";
    const event = (input.condition?.event || "").trim();
    const rawMatch = input.condition?.match || {};
    const match: Record<string, JsonPrimitive> = {};
    for (const [key, value] of Object.entries(rawMatch)) {
      if (!key || key.length > 160) throw new Error("Condition match key is too long.");
      if (
        value !== null &&
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        throw new Error("Condition match values must be primitive JSON values.");
      }
      match[key] = value;
    }
    return {
      trigger: {
        type: "webhook",
        source,
        ...(event ? { event } : {}),
        ...(Object.keys(match).length ? { match } : {}),
      },
      nextRunAt: null,
      initialStatus: "waiting_for_event",
    };
  }

  if (kind === "schedule_watch") {
    if (input.schedule?.at) {
      if (!isValidIso(input.schedule.at) || Date.parse(input.schedule.at) <= Date.parse(now)) {
        throw new Error("schedule.at must be a future ISO timestamp.");
      }
      return {
        trigger: { type: "at", at: new Date(input.schedule.at).toISOString() },
        nextRunAt: new Date(input.schedule.at).toISOString(),
        initialStatus: "waiting",
      };
    }

    const every = clampInterval(input.schedule?.every_seconds, 3600);
    const start =
      input.schedule?.start_at && isValidIso(input.schedule.start_at)
        ? new Date(input.schedule.start_at).toISOString()
        : addSeconds(now, every);
    return {
      trigger: {
        type: "interval",
        every_seconds: every,
        ...(input.schedule?.start_at ? { start_at: start } : {}),
      },
      nextRunAt: Date.parse(start) > Date.parse(now) ? start : now,
      initialStatus: "waiting",
    };
  }

  return {
    trigger: { type: "immediate" },
    nextRunAt: now,
    initialStatus: "waiting",
  };
}

function defaultExpiry(kind: AutomationKind, now: string, input: CreateAutomationInput) {
  if (input.expires_at === null) return null;
  if (input.expires_at !== undefined) {
    if (!isValidIso(input.expires_at) || Date.parse(input.expires_at) <= Date.parse(now)) {
      throw new Error("expires_at must be a future ISO timestamp or null.");
    }
    return new Date(input.expires_at).toISOString();
  }
  if (kind === "long_task" || kind === "goal_loop") return addHours(now, 24);
  return null;
}

function defaultMaxRuns(kind: AutomationKind, value: unknown) {
  if (value !== undefined) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 10000) {
      throw new Error("max_runs must be an integer from 0 to 10000. Zero means unlimited.");
    }
    return n;
  }
  if (kind === "goal_loop" || kind === "schedule_watch") return 0;
  return 1;
}

async function authorizeGitHubAction(env: AutomationEnv, userId: string, action: GitHubMergeSpec) {
  const installationId = action.installation_id || env.GITHUB_APP_INSTALLATION_ID;
  const permission = installationId && await env.DB.prepare(`SELECT user_id FROM github_automation_permissions
    WHERE user_id = ?1 AND installation_id = ?2 AND owner = ?3 COLLATE NOCASE AND repo = ?4 COLLATE NOCASE`)
    .bind(userId, installationId, action.owner, action.repo).first();
  if (!permission) throw new Error("GitHub cloud action requires an explicit account/installation/repository permission binding.");
  return { ...action, installation_id: installationId! };
}

export async function createAutomation(
  env: AutomationEnv,
  userId: string,
  input: CreateAutomationInput,
  options?: { entitlements?: PlanEntitlements },
) {
  const typedContract = input.task !== undefined;
  if (typedContract) {
    if (Object.keys(input).some(key => key !== "task"))
      throw new Error("A versioned task contract cannot be mixed with legacy automation fields.");
    input = normalizeTaskContract(input.task!);
  }
  const requestedKind = input.kind || "long_task";
  if (requestedKind === "agent_goal" && env.ENABLE_EXPERIMENTAL_AGENT_GOALS === "0") {
    throw new Error(
      "Adaptive Agent Goals are experimental and are not enabled on this production deployment. Use a deterministic durable Task instead.",
    );
  }
  if (
    !["long_task", "condition_watch", "schedule_watch", "goal_loop", "agent_goal"].includes(
      requestedKind,
    )
  ) {
    throw new Error("Unsupported automation kind.");
  }

  const requiredFeatures = requiredAutomationFeatures(input);
  if (options?.entitlements) {
    requireEntitledFeatures(options.entitlements, requiredFeatures);
  } else {
    await requireFeatures(env, userId, requiredFeatures);
  }

  const storedKind: AutomationKind =
    requestedKind === "agent_goal" ? "goal_loop" : requestedKind;
  const name = (input.name || "").trim();
  if (!name || name.length > 120) {
    throw new Error("Automation name must be between 1 and 120 characters.");
  }

  const action = sanitizeSteps({ ...input, kind: requestedKind });
  if (input.keep_awake) action.keep_awake = true;
  const cloudOnly = action.steps.length > 0 &&
    action.steps.every((step) => step.type === "github_merge_pr");
  const deviceId = (input.device_id || "").trim();

  let policy: DevicePolicySnapshot | null = null;
  if (!cloudOnly || requestedKind === "agent_goal") {
    if (!deviceId) throw new Error("device_id is required for device-backed automation.");
    policy = await devicePolicySnapshot(env, userId, deviceId);
    if (!policy) throw new Error("Device not found or revoked.");

    if (
      requestedKind !== "agent_goal" &&
      !policySupportsCommandAutomation(policy)
    ) {
      throw new Error(
        "This device does not currently allow start_process, process_status and stop_process.",
      );
    }
  }

  if (requestedKind === "agent_goal" && input.agent_goal?.controller !== "source" && !agentPlannerConfigured(env)) {
    throw new Error(
      "Durable Agent Goals are not configured on this Remote Arc deployment.",
    );
  }
  if (
    action.steps.some((step) => step.type === "github_merge_pr") &&
    !githubAutomationConfigured(env)
  ) {
    throw new Error(
      "GitHub App automation is not configured on this Remote Arc deployment.",
    );
  }

  for (const step of action.steps) {
    if (step.type === "github_merge_pr") Object.assign(step, await authorizeGitHubAction(env, userId, step));
  }
  const goal = sanitizeGoal({ ...input, kind: requestedKind }, policy);
  const now = nowIso();
  const { trigger, nextRunAt, initialStatus } = sanitizeTrigger(
    input.condition ? "condition_watch" : input.schedule ? "schedule_watch" : storedKind, input, now);
  const awaitingSource = typedContract && goal?.type === "agent_goal" && goal.controller === "source"
    && !goal.plan?.phases.some(phase => phase.execution_slice?.length) && trigger.type === "immediate";
  if (!cloudOnly) await requireTaskPermission(env.DB, userId, deviceId, storedKind, goal, trigger, action.keep_awake);
  const expiresAt = defaultExpiry(requestedKind === "agent_goal" && trigger.type === "interval" ? "schedule_watch" : storedKind,
    requestedKind === "agent_goal" && trigger.type === "at" ? trigger.at : now, input);
  const maxRuns =
    requestedKind === "agent_goal" ? (["interval", "webhook"].includes(trigger.type) ? defaultMaxRuns("schedule_watch", input.max_runs) : 1) : defaultMaxRuns(storedKind, input.max_runs);
  const intervalSeconds = clampInterval(
    input.interval_seconds,
    requestedKind === "agent_goal" ? 60 : 300,
  );
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO automations (
       id, user_id, name, kind, status, device_id, trigger_json,
       action_json, goal_json, state_json, permission_snapshot_json,
       interval_seconds, next_run_at, expires_at, max_runs, run_count,
       created_at, updated_at
     ) VALUES (
       ?1, ?2, ?3, ?4, ?5, ?6, ?7,
       ?8, ?9, ?10, ?11,
       ?12, ?13, ?14, ?15, 0,
       ?16, ?16
     )`,
  )
    .bind(
      id,
      userId,
      name,
      storedKind,
      awaitingSource ? "waiting_for_event" : initialStatus,
      deviceId || null,
      stableJson(trigger),
      stableJson(action),
      goal ? stableJson(goal) : null,
      stableJson(
        requestedKind === "agent_goal"
          ? ({
              phase: awaitingSource ? "awaiting_agent" : "idle",
              step_index: 0,
              agent: {
                iteration: 0,
                memory: "",
                observation: "Initial turn. Inspect the workspace and choose the first bounded action.",
              },
            } satisfies RuntimeState)
          : ({ phase: "idle", step_index: 0 } satisfies RuntimeState),
      ),
      policy ? stableJson(policy) : null,
      intervalSeconds,
      awaitingSource ? null : nextRunAt,
      expiresAt,
      maxRuns,
      now,
    )
    .run();

  let webhook: { url: string; token: string } | null = null;
  if (trigger.type === "webhook") {
    const token = randomToken(24);
    await env.DB.prepare(
      `INSERT INTO automation_webhooks (automation_id, secret_hash, created_at)
       VALUES (?1, ?2, ?3)`,
    )
      .bind(id, await sha256Hex(token), now)
      .run();
    const origin = env.APP_ORIGIN || env.PUBLIC_ORIGIN;
    webhook = {
      token,
      url: `${origin}/hooks/automations/${encodeURIComponent(id)}/${token}`,
    };
  }

  const automation = await getAutomation(env, userId, id);
  if (automation) await journalStatement(env.DB, automation, "created", "Task contract saved.", undefined).run();
  return { automation, webhook };
}

export async function listAutomations(
  env: AutomationEnv,
  userId: string,
  limit = 100,
) {
  const safeLimit = Math.min(Math.max(Math.round(limit), 1), 200);
  const result = await env.DB.prepare(
    `SELECT automations.*, (SELECT COUNT(*) FROM automation_runs r
       WHERE r.automation_id=automations.id AND r.user_id=automations.user_id) AS run_started_count
     FROM automations
     WHERE user_id = ?1
     ORDER BY created_at DESC
     LIMIT ?2`,
  )
    .bind(userId, safeLimit)
    .all<AutomationRow>();
  return result.results;
}

export async function getAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  return env.DB.prepare(
    `SELECT *
     FROM automations
     WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(automationId, userId)
    .first<AutomationRow>();
}

export async function listAutomationRuns(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const result = await env.DB.prepare(
    `SELECT *
     FROM automation_runs
     WHERE automation_id = ?1 AND user_id = ?2
     ORDER BY started_at DESC
     LIMIT 100`,
  )
    .bind(automationId, userId)
    .all<AutomationRunRow>();
  return result.results;
}

async function updateAutomationStatus(
  env: AutomationEnv,
  userId: string,
  automationId: string,
  status: AutomationStatus,
  nextRunAt: string | null,
  lastError: string | null = null,
  journalSummary?: string,
) {
  const now = nowIso();
  await env.DB.prepare(
    `UPDATE automations
     SET status = ?1,
         next_run_at = ?2,
         last_error = ?3,
         lease_token = NULL,
         lease_until = NULL,
         updated_at = ?4,
         revision = revision + 1
     WHERE id = ?5 AND user_id = ?6
       AND status NOT IN ('completed','failed','cancelled','expired')`,
  )
    .bind(status, nextRunAt, lastError, now, automationId, userId)
    .run();
  const updated = await getAutomation(env, userId, automationId);
  if (updated) await journalStatement(
    env.DB,
    updated,
    status,
    journalSummary || "User changed task status to " + status + ".",
    undefined,
  ).run();
  return updated;
}

export async function pauseAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const automation = await getAutomation(env, userId, automationId);
  if (!automation) throw new Error("Automation not found.");
  if (isTerminalStatus(automation.status)) {
    throw new Error("Completed, failed, cancelled or expired automations cannot be paused.");
  }
  const paused = await updateAutomationStatus(env, userId, automationId, "paused", null);
  await setTaskKeepAwake(env, automation, 0).catch(() => undefined);
  return paused;
}

export async function resumeAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const automation = await getAutomation(env, userId, automationId);
  if (!automation) throw new Error("Automation not found.");
  if (isTerminalStatus(automation.status)) {
    throw new Error("Completed, failed, cancelled or expired automations cannot be resumed.");
  }
  await requireAutomationEntitlements(env, userId, automation);

  const state = parseJson<RuntimeState>(automation.state_json, {});
  if (state.inflight_action) {
    throw new Error("Previous " + state.inflight_action.tool +
      " outcome is unknown; inspect the device and cancel this task before creating a new one. Blind resume is blocked.");
  }
  const trigger = parseJson<TriggerSpec | null>(automation.trigger_json, null);
  let status: AutomationStatus = "waiting";
  let nextRunAt: string | null = nowIso();

  if (parseJson<AgentGoalSpec | null>(automation.goal_json, null)?.controller === "source"
      && ["awaiting_agent", "needs_reasoning"].includes(state.phase || "") && !state.process_id && !state.planned) {
    status = "waiting_for_event";
    nextRunAt = null;
  } else if (trigger?.type === "webhook" && !state.run_id && !state.process_id && !state.trigger) {
    status = "waiting_for_event";
    nextRunAt = null;
  } else if (trigger?.type === "at" && !state.process_id) {
    nextRunAt = trigger.at;
  }

  return updateAutomationStatus(env, userId, automationId, status, nextRunAt);
}

export async function cancelAutomation(
  env: AutomationEnv,
  userId: string,
  automationId: string,
) {
  const automation = await getAutomation(env, userId, automationId);
  if (!automation) throw new Error("Automation not found.");
  if (isTerminalStatus(automation.status)) return automation;

  await updateAutomationStatus(env, userId, automationId, "cancelled", null);
  await setTaskKeepAwake(env, automation, 0).catch(() => undefined);
  const state = parseJson<RuntimeState>(automation.state_json, {});
  if (state.process_id && automation.device_id) {
    await callDevice(
      env,
      automationIdentity(automation, env),
      automation.device_id,
      "stop_process",
      { process_id: state.process_id },
    ).catch(() => undefined);
  }

  {
    await env.DB.prepare(
      `UPDATE automation_runs
       SET status = 'cancelled', finished_at = ?1
       WHERE automation_id = ?2 AND user_id = ?3 AND finished_at IS NULL`,
    )
      .bind(nowIso(), automationId, userId)
      .run();
  }

  return getAutomation(env, userId, automationId);
}

const getByPath = (value: unknown, path: string): unknown => {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = value;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const webhookMatches = (
  trigger: Extract<TriggerSpec, { type: "webhook" }>,
  source: string,
  eventName: string | null,
  payload: unknown,
) => {
  if (trigger.source !== source && trigger.source !== "generic") return false;
  if (trigger.event && trigger.event !== eventName) return false;
  for (const [path, expected] of Object.entries(trigger.match || {})) {
    if (getByPath(payload, path) !== expected) return false;
  }
  return true;
};

export async function handleAutomationWebhook(
  request: Request,
  env: AutomationEnv,
  automationId: string,
  token: string,
) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const hook = await env.DB.prepare(
    `SELECT w.secret_hash, a.*
     FROM automation_webhooks w
     JOIN automations a ON a.id = w.automation_id
     WHERE w.automation_id = ?1`,
  )
    .bind(automationId)
    .first<AutomationRow & { secret_hash: string }>();

  if (!hook || (await sha256Hex(token)) !== hook.secret_hash) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (parseJson<TriggerSpec | null>(hook.trigger_json, null)?.type !== "webhook") {
    return Response.json({ error: "not_a_condition_watch" }, { status: 400 });
  }
  if (
    hook.status === "paused" ||
    isTerminalStatus(hook.status)
  ) {
    return Response.json({ accepted: false, status: hook.status }, { status: 202 });
  }

  const source =
    request.headers.get("x-remotearc-source") ||
    (request.headers.has("x-github-event") ? "github" : "generic");
  const eventName =
    request.headers.get("x-github-event") ||
    request.headers.get("x-remotearc-event");
  const deliveryId =
    request.headers.get("x-github-delivery") ||
    request.headers.get("x-remotearc-delivery");
  const payload = await request.json().catch(() => ({}));
  const trigger = parseJson<Extract<TriggerSpec, { type: "webhook" }>>(
    hook.trigger_json,
    { type: "webhook", source: "generic" },
  );

  const now = nowIso();
  const matched = webhookMatches(trigger, source, eventName, payload);
  const busy =
    hook.status === "waiting" ||
    hook.status === "running" ||
    hook.status === "waiting_for_device" || Boolean(parseJson<RuntimeState>(hook.state_json, {}).run_id);
  const eventId = crypto.randomUUID();
  const consumedAt = !matched ? now : busy ? null : now;

  try {
    await env.DB.prepare(
      `INSERT INTO automation_events (
         id, automation_id, source, event_name, delivery_id,
         payload_json, received_at, consumed_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7)`,
    )
      .bind(
        eventId,
        automationId,
        source,
        eventName,
        deliveryId,
        now,
        consumedAt,
      )
      .run();
  } catch (error) {
    if (deliveryId) {
      return Response.json({ accepted: true, duplicate: true }, { status: 202 });
    }
    throw error;
  }

  await env.DB.prepare(
    `UPDATE automation_webhooks
     SET last_event_at = ?1
     WHERE automation_id = ?2`,
  )
    .bind(now, automationId)
    .run();

  if (!matched) {
    return Response.json({ accepted: true, matched: false }, { status: 202 });
  }

  if (busy) {
    return Response.json(
      { accepted: true, matched: true, queued: true },
      { status: 202 },
    );
  }

  const state = parseJson<RuntimeState>(hook.state_json, {});
  state.trigger = {
    source,
    event_name: eventName,
    delivery_id: deliveryId,
  };

  await env.DB.prepare(
    `UPDATE automations
     SET status = 'waiting',
         state_json = ?1,
         next_run_at = ?2,
         last_error = NULL,
         updated_at = ?2
     WHERE id = ?3
       AND status = 'waiting_for_event'`,
  )
    .bind(stableJson(state), now, automationId)
    .run();

  return Response.json({ accepted: true, matched: true, queued: false }, { status: 202 });
}

async function takeQueuedEvent(
  env: AutomationEnv,
  automationId: string,
) {
  const event = await env.DB.prepare(
    `SELECT id, source, event_name, delivery_id
     FROM automation_events
     WHERE automation_id = ?1
       AND consumed_at IS NULL
     ORDER BY received_at ASC
     LIMIT 1`,
  )
    .bind(automationId)
    .first<{
      id: string;
      source: string;
      event_name: string | null;
      delivery_id: string | null;
    }>();

  if (!event) return null;

  const consumedAt = nowIso();
  await env.DB.prepare(
    `UPDATE automation_events
     SET consumed_at = ?1
     WHERE id = ?2 AND consumed_at IS NULL`,
  )
    .bind(consumedAt, event.id)
    .run();

  return {
    source: event.source,
    event_name: event.event_name,
    delivery_id: event.delivery_id,
  } satisfies RuntimeState["trigger"];
}

async function startRun(
  env: AutomationEnv,
  automation: AutomationRow,
  state: RuntimeState,
) {
  const runId = crypto.randomUUID();
  const now = nowIso();
  const triggerPayload = state.trigger ? stableJson(state.trigger) : null;
  await env.DB.prepare(
    `INSERT INTO automation_runs (
       id, automation_id, user_id, attempt, status, trigger_payload, started_at
     ) SELECT ?1, ?2, ?3, ?4, 'running', ?5, ?6 FROM automations
       WHERE id = ?2 AND lease_token = ?7 AND lease_until > ?6
       AND status IN ('waiting','running','waiting_for_device')`,
  )
    .bind(
      runId,
      automation.id,
      automation.user_id,
      automation.run_count + 1,
      triggerPayload,
      now,
      automation.lease_token,
    )
    .run();
  state.run_id = runId;
  state.phase = "idle";
  state.step_index = 0;
  await persistRuntime(env, automation, state, automation.status, now, null, { retainLease: true, event: "run_started" });
  return state;
}

async function markRunFinished(
  env: AutomationEnv,
  automation: AutomationRow,
  state: RuntimeState,
  status: string,
  exitCode: number | null,
  error: string | null,
) {
  if (!state.run_id) return;
  await finishAutomationRunWithUsage(env.DB, {
    run_id: state.run_id,
    automation_id: automation.id,
    user_id: automation.user_id,
    lease_token: automation.lease_token,
    status,
    exit_code: exitCode,
    error,
    finished_at: nowIso(),
  });
}

async function persistRuntime(
  env: AutomationEnv, automation: AutomationRow, state: RuntimeState,
  status: AutomationStatus, nextRunAt: string | null, lastError: string | null = null,
  extra?: { incrementRun?: boolean; retainLease?: boolean; event?: string; summary?: string },
) {
  await checkpointTask(env.DB, automation, state, status, nextRunAt, lastError, extra);
  if (isTerminalStatus(status) || status === "paused" || extra?.incrementRun) {
    await setTaskKeepAwake(env, automation, 0).catch(() => undefined);
  }
}

async function automationCall(env: AutomationEnv, automation: AutomationRow,
  state: RuntimeState, tool: string, args: Record<string, unknown>, phase?: RuntimeState["phase"]) {
  await renewTaskLease(env.DB, automation);
  const plan = parseJson<ActionPlan>(automation.action_json, { steps: [] });
  await requireTaskPermission(env.DB, automation.user_id, automation.device_id!, automation.kind,
    parseJson<GoalSpec | null>(automation.goal_json, null), parseJson<TriggerSpec | null>(automation.trigger_json, null), plan.keep_awake);
  // Recheck the frozen policy immediately before dispatch, including after a
  // slow planner response. The device enforces current local policy again.
  const policy = await devicePolicySnapshot(env, automation.user_id, automation.device_id!);
  if (!policy || stableJson(policy) !== automation.permission_snapshot_json) {
    throw new Error("Device permission policy changed; automation stopped instead of waiting for approval.");
  }
  const effect = ["start_process", "write_file", "edit_block", "goal_workspace"].includes(tool);
  if (effect && state.planned) {
    const budget = timeBudget(state.planned, nowIso(), automation.expires_at);
    if (budget.hard_stop || (budget.finalization_due && !state.planned.finalizing) ||
      (state.planned.finalizing && ["write_file", "edit_block"].includes(tool))) {
      throw new Error("Planned goal time boundary prevents new effects; finalize the saved checkpoint.");
    }
  }
  if (effect) {
    state.inflight_action = { id: crypto.randomUUID(), tool };
    await persistRuntime(env, automation, state, automation.status, nowIso(), null,
      { retainLease: true, event: "action_intent", summary: "Dispatch " + tool + " (outcome not yet acknowledged)." });
  }
  let result: unknown;
  try {
    result = unwrapAutomationResult(await callDevice(env, automationIdentity(automation, env), automation.device_id!, tool, args,
      ["read_file", "read_binary_file", "list_directory", "get_file_info", "write_file", "edit_block", "start_process"].includes(tool) ? state.planned?.workspace?.path : undefined));
    if (tool === "read_binary_file") {
      await recordPlusUsage(env, automation.user_id, { binary_bytes: binaryBytesRead(result) });
    }
  } catch (error) {
    if (effect) {
      if (isDeviceCallTimeoutError(error)) {
        // The call may have executed before its reply was lost. Preserve the
        // unresolved intent and pause; never re-dispatch a build or file edit.
        if (state.agent) state.agent.observation = "Unacknowledged " + tool + ": inspect the device before retrying.";
        if (state.planned) {
          // Planned goals preserve a fenced, read-only inspection path.
          // No unacknowledged side effect can be replayed automatically.
          state.planned.inspection_required = true;
          state.planned.slice = undefined;
          state.planned.candidate = { ...state.planned.candidate, status: "unknown",
            evidence: "Device response timed out after dispatching " + tool + "." };
          state.inflight_action = undefined;
          await persistRuntime(env, automation, state, automation.status, nowIso(), null,
            { retainLease: true, event: "outcome_unknown",
              summary: "Unacknowledged " + tool + "; planned goal requires read-only inspection." });
          throw error;
        }
        await persistRuntime(env, automation, state, "paused", null,
          "Device call timed out after dispatching " + tool + "; outcome unknown. Inspect the device before creating another task.",
          { event: "outcome_unknown", summary: "Paused unacknowledged " + tool + "; no automatic replay." });
        throw new UncertainDeviceDispatchError(tool);
      }
      state.inflight_action = undefined;
      if (state.agent) state.agent.observation = "Tool " + tool + " did not return a successful acknowledgement. Inspect current state before repeating: " + String(error);
      if (state.planned && !isDeviceOfflineError(error)) {
        state.planned.inspection_required = true;
        state.planned.slice = undefined;
        state.planned.candidate = { ...state.planned.candidate, status: "unknown",
          evidence: "Unacknowledged " + tool + ": " + String(error).slice(0, 2000) };
      }
      await persistRuntime(env, automation, state, automation.status, nowIso(), null,
        { retainLease: true, event: "action_error", summary: "Dispatch failed or outcome unknown: " + tool });
    }
    throw error;
  }
  try { await renewTaskLease(env.DB, automation); }
  catch (error) {
    // A process can start just as cancellation invalidates the lease. Clean up
    // the late handle; never write the stale result back into the task.
    const processId = (result as { process_id?: string })?.process_id;
    if (tool === "start_process" && processId) {
      await callDevice(env, automationIdentity(automation, env), automation.device_id!,
        "stop_process", { process_id: processId }).catch(() => undefined);
    }
    throw error;
  }
  if (tool === "start_process" && state.planned && timeBudget(state.planned, nowIso(), automation.expires_at).hard_stop) {
    const pid = (result as { process_id?: string })?.process_id;
    if (pid) await callDevice(env, automationIdentity(automation, env), automation.device_id!, "stop_process", { process_id: pid }).catch(() => undefined);
  }
  if (effect) {
    state.inflight_action = undefined;
    if (phase) state.phase = phase;
    if (tool === "start_process") state.process_id = (result as { process_id?: string }).process_id;
    if (state.agent) state.agent.observation = "Tool " + tool + " result:\n" + agentResultText(result);
    await persistRuntime(env, automation, state, automation.status, nowIso(), null,
      { retainLease: true, event: "action_result", summary: "Acknowledged " + tool });
  }
  return result;
}

export function unwrapAutomationResult(value: unknown): unknown {
  const response = value as { isError?: boolean; content?: { type: string; text?: string }[] } | null;
  if (!Array.isArray(response?.content)) return value;
  const messages = response.content.filter(c => c.type === "text" && typeof c.text === "string").map(c => c.text!);
  if (response.isError) throw new Error(messages.join("\n").slice(0, 4000) || "Device tool reported an error.");
  if (messages.length !== 1) return value;
  try { return JSON.parse(messages[0]!); } catch { return messages[0]; }
}

const processStatus = (value: unknown) => {
  const row = (value || {}) as {
    process_id?: string;
    status?: string;
    exit_code?: number | null;
  };
  return {
    processId: row.process_id || "",
    status: row.status || "unknown",
    exitCode: row.exit_code ?? null,
  };
};

const isDeviceOfflineError = (error: unknown) =>
  String(error instanceof Error ? error.message : error)
    .toLowerCase()
    .includes("device offline");

const isLostProcessError = (error: unknown) => {
  const text = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    text.includes("managed process not found") ||
    text.includes("retention window has expired")
  );
};

async function beginCommand(
  env: AutomationEnv,
  automation: AutomationRow,
  state: RuntimeState,
  command: string,
  cwd: string | undefined,
  phase: "step_running" | "goal_running" | "agent_process_running" | "agent_verify_running",
) {
  if (!automation.device_id) throw new Error("Automation device is missing.");
  const result = await automationCall(
    env,
    automation,
    state,
    "start_process",
    {
      command,
      ...(cwd ? { cwd } : {}),
      background: true,
    },
    phase,
  );
  const started = result as { process_id?: string };
  if (!started.process_id) throw new Error("Device did not return a process_id.");
  state.process_id = started.process_id;
  state.phase = phase;

  if (state.run_id) {
    await env.DB.prepare(
      `UPDATE automation_runs
       SET process_id = ?1
       WHERE id = ?2 AND automation_id = ?3 AND EXISTS (
         SELECT 1 FROM automations WHERE id = ?3 AND lease_token = ?4
         AND lease_until > ?5 AND status IN ('waiting','running','waiting_for_device'))`,
    )
      .bind(started.process_id, state.run_id, automation.id, automation.lease_token, nowIso())
      .run();
  }
}

function nextScheduleAfterRun(
  trigger: TriggerSpec,
  now: string,
) {
  if (trigger.type === "interval") return addSeconds(now, trigger.every_seconds);
  return null;
}

const clipAgentText = (value: string, max = 28000) =>
  value.length <= max ? value : value.slice(0, max) + "\n…[truncated]";

const agentResultText = (value: unknown) => {
  if (typeof value === "string") return clipAgentText(value);
  try {
    return clipAgentText(JSON.stringify(value, null, 2));
  } catch {
    return clipAgentText(String(value));
  }
};


async function updateRunSummary(
  env: AutomationEnv,
  automation: AutomationRow,
  runId: string | undefined,
  summary: string,
) {
  if (!runId) return;
  await env.DB.prepare(
    `UPDATE automation_runs
     SET output_summary = ?1
     WHERE id = ?2 AND automation_id = ?3
       AND EXISTS (SELECT 1 FROM automations WHERE id = ?3 AND lease_token = ?4
         AND lease_until > ?5 AND status IN ('waiting','running','waiting_for_device'))`,
  )
    .bind(clipAgentText(summary, 6000), runId, automation.id, automation.lease_token, nowIso())
    .run();
}

async function finishAgentRun(env: AutomationEnv, automation: AutomationRow, state: RuntimeState) {
  const continuation = await nextGoalRun(env, automation, state);
  await persistRuntime(env, automation, state, continuation.status, continuation.next, null,
    { incrementRun: true, event: "run_completed", summary: "Goal run completed; see saved run evidence." });
}

async function nextGoalRun(env: AutomationEnv, automation: AutomationRow, state: RuntimeState): Promise<{ status: AutomationStatus; next: string | null }> {
  const trigger = parseJson<TriggerSpec>(automation.trigger_json, { type: "immediate" });
  const goal = parseJson<AgentGoalSpec | null>(automation.goal_json, null);
  const now = nowIso();
  const recurring = ["interval", "webhook"].includes(trigger.type)
    && (automation.max_runs === 0 || automation.run_count + 1 < automation.max_runs)
    && (!goal?.plan?.time_policy.end_at || goal.plan.time_policy.end_at > now);
  if (!recurring) return { status: "completed", next: null };
  // Evidence stays in the run history and journal. Each new run receives fresh
  // phase, memory, iteration and elapsed-time budgets.
  state.planned = undefined;
  state.agent = { iteration: 0, memory: "", observation: "New triggered run. Inspect current workspace state before acting." };
  state.phase = "idle";
  state.trigger = trigger.type === "webhook" ? await takeQueuedEvent(env, automation.id) ?? undefined : undefined;
  return trigger.type === "webhook" ? { status: state.trigger ? "waiting" : "waiting_for_event", next: state.trigger ? now : null }
    : { status: "waiting", next: nextScheduleAfterRun(trigger, now) };
}

async function executeAgentGoal(
  env: AutomationEnv,
  automation: AutomationRow,
  goal: AgentGoalSpec,
  state: RuntimeState,
) {
  if (!automation.device_id) throw new Error("Agent Goal device is missing.");
  const now = nowIso();
  const identity = automationIdentity(automation, env);
  state.agent ||= {
    iteration: 0,
    memory: "",
    observation: "Initial turn. Inspect the workspace and choose the first bounded action.",
  };

  if (
    state.process_id &&
    (state.phase === "agent_process_running" ||
      state.phase === "agent_verify_running")
  ) {
    let rawStatus: unknown;
    try {
      rawStatus = await automationCall(
        env,
        automation,
        state,
        "process_status",
        { process_id: state.process_id },
      );
    } catch (error) {
      if (error instanceof LeaseLostError) throw error;
      if (isDeviceOfflineError(error)) {
        await persistRuntime(
          env,
          automation,
          state,
          "waiting_for_device",
          addSeconds(now, automation.interval_seconds),
          "Device offline; the Agent Goal will resume after reconnect.",
        );
        return;
      }
      if (isDeviceCallTimeoutError(error)) {
        // The managed PID is still authoritative. Retry the *read-only*
        // status query on the next tick; never run start_process again.
        await persistRuntime(env, automation, state, "waiting",
          addSeconds(now, automation.interval_seconds),
          "Device status query timed out; managed process is not known to have failed. Retrying status only.",
          { event: "process_poll_retry", summary: "Transient status timeout; preserved managed process handle." });
        return;
      }
      if (isLostProcessError(error)) {
        state.process_id = undefined;
        state.phase = "idle";
        state.agent.observation =
          "The local agent restarted and the managed process handle was lost. The previous command outcome is unknown. Re-inspect the current state before deciding whether to rerun anything.";
        await persistRuntime(
          env,
          automation,
          state,
          "waiting",
          addSeconds(now, automation.interval_seconds),
          "Managed process state was lost after reconnect; the Agent Goal will re-inspect and continue automatically.",
        );
        return;
      }
      throw error;
    }

    const status = processStatus(rawStatus);
    if (status.status === "running") {
      await persistRuntime(
        env,
        automation,
        state,
        "running",
        addSeconds(now, automation.interval_seconds),
      );
      return;
    }

    const processId = state.process_id;
    const wasVerify = state.phase === "agent_verify_running";
    const output = await automationCall(
      env,
      automation,
      state,
      "process_output",
      { process_id: processId },
    ).catch((error) => ({ error: String(error) }));

    state.process_id = undefined;
    state.phase = "idle";
    const exitCode = status.exitCode ?? 1;

    if (wasVerify && goal.verify && exitCode === goal.verify.expected_exit_code) {
      const evidence =
        "Deterministic verification succeeded with exit code " + exitCode + ".\n" +
        agentResultText(output);
      state.agent.completion_evidence = clipAgentText(evidence, 3000);
      await updateRunSummary(env, automation, state.run_id, evidence);
      await markRunFinished(env, automation, state, "completed", exitCode, null);
      state.run_id = undefined;
      await finishAgentRun(env, automation, state);
      return;
    }

    state.agent.observation = clipAgentText(
      (wasVerify ? "Goal verification" : "Command") +
        " finished with exit code " +
        exitCode +
        ".\n" +
        agentResultText(output),
    );
  }

  const planningStarted = Date.now();
  for (let localStep = 0; localStep < 3 && Date.now() - planningStarted < 45_000; localStep += 1) {
    if (state.agent.iteration >= goal.max_iterations) {
      const message =
        "Agent Goal reached its maximum of " +
        goal.max_iterations +
        " planning iterations without verified completion.";
      await markRunFinished(env, automation, state, "failed", null, message);
      state.run_id = undefined;
      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        message,
        { incrementRun: true },
      );
      return;
    }

    await renewTaskLease(env.DB, automation);
    const decision = goal.controller === "source"
      ? await takeSourceDecision(env.DB, automation)
      : await planAgentTurn(env, {
      objective: goal.objective,
      successCriteria: goal.success_criteria,
      workspace: goal.workspace,
      iteration: state.agent.iteration + 1,
      maxIterations: goal.max_iterations,
      allowedTools: goal.allowed_tools,
      memory: state.agent.memory,
      observation: state.agent.observation,
    });
    if (goal.controller !== "source" && decision) {
      await recordPlusUsage(env, automation.user_id, { planner_turns: 1 });
    }
    if (!decision) {
      state.phase = "awaiting_agent";
      await persistRuntime(env, automation, state, "waiting_for_event", null, null,
        { event: "needs_agent", summary: "Source agent can read the current context and submit the next decision." });
      return;
    }
    state.phase = "idle";
    state.retry_count = 0;
    await renewTaskLease(env.DB, automation);
    state.agent.iteration += 1;
    state.agent.memory = decision.memory;
    state.agent.last_decision_summary = decision.decisionSummary;
    await updateRunSummary(
      env,
      automation,
      state.run_id,
      "Iteration " +
        state.agent.iteration +
        ": " +
        decision.decisionSummary +
        (decision.completionEvidence
          ? "\nEvidence: " + decision.completionEvidence
          : ""),
    );

    await persistRuntime(env, automation, state, automation.status, nowIso(), null,
      { retainLease: true, event: "decision", summary: decision.decisionSummary });

    if (decision.decision === "pause") {
      await persistRuntime(
        env,
        automation,
        state,
        "paused",
        null,
        decision.decisionSummary || "Agent Goal paused because it is blocked.",
      );
      return;
    }

    if (decision.decision === "complete") {
      if (!decision.completionEvidence.trim()) {
        state.agent.observation = "Completion requires concrete evidence for the success criteria. Inspect or verify before completing.";
        await persistRuntime(env, automation, state, "waiting", addSeconds(now, automation.interval_seconds), null,
          { event: "verification_required", summary: state.agent.observation });
        return;
      }
      state.agent.completion_evidence = decision.completionEvidence;
      if (goal.verify) {
        try {
          await beginCommand(
            env,
            automation,
            state,
            goal.verify.command,
            goal.verify.cwd,
            "agent_verify_running",
          );
        } catch (error) {
          if (isDeviceOfflineError(error)) {
            state.agent.observation =
              "The device went offline before deterministic goal verification.";
            await persistRuntime(
              env,
              automation,
              state,
              "waiting_for_device",
              addSeconds(now, automation.interval_seconds),
              state.agent.observation,
            );
            return;
          }
          throw error;
        }
        await persistRuntime(
          env,
          automation,
          state,
          "running",
          addSeconds(now, automation.interval_seconds),
        );
        return;
      }

      await markRunFinished(env, automation, state, "completed", 0, null);
      state.run_id = undefined;
      await finishAgentRun(env, automation, state);
      return;
    }

    if (decision.tool === "none") {
      throw new Error("Agent planner chose a tool decision without a tool.");
    }
    if (!goal.allowed_tools.includes(decision.tool)) {
      throw new Error("Agent planner selected a tool outside the approved Agent Goal scope.");
    }

    const args = validateAgentToolArguments(decision.tool, decision.arguments);
    if (decision.tool === "start_process") {
      try {
        const started = await automationCall(
          env,
          automation,
          state,
          "start_process",
          args,
          "agent_process_running",
        ) as { process_id?: string };
        if (!started.process_id) {
          throw new Error("Device did not return a process_id.");
        }
        state.process_id = started.process_id;
        state.phase = "agent_process_running";
        if (state.run_id) {
          await env.DB.prepare(
            `UPDATE automation_runs SET process_id = ?1 WHERE id = ?2 AND automation_id = ?3 AND EXISTS (SELECT 1 FROM automations WHERE id = ?3 AND lease_token = ?4 AND lease_until > ?5 AND status IN ('waiting','running','waiting_for_device'))`,
          )
            .bind(started.process_id, state.run_id, automation.id, automation.lease_token, nowIso())
            .run();
        }
      } catch (error) {
        if (isDeviceOfflineError(error)) {
          state.agent.observation =
            "The device went offline before the planned command could start.";
          await persistRuntime(
            env,
            automation,
            state,
            "waiting_for_device",
            addSeconds(now, automation.interval_seconds),
            state.agent.observation,
          );
          return;
        }
        throw error;
      }
      await persistRuntime(
        env,
        automation,
        state,
        "running",
        addSeconds(now, automation.interval_seconds),
      );
      return;
    }

    let result: unknown;
    try {
      result = await automationCall(
        env,
        automation,
        state,
        decision.tool,
        args,
      );
    } catch (error) {
      if (error instanceof LeaseLostError) throw error;
      if (isDeviceOfflineError(error)) {
        state.agent.observation =
          "The device went offline before tool " + decision.tool + " completed.";
        await persistRuntime(
          env,
          automation,
          state,
          "waiting_for_device",
          addSeconds(now, automation.interval_seconds),
          state.agent.observation,
        );
        return;
      }
      state.agent.observation =
        "Tool " + decision.tool + " failed or its outcome is unknown. Inspect current state before repeating: " +
        String(error instanceof Error ? error.message : error);
      await persistRuntime(env, automation, state, automation.status, nowIso(), null, { retainLease: true, event: "observation", summary: state.agent.observation });
      continue;
    }

    state.agent.observation =
      "Tool " + decision.tool + " result:\n" + agentResultText(result);
    await persistRuntime(env, automation, state, automation.status, nowIso(), null, { retainLease: true, event: "observation", summary: "Result available for " + decision.tool });
  }

  await persistRuntime(
    env,
    automation,
    state,
    "waiting",
    addSeconds(now, automation.interval_seconds),
    null,
  );
}

async function executeAutomation(
  env: AutomationEnv,
  automation: AutomationRow,
) {
  const now = nowIso();

  if (automation.expires_at && automation.expires_at <= now) {
    const state = parseJson<RuntimeState>(automation.state_json, {});
    await markRunFinished(env, automation, state, "expired", null, "Automation expired.");
    await persistRuntime(env, automation, state, "expired", null, "Automation expired.");
    return;
  }

  const action = parseJson<ActionPlan>(automation.action_json, { steps: [] });
  const goal = parseJson<GoalSpec | null>(automation.goal_json, null);
  const trigger = parseJson<TriggerSpec>(automation.trigger_json, {
    type: "immediate",
  });
  let state = parseJson<RuntimeState>(automation.state_json, {
    phase: "idle",
    step_index: 0,
  });
  const cloudOnly =
    action.steps.length > 0 &&
    action.steps.every((step) => step.type === "github_merge_pr");

  if (!cloudOnly) {
    await requireTaskPermission(env.DB, automation.user_id, automation.device_id!, automation.kind, goal, trigger, action.keep_awake);
    if (!automation.device_id) {
      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        "Automation device was removed.",
      );
      return;
    }

    const currentPolicy = await devicePolicySnapshot(
      env,
      automation.user_id,
      automation.device_id,
    );
    if (!currentPolicy) {
      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        "Automation device was revoked or removed.",
      );
      return;
    }

    if (stableJson(currentPolicy) !== (automation.permission_snapshot_json || "")) {
      if (state.process_id) {
        await callDevice(
          env,
          automationIdentity(automation, env),
          automation.device_id,
          "stop_process",
          { process_id: state.process_id },
        ).catch(() => undefined);
      }
      await markRunFinished(
        env,
        automation,
        state,
        "failed",
        null,
        "Device permissions changed while this unattended automation was active.",
      );
      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        "Device permissions changed; unattended execution stopped instead of waiting for approval.",
      );
      return;
    }
  }

  if (state.inflight_action) {
    const tool = state.inflight_action.tool;
    state.inflight_action = undefined;
    const message = "Previous dispatch of " + tool + " has an unknown outcome after interruption. Inspect current state before repeating it.";
    if (goal?.type === "agent_goal") {
      state.agent ||= { iteration: 0, memory: "", observation: "" };
      state.agent.observation = message;
      if (state.planned) {
        state.planned.needs_reasoning = message;
        state.planned.inspection_required = true;
        state.planned.slice = undefined;
        state.planned.candidate = { ...state.planned.candidate, status: "unknown", evidence: message };
      }
      state.phase = "idle";
      await persistRuntime(env, automation, state, "waiting", nowIso(), message, { event: "outcome_unknown" });
    } else {
      // The intent may already have executed. Pausing retains the evidence
      // without authorizing a second invocation on a later scheduler tick.
      await persistRuntime(env, automation, state, "paused", null, message,
        { event: "outcome_unknown", summary: "Manual inspection required before replay." });
    }
    return;
  }

  if (!state.run_id) {
    state = await startRun(env, automation, state);
  }

  if (action.keep_awake) {
    try { await setTaskKeepAwake(env, automation, 180); }
    catch (error) {
      if (!isDeviceOfflineError(error)) throw error;
      await persistRuntime(env, automation, state, "waiting_for_device", addSeconds(now, automation.interval_seconds), "Waiting for device to acquire task keep-awake.");
      return;
    }
  }

  if (goal?.type === "agent_goal") {
    if (goal.plan) {
      await executePlannedGoal(env, automation, goal, state, {
        call: (tool, args) => automationCall(env, automation, state, tool, args,
          tool === "start_process" ? "planned_process_running" : undefined),
        save: (status, next, error, event, retainLease = false) => persistRuntime(env, automation, state, status, next, error,
          { event, summary: error || state.agent?.last_decision_summary || event, retainLease }),
        finish: async (summary, status) => {
          await updateRunSummary(env, automation, state.run_id, summary);
          await markRunFinished(env, automation, state, status, null, status === "completed" ? null : summary.slice(0, 1000));
          state.run_id = undefined;
          const continuation = status === "completed" ? await nextGoalRun(env, automation, state) : { status, next: null };
          await persistRuntime(env, automation, state, continuation.status, continuation.next, null,
            { incrementRun: true, event: status === "completed" ? "run_completed" : status, summary: summary.slice(0, 6000) });
        },
      });
      return;
    }
    await executeAgentGoal(env, automation, goal, state);
    return;
  }

  const identity = automationIdentity(automation, env);

  if (
    automation.device_id &&
    state.process_id &&
    (state.phase === "step_running" || state.phase === "goal_running")
  ) {
    let rawStatus: unknown;
    try {
      rawStatus = await automationCall(
        env,
        automation,
        state,
        "process_status",
        { process_id: state.process_id },
      );
    } catch (error) {
      if (error instanceof LeaseLostError) throw error;
      if (isDeviceOfflineError(error)) {
        await persistRuntime(
          env,
          automation,
          state,
          "waiting_for_device",
          addSeconds(now, automation.interval_seconds),
          "Device offline; the task will resume when it reconnects.",
        );
        return;
      }
      if (isDeviceCallTimeoutError(error)) {
        // The managed PID is still authoritative. Retry the *read-only*
        // status query on the next tick; never run start_process again.
        await persistRuntime(env, automation, state, "waiting",
          addSeconds(now, automation.interval_seconds),
          "Device status query timed out; managed process is not known to have failed. Retrying status only.",
          { event: "process_poll_retry", summary: "Transient status timeout; preserved managed process handle." });
        return;
      }
      if (isLostProcessError(error)) {
        if (action.recovery !== "fail") {
          state.process_id = undefined;
          state.phase = "idle";
          await persistRuntime(
            env,
            automation,
            state,
            "waiting",
            addSeconds(now, automation.interval_seconds),
            "Process handle was lost after an agent restart; this unattended task will restart the current attempt automatically.",
          );
          return;
        }
        await markRunFinished(
          env,
          automation,
          state,
          "failed",
          null,
          "Managed process state was lost after reconnect and this task is configured to fail instead of restart.",
        );
        await persistRuntime(
          env,
          automation,
          state,
          "failed",
          null,
          "Managed process state was lost after reconnect; unattended recovery policy is fail.",
        );
        return;
      }
      throw error;
    }

    const status = processStatus(rawStatus);
    if (status.status === "running") {
      await persistRuntime(
        env,
        automation,
        state,
        "running",
        addSeconds(now, automation.interval_seconds),
      );
      return;
    }

    const exitCode = status.exitCode ?? 1;
    const wasGoal = state.phase === "goal_running";
    state.process_id = undefined;
    state.phase = "idle";

    if (wasGoal) {
      if (goal?.type === "command_exit" && exitCode === goal.expected_exit_code) {
        await markRunFinished(env, automation, state, "completed", exitCode, null);
        state.run_id = undefined;
        await persistRuntime(
          env,
          automation,
          state,
          "completed",
          null,
          null,
          { incrementRun: true },
        );
        return;
      }

      await markRunFinished(
        env,
        automation,
        state,
        "goal_not_reached",
        exitCode,
        `Goal verification exited with code ${exitCode}.`,
      );
      state.run_id = undefined;
      state.step_index = 0;
      const nextCount = automation.run_count + 1;
      if (automation.max_runs > 0 && nextCount >= automation.max_runs) {
        await persistRuntime(
          env,
          automation,
          state,
          "failed",
          null,
          `Goal was not reached after ${nextCount} attempt(s).`,
          { incrementRun: true },
        );
        return;
      }
      await persistRuntime(
        env,
        automation,
        state,
        "waiting",
        addSeconds(now, automation.interval_seconds),
        "Goal not reached; next attempt is scheduled.",
        { incrementRun: true },
      );
      return;
    }

    if (exitCode !== 0) {
      await markRunFinished(
        env,
        automation,
        state,
        "failed",
        exitCode,
        `Command exited with code ${exitCode}.`,
      );
      state.run_id = undefined;
      state.step_index = 0;

      if (automation.kind === "goal_loop") {
        const nextCount = automation.run_count + 1;
        if (automation.max_runs > 0 && nextCount >= automation.max_runs) {
          await persistRuntime(
            env,
            automation,
            state,
            "failed",
            null,
            `Work step failed after ${nextCount} attempt(s).`,
            { incrementRun: true },
          );
          return;
        }
        await persistRuntime(
          env,
          automation,
          state,
          "waiting",
          addSeconds(now, automation.interval_seconds),
          `Work step exited with code ${exitCode}; retrying the goal loop.`,
          { incrementRun: true },
        );
        return;
      }

      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        `Command exited with code ${exitCode}.`,
        { incrementRun: true },
      );
      return;
    }

    state.step_index = (state.step_index || 0) + 1;
  }

  const stepIndex = state.step_index || 0;
  if (stepIndex < action.steps.length) {
    const step = action.steps[stepIndex]!;
    if (step.type === "github_merge_pr") {
      const permitted = await authorizeGitHubAction(env, automation.user_id, step);
      await renewTaskLease(env.DB, automation);
      state.inflight_action = { id: crypto.randomUUID(), tool: "github_merge_pr" };
      await persistRuntime(env, automation, state, automation.status, nowIso(), null,
        { retainLease: true, event: "action_intent", summary: "Dispatch authorized GitHub merge; outcome pending." });
      const result = await mergeGitHubPullRequest(env, permitted);
      await renewTaskLease(env.DB, automation);
      state.inflight_action = undefined;
      state.step_index = stepIndex + 1;
      await persistRuntime(env, automation, state, automation.status, nowIso(), null, { retainLease: true, event: "action_result", summary: "GitHub merge acknowledged." });
      await updateRunSummary(
        env,
        automation,
        state.run_id,
        "GitHub pull request merged: " +
          result.repository +
          "#" +
          result.pull_number +
          (result.sha ? " @ " + result.sha : ""),
      );
    } else {
      try {
        await beginCommand(
          env,
          automation,
          state,
          step.command,
          step.cwd,
          "step_running",
        );
      } catch (error) {
        if (isDeviceOfflineError(error)) {
          await persistRuntime(
            env,
            automation,
            state,
            "waiting_for_device",
            addSeconds(now, automation.interval_seconds),
            "Device offline; waiting to start the command.",
          );
          return;
        }
        throw error;
      }

      await persistRuntime(
        env,
        automation,
        state,
        "running",
        addSeconds(now, automation.interval_seconds),
      );
      return;
    }
  }

  if (goal?.type === "command_exit") {
    try {
      await beginCommand(
        env,
        automation,
        state,
        goal.command,
        goal.cwd,
        "goal_running",
      );
    } catch (error) {
      if (error instanceof LeaseLostError) throw error;
      if (isDeviceOfflineError(error)) {
        await persistRuntime(
          env,
          automation,
          state,
          "waiting_for_device",
          addSeconds(now, automation.interval_seconds),
          "Device offline; waiting to verify the goal.",
        );
        return;
      }
      throw error;
    }

    await persistRuntime(
      env,
      automation,
      state,
      "running",
      addSeconds(now, automation.interval_seconds),
    );
    return;
  }

  await markRunFinished(env, automation, state, "completed", 0, null);
  state.run_id = undefined;
  state.step_index = 0;
  state.phase = "idle";
  state.trigger = undefined;

  const nextCount = automation.run_count + 1;
  if (automation.kind === "condition_watch") {
    const done = automation.max_runs > 0 && nextCount >= automation.max_runs;
    const queued = done ? null : await takeQueuedEvent(env, automation.id);
    if (queued) state.trigger = queued;
    await persistRuntime(
      env,
      automation,
      state,
      done ? "completed" : queued ? "waiting" : "waiting_for_event",
      queued ? now : null,
      null,
      { incrementRun: true },
    );
    return;
  }

  if (automation.kind === "schedule_watch") {
    const done = automation.max_runs > 0 && nextCount >= automation.max_runs;
    const nextRun = done ? null : nextScheduleAfterRun(trigger, now);
    await persistRuntime(
      env,
      automation,
      state,
      done || !nextRun ? "completed" : "waiting",
      nextRun,
      null,
      { incrementRun: true },
    );
    return;
  }

  await persistRuntime(
    env,
    automation,
    state,
    "completed",
    null,
    null,
    { incrementRun: true },
  );
}

async function setTaskKeepAwake(env: AutomationEnv, automation: AutomationRow, seconds: number) {
  if (!automation.device_id || !parseJson<ActionPlan>(automation.action_json, { steps: [] }).keep_awake) return;
  const result = await callDevice(env, automationIdentity(automation, env), automation.device_id,
    "set_task_keep_awake", { task_id: automation.id, seconds }) as { supported?: boolean; active?: boolean };
  if (seconds > 0 && (!result.supported || !result.active)) throw new Error("This computer could not acquire its task keep-awake lease. Check the local OS power service.");
}

async function maintainTaskKeepAwake(env: AutomationEnv) {
  const active = await env.DB.prepare(`SELECT * FROM automations WHERE device_id IS NOT NULL
    AND status IN ('waiting','running','waiting_for_device','waiting_for_event')
    AND json_extract(action_json,'$.keep_awake') = 1 AND json_extract(state_json,'$.run_id') IS NOT NULL
    AND (expires_at IS NULL OR expires_at > ?1) ORDER BY updated_at LIMIT 100`)
    .bind(nowIso()).all<AutomationRow>();
  for (const task of active.results) {
    try {
      await requireAutomationEntitlements(env, task.user_id, task);
      await requireTaskPermission(
        env.DB,
        task.user_id,
        task.device_id!,
        task.kind,
        parseJson<GoalSpec | null>(task.goal_json, null),
        parseJson<TriggerSpec | null>(task.trigger_json, null),
        true,
      );
      await setTaskKeepAwake(env, task, 180);
    } catch (error) {
      if (isPlanUpgradeRequiredError(error)) {
        await setTaskKeepAwake(env, task, 0).catch(() => undefined);
        await updateAutomationStatus(
          env,
          task.user_id,
          task.id,
          "paused",
          null,
          error.message.slice(0, 1000),
          "Account plan no longer authorizes this Task; keep-awake was released.",
        ).catch(() => undefined);
      }
    }
  }
}

async function claimAutomation(
  env: AutomationEnv,
  automation: AutomationRow,
  now: string,
) {
  const leaseToken = randomToken(12);
  const leaseUntil = addSeconds(now, 150);
  await env.DB.prepare(
    `UPDATE automations
     SET status = CASE WHEN status = 'waiting_for_event' THEN 'waiting' ELSE status END,
         lease_token = ?1,
         lease_until = ?2,
         updated_at = ?3
     WHERE id = ?4
       AND (status IN ('waiting','running','waiting_for_device') OR
         (status = 'waiting_for_event' AND json_extract(state_json,'$.planned.version') = 1))
       AND next_run_at IS NOT NULL AND next_run_at <= ?3
       AND (expires_at IS NULL OR expires_at > ?3)
       AND (lease_until IS NULL OR lease_until <= ?3)`,
  )
    .bind(leaseToken, leaseUntil, now, automation.id)
    .run();

  return env.DB.prepare(
    `SELECT * FROM automations
     WHERE id = ?1 AND lease_token = ?2`,
  )
    .bind(automation.id, leaseToken)
    .first<AutomationRow>();
}

export async function runAutomationTick(
  env: AutomationEnv,
  at = new Date(),
  onlyAutomationId?: string,
) {
  const now = at.toISOString();
  await maintainTaskKeepAwake(env);

  const expiring = await env.DB.prepare(
    `SELECT *
     FROM automations
     WHERE expires_at IS NOT NULL
       AND expires_at <= ?1
       AND status NOT IN ('completed','failed','cancelled','expired')
     LIMIT 50`,
  )
    .bind(now)
    .all<AutomationRow>();

  for (const automation of expiring.results) {
    const state = parseJson<RuntimeState>(automation.state_json, {});
    if (state.planned) {
      const planned = state.planned;
      if (planned.active_phase) finishPhase(planned, "partial", now, "Hard task expiry interrupted unfinished phase.", "Requires inspection after deadline.");
      planned.finalizing = true; planned.finished_at = now;
      if (planned.slice) planned.checks.push({ name: "unfinished-final-checks", exit_code: null, passed: false, evidence: "Hard expiry prevents further execution.", at: now });
      planned.slice = undefined;
      planned.needs_reasoning = "Hard expiry: inspect any unaccepted candidate; pending checks were not executed.";
      planned.report = plannedReport(planned);
    }
    const expired = await env.DB.prepare(`UPDATE automations SET status = 'expired',
      next_run_at = NULL, lease_token = NULL, lease_until = NULL,
      state_json = ?3, revision = revision + 1, last_error = 'Automation expired.', updated_at = ?2
      WHERE id = ?1 AND expires_at <= ?2 AND revision = ?4
        AND status NOT IN ('completed','failed','cancelled','expired')`)
      .bind(automation.id, now, JSON.stringify(state), automation.revision).run();
    if (!expired.meta.changes) continue;
    await setTaskKeepAwake(env, automation, 0).catch(() => undefined);
    await env.DB.prepare(`UPDATE automation_runs SET status = 'expired', finished_at = ?2,
      error = 'Automation expired.' WHERE automation_id = ?1 AND finished_at IS NULL`)
      .bind(automation.id, now).run();
    await journalStatement(env.DB, automation, "expired", "Automation expired.", state.run_id, automation.revision + 1).run();
    if (state.process_id && automation.device_id) {
      await callDevice(env, automationIdentity(automation, env), automation.device_id,
        "stop_process", { process_id: state.process_id }).catch(() => undefined);
    }
  }

  const due = await env.DB.prepare(
    `SELECT *
     FROM automations
     WHERE (status IN ('waiting','running','waiting_for_device') OR
       (status = 'waiting_for_event' AND json_extract(state_json,'$.planned.version') = 1))
       AND next_run_at IS NOT NULL
       AND next_run_at <= ?1
       AND (expires_at IS NULL OR expires_at > ?1)
       AND (?2 IS NULL OR id = ?2)
     ORDER BY next_run_at ASC
     LIMIT 20`,
  )
    .bind(now, onlyAutomationId || null)
    .all<AutomationRow>();

  let executed = 0;
  let failed = 0;
  const tickStarted = Date.now();

  for (const candidate of due.results) {
    if (Date.now() - tickStarted >= 45_000) break;
    const automation = await claimAutomation(env, candidate, nowIso());
    if (!automation) continue;

    try {
      await requireAutomationEntitlements(env, automation.user_id, automation);
      await executeAutomation(env, automation);
      executed += 1;
    } catch (error) {
      if (error instanceof LeaseLostError || error instanceof UncertainDeviceDispatchError) continue;
      const message = error instanceof Error ? error.message : String(error);
      const state = parseJson<RuntimeState>(automation.state_json, {});
      if (isPlanUpgradeRequiredError(error)) {
        await setTaskKeepAwake(env, automation, 0).catch(() => undefined);
        await persistRuntime(
          env,
          automation,
          state,
          "paused",
          null,
          message.slice(0, 1000),
          { event: "paused", summary: "Account plan no longer authorizes this Task." },
        ).catch((failure) => { if (!(failure instanceof LeaseLostError)) throw failure; });
        continue;
      }
      failed += 1;
      if (error instanceof PlannerTransientError && (state.retry_count || 0) < 5) {
        state.retry_count = (state.retry_count || 0) + 1;
        await persistRuntime(env, automation, state, "waiting", addSeconds(nowIso(), Math.min(3600, 60 * 2 ** (state.retry_count - 1))),
          message.slice(0, 1000), { event: "retry", summary: "Transient planner error; retry " + state.retry_count }).catch((failure) => { if (!(failure instanceof LeaseLostError)) throw failure; });
        continue;
      }
      await markRunFinished(env, automation, state, "failed", null, message.slice(0, 1000));
      await persistRuntime(
        env,
        automation,
        state,
        "failed",
        null,
        message.slice(0, 1000),
      ).catch((failure) => { if (!(failure instanceof LeaseLostError)) throw failure; });
    }
  }

  return { checked: due.results.length, executed, failed };
}

function automationErrorResponse(error: unknown) {
  if (isPlanUpgradeRequiredError(error)) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        feature: error.feature,
        required_plan: error.required_plan,
      },
      { status: 403 },
    );
  }
  return Response.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: 400 },
  );
}

export async function handleAutomationCollection(
  request: Request,
  env: AutomationEnv,
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (request.method === "GET") {
    return Response.json({
      automations: await listAutomations(env, user.id),
      capabilities: {
        hosted_planner: agentPlannerConfigured(env),
        github_merge: githubAutomationConfigured(env),
        experimental_agent_goals: env.ENABLE_EXPERIMENTAL_AGENT_GOALS !== "0",
      },
      scheduler: await taskSchedulerHealth(env.DB, user.id),
    });
  }

  if (request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as CreateAutomationInput;
    try {
      const created = await createAutomation(env, user.id, body);
      return Response.json(created, { status: 201 });
    } catch (error) {
      return automationErrorResponse(error);
    }
  }

  return new Response("Method not allowed", { status: 405 });
}

export async function handleAutomationItem(
  request: Request,
  env: AutomationEnv,
  automationId: string,
  action?: string,
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  try {
    if (request.method === "GET" && !action) {
      const automation = await getAutomation(env, user.id, automationId);
      if (!automation) return Response.json({ error: "not_found" }, { status: 404 });
      const runs = await listAutomationRuns(env, user.id, automationId);
      return Response.json({ automation, runs });
    }

    if (request.method === "POST" && action === "pause") {
      return Response.json({
        automation: await pauseAutomation(env, user.id, automationId),
      });
    }
    if (request.method === "POST" && action === "resume") {
      return Response.json({
        automation: await resumeAutomation(env, user.id, automationId),
      });
    }
    if (request.method === "POST" && action === "cancel") {
      return Response.json({
        automation: await cancelAutomation(env, user.id, automationId),
      });
    }
    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    return automationErrorResponse(error);
  }
}
