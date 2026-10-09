import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Both engines support equivalent explicit durability profiles for benchmark
// parity. Preserve the TS fallback's legacy atomic default; Go separately
// retains its durable default. Never silently slow all existing TS users.
export type FileDurability = "atomic" | "durable";
export function fileDurability(): FileDurability {
  return process.env.REMOTEARC_FILE_DURABILITY === "durable" ? "durable" : "atomic";
}
export function undoDurability(): FileDurability {
  const value = process.env.REMOTEARC_UNDO_DURABILITY;
  return value === undefined || value === "" ? fileDurability()
    : value === "atomic" ? "atomic" : "durable";
}

export async function syncDirectory(dir: string, durability = fileDurability()) {
  if (durability !== "durable" || process.platform === "win32") return;
  const handle = await fs.open(dir, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function atomicWriteFile(
  target: string,
  value: string | Buffer,
  mode?: number,
  durability = fileDurability(),
) {
  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, ".remotearc-" + crypto.randomUUID() + ".tmp");
  let created = false;
  try {
    const handle = await fs.open(tmp, "wx", mode ?? 0o666);
    created = true;
    try {
      await handle.writeFile(value);
      if (durability === "durable") await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, target);
    await syncDirectory(dir, durability);
  } finally {
    if (created) await fs.rm(tmp, { force: true }).catch(() => {});
  }
}

export async function appendWithDurability(target: string, text: string) {
  const handle = await fs.open(target, "a");
  try {
    await handle.writeFile(text);
    if (fileDurability() === "durable") await handle.sync();
  } finally {
    await handle.close();
  }
}
