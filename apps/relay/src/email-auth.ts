import {
  addSecondsIso,
  createSession,
  nowIso,
  safeReturnTo,
  sessionCookie,
} from "./auth.js";
import { authPage, escapeAuthHtml } from "./auth-page.js";
import { renderOtpEmail } from "./email-template.js";
import { emailFormToken, validEmailFormToken } from "./email-form-csrf.js";

type EmailEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  ALLOW_SIGNUPS?: string;
  ALLOWED_EMAILS?: string;
  REVIEWER_EMAIL?: string;
  RESEND_API_KEY?: string;
  EMAIL_AUTH_SECRET?: string;
  EMAIL_FROM?: string;
};

const MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_MS = 60_000;
const DAILY_SEND_LIMIT = 5;
const CODE_TTL_SECONDS = 600;
const encoder = new TextEncoder();

export function emailLoginEnabled(env: EmailEnv) {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_AUTH_SECRET);
}

function formPage(email: string, returnTo: string, message = "", request?: Request) {
  const { token, setCookie } = emailFormToken(request || new Request("https://mcp.remotearc.app/auth/email/request"));
  const page = authPage("Verify your email", `
    <a class="back" href="/auth/login?return_to=${encodeURIComponent(returnTo)}">← Back to sign in</a>
    <div class="badge">Secure, passwordless sign-in</div>
    <h1>Check your inbox</h1>
    <p class="lead">Enter the 6-digit code sent to <span class="email-highlight">${escapeAuthHtml(email)}</span>.
      The code expires in 10 minutes.</p>
    ${message ? `<p class="error" role="alert">${escapeAuthHtml(message)}</p>` : ""}
    <form action="/auth/email/verify" method="post">
      <input type="hidden" name="email_csrf" value="${token}">
      <input type="hidden" name="email" value="${escapeAuthHtml(email)}">
      <input type="hidden" name="return_to" value="${escapeAuthHtml(returnTo)}">
      <label for="code">Verification code</label>
      <input class="field code" id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}"
        minlength="6" maxlength="6" autocomplete="one-time-code" aria-label="Six-digit verification code"
        placeholder="000000" required autofocus>
      <button class="primary" type="submit">Verify &amp; continue →</button>
    </form>
    <p class="note">Didn't get the email? Check spam, or <a class="link" href="/auth/login?return_to=${encodeURIComponent(returnTo)}">try again in a minute</a>.
    You can also choose Google sign-in.</p>
  `);
  if (setCookie) page.headers.append("set-cookie", setCookie);
  return page;
}

/**
 * Forms can legitimately originate on the marketing host and reach the MCP host
 * via the existing 307 auth route. Both are trusted first-party origins.
 * No wildcard, null origin, or unrelated domain is accepted.
 */
function trustedAuthForm(request: Request, env: EmailEnv) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded")) return false;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const allowed = new Set([
    new URL(request.url).origin,
    new URL(env.MARKETING_ORIGIN || "https://remotearc.app").origin,
  ]);
  const origin = request.headers.get("origin");
  if (origin) return allowed.has(origin);
  // Privacy-sensitive browsers/proxies may omit Origin. Referer must still
  // prove the form came from a first-party HTTPS page; never allow both absent.
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const ref = new URL(referer);
    return ref.protocol === "https:" && allowed.has(ref.origin);
  } catch {
    return false;
  }
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

async function codeHash(email: string, code: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(email + ":" + code));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function numericCode() {
  const bytes = new Uint32Array(1);
  // Reject biased 32-bit values to produce uniform 6-digit OTPs.
  const cap = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  do { crypto.getRandomValues(bytes); } while (bytes[0]! >= cap);
  return String(bytes[0]! % 1_000_000).padStart(6, "0");
}

async function lookupUser(env: EmailEnv, email: string) {
  return env.DB.prepare("SELECT id FROM users WHERE lower(email) = ?1 LIMIT 1")
    .bind(email).first<{ id: string }>();
}

async function eligibleForEmailAuth(env: EmailEnv, email: string) {
  if (email === env.REVIEWER_EMAIL?.trim().toLowerCase()) return false;
  const allowed = (env.ALLOWED_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(email)) return false;
  const user = await lookupUser(env, email);
  if (user?.id === "reviewer-openai-v1") return false;
  if (user || env.ALLOW_SIGNUPS === "1") return true;
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
  return (row?.count || 0) === 0;
}

export async function handleEmailCodeRequest(request: Request, env: EmailEnv) {
  if (!emailLoginEnabled(env)) return Response.json({ error: "email_login_unavailable" }, { status: 503 });
  const form = await request.formData();
  if (!trustedAuthForm(request, env) && !validEmailFormToken(request, form)) {
    return new Response("Invalid form origin", { status: 403 });
  }
  const email = normalizeEmail(form.get("email"));
  if (!email) return new Response("Invalid email address", { status: 400 });
  const returnTo = safeReturnTo(String(form.get("return_to") || ""), request, env);
  if (!(await eligibleForEmailAuth(env, email))) return formPage(email, returnTo, "", request);

  const code = numericCode();
  const hash = await codeHash(email, code, env.EMAIL_AUTH_SECRET!);
  const now = nowIso();
  const sendBefore = new Date(Date.now() - SEND_COOLDOWN_MS).toISOString();
  const windowBefore = new Date(Date.now() - 86_400_000).toISOString();

  // Atomic per-mailbox throttle; concurrent requests cannot all send.
  const result = await env.DB.prepare(
    `INSERT INTO email_login_challenges
     (email, code_hash, return_to, requested_at, expires_at, attempts, verified_at, window_start, daily_count)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, ?4, 1)
     ON CONFLICT(email) DO UPDATE SET
       code_hash = excluded.code_hash,
       return_to = excluded.return_to,
       requested_at = excluded.requested_at,
       expires_at = excluded.expires_at,
       attempts = 0,
       verified_at = NULL,
       daily_count = CASE WHEN window_start < ?6 THEN 1 ELSE daily_count + 1 END,
       window_start = CASE WHEN window_start < ?6 THEN excluded.window_start ELSE window_start END
     WHERE requested_at < ?7 AND (window_start < ?6 OR daily_count < ?8)`,
  ).bind(email, hash, returnTo, now, addSecondsIso(CODE_TTL_SECONDS), windowBefore, sendBefore, DAILY_SEND_LIMIT).run();

  if ((result.meta?.changes || 0) !== 1) return formPage(email, returnTo, "", request);

  let sent = false;
  try {
    const emailMessage = renderOtpEmail(code);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Remote Arc <login@remotearc.app>",
        to: [email],
        ...emailMessage,
      }),
    });
    sent = response.ok;
    if (!sent) console.warn("email_delivery_failed", { status: response.status });
  } catch {
    console.warn("email_delivery_unreachable");
  }
  if (!sent) {
    await env.DB.prepare("DELETE FROM email_login_challenges WHERE email = ?1 AND code_hash = ?2")
      .bind(email, hash).run();
    return new Response("Email service temporarily unavailable. Try again later.", { status: 503 });
  }
  return formPage(email, returnTo, "", request);
}

export async function handleEmailCodeVerify(request: Request, env: EmailEnv) {
  if (!emailLoginEnabled(env)) return Response.json({ error: "email_login_unavailable" }, { status: 503 });
  const form = await request.formData();
  if (!trustedAuthForm(request, env) && !validEmailFormToken(request, form)) {
    return new Response("Invalid form origin", { status: 403 });
  }
  const email = normalizeEmail(form.get("email"));
  const code = String(form.get("code") || "").trim();
  if (!email || !/^[0-9]{6}$/.test(code)) return new Response("Invalid verification code", { status: 400 });
  const returnTo = safeReturnTo(String(form.get("return_to") || ""), request, env);
  const hash = await codeHash(email, code, env.EMAIL_AUTH_SECRET!);
  const now = nowIso();
  // The matching challenge is consumed exactly once even under concurrent verify calls.
  const consumed = await env.DB.prepare(
    `UPDATE email_login_challenges SET verified_at = ?3
     WHERE email = ?1 AND code_hash = ?2 AND verified_at IS NULL
       AND expires_at > ?3 AND attempts < ?4`,
  ).bind(email, hash, now, MAX_ATTEMPTS).run();
  if ((consumed.meta?.changes || 0) !== 1) {
    await env.DB.prepare(
      "UPDATE email_login_challenges SET attempts = attempts + 1 WHERE email = ?1 AND verified_at IS NULL AND expires_at > ?2 AND attempts < ?3",
    ).bind(email, now, MAX_ATTEMPTS).run();
    return formPage(email, returnTo, "Incorrect, expired, or already used code. Please try again or request a new one.", request);
  }

  if (!(await eligibleForEmailAuth(env, email))) {
    return new Response("Email account is not eligible", { status: 403 });
  }

  let user = await lookupUser(env, email);
  if (!user) {
    const id = crypto.randomUUID();
    // Reserved value is intentionally impossible to confuse with Google's numeric subject.
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (id, google_sub, email, created_at) VALUES (?1, ?2, ?3, ?4)",
    ).bind(id, "email:" + id, email, now).run();
    user = await lookupUser(env, email);
  }
  if (!user) return new Response("Unable to create account", { status: 503 });
  const token = await createSession(user.id, env);
  return new Response(null, {
    status: 303,
    headers: {
      location: returnTo,
      "set-cookie": sessionCookie(token),
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}