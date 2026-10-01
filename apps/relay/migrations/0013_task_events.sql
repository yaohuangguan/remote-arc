CREATE TABLE task_event_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  callback_url TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  previous_secret_ciphertext TEXT,
  rotation_until TEXT,
  expires_at TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE task_event_deliveries (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES task_event_subscriptions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  delivered_at TEXT,
  lease_token TEXT,
  lease_until TEXT,
  UNIQUE(subscription_id, sequence)
);
CREATE INDEX idx_task_event_delivery_due ON task_event_deliveries(next_attempt_at, delivered_at);

-- Explicit operator-managed account/install/repository authorization. Token
-- repository scoping alone does not establish a Remote Arc user's authority.
CREATE TABLE github_automation_permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL,
  owner TEXT NOT NULL COLLATE NOCASE,
  repo TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, installation_id, owner, repo)
);
