-- Persist reviewed time overrides for individual recurring occurrences.
BEGIN;

ALTER TABLE calendar_event_occurrence_exceptions
  ALTER COLUMN cancelled_at DROP NOT NULL,
  ADD COLUMN is_cancelled boolean NOT NULL DEFAULT true,
  ADD COLUMN moved_start_local timestamp without time zone,
  ADD COLUMN moved_end_local timestamp without time zone,
  ADD COLUMN moved_time_zone text,
  ADD COLUMN moved_starts_at timestamptz,
  ADD COLUMN moved_ends_at timestamptz,
  ADD COLUMN moved_start_date date,
  ADD COLUMN moved_end_date date,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT calendar_event_occurrence_exceptions_cancelled_at_shape_check
    CHECK (
      (is_cancelled AND cancelled_at IS NOT NULL)
      OR (NOT is_cancelled AND cancelled_at IS NULL)
    ),
  ADD CONSTRAINT calendar_event_occurrence_exceptions_movement_shape_check
    CHECK (
      (
        moved_start_local IS NULL AND moved_end_local IS NULL
        AND moved_time_zone IS NULL AND moved_starts_at IS NULL
        AND moved_ends_at IS NULL AND moved_start_date IS NULL
        AND moved_end_date IS NULL
      )
      OR
      (
        moved_start_local IS NOT NULL AND moved_end_local IS NOT NULL
        AND moved_time_zone IS NOT NULL
        AND char_length(moved_time_zone) BETWEEN 1 AND 100
        AND moved_starts_at IS NOT NULL AND moved_ends_at IS NOT NULL
        AND moved_ends_at > moved_starts_at
        AND moved_start_date IS NULL AND moved_end_date IS NULL
      )
      OR
      (
        moved_start_date IS NOT NULL AND moved_end_date IS NOT NULL
        AND moved_end_date > moved_start_date
        AND moved_start_local IS NULL AND moved_end_local IS NULL
        AND moved_time_zone IS NULL AND moved_starts_at IS NULL
        AND moved_ends_at IS NULL
      )
    ),
  ADD CONSTRAINT calendar_event_occurrence_exceptions_nonempty_check
    CHECK (is_cancelled OR moved_start_local IS NOT NULL OR moved_start_date IS NOT NULL);

CREATE INDEX calendar_event_occurrence_exceptions_moved_timed_range_idx
  ON calendar_event_occurrence_exceptions (user_id, moved_starts_at, moved_ends_at, event_id)
  WHERE NOT is_cancelled AND moved_start_local IS NOT NULL;

CREATE INDEX calendar_event_occurrence_exceptions_moved_all_day_range_idx
  ON calendar_event_occurrence_exceptions (user_id, moved_start_date, moved_end_date, event_id)
  WHERE NOT is_cancelled AND moved_start_date IS NOT NULL;

ALTER TABLE calendar_event_series_proposal_drafts
  DROP CONSTRAINT calendar_event_series_proposal_drafts_action_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_scope_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_outcome_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_result_shape_check;

ALTER TABLE calendar_event_series_proposal_drafts
  ADD CONSTRAINT calendar_event_series_proposal_drafts_action_check
    CHECK (action IN ('create', 'update', 'delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence')),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_scope_check
    CHECK (
      (action IN ('cancel-occurrence', 'restore-occurrence', 'move-occurrence') AND scope = 'occurrence')
      OR (action NOT IN ('cancel-occurrence', 'restore-occurrence', 'move-occurrence') AND scope = 'series')
    ),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check CHECK (
    (
      outcome = 'pending'
      AND
      (
        (action = 'create' AND target_event_id IS NULL AND target_revision IS NULL)
        OR
        (action IN ('update', 'delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence')
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
        (action IN ('delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence')
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
      AND action IN ('create', 'update', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence')
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
    OR (outcome = 'approved' AND action IN ('delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence')
      AND result_event_id IS NULL)
    OR (outcome IN ('stale', 'expired', 'deleted') AND result_event_id IS NULL)
  );

COMMENT ON TABLE calendar_event_occurrence_exceptions IS
  'Owner-scoped recurring occurrence exceptions keyed by the original generated identity. Cancellation may coexist with a saved timed or all-day movement, so restoring a moved occurrence retains its approved date or time override.';
COMMENT ON COLUMN calendar_event_occurrence_exceptions.is_cancelled IS
  'When true the occurrence is hidden and excluded from conflicts. A cancelled moved occurrence retains its movement fields so restoration returns it to the approved moved time.';
COMMENT ON COLUMN calendar_event_series_proposal_drafts.action IS
  'Occurrence proposals bind one original occurrence key, owner, series revision, exact payload hash, overlap snapshot, and expiry. Approval atomically cancels, restores, or moves one occurrence.';

COMMIT;
