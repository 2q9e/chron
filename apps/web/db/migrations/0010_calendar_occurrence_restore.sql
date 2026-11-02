-- Extend exact occurrence proposals to safely restore a cancelled instance.
BEGIN;

ALTER TABLE calendar_event_series_proposal_drafts
  DROP CONSTRAINT calendar_event_series_proposal_drafts_action_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_scope_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_outcome_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_result_shape_check;

ALTER TABLE calendar_event_series_proposal_drafts
  ADD CONSTRAINT calendar_event_series_proposal_drafts_action_check
    CHECK (action IN ('create', 'update', 'delete', 'cancel-occurrence', 'restore-occurrence')),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_scope_check
    CHECK (
      (action IN ('cancel-occurrence', 'restore-occurrence') AND scope = 'occurrence')
      OR (action NOT IN ('cancel-occurrence', 'restore-occurrence') AND scope = 'series')
    ),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check CHECK (
    (
      outcome = 'pending'
      AND
      (
        (action = 'create' AND target_event_id IS NULL AND target_revision IS NULL)
        OR
        (action IN ('update', 'delete', 'cancel-occurrence', 'restore-occurrence')
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
        (action IN ('delete', 'cancel-occurrence', 'restore-occurrence')
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
      AND action IN ('create', 'update', 'cancel-occurrence', 'restore-occurrence')
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
    OR (outcome = 'approved' AND action IN ('delete', 'cancel-occurrence', 'restore-occurrence')
      AND result_event_id IS NULL)
    OR (outcome IN ('stale', 'expired', 'deleted') AND result_event_id IS NULL)
  );

COMMENT ON TABLE calendar_event_series_proposal_drafts IS
  'Owner-scoped exact series and occurrence proposals. Pending normalized payloads and conflict snapshots are cleared when proposals resolve. Approved occurrence proposals retain only the canonical payload hash for idempotency-key reuse checks.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.action IS
  'Occurrence cancellation and restoration proposals bind one occurrence key, owner, recurring-series revision, exact payload hash, overlap snapshot, and expiry. Approval atomically inserts or deletes one owner-scoped exception.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.payload_hash IS
  'The canonical SHA-256 request hash is retained for approved occurrence actions so an idempotency key cannot be reused for a different occurrence. Occurrence keys and normalized requests are cleared on approval.';

COMMIT;
