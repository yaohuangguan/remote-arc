#!/usr/bin/env node
import { createTaskKeepAwakeManager } from "./keep-awake.js";
import { goalWorkspace } from "./goal-workspace.js";
import { appendAgentEvent, readAgentEvents, startSupervisedAgent, superviseAgent, tryAgentLease } from "./agent-runtime.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import {
  backgroundAgentStatus,
  disableBackgroundAgent,
  enableBackgroundAgent,
  LegacyBackgroundAgentError,
} from "./background.js";
import {
  RemoteArcExecutionCore,
  type ExecutionPolicy,
} from "@remotearc/execution-core";

const VERSION = "0.4.5";
const DEFAULT_ORIGIN = "https://mcp.remotearc.app";
const CONFIG_DIR = path.join(os.homedir(), ".remotearc");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const LEGACY_CONFIG_PATH = path.join(os.homedir(), ".remote-link", "config.json");
const SELF_PATH = fileURLToPath(import.meta.url);

type Mode = "managed" | "safe" | "developer";

type SavedConfig = {
  deviceId: string;
  deviceToken: string;
  deviceName: string;
  origin: string;
  mode: Mode;
  backgroundEnabled?: boolean;
};

class RevokedDeviceCredentialError extends Error {
  constructor() {
    super("Saved device credential has been revoked.");
    this.name = "RevokedDeviceCredentialError";
  }
}

async function validateSavedPairing(config: SavedConfig) {
  try {
    const response = await fetch(new URL("/api/device/heartbeat", config.origin), {
      method: "POST",
      headers: { Authorization: "Bearer " + config.deviceToken },
    });

    if (response.status === 401 || response.status === 403) {
      throw new RevokedDeviceCredentialError();
    }

    // A transient server-side failure should not destroy a valid local pairing.
    // The WebSocket connection remains the source of truth for availability.
    return;
  } catch (error) {
    if (error instanceof RevokedDeviceCredentialError) throw error;
    return;
  }
}

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

type DeviceApproval = {
  id: string;
  device_id: string;
  client_id: string | null;
  client_name: string | null;
  request_id: string;
  tool_name: string;
  target_path: string;
  expires_at: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let approvalPromptActive = false;

async function promptPendingApproval(config: SavedConfig) {
  if (
    approvalPromptActive ||
    argFlag("--agent") ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY
  ) {
    return;
  }

  approvalPromptActive = true;
  try {
    const response = await fetch(
      new URL("/api/device/approvals/pending", config.origin),
      { headers: { Authorization: "Bearer " + config.deviceToken } },
    );
    if (!response.ok) return;

    const approvals = (await response.json()) as DeviceApproval[];
    const approval = approvals[0];
    if (!approval) return;

    process.stdout.write("\n");
    logLine(
      "warn",
      `Approval required · ${bold(approval.tool_name)} · ${dim(approval.request_id.slice(0, 8))}`,
    );
    process.stdout.write("       " + bold(approval.target_path) + "\n");
    process.stdout.write(
      "       " +
        dim(
          (approval.client_name || approval.client_id?.slice(0, 12) || "AI client") +
            " · expires " +
            new Date(approval.expires_at).toLocaleTimeString(),
        ) +
        "\n",
    );

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answer = "";
    try {
      answer = (
        await rl.question(
          "       [1] Allow once  [2] Allow 10 min  [3] Trust folder  [d] Deny  [Enter] Later\n       > ",
        )
      )
        .trim()
        .toLowerCase();
    } finally {
      rl.close();
    }

    const decision =
      answer === "1"
        ? "allow_once"
        : answer === "2"
          ? "allow_10m"
          : answer === "3"
            ? "always_folder"
            : answer === "d" || answer === "deny"
              ? "deny"
              : null;

    if (!decision) {
      logLine("info", "Approval left pending · use Dashboard → Security anytime.");
      return;
    }

    const decisionResponse = await fetch(
      new URL(
        "/api/device/approvals/" +
          encodeURIComponent(approval.id) +
          "/decision",
        config.origin,
      ),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + config.deviceToken,
          "content-type": "application/json",
        },
        body: JSON.stringify({ decision }),
      },
    );

    if (!decisionResponse.ok) {
      const payload = (await decisionResponse.json().catch(() => ({}))) as {
        error?: string;
      };
      logLine(
        "error",
        "Approval failed · " + (payload.error || String(decisionResponse.status)),
      );
      return;
    }

    logLine(
      decision === "deny" ? "warn" : "success",
      decision === "deny"
        ? "Approval denied."
        : decision === "always_folder"
          ? "Folder added to Trusted Write Locations."
          : "Temporary write approval granted.",
    );
  } catch {
    // Dashboard remains the canonical approval surface if terminal polling fails.
  } finally {
    approvalPromptActive = false;
  }
}

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
  appendAgentEvent(path.join(CONFIG_DIR, "logs"), `${nowTime()}  ${level}  ${message}\n`);
}

function banner() {
  process.stdout.write("\n");
  process.stdout.write(bold("Remote Arc") + "  " + dim(`v${VERSION}`) + "\n");
  process.stdout.write(dim("Persistent agent runtime for your computers") + "\n\n");
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
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const staging = CONFIG_PATH + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(staging, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
    await fs.rename(staging, CONFIG_PATH);
  } finally { await fs.rm(staging, { force: true }); }
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
  private readonly core: RemoteArcExecutionCore;

  constructor(mode: Mode) {
    this.core = new RemoteArcExecutionCore(
      isLocalSafeMode(mode) ? "safe" : "managed",
    );
  }

  async tools() {
    return this.core.listTools();
  }

  async call(
    name: string,
    args: Record<string, unknown>,
    policy?: ExecutionPolicy,
  ) {
    return this.core.callTool(name, args, policy);
  }

  async close() {
    await this.core.close();
  }
}

async function connectAgent(config: SavedConfig): Promise<"stopped" | "rePair"> {
  const core = new ExecutionCore(config.mode);
  banner();
  logLine("info", `Device: ${bold(config.deviceName)} · ${process.platform}/${process.arch}`);
  logLine(
    "info",
    `Permission profile: ${isLocalSafeMode(config.mode) ? green("safe local cap") : cyan("dashboard-managed")}`,
  );

  const tools = await core.tools();
  const internalTools = ["background_agent_status", "set_background_agent", "set_task_keep_awake", "goal_workspace"];
  let keepAwake = createTaskKeepAwakeManager();
  logLine("success", `Local tools ready: ${tools.length} exposed`);
  process.stdout.write("       " + dim(tools.map((tool) => tool.name).join(" · ")) + "\n");
  try {
    await validateSavedPairing(config);
  } catch (error) {
    if (error instanceof RevokedDeviceCredentialError) {
      logLine("warn", error.message);
      await resetConfig();
      logLine("event", "Starting a fresh device pairing…");
      await core.close().catch(() => undefined);
      return "rePair";
    }
    throw error;
  }

  const wsUrl = new URL("/agent", config.origin.replace(/^http/, "ws"));

  let stopped = false;
  let rePair = false;
  let backoff = 1000;
  let currentSocket: WebSocket | null = null;
  let backgroundSettings: Promise<void> = Promise.resolve();

  const shutdown = async () => {
    stopped = true;
    currentSocket?.terminate();
    keepAwake.close();
    await core.close().catch(() => undefined);
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

    currentSocket = ws;
    const send = (message: unknown) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try { ws.send(JSON.stringify(message)); } catch { ws.terminate(); }
    };

    // Keep a permanent error listener on every socket attempt. During a
    // failed handshake, ws can emit a second asynchronous error when the
    // connecting socket is aborted. Without this guard Node treats that as
    // an unhandled EventEmitter error and terminates the process.
    const absorbSocketError = () => undefined;
    ws.on("error", absorbSocketError);

    try {
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const onUnexpectedResponse = (
          _request: unknown,
          response: { statusCode?: number; resume?: () => void },
        ) => {
          cleanup();
          response.resume?.();
          if (response.statusCode === 401 || response.statusCode === 403) {
            reject(new RevokedDeviceCredentialError());
            return;
          }
          reject(
            new Error(
              "Unexpected relay response: " + String(response.statusCode || "unknown"),
            ),
          );
        };
        const cleanup = () => {
          ws.off("open", onOpen);
          ws.off("error", onError);
          ws.off("unexpected-response", onUnexpectedResponse);
        };

        ws.once("open", onOpen);
        ws.once("error", onError);
        ws.once("unexpected-response", onUnexpectedResponse);
      });

      backoff = 1000;
      const connectedAt = new Date().toISOString();
      const publishPresence = async () => {
        const saved = await readConfig();
        if (!saved || saved.deviceId !== config.deviceId || saved.deviceToken !== config.deviceToken) {
          logLine("warn", "The local pairing changed or was removed; stopping this execution owner.");
          await shutdown(); return;
        }
        const local = await backgroundAgentStatus().catch(() => null);
        const recovery = local ? { ...local, enabled: saved?.backgroundEnabled === true && local.enabled && local.active } : null;
        if (ws.readyState !== WebSocket.OPEN) return;
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
              pid: process.pid,
              backgroundProcess: argFlag("--agent"),
              connectedAt,
              recoveryEnabled: recovery?.enabled ?? false,
              supervisorActive: recovery?.active,
              supervisorPid: recovery?.pid,
              supervisorService: recovery?.service,
            },
            tools: [...tools.map((tool) => tool.name), ...internalTools],
            capabilities: [
              "native_core_v1",
              "device_policy_v1",
              "undo_history_v1",
              "background_agent_v1",
              "background_recovery_v2",
            ],
          }),
        );

      };
      await publishPresence();
      const presenceTimer = setInterval(() => void publishPresence().catch(() => undefined), 30_000);

      logLine("success", `Relay connected · ${bold(config.deviceName)} · ${config.mode} mode`);
      logLine("success", "Device presence published.");
      process.stdout.write("       " + dim(config.origin) + "\n");
      process.stdout.write("       " + dim("Ctrl+C to disconnect") + "\n\n");

      const sendHeartbeat = async () => {
        try {
          const background =
            config.backgroundEnabled === undefined
              ? null
              : await backgroundAgentStatus().catch(() => null);
          await fetch(new URL("/api/device/heartbeat", config.origin), {
            method: "POST",
            headers: {
              Authorization: "Bearer " + config.deviceToken,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              background_enabled: background ? (await readConfig())?.backgroundEnabled === true && background.enabled && background.active : undefined,
              background_process: argFlag("--agent"),
              background_service: background?.service,
            }),
          });
        } catch {
          // WebSocket reconnect logic remains the source of truth for connectivity.
        }
      };
      void sendHeartbeat();
      const heartbeatTimer = setInterval(
        () => void sendHeartbeat(),
        15 * 60_000,
      );

      void promptPendingApproval(config);
      const approvalTimer = setInterval(
        () => void promptPendingApproval(config),
        4_000,
      );

      // Sleep/resume and network transitions can occasionally leave the local
      // socket in OPEN state even though the remote path is no longer usable.
      // A protocol ping/pong watchdog makes that stale state bounded: after
      // wake, a stale socket is terminated and the normal exponential-backoff
      // reconnect loop takes over on macOS, Windows and Linux.
      let lastSocketActivity = Date.now();
      ws.on("pong", () => {
        lastSocketActivity = Date.now();
      });
      const livenessTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastSocketActivity > 75_000) {
          logLine("warn", "Relay connection became stale · reconnecting…");
          ws.terminate();
          return;
        }
        try {
          ws.ping();
        } catch {
          ws.terminate();
        }
      }, 30_000);

      await new Promise<void>((resolve) => {
        ws.on("message", async (raw) => {
          lastSocketActivity = Date.now();
          let message: {
            type?: string;
            id?: string;
            tool?: string;
            arguments?: Record<string, unknown>;
            policy?: ExecutionPolicy;
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
            let result: unknown;
            let exitAfterResponse = false;

            if (message.tool === "goal_workspace") {
              if (!(await core.tools()).some(tool => tool.name === "start_process")) throw new Error("Goal checkpoints require terminal mode.");
              result = await goalWorkspace(message.arguments || {}, message.policy);
            } else if (message.tool === "set_task_keep_awake") {
              result = await keepAwake.set(String(message.arguments?.task_id || ""), Number(message.arguments?.seconds || 0));
            } else if (message.tool === "background_agent_status") {
              const status = await backgroundAgentStatus();
              result = {
                ...status,
                enabled: status.enabled,
                desired_enabled: config.backgroundEnabled ?? null,
              };
            } else if (message.tool === "set_background_agent") {
              const enabled = message.arguments?.enabled;
              if (typeof enabled !== "boolean") {
                throw new Error("enabled must be a boolean");
              }

              const change = backgroundSettings.then(async () => {
                config = { ...(await readConfig() || config), backgroundEnabled: enabled };
                await writeConfig(config);

                if (enabled) {
                  const current = await backgroundAgentStatus();
                  result = current.enabled && current.active
                    ? { ...current, desired_enabled: true }
                    : {
                        ...(await enableBackgroundAgent(SELF_PATH, {
                          preserveCurrent: argFlag("--agent"),
                          version: VERSION,
                        })),
                        desired_enabled: true,
                      };
                  // Retain the executing Agent and terminal; the daemon waits
                  // on the shared lease and takes over only when this owner ends.
                } else {
                  const stopCurrent = message.arguments?.stop_current === true;
                  const runningAsBackgroundAgent = argFlag("--agent");
                  result = {
                    ...(await disableBackgroundAgent({
                      stopCurrent: stopCurrent && !runningAsBackgroundAgent,
                    })),
                    desired_enabled: false,
                  };
                  exitAfterResponse = stopCurrent && runningAsBackgroundAgent;
                }
              });
              backgroundSettings = change.catch(() => undefined);
              await change;
            } else {
              result = await core.call(
                message.tool,
                message.arguments || {},
                message.policy,
              );
            }

            logLine("success", `tool.done ${message.tool} · ${Date.now() - callStarted}ms`);
            send({
                type: "result",
                id: message.id,
                result,
              });
            if (message.tool === "set_background_agent") { await publishPresence(); void sendHeartbeat(); }
            if (exitAfterResponse) {
              setTimeout(() => void shutdown(), 500);
            }
          } catch (error) {
            logLine("error", `tool.fail ${message.tool} · ${error instanceof Error ? error.message : String(error)}`);
            send({
                type: "result",
                id: message.id,
                error: error instanceof Error ? error.message : String(error),
              });
          }
        });

        ws.once("close", resolve);
        ws.once("error", resolve);
      });
      clearInterval(presenceTimer);
      clearInterval(heartbeatTimer);
      clearInterval(approvalTimer);
      clearInterval(livenessTimer);
    } catch (error) {
      if (error instanceof RevokedDeviceCredentialError) {
        logLine("warn", error.message);
        await resetConfig();
        logLine("event", "Starting a fresh device pairing…");
        rePair = true;
        await shutdown();
      }

      logLine(
        "error",
        "Relay connection failed: " +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      keepAwake.close();
      if (!stopped) keepAwake = createTaskKeepAwakeManager();
      ws.removeAllListeners("message");
      ws.removeAllListeners("open");
      ws.removeAllListeners("unexpected-response");
      ws.removeAllListeners("close");
      ws.removeAllListeners("error");
      ws.on("error", absorbSocketError);

      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate();
      }
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

  process.off("SIGINT", shutdown);
  process.off("SIGTERM", shutdown);
  await core.close().catch(() => undefined);
  return rePair ? "rePair" : "stopped";
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
        "  --safe          Hard local read-only cap; dashboard cannot enable write tools",
        "  --developer     Legacy alias for dashboard-managed capabilities",
        "  --foreground    Stay attached without installing or repairing recovery",
        "  --background    Enable process recovery and keep this terminal attached",
        "  --no-background Disable recovery; preserve the currently executing Agent",
        "  --reset         Remove local pairing and background-agent registration",
        "  --version       Print CLI version",
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
    await disableBackgroundAgent({ stopCurrent: true }).catch(() => undefined);
    await resetConfig();
    return;
  }

  const origin =
    process.env.REMOTEARC_ORIGIN || process.env.REMOTE_LINK_ORIGIN ||
    process.argv.find((value) => value.startsWith("--origin="))?.slice(9) ||
    DEFAULT_ORIGIN;

  const agentMode = argFlag("--agent");
  const foregroundMode = argFlag("--foreground");
  const supervisorMode = argFlag("--supervise");
  const disableBackground = argFlag("--no-background");
  const enableBackground = argFlag("--background");
  let config = await readConfig();

  while (true) {
    if (config && ["https://remote.samyao.me", "https://remotearc.app"].includes(config.origin)) {
      config.origin = DEFAULT_ORIGIN;
      await writeConfig(config);
      logLine("info", "Migrated relay origin to " + DEFAULT_ORIGIN);
    }

    if (!config) {
      if (agentMode || supervisorMode) return;
      config = await pair(origin, selectedMode());
    }

    if (disableBackground) {
      config.backgroundEnabled = false;
      await writeConfig(config);
      await disableBackgroundAgent({ stopCurrent: false }).catch(() => undefined);
    } else if (enableBackground) {
      config.backgroundEnabled = true;
      await writeConfig(config);
    }

    logLine("info", `Using paired device identity ${dim(config.deviceId.slice(0, 8))}…`);

    if (supervisorMode) {
      const release = await tryAgentLease(path.join(CONFIG_DIR, "agent"), "supervisor");
      if (!release) return;
      const abort = new AbortController();
      const stop = () => abort.abort();
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      try {
        await superviseAgent({ enabled: async () => (await readConfig())?.backgroundEnabled === true,
          signal: abort.signal, start: () => startSupervisedAgent(process.execPath, SELF_PATH, path.join(CONFIG_DIR, "logs")) });
      } finally {
        process.off("SIGINT", stop); process.off("SIGTERM", stop); await release();
      }
      return;
    }
    if (agentMode && config.backgroundEnabled !== true) return;

    if (!agentMode && !foregroundMode && config.backgroundEnabled === true) {
      try {
        const existing = await backgroundAgentStatus().catch(() => null);
        if (
          existing?.active &&
          existing.version &&
          existing.version !== VERSION
        ) {
          logLine(
            "info",
            `Background Agent v${existing.version} detected · checking safe handoff to v${VERSION}…`,
          );
        }
        const status = await enableBackgroundAgent(SELF_PATH, { version: VERSION });
        if (status.supported && status.enabled && status.active) {
          banner();
          logLine("success", "Process recovery enabled; this terminal stays attached.");
          logLine(
            "info",
            `Supervisor: ${status.service} · PID ${status.pid} · takes over if the executing Agent ends`,
          );
          logLine(
            "info",
            "Use the Remote Arc dashboard or --no-background to disable it.",
          );
        } else logLine("warn", status.detail || "Background services are unavailable on this system.");
      } catch (error) {
        if (error instanceof LegacyBackgroundAgentError) {
          logLine("error", error.message); process.exitCode = 1; return;
        }
        logLine(
          "warn",
          "Could not enable background mode; keeping this terminal session connected: " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    if (config.backgroundEnabled === undefined) {
      logLine(
        "info",
        "Background connection is not configured yet · finish setup in the browser or Devices.",
      );
    }
    const abort = new AbortController();
    const stopWaiting = () => abort.abort();
    process.on("SIGINT", stopWaiting); process.on("SIGTERM", stopWaiting);
    let release: Awaited<ReturnType<typeof tryAgentLease>> = null;
    let cursor: number | null = null;
    let announced = false;
    let lastApprovalPoll = 0;
    try {
      while (!abort.signal.aborted && !release) {
        if (agentMode && (await readConfig())?.backgroundEnabled !== true) return;
        release = await tryAgentLease(path.join(CONFIG_DIR, "agent"));
        if (release) break;
        if (!agentMode && (argFlag("--safe") || argFlag("--developer"))) {
          logLine("error", "Another Agent owns execution. Stop it locally before changing the local permission profile.");
          process.exitCode = 1;
          return;
        }
        if (!agentMode) {
          if (!announced) { logLine("info", "An Agent already owns execution. Following its operation log; Ctrl+C closes this viewer."); announced = true; }
          const events = await readAgentEvents(path.join(CONFIG_DIR, "logs"), cursor);
          cursor = events.cursor; if (events.text) process.stdout.write(events.text);
          if (Date.now() - lastApprovalPoll >= 4_000) { lastApprovalPoll = Date.now(); void promptPendingApproval(config); }
        }
        await sleep(500);
      }
      if (!release || abort.signal.aborted) return;
      if (argFlag("--safe") || argFlag("--developer")) {
        config.mode = argFlag("--safe") ? "safe" : "managed";
        await writeConfig(config);
      }
      process.off("SIGINT", stopWaiting); process.off("SIGTERM", stopWaiting);
      const result = await connectAgent(config);
      if (result !== "rePair") {
        // launchd/systemd restart unexpected termination even if the Agent's
        // signal handler completed cleanly. Disabled recovery remains stopped.
        if (agentMode && (await readConfig())?.backgroundEnabled === true) process.exitCode = 1;
        return;
      }
    } finally {
      process.off("SIGINT", stopWaiting); process.off("SIGTERM", stopWaiting);
      await release?.();
    }

    config = null;
  }
}

main().catch((error) => {
  logLine(
    "error",
    "Fatal: " + (error instanceof Error ? error.message : String(error)),
  );
  process.exit(1);
});
