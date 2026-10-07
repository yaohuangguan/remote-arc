import { handleDynamicClientRegistration, handleOAuthAuthorize, handleOAuthDecision, handleOAuthToken } from "../src/oauth.js";

const APP_ORIGIN = "https://mcp.remotearc.app";
const REDIRECT_URI = "https://client.example/callback";
const CLIENT_ID = "client-test";

const sessionUser = {
  id: "user-1",
  email: "user@example.com",
  name: "User",
  avatar_url: null,
  role: "user",
  plan: "free",
  has_plus_grant: 0,
};

function fakeDb() {
  const writes: string[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM oauth_clients")) {
                return { redirect_uris: JSON.stringify([REDIRECT_URI]) };
              }
              if (sql.includes("FROM sessions")) {
                return sessionUser;
              }
              return null;
            },
            async run() {
              writes.push(sql);
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { db, writes };
}

const envBase = {
  PUBLIC_ORIGIN: APP_ORIGIN,
  APP_ORIGIN,
};

async function registerRedirects(redirectUris: unknown[], method = "none") {
  const registrations: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      if (!sql.includes("INSERT INTO oauth_clients")) throw new Error("Unexpected registration query");
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              registrations.push(args);
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const response = await handleDynamicClientRegistration(new Request(APP_ORIGIN + "/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_uris: redirectUris, client_name: "Codex test", token_endpoint_auth_method: method }),
  }), { ...envBase, DB: db });
  return { response, registrations };
}

for (const redirect of [
  REDIRECT_URI,
  "http://127.0.0.1:49152/callback",
  "http://[::1]:49153/callback",
]) {
  const { response, registrations } = await registerRedirects([redirect]);
  if (response.status !== 201) throw new Error("Supported OAuth callback rejected: " + redirect);
  const payload = await response.json() as { redirect_uris: string[]; token_endpoint_auth_method: string };
  if (JSON.stringify(payload.redirect_uris) !== JSON.stringify([redirect]) ||
      registrations.length !== 1 || registrations[0][2] !== JSON.stringify([redirect])) {
    throw new Error("Registered OAuth callback was not preserved exactly: " + redirect);
  }
  if (payload.token_endpoint_auth_method !== "none") throw new Error("Native callback changed the public PKCE client contract");
}

for (const redirect of [
  "http://client.example/callback",
  "http://localhost:49152/callback",
  "http://127.0.0.1.example.com:49152/callback",
  "http://0.0.0.0:49152/callback",
  "http://192.168.1.1:49152/callback",
  "http://[::]:49152/callback",
  "http://user:password@127.0.0.1:49152/callback",
  "https://user:password@client.example/callback",
  REDIRECT_URI + "#fragment",
  REDIRECT_URI + "#",
  "http://127.0.0.1:49152/callback#fragment",
  "javascript:alert(1)",
  "not-a-url",
  42, null, {},
]) {
  const { response, registrations } = await registerRedirects([redirect]);
  if (response.status !== 400 || registrations.length !== 0) {
    throw new Error("Invalid OAuth callback was registered: " + JSON.stringify(redirect));
  }
}

{
  const { response, registrations } = await registerRedirects(["http://127.0.0.1:49152/callback"], "client_secret_post");
  if (response.status !== 400 || registrations.length !== 0) throw new Error("Loopback registration accepted a confidential client");
}

function authUrl(extra = "") {
  const url = new URL(APP_ORIGIN + "/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("code_challenge", "challenge");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", APP_ORIGIN + "/mcp");
  url.searchParams.set("state", "state-1");
  if (extra) {
    for (const [key, value] of new URLSearchParams(extra)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

{
  const { db } = fakeDb();
  const request = new Request(authUrl("approved=1"), {
    headers: { cookie: "rl_session=session-token" },
  });
  const response = await handleOAuthAuthorize(request, {
    ...envBase,
    DB: db as unknown as D1Database,
  });
  if (response.status !== 302) {
    throw new Error("authorization GET should redirect to consent");
  }
  const location = response.headers.get("location");
  if (!location) throw new Error("consent redirect missing");
  const consent = new URL(location);
  if (consent.pathname !== "/oauth/consent") {
    throw new Error("crafted approval flag bypassed consent");
  }
  if (consent.searchParams.has("approved") || consent.searchParams.has("denied")) {
    throw new Error("legacy consent decision flags leaked into consent URL");
  }
  const scopes = (consent.searchParams.get("scope") || "").split(/\s+/);
  if (scopes.includes("computer:write")) {
    throw new Error("omitted OAuth scope unexpectedly granted computer:write");
  }
}

{
  const { db } = fakeDb();
  const request = new Request(APP_ORIGIN + "/oauth/decision", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "rl_session=session-token" },
    body: JSON.stringify({
      decision: "allow",
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: "challenge",
      code_challenge_method: "S256",
      resource: APP_ORIGIN + "/mcp",
      scope: "devices:read computer:read",
    }),
  });
  const response = await handleOAuthDecision(request, {
    ...envBase,
    DB: db as unknown as D1Database,
  });
  if (response.status !== 403) {
    throw new Error("consent decision without same-origin Origin header was accepted");
  }
}

{
  const { db, writes } = fakeDb();
  const request = new Request(APP_ORIGIN + "/oauth/decision", {
    method: "POST",
    headers: {
      origin: APP_ORIGIN,
      "content-type": "application/json",
      cookie: "rl_session=session-token",
    },
    body: JSON.stringify({
      decision: "allow",
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_challenge: "challenge",
      code_challenge_method: "S256",
      resource: APP_ORIGIN + "/mcp",
      scope: "devices:read computer:read",
      state: "state-1",
    }),
  });
  const response = await handleOAuthDecision(request, {
    ...envBase,
    DB: db as unknown as D1Database,
  });
  if (!response.ok) {
    throw new Error("same-origin consent decision was rejected");
  }
  const payload = (await response.json()) as { redirect_to?: string };
  if (!payload.redirect_to) throw new Error("authorization redirect missing");
  const target = new URL(payload.redirect_to);
  if (!target.searchParams.get("code")) throw new Error("authorization code missing");
  if (target.searchParams.get("state") !== "state-1") {
    throw new Error("OAuth state was not preserved");
  }
  if (!writes.some((sql) => sql.includes("INSERT INTO oauth_codes"))) {
    throw new Error("approved consent did not persist an authorization code");
  }
}

{
  const writes: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("FROM oauth_clients")) return { client_id: CLIENT_ID };
              if (sql.includes("FROM oauth_tokens")) {
                return {
                  access_token_hash: "old-access-hash",
                  user_id: "user-1",
                  client_id: CLIENT_ID,
                  resource: APP_ORIGIN + "/mcp",
                  scope: "devices:read computer:read",
                  grant_id: "grant-1",
                };
              }
              return null;
            },
            async run() {
              writes.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  const refreshRequest = () =>
    new Request(APP_ORIGIN + "/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        resource: APP_ORIGIN + "/mcp",
        refresh_token: "refresh-test-value",
      }),
    });

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await handleOAuthToken(refreshRequest(), { ...envBase, DB: db });
    if (!response.ok) throw new Error("overlapping refresh attempt was rejected");
  }

  const graceUpdates = writes.filter(
    (item) => item.sql.includes("UPDATE oauth_tokens") && item.sql.includes("refresh_expires_at"),
  );
  if (graceUpdates.length !== 2) {
    throw new Error("overlapping refresh did not retain a bounded grace window");
  }
  for (const update of graceUpdates) {
    if (!update.sql.includes("WHEN expires_at > ?1 THEN ?1")) {
      throw new Error("old access token does not receive a bounded overlap window");
    }
    if (!update.sql.includes("WHEN refresh_expires_at > ?1 THEN ?1")) {
      throw new Error("refresh grace window can be extended");
    }
    if (update.sql.includes("SET revoked_at")) {
      throw new Error("refresh still revokes the old row immediately");
    }
  }
}

{
  const metadata = await import("../src/oauth.js").then((module) =>
    module.authorizationServerMetadata(envBase),
  );
  const body = (await metadata.json()) as { scopes_supported?: string[] };
  if (!body.scopes_supported?.includes("offline_access")) {
    throw new Error("OAuth discovery must advertise offline_access for persistent MCP clients");
  }
}

console.log("OAuth consent, refresh, and offline-access regression tests passed");
