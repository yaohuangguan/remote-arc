import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const CONFIG_DIR = path.join(os.homedir(), ".remotearc");
const AGENT_DIR = path.join(CONFIG_DIR, "agent");
const LOG_DIR = path.join(CONFIG_DIR, "logs");
const AGENT_BUNDLE = path.join(AGENT_DIR, "remotelink.mjs");
const MAC_LABEL = "app.remotearc.agent";
const WINDOWS_TASK = "Remote Arc Agent";
const LINUX_UNIT = "remotearc-agent.service";

export type BackgroundAgentStatus = {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  service: "launchd" | "task-scheduler" | "systemd-user" | "unsupported";
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

async function ensureBundle(sourcePath: string) {
  await fs.mkdir(AGENT_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
  if (path.resolve(sourcePath) !== path.resolve(AGENT_BUNDLE)) {
    await fs.copyFile(sourcePath, AGENT_BUNDLE);
    if (process.platform !== "win32") {
      await fs.chmod(AGENT_BUNDLE, 0o700).catch(() => undefined);
    }
  }
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
): Promise<BackgroundAgentStatus> {
  await ensureBundle(sourcePath);
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
  const enabled = await fs
    .access(plistPath)
    .then(() => true)
    .catch(() => false);
  const domain = `gui/${process.getuid?.() ?? os.userInfo().uid}`;
  const result = await run(
    "launchctl",
    ["print", domain + "/" + MAC_LABEL],
    { ignoreFailure: true },
  );
  return {
    supported: true,
    enabled,
    active: result.code === 0,
    service: "launchd",
  };
}

async function enableLinux(
  sourcePath: string,
  preserveCurrent: boolean,
): Promise<BackgroundAgentStatus> {
  await ensureBundle(sourcePath);
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
  const enabledResult = await run(
    "systemctl",
    ["--user", "is-enabled", LINUX_UNIT],
    { ignoreFailure: true },
  );
  const activeResult = await run(
    "systemctl",
    ["--user", "is-active", LINUX_UNIT],
    { ignoreFailure: true },
  );
  const supported =
    enabledResult.stderr.toLowerCase().includes("failed to connect to bus")
      ? false
      : true;
  return {
    supported,
    enabled: enabledResult.code === 0,
    active: activeResult.code === 0,
    service: supported ? "systemd-user" : "unsupported",
    detail: supported ? undefined : "systemd user services are unavailable",
  };
}

async function powershell(script: string, ignoreFailure = false) {
  return run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { ignoreFailure },
  );
}

async function enableWindows(
  sourcePath: string,
  preserveCurrent: boolean,
): Promise<BackgroundAgentStatus> {
  await ensureBundle(sourcePath);
  const args = `"${AGENT_BUNDLE}" --agent`;
  const script = [
    `$action = New-ScheduledTaskAction -Execute ${psQuote(process.execPath)} -Argument ${psQuote(args)}`,
    "$trigger = New-ScheduledTaskTrigger -AtLogOn",
    "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)",
    `Register-ScheduledTask -TaskName ${psQuote(WINDOWS_TASK)} -Action $action -Trigger $trigger -Settings $settings -Description 'Remote Arc background connection' -Force | Out-Null`,
    ...(preserveCurrent ? [] : [`Start-ScheduledTask -TaskName ${psQuote(WINDOWS_TASK)}`]),
  ].join("; ");
  await powershell(script);
  return backgroundAgentStatus();
}

async function disableWindows(stopCurrent: boolean): Promise<BackgroundAgentStatus> {
  const commands = [];
  if (stopCurrent) {
    commands.push(
      `Stop-ScheduledTask -TaskName ${psQuote(WINDOWS_TASK)} -ErrorAction SilentlyContinue`,
    );
  }
  commands.push(
    `Unregister-ScheduledTask -TaskName ${psQuote(WINDOWS_TASK)} -Confirm:$false -ErrorAction SilentlyContinue`,
  );
  await powershell(commands.join("; "), true);
  return backgroundAgentStatus();
}

async function statusWindows(): Promise<BackgroundAgentStatus> {
  const script =
    `$task = Get-ScheduledTask -TaskName ${psQuote(WINDOWS_TASK)} -ErrorAction SilentlyContinue; if ($null -eq $task) { exit 3 }; Write-Output $task.State`;
  const result = await powershell(script, true);
  return {
    supported: true,
    enabled: result.code === 0,
    active: result.code === 0 && /running/i.test(result.stdout),
    service: "task-scheduler",
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
  options: { preserveCurrent?: boolean } = {},
) {
  const preserveCurrent = options.preserveCurrent ?? false;
  if (process.platform === "darwin") return enableMac(sourcePath, preserveCurrent);
  if (process.platform === "win32") return enableWindows(sourcePath, preserveCurrent);
  if (process.platform === "linux") return enableLinux(sourcePath, preserveCurrent);
  return backgroundAgentStatus();
}

export async function disableBackgroundAgent(options: { stopCurrent?: boolean } = {}) {
  const stopCurrent = options.stopCurrent ?? true;
  if (process.platform === "darwin") return disableMac(stopCurrent);
  if (process.platform === "win32") return disableWindows(stopCurrent);
  if (process.platform === "linux") return disableLinux(stopCurrent);
  return backgroundAgentStatus();
}
