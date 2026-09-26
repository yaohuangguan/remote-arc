import {
  createSession,
  nowIso,
  sessionCookie,
  sha256Hex,
} from "./auth.js";

type ReviewerEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
};

const appOrigin = (env: ReviewerEnv) => env.APP_ORIGIN || env.PUBLIC_ORIGIN;

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/overview";
  return value;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] || char);
}

export function handleLoginPage(request: Request, env: ReviewerEnv) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));
  const googleHref = "/auth/google?return_to=" + encodeURIComponent(returnTo);
  const reviewerEnabled = Boolean(env.REVIEWER_EMAIL && env.REVIEWER_PASSWORD_SHA256);

  const reviewerForm = reviewerEnabled
    ? `
      <div class="divider"><span>Reviewer access</span></div>
      <form method="post" action="/auth/reviewer">
        <input type="hidden" name="return_to" value="${escapeHtml(returnTo)}" />
        <label>Email<input type="email" name="email" autocomplete="username" required /></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required /></label>
        <button type="submit" class="reviewer">Sign in to review account</button>
      </form>
    `
    : "";

  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Sign in to Remote Arc</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#030712;color:#eaf8fb;font:16px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}
.card{width:min(100%,430px);padding:28px;border:1px solid #1f3352;border-radius:24px;background:#08111f;box-shadow:0 30px 90px rgba(0,0,0,.35)}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:20px}.mark{width:38px;height:38px;border:1px solid #38bdf8;border-radius:50%;display:grid;place-items:center;color:#7dd3fc;font-weight:900}.brand strong{font-size:21px}
p{color:#8fa6ad;margin:0 0 20px}.google,.reviewer{width:100%;height:46px;border-radius:12px;border:1px solid #29435d;font-weight:750;cursor:pointer}.google{display:grid;place-items:center;text-decoration:none;background:#f8fafc;color:#111827}.reviewer{margin-top:14px;background:#0b2231;color:#eaf8fb}
.divider{display:flex;align-items:center;gap:10px;color:#6f8993;font-size:12px;margin:22px 0}.divider:before,.divider:after{content:"";height:1px;flex:1;background:#1f3352}
form{display:grid;gap:12px}label{display:grid;gap:6px;color:#a8bac1;font-size:13px}input{height:44px;border:1px solid #29435d;border-radius:10px;background:#030b11;color:#fff;padding:0 12px;font:inherit}
.note{margin-top:18px;color:#607b86;font-size:12px}
</style>
</head>
<body>
  <main class="card">
    <div class="brand"><span class="mark">R</span><strong>Remote Arc</strong></div>
    <p>Authorize your AI client to access the Remote Arc account you choose.</p>
    <a class="google" href="${googleHref}">Continue with Google</a>
    ${reviewerForm}
    <div class="note">Reviewer credentials are isolated from normal user accounts and are used only for OpenAI plugin review.</div>
  </main>
</body>
</html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function handleReviewerLogin(request: Request, env: ReviewerEnv) {
  if (!env.REVIEWER_EMAIL || !env.REVIEWER_PASSWORD_SHA256) {
    return new Response("Reviewer access is not configured", { status: 404 });
  }

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const returnTo = safeReturnTo(String(form.get("return_to") || "/overview"));

  if (
    email !== env.REVIEWER_EMAIL.trim().toLowerCase() ||
    (await sha256Hex(password)) !== env.REVIEWER_PASSWORD_SHA256
  ) {
    return new Response("Invalid reviewer credentials", { status: 401 });
  }

  let user = await env.DB.prepare(
    "SELECT id FROM users WHERE email = ?1 LIMIT 1",
  ).bind(email).first<{ id: string }>();

  if (!user) {
    const userId = "reviewer-openai-v1";
    await env.DB.prepare(
      `INSERT INTO users (id, google_sub, email, name, avatar_url, created_at)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5)`,
    ).bind(userId, "reviewer-openai-v1", email, "OpenAI Reviewer", nowIso()).run();
    user = { id: userId };
  }

  const token = await createSession(user.id, env);
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL(returnTo, appOrigin(env)).toString(),
      "set-cookie": sessionCookie(token),
      "cache-control": "no-store",
    },
  });
}
