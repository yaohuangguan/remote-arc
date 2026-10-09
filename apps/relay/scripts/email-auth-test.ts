import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { handleEmailCodeRequest, handleEmailCodeVerify } from "../src/email-auth.js";
import { handleLoginPage } from "../src/reviewer.js";

const ORIGIN = "https://mcp.remotearc.app";
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);
sqlite.exec(readFileSync(new URL("../migrations/0024_email_login.sql", import.meta.url), "utf8"));

function d1(sqliteDb: DatabaseSync) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>() {
              return (sqliteDb.prepare(sql).get(...args as (string | number | bigint | null)[]) as T | undefined) || null;
            },
            async run() {
              const result = sqliteDb.prepare(sql).run(...args as (string | number | bigint | null)[]);
              return { success: true, meta: { changes: Number(result.changes) } };
            },
          };
        },
        async first<T>() {
          return (sqliteDb.prepare(sql).get() as T | undefined) || null;
        },
      };
    },
  } as unknown as D1Database;
}

const env = {
  DB: d1(sqlite),
  PUBLIC_ORIGIN: ORIGIN,
  APP_ORIGIN: ORIGIN,
  MARKETING_ORIGIN: "https://remotearc.app",
  RESEND_API_KEY: "test-resend-key",
  EMAIL_AUTH_SECRET: "test-secret-not-for-production",
  ALLOW_SIGNUPS: "1",
  REVIEWER_EMAIL: "openai-reviewer@remotearc.app",
};

function formRequest(route: string, values: Record<string, string>, origin: string = ORIGIN) {
  return new Request(ORIGIN + route, {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
  });
}
let sent = 0;
let code = "";
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_input, init) => {
  sent++;
  const payload = JSON.parse(String(init?.body)) as { text: string; from: string };
  assert.match(payload.from, /remotearc\.app/);
  code = payload.text.match(/\b[0-9]{6}\b/)?.[0] || "";
  return Response.json({ id: "email-sent" });
};
try {
  // Login page still provides Google and reviewer options, but email is feature-gated.
  const html = await (await handleLoginPage(new Request(ORIGIN + "/auth/login"), env)).text();
  assert.match(html, /Continue with Google/);
  assert.match(html, /auth\/email\/request/);
  assert.doesNotMatch(await (await handleLoginPage(new Request(ORIGIN + "/auth/login"), {
    ...env, RESEND_API_KEY: undefined,
  })).text(), /auth\/email\/request/);

  assert.equal((await handleEmailCodeRequest(formRequest("/auth/email/request", {
    email: "new@example.com",
  }, "https://evil.example"), env)).status, 403);
  assert.equal(sent, 0, "Cross-site requests must not send email");

  const first = await handleEmailCodeRequest(formRequest("/auth/email/request", {
    email: "NEW@EXAMPLE.COM", return_to: "https://evil.example/steal",
  }), env);
  assert.equal(first.status, 200);
  assert.equal(sent, 1);
  assert.match(await first.text(), /Check your inbox/);
  assert.equal(code.length, 6);
  assert.equal(sqlite.prepare("SELECT return_to FROM email_login_challenges WHERE email = ?").get("new@example.com")?.return_to, ORIGIN + "/");

  // Per-address rate limit cannot be evaded with different capitalization.
  await handleEmailCodeRequest(formRequest("/auth/email/request", { email: "new@example.com" }), env);
  assert.equal(sent, 1);

  assert.equal((await handleEmailCodeVerify(formRequest("/auth/email/verify", {
    email: "new@example.com", code: "999999", return_to: "/overview",
  }), env)).status, 200);
  assert.equal(sqlite.prepare("SELECT attempts FROM email_login_challenges WHERE email = ?").get("new@example.com")?.attempts, 1);

  const success = await handleEmailCodeVerify(formRequest("/auth/email/verify", {
    email: "new@example.com", code, return_to: "/overview",
  }), env);
  assert.equal(success.status, 303);
  assert.equal(success.headers.get("location"), ORIGIN + "/overview");
  assert.match(success.headers.get("set-cookie") || "", /rl_session=/);
  assert.match(String(sqlite.prepare("SELECT google_sub FROM users WHERE email = ?").get("new@example.com")?.google_sub), /^email:/);
  assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get()?.n), 1);
  assert.equal((await handleEmailCodeVerify(formRequest("/auth/email/verify", {
    email: "new@example.com", code,
  }), env)).status, 200);
  assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get()?.n), 1, "OTP must not be replayable");

  // A verified Google account must retain its same user ID, devices and grants.
  sqlite.prepare("INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)")
    .run("existing-google-user", "100000000001", "linked@example.com", new Date().toISOString());
  await handleEmailCodeRequest(formRequest("/auth/email/request", { email: "linked@example.com" }), env);
  const linked = await handleEmailCodeVerify(formRequest("/auth/email/verify", {
    email: "linked@example.com", code, return_to: "https://remotearc.app/dashboard",
  }), env);
  assert.equal(linked.status, 303);
  assert.equal(linked.headers.get("location"), "https://remotearc.app/dashboard");
  assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?").get("linked@example.com")?.n), 1);
  assert.equal(String(sqlite.prepare("SELECT user_id FROM sessions ORDER BY created_at DESC LIMIT 1").get()?.user_id) === "existing-google-user" ||
    Number(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get("existing-google-user")?.n) === 1, true);

  // Expired codes never create sessions even when the value is correct.
  await handleEmailCodeRequest(formRequest("/auth/email/request", { email: "expired@example.com" }), env);
  sqlite.prepare("UPDATE email_login_challenges SET expires_at = ? WHERE email = ?")
    .run("2020-01-01T00:00:00.000Z", "expired@example.com");
  assert.equal((await handleEmailCodeVerify(formRequest("/auth/email/verify", {
    email: "expired@example.com", code,
  }), env)).status, 200);
  assert.equal(sqlite.prepare("SELECT id FROM users WHERE email = ?").get("expired@example.com"), undefined);

  // Five wrong attempts exhaust the OTP, even if the correct value is supplied later.
  await handleEmailCodeRequest(formRequest("/auth/email/request", { email: "locked@example.com" }), env);
  const validLockedCode = code;
  const badCode = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) {
    assert.equal((await handleEmailCodeVerify(formRequest("/auth/email/verify", {
      email: "locked@example.com", code: badCode,
    }), env)).status, 200);
  }
  assert.equal((await handleEmailCodeVerify(formRequest("/auth/email/verify", {
    email: "locked@example.com", code: validLockedCode,
  }), env)).status, 200);
  assert.equal(sqlite.prepare("SELECT id FROM users WHERE email = ?").get("locked@example.com"), undefined);

  // A service failure invalidates the challenge; no unusable code remains.
  globalThis.fetch = async () => new Response("provider temporarily unavailable", { status: 503 });
  const failure = await handleEmailCodeRequest(formRequest("/auth/email/request", { email: "failed@example.com" }), env);
  assert.equal(failure.status, 503);
  assert.equal(sqlite.prepare("SELECT code_hash FROM email_login_challenges WHERE email = ?").get("failed@example.com"), undefined);

  // Reviewer-only demo identity must never become an email-login account.
  globalThis.fetch = async () => { throw new Error("not expected"); };
  const ignored = await handleEmailCodeRequest(formRequest("/auth/email/request", { email: env.REVIEWER_EMAIL }), env);
  assert.equal(ignored.status, 200);
  assert.equal(sqlite.prepare("SELECT * FROM email_login_challenges WHERE email = ?").get(env.REVIEWER_EMAIL), undefined);

  console.log("PASS: email OTP signup, Google account reuse, origin checks, throttling, expiry, replay, provider failure and reviewer isolation");
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
