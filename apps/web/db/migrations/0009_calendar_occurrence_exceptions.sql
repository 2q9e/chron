-- Store owner-scoped, exact-identity cancellations for recurring occurrences.
BEGIN;

ALTER TABLE calendar_event_series_proposal_drafts
  DROP CONSTRAINT calendar_event_series_proposal_drafts_action_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_scope_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_outcome_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_result_shape_check;

ALTER TABLE calendar_event_series_proposal_drafts
  ADD CONSTRAINT calendar_event_series_proposal_drafts_action_check
    CHECK (action IN ('create', 'update', 'delete', 'cancel-occurrence')),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_scope_check
    CHECK (
      (action = 'cancel-occurrence' AND scope = 'occurrence')
      OR (action <> 'cancel-occurrence' AND scope = 'series')
    ),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check CHECK (
    (
      outcome = 'pending'
      AND
      (
        (action = 'create' AND target_event_id IS NULL AND target_revision IS NULL)
        OR
        (action IN ('update', 'delete', 'cancel-occurrence')
          AND target_event_id IS NOT NULL AND target_revision IS NOT NULL
          AND target_revision > 0)
      )
    )
    OR
    (
      outcome = 'approved'
      AND
      (
        (action = 'create' AND target_event_id IS NULL AND target_revision IS NULL)
        OR
        (action = 'update' AND target_event_id IS NOT NULL
          AND target_revision IS NOT NULL AND target_revision > 0
          AND result_event_id IS NOT NULL AND result_event_id = target_event_id)
        OR
        (action IN ('delete', 'cancel-occurrence')
          AND target_event_id IS NULL AND target_revision IS NULL)
      )
    )
    OR
    (outcome IN ('stale', 'expired', 'deleted')
      AND target_event_id IS NULL AND target_revision IS NULL)
  ),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_outcome_shape_check CHECK (
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
      AND action IN ('create', 'update', 'cancel-occurrence')
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
  ADD CONSTRAINT calendar_event_series_proposal_drafts_result_shape_check CHECK (
    (outcome = 'pending' AND result_event_id IS NULL)
    OR (outcome = 'approved' AND action = 'create' AND result_event_id IS NOT NULL)
    OR (outcome = 'approved' AND action = 'update'
      AND result_event_id IS NOT NULL AND result_event_id = target_event_id)
    OR (outcome = 'approved' AND action IN ('delete', 'cancel-occurrence')
      AND result_event_id IS NULL)
    OR (outcome IN ('stale', 'expired', 'deleted') AND result_event_id IS NULL)
  );

CREATE TABLE calendar_event_occurrence_exceptions (
  user_id text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  event_id uuid NOT NULL,
  occurrence_key text NOT NULL CHECK (char_length(occurrence_key) BETWEEN 1 AND 200),
  cancelled_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT calendar_event_occurrence_exceptions_identity_primary
    PRIMARY KEY (user_id, event_id, occurrence_key),
  CONSTRAINT calendar_event_occurrence_exceptions_owner_event_fk
    FOREIGN KEY (user_id, event_id)
    REFERENCES calendar_events (user_id, id)
    ON DELETE CASCADE
);

ALTER TABLE calendar_event_occurrence_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_event_occurrence_exceptions FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_event_occurrence_exceptions_owner_policy
  ON calendar_event_occurrence_exceptions
  USING (user_id = current_setting('chron.user_id', true))
  WITH CHECK (user_id = current_setting('chron.user_id', true));

COMMENT ON TABLE calendar_event_occurrence_exceptions IS
  'Owner-scoped cancellations keyed by the original generated occurrence identity. Keys are validated against the current finite recurrence before insertion. Account and series deletion cascade these exceptions.';
COMMENT ON TABLE calendar_event_series_proposal_drafts IS
  'Owner-scoped exact series and occurrence proposals. Pending normalized payloads and conflict snapshots are cleared when proposals resolve. Approved occurrence cancellations retain only the canonical payload hash for idempotency-key reuse checks.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.action IS
  'cancel-occurrence proposals bind one occurrence key, owner, recurring-series revision, exact payload hash, snapshot, and expiry. Approval writes one exception and cancels only that occurrence’s pending reminder jobs.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.payload_hash IS
  'The canonical SHA-256 request hash is retained for approved occurrence cancellations so an idempotency key cannot be reused for a different occurrence. The occurrence key and normalized request are cleared on approval.';

COMMIT;
