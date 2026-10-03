ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';

CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan);

-- Preserve the effective read capability of already-paired devices while making
-- binary reads independently revocable after agents learn the new tool.
UPDATE devices
SET allowed_tools = json_insert(allowed_tools, '$[#]', 'read_binary_file')
WHERE allowed_tools IS NOT NULL
  AND EXISTS (SELECT 1 FROM json_each(allowed_tools) WHERE value = 'read_file')
  AND NOT EXISTS (SELECT 1 FROM json_each(allowed_tools) WHERE value = 'read_binary_file');
