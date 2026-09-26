type UsageEnv = {
  DB: D1Database;
  MONTHLY_TOOL_CALL_LIMIT?: string;
};

export type MonthlyUsage = {
  month: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

const monthKey = () => new Date().toISOString().slice(0, 7);

export function monthlyLimit(env: UsageEnv) {
  const raw = env.MONTHLY_TOOL_CALL_LIMIT ?? "10000";
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function usageSnapshot(month: string, used: number, limit: number | null): MonthlyUsage {
  return {
    month,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    unlimited: limit === null,
  };
}

export async function getMonthlyUsage(
  env: UsageEnv,
  userId: string,
): Promise<MonthlyUsage> {
  const month = monthKey();
  const limit = monthlyLimit(env);
  const row = await env.DB.prepare(
    "SELECT tool_calls FROM user_monthly_usage WHERE user_id = ?1 AND month_key = ?2",
  )
    .bind(userId, month)
    .first<{ tool_calls: number }>();

  return usageSnapshot(month, row?.tool_calls || 0, limit);
}

export async function consumeToolCall(env: UsageEnv, userId: string) {
  const month = monthKey();
  const limit = monthlyLimit(env);
  const now = new Date().toISOString();

  if (limit === null) {
    const row = await env.DB.prepare(
      `INSERT INTO user_monthly_usage (user_id, month_key, tool_calls, updated_at)
       VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(user_id, month_key)
       DO UPDATE SET tool_calls = tool_calls + 1, updated_at = excluded.updated_at
       RETURNING tool_calls`,
    )
      .bind(userId, month, now)
      .first<{ tool_calls: number }>();

    return usageSnapshot(month, row?.tool_calls || 1, null);
  }

  const row = await env.DB.prepare(
    `INSERT INTO user_monthly_usage (user_id, month_key, tool_calls, updated_at)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(user_id, month_key)
     DO UPDATE SET tool_calls = tool_calls + 1, updated_at = excluded.updated_at
     WHERE tool_calls < ?4
     RETURNING tool_calls`,
  )
    .bind(userId, month, now, limit)
    .first<{ tool_calls: number }>();

  if (!row) {
    const usage = await getMonthlyUsage(env, userId);
    const error = new Error(
      `Monthly Remote Arc tool-call limit reached (${usage.used}/${usage.limit}).`,
    );
    (error as Error & { code?: string }).code = "MONTHLY_LIMIT_REACHED";
    throw error;
  }

  return usageSnapshot(month, row.tool_calls, limit);
}
