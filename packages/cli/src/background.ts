import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const CONFIG_DIR = path.join(os.homedir(), ".remotearc");
const AGENT_DIR = path.join(CONFIG_DIR, "agent");
const LOG_DIR = path.join(CONFIG_DIR, "logs");
const AGENT_BUNDLE = path.join(AGENT_DIR, "remotelink.mjs");
const AGENT_VERSION_FILE = path.join(AGENT_DIR, "version");
const MAC_LABEL = "app.remotearc.agent";
const WINDOWS_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const WINDOWS_RUN_VALUE = "Remote Arc Agent";
const LINUX_UNIT = "remotearc-agent.service";

export type BackgroundAgentStatus = {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  service: "launchd" | "registry-run" | "systemd-user" | "unsupported";
  pid?: number | null;
  version?: string | null;
  detail?: string;
};

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

async function run(
  command: string,
  args: string[],
  options: { ignoreFailure?: boolean } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      if (options.ignoreFailure) {
        resolve({ code: 1, stdout, stderr: stderr || error.message });
        return;
      }
      reject(error);
    });
    child.once("close", (code) => {
      const result = { code: code ?? 1, stdout, stderr };
      if ((code ?? 1) !== 0 && !options.ignoreFailure) {
        reject(
          new Error(
            `${command} exited with ${String(code)}: ${stderr.trim() || stdout.trim() || "unknown error"}`,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function psQuote(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

async function ensureBundle(sourcePath: string, version?: string) {
  await fs.mkdir(AGENT_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
  if (path.resolve(sourcePath) !== path.resolve(AGENT_BUNDLE)) {
    await fs.copyFile(sourcePath, AGENT_BUNDLE);
    if (process.platform !== "win32") {
      await fs.chmod(AGENT_BUNDLE, 0o700).catch(() => undefined);
    }
  }
  if (version) {
    await fs.writeFile(AGENT_VERSION_FILE, version + "\n", { mode: 0o600 });
  }
}

async function backgroundBundleVersion() {
  return fs
    .readFile(AGENT_VERSION_FILE, "utf8")
    .then((value) => value.trim() || null)
    .catch(() => null);
}

function macPlistPath() {
  return path.join(os.homedir(), "Library", "LaunchAgents", MAC_LABEL + ".plist");
}

function linuxUnitPath() {
  return path.join(os.homedir(), ".config", "systemd", "user", LINUX_UNIT);
}

async function enableMac(
  sourcePath: string,
  preserveCurrent: boolean,
  version?: string,
): Promise<BackgroundAgentStatus> {
  await ensureBundle(sourcePath, version);
  const plistPath = macPlistPath();
  await fs.mkdir(path.dirname(plistPath), { recursive: true });
  const stdoutPath = path.join(LOG_DIR, "agent.log");
  const stderrPath = path.join(LOG_DIR, "agent-error.log");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${MAC_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(process.execPath)}</string>
    <string>${xmlEscape(AGENT_BUNDLE)}</string>
    <string>--agent</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>ProcessType</key><string>Background</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xmlEscape(process.env.PATH || "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin")}</string>
    <key>HOME</key><string>${xmlEscape(os.homedir())}</string>
  </dict>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(stderrPath)}</string>
</dict>
</plist>
`;
  await fs.writeFile(plistPath, plist, { mode: 0o600 });

  const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
  const loaded = await run(
    "launchctl",
    ["print", domain + "/" + MAC_LABEL],
    { ignoreFailure: true },
  );
  await run("launchctl", ["enable", domain + "/" + MAC_LABEL], {
    ignoreFailure: true,
  });
  if (!(preserveCurrent && loaded.code === 0)) {
    await run("launchctl", ["bootout", domain + "/" + MAC_LABEL], {
      ignoreFailure: true,
    });
    await run("launchctl", ["bootstrap", domain, plistPath]);
    await run("launchctl", ["kickstart", "-k", domain + "/" + MAC_LABEL], {
      ignoreFailure: true,
    });
  }

  return backgroundAgentStatus();
}

async function disableMac(stopCurrent: boolean): Promise<BackgroundAgentStatus> {
  const plistPath = macPlistPath();
  const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
  await run("launchctl", ["disable", domain + "/" + MAC_LABEL], {
    ignoreFailure: true,
  });
  await fs.rm(plistPath, { force: true });
  if (stopCurrent) {
    await run("launchctl", ["bootout", domain + "/" + MAC_LABEL], {
      ignoreFailure: true,
    });
  }
  return backgroundAgentStatus();
}

async function statusMac(): Promise<BackgroundAgentStatus> {
  const plistPath = macPlistPath();
  const enabled = await fs.access(plistPath).then(() => true).catch(() => false);
  const domain = "gui/" + (process.getuid?.() ?? os.userInfo().uid);
  const result = await run("launchctl", ["print", domain + "/" + MAC_LABEL], { ignoreFailure: true });
  const pidMatch = result.stdout.match(/\\bpid = (\\d+)/);
  const pid = pidMatch ? Number(pidMatch[1]) : null;
  const active = result.code === 0 && pid !== null && /\\bstate = running\\b/i.test(result.stdout);
  return {
    supported: true,
    enabled,
    active,
    service: "launchd",
    pid,
    version: await backgroundBundleVersion(),
    detail: enabled && !active ? "Background connection is configured but the launchd agent is not currently running." : undefined,
  };
}

async function enableLinux(
  sourcePath: string,
  preserveCurrent: boolean,
  version?: string,
): Promise<BackgroundAgentStatus> {
  await ensureBundle(sourcePath, version);
  const unitPath = linuxUnitPath();
  await fs.mkdir(path.dirname(unitPath), { recursive: true });
  const unit = `[Unit]
Description=Remote Arc background agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${process.execPath} ${AGENT_BUNDLE} --agent
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;
  await fs.writeFile(unitPath, unit, { mode: 0o600 });
  await run("systemctl", ["--user", "daemon-reload"]);
  await run(
    "systemctl",
    preserveCurrent
      ? ["--user", "enable", LINUX_UNIT]
      : ["--user", "enable", "--now", LINUX_UNIT],
  );
  return backgroundAgentStatus();
}

async function disableLinux(stopCurrent: boolean): Promise<BackgroundAgentStatus> {
  await run(
    "systemctl",
    stopCurrent
      ? ["--user", "disable", "--now", LINUX_UNIT]
      : ["--user", "disable", LINUX_UNIT],
    { ignoreFailure: true },
  );
  await fs.rm(linuxUnitPath(), { force: true });
  if (stopCurrent) {
    await run("systemctl", ["--user", "daemon-reload"], {
      ignoreFailure: true,
    });
  }
  return backgroundAgentStatus();
}

async function statusLinux(): Promise<BackgroundAgentStatus> {
  const enabledResult = await run("systemctl", ["--user", "is-enabled", LINUX_UNIT], { ignoreFailure: true });
  const activeResult = await run("systemctl", ["--user", "is-active", LINUX_UNIT], { ignoreFailure: true });
  const pidResult = await run("systemctl", ["--user", "show", LINUX_UNIT, "--property", "MainPID", "--value"], { ignoreFailure: true });
  const supported = !enabledResult.stderr.toLowerCase().includes("failed to connect to bus");
  const pidValue = Number(pidResult.stdout.trim());
  return {
    supported,
    enabled: enabledResult.code === 0,
    active: activeResult.code === 0 && Number.isFinite(pidValue) && pidValue > 0,
    service: supported ? "systemd-user" : "unsupported",
    pid: Number.isFinite(pidValue) && pidValue > 0 ? pidValue : null,
    version: await backgroundBundleVersion(),
    detail: supported ? undefined : "systemd user services are unavailable",
  };
}

async function powershell(script: string, ignoreFailure = false) {
  const utf8Script =
    "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); " +
    script;
  return run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", utf8Script],
    { ignoreFailure },
  );
}

async function windowsAgentPid() {
  const escapedBundle = AGENT_BUNDLE.replaceAll("'", "''");
  const escapedNode = process.execPath.replaceAll("'", "''");
  const script =
    "$p = Get-CimInstance Win32_Process | Where-Object { " +
    "$_.Name -ieq 'node.exe' -and " +
    "$_.ExecutablePath -ieq '" + escapedNode + "' -and " +
    "$_.CommandLine -like '*" + escapedBundle + "*--agent*' " +
    "} | Select-Object -First 1 -ExpandProperty ProcessId; " +
    "if ($null -ne $p) { Write-Output $p }";
  const result = await powershell(script, true);
  const pid = Number(result.stdout.trim());
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

async function enableWindows(
  sourcePath: string,
  preserveCurrent: boolean,
  version?: string,
): Promise<BackgroundAgentStatus> {
  await ensureBundle(sourcePath, version);
  const command = '"' + process.execPath + '" "' + AGENT_BUNDLE + '" --agent';
  await run("reg.exe", [
    "add", WINDOWS_RUN_KEY, "/v", WINDOWS_RUN_VALUE, "/t", "REG_SZ", "/d", command, "/f",
  ]);
  if (!preserveCurrent && !(await windowsAgentPid())) {
    const stdoutPath = path.join(LOG_DIR, "agent.log");
    const stderrPath = path.join(LOG_DIR, "agent-error.log");
    await powershell(
      "Start-Process -FilePath " +
        psQuote(process.execPath) +
        " -ArgumentList @(" +
        psQuote(AGENT_BUNDLE) +
        ", '--agent') -WindowStyle Hidden" +
        " -RedirectStandardOutput " +
        psQuote(stdoutPath) +
        " -RedirectStandardError " +
        psQuote(stderrPath) +
        " | Out-Null",
    );
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return backgroundAgentStatus();
}

async function disableWindows(stopCurrent: boolean): Promise<BackgroundAgentStatus> {
  await run("reg.exe", ["delete", WINDOWS_RUN_KEY, "/v", WINDOWS_RUN_VALUE, "/f"], { ignoreFailure: true });
  if (stopCurrent) {
    const pid = await windowsAgentPid();
    if (pid) {
      await powershell("Stop-Process -Id " + pid + " -Force -ErrorAction SilentlyContinue", true);
    }
  }
  return backgroundAgentStatus();
}

async function statusWindows(): Promise<BackgroundAgentStatus> {
  const enabledResult = await run("reg.exe", ["query", WINDOWS_RUN_KEY, "/v", WINDOWS_RUN_VALUE], { ignoreFailure: true });
  const pid = await windowsAgentPid();
  return {
    supported: true,
    enabled: enabledResult.code === 0,
    active: pid !== null,
    service: "registry-run",
    pid,
    version: await backgroundBundleVersion(),
    detail: enabledResult.code === 0 && pid === null
      ? "Background connection is configured but the user-level agent is not currently running."
      : undefined,
  };
}

export async function backgroundAgentStatus(): Promise<BackgroundAgentStatus> {
  if (process.platform === "darwin") return statusMac();
  if (process.platform === "win32") return statusWindows();
  if (process.platform === "linux") return statusLinux();
  return {
    supported: false,
    enabled: false,
    active: false,
    service: "unsupported",
    detail: "unsupported operating system",
  };
}

export async function enableBackgroundAgent(
  sourcePath: string,
  options: { preserveCurrent?: boolean; version?: string } = {},
) {
  const preserveCurrent = options.preserveCurrent ?? false;
  if (process.platform === "darwin") return enableMac(sourcePath, preserveCurrent, options.version);
  if (process.platform === "win32") return enableWindows(sourcePath, preserveCurrent, options.version);
  if (process.platform === "linux") return enableLinux(sourcePath, preserveCurrent, options.version);
  return backgroundAgentStatus();
}

export async function disableBackgroundAgent(options: { stopCurrent?: boolean } = {}) {
  const stopCurrent = options.stopCurrent ?? true;
  if (process.platform === "darwin") return disableMac(stopCurrent);
  if (process.platform === "win32") return disableWindows(stopCurrent);
  if (process.platform === "linux") return disableLinux(stopCurrent);
  return backgroundAgentStatus();
}
