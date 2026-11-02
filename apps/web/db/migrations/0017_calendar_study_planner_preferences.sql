-- Persist bounded study scheduling defaults with the existing owner-scoped preferences.
BEGIN;

ALTER TABLE calendar_preferences
  ADD COLUMN study_weekdays smallint[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::smallint[],
  ADD COLUMN study_day_start time without time zone NOT NULL DEFAULT TIME '09:00',
  ADD COLUMN study_day_end time without time zone NOT NULL DEFAULT TIME '17:00',
  ADD COLUMN study_session_minutes smallint NOT NULL DEFAULT 60,
  ADD COLUMN study_event_buffer_minutes smallint NOT NULL DEFAULT 15,
  ADD COLUMN study_session_break_minutes smallint NOT NULL DEFAULT 15,
  ADD CONSTRAINT calendar_preferences_study_weekdays_valid CHECK (
    array_ndims(study_weekdays) = 1
    AND cardinality(study_weekdays) BETWEEN 1 AND 7
    AND study_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
    AND cardinality(study_weekdays) = (
      (CASE WHEN 1 = ANY(study_weekdays) THEN 1 ELSE 0 END)
      + (CASE WHEN 2 = ANY(study_weekdays) THEN 1 ELSE 0 END)
      + (CASE WHEN 3 = ANY(study_weekdays) THEN 1 ELSE 0 END)
      + (CASE WHEN 4 = ANY(study_weekdays) THEN 1 ELSE 0 END)
      + (CASE WHEN 5 = ANY(study_weekdays) THEN 1 ELSE 0 END)
      + (CASE WHEN 6 = ANY(study_weekdays) THEN 1 ELSE 0 END)
      + (CASE WHEN 7 = ANY(study_weekdays) THEN 1 ELSE 0 END)
    )
  ),
  ADD CONSTRAINT calendar_preferences_study_window_valid CHECK (
    study_day_start < study_day_end
    AND EXTRACT(HOUR FROM study_day_start) BETWEEN 0 AND 23
    AND EXTRACT(HOUR FROM study_day_end) BETWEEN 0 AND 23
    AND EXTRACT(MINUTE FROM study_day_start) % 15 = 0
    AND EXTRACT(MINUTE FROM study_day_end) % 15 = 0
    AND EXTRACT(SECOND FROM study_day_start) = 0
    AND EXTRACT(SECOND FROM study_day_end) = 0
  ),
  ADD CONSTRAINT calendar_preferences_study_session_valid CHECK (
    study_session_minutes BETWEEN 15 AND 180
    AND study_session_minutes % 15 = 0
  ),
  ADD CONSTRAINT calendar_preferences_study_buffer_valid CHECK (
    study_event_buffer_minutes BETWEEN 0 AND 60
    AND study_event_buffer_minutes % 15 = 0
  ),
  ADD CONSTRAINT calendar_preferences_study_break_valid CHECK (
    study_session_break_minutes BETWEEN 0 AND 60
    AND study_session_break_minutes % 15 = 0
  );

COMMIT;
