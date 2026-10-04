ALTER TABLE oauth_codes ADD COLUMN grant_id TEXT;
ALTER TABLE oauth_tokens ADD COLUMN grant_id TEXT;

UPDATE oauth_codes
SET grant_id = lower(hex(randomblob(16)))
WHERE grant_id IS NULL;

UPDATE oauth_tokens
SET grant_id = lower(hex(randomblob(16)))
WHERE grant_id IS NULL;

-- Security boundary upgrade: invalidate every pre-fix MCP grant so a token
-- minted through the legacy consent flow cannot survive this deployment.
UPDATE oauth_tokens
SET revoked_at = COALESCE(revoked_at, datetime('now'))
WHERE revoked_at IS NULL;

DELETE FROM oauth_codes;

ALTER TABLE audit_events ADD COLUMN request_id TEXT;
ALTER TABLE audit_events ADD COLUMN client_id TEXT;
ALTER TABLE audit_events ADD COLUMN grant_id TEXT;
ALTER TABLE audit_events ADD COLUMN outcome TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_request
ON audit_events(request_id);

CREATE INDEX IF NOT EXISTS idx_audit_client_created
ON audit_events(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_grant
ON oauth_tokens(grant_id);
