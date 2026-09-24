import os from "node:os";
import process from "node:process";
import WebSocket from "ws";
import type {
  AgentCallMessage,
  AgentResultMessage,
  AgentToRelayMessage,
} from "@remote-link/protocol";
import { LocalMcpClient } from "./local-mcp.js";

const relayUrl = process.env.REMOTE_LINK_RELAY_URL || "wss://remote.samyao.me";
const token = process.env.REMOTE_LINK_AGENT_TOKEN;
const deviceId =
  process.env.REMOTE_LINK_DEVICE_ID ||
  os.hostname().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
const deviceName = process.env.REMOTE_LINK_DEVICE_NAME || os.hostname();

if (!token) {
  throw new Error("REMOTE_LINK_AGENT_TOKEN is required");
}

const mcp = new LocalMcpClient();
let stopped = false;
let reconnectMs = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectForever() {
  const tools = (await mcp.listTools()).tools.map((tool) => tool.name);

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
          agentVersion: "0.1.0",
        },
        tools,
      };

      ws.send(JSON.stringify(hello));
      process.stdout.write(
        `Remote Link agent connected: ${deviceName} (${deviceId}) -> ${relayUrl}\n`,
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
            const result = await mcp.callTool(message.tool, message.arguments);
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
        `Remote Link agent connection failed: ${error instanceof Error ? error.message : String(error)}\n`,
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
  await mcp.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await connectForever();
