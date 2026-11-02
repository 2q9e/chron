-- Keep bounded delivery work moving across accounts without retaining user data.
BEGIN;

CREATE TABLE calendar_reminder_worker_state (
  worker_name text PRIMARY KEY CHECK (worker_name = 'reminders'),
  last_user_id text,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO calendar_reminder_worker_state (worker_name)
VALUES ('reminders');

ALTER TABLE calendar_reminder_worker_state
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_reminder_worker_state
  FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_reminder_worker_state_policy
  ON calendar_reminder_worker_state
  USING (current_setting('chron.calendar_reminder_worker', true) = 'enabled')
  WITH CHECK (current_setting('chron.calendar_reminder_worker', true) = 'enabled');

COMMENT ON TABLE calendar_reminder_worker_state IS
  'Minimal round-robin cursor for the bounded reminder delivery worker. The custom GUC policy is an application guard, not a boundary against connections using the trusted application database role. The table contains no recipient or event data.';
COMMENT ON COLUMN calendar_reminder_worker_state.last_user_id IS
  'Opaque identifier of the last account visited; no foreign key preserves the cursor across account deletion.';

COMMIT;
