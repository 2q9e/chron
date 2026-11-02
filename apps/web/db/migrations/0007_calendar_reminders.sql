-- Persist opt-in reminder rules and owner-scoped delivery jobs.
BEGIN;

ALTER TABLE calendar_events
  ADD COLUMN reminder_choice text NOT NULL DEFAULT 'none',
  ADD COLUMN reminder_time_zone text,
  ADD CONSTRAINT calendar_events_owner_event_id_unique UNIQUE (user_id, id);

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_reminder_shape_check CHECK (
    (
      kind = 'timed'
      AND reminder_choice IN (
        'none',
        'at-start',
        '5-minutes-before',
        '10-minutes-before',
        '15-minutes-before',
        '30-minutes-before',
        '60-minutes-before',
        'one-local-day-before'
      )
      AND reminder_time_zone IS NULL
    )
    OR
    (
      kind = 'all-day'
      AND reminder_choice IN ('none', 'event-day-9am', 'previous-day-9am')
      AND (
        (reminder_choice = 'none' AND reminder_time_zone IS NULL)
        OR (
          reminder_choice <> 'none'
          AND reminder_time_zone IS NOT NULL
          AND char_length(reminder_time_zone) BETWEEN 1 AND 100
        )
      )
    )
  );

COMMENT ON COLUMN calendar_events.reminder_choice IS
  'Explicit opt-in reminder choice; none is the safe default. Timed offsets use the event zone; all-day choices use the saved calendar zone.';
COMMENT ON COLUMN calendar_events.reminder_time_zone IS
  'Calendar IANA zone captured for an all-day reminder. NULL for timed events and events without reminders.';

CREATE TABLE calendar_event_reminders (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  event_id uuid NOT NULL,
  event_revision integer NOT NULL CHECK (event_revision > 0),
  occurrence_key text NOT NULL CHECK (
    char_length(occurrence_key) BETWEEN 1 AND 200
  ),
  scheduled_at timestamptz NOT NULL,
  time_zone text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 100),
  next_attempt_at timestamptz NOT NULL,
  status text NOT NULL CHECK (
    status IN ('pending', 'leased', 'sent', 'failed', 'cancelled')
  ),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  last_error_code text CHECK (
    last_error_code IS NULL
    OR last_error_code ~ '^[A-Z0-9_]{1,64}$'
  ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT calendar_event_reminders_revision_occurrence_unique
    UNIQUE (user_id, event_id, event_revision, occurrence_key),
  CONSTRAINT calendar_event_reminders_owner_event_fk
    FOREIGN KEY (user_id, event_id)
    REFERENCES calendar_events (user_id, id)
    ON DELETE CASCADE,
  CONSTRAINT calendar_event_reminders_lease_shape_check CHECK (
    (
      status = 'leased'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
    OR
    (
      status <> 'leased'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
    )
  ),
  CONSTRAINT calendar_event_reminders_sent_shape_check CHECK (
    (status = 'sent' AND sent_at IS NOT NULL)
    OR (status <> 'sent' AND sent_at IS NULL)
  )
);

CREATE INDEX calendar_event_reminders_owner_due_idx
  ON calendar_event_reminders (user_id, next_attempt_at, id)
  WHERE status IN ('pending', 'leased');

ALTER TABLE calendar_event_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_reminders FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_event_reminders_owner_policy
  ON calendar_event_reminders
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

COMMENT ON TABLE calendar_event_reminders IS
  'Durable owner-scoped delivery outbox. Jobs are inserted in the event transaction, bounded by the finite event recurrence rule, and cascade-delete with their event or account.';
COMMENT ON COLUMN calendar_event_reminders.last_error_code IS
  'Sanitized internal error category only. Provider messages, addresses, and event content must never be stored here.';

COMMIT;
