import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "packages/cli/package.json"));
const { WebSocketServer } = require("ws");
const version = JSON.parse(
  await fs.readFile(path.join(root, "packages/cli/package.json"), "utf8"),
).version;
const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[
    process.platform
  ],
  arch = { x64: "amd64", arm64: "arm64" }[process.arch];
const binary = path.join(
  root,
  "work/go-device",
  `remotelink-v${version}-${platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`,
);
const home = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "ra-go-recovery-")),
);
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  REMOTEARC_HOME: home,
  NO_COLOR: "1",
};
const server = http.createServer((_req, res) => {
  res.writeHead(204);
  res.end();
});
const sockets = new WebSocketServer({ server });
const hellos = [];
const connections = [];
const pending = new Map();
let nextID = 0,
  output = "";
let supervisor;
const waitFor = async (predicate, label, timeout = 40000) => {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error(label + " timed out: " + output);
    await new Promise((r) => setTimeout(r, 100));
  }
};
function request(tool, args = {}) {
  const socket = connections.at(-1),
    id = "recovery-" + ++nextID;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(tool + " timed out")),
      15000,
    );
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
    socket.send(JSON.stringify({ type: "call", id, tool, arguments: args }));
  });
}
sockets.on("connection", (socket) => {
  connections.push(socket);
  socket.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "hello") hellos.push(m);
    else if (m.type === "result") {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p) m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    }
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const configPath = path.join(home, ".remotearc/config.json");
await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.writeFile(
  configPath,
  JSON.stringify({
    deviceId: "recovery-device",
    deviceToken: "fixture",
    deviceName: "fixture",
    origin: "http://127.0.0.1:" + server.address().port,
    mode: "managed",
    backgroundEnabled: true,
  }),
);
try {
  supervisor = spawn(binary, ["--supervise"], {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  supervisor.stdout.on("data", (b) => (output += b.toString()));
  supervisor.stderr.on("data", (b) => (output += b.toString()));
  await waitFor(() => hellos.length > 0, "initial worker");
  assert(hellos[0].device.backgroundProcess);
  const firstPID = hellos[0].device.pid;
  process.kill(firstPID, "SIGKILL");
  await waitFor(
    () => hellos.some((h) => h.device.pid !== firstPID),
    "crash recovery",
  );
  assert.equal(hellos.at(-1).device.id, "recovery-device");
  const heartbeat = path.join(home, "command-heartbeat");
  const helper = path.join(home, "helper.cjs");
  await fs.writeFile(
    helper,
    "const fs=require('node:fs');fs.writeFileSync(process.env.HEARTBEAT,'running');setInterval(()=>fs.appendFileSync(process.env.HEARTBEAT,'x'),50)",
  );
  // The remote command is a Node fixture. The device runtime and supervisor are native Go.
  const command =
    process.platform === "win32"
      ? `set "HEARTBEAT=${heartbeat}" && "${process.execPath}" "${helper}"`
      : `HEARTBEAT='${heartbeat.replaceAll("'", "'\\''")}' "${process.execPath}" "${helper}"`;
  const result = await request("start_process", {
    command,
    background: true,
    max_duration_seconds: 30,
  });
  assert.equal(JSON.parse(result.content[0].text).status, "running");
  // Explicitly wait for the fixture's first write before testing cancellation.
  for (let i = 0; i < 50; i++) {
    if (await fs.stat(heartbeat).catch(() => null)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(await fs.stat(heartbeat));
  const stopped = await request("set_background_agent", {
    enabled: false,
    stop_current: true,
  });
  assert.equal(stopped.desired_enabled, false);
  await waitFor(() => supervisor.exitCode !== null, "disabled supervisor exit");
  assert.equal(
    JSON.parse(await fs.readFile(configPath, "utf8")).backgroundEnabled,
    false,
  );
  const before = (await fs.stat(heartbeat)).size;
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(
    (await fs.stat(heartbeat)).size,
    before,
    "graceful stop must terminate the managed child tree",
  );
  assert.equal(
    await fs
      .stat(path.join(home, ".remotearc/agent/execution.lock"))
      .catch(() => null),
    null,
  );
  assert.equal(
    await fs
      .stat(path.join(home, ".remotearc/agent/supervisor.lock"))
      .catch(() => null),
    null,
  );
  assert(output.includes("recovery retry"));
  console.log(
    "Go recovery OK: native supervisor, crashed-worker replacement, same identity, disable preservation, graceful child-tree cleanup and released leases.",
  );
} finally {
  if (supervisor?.exitCode === null) supervisor.kill();
  for (const s of sockets.clients) s.terminate();
  await new Promise((resolve) => sockets.close(resolve));
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(home, { recursive: true, force: true });
}
