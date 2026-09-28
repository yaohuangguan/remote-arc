ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS service_incidents (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  severity TEXT NOT NULL,
  kind TEXT NOT NULL,
  status_code INTEGER,
  method TEXT,
  path TEXT,
  message TEXT NOT NULL,
  ray_id TEXT,
  colo TEXT
);

CREATE INDEX IF NOT EXISTS idx_service_incidents_created
ON service_incidents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_incidents_status
ON service_incidents(status_code, created_at DESC);

CREATE TABLE IF NOT EXISTS service_alert_state (
  alert_key TEXT PRIMARY KEY,
  last_sent_at TEXT,
  last_status_code INTEGER,
  last_path TEXT,
  updated_at TEXT NOT NULL
);
