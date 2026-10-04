ALTER TABLE automation_runs ADD COLUMN usage_accounted_at TEXT;

CREATE TABLE IF NOT EXISTS user_monthly_plus_usage (
  user_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  binary_bytes INTEGER NOT NULL DEFAULT 0,
  planner_turns INTEGER NOT NULL DEFAULT 0,
  task_runtime_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, month_key),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
