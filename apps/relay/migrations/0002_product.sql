ALTER TABLE devices ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  event_type TEXT NOT NULL,
  tool_name TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_user_created
ON audit_events(user_id, created_at DESC);
