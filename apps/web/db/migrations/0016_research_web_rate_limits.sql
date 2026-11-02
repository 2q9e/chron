-- One owner-scoped row bounds direct web-source reads per account.
BEGIN;

CREATE TABLE research_web_rate_limits (
  user_id text PRIMARY KEY REFERENCES "user" ("id") ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL,
  request_count smallint NOT NULL CHECK (request_count BETWEEN 1 AND 5)
);

ALTER TABLE research_web_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_web_rate_limits FORCE ROW LEVEL SECURITY;

CREATE POLICY research_web_rate_limits_owner_policy
  ON research_web_rate_limits
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

COMMIT;
