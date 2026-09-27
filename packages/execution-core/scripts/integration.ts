import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RemoteArcExecutionCore, assertCommandAllowed } from "../src/index.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "remotearc-core-"));
process.env.REMOTEARC_UNDO_ROOT = path.join(root, ".undo");

const safe = new RemoteArcExecutionCore("safe");
const developer = new RemoteArcExecutionCore("developer");
const full = new RemoteArcExecutionCore("full");

const jsonResult = <T>(result: { content: Array<{ text: string }> }) =>
  JSON.parse(result.content[0]?.text || "null") as T;

try {
  const safeNames = safe.listTools().map((tool) => tool.name);
  const developerNames = developer.listTools().map((tool) => tool.name);
  const fullNames = full.listTools().map((tool) => tool.name);

  if (safeNames.includes("write_file") || safeNames.includes("start_process")) {
    throw new Error("safe mode exposed a mutating tool");
  }
  if (!safeNames.includes("list_undo_actions")) {
    throw new Error("safe mode did not expose read-only undo history");
  }
  if (
    !developerNames.includes("write_file") ||
    !developerNames.includes("undo_change") ||
    developerNames.includes("start_process")
  ) {
    throw new Error("developer mode permissions are incorrect");
  }
  for (const required of ["start_process", "process_status", "process_output", "stop_process"]) {
    if (!fullNames.includes(required as never)) {
      throw new Error("full mode did not expose " + required);
    }
  }

  const project = path.join(root, "project");
  const nested = path.join(project, "src");
  const file = path.join(nested, "app.txt");
  const outside = path.join(root, "outside.txt");

  const policy = {
    workspaceRoots: [project],
    protectSensitivePaths: true,
    sensitivePaths: [],
    sensitiveAllowPaths: [],
    undoEnabled: true,
  };

  const write = await developer.callTool(
    "write_file",
    {
      path: file,
      content: "alpha\nbeta\n",
      mode: "rewrite",
    },
    policy,
  );
  if (!write.content[0]?.text.includes('"atomic": true')) {
    throw new Error("rewrite was not atomic");
  }

  const read = await safe.callTool(
    "read_file",
    { path: file, offset: 0, length: 10 },
    policy,
  );
  if (!read.content[0]?.text.includes("alpha")) throw new Error("read_file failed");

  let outsideBlocked = false;
  await fs.writeFile(outside, "outside");
  try {
    await safe.callTool("read_file", { path: outside }, policy);
  } catch {
    outsideBlocked = true;
  }
  if (!outsideBlocked) throw new Error("Workspace Scope did not block outside path");

  const envFile = path.join(project, ".env");
  await fs.writeFile(envFile, "SECRET=test");
  let sensitiveBlocked = false;
  try {
    await safe.callTool("read_file", { path: envFile }, policy);
  } catch {
    sensitiveBlocked = true;
  }
  if (!sensitiveBlocked) throw new Error("Sensitive Path Policy did not block .env");

  const allowedSensitive = await safe.callTool(
    "read_file",
    { path: envFile },
    { ...policy, sensitiveAllowPaths: [envFile] },
  );
  if (!allowedSensitive.content[0]?.text.includes("SECRET=test")) {
    throw new Error("Sensitive Path Policy narrow exception failed");
  }

  if (process.platform !== "win32") {
    const escapeLink = path.join(project, "escape-link");
    await fs.symlink(root, escapeLink, "dir");
    let symlinkBlocked = false;
    try {
      await safe.callTool(
        "read_file",
        { path: path.join(escapeLink, "outside.txt") },
        policy,
      );
    } catch {
      symlinkBlocked = true;
    }
    if (!symlinkBlocked) throw new Error("Workspace Scope allowed symlink escape");
  }

  await developer.callTool(
    "edit_block",
    {
      file_path: file,
      old_string: "beta",
      new_string: "gamma",
      expected_replacements: 1,
    },
    policy,
  );
  if ((await fs.readFile(file, "utf8")) !== "alpha\ngamma\n") {
    throw new Error("edit_block failed");
  }

  const history = jsonResult<Array<{
    id: string;
    path: string;
    can_undo: boolean;
    status: string;
  }>>(
    await safe.callTool("list_undo_actions", { limit: 20 }, policy),
  );
  if (!history.length || path.basename(history[0]?.path || "") !== "app.txt") {
    throw new Error("Local Undo history did not return the latest file change");
  }
  if (!history[0]?.can_undo || history[0]?.status !== "ready") {
    throw new Error("Local Undo history did not report a ready snapshot");
  }

  await developer.callTool(
    "undo_change",
    { action_id: history[0]!.id },
    policy,
  );
  if ((await fs.readFile(file, "utf8")) !== "alpha\nbeta\n") {
    throw new Error("undo_change failed");
  }

  await developer.callTool(
    "edit_block",
    {
      file_path: file,
      old_string: "beta",
      new_string: "delta",
      expected_replacements: 1,
    },
    policy,
  );
  await fs.writeFile(file, "alpha\nmanual-newer-change\n");
  const conflictHistory = jsonResult<Array<{
    can_undo: boolean;
    status: string;
  }>>(
    await safe.callTool("list_undo_actions", { limit: 5 }, policy),
  );
  if (
    conflictHistory[0]?.can_undo !== false ||
    conflictHistory[0]?.status !== "conflict"
  ) {
    throw new Error("Local Undo history did not surface a file conflict");
  }
  await fs.writeFile(file, "alpha\nbeta\n");

  const tree = await safe.callTool(
    "list_directory",
    { path: project, depth: 3 },
    policy,
  );
  if (!tree.content[0]?.text.includes("app.txt")) {
    throw new Error("list_directory failed");
  }
  if (tree.content[0]?.text.includes(".env")) {
    throw new Error("Sensitive Path Policy leaked a protected filename through list_directory");
  }
  if (!tree.content[0]?.text.includes("Remote Arc omitted")) {
    throw new Error("list_directory did not report that protected entries were omitted");
  }

  const info = await safe.callTool("get_file_info", { path: file }, policy);
  if (!info.content[0]?.text.includes('"type": "file"')) {
    throw new Error("get_file_info failed");
  }

  const processes = await safe.callTool("list_processes", {}, policy);
  if (!processes.content[0]?.text.includes("Processes on")) {
    throw new Error("list_processes failed");
  }

  let missingCwdBlocked = false;
  try {
    await full.callTool(
      "start_process",
      { command: "echo should-not-run", timeout_ms: 5000 },
      policy,
    );
  } catch {
    missingCwdBlocked = true;
  }
  if (!missingCwdBlocked) {
    throw new Error("Workspace Scope allowed terminal execution without cwd");
  }

  const processResult = await full.callTool(
    "start_process",
    {
      command: "echo remotearc-core-ok",
      timeout_ms: 5000,
      cwd: project,
    },
    policy,
  );
  if (!processResult.content[0]?.text.includes("remotearc-core-ok")) {
    throw new Error("start_process failed");
  }

  const backgroundCommand =
    '"' +
    process.execPath +
    '" -e "console.log(\'bg-start\'); setTimeout(()=>{}, 5000)"';
  const background = jsonResult<{ process_id: string }>(
    await full.callTool(
      "start_process",
      {
        command: backgroundCommand,
        cwd: project,
        background: true,
      },
      policy,
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  const backgroundStatus = jsonResult<{ status: string }>(
    await full.callTool(
      "process_status",
      { process_id: background.process_id },
      policy,
    ),
  );
  if (backgroundStatus.status !== "running") {
    throw new Error("background process was not running");
  }
  const backgroundOutput = await full.callTool(
    "process_output",
    { process_id: background.process_id },
    policy,
  );
  if (!backgroundOutput.content[0]?.text.includes("bg-start")) {
    throw new Error("background process output was not captured");
  }
  await full.callTool(
    "stop_process",
    { process_id: background.process_id },
    policy,
  );

  let blocked = false;
  try {
    assertCommandAllowed(process.platform === "win32" ? "format C:" : "rm -rf /");
  } catch {
    blocked = true;
  }
  if (!blocked) throw new Error("Safety Guard did not block a catastrophic command");

  let safeBlocked = false;
  try {
    await safe.callTool("write_file", { path: file, content: "nope" }, policy);
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
        atomicWrite: "ok",
        workspaceScope: "ok",
        sensitivePaths: "ok",
        sensitiveException: "ok",
        symlinkEscape: process.platform === "win32" ? "ci-non-win" : "ok",
        undoHistory: "ok",
        process: "ok",
        backgroundProcess: "ok",
        safetyGuard: "ok",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
