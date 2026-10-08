import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

/** Sample the actual child process, excluding the benchmark driver. */
export async function processMetrics(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Invalid owned process PID");
  if (process.platform === "win32") {
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", `$p=Get-Process -Id ${pid} -ErrorAction Stop; @{rssBytes=$p.WorkingSet64;cpuMs=$p.TotalProcessorTime.TotalMilliseconds}|ConvertTo-Json -Compress`], { windowsHide: true });
    return JSON.parse(stdout);
  }
  const { stdout } = await exec("ps", ["-p", String(pid), "-o", "rss=", "-o", "time="], { windowsHide: true });
  const [rss, time] = stdout.trim().split(/\s+/);
  const parts = time.split(":").map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return { rssBytes: Number(rss) * 1024, cpuMs: seconds * 1000 };
}
