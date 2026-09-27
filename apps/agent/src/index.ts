import "dotenv/config";
import os from "node:os";
import process from "node:process";
import WebSocket from "ws";
import type {
  AgentCallMessage,
  AgentResultMessage,
  AgentToRelayMessage,
} from "@remotearc/protocol";
import {
  RemoteArcExecutionCore,
  type ExecutionMode,
} from "@remotearc/execution-core";

const relayUrl = process.env.REMOTE_LINK_RELAY_URL || "wss://remotearc.app";
const token = process.env.REMOTE_LINK_DEVICE_TOKEN;
const deviceId =
  process.env.REMOTE_LINK_DEVICE_ID ||
  os.hostname().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
const deviceName = process.env.REMOTE_LINK_DEVICE_NAME || os.hostname();

const parseMode = (value: string | undefined): ExecutionMode => {
  if (value === "developer" || value === "full" || value === "managed") {
    return value;
  }
  return "safe";
};

if (!token) {
  throw new Error("REMOTE_LINK_DEVICE_TOKEN is required");
}

const core = new RemoteArcExecutionCore(
  parseMode(process.env.REMOTEARC_MODE || process.env.REMOTE_LINK_MODE),
);
let stopped = false;
let reconnectMs = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectForever() {
  const tools = core.listTools().map((tool) => tool.name);

  while (!stopped) {
    const url = new URL("/agent", relayUrl);
    url.searchParams.set("device", deviceId);

    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    try {
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });

      reconnectMs = 1000;

      const hello: AgentToRelayMessage = {
        type: "hello",
        device: {
          id: deviceId,
          name: deviceName,
          platform: process.platform,
          arch: process.arch,
          hostname: os.hostname(),
          agentVersion: "0.3.12",
        },
        tools,
        capabilities: ["native_core_v1", "device_policy_v1", "undo_history_v1"],
      };

      ws.send(JSON.stringify(hello));
      process.stdout.write(
        `Remote Arc agent connected: ${deviceName} (${deviceId}) -> ${relayUrl}\n`,
      );

      await new Promise<void>((resolve) => {
        ws.on("message", async (raw) => {
          let message: AgentCallMessage;
          try {
            message = JSON.parse(raw.toString()) as AgentCallMessage;
          } catch {
            return;
          }

          if (message.type !== "call") return;

          try {
            const result = await core.callTool(
              message.tool,
              message.arguments,
              message.policy,
            );
            const response: AgentResultMessage = {
              type: "result",
              id: message.id,
              result,
            };
            ws.send(JSON.stringify(response));
          } catch (error) {
            const response: AgentResultMessage = {
              type: "result",
              id: message.id,
              error: error instanceof Error ? error.message : String(error),
            };
            ws.send(JSON.stringify(response));
          }
        });

        ws.once("close", resolve);
        ws.once("error", resolve);
      });
    } catch (error) {
      process.stderr.write(
        `Remote Arc agent connection failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    } finally {
      ws.removeAllListeners();
      ws.close();
    }

    if (!stopped) {
      await sleep(reconnectMs);
      reconnectMs = Math.min(reconnectMs * 2, 30_000);
    }
  }
}

const shutdown = async () => {
  stopped = true;
  await core.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await connectForever();
