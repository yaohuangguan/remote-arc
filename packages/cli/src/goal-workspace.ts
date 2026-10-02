import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { enforcePathPolicy, type ExecutionPolicy } from "@remotearc/execution-core";

const run = promisify(execFile);
type Manifest = { version: 1; task_id: string; root: string; path: string; frontier: string; generation: number; operations: Record<string, { path: string; frontier: string; generation: number; root: string }> };
// Serialize duplicate calls in this device process. The on-disk manifest survives
// restart; no reset/clean/delete or automatic application to the user's checkout.
const pending = new Map<string, Promise<unknown>>();
const samePath = (a: string, b: string) => process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b);
const git = async (cwd: string, args: string[]) => (await run("git", ["-c", "core.hooksPath=", "-c", "commit.gpgSign=false", "-C", cwd, ...args], { windowsHide: true, timeout: 20_000, maxBuffer: 1_000_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_AUTHOR_NAME: "Remote Arc", GIT_AUTHOR_EMAIL: "task@remotearc.local", GIT_COMMITTER_NAME: "Remote Arc", GIT_COMMITTER_EMAIL: "task@remotearc.local" } })).stdout.trim();
export async function goalWorkspace(args: Record<string, unknown>, policy: ExecutionPolicy = {}) {
  const id = String(args.task_id || ""), operation = String(args.operation_id || ""), action = String(args.action || "");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !/^[A-Za-z0-9_.:-]{1,120}$/.test(operation) || !["create", "capture", "reject", "status", "fingerprint"].includes(action)) throw new Error("Invalid goal workspace operation.");
  const prior = pending.get(id) || Promise.resolve();
  const next = prior.catch(() => undefined).then(async () => {
    const root = await enforcePathPolicy(String(args.workspace || ""), policy);
    const canonical = await fs.realpath(root);
    const directory = await enforcePathPolicy(path.join(canonical, ".remotearc-goals", id), policy);
    const file = path.join(directory, "state.json");
    let state: Manifest | undefined;
    try { state = JSON.parse(await fs.readFile(file, "utf8")) as Manifest; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    if (state && (state.version !== 1 || state.task_id !== id || state.root !== canonical)) throw new Error("Workspace ownership cannot be proven.");
    const result = (s: Manifest) => ({ root: s.root, path: s.path, frontier: s.frontier, generation: s.generation });
    const save = async (s: Manifest) => {
      const temp = file + ".next";
      await fs.writeFile(temp, JSON.stringify(s), { encoding: "utf8", mode: 0o600 });
      await fs.rename(temp, file);
    };
    if (state?.operations[operation] && !["status", "fingerprint"].includes(action)) return state.operations[operation];
    if (!state) {
      if (action !== "create") throw new Error("No owned goal workspace. Update the device CLI if this tool is unavailable.");
      const top = await fs.realpath(await git(canonical, ["rev-parse", "--show-toplevel"]));
      if (!samePath(top, canonical)) throw new Error("Quality isolation requires the repository root.");
      if (await git(canonical, ["status", "--porcelain", "--", ".", ":!.remotearc-goals"])) throw new Error("Quality baseline requires a clean checkout; preserve user edits before starting.");
      const frontier = await git(canonical, ["rev-parse", "HEAD"]);
      await fs.mkdir(directory, { recursive: true });
      const candidate = await enforcePathPolicy(path.join(directory, "candidate-0"), policy);
      // Existing unowned paths are never reused or overwritten.
      await git(canonical, ["worktree", "add", "--detach", candidate, frontier]);
      state = { version: 1, task_id: id, root: canonical, path: candidate, frontier, generation: 0, operations: {} };
    } else {
      const expected = path.join(directory, "candidate-" + state.generation);
      if (!samePath(state.path, expected) || !samePath(await fs.realpath(state.path), expected)) throw new Error("Candidate ownership path changed.");
      await enforcePathPolicy(state.path, policy);
      const marker = await fs.lstat(path.join(state.path, ".git"));
      if (!marker.isFile() || marker.isSymbolicLink()) throw new Error("Candidate Git identity changed.");
      const common = await fs.realpath(await git(state.path, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
      const original = await fs.realpath(await git(canonical, ["rev-parse", "--path-format=absolute", "--git-common-dir"]));
      if (!samePath(common, original)) throw new Error("Candidate belongs to another repository.");
      if (action === "capture") {
        if (args.expected_frontier !== state.frontier) throw new Error("Accepted checkpoint changed. Read context again.");
        // Index/commit belong to the detached task worktree. User's index/branch
        // are untouched. commit-tree runs neither hooks nor signing programs.
        await git(state.path, ["add", "-A", "--", "."]);
        const tree = await git(state.path, ["write-tree"]);
        if (args.expected_tree !== tree) throw new Error("Candidate changed during validation; rerun checks before promoting.");
        const head = await git(state.path, ["rev-parse", "HEAD"]);
        const commit = await git(state.path, ["commit-tree", tree, "-p", head, "-m", "Remote Arc accepted task checkpoint " + id]);
        await git(state.path, ["update-ref", "HEAD", commit, head]);
        state.frontier = commit;
      }
      if (action === "reject") {
        if (args.expected_frontier !== state.frontier) throw new Error("Accepted checkpoint changed. Read context again.");
        const candidate = await enforcePathPolicy(path.join(directory, "candidate-" + (state.generation + 1)), policy);
        await git(canonical, ["worktree", "add", "--detach", candidate, state.frontier]);
        state.generation++; state.path = candidate;
      }
    }
    if (action === "fingerprint") {
      await git(state.path, ["add", "-A", "--", "."]);
      return { ...result(state), tree: await git(state.path, ["write-tree"]) };
    }
    state.operations[operation] = result(state);
    // Maximum engine revisions are 32 and phases 24; bound restart receipts too.
    const keys = Object.keys(state.operations); for (const key of keys.slice(0, -256)) delete state.operations[key];
    await save(state);
    return { ...result(state), ...(action === "status" ? { git_status: (await git(state.path, ["status", "--porcelain"])).slice(0, 6000) } : {}) };
  });
  pending.set(id, next);
  try { return await next; } finally { if (pending.get(id) === next) pending.delete(id); }
}
