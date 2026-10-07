import assert from "node:assert/strict";
import {
  resolveProductionDeployPolicy,
  deploymentMetadata,
  shouldSkipStaleProductionDeploy,
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

assert.equal(
  shouldSkipStaleProductionDeploy({
    source: "github-actions",
    ref: "master",
    requestedSha: "old",
    latestMasterSha: "new",
  }),
  true,
);
assert.equal(
  shouldSkipStaleProductionDeploy({
    source: "github-actions",
    ref: "refs/heads/master",
    requestedSha: "same",
    latestMasterSha: "same",
  }),
  false,
);
assert.equal(
  shouldSkipStaleProductionDeploy({
    source: "manual-emergency",
    ref: "master",
    requestedSha: "old",
    latestMasterSha: "new",
  }),
  false,
  "Emergency manual deploys remain an explicit operator escape hatch.",
);

console.log("PASS: production deploy policy blocks duplicate and stale deploys");
