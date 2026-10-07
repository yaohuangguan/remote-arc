import {
  addSecondsIso,
  getSessionUser,
  nowIso,
  pkceChallenge,
  randomToken,
  sha256Hex,
} from "./auth.js";

type OAuthEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_EMAILS?: string;
};

const SUPPORTED_SCOPES = [
  "devices:read",
  "computer:read",
  "computer:write",
  "browser:read",
  "browser:interact",
  "automation:read",
  "automation:write",
  "agent:write",
  "offline_access",
] as const;

const appOrigin = (env: OAuthEnv) => env.APP_ORIGIN || env.PUBLIC_ORIGIN;
const mcpResource = (env: OAuthEnv) => appOrigin(env) + "/mcp";

function normalizeScope(value: string | null) {
  const requested = (value || "devices:read computer:read browser:read offline_access")
    .split(/\s+/)
    .filter(Boolean);
  const allowed = requested.filter((scope) =>
    (SUPPORTED_SCOPES as readonly string[]).includes(scope),
  );
  return Array.from(new Set(allowed)).join(" ");
}

function redirectWith(
  redirectUri: string,
  values: Record<string, string | undefined>,
) {
  const target = new URL(redirectUri);
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) target.searchParams.set(key, value);
  }
  return Response.redirect(target.toString(), 302);
}

export function protectedResourceMetadata(env: OAuthEnv) {
  return Response.json({
    resource: mcpResource(env),
    authorization_servers: [appOrigin(env)],
    scopes_supported: [...SUPPORTED_SCOPES],
    resource_documentation: appOrigin(env),
  });
}

export function authorizationServerMetadata(env: OAuthEnv) {
  return Response.json({
    issuer: appOrigin(env),
    authorization_endpoint: appOrigin(env) + "/oauth/authorize",
    token_endpoint: appOrigin(env) + "/oauth/token",
    registration_endpoint: appOrigin(env) + "/oauth/register",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...SUPPORTED_SCOPES],
    authorization_response_iss_parameter_supported: true,
  });
}

export async function handleDynamicClientRegistration(
  request: Request,
  env: OAuthEnv,
) {
  const body = (await request.json().catch(() => ({}))) as {
    redirect_uris?: string[];
    client_name?: string;
    token_endpoint_auth_method?: string;
  };

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:";
        } catch {
          return false;
        }
      })
    : [];

  if (!redirectUris.length) {
    return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  const method = body.token_endpoint_auth_method || "none";
  if (method !== "none") {
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description: "Only public PKCE clients are supported.",
      },
      { status: 400 },
    );
  }

  const clientId = "rlc_" + randomToken(20);
  await env.DB.prepare(
    `INSERT INTO oauth_clients
      (client_id, client_name, redirect_uris, token_endpoint_auth_method, created_at)
     VALUES (?1, ?2, ?3, 'none', ?4)`,
  )
    .bind(
      clientId,
      body.client_name || "MCP client",
      JSON.stringify(redirectUris),
      nowIso(),
    )
    .run();

  return Response.json(
    {
      client_id: clientId,
      client_name: body.client_name || "MCP client",
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}

export async function handleOAuthAuthorize(request: Request, env: OAuthEnv) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const resource = url.searchParams.get("resource") || mcpResource(env);
  const scope = normalizeScope(url.searchParams.get("scope"));

  if (
    responseType !== "code" ||
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    codeChallengeMethod !== "S256"
  ) {
    return new Response("Invalid OAuth authorization request", { status: 400 });
  }

  if (resource !== mcpResource(env)) {
    return new Response("Unsupported OAuth resource", { status: 400 });
  }

  const client = await env.DB.prepare(
    "SELECT redirect_uris FROM oauth_clients WHERE client_id = ?1",
  )
    .bind(clientId)
    .first<{ redirect_uris: string }>();

  if (!client) {
    return new Response("Unknown OAuth client", { status: 400 });
  }

  const allowedRedirects = JSON.parse(client.redirect_uris) as string[];
  if (!allowedRedirects.includes(redirectUri)) {
    return new Response("Redirect URI is not registered", { status: 400 });
  }

  const user = await getSessionUser(request, env);
  if (!user) {
    const returnTo = url.pathname + url.search;
    return Response.redirect(
      appOrigin(env) +
        "/auth/login?return_to=" +
        encodeURIComponent(returnTo),
      302,
    );
  }

  // Consent is never accepted from query-string flags. A top-level cross-site
  // navigation may carry a SameSite=Lax session cookie, so trusting an
  // approval flag here would let a crafted URL bypass the consent UI.
  const consent = new URL(appOrigin(env) + "/oauth/consent");
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "approved" || key === "denied") continue;
    consent.searchParams.append(key, value);
  }
  consent.searchParams.set("scope", scope);
  return Response.redirect(consent.toString(), 302);
}

export async function handleOAuthDecision(request: Request, env: OAuthEnv) {
  const expectedOrigin = new URL(appOrigin(env)).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return Response.json({ error: "invalid_consent_origin" }, { status: 403 });
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "invalid_request" }, { status: 415 });
  }

  const user = await getSessionUser(request, env);
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    decision?: unknown;
    response_type?: unknown;
    client_id?: unknown;
    redirect_uri?: unknown;
    code_challenge?: unknown;
    code_challenge_method?: unknown;
    state?: unknown;
    resource?: unknown;
    scope?: unknown;
  };

  const decision = body.decision;
  const responseType = typeof body.response_type === "string" ? body.response_type : "";
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const codeChallenge = typeof body.code_challenge === "string" ? body.code_challenge : "";
  const codeChallengeMethod =
    typeof body.code_challenge_method === "string" ? body.code_challenge_method : "";
  const state = typeof body.state === "string" ? body.state : undefined;
  const resource =
    typeof body.resource === "string" && body.resource
      ? body.resource
      : mcpResource(env);
  const scope = normalizeScope(typeof body.scope === "string" ? body.scope : null);

  if (
    (decision !== "allow" && decision !== "deny") ||
    responseType !== "code" ||
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    codeChallengeMethod !== "S256"
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  if (resource !== mcpResource(env)) {
    return Response.json({ error: "invalid_target" }, { status: 400 });
  }

  const client = await env.DB.prepare(
    "SELECT redirect_uris FROM oauth_clients WHERE client_id = ?1",
  )
    .bind(clientId)
    .first<{ redirect_uris: string }>();

  if (!client) {
    return Response.json({ error: "invalid_client" }, { status: 400 });
  }

  const allowedRedirects = JSON.parse(client.redirect_uris) as string[];
  if (!allowedRedirects.includes(redirectUri)) {
    return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  }

  if (decision === "deny") {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "access_denied");
    target.searchParams.set(
      "error_description",
      "The user denied the Remote Arc authorization request.",
    );
    if (state !== undefined) target.searchParams.set("state", state);
    return Response.json({ redirect_to: target.toString() });
  }

  const code = randomToken();
  const grantId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO oauth_codes
      (code_hash, client_id, user_id, redirect_uri, code_challenge,
       resource, scope, expires_at, created_at, grant_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
  )
    .bind(
      await sha256Hex(code),
      clientId,
      user.id,
      redirectUri,
      codeChallenge,
      resource,
      scope,
      addSecondsIso(300),
      nowIso(),
      grantId,
    )
    .run();

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state !== undefined) target.searchParams.set("state", state);
  target.searchParams.set("iss", appOrigin(env));
  return Response.json({ redirect_to: target.toString() });
}

async function issueTokens(
  env: OAuthEnv,
  input: {
    clientId: string;
    userId: string;
    resource: string;
    scope: string;
    grantId: string | null;
  },
) {
  const accessToken = "rla_" + randomToken();
  const refreshToken = "rlr_" + randomToken();
  const createdAt = nowIso();

  await env.DB.prepare(
    `INSERT INTO oauth_tokens
      (access_token_hash, refresh_token_hash, client_id, user_id,
       resource, scope, expires_at, refresh_expires_at, created_at, revoked_at, grant_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10)`,
  )
    .bind(
      await sha256Hex(accessToken),
      await sha256Hex(refreshToken),
      input.clientId,
      input.userId,
      input.resource,
      input.scope,
      addSecondsIso(3600),
      addSecondsIso(60 * 60 * 24 * 30),
      createdAt,
      input.grantId,
    )
    .run();

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: input.scope,
  };
}

export async function handleOAuthToken(request: Request, env: OAuthEnv) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") || "");
  const clientId = String(form.get("client_id") || "");
  const resource = String(form.get("resource") || mcpResource(env));

  if (!clientId || resource !== mcpResource(env)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const client = await env.DB.prepare(
    "SELECT client_id FROM oauth_clients WHERE client_id = ?1",
  )
    .bind(clientId)
    .first();

  if (!client) {
    return Response.json({ error: "invalid_client" }, { status: 401 });
  }

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    const verifier = String(form.get("code_verifier") || "");
    if (!code || !redirectUri || !verifier) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const codeHash = await sha256Hex(code);
    const row = await env.DB.prepare(
      `SELECT client_id, user_id, redirect_uri, code_challenge, resource, scope, grant_id
       FROM oauth_codes
       WHERE code_hash = ?1 AND expires_at > ?2`,
    )
      .bind(codeHash, nowIso())
      .first<{
        client_id: string;
        user_id: string;
        redirect_uri: string;
        code_challenge: string;
        resource: string;
        scope: string;
        grant_id: string | null;
      }>();

    if (
      !row ||
      row.client_id !== clientId ||
      row.redirect_uri !== redirectUri ||
      row.resource !== resource ||
      (await pkceChallenge(verifier)) !== row.code_challenge
    ) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    await env.DB.prepare("DELETE FROM oauth_codes WHERE code_hash = ?1")
      .bind(codeHash)
      .run();

    return Response.json(
      await issueTokens(env, {
        clientId,
        userId: row.user_id,
        resource: row.resource,
        scope: row.scope,
        grantId: row.grant_id,
      }),
    );
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") || "");
    if (!refreshToken) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const refreshHash = await sha256Hex(refreshToken);
    const row = await env.DB.prepare(
      `SELECT access_token_hash, user_id, client_id, resource, scope, grant_id
       FROM oauth_tokens
       WHERE refresh_token_hash = ?1
         AND refresh_expires_at > ?2
         AND revoked_at IS NULL`,
    )
      .bind(refreshHash, nowIso())
      .first<{
        access_token_hash: string;
        user_id: string;
        client_id: string;
        resource: string;
        scope: string;
        grant_id: string | null;
      }>();

    if (!row || row.client_id !== clientId || row.resource !== resource) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    const tokenGraceExpiresAt = addSecondsIso(120);

    // Keep both the old access token and refresh token usable for a short,
    // non-extending overlap window. MCP hosts can have in-flight tool calls
    // while a refresh happens; invalidating either credential immediately can
    // make an otherwise healthy session look unauthenticated.
    await env.DB.prepare(
      `UPDATE oauth_tokens
       SET expires_at = CASE
             WHEN expires_at > ?1 THEN ?1
             ELSE expires_at
           END,
           refresh_expires_at = CASE
             WHEN refresh_expires_at > ?1 THEN ?1
             ELSE refresh_expires_at
           END
       WHERE access_token_hash = ?2
         AND revoked_at IS NULL`,
    )
      .bind(tokenGraceExpiresAt, row.access_token_hash)
      .run();

    return Response.json(
      await issueTokens(env, {
        clientId,
        userId: row.user_id,
        resource: row.resource,
        scope: row.scope,
        grantId: row.grant_id,
      }),
    );
  }

  return Response.json({ error: "unsupported_grant_type" }, { status: 400 });
}

export function mcpUnauthorized(env: OAuthEnv) {
  const metadata = env.PUBLIC_ORIGIN + "/.well-known/oauth-protected-resource";
  return new Response("OAuth authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate":
        'Bearer resource_metadata="' +
        metadata +
        '", scope="devices:read computer:read browser:read"',
    },
  });
}
