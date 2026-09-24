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
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_EMAILS?: string;
};

const SUPPORTED_SCOPES = [
  "devices:read",
  "computer:read",
  "computer:write",
] as const;

const mcpResource = (env: OAuthEnv) => env.PUBLIC_ORIGIN + "/mcp";

function normalizeScope(value: string | null) {
  const requested = (value || "devices:read computer:read computer:write")
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
    authorization_servers: [env.PUBLIC_ORIGIN],
    scopes_supported: [...SUPPORTED_SCOPES],
    resource_documentation: env.PUBLIC_ORIGIN,
  });
}

export function authorizationServerMetadata(env: OAuthEnv) {
  return Response.json({
    issuer: env.PUBLIC_ORIGIN,
    authorization_endpoint: env.PUBLIC_ORIGIN + "/oauth/authorize",
    token_endpoint: env.PUBLIC_ORIGIN + "/oauth/token",
    registration_endpoint: env.PUBLIC_ORIGIN + "/oauth/register",
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
  const state = url.searchParams.get("state") || undefined;
  const resource = url.searchParams.get("resource") || mcpResource(env);
  const scope = normalizeScope(url.searchParams.get("scope"));
  const approved = url.searchParams.get("approved") === "1";
  const denied = url.searchParams.get("denied") === "1";

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
    return redirectWith(redirectUri, {
      error: "invalid_target",
      error_description: "Unsupported resource",
      state,
    });
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
      env.PUBLIC_ORIGIN +
        "/auth/google?return_to=" +
        encodeURIComponent(returnTo),
      302,
    );
  }

  if (denied) {
    return redirectWith(redirectUri, {
      error: "access_denied",
      error_description: "The user denied the Remote Link authorization request.",
      state,
    });
  }

  if (!approved) {
    const consent = new URL(env.PUBLIC_ORIGIN + "/oauth/consent");
    for (const [key, value] of url.searchParams.entries()) {
      consent.searchParams.append(key, value);
    }
    consent.searchParams.set("scope", scope);
    return Response.redirect(consent.toString(), 302);
  }

  const code = randomToken();
  await env.DB.prepare(
    `INSERT INTO oauth_codes
      (code_hash, client_id, user_id, redirect_uri, code_challenge,
       resource, scope, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
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
    )
    .run();

  return redirectWith(redirectUri, {
    code,
    state,
    iss: env.PUBLIC_ORIGIN,
  });
}

async function issueTokens(
  env: OAuthEnv,
  input: {
    clientId: string;
    userId: string;
    resource: string;
    scope: string;
  },
) {
  const accessToken = "rla_" + randomToken();
  const refreshToken = "rlr_" + randomToken();
  const createdAt = nowIso();

  await env.DB.prepare(
    `INSERT INTO oauth_tokens
      (access_token_hash, refresh_token_hash, client_id, user_id,
       resource, scope, expires_at, refresh_expires_at, created_at, revoked_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)`,
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
      `SELECT client_id, user_id, redirect_uri, code_challenge, resource, scope
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
      `SELECT access_token_hash, user_id, client_id, resource, scope
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
      }>();

    if (!row || row.client_id !== clientId || row.resource !== resource) {
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    }

    await env.DB.prepare(
      "UPDATE oauth_tokens SET revoked_at = ?1 WHERE access_token_hash = ?2",
    )
      .bind(nowIso(), row.access_token_hash)
      .run();

    return Response.json(
      await issueTokens(env, {
        clientId,
        userId: row.user_id,
        resource: row.resource,
        scope: row.scope,
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
        '", scope="devices:read computer:read"',
    },
  });
}
