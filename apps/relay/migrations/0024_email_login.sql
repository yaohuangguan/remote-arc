-- Email login OTPs belong to an account identity, not to a device or MCP grant.
-- The existing users.google_sub is kept unchanged for backward compatibility.
-- Passwordless-only users use a reserved email:<uuid> sentinel until an explicit
-- nullable Google identity migration is warranted.
CREATE TABLE IF NOT EXISTS email_login_challenges (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  return_to TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  window_start TEXT NOT NULL,
  daily_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_email_login_expiry ON email_login_challenges(expires_at);
