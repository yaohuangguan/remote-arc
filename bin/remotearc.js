#!/usr/bin/env node

// src/index.ts
import os from "os";
import path from "path";
import fs from "fs/promises";
import { spawn } from "child_process";
import process from "process";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import WebSocket from "ws";
var VERSION = "0.3.0";
var DEFAULT_ORIGIN = "https://remote.samyao.me";
var CONFIG_DIR = path.join(os.homedir(), ".remotearc");
var CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
var LEGACY_CONFIG_PATH = path.join(os.homedir(), ".remote-link", "config.json");
var SAFE_TOOLS = /* @__PURE__ */ new Set([
  "list_directory",
  "read_file",
  "get_file_info",
  "list_processes"
]);
var DEVELOPER_TOOLS = /* @__PURE__ */ new Set([
  ...SAFE_TOOLS,
  "start_process",
  "write_file",
  "edit_block"
]);
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function argFlag(name) {
  return process.argv.includes(name);
}
function selectedMode() {
  if (argFlag("--safe")) return "safe";
  return "developer";
}
async function readConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  } catch {
    try {
      const legacy = JSON.parse(
        await fs.readFile(LEGACY_CONFIG_PATH, "utf8")
      );
      await writeConfig(legacy);
      process.stdout.write(
        "Migrated existing Remote Link pairing to Remote Arc.\n"
      );
      return legacy;
    } catch {
      return null;
    }
  }
}
async function writeConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", {
    mode: 384
  });
}
async function resetConfig() {
  await Promise.all([
    fs.rm(CONFIG_PATH, { force: true }),
    fs.rm(LEGACY_CONFIG_PATH, { force: true })
  ]);
  process.stdout.write("Remote Arc device credentials removed.\n");
}
function openBrowser(url) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}
async function pair(origin, mode) {
  const deviceName = os.hostname();
  const response = await fetch(origin + "/api/device/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_name: deviceName,
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname()
    })
  });
  if (!response.ok) {
    throw new Error("Could not start device pairing: " + response.status);
  }
  const pairing = await response.json();
  process.stdout.write("\nRemote Arc\n\n");
  process.stdout.write("Pair this computer in your browser.\n\n");
  process.stdout.write("  " + pairing.user_code + "\n\n");
  process.stdout.write(pairing.verification_uri_complete + "\n\n");
  process.stdout.write("Opening browser...\n");
  openBrowser(pairing.verification_uri_complete);
  const startedAt = Date.now();
  while (Date.now() - startedAt < pairing.expires_in * 1e3) {
    await sleep(Math.max(pairing.interval, 2) * 1e3);
    const tokenResponse = await fetch(origin + "/api/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_code: pairing.device_code,
        device_secret: pairing.device_secret
      })
    });
    if (tokenResponse.status === 428) {
      process.stdout.write(".");
      continue;
    }
    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      throw new Error("Pairing failed: " + body);
    }
    const result = await tokenResponse.json();
    process.stdout.write("\n\n\u2713 Device authorized\n");
    const config = {
      deviceId: result.device_id,
      deviceToken: result.device_token,
      deviceName,
      origin,
      mode
    };
    await writeConfig(config);
    return config;
  }
  throw new Error("Pairing expired. Run Remote Arc again to retry.");
}
var ExecutionCore = class {
  constructor(mode) {
    this.mode = mode;
  }
  mode;
  client = null;
  async connect() {
    if (this.client) return this.client;
    const client = new Client({
      name: "remotearc-cli-core",
      version: VERSION
    });
    const command = process.platform === "win32" ? "npx.cmd" : "npx";
    const transport = new StdioClientTransport({
      command,
      args: ["-y", "@wonderwhy-er/desktop-commander@latest"],
      stderr: "inherit"
    });
    await client.connect(transport);
    this.client = client;
    return client;
  }
  async tools() {
    const list = await (await this.connect()).listTools();
    const allowed = this.mode === "developer" ? DEVELOPER_TOOLS : SAFE_TOOLS;
    return list.tools.filter((tool) => allowed.has(tool.name));
  }
  async call(name, args) {
    const allowed = this.mode === "developer" ? DEVELOPER_TOOLS : SAFE_TOOLS;
    if (!allowed.has(name)) {
      throw new Error("Tool blocked by local permission mode: " + name);
    }
    return (await this.connect()).callTool({
      name,
      arguments: args
    });
  }
  async close() {
    if (!this.client) return;
    await this.client.close();
    this.client = null;
  }
};
async function connectAgent(config) {
  const core = new ExecutionCore(config.mode);
  const tools = await core.tools();
  const wsUrl = new URL("/agent", config.origin.replace(/^http/, "ws"));
  let stopped = false;
  let backoff = 1e3;
  const shutdown = async () => {
    stopped = true;
    await core.close().catch(() => void 0);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  while (!stopped) {
    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: "Bearer " + config.deviceToken
      }
    });
    try {
      await new Promise((resolve, reject) => {
        ws.once("open", resolve);
        ws.once("error", reject);
      });
      backoff = 1e3;
      ws.send(
        JSON.stringify({
          type: "hello",
          device: {
            id: config.deviceId,
            name: config.deviceName,
            platform: process.platform,
            arch: process.arch,
            hostname: os.hostname(),
            agentVersion: VERSION
          },
          tools: tools.map((tool) => tool.name)
        })
      );
      process.stdout.write(
        "\u2713 Connected as " + config.deviceName + " (" + config.mode + " mode)\n"
      );
      process.stdout.write("  " + config.origin + "\n");
      process.stdout.write("Press Ctrl+C to disconnect.\n");
      await new Promise((resolve) => {
        ws.on("message", async (raw) => {
          let message;
          try {
            message = JSON.parse(raw.toString());
          } catch {
            return;
          }
          if (message.type !== "call" || !message.id || !message.tool) {
            return;
          }
          try {
            const result = await core.call(
              message.tool,
              message.arguments || {}
            );
            ws.send(
              JSON.stringify({
                type: "result",
                id: message.id,
                result
              })
            );
          } catch (error) {
            ws.send(
              JSON.stringify({
                type: "result",
                id: message.id,
                error: error instanceof Error ? error.message : String(error)
              })
            );
          }
        });
        ws.once("close", resolve);
        ws.once("error", resolve);
      });
    } catch (error) {
      process.stderr.write(
        "Remote Arc connection failed: " + (error instanceof Error ? error.message : String(error)) + "\n"
      );
    } finally {
      ws.removeAllListeners();
      ws.close();
    }
    if (!stopped) {
      process.stdout.write(
        "Disconnected. Reconnecting in " + Math.round(backoff / 1e3) + "s...\n"
      );
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 3e4);
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
        "  npx --yes --package=github:yaohuangguan/remote-link remote-arc",
        "",
        "After the npm release:",
        "  npx remote-arc-mcp@latest",
        "",
        "Options:",
        "  --safe        Read-only local capability mode",
        "  --developer   Read/write/shell mode (default)",
        "  --reset       Remove this computer's saved pairing",
        "  --version     Print CLI version",
        "  --help        Show this help",
        ""
      ].join("\n")
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
  const origin = process.env.REMOTEARC_ORIGIN || process.env.REMOTE_LINK_ORIGIN || process.argv.find((value) => value.startsWith("--origin="))?.slice(9) || DEFAULT_ORIGIN;
  let config = await readConfig();
  if (!config) {
    config = await pair(origin, selectedMode());
  } else if (argFlag("--safe") || argFlag("--developer")) {
    config.mode = selectedMode();
    await writeConfig(config);
  }
  await connectAgent(config);
}
main().catch((error) => {
  process.stderr.write(
    "\nRemote Arc error: " + (error instanceof Error ? error.message : String(error)) + "\n"
  );
  process.exit(1);
});
//# sourceMappingURL=index.js.map