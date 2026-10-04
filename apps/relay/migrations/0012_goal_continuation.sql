ALTER TABLE automations ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;

CREATE TABLE automation_journal (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT,
  revision INTEGER NOT NULL,
  event TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_automation_journal_task ON automation_journal(automation_id, sequence);

CREATE TABLE automation_decisions (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  decision_json TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(automation_id, idempotency_key),
  UNIQUE(automation_id, expected_revision)
);
