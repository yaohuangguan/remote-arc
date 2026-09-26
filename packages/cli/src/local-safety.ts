import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const UNDO_ROOT = path.join(os.homedir(), ".remotearc", "undo");
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
const MAX_UNDO_BYTES = 200 * 1024 * 1024;

type UndoManifest = {
  id: string;
  createdAt: string;
  tool: "write_file" | "edit_block";
  targetPath: string;
  existed: boolean;
  mode?: number;
  bytes: number;
  postChangeHash?: string;
};

export type UndoSnapshot = {
  id: string;
  directory: string;
  manifest: UndoManifest;
};

async function ensureUndoRoot() {
  await fs.mkdir(UNDO_ROOT, { recursive: true, mode: 0o700 });
}

async function readManifest(directory: string): Promise<UndoManifest | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.join(directory, "manifest.json"), "utf8"),
    ) as UndoManifest;
  } catch {
    return null;
  }
}

async function snapshotDirectories() {
  await ensureUndoRoot();
  const entries = await fs.readdir(UNDO_ROOT, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(UNDO_ROOT, entry.name));
}

async function cleanupUndoStore() {
  const now = Date.now();
  const snapshots: Array<{ directory: string; manifest: UndoManifest }> = [];

  for (const directory of await snapshotDirectories()) {
    const manifest = await readManifest(directory);
    if (!manifest) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
      continue;
    }

    const created = Date.parse(manifest.createdAt);
    if (!Number.isFinite(created) || now - created > RETENTION_MS) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
      continue;
    }

    snapshots.push({ directory, manifest });
  }

  snapshots.sort(
    (a, b) => Date.parse(a.manifest.createdAt) - Date.parse(b.manifest.createdAt),
  );

  let total = snapshots.reduce((sum, item) => sum + item.manifest.bytes, 0);
  for (const item of snapshots) {
    if (total <= MAX_UNDO_BYTES) break;
    await fs.rm(item.directory, { recursive: true, force: true }).catch(() => undefined);
    total -= item.manifest.bytes;
  }
}

function mutationPath(
  tool: "write_file" | "edit_block",
  args: Record<string, unknown>,
) {
  const candidate = tool === "write_file" ? args.path : args.file_path;
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

export async function createUndoSnapshot(
  tool: "write_file" | "edit_block",
  args: Record<string, unknown>,
): Promise<UndoSnapshot | null> {
  const targetPath = mutationPath(tool, args);
  if (!targetPath) return null;

  await cleanupUndoStore();

  let existed = false;
  let mode: number | undefined;
  let bytes = 0;
  let original: Buffer | null = null;

  try {
    const stat = await fs.stat(targetPath);
    if (!stat.isFile()) return null;
    existed = true;
    mode = stat.mode;
    bytes = stat.size;
    if (bytes > MAX_SNAPSHOT_BYTES) return null;
    original = await fs.readFile(targetPath);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code !== "ENOENT") throw error;
  }

  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const directory = path.join(UNDO_ROOT, id);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });

  if (original) {
    await fs.writeFile(path.join(directory, "content.bin"), original, { mode: 0o600 });
  }

  const manifest: UndoManifest = {
    id,
    createdAt: new Date().toISOString(),
    tool,
    targetPath,
    existed,
    ...(mode !== undefined ? { mode } : {}),
    bytes,
  };

  await fs.writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );

  await cleanupUndoStore();
  return { id, directory, manifest };
}

async function hashFile(filePath: string) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function finalizeUndoSnapshot(snapshot: UndoSnapshot | null) {
  if (!snapshot) return false;
  try {
    const postChangeHash = await hashFile(snapshot.manifest.targetPath);
    snapshot.manifest.postChangeHash = postChangeHash;
    await fs.writeFile(
      path.join(snapshot.directory, "manifest.json"),
      JSON.stringify(snapshot.manifest, null, 2) + "\n",
      { mode: 0o600 },
    );
    return true;
  } catch {
    await discardUndoSnapshot(snapshot);
    return false;
  }
}

export async function discardUndoSnapshot(snapshot: UndoSnapshot | null) {
  if (!snapshot) return;
  await fs.rm(snapshot.directory, { recursive: true, force: true }).catch(() => undefined);
}

export async function undoLastChange() {
  const candidates: Array<{ directory: string; manifest: UndoManifest }> = [];
  for (const directory of await snapshotDirectories()) {
    const manifest = await readManifest(directory);
    if (manifest) candidates.push({ directory, manifest });
  }

  candidates.sort(
    (a, b) => Date.parse(b.manifest.createdAt) - Date.parse(a.manifest.createdAt),
  );
  const latest = candidates[0];
  if (!latest) {
    throw new Error("No reversible Remote Arc file change is available on this device.");
  }

  if (!latest.manifest.postChangeHash) {
    throw new Error(
      "This snapshot predates conflict-safe Local Undo and cannot be restored automatically.",
    );
  }

  let currentHash: string;
  try {
    currentHash = await hashFile(latest.manifest.targetPath);
  } catch {
    throw new Error(
      "The target file changed or disappeared after the Remote Arc edit. Automatic undo was refused to avoid overwriting newer work.",
    );
  }

  if (currentHash !== latest.manifest.postChangeHash) {
    throw new Error(
      "The target file changed again after the Remote Arc edit. Automatic undo was refused to avoid overwriting newer work.",
    );
  }

  if (latest.manifest.existed) {
    const original = await fs.readFile(path.join(latest.directory, "content.bin"));
    await fs.mkdir(path.dirname(latest.manifest.targetPath), { recursive: true });
    await fs.writeFile(latest.manifest.targetPath, original);
    if (latest.manifest.mode !== undefined) {
      await fs.chmod(latest.manifest.targetPath, latest.manifest.mode).catch(() => undefined);
    }
  } else {
    await fs.rm(latest.manifest.targetPath, { force: true });
  }

  await fs.rm(latest.directory, { recursive: true, force: true });

  return {
    restored: true,
    action_id: latest.manifest.id,
    tool: latest.manifest.tool,
    path: latest.manifest.targetPath,
    snapshot_location: "local-device-only",
  };
}

type GuardRule = {
  pattern: RegExp;
  reason: string;
};

const DESTRUCTIVE_COMMAND_RULES: GuardRule[] = [
  {
    pattern: /(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+[^\n]*(?:-rf|-fr|-[a-z]*r[a-z]*f)[^\n]*(?:\s\/\s*$|\s\/\*|\s~(?:\s|$)|\s\$HOME(?:\s|$))/i,
    reason: "recursive deletion of a root or home path",
  },
  {
    pattern: /\b(?:mkfs(?:\.\w+)?|wipefs|fdisk|parted)\b/i,
    reason: "disk or filesystem destructive operation",
  },
  {
    pattern: /\bdd\b[^\n]*\bof=\/dev\/(?:sd|nvme|vd|xvd|mmcblk)/i,
    reason: "raw disk overwrite",
  },
  {
    pattern: /\bdiskutil\s+erase(?:disk|volume)\b/i,
    reason: "disk erase",
  },
  {
    pattern: /\b(?:format(?:\.com)?\s+[a-z]:|diskpart\b|clear-disk\b|initialize-disk\b)/i,
    reason: "Windows disk destructive operation",
  },
  {
    pattern: /\b(?:shutdown|reboot|halt|poweroff)\b/i,
    reason: "system shutdown or reboot",
  },
  {
    pattern: /\bremove-item\b[^\n]*(?:-recurse[^\n]*-force|-force[^\n]*-recurse)[^\n]*(?:[a-z]:\\(?:\*|\s|$)|\$env:systemdrive)/i,
    reason: "recursive forced deletion of a drive root",
  },
  {
    pattern: /\b(?:del|erase|rd|rmdir)\b[^\n]*\/s[^\n]*\/q[^\n]*[a-z]:\\/i,
    reason: "recursive Windows drive deletion",
  },
  {
    pattern: /:\(\)\s*\{\s*:\|:&\s*\};\s*:/,
    reason: "fork bomb",
  },
];

export function assertCommandAllowed(command: string) {
  if (process.env.REMOTEARC_ALLOW_DESTRUCTIVE === "1") return;

  for (const rule of DESTRUCTIVE_COMMAND_RULES) {
    if (rule.pattern.test(command)) {
      throw new Error(
        "Blocked by Remote Arc Safety Guard: " +
          rule.reason +
          ". Run this action manually on the device if you intentionally need it.",
      );
    }
  }
}
