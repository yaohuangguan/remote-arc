import { spawn, type ChildProcess } from "node:child_process";

const HELPER_SECONDS = 210;
const windowsScript = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class RemoteArcPower { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags); }'
if ([RemoteArcPower]::SetThreadExecutionState([uint32]2147483649) -eq 0) { exit 1 }
try { Start-Sleep -Seconds ${HELPER_SECONDS} } finally { [RemoteArcPower]::SetThreadExecutionState([uint32]2147483648) | Out-Null }
`;

export function createTaskKeepAwakeManager(options: {
  platform?: NodeJS.Platform; now?: () => number; spawn?: typeof spawn;
} = {}) {
  const platform = options.platform || process.platform;
  const clock = options.now || Date.now;
  const launch = options.spawn || spawn;
  const leases = new Map<string, number>();
  let helper: ChildProcess | null = null;
  let helperUntil = 0;
  let closed = false;
  let failure: string | null = null;
  const supported = ["darwin", "win32", "linux"].includes(platform);

  const stop = () => { helper?.kill(); helper = null; helperUntil = 0; };
  const sweep = () => {
    for (const [id, expires] of leases) if (expires <= clock()) leases.delete(id);
    if (!leases.size) stop();
  };
  const timer = setInterval(sweep, 15_000);
  timer.unref();

  async function start() {
    if (helper && helperUntil > clock() + 90_000) return;
    stop();
    const [command, args] = platform === "darwin"
      ? ["caffeinate", ["-i", "-t", String(HELPER_SECONDS)]]
      : platform === "win32"
        ? ["powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", windowsScript]]
        : ["systemd-inhibit", ["--what=sleep", "--mode=block", "--who=Remote Arc", "--why=An authorized task is active", "sleep", String(HELPER_SECONDS)]];
    const child = launch(command as string, args as string[], { windowsHide: true, stdio: "ignore" });
    helper = child;
    helperUntil = clock() + HELPER_SECONDS * 1000;
    failure = null;
    child.once("exit", code => {
      if (helper !== child) return;
      helper = null;
      helperUntil = 0;
      if (code !== 0 && code !== null) failure = "Power inhibitor exited with code " + code;
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", error => { failure = error.message; helper = null; helperUntil = 0; reject(error); });
    });
  }

  return {
    async set(taskId: string, seconds: number) {
      if (closed) throw new Error("Keep-awake manager is closed.");
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(taskId) || !Number.isInteger(seconds) || seconds < 0 || seconds > 180) throw new Error("Invalid keep-awake lease.");
      if (seconds === 0) leases.delete(taskId); else leases.set(taskId, clock() + seconds * 1000);
      sweep();
      if (!supported) return { supported: false, active: false, detail: "OS power inhibition is unavailable." };
      if (leases.size) await start();
      return { supported, active: Boolean(helper), leased_tasks: leases.size, detail: failure };
    },
    status() { sweep(); return { supported, active: Boolean(helper), leased_tasks: leases.size, detail: failure }; },
    close() { closed = true; clearInterval(timer); leases.clear(); stop(); },
  };
}
