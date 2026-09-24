export type DeviceMetadata = {
  id: string;
  name: string;
  platform: string;
  arch?: string;
  hostname?: string;
  agentVersion: string;
  connectedAt?: string;
  lastSeen?: string;
};

export type AgentHelloMessage = {
  type: "hello";
  device: DeviceMetadata;
  tools: string[];
};

export type AgentCallMessage = {
  type: "call";
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
};

export type AgentResultMessage = {
  type: "result";
  id: string;
  result?: unknown;
  error?: string;
};

export type RelayToAgentMessage = AgentCallMessage;
export type AgentToRelayMessage = AgentHelloMessage | AgentResultMessage;

export const DEFAULT_RELAY_URL = "wss://remote.samyao.me";
