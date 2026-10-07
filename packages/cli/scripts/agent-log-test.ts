import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendAgentEvent, readAgentEventTail } from "../src/agent-runtime.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "remotearc-agent-log-"));
try {
  const empty = await readAgentEventTail(root, 100);
  assert.deepEqual(empty.lines, []);
  assert.equal(empty.source, "local-device");

  for (let index = 1; index <= 35; index++) {
    appendAgentEvent(root, `12:00:${String(index).padStart(2, "0")}  event  tool.call test_${index}\n`);
  }

  const recent = await readAgentEventTail(root, 20);
  assert.equal(recent.lines.length, 20);
  assert.match(recent.lines[0], /test_16$/);
  assert.match(recent.lines[19], /test_35$/);
  assert.equal(recent.source, "local-device");
  assert(recent.total_bytes > 0);
  assert(recent.updated_at);

  const clamped = await readAgentEventTail(root, 2);
  assert.equal(clamped.lines.length, 20, "minimum dashboard tail should stay useful");

  console.log("PASS: local execution log tail is bounded, recent and device-local");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
