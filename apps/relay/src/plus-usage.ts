type PlusUsageEnv = {
  DB: D1Database;
};

export type PlusUsageDelta = {
  binary_bytes?: number;
  planner_turns?: number;
  task_runtime_seconds?: number;
};

export type MonthlyPlusUsage = {
  month: string;
  binary_bytes: number;
  planner_turns: number;
  task_runtime_seconds: number;
  active_tasks: number;
};

const monthKey = (at: Date | string = new Date()) =>
  (typeof at === "string" ? at : at.toISOString()).slice(0, 7);

const counter = (value: unknown) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Plus usage counters must be finite non-negative numbers.");
  }
  return Math.floor(number);
};

export type BinaryChunkResult = {
  path?: string;
  mime_type?: string;
  encoding: "base64";
  size: number;
  file_revision: string;
  offset: number;
  bytes_read: number;
  eof: boolean;
  chunk_sha256?: string;
  data: string;
};

export function binaryChunkResult(value: unknown): BinaryChunkResult | null {
  if (typeof value !== "object" || value === null) return null;

  const direct = value as Partial<BinaryChunkResult>;
  if (
    direct.encoding === "base64" &&
    typeof direct.data === "string" &&
    typeof direct.file_revision === "string" &&
    Number.isFinite(Number(direct.bytes_read)) &&
    Number.isFinite(Number(direct.size))
  ) {
    return {
      ...direct,
      encoding: "base64",
      size: counter(direct.size),
      file_revision: direct.file_revision,
      offset: counter(direct.offset),
      bytes_read: counter(direct.bytes_read),
      eof: Boolean(direct.eof),
      data: direct.data,
    };
  }

  const envelope = value as {
    isError?: boolean;
    content?: Array<{ type?: string; text?: unknown }>;
  };
  if (envelope.isError || !Array.isArray(envelope.content)) return null;
  const text = envelope.content.find(
    (item) => item?.type === "text" && typeof item.text === "string",
  )?.text;
  if (typeof text !== "string") return null;
  try {
    return binaryChunkResult(JSON.parse(text));
  } catch {
    return null;
  }
}

export function binaryBytesRead(value: unknown) {
  return binaryChunkResult(value)?.bytes_read || 0;
}

export async function recordPlusUsage(
  env: PlusUsageEnv,
  userId: string,
  delta: PlusUsageDelta,
  occurredAt: Date | string = new Date(),
) {
  const binaryBytes = counter(delta.binary_bytes);
  const plannerTurns = counter(delta.planner_turns);
  const runtimeSeconds = counter(delta.task_runtime_seconds);
  if (!binaryBytes && !plannerTurns && !runtimeSeconds) return;

  const now = typeof occurredAt === "string" ? occurredAt : occurredAt.toISOString();
  await env.DB.prepare(
    `INSERT INTO user_monthly_plus_usage (
       user_id, month_key, binary_bytes, planner_turns, task_runtime_seconds, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(user_id, month_key) DO UPDATE SET
       binary_bytes = binary_bytes + excluded.binary_bytes,
       planner_turns = planner_turns + excluded.planner_turns,
       task_runtime_seconds = task_runtime_seconds + excluded.task_runtime_seconds,
       updated_at = excluded.updated_at`,
  )
    .bind(userId, monthKey(now), binaryBytes, plannerTurns, runtimeSeconds, now)
    .run();
}

export async function getMonthlyPlusUsage(
  env: PlusUsageEnv,
  userId: string,
  at: Date | string = new Date(),
): Promise<MonthlyPlusUsage> {
  const month = monthKey(at);
  const row = await env.DB.prepare(
    `SELECT binary_bytes, planner_turns, task_runtime_seconds
     FROM user_monthly_plus_usage
     WHERE user_id = ?1 AND month_key = ?2`,
  )
    .bind(userId, month)
    .first<{
      binary_bytes: number;
      planner_turns: number;
      task_runtime_seconds: number;
    }>();
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS count
     FROM automations
     WHERE user_id = ?1
       AND status IN ('waiting','running','waiting_for_device','waiting_for_event')`,
  )
    .bind(userId)
    .first<{ count: number }>();

  return {
    month,
    binary_bytes: row?.binary_bytes || 0,
    planner_turns: row?.planner_turns || 0,
    task_runtime_seconds: row?.task_runtime_seconds || 0,
    active_tasks: active?.count || 0,
  };
}

export async function finishAutomationRunWithUsage(
  db: D1Database,
  input: {
    run_id: string;
    automation_id: string;
    user_id: string;
    lease_token: string | null;
    status: string;
    exit_code: number | null;
    error: string | null;
    finished_at: string;
  },
) {
  const { run_id, automation_id, user_id, lease_token, status, exit_code, error, finished_at } = input;
  await db.batch([
    db.prepare(
      `UPDATE automation_runs
       SET status = ?1,
           exit_code = ?2,
           error = ?3,
           finished_at = ?4
       WHERE id = ?5 AND automation_id = ?6
         AND finished_at IS NULL
         AND EXISTS (
           SELECT 1 FROM automations
           WHERE id = ?6 AND lease_token = ?7
             AND lease_until > ?4
             AND status IN ('waiting','running','waiting_for_device')
         )`,
    ).bind(status, exit_code, error, finished_at, run_id, automation_id, lease_token),
    db.prepare(
      `INSERT INTO user_monthly_plus_usage (
         user_id, month_key, binary_bytes, planner_turns, task_runtime_seconds, updated_at
       )
       SELECT
         user_id,
         substr(finished_at, 1, 7),
         0,
         0,
         CAST(MAX(0, ROUND((julianday(finished_at) - julianday(started_at)) * 86400)) AS INTEGER),
         ?1
       FROM automation_runs
       WHERE id = ?2
         AND automation_id = ?3
         AND user_id = ?4
         AND finished_at IS NOT NULL
         AND usage_accounted_at IS NULL
       ON CONFLICT(user_id, month_key) DO UPDATE SET
         task_runtime_seconds = task_runtime_seconds + excluded.task_runtime_seconds,
         updated_at = excluded.updated_at`,
    ).bind(finished_at, run_id, automation_id, user_id),
    db.prepare(
      `UPDATE automation_runs
       SET usage_accounted_at = ?1
       WHERE id = ?2
         AND automation_id = ?3
         AND user_id = ?4
         AND finished_at IS NOT NULL
         AND usage_accounted_at IS NULL`,
    ).bind(finished_at, run_id, automation_id, user_id),
  ]);
}
