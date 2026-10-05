CREATE TABLE IF NOT EXISTS task_scheduler_health (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  cron TEXT NOT NULL,
  last_started_at TEXT NOT NULL,
  last_finished_at TEXT,
  last_success_at TEXT,
  last_error TEXT
);
