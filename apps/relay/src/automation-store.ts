import { nowIso } from "./auth.js";

export type LeasedTask = {
  id: string;
  user_id: string;
  status: string;
  lease_token: string | null;
  lease_until: string | null;
  revision: number;
  state_json: string | null;
};

export class LeaseLostError extends Error {
  constructor() { super("Automation lease was revoked, expired or replaced."); }
}

// A token alone is insufficient: cancellation, expiry and elapsed leases fence
// writes even if an old worker still holds the same in-memory task object.
export const ACTIVE_LEASE_SQL = `id = ?1 AND lease_token = ?2
  AND lease_until > ?3 AND status IN ('waiting','running','waiting_for_device')
  AND (expires_at IS NULL OR expires_at > ?3)`;

export async function renewTaskLease(db: D1Database, task: LeasedTask) {
  if (!task.lease_token) throw new LeaseLostError();
  const now = nowIso();
  const until = new Date(Date.parse(now) + 150_000).toISOString();
  const result = await db.prepare(`UPDATE automations SET lease_until = ?4
    WHERE ${ACTIVE_LEASE_SQL}`).bind(task.id, task.lease_token, now, until).run();
  if (!result.meta.changes) throw new LeaseLostError();
  task.lease_until = until;
}

export function journalStatement(db: D1Database, task: LeasedTask,
  event: string, summary: string, runId: string | undefined, revision = task.revision) {
  return db.prepare(`INSERT INTO automation_journal
    (automation_id,user_id,run_id,revision,event,summary,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7)`).bind(task.id, task.user_id,
      runId || null, revision, event, summary.slice(0, 6000), nowIso());
}

export async function checkpointTask(db: D1Database, task: LeasedTask,
  state: unknown, status: string, next: string | null, error: string | null,
  options: { incrementRun?: boolean; retainLease?: boolean; event?: string; summary?: string } = {}) {
  if (!task.lease_token) throw new LeaseLostError();
  const now = nowIso();
  const serialized = JSON.stringify(state);
  const revision = task.revision + 1;
  const update = db.prepare(`UPDATE automations SET
    state_json = ?4, status = ?5, next_run_at = ?6, last_error = ?7,
    last_run_at = CASE WHEN ?8 = 1 THEN ?3 ELSE last_run_at END,
    run_count = run_count + ?8, revision = revision + 1,
    lease_token = CASE WHEN ?9 = 1 THEN lease_token ELSE NULL END,
    lease_until = CASE WHEN ?9 = 1 THEN lease_until ELSE NULL END, updated_at = ?3
    WHERE ${ACTIVE_LEASE_SQL} AND revision = ?10`).bind(task.id, task.lease_token, now,
      serialized, status, next, error, options.incrementRun ? 1 : 0,
      options.retainLease ? 1 : 0, task.revision);
  const event = options.event || (status === task.status ? "checkpoint" : status);
  const runId = (state as { run_id?: string }).run_id;
  const journal = db.prepare(`INSERT INTO automation_journal
    (automation_id,user_id,run_id,revision,event,summary,created_at)
    SELECT id,user_id,?4,revision,?5,?6,?3 FROM automations
    WHERE id = ?1 AND revision = ?2 AND updated_at = ?3 AND changes() = 1
      AND ${options.retainLease ? "lease_token = ?7" : "lease_token IS NULL"}`)
    .bind(...[task.id, revision, now, runId || null, event,
      (options.summary || error || status).slice(0, 6000),
      ...(options.retainLease ? [task.lease_token] : [])]);
  const results = await db.batch([update, journal]);
  if (!results[0]?.meta.changes) throw new LeaseLostError();
  task.revision = revision;
  task.state_json = serialized;
  task.status = status;
  if (!options.retainLease) { task.lease_token = null; task.lease_until = null; }
}

export async function readTaskJournal(db: D1Database, userId: string,
  taskId: string, after = 0, limit = 50) {
  const result = await db.prepare(`SELECT sequence,run_id,revision,event,summary,created_at
    FROM automation_journal WHERE automation_id = ?1 AND user_id = ?2
    AND sequence > ?3 ORDER BY sequence LIMIT ?4`)
    .bind(taskId, userId, Math.max(0, after), Math.min(Math.max(1, limit), 100)).all();
  return result.results;
}
