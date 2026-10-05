export type DeviceMetadata = {
  id: string;
  name: string;
  platform: string;
  arch?: string;
  hostname?: string;
  agentVersion: string;
  pid?: number;
  backgroundProcess?: boolean;
  recoveryEnabled?: boolean;
  supervisorActive?: boolean;
  supervisorPid?: number | null;
  supervisorService?: string;
  connectedAt?: string;
  lastSeen?: string;
};

export type AgentHelloMessage = {
  type: "hello";
  device: DeviceMetadata;
  tools: string[];
  capabilities?: string[];
};

export type DeviceExecutionPolicy = {
  workspaceRoots?: string[];
  taskWorkspaceRoot?: string;
  protectSensitivePaths?: boolean;
  sensitivePaths?: string[];
  sensitiveAllowPaths?: string[];
  undoEnabled?: boolean;
};

export type AgentCallMessage = {
  type: "call";
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  policy?: DeviceExecutionPolicy;
};

export type AgentResultMessage = {
  type: "result";
  id: string;
  result?: unknown;
  error?: string;
};

export type RelayToAgentMessage = AgentCallMessage;
export type AgentToRelayMessage = AgentHelloMessage | AgentResultMessage;

export const DEFAULT_RELAY_URL = "wss://remotearc.app";


export type AccountPlan = "free" | "plus";

export type AccountFeature =
  | "binary_read"
  | "durable_tasks"
  | "scheduled_tasks"
  | "planned_agent_goals"
  | "keep_awake";

export const ACCOUNT_PLAN_FEATURES: Record<AccountPlan, readonly AccountFeature[]> = {
  free: [],
  plus: [
    "binary_read",
    "durable_tasks",
    "scheduled_tasks",
    "planned_agent_goals",
    "keep_awake",
  ],
};

export const ACCOUNT_PLAN_LABELS: Record<AccountPlan, string> = {
  free: "Free",
  plus: "Plus",
};

export function accountPlanHasFeature(
  plan: AccountPlan,
  feature: AccountFeature,
) {
  return ACCOUNT_PLAN_FEATURES[plan].includes(feature);
}
