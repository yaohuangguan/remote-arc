ALTER TABLE devices ADD COLUMN workspace_roots TEXT;
ALTER TABLE devices ADD COLUMN sensitive_paths TEXT;
ALTER TABLE devices ADD COLUMN protect_sensitive_paths INTEGER NOT NULL DEFAULT 1;
ALTER TABLE devices ADD COLUMN undo_enabled INTEGER NOT NULL DEFAULT 1;
