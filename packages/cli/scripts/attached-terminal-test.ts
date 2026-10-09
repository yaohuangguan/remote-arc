import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "remotearc-attached-"));
const children: ChildProcess[] = [];
const output = new Map<ChildProcess, string>();
const entry = path.join(temp, "standalone-agent.mjs");
// Launch outside the package tree to catch external runtime dependencies.
await fs.copyFile(fileURLToPath(new URL("../dist/index.js", import.meta.url)), entry);
const env = { ...process.env, HOME: temp, USERPROFILE: temp, NO_COLOR: "1" };
assert.equal(
  spawnSync(
    process.execPath,
    ["-e", "console.log(require('node:os').homedir())"],
    { env, encoding: "utf8" },
  ).stdout.trim(),
  temp,
  "The test must use an isolated home before starting any CLI",
);
const server = http.createServer((_request, response) => {
  response.statusCode = 204;
  response.end();
});
const sockets = new WebSocketServer({ server });
let hellos = 0;
let toolDone = false;
sockets.on("connection", (socket) =>
  socket.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "hello") {
      hellos++;
      socket.send(
        JSON.stringify({
          type: "call",
          id: "test-file-info",
          tool: "get_file_info",
          arguments: { path: path.join(temp, "fixture.txt") },
        }),
      );
    } else if (m.type === "result" && m.id === "test-file-info") {
      assert(!m.error, m.error);
      toolDone = true;
    }
  }),
);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
await fs.mkdir(path.join(temp, ".remotearc"));
await fs.writeFile(path.join(temp, "fixture.txt"), "test");
const config = {
  deviceId: "isolated-test",
  deviceToken: "test-token",
  deviceName: "Attached test",
  origin: "http://127.0.0.1:" + port,
  mode: "managed",
  backgroundEnabled: false,
};
const configPath = path.join(temp, ".remotearc", "config.json");
await fs.writeFile(configPath, JSON.stringify(config));
const start = (...args: string[]) => {
  const child = spawn(process.execPath, [entry, "--ts", ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  children.push(child);
  output.set(child, "");
  child.stdout!.on("data", (data) =>
    output.set(child, output.get(child)! + data),
  );
  child.stderr!.on("data", (data) =>
    output.set(child, output.get(child)! + data),
  );
  return child;
};
const waitFor = async (test: () => boolean, description: string) => {
  const deadline = Date.now() + 10_000;
  while (!test() && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100));
  assert(test(), description + "\n" + [...output.values()].join("\n"));
};
try {
  const owner = start();
  await waitFor(
    () => toolDone,
    "Normal CLI must stay attached and execute tools",
  );
  assert.equal(owner.exitCode, null);
  const viewer = start();
  await waitFor(
    () => output.get(viewer)!.includes("tool.done get_file_info"),
    "Second terminal must follow the executing Agent's operation journal",
  );
  assert.equal(
    hellos,
    1,
    "A log viewer must not open a second execution connection",
  );
  const safe = start("--safe");
  await waitFor(
    () => safe.exitCode !== null,
    "Changing a local cap while another Agent executes must fail explicitly",
  );
  assert.equal(safe.exitCode, 1);
  assert.equal(
    JSON.parse(await fs.readFile(configPath, "utf8")).mode,
    "managed",
    "Failed cap change must not rewrite saved permissions",
  );
  assert(output.get(safe)!.includes("Stop it locally"));
  console.log(
    "PASS: bundled CLI stays attached, second terminal follows operation history, one execution connection, conflicting local permission profile fails safely",
  );
} finally {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>((resolve) =>
        child.once("close", () => resolve()),
      );
      child.kill("SIGKILL");
      await closed;
    }
  for (const socket of sockets.clients) socket.terminate();
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  assert.equal(path.dirname(temp), os.tmpdir());
  assert(path.basename(temp).startsWith("remotearc-attached-"));
  await fs.rm(temp, { recursive: true, force: true });
}
