export function resolveProductionDeployPolicy(env = process.env) {
  if (
    env.GITHUB_ACTIONS === "true" &&
    env.REMOTEARC_PRODUCTION_DEPLOY === "github-actions"
  ) {
    return { allowed: true, source: "github-actions" };
  }

  if (env.REMOTEARC_MANUAL_PROD_DEPLOY === "1") {
    return { allowed: true, source: "manual-emergency" };
  }

  return {
    allowed: false,
    source: "blocked",
    reason:
      "Production deployment is automatic after CI succeeds on master. " +
      "For an emergency manual deploy only, run " +
      "REMOTEARC_MANUAL_PROD_DEPLOY=1 pnpm deploy:relay",
  };
}

export function shouldSkipStaleProductionDeploy({
  source,
  ref,
  requestedSha,
  latestMasterSha,
}) {
  const normalizedRef = (ref || "").replace(/^refs\/heads\//, "");
  return (
    source === "github-actions" &&
    normalizedRef === "master" &&
    Boolean(requestedSha) &&
    Boolean(latestMasterSha) &&
    requestedSha !== latestMasterSha
  );
}

export function deploymentMetadata({
  source,
  sha,
  ref,
}) {
  const shortSha = (sha || "unknown").slice(0, 12);
  const safeRef = (ref || "unknown")
    .replace(/^refs\/heads\//, "")
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .slice(0, 80);

  if (source === "github-actions") {
    return {
      tag: `gha-${shortSha}`,
      message: `GitHub Actions deploy ${shortSha} from ${safeRef}`,
    };
  }

  return {
    tag: `manual-${shortSha}`,
    message: `Emergency manual deploy ${shortSha} from ${safeRef}`,
  };
}
