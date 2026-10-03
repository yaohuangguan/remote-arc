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

const BINARY_DEFAULT_BYTES = 64 * 1024;
const BINARY_MAX_BYTES = 256 * 1024;

function binaryFileRevision(stat: { size: number; mtimeMs: number }) {
  return crypto
    .createHash("sha256")
    .update(String(stat.size) + ":" + String(stat.mtimeMs))
    .digest("hex");
}

function assertBinaryRevision(expected: string | undefined, actual: string) {
  if (expected && expected !== actual) {
    throw new Error(
      "FILE_CHANGED_DURING_READ: Binary file changed since the previous chunk. Restart from offset 0 with the new file_revision.",
    );
  }
}

function binaryMimeType(targetPath: string, header?: Buffer) {
  const extension = path.extname(targetPath).toLowerCase();
  const office: Record<string, string> = {
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  if (office[extension]) return office[extension];

  const bytes = header || Buffer.alloc(0);
  const ascii = bytes.toString("ascii");
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "image/gif";
  if (ascii.startsWith("%PDF-")) return "application/pdf";
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return "application/gzip";
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
    return "application/wasm";
  }
  if (bytes.length >= 12 && ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") {
    return "image/webp";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  ) {
    return "application/zip";
  }

  const known: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".gz": "application/gzip",
    ".wasm": "application/wasm",
  };
  return known[extension] || "application/octet-stream";
}

export async function readBinaryFile(
  targetPath: string,
  offset = 0,
  length = BINARY_DEFAULT_BYTES,
  expectedRevision?: string,
) {
  const stat = await fs.stat(targetPath);
  if (!stat.isFile()) throw new Error("Path is not a file: " + targetPath);
  const fileRevision = binaryFileRevision(stat);
  assertBinaryRevision(expectedRevision, fileRevision);

  const byteOffset = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  const requested = Number.isFinite(length) ? Math.trunc(length) : BINARY_DEFAULT_BYTES;
  if (requested <= 0) throw new Error("length must be a positive byte count.");
  if (requested > BINARY_MAX_BYTES) {
    throw new Error("read_binary_file length cannot exceed " + BINARY_MAX_BYTES + " bytes.");
  }

  if (byteOffset >= stat.size) {
    return {
      path: targetPath,
      mime_type: binaryMimeType(targetPath),
      encoding: "base64",
      size: stat.size,
      file_revision: fileRevision,
      offset: byteOffset,
      bytes_read: 0,
      eof: true,
      chunk_sha256: crypto.createHash("sha256").update(Buffer.alloc(0)).digest("hex"),
      data: "",
    };
  }

  const toRead = Math.min(requested, stat.size - byteOffset);
  const handle = await fs.open(targetPath, "r");
  try {
    const headerBuffer = Buffer.allocUnsafe(Math.min(16, stat.size));
    const headerResult = await handle.read(
      headerBuffer,
      0,
      headerBuffer.length,
      0,
    );
    const header = headerBuffer.subarray(0, headerResult.bytesRead);
    const buffer = Buffer.allocUnsafe(toRead);
    const result = await handle.read(buffer, 0, toRead, byteOffset);
    const chunk = buffer.subarray(0, result.bytesRead);
    const afterStat = await fs.stat(targetPath);
    const afterRevision = binaryFileRevision(afterStat);
    if (afterRevision !== fileRevision) {
      throw new Error(
        "FILE_CHANGED_DURING_READ: Binary file changed while this chunk was being read. Restart from offset 0.",
      );
    }
    return {
      path: targetPath,
      mime_type: binaryMimeType(targetPath, header),
      encoding: "base64",
      size: stat.size,
      file_revision: fileRevision,
      offset: byteOffset,
      bytes_read: result.bytesRead,
      eof: byteOffset + result.bytesRead >= stat.size,
      chunk_sha256: crypto.createHash("sha256").update(chunk).digest("hex"),
      data: chunk.toString("base64"),
    };
  } finally {
    await handle.close();
  }
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


export async function browseDirectories(
  targetPath: string,
  canReveal?: (candidatePath: string) => Promise<boolean>,
) {
  const stat = await fs.stat(targetPath);
  if (!stat.isDirectory()) throw new Error("Path is not a directory: " + targetPath);

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const directories: Array<{ name: string; path: string; type: "directory" | "symlink" }> = [];
  let protectedEntries = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const absolute = path.join(targetPath, entry.name);
    if (canReveal && !(await canReveal(absolute))) {
      protectedEntries += 1;
      continue;
    }
    directories.push({
      name: entry.name,
      path: absolute,
      type: entry.isSymbolicLink() ? "symlink" : "directory",
    });
    if (directories.length >= 300) break;
  }

  directories.sort((a, b) => a.name.localeCompare(b.name));

  return {
    path: targetPath,
    parent: path.dirname(targetPath) === targetPath ? null : path.dirname(targetPath),
    directories,
    protected_entries_omitted: protectedEntries,
    truncated: directories.length >= 300,
  };
}
