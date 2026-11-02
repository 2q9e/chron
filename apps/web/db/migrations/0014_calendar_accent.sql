-- Persist an optional, owner-scoped calendar accent override.
BEGIN;

ALTER TABLE calendar_preferences
  ADD COLUMN accent_color text
  CHECK (accent_color IS NULL OR accent_color ~ '^#[0-9a-fA-F]{6}$');

COMMIT;
