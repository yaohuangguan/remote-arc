import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(root, "packages/cli/package.json"));
const { WebSocketServer } = require("ws");
export const version = JSON.parse(await fs.readFile(path.join(root, "packages/cli/package.json"), "utf8")).version;
const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform];
const arch = { x64: "amd64", arm64: "arm64" }[process.arch];
export const binary = path.join(root, "work/go-device", `remotelink-go-v${version}-${platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`);
export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function waitFor(predicate, label, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!(await predicate())) {
    if (Date.now() >= end) throw new Error(label + " timed out");
    await pause(50);
  }
}
export function payload(result) {
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (typeof text !== "string") return result;
  try { return JSON.parse(text); } catch { return text; }
}

export async function fixture({ recovery = false, mode = "managed", engine = "Go", environment = {} } = {}) {
  assert(["Go", "TS"].includes(engine));
  const tempBase = await fs.realpath(os.tmpdir());
  const home = await fs.realpath(await fs.mkdtemp(path.join(tempBase, "ra-go-fixture-")));
  const token = "fixture-private-token", deviceID = "fixture-stable-device";
  const env = { ...process.env, ...environment, HOME: home, USERPROFILE: home, REMOTEARC_HOME: home, REMOTEARC_UNDO_ROOT: path.join(home, ".remotearc/undo"), NO_COLOR: "1" };
  const children = [], hellos = [], handshakes = [], pending = new Map();
  let offline = false, nextID = 0, connection;
  const server = http.createServer((_request, response) => { response.writeHead(204); response.end(); });
  const sockets = new WebSocketServer({ server, verifyClient: (info, accept) => accept(!offline && info.req.headers.authorization === "Bearer " + token, offline ? 503 : 401) });
  sockets.on("connection", (socket) => {
    connection = socket;
    let firstHello = true;
    socket.on("close", () => {
      for (const [id, receiver] of pending) {
        if (receiver.socket === socket) { pending.delete(id); receiver.reject(new Error("fixture connection closed")); }
      }
    });
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === "hello") { hellos.push(message); if(firstHello) { handshakes.push(message); firstHello=false; } }
      if (message.type === "result") {
        const receiver = pending.get(message.id);
        if (receiver) { pending.delete(message.id); receiver.resolve(message); }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const configPath = path.join(home, ".remotearc/config.json");
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ deviceId: deviceID, deviceToken: token, deviceName: "Fixture PC", origin, mode, backgroundEnabled: recovery }));
  const start = (args) => {
    const child = spawn(engine === "Go" ? binary : process.execPath, engine === "Go" ? args : [path.join(root, "packages/cli/dist/index.js"), "--ts", ...args], { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const entry = { child, output: "", exit: null };
    entry.done = new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => { entry.exit = { code, signal }; resolve(entry.exit); });
    });
    const capture = (data) => { entry.output = (entry.output + data.toString()).slice(-65536); };
    child.stdout.on("data", capture); child.stderr.on("data", capture);
    children.push(entry);
    return entry;
  };
  const request = async (tool, args = {}, policy = {}) => {
    assert(connection?.readyState === 1, "fixture device not connected");
    const socket = connection, id = "fixture-" + ++nextID;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(tool + " timed out")); }, 15000);
      pending.set(id, { socket, resolve: (result) => { clearTimeout(timer); resolve(result); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ type: "call", id, tool, arguments: args, policy }));
    });
  };
  const call = async (...args) => {
    const response = await request(...args);
    assert.equal(response.error, undefined, response.error);
    return payload(response.result);
  };
  const disconnect = () => { for (const socket of sockets.clients) socket.terminate(); };
  const stop = async () => {
    if (engine === "TS") {
      // Isolated foreground fixture only: do not install or disable OS services.
      for (const entry of children) if (!entry.exit) entry.child.kill("SIGTERM");
      await Promise.all(children.map(entry => entry.done));
      return "TS fixture stopped";
    }
    const entry = start(["--stop"]);
    await waitFor(() => entry.exit, "native stop", 25000);
    assert.equal(entry.exit.code, 0, entry.output);
    return entry.output;
  };
  const close = async () => {
    try { await stop(); } catch { /* Failed assertions still clean up owned fixtures. */ }
    for (const entry of children) if (!entry.exit) entry.child.kill("SIGKILL");
    await Promise.all(children.map((entry) => entry.done.catch(() => {})));
    disconnect();
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    assert(home.startsWith(tempBase + path.sep) && path.basename(home).startsWith("ra-go-fixture-"));
    await fs.rm(home, { recursive: true, force: true });
  };
  return { home, configPath, env, token, deviceID, origin, start, request, call, stop, close, disconnect, hellos, handshakes, setOffline: (value) => { offline = value; if (value) disconnect(); } };
}
