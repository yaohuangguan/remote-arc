-- Remote MCP uses narrow sensitive-path exceptions instead of a global bypass.
UPDATE devices
SET protect_sensitive_paths = 1
WHERE protect_sensitive_paths = 0;
