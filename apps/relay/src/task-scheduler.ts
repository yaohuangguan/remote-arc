import type { AutomationEnv } from "./automations.js";
import { runAutomationTick } from "./automations.js";
import { deliverTaskEvents, type TaskEventEnv } from "./task-events.js";

export async function runScheduledTasks(env: AutomationEnv & TaskEventEnv, cron: string) {
  const attempt = crypto.randomUUID();
  const started = new Date().toISOString();
  let recorded = false;
  try { await env.DB.prepare(`INSERT INTO task_scheduler_health
    (id,attempt_id,cron,last_started_at) VALUES ('automations',?1,?2,?3)
    ON CONFLICT(id) DO UPDATE SET attempt_id=excluded.attempt_id,
      cron=excluded.cron,last_started_at=excluded.last_started_at`)
    .bind(attempt, cron, started).run(); recorded = true;
  } catch (error) { console.error("Scheduler heartbeat unavailable", error); }
  // Event delivery is independent of a failing tick. Leases in the existing
  // runtime fence overlapping Cron invocations and keep one execution owner.
  const outcomes = await Promise.allSettled([runAutomationTick(env), deliverTaskEvents(env)]);
  const failed = outcomes[0].status === "rejected";
  const finished = new Date().toISOString();
  if (recorded) await env.DB.prepare(`UPDATE task_scheduler_health SET last_finished_at=?2,
    last_success_at=CASE WHEN ?3=0 THEN ?2 ELSE last_success_at END,
    last_error=CASE WHEN ?3=1 THEN 'Task dispatch failed; inspect worker logs.' ELSE NULL END
    WHERE id='automations' AND attempt_id=?1`)
    .bind(attempt, finished, failed ? 1 : 0).run().catch(error => console.error("Scheduler heartbeat update failed", error));
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") console.error("Scheduled task operation failed", outcome.reason);
  }
  if (failed) throw outcomes[0].status === "rejected" ? outcomes[0].reason : new Error("Task dispatch failed.");
}

export async function taskSchedulerHealth(db: D1Database, userId: string) {
  const overdue = await db.prepare(`SELECT COUNT(*) AS count FROM automations
    WHERE user_id=?1 AND status IN ('waiting','running','waiting_for_device')
      AND next_run_at < ?2 AND (expires_at IS NULL OR expires_at > ?3)`)
    .bind(userId, new Date(Date.now() - 180_000).toISOString(), new Date().toISOString())
    .first<{ count: number }>();
  try {
    const health = await db.prepare(`SELECT last_success_at,last_error,last_started_at
      FROM task_scheduler_health WHERE id='automations'`)
      .first<{ last_success_at: string | null; last_error: string | null; last_started_at: string }>();
    const state = !health ? "unavailable" : health.last_error ? "error"
      : !health.last_success_at || Date.now() - Date.parse(health.last_success_at) > 180_000 ? "stale" : "healthy";
    return { state, last_success_at: health?.last_success_at ?? null, overdue_count: overdue?.count ?? 0 };
  } catch {
    // An old deployment without the migration must reveal incompatibility.
    return { state: "unavailable", last_success_at: null, overdue_count: overdue?.count ?? 0 };
  }
}
