-- Owner-scoped calendar storage. Each request sets chron.user_id
-- transaction-locally before querying either table.
BEGIN;

CREATE TABLE calendar_events (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('timed', 'all-day')),
  title text NOT NULL CHECK (
    char_length(title) BETWEEN 1 AND 160 AND btrim(title) <> ''
  ),
  details text CHECK (details IS NULL OR char_length(details) <= 4000),
  start_local timestamp without time zone,
  end_local timestamp without time zone,
  time_zone text,
  starts_at timestamptz,
  ends_at timestamptz,
  start_date date,
  end_date date,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT calendar_events_shape CHECK (
    (
      kind = 'timed'
      AND start_local IS NOT NULL
      AND end_local IS NOT NULL
      AND time_zone IS NOT NULL
      AND char_length(time_zone) BETWEEN 1 AND 100
      AND starts_at IS NOT NULL
      AND ends_at IS NOT NULL
      AND ends_at > starts_at
      AND start_date IS NULL
      AND end_date IS NULL
    )
    OR
    (
      kind = 'all-day'
      AND start_local IS NULL
      AND end_local IS NULL
      AND time_zone IS NULL
      AND starts_at IS NULL
      AND ends_at IS NULL
      AND start_date IS NOT NULL
      AND end_date IS NOT NULL
      AND end_date > start_date
    )
  )
);

CREATE INDEX calendar_events_owner_timed_range_idx
  ON calendar_events (user_id, starts_at, ends_at)
  WHERE kind = 'timed';

CREATE INDEX calendar_events_owner_all_day_range_idx
  ON calendar_events (user_id, start_date, end_date)
  WHERE kind = 'all-day';

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_owner_policy ON calendar_events
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

CREATE TABLE calendar_preferences (
  user_id text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  theme text NOT NULL CHECK (
    theme IN (
      'pink-liquid-glass',
      'minimal-light',
      'premium-dark',
      'soft-pastel',
      'high-contrast'
    )
  ),
  density text NOT NULL CHECK (density IN ('comfortable', 'compact')),
  week_starts_on smallint NOT NULL CHECK (week_starts_on BETWEEN 0 AND 6),
  time_zone text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 100),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE calendar_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_preferences_owner_policy ON calendar_preferences
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

COMMIT;
