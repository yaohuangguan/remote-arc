CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('long_task','condition_watch','schedule_watch','goal_loop')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN (
    'waiting','running','waiting_for_device','waiting_for_event',
    'approval_required','paused','completed','failed','cancelled','expired'
  )),
  device_id TEXT,
  trigger_json TEXT,
  action_json TEXT NOT NULL,
  goal_json TEXT,
  state_json TEXT,
  permission_snapshot_json TEXT,
  interval_seconds INTEGER NOT NULL DEFAULT 300,
  next_run_at TEXT,
  expires_at TEXT,
  max_runs INTEGER NOT NULL DEFAULT 1,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_error TEXT,
  lease_token TEXT,
  lease_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_automations_user_created
ON automations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automations_due
ON automations(status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_automations_lease
ON automations(lease_until);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  process_id TEXT,
  exit_code INTEGER,
  output_summary TEXT,
  trigger_payload TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY(automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation
ON automation_runs(automation_id, started_at DESC);

CREATE TABLE IF NOT EXISTS automation_webhooks (
  automation_id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_event_at TEXT,
  FOREIGN KEY(automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_events (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  source TEXT NOT NULL,
  event_name TEXT,
  delivery_id TEXT,
  payload_json TEXT,
  received_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY(automation_id) REFERENCES automations(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_event_delivery
ON automation_events(automation_id, delivery_id)
WHERE delivery_id IS NOT NULL;
