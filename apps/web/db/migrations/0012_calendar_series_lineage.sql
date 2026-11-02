-- Give finite recurring segments a stable group identity that survives splits.
BEGIN;

ALTER TABLE calendar_events
  ADD COLUMN series_root_id uuid;

UPDATE calendar_events
SET series_root_id = id
WHERE recurrence_frequency IS NOT NULL;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_series_root_id_check
    CHECK (recurrence_frequency IS NULL OR series_root_id IS NOT NULL);

CREATE INDEX calendar_events_owner_series_root_idx
  ON calendar_events (user_id, series_root_id, id)
  WHERE series_root_id IS NOT NULL;

COMMENT ON COLUMN calendar_events.series_root_id IS
  'Stable identity shared by finite recurring segments created by a reviewed this-and-following split. It intentionally has no foreign key so deleting the first segment does not invalidate the remaining lineage.';

COMMIT;
