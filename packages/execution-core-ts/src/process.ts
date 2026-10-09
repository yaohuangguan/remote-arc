import { execFile, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
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

export async function runShellCommand(
  command: string,
  timeoutMs = 5000,
  cwd?: string,
) {
  const timeout = Math.max(100, Math.min(120_000, Math.trunc(timeoutMs || 5000)));
  const startedAt = Date.now();

  return await new Promise<{
    command: string;
    cwd: string | null;
    exit_code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    duration_ms: number;
    timed_out: boolean;
  }>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd,
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
        cwd: cwd || null,
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


type ManagedProcess = {
  id: string;
  child: ChildProcess;
  command: string;
  cwd: string | null;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

const managedProcesses = new Map<string, ManagedProcess>();
const MAX_MANAGED_PROCESSES = 32;
const FINISHED_PROCESS_RETENTION_MS = 30 * 60 * 1000;

function cleanupManagedProcesses() {
  const now = Date.now();
  for (const [id, item] of managedProcesses) {
    if (
      item.endedAt !== null &&
      now - item.endedAt > FINISHED_PROCESS_RETENTION_MS
    ) {
      managedProcesses.delete(id);
    }
  }

  if (managedProcesses.size <= MAX_MANAGED_PROCESSES) return;
  const finished = [...managedProcesses.values()]
    .filter((item) => item.endedAt !== null)
    .sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));
  for (const item of finished) {
    if (managedProcesses.size <= MAX_MANAGED_PROCESSES) break;
    managedProcesses.delete(item.id);
  }
}

export async function startBackgroundProcess(command: string, cwd?: string, maxDurationSeconds?: number) {
  if (maxDurationSeconds !== undefined && (!Number.isInteger(maxDurationSeconds) || maxDurationSeconds < 1 || maxDurationSeconds > 7 * 86400)) throw new Error("Invalid managed process duration.");
  cleanupManagedProcesses();
  if (managedProcesses.size >= MAX_MANAGED_PROCESSES) {
    throw new Error(
      "Remote Arc already has the maximum number of managed background processes on this device.",
    );
  }

  const child = spawn(command, {
    shell: true,
    cwd,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const id = crypto.randomUUID();
  const item: ManagedProcess = {
    id,
    child,
    command,
    cwd: cwd || null,
    startedAt: Date.now(),
    endedAt: null,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
  };
  managedProcesses.set(id, item);
  const deadlineTimer = maxDurationSeconds === undefined ? undefined : setTimeout(() => {
    item.stderr = appendCapped(item.stderr, "\nRemote Arc: authorized process time budget exhausted.");
    void terminateTree(child);
  }, maxDurationSeconds * 1000);
  deadlineTimer?.unref();

  child.stdout?.on("data", (chunk) => {
    item.stdout = appendCapped(item.stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    item.stderr = appendCapped(item.stderr, chunk);
  });
  child.once("error", (error) => {
    clearTimeout(deadlineTimer);
    item.stderr = appendCapped(item.stderr, "\n" + error.message);
    item.endedAt = Date.now();
  });
  child.once("close", (code, signal) => {
    clearTimeout(deadlineTimer);
    item.exitCode = code;
    item.signal = signal;
    item.endedAt = Date.now();
  });

  return {
    process_id: id,
    pid: child.pid || null,
    command,
    cwd: cwd || null,
    status: "running",
    started_at: new Date(item.startedAt).toISOString(),
  };
}

function managedProcessOrThrow(processId: string) {
  cleanupManagedProcesses();
  const item = managedProcesses.get(processId);
  if (!item) {
    throw new Error(
      "Managed process not found or its local retention window has expired.",
    );
  }
  return item;
}

export function getManagedProcessStatus(processId: string) {
  const item = managedProcessOrThrow(processId);
  return {
    process_id: item.id,
    pid: item.child.pid || null,
    command: item.command,
    cwd: item.cwd,
    status: item.endedAt === null ? "running" : "exited",
    exit_code: item.exitCode,
    signal: item.signal,
    started_at: new Date(item.startedAt).toISOString(),
    ended_at: item.endedAt === null ? null : new Date(item.endedAt).toISOString(),
    duration_ms: (item.endedAt || Date.now()) - item.startedAt,
  };
}

export function readManagedProcessOutput(processId: string) {
  const item = managedProcessOrThrow(processId);
  return {
    ...getManagedProcessStatus(processId),
    stdout: item.stdout,
    stderr: item.stderr,
    truncated:
      Buffer.byteLength(item.stdout) >= MAX_CAPTURE_BYTES ||
      Buffer.byteLength(item.stderr) >= MAX_CAPTURE_BYTES,
  };
}

export async function stopManagedProcess(processId: string) {
  const item = managedProcessOrThrow(processId);
  if (item.endedAt !== null) {
    return {
      ...getManagedProcessStatus(processId),
      stopped: false,
      already_exited: true,
    };
  }

  await terminateTree(item.child);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    ...getManagedProcessStatus(processId),
    stopped: true,
    already_exited: false,
  };
}


export async function stopAllManagedProcesses() {
  const running = [...managedProcesses.values()].filter(
    (item) => item.endedAt === null,
  );
  await Promise.all(
    running.map(async (item) => {
      await terminateTree(item.child).catch(() => undefined);
    }),
  );
}


export function listManagedProcesses() {
  cleanupManagedProcesses();
  return [...managedProcesses.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((item) => ({
      process_id: item.id,
      pid: item.child.pid || null,
      command: item.command,
      cwd: item.cwd,
      status: item.endedAt === null ? "running" : "exited",
      exit_code: item.exitCode,
      signal: item.signal,
      started_at: new Date(item.startedAt).toISOString(),
      ended_at: item.endedAt === null ? null : new Date(item.endedAt).toISOString(),
      duration_ms: (item.endedAt || Date.now()) - item.startedAt,
      stdout_bytes: Buffer.byteLength(item.stdout),
      stderr_bytes: Buffer.byteLength(item.stderr),
    }));
}
