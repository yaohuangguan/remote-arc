export type GitHubAutomationEnv = {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_API_BASE_URL?: string;
};

export type GitHubMergeSpec = {
  type: "github_merge_pr";
  owner: string;
  repo: string;
  pull_number: number;
  installation_id?: string;
  merge_method?: "merge" | "squash" | "rebase";
  expected_head_sha?: string;
};

const API_VERSION = "2026-03-10";

const base64Url = (value: Uint8Array | string) => {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

const pemBytes = (pem: string) => {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (?:RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

async function githubAppJwt(env: GitHubAutomationEnv) {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error(
      "GitHub App is not configured. GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 8 * 60,
      iss: env.GITHUB_APP_ID,
    }),
  );
  const signingInput = header + "." + payload;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(env.GITHUB_APP_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + "." + base64Url(new Uint8Array(signature));
}

const githubHeaders = (token: string) => ({
  accept: "application/vnd.github+json",
  authorization: "Bearer " + token,
  "content-type": "application/json",
  "x-github-api-version": API_VERSION,
  "user-agent": "Remote-Arc-Automations",
});

async function installationToken(
  env: GitHubAutomationEnv,
  spec: GitHubMergeSpec,
) {
  const installationId =
    spec.installation_id || env.GITHUB_APP_INSTALLATION_ID;
  if (!installationId) {
    throw new Error(
      "GitHub installation ID is missing for this automation.",
    );
  }

  const jwt = await githubAppJwt(env);
  const apiBase = (env.GITHUB_API_BASE_URL || "https://api.github.com").replace(/\/$/, "");
  const response = await fetch(
    apiBase + "/app/installations/" +
      encodeURIComponent(installationId) +
      "/access_tokens",
    {
      method: "POST",
      headers: githubHeaders(jwt),
      body: JSON.stringify({
        repositories: [spec.repo],
        permissions: {
          contents: "write",
          pull_requests: "read",
        },
      }),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as {
    token?: string;
    message?: string;
  };
  if (!response.ok || !payload.token) {
    throw new Error(
      "GitHub App installation token failed: " +
        (payload.message || response.status + " " + response.statusText),
    );
  }
  return payload.token;
}

export function githubAutomationConfigured(env: GitHubAutomationEnv) {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

export async function mergeGitHubPullRequest(
  env: GitHubAutomationEnv,
  spec: GitHubMergeSpec,
) {
  const token = await installationToken(env, spec);
  const apiBase = (env.GITHUB_API_BASE_URL || "https://api.github.com").replace(/\/$/, "");
  const response = await fetch(
    apiBase + "/repos/" +
      encodeURIComponent(spec.owner) +
      "/" +
      encodeURIComponent(spec.repo) +
      "/pulls/" +
      spec.pull_number +
      "/merge",
    {
      method: "PUT",
      headers: githubHeaders(token),
      body: JSON.stringify({
        merge_method: spec.merge_method || "merge",
        ...(spec.expected_head_sha ? { sha: spec.expected_head_sha } : {}),
      }),
    },
  );

  const payload = (await response.json().catch(() => ({}))) as {
    merged?: boolean;
    message?: string;
    sha?: string;
  };

  if (!response.ok || payload.merged !== true) {
    throw new Error(
      "GitHub PR merge failed: " +
        (payload.message || response.status + " " + response.statusText),
    );
  }

  return {
    merged: true,
    sha: payload.sha || null,
    message: payload.message || "Pull request merged.",
    repository: spec.owner + "/" + spec.repo,
    pull_number: spec.pull_number,
    merge_method: spec.merge_method || "merge",
  };
}
