export type AuditEvent = {
  id: string;
  device_id: string | null;
  event_type: string;
  tool_name: string | null;
  success: number;
  request_id: string | null;
  client_id: string | null;
  client_name: string | null;
  grant_id: string | null;
  outcome: string | null;
  created_at: string;
};

type AuditEnv = {
  DB: D1Database;
};

export async function writeAudit(
  env: AuditEnv,
  input: {
    userId: string;
    deviceId?: string | null;
    eventType: string;
    toolName?: string | null;
    success?: boolean;
    requestId?: string | null;
    clientId?: string | null;
    grantId?: string | null;
    outcome?: string | null;
  },
) {
  await env.DB.prepare(
    `INSERT INTO audit_events
      (id, user_id, device_id, event_type, tool_name, success,
       request_id, client_id, grant_id, outcome, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.deviceId || null,
      input.eventType,
      input.toolName || null,
      input.success === false ? 0 : 1,
      input.requestId || null,
      input.clientId || null,
      input.grantId || null,
      input.outcome || null,
      new Date().toISOString(),
    )
    .run();
}

export async function readAudit(
  env: AuditEnv,
  userId: string,
  limit = 20,
) {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.device_id, a.event_type, a.tool_name, a.success,
            a.request_id, a.client_id, c.client_name, a.grant_id, a.outcome,
            a.created_at
     FROM audit_events a
     LEFT JOIN oauth_clients c ON c.client_id = a.client_id
     WHERE a.user_id = ?1
     ORDER BY a.created_at DESC
     LIMIT ?2`,
  )
    .bind(userId, Math.min(Math.max(limit, 1), 100))
    .all<AuditEvent>();

  return rows.results || [];
}
