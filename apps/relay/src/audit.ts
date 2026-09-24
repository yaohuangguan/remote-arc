export type AuditEvent = {
  id: string;
  device_id: string | null;
  event_type: string;
  tool_name: string | null;
  success: number;
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
  },
) {
  await env.DB.prepare(
    `INSERT INTO audit_events
      (id, user_id, device_id, event_type, tool_name, success, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(
      crypto.randomUUID(),
      input.userId,
      input.deviceId || null,
      input.eventType,
      input.toolName || null,
      input.success === false ? 0 : 1,
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
    `SELECT id, device_id, event_type, tool_name, success, created_at
     FROM audit_events
     WHERE user_id = ?1
     ORDER BY created_at DESC
     LIMIT ?2`,
  )
    .bind(userId, Math.min(Math.max(limit, 1), 100))
    .all<AuditEvent>();

  return rows.results || [];
}
