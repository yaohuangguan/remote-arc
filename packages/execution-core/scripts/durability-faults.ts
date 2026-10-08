import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mock } from "node:test";
import { atomicWriteFile, fileDurability, undoDurability } from "../src/durability.js";
import { RemoteArcExecutionCore } from "../src/index.js";

delete process.env.REMOTEARC_FILE_DURABILITY;
delete process.env.REMOTEARC_UNDO_DURABILITY;
assert.equal(fileDurability(), "atomic");
assert.equal(undoDurability(), "atomic");
process.env.REMOTEARC_UNDO_DURABILITY = "typo";
assert.equal(undoDurability(), "durable");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "ra-sync-fault-"));
const target = path.join(root, "file.txt");
const injected = new Error("injected sync failure");
const open = fs.open.bind(fs);
try {
  // Failure before rename must leave the old target and clean its temporary.
  await fs.writeFile(target, "before");
  const hook = mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
    const handle = await open(...args);
    if (String(args[0]).includes(".remotearc-")) handle.sync = async () => { throw injected; };
    return handle;
  });
  await assert.rejects(() => atomicWriteFile(target, "after", undefined, "durable"), error => error === injected);
  assert.equal(await fs.readFile(target, "utf8"), "before");
  assert.deepEqual(await fs.readdir(root), ["file.txt"]);
  hook.mock.restore();

  if (process.platform !== "win32") {
    // Failure after rename must retain the original Undo bytes for inspection.
    // A prepared manifest has no post-change hash and must refuse auto-Undo.
    process.env.REMOTEARC_FILE_DURABILITY = "durable";
    process.env.REMOTEARC_UNDO_DURABILITY = "durable";
    process.env.REMOTEARC_UNDO_ROOT = path.join(root, "undo");
    const directoryHook = mock.method(fs, "open", async (...args: Parameters<typeof fs.open>) => {
      const handle = await open(...args);
      if (String(args[0]) === root) handle.sync = async () => { throw injected; };
      return handle;
    });
    const core = new RemoteArcExecutionCore("full");
    try {
      await assert.rejects(() => core.callTool("write_file", {path: target, content: "after"}, {workspaceRoots:[root]}), error => error === injected);
      assert.equal(await fs.readFile(target, "utf8"), "after");
      const [snapshot] = await fs.readdir(process.env.REMOTEARC_UNDO_ROOT);
      assert.ok(snapshot);
      assert.equal(await fs.readFile(path.join(process.env.REMOTEARC_UNDO_ROOT, snapshot, "content.bin"), "utf8"), "before");
      await assert.rejects(() => core.callTool("undo_last_change", {}, {workspaceRoots:[root]}), /predates conflict-safe/);
    } finally { directoryHook.mock.restore(); await core.close(); }
  }
  console.log("TS sync failure boundaries and recovery evidence passed");
} finally { mock.restoreAll(); await fs.rm(root, {recursive:true, force:true}); }
