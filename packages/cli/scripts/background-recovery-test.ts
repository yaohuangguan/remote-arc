import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  createBackgroundController,
  windowsSupervisorLaunchScript,
  type RunResult,
} from "../src/background.js";
import {
  appendAgentEvent,
  readAgentEvents,
  superviseAgent,
  tryAgentLease,
} from "../src/agent-runtime.js";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "remotearc-recovery-"));
const result = (code = 0, stdout = "", stderr = ""): RunResult => ({
  code,
  stdout,
  stderr,
});
const source = path.join(temp, "source.mjs");
await fs.writeFile(source, "console.log('test bundle');");
const calls: string[][] = [];
let loaded = true,
  disabled = false,
  bootFails = false;
const mac = createBackgroundController({
  platform: "darwin",
  home: path.join(temp, "mac"),
  uid: 501,
  run: async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === "print")
      return loaded
        ? result(0, "state = running\n  pid = 2468\n")
        : result(113);
    if (args[0] === "print-disabled")
      return result(0, '"app.remotearc.agent" => ' + disabled);
    if (args[0] === "enable") disabled = false;
    if (args[0] === "disable") disabled = true;
    if (args[0] === "bootstrap") {
      if (bootFails)
        return result(5, "", "Bootstrap failed: 5: Input/output error");
      loaded = true;
    }
    if (args[0] === "bootout") loaded = false;
    return result();
  },
  wait: async () => undefined,
  leaseActive: async () => true,
});
try {
  const status = await mac.enableBackgroundAgent(source, { version: "test" });
  assert.equal(status.pid, 2468);
  assert.equal(status.active, true);
  await mac.enableBackgroundAgent(source);
  assert(
    !calls.some((c) => c[1] === "bootout" || c[1] === "bootstrap"),
    "Repeated enable must preserve a healthy loaded job",
  );
  await mac.disableBackgroundAgent({ stopCurrent: false });
  assert.equal(
    (await mac.backgroundAgentStatus()).active,
    true,
    "Disable must preserve current execution",
  );
  assert.equal((await mac.backgroundAgentStatus()).enabled, false);
  loaded = false;
  bootFails = true;
  await assert.rejects(
    mac.enableBackgroundAgent(source),
    /bootstrap exited with 5/,
  );
  const legacy = createBackgroundController({
    platform: "darwin",
    home: path.join(temp, "legacy"),
    run: async () => result(0, "state = running\n pid = 1234\n"),
    wait: async () => undefined,
    leaseActive: async () => false,
  });
  await assert.rejects(
    legacy.enableBackgroundAgent(source),
    /Stop the older Agent locally/,
    "An old daemon without an execution lease must not overlap a new executor",
  );

  const linuxCalls: string[][] = [];
  const linuxHome = path.join(temp, "Linux home %x");
  let linuxEnabled = true;
  const linux = createBackgroundController({
    platform: "linux", home: linuxHome, nodePath: "/opt/Node JS/node", leaseActive: async () => true,
    run: async (command, args) => {
      linuxCalls.push([command, ...args]);
      if (args.includes("is-enabled")) return result(linuxEnabled ? 0 : 1);
      if (args.includes("is-active")) return result();
      if (args.includes("show")) return result(0, "4567");
      if (args.includes("disable")) linuxEnabled = false;
      return result();
    },
  });
  assert.equal((await linux.enableBackgroundAgent(source)).pid, 4567);
  const unit = await fs.readFile(path.join(linuxHome, ".config", "systemd", "user", "remotearc-agent.service"), "utf8");
  assert(unit.includes('ExecStart=:"/opt/Node JS/node"'));
  assert(unit.includes("Linux home %%x"), "systemd specifiers in paths must be escaped");
  assert(unit.includes("Restart=on-failure"));
  await linux.disableBackgroundAgent({ stopCurrent: false });
  assert(linuxCalls.some(c => c.includes("disable") && !c.includes("--now")), "Disabling recovery must preserve current execution on Linux");

  let supervisor = false;
  const windows = createBackgroundController({
    platform: "win32",
    home: path.join(temp, "Windows home"),
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    run: async (command, args) => {
      if (command === "powershell.exe") {
        const script = args.at(-1)!;
        if (script.includes("Get-CimInstance")) {
          assert(script.includes("ExecutablePath"));
          assert(script.includes("[regex]::Escape"));
          return result(
            0,
            supervisor && script.includes("--supervise") ? "7654" : "",
          );
        }
        if (script.includes("Start-Process")) {
          assert(script.includes("WindowStyle Hidden"));
          assert(script.includes("--supervise"));
          supervisor = true;
        }
      }
      if (command === "reg.exe" && args[0] === "add")
        assert(
          args.includes("REG_SZ") &&
            args.some((a) => a.includes("EncodedCommand")),
        );
      return result();
    },
    wait: async () => undefined,
  });
  const win = await windows.enableBackgroundAgent(source);
  assert.equal(win.active, true);
  assert.equal(win.pid, 7654);
  supervisor = false;
  const dead = createBackgroundController({
    platform: "win32",
    home: path.join(temp, "dead"),
    run: async (command) =>
      command === "powershell.exe" ? result() : result(),
    wait: async () => undefined,
  });
  await assert.rejects(
    dead.enableBackgroundAgent(source),
    /supervisor is not running/,
  );

  if (process.platform === "win32") {
    const nativeHome = path.join(temp, "Native Windows home");
    const bundle = path.join(
      nativeHome,
      ".remotearc",
      "agent",
      "remotelink.mjs",
    );
    await fs.mkdir(path.dirname(bundle), { recursive: true });
    await fs.writeFile(bundle, "setTimeout(()=>process.exit(0),60000);");
    const logs = path.join(nativeHome, ".remotearc", "logs");
    await fs.mkdir(logs, { recursive: true });
    const launcher = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      windowsSupervisorLaunchScript(process.execPath, bundle)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let launchError = ""; launcher.stderr.on("data", data => launchError += data);
    const code = await new Promise<number | null>(resolve => launcher.once("close", resolve));
    assert.equal(code, 0, launchError);
    const controller = createBackgroundController({ platform: "win32", home: nativeHome });
    let pid: number | null | undefined;
    try {
      pid = (await controller.backgroundAgentStatus()).pid;
      assert(pid, "Hidden Start-Process must survive its launcher and match the real Node argument vector with spaces");
      process.kill(pid, 0);
    } finally { if (pid) process.kill(pid, "SIGKILL"); }
    const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)", bundle, "--supervise"], { windowsHide: true, stdio: "ignore" });
    try {
      await new Promise<void>(resolve => unrelated.once("spawn", resolve));
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal((await controller.backgroundAgentStatus()).pid, null, "A Node eval process merely mentioning the bundle and role must not count as the supervisor");
    } finally {
      const unrelatedClosed = new Promise<void>(resolve => unrelated.once("close", () => resolve()));
      unrelated.kill("SIGKILL"); await unrelatedClosed;
    }

  }

  const leaseDir = path.join(temp, "leases");
  const first = await tryAgentLease(leaseDir);
  assert(first);
  assert.equal(
    await tryAgentLease(leaseDir),
    null,
    "Two Agents cannot own execution",
  );
  await first();
  const second = await tryAgentLease(leaseDir);
  assert(second);
  await second();

  // A real child owns a lease until it is killed. Recover using the production
  // stale interval; never manually remove a live lock or adjust its timestamps.
  const tsx = createRequire(
    new URL("../../execution-core/package.json", import.meta.url),
  ).resolve("tsx");
  const holder = path.join(temp, "holder.mts");
  const runtime = new URL("../src/agent-runtime.ts", import.meta.url).href;
  await fs.writeFile(
    holder,
    `import { tryAgentLease } from ${JSON.stringify(runtime)}; await tryAgentLease(process.argv[2]); console.log('owned:'+process.pid); setInterval(()=>{},1000);`,
  );
  // Load TS in the actual owner process. The tsx CLI may fork a second Node;
  // killing its wrapper on Unix leaves the owner and stdout pipe alive.
  const child = spawn(process.execPath, ["--import", pathToFileURL(tsx).href, holder, leaseDir], {
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  });
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  await new Promise<void>((resolve, reject) => {
    child.stdout.once("data", data => {
      try { assert.equal(data.toString().trim(), "owned:" + child.pid); resolve(); }
      catch (error) { reject(error); }
    });
    child.once("error", reject);
    child.once("exit", () => reject(new Error("holder exited early")));
  });
  assert.equal(await tryAgentLease(leaseDir), null);
  child.kill("SIGKILL");
  await closed;
  let recovered: Awaited<ReturnType<typeof tryAgentLease>> = null;
  const deadline = Date.now() + 20_000;
  while (!recovered && Date.now() < deadline) {
    recovered = await tryAgentLease(leaseDir);
    if (!recovered) await new Promise((r) => setTimeout(r, 200));
  }
  assert(
    recovered,
    "Killed owner's lease must recover within the bounded interval",
  );
  await recovered();

  const logs = path.join(temp, "logs");
  appendAgentEvent(logs, "tool.call read_file\n");
  const previous = await readAgentEvents(logs, null);
  assert(previous.text.includes("tool.call"));
  appendAgentEvent(logs, "tool.done read_file\n");
  const current = await readAgentEvents(logs, previous.cursor);
  assert.equal(current.text, "tool.done read_file\n");

  let starts = 0,
    enabled = true;
  const abort = new AbortController();
  await superviseAgent({
    signal: abort.signal,
    enabled: async () => enabled,
    delayMs: 10,
    start: () => {
      starts++;
      if (starts === 3) enabled = false;
      return spawn(process.execPath, ["-e", "process.exit(1)"], {
        windowsHide: true,
      });
    },
  });
  assert.equal(
    starts,
    3,
    "Supervisor retries child exits and respects disabled recovery",
  );
  console.log(
    "PASS: macOS idempotence/PID/bootstrap failure, Windows live supervisor confirmation, single-owner exclusion, killed-owner recovery, log following, supervised restart/disable",
  );
} finally {
  assert.equal(path.dirname(temp), os.tmpdir());
  assert(path.basename(temp).startsWith("remotearc-recovery-"));
  await fs.rm(temp, { recursive: true, force: true });
}
