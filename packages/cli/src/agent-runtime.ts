import fs from "node:fs/promises";
import { appendFileSync, mkdirSync, renameSync, statSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { lock, check } from "proper-lockfile";

// Every participant uses identical timings. A stalled owner loses its lease
// and fails closed; a killed owner is reclaimable within this stale interval.
export const AGENT_LEASE_STALE_MS = 15_000;
export async function agentLeaseActive(directory: string) {
  return check(path.join(directory, "execution"), {
    realpath: false,
    stale: AGENT_LEASE_STALE_MS,
  });
}
export async function tryAgentLease(directory: string, role = "execution") {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    return await lock(path.join(directory, role), {
      realpath: false,
      stale: AGENT_LEASE_STALE_MS,
      update: 3_000,
      retries: 0,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED") return null;
    throw error;
  }
}

export function appendAgentEvent(directory: string, line: string) {
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, "events.log");
    if (
      (statSync(file, { throwIfNoEntry: false })?.size ?? 0) >
      5 * 1024 * 1024
    ) {
      renameSync(file, file + ".1");
    }
    appendFileSync(file, line.replace(/\x1b\[[0-9;]*m/g, ""), { mode: 0o600 });
  } catch {
    // A disk/logging failure must not interrupt an authorized operation.
  }
}

export async function readAgentEvents(
  directory: string,
  cursor: number | null,
) {
  const file = path.join(directory, "events.log");
  let handle;
  try {
    handle = await fs.open(file, "r");
    const size = (await handle.stat()).size;
    const start =
      cursor === null ? Math.max(0, size - 16_384) : cursor > size ? 0 : cursor;
    const buffer = Buffer.alloc(Math.min(size - start, 64 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const content = buffer.subarray(0, bytesRead).toString("utf8");
    return {
      cursor: start + bytesRead,
      text:
        cursor === null ? content.split("\n").slice(-21).join("\n") : content,
    };
  } catch {
    return { cursor, text: "" };
  } finally {
    await handle?.close();
  }
}

export async function readAgentEventTail(
  directory: string,
  requestedLimit = 100,
) {
  const limit = Math.max(20, Math.min(200, Math.trunc(requestedLimit || 100)));
  const file = path.join(directory, "events.log");
  let handle;
  try {
    handle = await fs.open(file, "r");
    const stat = await handle.stat();
    const start = Math.max(0, stat.size - 128 * 1024);
    const buffer = Buffer.alloc(Math.min(stat.size - start, 128 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    let lines = buffer
      .subarray(0, bytesRead)
      .toString("utf8")
      .split("\n");

    // Starting mid-file can leave the first entry partial.
    if (start > 0) lines = lines.slice(1);
    lines = lines.map((line) => line.trimEnd()).filter(Boolean);

    return {
      source: "local-device" as const,
      lines: lines.slice(-limit),
      total_bytes: stat.size,
      truncated: start > 0 || lines.length > limit,
      updated_at: stat.mtime.toISOString(),
    };
  } catch {
    return {
      source: "local-device" as const,
      lines: [],
      total_bytes: 0,
      truncated: false,
      updated_at: null,
    };
  } finally {
    await handle?.close();
  }
}

export async function superviseAgent(options: {
  enabled: () => Promise<boolean>;
  signal: AbortSignal;
  start: () => ChildProcess;
  delayMs?: number;
}) {
  let delay = options.delayMs ?? 1_000;
  while (!options.signal.aborted && (await options.enabled())) {
    const startedAt = Date.now();
    const child = options.start();
    const abort = () => child.kill();
    options.signal.addEventListener("abort", abort, { once: true });
    await new Promise<void>((resolve) => {
      child.once("error", () => resolve());
      child.once("close", () => resolve());
      if (options.signal.aborted) abort();
    });
    options.signal.removeEventListener("abort", abort);
    if (options.signal.aborted || !(await options.enabled())) break;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        options.signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, delay);
      options.signal.addEventListener("abort", finish, { once: true });
      if (options.signal.aborted) finish();
    });
    delay =
      Date.now() - startedAt > 60_000
        ? (options.delayMs ?? 1_000)
        : Math.min(delay * 2, 30_000);
  }
}

export function startSupervisedAgent(node: string, bundle: string, logs?: string) {
  if (!logs) return spawn(node, [bundle, "--ts", "--agent"], { stdio: "inherit", windowsHide: true });
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  const out = openSync(path.join(logs, "agent.log"), "a", 0o600);
  let err: number | undefined;
  try {
    err = openSync(path.join(logs, "agent-error.log"), "a", 0o600);
    return spawn(node, [bundle, "--ts", "--agent"], { stdio: ["ignore", out, err], windowsHide: true });
  } finally { closeSync(out); if (err !== undefined) closeSync(err); }
}
