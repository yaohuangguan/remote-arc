import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const version = process.env.REMOTEARC_PUBLIC_VERSION || JSON.parse(
  await fs.readFile(path.join(root, "packages/cli/package.json"), "utf8"),
).version;
assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
const home = await fs.mkdtemp(path.join(os.tmpdir(), "ra-public-install-"));
const npmCLI = path.join(
  path.dirname(process.execPath),
  "node_modules/npm/bin/npm-cli.js",
);
// Node's standard installers put npm alongside node; hosted Unix runners expose
// npm as a symlink instead. Resolve the entry point from npm's own executable.
import { execFileSync } from "node:child_process";
let npm;
if (process.platform === "win32") {
  npm = npmCLI;
} else {
  const executable = execFileSync("which", ["npm"], {
    encoding: "utf8",
  }).trim();
  npm = await fs.realpath(executable);
}
async function run(args) {
  const child = spawn(
    process.execPath,
    [
      npm,
      "--prefer-online",
      "exec",
      "--yes",
      `--package=remotelink@${version}`,
      "--",
      "remotelink",
      ...args,
    ],
    {
      cwd: home,
      windowsHide: true,
      env: {
        ...process.env,
        REMOTEARC_HOME: home,
        npm_config_cache: path.join(home, "npm-cache"),
        npm_config_registry: "https://registry.npmjs.org/",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.on("data", (b) => (stderr += b));
  const timeout = setTimeout(() => child.kill(), 180000);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    assert.equal(code, 0, stderr);
    return stdout.trim();
  } finally {
    clearTimeout(timeout);
  }
}
try {
  // npm/CDN propagation can briefly lag the successful publish response.
  let error;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      assert.equal(await run(["--version"]), version);
      error = undefined;
      break;
    } catch (e) {
      error = e;
      // Retry registry propagation only; executable or contract failures fail immediately.
      if (!/ETARGET|E404/.test(String(e))) throw e;
      if (attempt < 29) await new Promise((r) => setTimeout(r, 10000));
    }
  }
  if (error) throw error;
  assert.match(await run(["--help"]), /Go device agent/);
  assert.equal(await run(["--go", "--version"]), version);
  assert.match(await run(["--go", "--help"]), /Go device agent/);
  assert.equal(await run(["--ts", "--version"]), version);
  console.log(
    `Public installation verified on ${process.platform}/${process.arch}: npm default Go ${version}, native help and explicit TS fallback.`,
  );
} finally {
  await fs.rm(home, { recursive: true, force: true });
}
