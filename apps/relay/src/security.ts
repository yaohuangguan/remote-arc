import { getSessionUser, nowIso } from "./auth.js";
import { writeAudit } from "./audit.js";
import type { SecurityGrant, SecurityState } from "@remotearc/protocol";

type SecurityEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
};

type GrantRow = {
  grant_id: string;
  client_id: string;
  client_name: string | null;
  scope: string;
  authorized_at: string;
  last_token_issued_at: string;
  access_expires_at: string;
  refresh_expires_at: string | null;
  token_rows: number;
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
       t.grant_id,
       t.client_id,
       c.client_name,
       MAX(t.scope) AS scope,
       MIN(t.created_at) AS authorized_at,
       MAX(t.created_at) AS last_token_issued_at,
       MAX(t.expires_at) AS access_expires_at,
       MAX(t.refresh_expires_at) AS refresh_expires_at,
       COUNT(*) AS token_rows
     FROM oauth_tokens t
     LEFT JOIN oauth_clients c ON c.client_id = t.client_id
     WHERE t.user_id = ?1
       AND t.revoked_at IS NULL
       AND t.grant_id IS NOT NULL
     GROUP BY t.grant_id, t.client_id, c.client_name
     ORDER BY last_token_issued_at DESC`,
  ).bind(user.id).all<GrantRow>();

  const now = Date.now();
  return Response.json({
    mcpPaused: paused,
    grants: (grants.results || []).map((grant) => {
      const accessActive = Date.parse(grant.access_expires_at) > now;
      const refreshActive =
        Boolean(grant.refresh_expires_at) &&
        Date.parse(grant.refresh_expires_at || "") > now;
      return {
        grantId: grant.grant_id,
        clientId: grant.client_id,
        clientName: grant.client_name || "MCP client",
        scopes: grant.scope.split(/\s+/).filter(Boolean),
        authorizedAt: grant.authorized_at,
        lastTokenIssuedAt: grant.last_token_issued_at,
        accessExpiresAt: grant.access_expires_at,
        refreshExpiresAt: grant.refresh_expires_at,
        tokenRows: grant.token_rows,
        status: accessActive ? "active" : refreshActive ? "refreshable" : "expired",
      } satisfies SecurityGrant;
    }),
  } satisfies SecurityState);
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
  const rawGrantId = match?.[1];
  const grantId = rawGrantId ? decodeURIComponent(rawGrantId) : "";
  if (!grantId) return Response.json({ error: "grant id required" }, { status: 400 });

  const result = await env.DB.prepare(
    `UPDATE oauth_tokens
     SET revoked_at = ?1
     WHERE user_id = ?2 AND grant_id = ?3 AND revoked_at IS NULL`,
  ).bind(nowIso(), user.id, grantId).run();

  await writeAudit(env, {
    userId: user.id,
    eventType: "security.oauth_grant_revoked",
    success: true,
    grantId,
    outcome: result.meta.changes ? "revoked" : "not_found",
  }).catch(() => undefined);

  return Response.json({ ok: true, revoked: result.meta.changes || 0 });
}
