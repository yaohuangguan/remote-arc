import { handleOAuthAuthorize, handleOAuthDecision } from "../src/oauth.js";

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

console.log("OAuth consent security regression tests passed");
