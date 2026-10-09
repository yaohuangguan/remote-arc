import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { agentLeaseActive } from "./agent-runtime.js";

export class LegacyBackgroundAgentError extends Error {}


function parseReleaseVersion(value: string | null | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function isOlderRelease(current: string | null | undefined, target: string | null | undefined) {
  const a = parseReleaseVersion(current);
  const b = parseReleaseVersion(target);
  if (!a || !b) return false;
  if (a[0] !== b[0]) return a[0] < b[0];
  if (a[1] !== b[1]) return a[1] < b[1];
  return a[2] < b[2];
}

export function windowsSupervisorLaunchScript(node: string, bundle: string) {
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  // PowerShell's redirection pump can keep the launcher alive until the child
  // exits. The Agent persists its own event journal; do not make enabling
  // recovery wait for (or depend on) that temporary PowerShell process.
  return "Start-Process -FilePath " + quote(node) +
    " -ArgumentList " + quote('"' + bundle + '" --ts --supervise') +
    " -WindowStyle Hidden | Out-Null";
}

export type BackgroundAgentStatus = {
  supported: boolean;
  enabled: boolean;
  active: boolean;
  service: "launchd" | "registry-run" | "systemd-user" | "unsupported";
  pid?: number | null;
  workerPid?: number | null;
  version?: string | null;
  detail?: string;
};

export type RunResult = {
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
    const timer = setTimeout(() => {
      child.kill();
      const detail = `${command} timed out after 10 seconds`;
      if (options.ignoreFailure) resolve({ code: 124, stdout, stderr: detail });
      else reject(new Error(detail));
    }, 10_000);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      if (options.ignoreFailure) {
        resolve({ code: 1, stdout, stderr: stderr || error.message });
        return;
      }
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
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

export function createBackgroundController(
  options: {
    platform?: NodeJS.Platform;
    home?: string;
    nodePath?: string;
    uid?: number;
    run?: typeof run;
    wait?: (ms: number) => Promise<unknown>;
    leaseActive?: (directory: string) => Promise<boolean>;
  } = {},
) {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? os.homedir();
  const nodePath = options.nodePath ?? process.execPath;
  const uid = options.uid ?? process.getuid?.() ?? os.userInfo().uid;
  const runCommand = options.run ?? run;
  const wait =
    options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const leaseActive = options.leaseActive ?? agentLeaseActive;
  const CONFIG_DIR = path.join(home, ".remotearc");
  const AGENT_DIR = path.join(CONFIG_DIR, "agent");
  const LOG_DIR = path.join(CONFIG_DIR, "logs");
  const AGENT_BUNDLE = path.join(AGENT_DIR, "remotelink.mjs");
  const AGENT_VERSION_FILE = path.join(AGENT_DIR, "version");
  const MAC_LABEL = "app.remotearc.agent";
  const WINDOWS_RUN_KEY =
    "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  const WINDOWS_RUN_VALUE = "Remote Arc Agent";
  const LINUX_UNIT = "remotearc-agent.service";

  function xmlEscape(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function psQuote(value: string) {
    return "'" + value.replaceAll("'", "''") + "'";
  }

  function unitQuote(value: string) {
    return JSON.stringify(value).replaceAll("%", "%%");
  }

  async function ensureBundle(sourcePath: string, version?: string) {
    await fs.mkdir(AGENT_DIR, { recursive: true });
    await fs.mkdir(LOG_DIR, { recursive: true });
    if (path.resolve(sourcePath) !== path.resolve(AGENT_BUNDLE)) {
      const staging = AGENT_BUNDLE + "." + process.pid + ".tmp";
      await fs.copyFile(sourcePath, staging);
      await fs.rename(staging, AGENT_BUNDLE);
      if (platform !== "win32") {
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
    return path.join(home, "Library", "LaunchAgents", MAC_LABEL + ".plist");
  }

  function linuxUnitPath() {
    return path.join(home, ".config", "systemd", "user", LINUX_UNIT);
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
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(AGENT_BUNDLE)}</string>
    <string>--ts</string>
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
    <key>HOME</key><string>${xmlEscape(home)}</string>
  </dict>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>StandardOutPath</key><string>${xmlEscape(stdoutPath)}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(stderrPath)}</string>
</dict>
</plist>
`;
    await fs.writeFile(plistPath, plist, { mode: 0o600 });

    const domain = `gui/${uid}`;
    const loaded = await runCommand(
      "launchctl",
      ["print", domain + "/" + MAC_LABEL],
      { ignoreFailure: true },
    );
    await runCommand("launchctl", ["enable", domain + "/" + MAC_LABEL], {
      ignoreFailure: true,
    });
    // Never boot out the Agent answering the setting request. Re-enabling
    // an already loaded job is idempotent and avoids the bootout/bootstrap race.
    if (loaded.code !== 0) {
      const bootstrapped = await runCommand(
        "launchctl",
        ["bootstrap", domain, plistPath],
        { ignoreFailure: true },
      );
      if (bootstrapped.code !== 0) {
        const observed = await runCommand(
          "launchctl",
          ["print", domain + "/" + MAC_LABEL],
          { ignoreFailure: true },
        );
        if (observed.code !== 0) {
          throw new Error(
            "launchctl bootstrap exited with " +
              bootstrapped.code +
              ": " +
              (bootstrapped.stderr.trim() || bootstrapped.stdout.trim()) +
              ". The current terminal remains connected.",
          );
        }
      }
    }
    await runCommand("launchctl", ["kickstart", domain + "/" + MAC_LABEL], {
      ignoreFailure: true,
    });

    return backgroundAgentStatus();
  }

  async function disableMac(
    stopCurrent: boolean,
  ): Promise<BackgroundAgentStatus> {
    const plistPath = macPlistPath();
    const domain = `gui/${uid}`;
    await runCommand("launchctl", ["disable", domain + "/" + MAC_LABEL], {
      ignoreFailure: true,
    });
    await fs.rm(plistPath, { force: true });
    if (stopCurrent) {
      await runCommand("launchctl", ["bootout", domain + "/" + MAC_LABEL], {
        ignoreFailure: true,
      });
    }
    return backgroundAgentStatus();
  }

  async function statusMac(): Promise<BackgroundAgentStatus> {
    const plistPath = macPlistPath();
    const installed = await fs
      .access(plistPath)
      .then(() => true)
      .catch(() => false);
    const domain = "gui/" + uid;
    const result = await runCommand(
      "launchctl",
      ["print", domain + "/" + MAC_LABEL],
      { ignoreFailure: true },
    );
    const disabled = await runCommand("launchctl", ["print-disabled", domain], {
      ignoreFailure: true,
    });
    const enabled =
      installed && !disabled.stdout.includes('"' + MAC_LABEL + '" => true');
    const pidMatch = result.stdout.match(/\bpid = (\d+)/);
    const pid = pidMatch ? Number(pidMatch[1]) : null;
    const active =
      result.code === 0 &&
      pid !== null &&
      /\bstate = running\b/i.test(result.stdout);
    return {
      supported: true,
      enabled,
      active,
      service: "launchd",
      pid,
      workerPid: pid,
      version: await backgroundBundleVersion(),
      detail:
        enabled && !active
          ? "Background connection is configured but the launchd agent is not currently running."
          : undefined,
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
ExecStart=:${unitQuote(nodePath)} ${unitQuote(AGENT_BUNDLE)} --ts --agent
Restart=on-failure
RestartSec=3
Environment=NODE_ENV=production
Environment=${unitQuote("PATH=" + (process.env.PATH || "/usr/local/bin:/usr/bin:/bin"))}
Environment=${unitQuote("HOME=" + home)}

[Install]
WantedBy=default.target
`;
    await fs.writeFile(unitPath, unit, { mode: 0o600 });
    await runCommand("systemctl", ["--user", "daemon-reload"]);
    await runCommand("systemctl", ["--user", "enable", "--now", LINUX_UNIT]);
    return backgroundAgentStatus();
  }

  async function disableLinux(
    stopCurrent: boolean,
  ): Promise<BackgroundAgentStatus> {
    await runCommand(
      "systemctl",
      stopCurrent
        ? ["--user", "disable", "--now", LINUX_UNIT]
        : ["--user", "disable", LINUX_UNIT],
      { ignoreFailure: true },
    );
    await fs.rm(linuxUnitPath(), { force: true });
    if (stopCurrent) {
      await runCommand("systemctl", ["--user", "daemon-reload"], {
        ignoreFailure: true,
      });
    }
    return backgroundAgentStatus();
  }

  async function statusLinux(): Promise<BackgroundAgentStatus> {
    const enabledResult = await runCommand(
      "systemctl",
      ["--user", "is-enabled", LINUX_UNIT],
      { ignoreFailure: true },
    );
    const activeResult = await runCommand(
      "systemctl",
      ["--user", "is-active", LINUX_UNIT],
      { ignoreFailure: true },
    );
    const pidResult = await runCommand(
      "systemctl",
      ["--user", "show", LINUX_UNIT, "--property", "MainPID", "--value"],
      { ignoreFailure: true },
    );
    const supported = !enabledResult.stderr
      .toLowerCase()
      .includes("failed to connect to bus");
    const pidValue = Number(pidResult.stdout.trim());
    return {
      supported,
      enabled: enabledResult.code === 0,
      active:
        activeResult.code === 0 && Number.isFinite(pidValue) && pidValue > 0,
      service: supported ? "systemd-user" : "unsupported",
      pid: Number.isFinite(pidValue) && pidValue > 0 ? pidValue : null,
      workerPid: Number.isFinite(pidValue) && pidValue > 0 ? pidValue : null,
      version: await backgroundBundleVersion(),
      detail: supported ? undefined : "systemd user services are unavailable",
    };
  }

  async function powershell(script: string, ignoreFailure = false) {
    const utf8Script =
      "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); " +
      script;
    return runCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        utf8Script,
      ],
      { ignoreFailure },
    );
  }

  async function windowsAgentPid(role = "--supervise") {
    const script =
      "$p = Get-CimInstance Win32_Process | Where-Object { " +
      "$_.Name -ieq 'node.exe' -and $_.ExecutablePath -ieq " +
      psQuote(nodePath) +
      " -and $_.CommandLine -match ('^\"?' + [regex]::Escape(" +
      psQuote(nodePath) +
      ") + '\"?\\s+\"?' + [regex]::Escape(" +
      psQuote(AGENT_BUNDLE) +
      ") + '\"?\\s+(?:--ts\\s+)?" +
      role +
      "(?:\\s|$)')" +
      " } | Select-Object -First 1 -ExpandProperty ProcessId; " +
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
    const start = windowsSupervisorLaunchScript(nodePath, AGENT_BUNDLE);
    const encoded = Buffer.from(start, "utf16le").toString("base64");
    const command =
      "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand " +
      encoded;
    await runCommand("reg.exe", [
      "add",
      WINDOWS_RUN_KEY,
      "/v",
      WINDOWS_RUN_VALUE,
      "/t",
      "REG_SZ",
      "/d",
      command,
      "/f",
    ]);
    if (!(await windowsAgentPid())) await powershell(start);

    return backgroundAgentStatus();
  }

  async function disableWindows(
    stopCurrent: boolean,
  ): Promise<BackgroundAgentStatus> {
    await runCommand(
      "reg.exe",
      ["delete", WINDOWS_RUN_KEY, "/v", WINDOWS_RUN_VALUE, "/f"],
      { ignoreFailure: true },
    );
    if (stopCurrent) {
      for (const role of ["--agent", "--supervise"]) {
        const pid = await windowsAgentPid(role);
        if (pid && pid !== process.pid)
          await powershell(
            "Stop-Process -Id " + pid + " -Force -ErrorAction SilentlyContinue",
            true,
          );
      }
    }
    return backgroundAgentStatus();
  }

  async function statusWindows(): Promise<BackgroundAgentStatus> {
    const enabledResult = await runCommand(
      "reg.exe",
      ["query", WINDOWS_RUN_KEY, "/v", WINDOWS_RUN_VALUE],
      { ignoreFailure: true },
    );
    const pid = await windowsAgentPid();
    return {
      supported: true,
      enabled: enabledResult.code === 0,
      active: pid !== null,
      service: "registry-run",
      pid,
      workerPid: await windowsAgentPid("--agent"),
      version: await backgroundBundleVersion(),
      detail:
        enabledResult.code === 0 && pid === null
          ? "Login startup is configured, but its supervisor is not running; recovery is unavailable."
          : undefined,
    };
  }

  async function backgroundAgentStatus(): Promise<BackgroundAgentStatus> {
    if (platform === "darwin") return statusMac();
    if (platform === "win32") return statusWindows();
    if (platform === "linux") return statusLinux();
    return {
      supported: false,
      enabled: false,
      active: false,
      service: "unsupported",
      detail: "unsupported operating system",
    };
  }

  async function enableBackgroundAgent(
    sourcePath: string,
    options: { preserveCurrent?: boolean; version?: string } = {},
  ) {
    const preserveCurrent = options.preserveCurrent ?? false;
    const before = await backgroundAgentStatus();
    let upgradeHandoff = false;
    if (before.workerPid && before.workerPid !== process.pid) {
      const knownOlderRelease =
        before.enabled && isOlderRelease(before.version, options.version);

      if (knownOlderRelease) {
        upgradeHandoff = true;
        if (platform === "darwin") await disableMac(true);
        else if (platform === "win32") await disableWindows(true);
        else if (platform === "linux") await disableLinux(true);
        else {
          throw new LegacyBackgroundAgentError(
            "The existing background Agent is older, but automatic handoff is not supported on this operating system.",
          );
        }

        let stopped = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          const status = await backgroundAgentStatus();
          if (!status.workerPid) {
            stopped = true;
            break;
          }
          await wait(250);
        }
        if (!stopped) {
          throw new LegacyBackgroundAgentError(
            "The older background Agent did not stop cleanly. Automatic upgrade was aborted before installing the new executor.",
          );
        }

        let leaseReleased = !(await leaseActive(AGENT_DIR));
        for (let attempt = 0; !leaseReleased && attempt < 60; attempt++) {
          await wait(250);
          leaseReleased = !(await leaseActive(AGENT_DIR));
        }
        if (!leaseReleased) {
          throw new LegacyBackgroundAgentError(
            "The older background Agent stopped, but its execution lease did not release in time. Automatic upgrade was aborted before starting the replacement executor.",
          );
        }
      } else {
        let participates = await leaseActive(AGENT_DIR);
        for (let attempt = 0; !participates && attempt < 6; attempt++) {
          await wait(500);
          participates = await leaseActive(AGENT_DIR);
        }

        if (!participates) {
          throw new LegacyBackgroundAgentError(
            "An existing background Agent does not hold the execution lease and cannot be identified as a safe older release. Stop it locally before retrying; this launch will not create a competing executor.",
          );
        }
      }
    }
    if (platform === "darwin")
      await enableMac(sourcePath, preserveCurrent, options.version);
    else if (platform === "win32")
      await enableWindows(sourcePath, preserveCurrent, options.version);
    else if (platform === "linux")
      await enableLinux(sourcePath, preserveCurrent, options.version);
    else return backgroundAgentStatus();
    const verifyAttempts = upgradeHandoff ? 80 : 20;
    for (let attempt = 0; attempt < verifyAttempts; attempt++) {
      const status = await backgroundAgentStatus();
      if (status.enabled && status.active) {
        if (!upgradeHandoff) return status;
        const versionMatches =
          !options.version || status.version === options.version;
        const workerOwnsLease =
          Boolean(status.workerPid) && (await leaseActive(AGENT_DIR));
        if (versionMatches && workerOwnsLease) return status;
      }
      if (!status.supported) return status;
      await wait(upgradeHandoff ? 250 : 200);
    }
    const status = await backgroundAgentStatus();
    throw new Error(
      status.detail ||
        "Background supervisor did not start; the current terminal remains connected.",
    );
  }

  async function disableBackgroundAgent(
    options: { stopCurrent?: boolean } = {},
  ) {
    const stopCurrent = options.stopCurrent ?? true;
    if (platform === "darwin") return disableMac(stopCurrent);
    if (platform === "win32") return disableWindows(stopCurrent);
    if (platform === "linux") return disableLinux(stopCurrent);
    return backgroundAgentStatus();
  }

  return {
    backgroundAgentStatus,
    enableBackgroundAgent,
    disableBackgroundAgent,
  };
}

export const {
  backgroundAgentStatus,
  enableBackgroundAgent,
  disableBackgroundAgent,
} = createBackgroundController();
