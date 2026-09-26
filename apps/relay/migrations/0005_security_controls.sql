CREATE TABLE IF NOT EXISTS user_security_settings (
  user_id TEXT PRIMARY KEY,
  mcp_paused INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
