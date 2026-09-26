#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import WebSocket from "ws";
import {
  assertCommandAllowed,
  createUndoSnapshot,
  discardUndoSnapshot,
  finalizeUndoSnapshot,
  undoLastChange,
} from "./local-safety.js";

const VERSION = "0.3.6";
const DEFAULT_ORIGIN = "https://mcp.remotearc.app";
const CONFIG_DIR = path.join(os.homedir(), ".remotearc");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const LEGACY_CONFIG_PATH = path.join(os.homedir(), ".remote-link", "config.json");

type Mode = "managed" | "safe" | "developer";

type SavedConfig = {
  deviceId: string;
  deviceToken: string;
  deviceName: string;
  origin: string;
  mode: Mode;
};

type PairingStart = {
  device_code: string;
  device_secret: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
};

type PairingToken = {
  device_id: string;
  device_token: string;
  relay_url: string;
};

const SAFE_TOOLS = new Set([
  "list_directory",
  "read_file",
  "get_file_info",
  "list_processes",
]);

const DEVELOPER_TOOLS = new Set([
  ...SAFE_TOOLS,
  "start_process",
  "write_file",
  "edit_block",
  "undo_last_change",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, value: string) =>
  supportsColor ? `\x1b[${code}m${value}\x1b[0m` : value;
const dim = (value: string) => paint("2", value);
const cyan = (value: string) => paint("36", value);
const green = (value: string) => paint("32", value);
const yellow = (value: string) => paint("33", value);
const red = (value: string) => paint("31", value);
const bold = (value: string) => paint("1", value);

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function logLine(
  level: "info" | "success" | "warn" | "error" | "event",
  message: string,
) {
  const icon =
    level === "success" ? green("✓") :
    level === "warn" ? yellow("!") :
    level === "error" ? red("×") :
    level === "event" ? cyan("→") :
    cyan("•");
  process.stdout.write(`${dim(nowTime())}  ${icon}  ${message}\n`);
}

function banner() {
  process.stdout.write("\n");
  process.stdout.write(bold("Remote Arc") + "  " + dim(`v${VERSION}`) + "\n");
  process.stdout.write(dim("Secure remote MCP bridge") + "\n\n");
}

function argFlag(name: string) {
  return process.argv.includes(name);
}

function selectedMode(): Mode {
  if (argFlag("--safe")) return "safe";
  return "managed";
}

function isLocalSafeMode(mode: Mode) {
  return mode === "safe";
}

function modeLabel(mode: Mode) {
  return isLocalSafeMode(mode) ? "safe local cap" : "dashboard-managed";
}

async function readConfig(): Promise<SavedConfig | null> {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8")) as SavedConfig;
  } catch {
    try {
      const legacy = JSON.parse(
        await fs.readFile(LEGACY_CONFIG_PATH, "utf8"),
      ) as SavedConfig;
      await writeConfig(legacy);
      logLine("success", "Migrated existing Remote Link pairing to Remote Arc.");
      return legacy;
    } catch {
      return null;
    }
  }
}

async function writeConfig(config: SavedConfig) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600,
  });
}

async function resetConfig() {
  await Promise.all([
    fs.rm(CONFIG_PATH, { force: true }),
    fs.rm(LEGACY_CONFIG_PATH, { force: true }),
  ]);
  logLine("success", "Removed saved device credentials.");
}

function openBrowser(url: string) {
  const command =
    process.platform === "win32"
      ? "cmd"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32"
      ? ["/c", "start", "", url]
      : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

async function pair(origin: string, mode: Mode): Promise<SavedConfig> {
  const deviceName = os.hostname();
  const response = await fetch(origin + "/api/device/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_name: deviceName,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
    }),
  });

  if (!response.ok) {
    throw new Error("Could not start device pairing: " + response.status);
  }

  const pairing = (await response.json()) as PairingStart;

  banner();
  logLine("info", `Device: ${bold(deviceName)} · ${process.platform}/${process.arch} · ${modeLabel(mode)}`);
  logLine("event", "Pairing required — opening secure browser approval.");
  process.stdout.write("\n  Pairing code  " + bold(cyan(pairing.user_code)) + "\n");
  process.stdout.write("  " + dim(pairing.verification_uri_complete) + "\n\n");
  openBrowser(pairing.verification_uri_complete);
  logLine("info", "Waiting for authorization…");

  const startedAt = Date.now();
  while (Date.now() - startedAt < pairing.expires_in * 1000) {
    await sleep(Math.max(pairing.interval, 2) * 1000);

    const tokenResponse = await fetch(origin + "/api/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_code: pairing.device_code,
        device_secret: pairing.device_secret,
      }),
    });

    if (tokenResponse.status === 428) {
      if (process.stdout.isTTY) process.stdout.write(dim("·"));
      continue;
    }

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error("Pairing failed: " + body);
    }

    const result = (await tokenResponse.json()) as PairingToken;
    process.stdout.write("\n");
    logLine("success", "Device authorized.");

    const config: SavedConfig = {
      deviceId: result.device_id,
      deviceToken: result.device_token,
      deviceName,
      origin,
      mode,
    };
    await writeConfig(config);
    return config;
  }

  throw new Error("Pairing expired. Run Remote Arc again to retry.");
}

class ExecutionCore {
  private client: Client | null = null;

  constructor(private readonly mode: Mode) {}

  async connect() {
    if (this.client) return this.client;

    const client = new Client({
      name: "remotearc-cli-core",
      version: VERSION,
    });

    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const transport = new StdioClientTransport({
      command,
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      stderr: "inherit",
    });

    logLine("info", "Starting local execution core…");
    await client.connect(transport);
    this.client = client;
    logLine("success", "Local execution core ready.");
    return client;
  }

  async tools() {
    const list = await (await this.connect()).listTools();
    const locallyAvailable = isLocalSafeMode(this.mode) ? SAFE_TOOLS : DEVELOPER_TOOLS;
    const tools = list.tools.filter((tool) => locallyAvailable.has(tool.name));

    if (!isLocalSafeMode(this.mode)) {
      tools.push({
        name: "undo_last_change",
        description:
          "Undo the most recent reversible file change made through Remote Arc on this device. Snapshots stay on the device and expire automatically.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      });
    }

    return tools;
  }

  async call(name: string, args: Record<string, unknown>) {
    const locallyAvailable = isLocalSafeMode(this.mode) ? SAFE_TOOLS : DEVELOPER_TOOLS;
    if (!locallyAvailable.has(name)) {
      throw new Error("Tool blocked by local safety cap: " + name);
    }

    if (name === "undo_last_change") {
      const result = await undoLastChange();
      logLine("success", "Local Undo restored the latest reversible file change.");
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }

    if (name === "start_process") {
      assertCommandAllowed(String(args.command || ""));
    }

    const reversibleTool =
      name === "write_file" || name === "edit_block"
        ? (name as "write_file" | "edit_block")
        : null;
    const snapshot = reversibleTool
      ? await createUndoSnapshot(reversibleTool, args)
      : null;

    if (reversibleTool && !snapshot) {
      logLine("warn", "Local Undo is unavailable for this file change.");
    }

    try {
      const result = await (await this.connect()).callTool({
        name,
        arguments: args,
      });
      if (snapshot) {
        const finalized = await finalizeUndoSnapshot(snapshot);
        if (finalized) {
          logLine(
            "info",
            `Local Undo ready · ${dim(snapshot.id)} · kept on this device only`,
          );
        } else {
          logLine("warn", "Local Undo snapshot could not be finalized.");
        }
      }
      return result;
    } catch (error) {
      await discardUndoSnapshot(snapshot);
      throw error;
    }
  }

  async close() {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
  }
}

async function connectAgent(config: SavedConfig) {
  const core = new ExecutionCore(config.mode);
  banner();
  logLine("info", `Device: ${bold(config.deviceName)} · ${process.platform}/${process.arch}`);
  logLine(
    "info",
    `Permission profile: ${isLocalSafeMode(config.mode) ? green("safe local cap") : cyan("dashboard-managed")}`,
  );

  const tools = await core.tools();
  logLine("success", `Local tools ready: ${tools.length} exposed`);
  process.stdout.write("       " + dim(tools.map((tool) => tool.name).join(" · ")) + "\n");
  const wsUrl = new URL("/agent", config.origin.replace(/^http/, "ws"));

  let stopped = false;
  let backoff = 1000;

  const shutdown = async () => {
    stopped = true;
    await core.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopped) {
    logLine("event", `Connecting relay ${dim(wsUrl.host)}…`);
    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: "Bearer " + config.deviceToken,
      },
    });

    try {
      await new Promise<void>((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });

      backoff = 1000;
      ws.send(
        JSON.stringify({
          type: "hello",
          device: {
            id: config.deviceId,
            name: config.deviceName,
            platform: process.platform,
            arch: process.arch,
            hostname: os.hostname(),
            agentVersion: VERSION,
          },
          tools: tools.map((tool) => tool.name),
        }),
      );

      logLine("success", `Relay connected · ${bold(config.deviceName)} · ${config.mode} mode`);
      logLine("success", "Device presence published.");
      process.stdout.write("       " + dim(config.origin) + "\n");
      process.stdout.write("       " + dim("Ctrl+C to disconnect") + "\n\n");

      const sendHeartbeat = async () => {
        try {
          await fetch(new URL("/api/device/heartbeat", config.origin), {
            method: "POST",
            headers: { Authorization: "Bearer " + config.deviceToken },
          });
        } catch {
          // WebSocket reconnect logic remains the source of truth for connectivity.
        }
      };
      void sendHeartbeat();
      const heartbeatTimer = setInterval(() => void sendHeartbeat(), 60_000);

      await new Promise<void>((resolve) => {
        ws.on("message", async (raw) => {
          let message: {
            type?: string;
            id?: string;
            tool?: string;
            arguments?: Record<string, unknown>;
          };

          try {
            message = JSON.parse(raw.toString());
          } catch {
            return;
          }

          if (
            message.type !== "call" ||
            !message.id ||
            !message.tool
          ) {
            return;
          }

          const callStarted = Date.now();
          logLine("event", `tool.call ${bold(message.tool)} · ${dim(message.id.slice(0, 8))}`);
          try {
            const result = await core.call(
              message.tool,
              message.arguments || {},
            );
            logLine("success", `tool.done ${message.tool} · ${Date.now() - callStarted}ms`);
            ws.send(
              JSON.stringify({
                type: "result",
                id: message.id,
                result,
              }),
            );
          } catch (error) {
            logLine("error", `tool.fail ${message.tool} · ${error instanceof Error ? error.message : String(error)}`);
            ws.send(
              JSON.stringify({
                type: "result",
                id: message.id,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        });

        ws.once("close", resolve);
        ws.once("error", resolve);
      });
      clearInterval(heartbeatTimer);
    } catch (error) {
      logLine(
        "error",
        "Relay connection failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      ws.removeAllListeners();
      ws.close();
    }

    if (!stopped) {
      logLine(
        "warn",
        "Relay disconnected · retrying in " + Math.round(backoff / 1000) + "s",
      );
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}

async function main() {
  if (argFlag("--help") || argFlag("-h")) {
    process.stdout.write(
      [
        "Remote Arc",
        "",
        "Usage:",
        "  npx remotelink",
        "",
        "After the npm release:",
        "  npx remotelink",
        "",
        "Options:",
        "  --safe        Hard local read-only cap; dashboard cannot enable write tools",
        "  --developer   Legacy alias for dashboard-managed capabilities",
        "  --reset       Remove this computer's saved pairing",
        "  --version     Print CLI version",
        "  --help        Show this help",
        "",
      ].join("\n"),
    );
    return;
  }

  if (argFlag("--version") || argFlag("-v")) {
    process.stdout.write(VERSION + "\n");
    return;
  }

  if (argFlag("--reset")) {
    await resetConfig();
    return;
  }

  const origin =
    process.env.REMOTEARC_ORIGIN || process.env.REMOTE_LINK_ORIGIN ||
    process.argv.find((value) => value.startsWith("--origin="))?.slice(9) ||
    DEFAULT_ORIGIN;

  let config = await readConfig();
  if (config && ["https://remote.samyao.me", "https://remotearc.app"].includes(config.origin)) {
    config.origin = DEFAULT_ORIGIN;
    await writeConfig(config);
    logLine("info", "Migrated relay origin to " + DEFAULT_ORIGIN);
  }
  if (!config) {
    config = await pair(origin, selectedMode());
  } else if (argFlag("--safe") || argFlag("--developer")) {
    config.mode = argFlag("--safe") ? "safe" : "managed";
    await writeConfig(config);
  }

  if (config) {
    logLine("info", `Using paired device identity ${dim(config.deviceId.slice(0, 8))}…`);
  }
  await connectAgent(config);
}

main().catch((error) => {
  logLine(
    "error",
    "Fatal: " + (error instanceof Error ? error.message : String(error)),
  );
  process.exit(1);
});
