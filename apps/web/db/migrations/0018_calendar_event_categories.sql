-- Add optional academic categories without guessing values for existing events.
BEGIN;

ALTER TABLE calendar_events
  ADD COLUMN category text,
  ADD CONSTRAINT calendar_events_category_valid CHECK (
    category IS NULL
    OR category IN ('class', 'assignment', 'exam', 'study', 'personal', 'other')
  );

COMMIT;
