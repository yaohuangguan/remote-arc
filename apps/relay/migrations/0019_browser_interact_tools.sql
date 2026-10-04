-- Existing browser devices were paired before click/fill existed. Keep the
-- device-level allow-list aligned with the upgraded companion; per-tab
-- interaction still starts disabled and must be explicitly enabled locally.
UPDATE devices
SET allowed_tools = json_insert(allowed_tools, '$[#]', 'browser_click')
WHERE platform = 'browser'
  AND allowed_tools IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM json_each(allowed_tools) WHERE value = 'browser_click'
  );

UPDATE devices
SET allowed_tools = json_insert(allowed_tools, '$[#]', 'browser_fill')
WHERE platform = 'browser'
  AND allowed_tools IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM json_each(allowed_tools) WHERE value = 'browser_fill'
  );
