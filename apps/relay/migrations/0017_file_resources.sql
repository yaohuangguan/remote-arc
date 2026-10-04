CREATE TABLE IF NOT EXISTS file_resources (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  path TEXT NOT NULL,
  file_revision TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_resources_expiry
ON file_resources(expires_at);

CREATE INDEX IF NOT EXISTS idx_file_resources_user
ON file_resources(user_id, created_at DESC);
