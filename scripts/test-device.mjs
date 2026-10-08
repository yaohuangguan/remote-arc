import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args, options = {}) {
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  if (r.error || r.status !== 0)
    throw r.error ?? new Error(command + " failed with exit " + r.status);
}
const directory = path.join(root, "apps/device");
const formatted = spawnSync("gofmt", ["-l", "cmd", "internal"], {
  cwd: directory,
  encoding: "utf8",
  windowsHide: true,
});
if (formatted.error || formatted.status !== 0 || formatted.stdout.trim())
  throw (
    formatted.error ?? new Error("Go files need gofmt: " + formatted.stdout)
  );
const coreDirectory = path.join(root, "packages/execution-core-go");
const coreFormat = spawnSync("gofmt", ["-l", "config", "policy", "protocol", "execution"], {
  cwd: coreDirectory,
  encoding: "utf8",
  windowsHide: true,
});
if (coreFormat.error || coreFormat.status !== 0 || coreFormat.stdout.trim()) {
  throw coreFormat.error ?? new Error("Go core files need gofmt: " + coreFormat.stdout);
}
run("go", ["vet", "./..."], { cwd: coreDirectory });
run("go", ["test", "-race", "-count=1", "./..."], {
  cwd: coreDirectory,
  env: { ...process.env, CGO_ENABLED: "1" },
});
run("go", ["vet", "./..."], { cwd: directory });
run("go", ["test", "-race", "-count=1", "./..."], {
  cwd: directory,
  env: {
    ...process.env,
    CGO_ENABLED: "1",
    ...(process.env.REMOTEARC_TEST_CC
      ? { CC: process.env.REMOTEARC_TEST_CC }
      : {}),
  },
});
const require = createRequire(
  path.join(root, "packages/execution-core/package.json"),
);
run(process.execPath, [
  require.resolve("tsx/cli"),
  path.join(root, "packages/cli/scripts/go-agent-compat-test.ts"),
]);
run(process.execPath, [
  require.resolve("tsx/cli"),
  path.join(root, "apps/mcp/scripts/go-smoke.ts"),
]);
run(process.execPath, [path.join(root, "scripts/go-device-recovery-test.mjs")]);
