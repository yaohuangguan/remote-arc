import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";
import {
  RemoteArcExecutionCore,
  type ExecutionPolicy,
} from "@remotearc/execution-core-ts";
import { tryAgentLease } from "../src/agent-runtime.js";
import { goalWorkspace } from "../src/goal-workspace.js";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const version = JSON.parse(
  await fs.readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
).version;
const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[
  process.platform
];
const arch = { x64: "amd64", arm64: "arm64" }[process.arch];
const binary = path.join(
  repository,
  "work/go-device",
  `remotelink-v${version}-${platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`,
);
const temp = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "ra-go-compat-")),
);
const env = {
  ...process.env,
  REMOTEARC_HOME: temp,
  HOME: temp,
  USERPROFILE: temp,
  NO_COLOR: "1",
};
process.env.REMOTEARC_UNDO_ROOT = path.join(temp, ".remotearc/undo");
const children: ChildProcess[] = [];
const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
let socket: WebSocket | undefined;
let nextID = 0;
let hello: any;
let stderr = "";
const server = http.createServer((_req, res) => {
  res.writeHead(204);
  res.end();
});
const sockets = new WebSocketServer({ server });
sockets.on("connection", (s, req) => {
  assert.equal(req.headers.authorization, "Bearer fixture-token");
  socket = s;
  s.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "hello") hello = m;
    else if (m.type === "result") {
      const receiver = pending.get(m.id);
      pending.delete(m.id);
      if (receiver)
        m.error
          ? receiver.reject(new Error(m.error))
          : receiver.resolve(m.result);
    }
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin =
  "http://127.0.0.1:" + (server.address() as { port: number }).port;
const configPath = path.join(temp, ".remotearc/config.json");
await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.writeFile(
  configPath,
  JSON.stringify({
    deviceId: "compat-device",
    deviceToken: "fixture-token",
    deviceName: "fixture",
    origin,
    mode: "managed",
    backgroundEnabled: false,
  }),
);
const agent = spawn(binary, ["--foreground"], {
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(agent);
agent.stderr!.on("data", (b) => (stderr += b.toString()));
const ts = new RemoteArcExecutionCore("managed");
const waitFor = async (
  predicate: () => boolean,
  description: string,
  timeout = 30000,
) => {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end)
      throw new Error(description + " timed out: " + stderr);
    await new Promise((r) => setTimeout(r, 50));
  }
};
async function go(
  name: string,
  args: Record<string, unknown> = {},
  policy?: ExecutionPolicy,
): Promise<any> {
  const id = "compat-" + ++nextID;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(name + " timed out"));
    }, 15000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    socket!.send(
      JSON.stringify({ type: "call", id, tool: name, arguments: args, policy }),
    );
  });
}
function decode(result: any): any {
  const text = result.content?.[0]?.text;
  assert.equal(typeof text, "string");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function run(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
) {
  const child = spawn(command, args, {
    env: { ...env, ...extraEnv },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout!.on("data", (b) => (output += b.toString()));
  child.stderr!.on("data", (b) => (output += b.toString()));
  const timer = setTimeout(() => child.kill(), 20000);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  clearTimeout(timer);
  return { code, output };
}
try {
  await waitFor(() => Boolean(hello), "Go connection");
  assert.equal(hello.device.id, "compat-device");
  assert.deepEqual(
    // The native Go-only device wake control is intentionally not exposed by
    // the TS compatibility runtime; ordinary execution tools must still match.
    new Set(hello.tools.filter((tool: string) => tool !== "set_device_runtime")),
    new Set([
      ...ts.listTools().map((t) => t.name),
      "background_agent_status",
      "set_background_agent",
      "set_task_keep_awake",
      "goal_workspace",
      "agent_execution_log",
    ]),
  );
  assert(hello.capabilities.includes("go_agent_v1"));
  assert(hello.capabilities.includes("device_pause_v1"));
  assert(hello.tools.includes("set_device_runtime"));
  const tsRoot = path.join(temp, "ts-fixtures"),
    goRoot = path.join(temp, "go-fixtures");
  const normalize = (value: any, root: string): any => {
    const expression = new RegExp(
      RegExp.escape(root),
      process.platform === "win32" ? "gi" : "g",
    );
    const visit = (v: any): any =>
      typeof v === "string"
        ? v.replace(expression, "ROOT")
        : Array.isArray(v)
          ? v.map(visit)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, item]) => [k, visit(item)]),
              )
            : v;
    return visit(value);
  };
  for (const root of [tsRoot, goRoot]) {
    await fs.mkdir(path.join(root, "child"), { recursive: true });
    await fs.writeFile(
      path.join(root, "fixture.txt"),
      "alpha\r\nbeta\r\ngamma",
    );
    await fs.writeFile(path.join(root, ".env"), "private");
  }
  const compare = async (
    name: string,
    a: Record<string, unknown>,
    b: Record<string, unknown>,
    p?: ExecutionPolicy,
  ) =>
    assert.deepEqual(
      normalize(decode(await go(name, b, p)), goRoot),
      normalize(decode(await ts.callTool(name, a, p)), tsRoot),
      name,
    );
  await compare("list_directory", { path: tsRoot }, { path: goRoot });
  await compare("browse_directories", { path: tsRoot }, { path: goRoot });
  await compare(
    "read_file",
    { path: path.join(tsRoot, "fixture.txt"), offset: -2, length: 1 },
    { path: path.join(goRoot, "fixture.txt"), offset: -2, length: 1 },
  );
  const shared = path.join(temp, "binary.dat");
  await fs.writeFile(shared, Buffer.from([0, 1, 2, 3, 4, 255]));
  await compare(
    "read_binary_file",
    { path: shared, offset: 1, length: 3 },
    { path: shared, offset: 1, length: 3 },
  );
  await fs.utimes(
    shared,
    new Date("2026-01-01T00:00:00.100Z"),
    new Date("2026-01-01T00:00:00.200Z"),
  );
  const tsInfo = decode(await ts.callTool("get_file_info", { path: shared })),
    goInfo = decode(await go("get_file_info", { path: shared }));
  for (const field of [
    "path",
    "type",
    "size",
    "size_human",
    "mode",
    "created_at",
    "modified_at",
    "accessed_at",
  ]) {
    assert.deepEqual(goInfo[field], tsInfo[field], "metadata " + field);
  }
  const revision = decode(
    await go("read_binary_file", { path: shared }),
  ).file_revision;
  await fs.appendFile(shared, Buffer.from([5]));
  await assert.rejects(
    () => go("read_binary_file", { path: shared, expected_revision: revision }),
    /FILE_CHANGED_DURING_READ/,
  );
  await assert.rejects(
    () =>
      ts.callTool("read_binary_file", {
        path: shared,
        expected_revision: revision,
      }),
    /FILE_CHANGED_DURING_READ/,
  );
  for (const mode of ["rewrite", "append"])
    await compare(
      "write_file",
      { path: path.join(tsRoot, "mutate.txt"), content: "old old\n", mode },
      { path: path.join(goRoot, "mutate.txt"), content: "old old\n", mode },
    );
  await compare(
    "edit_block",
    {
      file_path: path.join(tsRoot, "mutate.txt"),
      old_string: "old",
      new_string: "new",
      expected_replacements: 4,
    },
    {
      file_path: path.join(goRoot, "mutate.txt"),
      old_string: "old",
      new_string: "new",
      expected_replacements: 4,
    },
  );
  const cross = path.join(temp, "cross-undo.txt");
  await fs.writeFile(cross, "original");
  await ts.callTool("write_file", { path: cross, content: "TS edit" });
  let actions = decode(await go("list_undo_actions", { limit: 100 }));
  let receipt = actions.find(
    (r: any) => r.path.toLowerCase() === cross.toLowerCase(),
  );
  assert(receipt?.can_undo);
  await go("undo_change", { action_id: receipt.id });
  assert.equal(await fs.readFile(cross, "utf8"), "original");
  await go("write_file", { path: cross, content: "Go edit" });
  actions = decode(await ts.callTool("list_undo_actions", { limit: 100 }));
  receipt = actions.find(
    (r: any) => r.path.toLowerCase() === cross.toLowerCase(),
  );
  assert(receipt?.can_undo);
  await ts.callTool("undo_change", { action_id: receipt.id });
  assert.equal(await fs.readFile(cross, "utf8"), "original");
  const noUndo = { undoEnabled: false };
  await compare(
    "write_file",
    { path: path.join(tsRoot, "no-undo"), content: "ok" },
    { path: path.join(goRoot, "no-undo"), content: "ok" },
    noUndo,
  );
  await assert.rejects(
    () => go("read_file", { path: path.join(goRoot, ".env") }),
    /Sensitive/,
  );
  await assert.rejects(
    () => ts.callTool("read_file", { path: path.join(tsRoot, ".env") }),
    /Sensitive/,
  );
  await assert.rejects(
    () =>
      go(
        "write_file",
        { path: cross, content: "escape" },
        { workspaceRoots: [goRoot] },
      ),
    /Trusted Write/,
  );
  await assert.rejects(
    () => go("read_file", { path: cross }, { taskWorkspaceRoot: goRoot }),
    /Task Workspace/,
  );
  await assert.rejects(
    () => go("start_process", { command: "rm -rf /" }),
    /Safety Guard/,
  );
  await assert.rejects(
    () =>
      go("start_process", {
        command: "echo no",
        background: true,
        max_duration_seconds: 1.5,
      }),
    /Invalid managed/,
  );
  const tsRun = decode(
      await ts.callTool("start_process", { command: "echo compatible" }),
    ),
    goRun = decode(await go("start_process", { command: "echo compatible" }));
  for (const field of [
    "command",
    "cwd",
    "exit_code",
    "signal",
    "stdout",
    "stderr",
    "timed_out",
  ])
    assert.deepEqual(goRun[field], tsRun[field], "command " + field);
  const bg = decode(
    await go("start_process", {
      command: `"${process.execPath}" -e "setTimeout(()=>{},15000)"`,
      background: true,
      max_duration_seconds: 10,
    }),
  );
  assert.equal(
    decode(await go("process_status", { process_id: bg.process_id })).status,
    "running",
  );
  assert(
    decode(await go("list_managed_processes")).some(
      (p: any) => p.process_id === bg.process_id,
    ),
  );
  assert.equal(
    decode(await go("stop_process", { process_id: bg.process_id })).stopped,
    true,
  );
  assert.equal(
    decode(await go("process_output", { process_id: bg.process_id })).status,
    "exited",
  );
  assert.equal(
    await tryAgentLease(path.join(temp, ".remotearc/agent")),
    null,
    "TS must not acquire a Go execution lease",
  );
  const cliEntry = path.join(repository, "packages/cli/dist/index.js");
  let selection = await run(process.execPath, [cliEntry, "--version"], {
    REMOTEARC_GO_BINARY: binary,
  });
  assert.equal(selection.code, 0);
  assert.equal(selection.output.trim(), version);
  selection = await run(process.execPath, [cliEntry, "--status"], {
    REMOTEARC_GO_BINARY: binary,
  });
  assert.equal(selection.code, 0, selection.output);
  assert.equal(JSON.parse(selection.output).agent.engine, "go", "the default CLI must inspect the Go owner");
  selection = await run(process.execPath, [cliEntry, "--go", "--version"], {
    REMOTEARC_GO_BINARY: "",
  });
  assert.equal(selection.code, 0, selection.output);
  const asset = path.basename(binary),
    bundled = path.join(repository, "packages/cli/dist/bin", asset),
    hidden = bundled + ".fixture-hidden";
  const cache = path.join(temp, ".remotearc/agent/downloads", version, asset);
  await fs.mkdir(path.dirname(cache), { recursive: true });
  await fs.copyFile(binary, cache);
  await fs.chmod(cache, 0o700);
  await fs.rename(bundled, hidden);
  try {
    selection = await run(process.execPath, [cliEntry, "--go", "--version"], {
      REMOTEARC_GO_BINARY: "",
    });
    assert.equal(
      selection.code,
      0,
      "verified cache should launch: " + selection.output,
    );
    const preload = path.join(temp, "download-fixture.mjs");
    await fs.writeFile(
      preload,
      `import fs from 'node:fs';const original=globalThis.fetch;globalThis.fetch=async(input,options)=>String(input).startsWith('https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v')?new Response(process.env.RA_CORRUPT_DOWNLOAD==='1'?Buffer.from('invalid-binary'):fs.readFileSync(process.env.RA_DOWNLOAD_SOURCE),{status:200}):original(input,options);`,
    );
    const downloadEnv = {
      REMOTEARC_GO_BINARY: "",
      NODE_OPTIONS: "--import=" + pathToFileURL(preload).href,
      RA_DOWNLOAD_SOURCE: binary,
    };
    await fs.writeFile(cache, "corrupt-cache");
    selection = await run(process.execPath, [cliEntry, "--go", "--version"], {
      ...downloadEnv,
      RA_CORRUPT_DOWNLOAD: "1",
    });
    assert.equal(selection.code, 1);
    assert.match(selection.output, /checksum/);
    selection = await run(
      process.execPath,
      [cliEntry, "--go", "--version"],
      downloadEnv,
    );
    assert.equal(
      selection.code,
      0,
      "verified download should atomically replace corrupt cache: " +
        selection.output,
    );
    assert.equal(selection.output.trim(), version);
  } finally {
    await fs.rename(hidden, bundled);
  }
  selection = await run(process.execPath, [cliEntry, "--ts", "--foreground"]);
  assert.equal(selection.code, 1);
  assert.match(selection.output, /Go agent owns/);
  selection = await run(process.execPath, [cliEntry, "--go", "--ts"]);
  assert.equal(selection.code, 1);
  assert.match(selection.output, /Choose one/);
  const executionLog = await go("agent_execution_log", { limit: 100 });
  assert.equal(executionLog.source, "local-device");
  assert(executionLog.lines.some((line: string) => line.includes("tool.done")));
  assert(!JSON.stringify(executionLog).includes("fixture-token"));
  assert.equal((await go("background_agent_status")).desired_enabled, false);
  assert.equal(
    (await go("set_task_keep_awake", { task_id: "fixture", seconds: 0 }))
      .active,
    false,
  );
  const repo = path.join(temp, "owned-repo");
  await fs.mkdir(repo);
  const git = (args: string[]) => {
    const r = spawnSync(
      "git",
      [
        "-c",
        "core.hooksPath=",
        "-c",
        "commit.gpgSign=false",
        "-C",
        repo,
        ...args,
      ],
      {
        env: {
          ...env,
          GIT_AUTHOR_NAME: "Fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.test",
          GIT_COMMITTER_NAME: "Fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.test",
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git(["init"]);
  await fs.writeFile(path.join(repo, "baseline.txt"), "baseline");
  git(["add", "."]);
  git(["commit", "-m", "baseline"]);
  const originalHead = git(["rev-parse", "HEAD"]);
  const workspacePolicy = { workspaceRoots: [repo] };
  for (const first of ["ts", "go"]) {
    const task_id = "cross-" + first;
    const args = {
      workspace: repo,
      task_id,
      action: "create",
      operation_id: "create",
    };
    const created: any =
      first === "ts"
        ? await goalWorkspace(args, workspacePolicy)
        : await go("goal_workspace", args, workspacePolicy);
    const next = {
      workspace: repo,
      task_id,
      action: "status",
      operation_id: "status",
    };
    const status: any =
      first === "ts"
        ? await go("goal_workspace", next, workspacePolicy)
        : await goalWorkspace(next, workspacePolicy);
    assert.equal(status.frontier, created.frontier);
    assert.equal(status.path.toLowerCase(), created.path.toLowerCase());
    await fs.writeFile(
      path.join(created.path, "baseline.txt"),
      "cross-engine checkpoint",
    );
    const fpArgs = {
      workspace: repo,
      task_id,
      action: "fingerprint",
      operation_id: "fingerprint",
    };
    const fp: any =
      first === "ts"
        ? await go("goal_workspace", fpArgs, workspacePolicy)
        : await goalWorkspace(fpArgs, workspacePolicy);
    const capture = {
      workspace: repo,
      task_id,
      action: "capture",
      operation_id: "capture",
      expected_frontier: created.frontier,
      expected_tree: fp.tree,
    };
    const accepted: any =
      first === "ts"
        ? await go("goal_workspace", capture, workspacePolicy)
        : await goalWorkspace(capture, workspacePolicy);
    assert.notEqual(accepted.frontier, originalHead);
    assert.equal(git(["rev-parse", "HEAD"]), originalHead);
    assert.equal(
      await fs.readFile(path.join(repo, "baseline.txt"), "utf8"),
      "baseline",
    );
  }
  const stopped = await run(binary, ["--stop"]);
  assert.equal(stopped.code, 0, stopped.output);
  await waitFor(() => agent.exitCode !== null, "graceful Go stop");
  const owned = await tryAgentLease(path.join(temp, ".remotearc/agent"));
  assert(owned, "TS should acquire the released Go lease");
  try {
    selection = await run(binary, ["--foreground"]);
    assert.equal(selection.code, 1);
    assert.match(selection.output, /TS agent owns/);
  } finally {
    await owned();
  }
  assert.equal(
    JSON.parse(await fs.readFile(configPath, "utf8")).deviceId,
    "compat-device",
  );
  console.log(
    "Go/TS parity OK: tools, files, binary revision, metadata, bidirectional Undo, policy, processes, logs, runtime selection and shared execution lease.",
  );
} finally {
  await ts.close();
  for (const child of children) if (child.exitCode === null) child.kill();
  for (const s of sockets.clients) s.terminate();
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // All fixtures are under an mkdtemp directory owned by this test.
  await fs.rm(temp, { recursive: true, force: true });
}
