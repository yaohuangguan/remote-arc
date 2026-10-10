-- Keep the periodic R2 archiver off the hot user/created_at index.
-- Audit events remain queryable by user through idx_audit_user_created.
CREATE INDEX IF NOT EXISTS idx_audit_archive_created
  ON audit_events(created_at, id);
