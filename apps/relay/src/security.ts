import { getSessionUser, nowIso } from "./auth.js";
import { writeAudit } from "./audit.js";

type SecurityEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
};

type GrantRow = {
  client_id: string;
  client_name: string | null;
  scope: string;
  created_at: string;
  expires_at: string;
  refresh_expires_at: string | null;
};

export async function isMcpPaused(env: SecurityEnv, userId: string) {
  const row = await env.DB.prepare(
    "SELECT mcp_paused FROM user_security_settings WHERE user_id = ?1",
  ).bind(userId).first<{ mcp_paused: number }>();
  return Boolean(row?.mcp_paused);
}

export async function handleSecurityState(request: Request, env: SecurityEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const paused = await isMcpPaused(env, user.id);
  const grants = await env.DB.prepare(
    `SELECT
       t.client_id,
       c.client_name,
       t.scope,
       t.created_at,
       t.expires_at,
       t.refresh_expires_at
     FROM oauth_tokens t
     LEFT JOIN oauth_clients c ON c.client_id = t.client_id
     WHERE t.user_id = ?1
       AND t.revoked_at IS NULL
       AND (
         t.expires_at > ?2
         OR (t.refresh_expires_at IS NOT NULL AND t.refresh_expires_at > ?2)
       )
     ORDER BY t.created_at DESC`,
  ).bind(user.id, nowIso()).all<GrantRow>();

  const latestByClient = new Map<string, GrantRow>();
  for (const grant of grants.results || []) {
    if (!latestByClient.has(grant.client_id)) latestByClient.set(grant.client_id, grant);
  }

  return Response.json({
    mcpPaused: paused,
    grants: Array.from(latestByClient.values()).map((grant) => ({
      clientId: grant.client_id,
      clientName: grant.client_name || "MCP client",
      scopes: grant.scope.split(/\s+/).filter(Boolean),
      authorizedAt: grant.created_at,
      accessExpiresAt: grant.expires_at,
      refreshExpiresAt: grant.refresh_expires_at,
    })),
  });
}

export async function handleMcpPause(request: Request, env: SecurityEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { paused?: boolean };
  if (typeof body.paused !== "boolean") {
    return Response.json({ error: "paused boolean required" }, { status: 400 });
  }

  await env.DB.prepare(
    `INSERT INTO user_security_settings (user_id, mcp_paused, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id)
     DO UPDATE SET mcp_paused = excluded.mcp_paused, updated_at = excluded.updated_at`,
  ).bind(user.id, body.paused ? 1 : 0, nowIso()).run();

  await writeAudit(env, {
    userId: user.id,
    eventType: body.paused ? "security.mcp_paused" : "security.mcp_resumed",
    success: true,
  }).catch(() => undefined);

  return Response.json({ ok: true, mcpPaused: body.paused });
}

export async function handleGrantRevoke(request: Request, env: SecurityEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const match = new URL(request.url).pathname.match(/^\/api\/security\/grants\/([^/]+)\/revoke$/);
  const rawClientId = match?.[1];
  const clientId = rawClientId ? decodeURIComponent(rawClientId) : "";
  if (!clientId) return Response.json({ error: "client id required" }, { status: 400 });

  const result = await env.DB.prepare(
    `UPDATE oauth_tokens
     SET revoked_at = ?1
     WHERE user_id = ?2 AND client_id = ?3 AND revoked_at IS NULL`,
  ).bind(nowIso(), user.id, clientId).run();

  await writeAudit(env, {
    userId: user.id,
    eventType: "security.oauth_grant_revoked",
    success: true,
  }).catch(() => undefined);

  return Response.json({ ok: true, revoked: result.meta.changes || 0 });
}
