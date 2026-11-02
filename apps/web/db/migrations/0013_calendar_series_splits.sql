-- Allow one-occurrence finite segments and exact "this and following" drafts.
BEGIN;

ALTER TABLE calendar_events
  DROP CONSTRAINT calendar_events_recurrence_shape_check,
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
      AND recurrence_count BETWEEN 1 AND 366
    )
  );

ALTER TABLE calendar_event_series_proposal_drafts
  DROP CONSTRAINT calendar_event_series_proposal_drafts_action_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_scope_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_outcome_shape_check,
  DROP CONSTRAINT calendar_event_series_proposal_drafts_result_shape_check;

ALTER TABLE calendar_event_series_proposal_drafts
  ADD CONSTRAINT calendar_event_series_proposal_drafts_action_check
    CHECK (action IN ('create', 'update', 'delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence', 'split-series')),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_scope_check
    CHECK (
      (action IN ('cancel-occurrence', 'restore-occurrence', 'move-occurrence') AND scope = 'occurrence')
      OR (action = 'split-series' AND scope = 'following')
      OR (action NOT IN ('cancel-occurrence', 'restore-occurrence', 'move-occurrence', 'split-series') AND scope = 'series')
    ),
  ADD CONSTRAINT calendar_event_series_proposal_drafts_target_shape_check CHECK (
    (
      outcome = 'pending'
      AND
      (
        (action = 'create' AND target_event_id IS NULL AND target_revision IS NULL)
        OR
        (action IN ('update', 'delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence', 'split-series')
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
        (action = 'split-series' AND target_event_id IS NOT NULL
          AND target_revision IS NOT NULL AND target_revision > 0
          AND result_event_id IS NOT NULL AND result_event_id <> target_event_id)
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
      AND action IN ('create', 'update', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence', 'split-series')
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
    OR (outcome = 'approved' AND action = 'split-series'
      AND result_event_id IS NOT NULL AND result_event_id <> target_event_id)
    OR (outcome = 'approved' AND action IN ('delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence')
      AND result_event_id IS NULL)
    OR (outcome IN ('stale', 'expired', 'deleted') AND result_event_id IS NULL)
  );

COMMENT ON COLUMN calendar_events.recurrence_count IS
  'Required finite occurrence count for a recurring event segment, constrained to 1 through 366. A one-occurrence segment preserves series identity across reviewed splits.';

COMMIT;
