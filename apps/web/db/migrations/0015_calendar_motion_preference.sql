-- Persist the user's calendar motion preference without overriding the OS default.
BEGIN;

ALTER TABLE calendar_preferences
  ADD COLUMN reduce_motion boolean NOT NULL DEFAULT false;

COMMIT;
