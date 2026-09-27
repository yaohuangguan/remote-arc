import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const MAX_DIRECTORY_ENTRIES = 2000;
const DEFAULT_READ_LINES = 240;
const MAX_TEXT_FILE_BYTES = 20 * 1024 * 1024;

const printableSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export async function listDirectory(
  targetPath: string,
  depth = 2,
  canReveal?: (candidatePath: string) => Promise<boolean>,
) {
  const maxDepth = Math.max(1, Math.min(10, Math.trunc(depth || 2)));
  const lines: string[] = [];
  let entriesSeen = 0;
  let protectedEntries = 0;

  async function walk(directory: string, level: number, prefix: string) {
    if (entriesSeen >= MAX_DIRECTORY_ENTRIES) return;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (entriesSeen >= MAX_DIRECTORY_ENTRIES) break;
      const absolute = path.join(directory, entry.name);

      if (canReveal && !(await canReveal(absolute))) {
        protectedEntries += 1;
        continue;
      }

      entriesSeen += 1;
      const label = entry.isDirectory()
        ? "[DIR]"
        : entry.isSymbolicLink()
          ? "[LINK]"
          : "[FILE]";
      lines.push(`${prefix}${label} ${entry.name}`);

      if (entry.isDirectory() && level < maxDepth) {
        await walk(absolute, level + 1, prefix + "  ");
      }
    }
  }

  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) throw new Error("Path is not a directory: " + targetPath);

  await walk(targetPath, 1, "");
  if (entriesSeen >= MAX_DIRECTORY_ENTRIES) {
    lines.push(`… truncated after ${MAX_DIRECTORY_ENTRIES} entries`);
  }

  const protectionNote = protectedEntries
    ? `\n\n[Remote Arc omitted ${protectedEntries} protected or out-of-scope entr${protectedEntries === 1 ? "y" : "ies"}.]`
    : "";

  return `Directory: ${targetPath}\nDepth: ${maxDepth}\n\n${lines.join("\n") || "(empty)"}${protectionNote}`;
}

export async function readTextFile(
  targetPath: string,
  offset?: number,
  length?: number,
) {
  const stat = await fs.stat(targetPath);
  if (!stat.isFile()) throw new Error("Path is not a file: " + targetPath);
  if (stat.size > MAX_TEXT_FILE_BYTES) {
    throw new Error(
      `File is too large for read_file (${printableSize(stat.size)} > 20 MB). Use a terminal command or a more targeted tool instead.`,
    );
  }

  const buffer = await fs.readFile(targetPath);
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (sample.includes(0)) {
    throw new Error("Binary file detected. read_file currently supports text files only.");
  }

  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  const requestedOffset = Number.isFinite(offset) ? Math.trunc(offset as number) : 0;
  const start =
    requestedOffset < 0
      ? Math.max(0, lines.length + requestedOffset)
      : Math.min(lines.length, Math.max(0, requestedOffset));
  const requestedLength =
    Number.isFinite(length) && (length as number) > 0
      ? Math.trunc(length as number)
      : DEFAULT_READ_LINES;
  const end = Math.min(lines.length, start + requestedLength);
  const chunk = lines.slice(start, end).join("\n");

  const location =
    start === 0
      ? "start"
      : end === lines.length
        ? `line ${start + 1} to end`
        : `lines ${start + 1}-${end}`;

  return `[Reading ${end - start} lines from ${location} (total: ${lines.length} lines, ${printableSize(stat.size)})]\n\n${chunk}`;
}

export async function getFileInfo(targetPath: string) {
  const stat = await fs.lstat(targetPath);
  return {
    path: targetPath,
    type: stat.isFile()
      ? "file"
      : stat.isDirectory()
        ? "directory"
        : stat.isSymbolicLink()
          ? "symlink"
          : "other",
    size: stat.size,
    size_human: printableSize(stat.size),
    mode: stat.mode,
    created_at: stat.birthtime.toISOString(),
    modified_at: stat.mtime.toISOString(),
    accessed_at: stat.atime.toISOString(),
  };
}

async function atomicWriteText(targetPath: string, content: string) {
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true });
  const temporary = path.join(
    directory,
    "." + path.basename(targetPath) + ".remotearc-" + crypto.randomUUID() + ".tmp",
  );

  try {
    await fs.writeFile(temporary, content, "utf8");
    await fs.rename(temporary, targetPath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function writeTextFile(
  targetPath: string,
  content: string,
  mode: "rewrite" | "append" = "rewrite",
) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  if (mode === "append") {
    await fs.appendFile(targetPath, content, "utf8");
  } else {
    await atomicWriteText(targetPath, content);
  }
  const stat = await fs.stat(targetPath);
  return {
    path: targetPath,
    mode,
    bytes: Buffer.byteLength(content),
    file_size: stat.size,
    atomic: mode === "rewrite",
  };
}

export async function editTextBlock(
  filePath: string,
  oldString: string,
  newString: string,
  expectedReplacements = 1,
) {
  if (!oldString) throw new Error("old_string cannot be empty.");
  const current = await fs.readFile(filePath, "utf8");
  const parts = current.split(oldString);
  const replacements = parts.length - 1;

  if (replacements !== expectedReplacements) {
    throw new Error(
      `Expected ${expectedReplacements} replacement(s) in ${filePath}, found ${replacements}. No changes were written.`,
    );
  }

  const next = parts.join(newString);
  await atomicWriteText(filePath, next);
  return {
    path: filePath,
    replacements,
    bytes_before: Buffer.byteLength(current),
    bytes_after: Buffer.byteLength(next),
    atomic: true,
  };
}
