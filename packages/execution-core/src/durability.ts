import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Both engines deliberately use the same explicit durability profiles.
// The default retains Go's fsync semantics and upgrades the TS fallback.
export type FileDurability = "atomic" | "durable";
export function fileDurability(): FileDurability {
  return process.env.REMOTEARC_FILE_DURABILITY === "atomic" ? "atomic" : "durable";
}

export async function syncDirectory(dir: string) {
  if (fileDurability() !== "durable" || process.platform === "win32") return;
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
      if (fileDurability() === "durable") await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, target);
    await syncDirectory(dir);
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
