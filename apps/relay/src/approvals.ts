import { authenticateDevice, getSessionUser, nowIso, type OAuthIdentity } from "./auth.js";
import { writeAudit } from "./audit.js";

type ApprovalDbEnv = {
  DB: D1Database;
};

type ApprovalEnv = ApprovalDbEnv & {
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
};

export type ApprovalDecision = "allow_once" | "allow_10m" | "always_folder" | "deny";

export type ApprovalRow = {
  id: string;
  user_id: string;
  device_id: string;
  client_id: string | null;
  client_name: string | null;
  grant_id: string | null;
  request_id: string;
  tool_name: string;
  target_path: string;
  args_hash: string;
  status: string;
  decision_scope: string | null;
  decision_source: string | null;
  requested_at: string;
  expires_at: string;
  approved_until: string | null;
  decided_at: string | null;
  consumed_at: string | null;
};

const addMinutes = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString();

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function approvalTargetPath(
  tool: string,
  args: Record<string, unknown>,
) {
  const candidate =
    tool === "write_file"
      ? args.path
      : tool === "edit_block"
        ? args.file_path
        : null;
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : null;
}

export async function approvalArgsHash(
  tool: string,
  args: Record<string, unknown>,
) {
  return sha256Hex(
    JSON.stringify({
      tool,
      arguments: stableValue(args),
    }),
  );
}

function parseStringArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parentDirectory(targetPath: string) {
  const windows = /^[a-zA-Z]:[\\/]/.test(targetPath) || targetPath.includes("\\");
  const separator = windows ? "\\" : "/";
  const normalized = targetPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  if (index === 0) return "/";
  let parent = normalized.slice(0, index);
  if (/^[a-zA-Z]:$/.test(parent)) parent += "/";
  return windows ? parent.replace(/\//g, separator) : parent;
}

async function expireStale(env: ApprovalDbEnv, userId?: string) {
  const now = nowIso();
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const clause = userId ? " AND user_id = ?2" : "";

  const pending = env.DB.prepare(
    `UPDATE approval_requests
     SET status = 'expired', decided_at = COALESCE(decided_at, ?1)
     WHERE status = 'pending' AND expires_at <= ?1${clause}`,
  );
  if (userId) await pending.bind(now, userId).run();
  else await pending.bind(now).run();

  const approved = env.DB.prepare(
    `UPDATE approval_requests
     SET status = 'expired', decided_at = COALESCE(decided_at, ?1)
     WHERE status = 'approved' AND approved_until <= ?1${clause}`,
  );
  if (userId) await approved.bind(now, userId).run();
  else await approved.bind(now).run();

  const cleanupClause = userId ? " AND user_id = ?2" : "";
  const cleanup = env.DB.prepare(
    `DELETE FROM approval_requests
     WHERE status IN ('consumed', 'denied', 'expired')
       AND COALESCE(decided_at, consumed_at, expires_at) < ?1${cleanupClause}`,
  );
  if (userId) await cleanup.bind(cutoff, userId).run();
  else await cleanup.bind(cutoff).run();
}

export async function findApprovedWriteApproval(
  env: ApprovalDbEnv,
  identity: OAuthIdentity,
  deviceId: string,
  tool: string,
  args: Record<string, unknown>,
) {
  const targetPath = approvalTargetPath(tool, args);
  if (!targetPath) return null;
  const argsHash = await approvalArgsHash(tool, args);
  const now = nowIso();

  return env.DB.prepare(
    `SELECT id, user_id, device_id, client_id, NULL AS client_name, grant_id,
            request_id, tool_name, target_path, args_hash, status,
            decision_scope, decision_source, requested_at, expires_at,
            approved_until, decided_at, consumed_at
     FROM approval_requests
     WHERE user_id = ?1
       AND device_id = ?2
       AND client_id = ?3
       AND COALESCE(grant_id, '') = COALESCE(?4, '')
       AND tool_name = ?5
       AND target_path = ?7
       AND status = 'approved'
       AND approved_until > ?8
       AND (
         decision_scope = 'allow_10m'
         OR decision_scope = 'always_folder'
         OR args_hash = ?6
       )
       AND (decision_scope <> 'allow_once' OR consumed_at IS NULL)
     ORDER BY decided_at DESC
     LIMIT 1`,
  )
    .bind(
      identity.userId,
      deviceId,
      identity.clientId,
      identity.grantId,
      tool,
      argsHash,
      targetPath,
      now,
    )
    .first<ApprovalRow>();
}

export async function requestWriteApproval(
  env: ApprovalDbEnv,
  input: {
    identity: OAuthIdentity;
    deviceId: string;
    requestId: string;
    tool: string;
    args: Record<string, unknown>;
  },
) {
  const targetPath = approvalTargetPath(input.tool, input.args);
  if (!targetPath) return null;

  await expireStale(env, input.identity.userId);
  const argsHash = await approvalArgsHash(input.tool, input.args);

  const existing = await env.DB.prepare(
    `SELECT id, user_id, device_id, client_id, NULL AS client_name, grant_id,
            request_id, tool_name, target_path, args_hash, status,
            decision_scope, decision_source, requested_at, expires_at,
            approved_until, decided_at, consumed_at
     FROM approval_requests
     WHERE user_id = ?1
       AND device_id = ?2
       AND client_id = ?3
       AND COALESCE(grant_id, '') = COALESCE(?4, '')
       AND tool_name = ?5
       AND args_hash = ?6
       AND target_path = ?7
       AND status = 'pending'
       AND expires_at > ?8
     ORDER BY requested_at DESC
     LIMIT 1`,
  )
    .bind(
      input.identity.userId,
      input.deviceId,
      input.identity.clientId,
      input.identity.grantId,
      input.tool,
      argsHash,
      targetPath,
      nowIso(),
    )
    .first<ApprovalRow>();

  if (existing) return existing;

  const id = crypto.randomUUID();
  const requestedAt = nowIso();
  const expiresAt = addMinutes(15);
  await env.DB.prepare(
    `INSERT INTO approval_requests
      (id, user_id, device_id, client_id, grant_id, request_id, tool_name,
       target_path, args_hash, status, requested_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11)`,
  )
    .bind(
      id,
      input.identity.userId,
      input.deviceId,
      input.identity.clientId,
      input.identity.grantId,
      input.requestId,
      input.tool,
      targetPath,
      argsHash,
      requestedAt,
      expiresAt,
    )
    .run();

  await writeAudit(env, {
    userId: input.identity.userId,
    deviceId: input.deviceId,
    eventType: "security.approval_requested",
    toolName: input.tool,
    success: false,
    requestId: input.requestId,
    clientId: input.identity.clientId,
    grantId: input.identity.grantId,
    outcome: "approval_required",
  }).catch(() => undefined);

  return {
    id,
    user_id: input.identity.userId,
    device_id: input.deviceId,
    client_id: input.identity.clientId,
    client_name: null,
    grant_id: input.identity.grantId,
    request_id: input.requestId,
    tool_name: input.tool,
    target_path: targetPath,
    args_hash: argsHash,
    status: "pending",
    decision_scope: null,
    decision_source: null,
    requested_at: requestedAt,
    expires_at: expiresAt,
    approved_until: null,
    decided_at: null,
    consumed_at: null,
  } satisfies ApprovalRow;
}

export async function consumeWriteApproval(
  env: ApprovalDbEnv,
  approval: ApprovalRow | null,
) {
  if (!approval || approval.decision_scope !== "allow_once") return;
  await env.DB.prepare(
    `UPDATE approval_requests
     SET status = 'consumed', consumed_at = ?1
     WHERE id = ?2 AND status = 'approved' AND consumed_at IS NULL`,
  )
    .bind(nowIso(), approval.id)
    .run();
}

async function listApprovalsFor(
  env: ApprovalDbEnv,
  input: { userId: string; deviceId?: string },
) {
  await expireStale(env, input.userId);
  const deviceClause = input.deviceId ? " AND a.device_id = ?2" : "";
  const sql =
    `SELECT a.id, a.user_id, a.device_id, a.client_id, c.client_name,
            a.grant_id, a.request_id, a.tool_name, a.target_path, a.args_hash,
            a.status, a.decision_scope, a.decision_source, a.requested_at,
            a.expires_at, a.approved_until, a.decided_at, a.consumed_at
     FROM approval_requests a
     LEFT JOIN oauth_clients c ON c.client_id = a.client_id
     WHERE a.user_id = ?1${deviceClause}
       AND a.status = 'pending'
     ORDER BY a.requested_at ASC
     LIMIT 50`;
  const stmt = env.DB.prepare(sql);
  const rows = input.deviceId
    ? await stmt.bind(input.userId, input.deviceId).all<ApprovalRow>()
    : await stmt.bind(input.userId).all<ApprovalRow>();
  return rows.results || [];
}

export async function decideApproval(
  env: ApprovalDbEnv,
  input: {
    userId: string;
    deviceId?: string;
    approvalId: string;
    decision: ApprovalDecision;
    source: "dashboard" | "terminal";
  },
) {
  await expireStale(env, input.userId);
  const deviceClause = input.deviceId ? " AND device_id = ?3" : "";
  const selectSql =
    `SELECT id, user_id, device_id, client_id, NULL AS client_name, grant_id,
            request_id, tool_name, target_path, args_hash, status,
            decision_scope, decision_source, requested_at, expires_at,
            approved_until, decided_at, consumed_at
     FROM approval_requests
     WHERE id = ?1 AND user_id = ?2${deviceClause}
     LIMIT 1`;
  const select = env.DB.prepare(selectSql);
  const approval = input.deviceId
    ? await select.bind(input.approvalId, input.userId, input.deviceId).first<ApprovalRow>()
    : await select.bind(input.approvalId, input.userId).first<ApprovalRow>();

  if (!approval) return { status: 404, payload: { error: "approval not found" } };
  if (approval.status !== "pending") {
    return {
      status: 409,
      payload: { error: "approval is no longer pending", status: approval.status },
    };
  }

  const decidedAt = nowIso();
  if (input.decision === "deny") {
    await env.DB.prepare(
      `UPDATE approval_requests
       SET status = 'denied', decision_scope = 'deny', decision_source = ?1,
           decided_at = ?2, approved_until = NULL
       WHERE id = ?3 AND status = 'pending'`,
    )
      .bind(input.source, decidedAt, approval.id)
      .run();

    await writeAudit(env, {
      userId: input.userId,
      deviceId: approval.device_id,
      eventType: "security.approval_denied",
      toolName: approval.tool_name,
      success: true,
      requestId: approval.request_id,
      clientId: approval.client_id,
      grantId: approval.grant_id,
      outcome: "denied",
    }).catch(() => undefined);

    return { status: 200, payload: { ok: true, status: "denied" } };
  }

  if (input.decision === "always_folder") {
    const device = await env.DB.prepare(
      `SELECT workspace_roots FROM devices
       WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
    )
      .bind(approval.device_id, input.userId)
      .first<{ workspace_roots: string | null }>();
    if (!device) {
      return { status: 404, payload: { error: "device not found" } };
    }

    const folder = parentDirectory(approval.target_path);
    const roots = Array.from(
      new Set([...parseStringArray(device.workspace_roots), folder]),
    ).slice(0, 32);

    await env.DB.prepare(
      `UPDATE devices SET workspace_roots = ?1
       WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
    )
      .bind(JSON.stringify(roots), approval.device_id, input.userId)
      .run();
  }

  const approvedUntil =
    input.decision === "allow_10m" ? addMinutes(10) : addMinutes(15);

  await env.DB.prepare(
    `UPDATE approval_requests
     SET status = 'approved', decision_scope = ?1, decision_source = ?2,
         decided_at = ?3, approved_until = ?4
     WHERE id = ?5 AND status = 'pending'`,
  )
    .bind(
      input.decision,
      input.source,
      decidedAt,
      approvedUntil,
      approval.id,
    )
    .run();

  await writeAudit(env, {
    userId: input.userId,
    deviceId: approval.device_id,
    eventType: "security.approval_granted",
    toolName: approval.tool_name,
    success: true,
    requestId: approval.request_id,
    clientId: approval.client_id,
    grantId: approval.grant_id,
    outcome: input.decision,
  }).catch(() => undefined);

  return {
    status: 200,
    payload: {
      ok: true,
      status: "approved",
      decision: input.decision,
      approvedUntil,
    },
  };
}

export async function handleApprovalList(request: Request, env: ApprovalEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await listApprovalsFor(env, { userId: user.id }));
}

export async function handleApprovalDecision(request: Request, env: ApprovalEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const match = new URL(request.url).pathname.match(
    /^\/api\/approvals\/([^/]+)\/decision$/,
  );
  const approvalId = match?.[1] ? decodeURIComponent(match[1]) : "";
  const body = (await request.json().catch(() => ({}))) as {
    decision?: ApprovalDecision;
  };
  if (
    !approvalId ||
    !["allow_once", "allow_10m", "always_folder", "deny"].includes(
      String(body.decision),
    )
  ) {
    return Response.json({ error: "valid approval decision required" }, { status: 400 });
  }

  const result = await decideApproval(env, {
    userId: user.id,
    approvalId,
    decision: body.decision!,
    source: "dashboard",
  });
  return Response.json(result.payload, { status: result.status });
}

export async function handleDeviceApprovalList(
  request: Request,
  env: ApprovalEnv,
) {
  const identity = await authenticateDevice(request, env);
  if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(
    await listApprovalsFor(env, {
      userId: identity.user_id,
      deviceId: identity.id,
    }),
  );
}

export async function handleDeviceApprovalDecision(
  request: Request,
  env: ApprovalEnv,
) {
  const identity = await authenticateDevice(request, env);
  if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });

  const match = new URL(request.url).pathname.match(
    /^\/api\/device\/approvals\/([^/]+)\/decision$/,
  );
  const approvalId = match?.[1] ? decodeURIComponent(match[1]) : "";
  const body = (await request.json().catch(() => ({}))) as {
    decision?: ApprovalDecision;
  };
  if (
    !approvalId ||
    !["allow_once", "allow_10m", "always_folder", "deny"].includes(
      String(body.decision),
    )
  ) {
    return Response.json({ error: "valid approval decision required" }, { status: 400 });
  }

  const result = await decideApproval(env, {
    userId: identity.user_id,
    deviceId: identity.id,
    approvalId,
    decision: body.decision!,
    source: "terminal",
  });
  return Response.json(result.payload, { status: result.status });
}
