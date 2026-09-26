type AuthEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_EMAILS?: string;
  ALLOW_SIGNUPS?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type OAuthIdentity = {
  userId: string;
  clientId: string;
  scope: string;
  resource: string;
};

const encoder = new TextEncoder();

export const nowIso = () => new Date().toISOString();

export const addSecondsIso = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toISOString();

export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomUserCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return chars.slice(0, 4).join("") + "-" + chars.slice(4).join("");
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function pkceChallenge(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export async function getSessionUser(
  request: Request,
  env: AuthEnv,
): Promise<SessionUser | null> {
  const token = cookieValue(request, "rl_session");
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.avatar_url
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
  )
    .bind(tokenHash, nowIso())
    .first<{
      id: string;
      email: string;
      name: string | null;
      avatar_url: string | null;
    }>();

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
  };
}

export async function createSession(userId: string, env: AuthEnv) {
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)",
  )
    .bind(
      await sha256Hex(token),
      userId,
      addSecondsIso(60 * 60 * 24 * 30),
      nowIso(),
    )
    .run();

  return token;
}

export function sessionCookie(token: string) {
  return [
    "rl_session=" + encodeURIComponent(token),
    "Path=/",
    "Domain=.remotearc.app",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=2592000",
  ].join("; ");
}

export async function handleGoogleLogin(request: Request, env: AuthEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return Response.json(
      {
        error: "google_login_not_configured",
        message: "Google OAuth credentials have not been configured yet.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));
  const state = randomToken();
  const stateHash = await sha256Hex(state);

  await env.DB.prepare(
    "INSERT INTO google_login_states (state_hash, return_to, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)",
  )
    .bind(stateHash, returnTo, addSecondsIso(600), nowIso())
    .run();

  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  target.searchParams.set("redirect_uri", (env.MARKETING_ORIGIN || "https://remotearc.app") + "/auth/google/callback");
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", "openid email profile");
  target.searchParams.set("state", state);
  target.searchParams.set("prompt", "select_account");

  return Response.redirect(target.toString(), 302);
}

export async function handleGoogleCallback(request: Request, env: AuthEnv) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return new Response("Google OAuth is not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) {
    return new Response("Missing OAuth code or state", { status: 400 });
  }

  const stateHash = await sha256Hex(state);
  const stateRow = await env.DB.prepare(
    "SELECT return_to FROM google_login_states WHERE state_hash = ?1 AND expires_at > ?2",
  )
    .bind(stateHash, nowIso())
    .first<{ return_to: string }>();

  await env.DB.prepare(
    "DELETE FROM google_login_states WHERE state_hash = ?1",
  )
    .bind(stateHash)
    .run();

  if (!stateRow) {
    return new Response("Google login state expired or invalid", { status: 400 });
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: (env.MARKETING_ORIGIN || "https://remotearc.app") + "/auth/google/callback",
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    return new Response("Google token exchange failed", { status: 502 });
  }

  const googleTokens = (await tokenResponse.json()) as {
    access_token?: string;
  };
  if (!googleTokens.access_token) {
    return new Response("Google returned no access token", { status: 502 });
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: "Bearer " + googleTokens.access_token } },
  );

  if (!userInfoResponse.ok) {
    return new Response("Google user lookup failed", { status: 502 });
  }

  const profile = (await userInfoResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!profile.sub || !profile.email || profile.email_verified === false) {
    return new Response("Verified Google email is required", { status: 403 });
  }

  const allowed = (env.ALLOWED_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length && !allowed.includes(profile.email.toLowerCase())) {
    return new Response("This Google account is not allowed", { status: 403 });
  }

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE google_sub = ?1 OR email = ?2 LIMIT 1",
  )
    .bind(profile.sub, profile.email)
    .first<{ id: string }>();

  if (!existing && env.ALLOW_SIGNUPS !== "1") {
    const countRow = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users",
    ).first<{ count: number }>();

    if ((countRow?.count || 0) > 0) {
      return new Response(
        "This Remote Arc instance is private. New account registration is disabled.",
        { status: 403 },
      );
    }
  }

  const userId = existing?.id || crypto.randomUUID();
  if (existing) {
    await env.DB.prepare(
      `UPDATE users
       SET google_sub = ?1, email = ?2, name = ?3, avatar_url = ?4
       WHERE id = ?5`,
    )
      .bind(
        profile.sub,
        profile.email,
        profile.name || null,
        profile.picture || null,
        userId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users
       (id, google_sub, email, name, avatar_url, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
      .bind(
        userId,
        profile.sub,
        profile.email,
        profile.name || null,
        profile.picture || null,
        nowIso(),
      )
      .run();
  }

  const session = await createSession(userId, env);
  return new Response(null, {
    status: 302,
    headers: {
      location: stateRow.return_to,
      "set-cookie": sessionCookie(session),
    },
  });
}

export async function handleLogout(request: Request, env: AuthEnv) {
  const token = cookieValue(request, "rl_session");
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1")
      .bind(await sha256Hex(token))
      .run();
  }

  return new Response(null, {
    status: 204,
    headers: {
      "set-cookie":
        "rl_session=; Path=/; Domain=.remotearc.app; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}

export async function authenticateDevice(request: Request, env: AuthEnv) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const tokenHash = await sha256Hex(header.slice(7));
  const row = await env.DB.prepare(
    `SELECT id, user_id, name, platform, arch, hostname
     FROM devices
     WHERE credential_hash = ?1 AND revoked_at IS NULL`,
  )
    .bind(tokenHash)
    .first<{
      id: string;
      user_id: string;
      name: string;
      platform: string;
      arch: string | null;
      hostname: string | null;
    }>();

  if (!row) return null;

  await env.DB.prepare("UPDATE devices SET last_seen = ?1 WHERE id = ?2")
    .bind(nowIso(), row.id)
    .run();

  return row;
}

export async function authenticateMcp(
  request: Request,
  env: AuthEnv,
): Promise<OAuthIdentity | null> {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const tokenHash = await sha256Hex(header.slice(7));
  const row = await env.DB.prepare(
    `SELECT user_id, client_id, scope, resource
     FROM oauth_tokens
     WHERE access_token_hash = ?1
       AND expires_at > ?2
       AND revoked_at IS NULL`,
  )
    .bind(tokenHash, nowIso())
    .first<{
      user_id: string;
      client_id: string;
      scope: string;
      resource: string;
    }>();

  if (!row) return null;
  return {
    userId: row.user_id,
    clientId: row.client_id,
    scope: row.scope,
    resource: row.resource,
  };
}
