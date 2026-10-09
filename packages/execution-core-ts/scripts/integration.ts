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
  if (!safeNames.includes("browse_directories")) {
    throw new Error("safe mode did not expose dashboard directory browsing");
  }
  if (!safeNames.includes("read_binary_file")) {
    throw new Error("safe mode did not advertise read_binary_file to agents");
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

  const binaryFile = path.join(project, "sample.bin");
  await fs.writeFile(binaryFile, Buffer.from([0, 1, 2, 3, 4, 255]));
  const binary = jsonResult<{
    encoding: string;
    size: number;
    file_revision: string;
    offset: number;
    bytes_read: number;
    eof: boolean;
    data: string;
  }>(
    await safe.callTool(
      "read_binary_file",
      { path: binaryFile, offset: 1, length: 3 },
      policy,
    ),
  );
  if (
    binary.encoding !== "base64" ||
    binary.size !== 6 ||
    !binary.file_revision ||
    binary.offset !== 1 ||
    binary.bytes_read !== 3 ||
    binary.eof ||
    Buffer.from(binary.data, "base64").toString("hex") !== "010203"
  ) {
    throw new Error("read_binary_file returned an invalid chunk");
  }
  const nextBinary = jsonResult<{ data: string; file_revision: string; eof: boolean }>(
    await safe.callTool(
      "read_binary_file",
      { path: binaryFile, offset: 4, length: 2, expected_revision: binary.file_revision },
      policy,
    ),
  );
  if (
    nextBinary.file_revision !== binary.file_revision ||
    !nextBinary.eof ||
    Buffer.from(nextBinary.data, "base64").toString("hex") !== "04ff"
  ) {
    throw new Error("read_binary_file revision continuation failed");
  }
  await fs.writeFile(binaryFile, Buffer.from([9, 8, 0, 6, 5, 4]));
  await fs.utimes(binaryFile, new Date(), new Date(Date.now() + 2000));
  let revisionFenceWorked = false;
  try {
    await safe.callTool(
      "read_binary_file",
      { path: binaryFile, offset: 0, length: 2, expected_revision: binary.file_revision },
      policy,
    );
  } catch (error) {
    revisionFenceWorked = String(error).includes("FILE_CHANGED_DURING_READ");
  }
  if (!revisionFenceWorked) {
    throw new Error("read_binary_file did not reject a changed file revision");
  }
  const disguisedPdf = path.join(project, "unknown.bin");
  await fs.writeFile(disguisedPdf, Buffer.from("%PDF-1.7\nfixture", "ascii"));
  const sniffed = jsonResult<{ mime_type: string }>(
    await safe.callTool(
      "read_binary_file",
      { path: disguisedPdf, offset: 0, length: 8 },
      policy,
    ),
  );
  if (sniffed.mime_type !== "application/pdf") {
    throw new Error("read_binary_file did not sniff PDF magic bytes");
  }

  let binaryRejectedByTextReader = false;
  try {
    await safe.callTool("read_file", { path: binaryFile }, policy);
  } catch {
    binaryRejectedByTextReader = true;
  }
  if (!binaryRejectedByTextReader) {
    throw new Error("read_file should keep rejecting binary content");
  }

  const directoryBrowser = jsonResult<{
    path: string;
    directories: Array<{ name: string }>;
  }>(
    await safe.callTool("browse_directories", { path: project }, policy),
  );
  if (!directoryBrowser.directories.some((entry) => entry.name === "src")) {
    throw new Error("browse_directories did not return child directories");
  }

  await fs.writeFile(outside, "outside");

  const outsideRead = await safe.callTool("read_file", { path: outside }, policy);
  if (!outsideRead.content[0]?.text.includes("outside")) {
    throw new Error("Read-only access outside the trusted write workspace failed");
  }

  let outsideWriteBlocked = false;
  try {
    await developer.callTool(
      "write_file",
      { path: outside, content: "mutated" },
      policy,
    );
  } catch {
    outsideWriteBlocked = true;
  }
  if (!outsideWriteBlocked) {
    throw new Error("Workspace Scope did not block an out-of-scope mutation");
  }

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

    const linkedRead = await safe.callTool(
      "read_file",
      { path: path.join(escapeLink, "outside.txt") },
      policy,
    );
    if (!linkedRead.content[0]?.text.includes("outside")) {
      throw new Error("Read-only symlink target outside workspace was unexpectedly hidden");
    }

    let symlinkMutationBlocked = false;
    try {
      await developer.callTool(
        "write_file",
        { path: path.join(escapeLink, "outside.txt"), content: "mutated" },
        policy,
      );
    } catch {
      symlinkMutationBlocked = true;
    }
    if (!symlinkMutationBlocked) {
      throw new Error("Workspace Scope allowed a mutation through symlink escape");
    }
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
  const managed = jsonResult<Array<{ process_id: string }>>(
    await full.callTool("list_managed_processes", {}, policy),
  );
  if (!managed.some((item) => item.process_id === background.process_id)) {
    throw new Error("list_managed_processes did not return the running process");
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

  // Read-only inspection must not be confused with executing the destructive
  // command text being searched for.
  assertCommandAllowed('grep -R "shutdown" .');
  assertCommandAllowed('printf "%s\\n" "rm -rf /"');
  assertCommandAllowed(
    'powershell -NoProfile -Command "Select-String shutdown file.txt"',
  );

  let wrappedBlocked = false;
  try {
    assertCommandAllowed(
      'powershell -NoProfile -Command "shutdown /s /t 0"',
    );
  } catch {
    wrappedBlocked = true;
  }
  if (!wrappedBlocked) {
    throw new Error("Safety Guard did not block a wrapped system power command");
  }

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
        binaryRead: "ok",
        atomicWrite: "ok",
        workspaceScope: "ok",
        sensitivePaths: "ok",
        sensitiveException: "ok",
        symlinkEscape: process.platform === "win32" ? "ci-non-win" : "ok",
        undoHistory: "ok",
        process: "ok",
        backgroundProcess: "ok",
        directoryBrowser: "ok",
        managedProcessList: "ok",
        safetyGuard: "ok",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
