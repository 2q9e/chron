-- Keep a round-robin account cursor so bounded expiry runs make
-- progress across every account without retaining a copy of user data.
BEGIN;

CREATE TABLE calendar_series_expiry_worker_state (
  worker_name text PRIMARY KEY CHECK (worker_name = 'series-proposals'),
  last_user_id text,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO calendar_series_expiry_worker_state (worker_name)
VALUES ('series-proposals');

ALTER TABLE calendar_series_expiry_worker_state
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_series_expiry_worker_state
  FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_series_expiry_worker_state_policy
  ON calendar_series_expiry_worker_state
  USING (current_setting('chron.series_expiry_worker', true) = 'enabled')
  WITH CHECK (current_setting('chron.series_expiry_worker', true) = 'enabled');

COMMENT ON TABLE calendar_series_expiry_worker_state IS
  'Minimal scheduler cursor for round-robin processing of pending recurring-series proposal expiry. The custom GUC policy is an application guard, not a boundary against connections using the trusted application database role. The table contains no proposal payloads.';
COMMENT ON COLUMN calendar_series_expiry_worker_state.last_user_id IS
  'Opaque identifier of the last account visited by the bounded expiry worker. There is intentionally no foreign key: preserving the lexical cursor across account deletion prevents round-robin processing from restarting at the first account.';

COMMIT;
