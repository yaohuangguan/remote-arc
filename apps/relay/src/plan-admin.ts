import { getSessionUser, nowIso, type SessionUser } from "./auth.js";
import { writeAudit } from "./audit.js";

type PlanAdminEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
};

type PlanGrantRow = {
  id: string;
  user_id: string;
  plan: "plus";
  source: string;
  reason: string;
  granted_by_user_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const isFutureIso = (value: unknown) =>
  typeof value === "string" &&
  value.length <= 64 &&
  Number.isFinite(Date.parse(value)) &&
  Date.parse(value) > Date.now();

async function requireAdmin(
  request: Request,
  env: PlanAdminEnv,
): Promise<
  | { user: SessionUser; response?: never }
  | { response: Response; user?: never }
> {
  const user = await getSessionUser(request, env);
  if (!user) {
    return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!user.isAdmin) {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function handleAdminPlanGrants(request: Request, env: PlanAdminEnv): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth.response !== undefined) return auth.response;
  const admin = auth.user;

  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      `SELECT g.*, u.email
       FROM plan_grants g
       JOIN users u ON u.id = g.user_id
       ORDER BY g.created_at DESC
       LIMIT 200`,
    ).all<PlanGrantRow & { email: string }>();
    return Response.json({ grants: rows.results });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await request.json().catch(() => ({})) as {
    email?: unknown;
    plan?: unknown;
    reason?: unknown;
    expires_at?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const plan = body.plan === undefined ? "plus" : body.plan;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const expiresAt =
    body.expires_at === null || body.expires_at === undefined
      ? null
      : typeof body.expires_at === "string"
        ? body.expires_at
        : "";

  if (!email || email.length > 320) {
    return Response.json({ error: "A valid account email is required." }, { status: 400 });
  }
  if (plan !== "plus") {
    return Response.json({ error: "Only Plus grants are supported." }, { status: 400 });
  }
  if (reason.length < 3 || reason.length > 500) {
    return Response.json({ error: "reason must be 3-500 characters." }, { status: 400 });
  }
  if (expiresAt !== null && !isFutureIso(expiresAt)) {
    return Response.json({ error: "expires_at must be a future ISO timestamp or null." }, { status: 400 });
  }

  const target = await env.DB.prepare(
    "SELECT id, email FROM users WHERE lower(email) = ?1 LIMIT 1",
  ).bind(email).first<{ id: string; email: string }>();
  if (!target) return Response.json({ error: "account_not_found" }, { status: 404 });

  const duplicate = await env.DB.prepare(
    `SELECT id FROM plan_grants
     WHERE user_id = ?1 AND plan = 'plus' AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?2)
     LIMIT 1`,
  ).bind(target.id, nowIso()).first<{ id: string }>();
  if (duplicate) {
    return Response.json({ error: "active_plus_grant_exists", grant_id: duplicate.id }, { status: 409 });
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await env.DB.prepare(
    `INSERT INTO plan_grants (
       id, user_id, plan, source, reason, granted_by_user_id,
       expires_at, revoked_at, created_at
     ) VALUES (?1, ?2, 'plus', 'admin_early_access', ?3, ?4, ?5, NULL, ?6)`,
  )
    .bind(id, target.id, reason, admin.id, expiresAt, createdAt)
    .run();

  await writeAudit(env, {
    userId: admin.id,
    deviceId: null,
    eventType: "account.plan_granted",
    toolName: null,
    success: true,
  }).catch(() => undefined);

  return Response.json(
    {
      grant: {
        id,
        user_id: target.id,
        email: target.email,
        plan: "plus",
        source: "admin_early_access",
        reason,
        expires_at: expiresAt,
        created_at: createdAt,
      },
    },
    { status: 201 },
  );
}

export async function handleAdminPlanGrantRevoke(
  request: Request,
  env: PlanAdminEnv,
  grantId: string,
): Promise<Response> {
  const auth = await requireAdmin(request, env);
  if (auth.response !== undefined) return auth.response;
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const revokedAt = nowIso();
  const result = await env.DB.prepare(
    `UPDATE plan_grants
     SET revoked_at = ?1
     WHERE id = ?2 AND revoked_at IS NULL`,
  ).bind(revokedAt, grantId).run();
  if (!result.meta.changes) {
    return Response.json({ error: "grant_not_found_or_already_revoked" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: auth.user.id,
    deviceId: null,
    eventType: "account.plan_revoked",
    toolName: null,
    success: true,
  }).catch(() => undefined);

  return Response.json({ ok: true, grant_id: grantId, revoked_at: revokedAt });
}
