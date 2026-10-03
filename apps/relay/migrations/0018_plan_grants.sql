CREATE TABLE IF NOT EXISTS plan_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('plus')),
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  granted_by_user_id TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(granted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plan_grants_user_active
ON plan_grants(user_id, plan, revoked_at, expires_at);
