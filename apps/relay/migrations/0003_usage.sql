CREATE TABLE IF NOT EXISTS user_monthly_usage (
  user_id TEXT NOT NULL,
  month_key TEXT NOT NULL,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_month
ON user_monthly_usage(month_key);
