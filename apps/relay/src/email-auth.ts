import {
  addSecondsIso,
  createSession,
  nowIso,
  safeReturnTo,
  sessionCookie,
} from "./auth.js";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

function formPage(email: string, returnTo: string, message = "") {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Verify email · Remote Arc</title>
<style>
*{box-sizing:border-box}body{font:16px/1.55 system-ui,-apple-system,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px;margin:0;background:#06111b;color:#f0f9fc}
main{width:min(100%,430px);padding:28px;border:1px solid #2a4356;border-radius:20px;background:#0b1a26}
h1{font-size:26px;margin:0 0 10px}p{color:#adc5ce}label{display:block;margin-top:20px;font-size:14px}
input{width:100%;height:48px;background:#09121d;border:1px solid #416079;border-radius:10px;color:white;margin:8px 0 14px;padding:0 13px;font:inherit}
button{height:48px;width:100%;border:0;background:#d9f5ff;border-radius:10px;color:#062436;font-weight:750;cursor:pointer}
small{color:#96b2bf}a{color:#8ee5fa}.error{color:#ffb3b3}
</style></head><body><main>
<h1>Check your email</h1>
<p>If this address is eligible, we've sent a six-digit sign-in code to <strong>${escapeHtml(email)}</strong>. It expires in 10 minutes.</p>
${message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : ""}
<form action="/auth/email/verify" method="post">
<input type="hidden" name="email" value="${escapeHtml(email)}">
<input type="hidden" name="return_to" value="${escapeHtml(returnTo)}">
<label for="code">Verification code</label>
<input id="code" name="code" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>
<button type="submit">Continue securely</button></form>
<p><small>Didn't receive a code? Wait a minute and <a href="/auth/login?return_to=${encodeURIComponent(returnTo)}">request another</a>.</small></p>
</main></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function sameOriginForm(request: Request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin &&
    (request.headers.get("content-type") || "").toLowerCase().startsWith("application/x-www-form-urlencoded");
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
  if (!sameOriginForm(request)) return new Response("Invalid form origin", { status: 403 });
  const form = await request.formData();
  const email = normalizeEmail(form.get("email"));
  if (!email) return new Response("Invalid email address", { status: 400 });
  const returnTo = safeReturnTo(String(form.get("return_to") || ""), request, env);
  if (!(await eligibleForEmailAuth(env, email))) return formPage(email, returnTo);

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

  if ((result.meta?.changes || 0) !== 1) return formPage(email, returnTo);

  let sent = false;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || "Remote Arc <login@remotearc.app>",
        to: [email],
        subject: "Your Remote Arc sign-in code",
        text: `Your Remote Arc sign-in code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this message.`,
        html: `<div style="font:16px/1.6 system-ui,sans-serif;color:#132937"><h2>Sign in to Remote Arc</h2><p>Your one-time verification code:</p><p style="font-size:32px;font-weight:750;letter-spacing:7px">${code}</p><p>Expires in 10 minutes. If this wasn't you, simply ignore the message.</p></div>`,
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
  return formPage(email, returnTo);
}

export async function handleEmailCodeVerify(request: Request, env: EmailEnv) {
  if (!emailLoginEnabled(env)) return Response.json({ error: "email_login_unavailable" }, { status: 503 });
  if (!sameOriginForm(request)) return new Response("Invalid form origin", { status: 403 });
  const form = await request.formData();
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
    return formPage(email, returnTo, "Incorrect, expired, or already used code. Please try again or request a new one.");
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
