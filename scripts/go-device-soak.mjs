import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fixture, root, pause, waitFor } from "./go-device-fixture.mjs";
import { processMetrics } from "./process-metrics.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const seconds = Number(arg("--duration-seconds", process.env.REMOTEARC_SOAK_SECONDS || 120));
const interval = Number(arg("--interval-ms", 5000));
assert(Number.isFinite(seconds) && seconds >= 10 && seconds <= 172800);
assert(Number.isFinite(interval) && interval >= 100 && interval <= 60000);
const reportPath = path.resolve(arg("--report", path.join(root, "work/go-device/soak-report.json")));
await fs.mkdir(path.dirname(reportPath), { recursive: true });
const f = await fixture();
const report = { state: "running", scope: "Isolated native foreground Agent against a loopback Relay fixture; repeated operations, network refusal, journals and process cleanup. Does not install OS services or disable the host network.", platform: process.platform, arch: process.arch, requestedDurationSeconds: seconds, startedAt: new Date().toISOString(), cycles: 0, reconnects: 0, samples: [] };
const save = async () => { await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + "\n"); };
const policy = { workspaceRoots: [f.home] };
const file = path.join(f.home, "hello.txt"), helper = path.join(f.home, "process.cjs");
const quote = (value) => process.platform === "win32" ? `"${value}"` : "'" + value.replaceAll("'", "'\\''") + "'";
let ownedProcess;
try {
  const owner = f.start(["--foreground"]);
  await waitFor(() => f.hellos.length, "soak connection");
  const initial = f.hellos.at(-1).device;
  report.pid = initial.pid; report.deviceID = initial.id;
  await fs.writeFile(helper, "console.log('SOAK_READY');setInterval(()=>{},1000)");
  const started = Date.now();
  let nextProcess = 0;
  while (Date.now() - started < seconds * 1000) {
    const cycle = report.cycles;
    await fs.writeFile(file, "original");
    await f.call("write_file", { path: file, content: "written" }, policy);
    await f.call("edit_block", { file_path: file, old_string: "written", new_string: "edited" }, policy);
    assert.match(await f.call("read_file", { path: file }), /edited/);
    await f.call("undo_last_change", {}, policy);
    assert.equal(await fs.readFile(file, "utf8"), "written");
    await f.call("undo_last_change", {}, policy);
    assert.equal(await fs.readFile(file, "utf8"), "original");
    if (cycle % 5 === 0) {
      await f.call("edit_block", { file_path: file, old_string: "original", new_string: "agent" }, policy);
      await fs.writeFile(file, "local");
      const conflict = await f.request("undo_last_change", {}, policy);
      assert.match(conflict.error, /changed again/);
      assert.equal(await fs.readFile(file, "utf8"), "local");
    }
    // Include concurrent calls without changing the one-owner lifecycle.
    if (cycle % 4 === 0) await Promise.all(Array.from({ length: 16 }, () => f.call("get_file_info", { path: file }, policy)));
    if (Date.now() >= nextProcess) {
      nextProcess = Date.now() + 60000; // stay below 32 retained processes in a 30-minute window
      const process = await f.call("start_process", { command: quote(globalThis.process.execPath) + " " + quote(helper), cwd: f.home, background: true, max_duration_seconds: 20 }, policy);
      ownedProcess = process;
      await waitFor(async () => (await f.call("process_output", { process_id: process.process_id })).stdout.includes("SOAK_READY"), "managed stdout");
      assert.equal((await f.call("process_status", { process_id: process.process_id })).status, "running");
      await f.call("stop_process", { process_id: process.process_id });
      await waitFor(async () => (await f.call("process_status", { process_id: process.process_id })).status === "exited", "managed exit");
      ownedProcess = undefined;
    }
    if (cycle === 2) {
      await fs.appendFile(path.join(f.home, ".remotearc/logs/events.log"), "rotation-fixture\n".repeat(350000));
      await f.call("get_file_info", { path: file }, policy);
      assert(await fs.stat(path.join(f.home, ".remotearc/logs/events.log.1")));
    }
    if (cycle > 0 && cycle % 6 === 0) {
      const count = f.handshakes.length;
      f.setOffline(true); await pause(2000); f.setOffline(false);
      await waitFor(() => f.handshakes.length > count, "soak reconnect");
      const current = f.handshakes.at(-1).device;
      assert.equal(current.id, initial.id); assert.equal(current.pid, initial.pid); assert.equal(current.backgroundProcess, false);
      assert(current.connectionSequence > initial.connectionSequence);
      report.reconnects++;
    }
    const log = await f.call("agent_execution_log", { limit: 20 });
    assert(log.lines.length <= 20 && log.lines.some((line) => line.includes("tool.done")));
    assert(!JSON.stringify(log).includes(f.token));
    report.samples.push({ elapsedSeconds: (Date.now() - started) / 1000, ...await processMetrics(initial.pid) });
    // Long runs retain minute-level samples and the newest observations, bounding the report.
    if (report.samples.length > 3000) report.samples = report.samples.filter((_, index) => index % 2 === 0);
    report.cycles++;
    await save();
    if (report.cycles % 12 === 0) console.log(`Soak ${Math.round((Date.now() - started) / 1000)}s: ${report.cycles} cycles, ${report.reconnects} reconnects`);
    await pause(Math.min(interval, Math.max(0, seconds * 1000 - (Date.now() - started))));
  }
  report.actualDurationSeconds = (Date.now() - started) / 1000;
  report.maxRssBytes = Math.max(...report.samples.map((sample) => sample.rssBytes));
  report.firstRssBytes = report.samples[0].rssBytes;
  report.lastRssBytes = report.samples.at(-1).rssBytes;
  await f.stop();
  await waitFor(() => owner.exit, "soak owner stop");
  assert.equal(await fs.stat(path.join(f.home, ".remotearc/agent/execution.lock")).catch(() => null), null);
  report.state = "passed";
  console.log(`PASS: ${report.cycles} soak cycles, ${report.reconnects} reconnects; report ${reportPath}`);
} catch (error) {
  report.state = "failed"; report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  if (ownedProcess) await f.call("stop_process", { process_id: ownedProcess.process_id }).catch(() => {});
  report.finishedAt = new Date().toISOString();
  await f.close();
  await save();
}
