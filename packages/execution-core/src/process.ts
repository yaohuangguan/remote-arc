import { execFile, spawn } from "node:child_process";
import process from "node:process";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

function appendCapped(current: string, chunk: Buffer | string) {
  if (Buffer.byteLength(current) >= MAX_CAPTURE_BYTES) return current;
  const next = current + chunk.toString();
  if (Buffer.byteLength(next) <= MAX_CAPTURE_BYTES) return next;
  return next.slice(0, MAX_CAPTURE_BYTES) + "\n… output truncated …";
}

export async function listProcesses() {
  const output = await new Promise<string>((resolve, reject) => {
    const command = process.platform === "win32" ? "tasklist.exe" : "ps";
    const args =
      process.platform === "win32"
        ? ["/FO", "CSV", "/NH"]
        : ["-axo", "pid,ppid,user,%cpu,%mem,etime,command"];
    execFile(command, args, { maxBuffer: MAX_CAPTURE_BYTES }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Could not list processes: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });

  return `Processes on ${process.platform}:\n\n${output}`;
}

async function terminateTree(child: ReturnType<typeof spawn>) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    if (!child.killed) child.kill("SIGKILL");
  }
}

export async function runShellCommand(command: string, timeoutMs = 5000) {
  const timeout = Math.max(100, Math.min(120_000, Math.trunc(timeoutMs || 5000)));
  const startedAt = Date.now();

  return await new Promise<{
    command: string;
    exit_code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    duration_ms: number;
    timed_out: boolean;
  }>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    child.stdout?.on("data", (chunk) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendCapped(stderr, chunk);
    });

    const timer = setTimeout(async () => {
      timedOut = true;
      await terminateTree(child);
    }, timeout);

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        exit_code: code,
        signal,
        stdout,
        stderr,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
      });
    });
  });
}
