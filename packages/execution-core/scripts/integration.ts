import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RemoteArcExecutionCore, assertCommandAllowed } from "../src/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "remotearc-core-"));
process.env.REMOTEARC_UNDO_ROOT = path.join(root, ".undo");

const safe = new RemoteArcExecutionCore("safe");
const developer = new RemoteArcExecutionCore("developer");
const full = new RemoteArcExecutionCore("full");

try {
  const safeNames = safe.listTools().map((tool) => tool.name);
  const developerNames = developer.listTools().map((tool) => tool.name);
  const fullNames = full.listTools().map((tool) => tool.name);

  if (safeNames.includes("write_file") || safeNames.includes("start_process")) {
    throw new Error("safe mode exposed a mutating tool");
  }
  if (!developerNames.includes("write_file") || developerNames.includes("start_process")) {
    throw new Error("developer mode permissions are incorrect");
  }
  if (!fullNames.includes("start_process")) {
    throw new Error("full mode did not expose start_process");
  }

  const nested = path.join(root, "project", "src");
  const file = path.join(nested, "app.txt");
  await developer.callTool("write_file", {
    path: file,
    content: "alpha\nbeta\n",
    mode: "rewrite",
  });

  const read = await safe.callTool("read_file", { path: file, offset: 0, length: 10 });
  if (!read.content[0]?.text.includes("alpha")) throw new Error("read_file failed");

  await developer.callTool("edit_block", {
    file_path: file,
    old_string: "beta",
    new_string: "gamma",
    expected_replacements: 1,
  });
  if ((await fs.readFile(file, "utf8")) !== "alpha\ngamma\n") {
    throw new Error("edit_block failed");
  }

  await developer.callTool("undo_last_change", {});
  if ((await fs.readFile(file, "utf8")) !== "alpha\nbeta\n") {
    throw new Error("undo_last_change failed");
  }

  const tree = await safe.callTool("list_directory", { path: root, depth: 3 });
  if (!tree.content[0]?.text.includes("app.txt")) throw new Error("list_directory failed");

  const info = await safe.callTool("get_file_info", { path: file });
  if (!info.content[0]?.text.includes('"type": "file"')) throw new Error("get_file_info failed");

  const processes = await safe.callTool("list_processes", {});
  if (!processes.content[0]?.text.includes("Processes on")) throw new Error("list_processes failed");

  const processResult = await full.callTool("start_process", {
    command: "echo remotearc-core-ok",
    timeout_ms: 5000,
  });
  if (!processResult.content[0]?.text.includes("remotearc-core-ok")) {
    throw new Error("start_process failed");
  }

  let blocked = false;
  try {
    assertCommandAllowed(process.platform === "win32" ? "format C:" : "rm -rf /");
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error("Safety Guard did not block a catastrophic command");

  let safeBlocked = false;
  try {
    await safe.callTool("write_file", { path: file, content: "nope" });
  } catch {
    safeBlocked = true;
  }
  if (!safeBlocked) throw new Error("safe mode did not enforce its local cap");

  process.stdout.write(
    JSON.stringify(
      {
        platform: process.platform,
        safe: safeNames.length,
        developer: developerNames.length,
        full: fullNames.length,
        fileOps: "ok",
        undo: "ok",
        process: "ok",
        safetyGuard: "ok",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
