import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  resolveProductionDeployPolicy,
  deploymentMetadata,
} from "./deploy-relay-policy.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipBuild = process.argv.includes("--skip-build");
const policy = resolveProductionDeployPolicy(process.env);

if (!policy.allowed) {
  console.error("\nRemote Arc production deploy blocked.\n");
  console.error(policy.reason);
  console.error("");
  process.exit(2);
}

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let sha = process.env.REMOTEARC_DEPLOY_SHA || process.env.GITHUB_SHA || "";
if (!sha) {
  try {
    sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    sha = "unknown";
  }
}

const ref =
  process.env.REMOTEARC_DEPLOY_REF ||
  process.env.GITHUB_REF_NAME ||
  process.env.GITHUB_REF ||
  process.env.BRANCH_NAME ||
  "local";

const metadata = deploymentMetadata({
  source: policy.source,
  sha,
  ref,
});

console.log(
  `Remote Arc production deploy allowed: ${policy.source} · ${metadata.tag}`,
);

if (!skipBuild) {
  run("pnpm", ["build:ui"]);
}

run(
  "pnpm",
  [
    "exec",
    "wrangler",
    "deploy",
    "--tag",
    metadata.tag,
    "--message",
    metadata.message,
  ],
  path.join(repoRoot, "apps", "relay"),
);
