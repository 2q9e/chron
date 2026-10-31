-- Add bounded recurrence fields and an exact, owner-scoped proposal ledger.
-- Calendar changes remain drafts until the application approves the exact
-- action, target revision, payload, scope, and conflict snapshot.
BEGIN;

ALTER TABLE calendar_events
  ADD COLUMN recurrence_frequency text,
  ADD COLUMN recurrence_interval smallint,
  ADD COLUMN recurrence_count smallint;

ALTER TABLE calendar_events
  ADD CONSTRAINT calendar_events_recurrence_shape_check CHECK (
    (
      recurrence_frequency IS NULL
      AND recurrence_interval IS NULL
      AND recurrence_count IS NULL
    )
    OR
    (
      recurrence_frequency IS NOT NULL
      AND recurrence_frequency IN ('daily', 'weekly')
      AND recurrence_interval IS NOT NULL
      AND recurrence_interval BETWEEN 1 AND 4
      AND recurrence_count IS NOT NULL
      AND recurrence_count BETWEEN 2 AND 366
    )
  ),
  ADD CONSTRAINT calendar_events_recurrence_horizon_check CHECK (
    recurrence_frequency IS NULL
    OR
    (
      recurrence_interval IS NOT NULL
      AND recurrence_count IS NOT NULL
      AND (recurrence_count - 1) * recurrence_interval
        * CASE recurrence_frequency WHEN 'weekly' THEN 7 ELSE 1 END <= 365
    )
  ),
  ADD CONSTRAINT calendar_events_recurrence_duration_check CHECK (
    recurrence_frequency IS NULL
    OR CASE kind
      WHEN 'timed' THEN
        EXTRACT(EPOCH FROM (ends_at - starts_at)) <= 604800
      WHEN 'all-day' THEN
        end_date - start_date <= 7
      ELSE FALSE
    END
  );

COMMENT ON COLUMN calendar_events.recurrence_frequency IS
  'NULL for a single event; otherwise the bounded daily or weekly recurrence frequency.';
COMMENT ON COLUMN calendar_events.recurrence_interval IS
  'Required for recurring events and constrained to 1 through 4.';
COMMENT ON COLUMN calendar_events.recurrence_count IS
  'Required finite emitted occurrence count for recurring events, constrained to 2 through 366.';
COMMENT ON CONSTRAINT calendar_events_recurrence_horizon_check ON calendar_events IS
  'Rejects count and interval combinations whose minimum recurrence span exceeds 366 calendar dates. The application must still enforce the actual zone-aware candidate and emitted occurrence horizon, including skipped generated gap times.';
COMMENT ON CONSTRAINT calendar_events_recurrence_duration_check ON calendar_events IS
  'Recurring instances are limited to seven elapsed days for timed events and seven calendar days for all-day events.';

CREATE TABLE calendar_event_series_proposal_drafts (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (
    char_length(idempotency_key) BETWEEN 1 AND 128
    AND idempotency_key ~ '^[A-Za-z0-9._~-]+$'
  ),
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  scope text NOT NULL CHECK (scope = 'series'),
  target_event_id uuid,
  target_revision integer,
  normalized_payload jsonb,
  payload_hash bytea CHECK (
    payload_hash IS NULL OR octet_length(payload_hash) = 32
  ),
  conflict_snapshot jsonb,
  result_event_id uuid,
  outcome text NOT NULL CHECK (
    outcome IN ('pending', 'approved', 'stale', 'expired', 'deleted')
  ),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  CONSTRAINT calendar_event_series_proposal_drafts_owner_key_unique
    UNIQUE (user_id, idempotency_key),
  CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check CHECK (
    (
      outcome = 'pending'
      AND
      (
        (
          action = 'create'
          AND target_event_id IS NULL
          AND target_revision IS NULL
        )
        OR
        (
          action IN ('update', 'delete')
          AND target_event_id IS NOT NULL
          AND target_revision IS NOT NULL
          AND target_revision > 0
        )
      )
    )
    OR
    (
      outcome = 'approved'
      AND
      (
        (action = 'create' AND target_event_id IS NULL AND target_revision IS NULL)
        OR
        (
          action = 'update'
          AND target_event_id IS NOT NULL
          AND target_revision IS NOT NULL
          AND target_revision > 0
        )
        OR (action = 'delete' AND target_event_id IS NULL AND target_revision IS NULL)
      )
    )
    OR
    (
      outcome IN ('stale', 'expired', 'deleted')
      AND target_event_id IS NULL
      AND target_revision IS NULL
    )
  ),
  CONSTRAINT calendar_event_series_proposal_drafts_outcome_shape_check CHECK (
    (
      outcome = 'pending'
      AND normalized_payload IS NOT NULL
      AND jsonb_typeof(normalized_payload) = 'object'
      AND payload_hash IS NOT NULL
      AND conflict_snapshot IS NOT NULL
      AND resolved_at IS NULL
    )
    OR
    (
      outcome = 'approved'
      AND action IN ('create', 'update')
      AND normalized_payload IS NULL
      AND payload_hash IS NOT NULL
      AND conflict_snapshot IS NULL
      AND resolved_at IS NOT NULL
    )
    OR
    (
      outcome = 'approved'
      AND action = 'delete'
      AND normalized_payload IS NULL
      AND payload_hash IS NULL
      AND conflict_snapshot IS NULL
      AND resolved_at IS NOT NULL
    )
    OR
    (
      outcome IN ('stale', 'expired', 'deleted')
      AND normalized_payload IS NULL
      AND payload_hash IS NULL
      AND conflict_snapshot IS NULL
      AND resolved_at IS NOT NULL
    )
  ),
  CONSTRAINT calendar_event_series_proposal_drafts_result_shape_check CHECK (
    (outcome = 'pending' AND result_event_id IS NULL)
    OR
    (
      outcome = 'approved'
      AND action = 'create'
      AND result_event_id IS NOT NULL
    )
    OR
    (
      outcome = 'approved'
      AND action = 'update'
      AND result_event_id IS NOT NULL
      AND target_event_id IS NOT NULL
      AND result_event_id = target_event_id
    )
    OR
    (
      outcome = 'approved'
      AND action = 'delete'
      AND result_event_id IS NULL
    )
    OR
    (outcome IN ('stale', 'expired', 'deleted') AND result_event_id IS NULL)
  ),
  CONSTRAINT calendar_event_series_proposal_drafts_timestamp_check CHECK (
    expires_at > created_at
    AND updated_at >= created_at
    AND (resolved_at IS NULL OR (resolved_at >= created_at AND updated_at >= resolved_at))
    AND (outcome <> 'expired' OR resolved_at >= expires_at)
    AND (outcome <> 'approved' OR resolved_at < expires_at)
  )
);

-- Target and result intentionally have no event foreign keys: deleted or
-- changed targets must leave drafts safely rejectable as stale, and deletion
-- of an approved result must not block scrubbing its proposal tombstone.
COMMENT ON TABLE calendar_event_series_proposal_drafts IS
  'Owner-scoped exact full-series create/update/delete proposals. Approval clears normalized_payload and conflict_snapshot. Approved creates retain payload_hash and result_event_id; approved updates retain payload_hash and result_event_id equal to target_event_id. Approved deletes are terminal tombstones with no payload, conflict snapshot, hash, or event pointers. Stale, expired, and deleted outcomes also clear payload, conflict snapshot, hash, target_event_id, target_revision, and result_event_id. Account deletion cascades the ledger.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.id IS
  'Opaque UUID generated by the trusted application for one proposal draft.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.payload_hash IS
  'When present, exactly 32 bytes; the application computes SHA-256 over its canonical normalized payload and rechecks it before approval. Approval must also bind and recheck owner, action, series scope, target revision, conflict snapshot, and expiry. Retained for approved creates and updates; absent for approved deletes and stale, expired, or deleted outcomes.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.target_event_id IS
  'No calendar_events foreign key by design, so deleted targets can be safely rejected as stale. Required for pending updates/deletes and retained for approved updates, where it must equal result_event_id; cleared for other terminal states.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.result_event_id IS
  'No calendar_events foreign key by design. Required for approved creates and updates; for updates it must equal target_event_id. On event deletion, the owner-scoped handler must find every approved create/update by result_event_id, transition it to deleted, and atomically clear payload_hash, result_event_id, target_event_id, and target_revision. Approved deletes, stale, expired, and deleted outcomes have no result pointer.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.updated_at IS
  'Set by the application whenever an outcome changes, in the same transaction as the associated payload/hash/pointer cleanup.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.expires_at IS
  'Approval is forbidden at or after expiry; approved outcome rows require resolved_at < expires_at. The schema does not schedule cleanup: deployment must provide a runnable bounded scheduler/worker that switches transaction-local chron.user_id per owner, selects that owner’s pending rows with expires_at <= clock_timestamp() via the owner/expiry partial index, transitions them to expired, sets resolved_at and updated_at, and clears normalized_payload, conflict_snapshot, payload_hash, target_event_id, target_revision, and result_event_id atomically. It must retry failures so pending proposal data is not retained indefinitely; expired rows require resolved_at >= expires_at.';

ALTER TABLE calendar_event_series_proposal_drafts
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_series_proposal_drafts
  FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_event_series_proposal_drafts_owner_policy
  ON calendar_event_series_proposal_drafts
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

CREATE INDEX calendar_event_series_proposal_drafts_owner_pending_expiry_idx
  ON calendar_event_series_proposal_drafts (user_id, expires_at)
  WHERE outcome = 'pending';

CREATE INDEX calendar_event_series_proposal_drafts_owner_approved_result_idx
  ON calendar_event_series_proposal_drafts (user_id, result_event_id)
  WHERE outcome = 'approved' AND action IN ('create', 'update');

COMMIT;
