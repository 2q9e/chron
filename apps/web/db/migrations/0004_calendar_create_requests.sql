-- Retain each successful create request so an exact retry cannot create a
-- second event. Results are loaded from the current event row, avoiding a
-- second durable copy of event details. Account deletion cascades the ledger.
BEGIN;

CREATE TABLE calendar_event_create_requests (
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 1 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9._~-]+$'
  ),
  request_hash bytea CHECK (request_hash IS NULL OR octet_length(request_hash) = 32),
  event_id uuid,
  state text NOT NULL CHECK (state IN ('pending', 'complete', 'deleted', 'abandoned')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at timestamptz,
  CONSTRAINT calendar_event_create_requests_pkey
    PRIMARY KEY (user_id, idempotency_key),
  CONSTRAINT calendar_event_create_requests_event_unique
    UNIQUE (event_id),
  CONSTRAINT calendar_event_create_requests_result_shape CHECK (
    (
      state = 'pending'
      AND request_hash IS NOT NULL
      AND event_id IS NOT NULL
      AND completed_at IS NULL
    )
    OR
    (
      state = 'complete'
      AND request_hash IS NOT NULL
      AND event_id IS NOT NULL
      AND completed_at IS NOT NULL
    )
    OR
    (
      state = 'deleted'
      AND request_hash IS NULL
      AND event_id IS NULL
      AND completed_at IS NOT NULL
    )
    OR
    (
      state = 'abandoned'
      AND request_hash IS NULL
      AND event_id IS NULL
      AND completed_at IS NOT NULL
    )
  )
);

-- Keys are namespaced by owner. RLS and the composite primary key keep each
-- account's operation records independent, even when opaque keys coincide.
ALTER TABLE calendar_event_create_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_create_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_event_create_requests_owner_policy
  ON calendar_event_create_requests
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

COMMENT ON TABLE calendar_event_create_requests IS
  'Create outcomes retain only a request hash, event pointer, and status; event deletion clears the hash and pointer while keeping a minimal tombstone, unknown-operation reconciliation reserves a key without payload, and account deletion cascades the record.';
COMMENT ON COLUMN calendar_event_create_requests.event_id IS
  'Intentionally has no event foreign key so event deletion can clear the event pointer while retaining a tombstone that prevents a duplicate.';

COMMIT;
