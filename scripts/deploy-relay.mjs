import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  resolveProductionDeployPolicy,
  deploymentMetadata,
  shouldSkipStaleProductionDeploy,
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

function latestRemoteMasterSha() {
  try {
    const output = execFileSync(
      "git",
      ["ls-remote", "origin", "refs/heads/master"],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    return output.split(/\s+/)[0] || "";
  } catch {
    throw new Error(
      "Could not verify the latest origin/master SHA; refusing production deploy.",
    );
  }
}

function ensureLatestMaster(stage) {
  if (policy.source !== "github-actions") return;

  const latestMasterSha = latestRemoteMasterSha();
  if (!latestMasterSha) {
    throw new Error(
      "origin/master returned no SHA; refusing production deploy.",
    );
  }

  if (
    shouldSkipStaleProductionDeploy({
      source: policy.source,
      ref,
      requestedSha: sha,
      latestMasterSha,
    })
  ) {
    console.log(
      `Skipping stale production deploy at ${stage}: ${sha.slice(0, 12)} is no longer origin/master (${latestMasterSha.slice(0, 12)}).`,
    );
    process.exit(0);
  }

  console.log(
    `Verified latest master at ${stage}: ${latestMasterSha.slice(0, 12)}`,
  );
}

const metadata = deploymentMetadata({
  source: policy.source,
  sha,
  ref,
});

console.log(
  `Remote Arc production deploy allowed: ${policy.source} · ${metadata.tag}`,
);

ensureLatestMaster("pre-build");

if (!skipBuild) {
  run("pnpm", ["build:ui"]);
}

ensureLatestMaster("pre-upload");

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
