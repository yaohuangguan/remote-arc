CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  client_id TEXT,
  grant_id TEXT,
  request_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  target_path TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  decision_scope TEXT,
  decision_source TEXT,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_until TEXT,
  decided_at TEXT,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_user_status
ON approval_requests(user_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_device_status
ON approval_requests(device_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_match
ON approval_requests(user_id, device_id, client_id, grant_id, tool_name, args_hash, status);
