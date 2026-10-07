import assert from "node:assert/strict";
import {
  resolveProductionDeployPolicy,
  deploymentMetadata,
} from "./deploy-relay-policy.mjs";

assert.equal(resolveProductionDeployPolicy({}).allowed, false);
assert.equal(
  resolveProductionDeployPolicy({
    GITHUB_ACTIONS: "true",
    REMOTEARC_PRODUCTION_DEPLOY: "github-actions",
  }).source,
  "github-actions",
);
assert.equal(
  resolveProductionDeployPolicy({
    REMOTEARC_MANUAL_PROD_DEPLOY: "1",
  }).source,
  "manual-emergency",
);
assert.equal(
  resolveProductionDeployPolicy({
    REMOTEARC_PRODUCTION_DEPLOY: "github-actions",
  }).allowed,
  false,
  "A local shell must not impersonate the normal GitHub deployment path.",
);

const githubMeta = deploymentMetadata({
  source: "github-actions",
  sha: "874442d271f2e146f8d886612b69d73ea9b2e529",
  ref: "master",
});
assert.equal(githubMeta.tag, "gha-874442d271f2");
assert.match(githubMeta.message, /GitHub Actions deploy 874442d271f2 from master/);

const manualMeta = deploymentMetadata({
  source: "manual-emergency",
  sha: "abcdef1234567890",
  ref: "local",
});
assert.equal(manualMeta.tag, "manual-abcdef123456");

console.log("PASS: production deploy policy blocks accidental duplicate deploys");
