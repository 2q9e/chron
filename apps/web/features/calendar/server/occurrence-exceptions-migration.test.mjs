import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../db/migrations/0009_calendar_occurrence_exceptions.sql", import.meta.url),
  "utf8",
);
const restoreMigration = readFileSync(
  new URL("../../../db/migrations/0010_calendar_occurrence_restore.sql", import.meta.url),
  "utf8",
);
const movementMigration = readFileSync(
  new URL("../../../db/migrations/0011_calendar_occurrence_moves.sql", import.meta.url),
  "utf8",
);
const lineageMigration = readFileSync(
  new URL("../../../db/migrations/0012_calendar_series_lineage.sql", import.meta.url),
  "utf8",
);

test("occurrence cancellation is bounded, exact, owner scoped, and cascades with its series", () => {
  assert.match(migration, /action IN \('create', 'update', 'delete', 'cancel-occurrence'\)/u);
  assert.match(migration, /action = 'cancel-occurrence' AND scope = 'occurrence'/u);
  assert.match(migration, /target_event_id IS NOT NULL AND target_revision IS NOT NULL[\s\S]*?target_revision > 0/u);
  assert.match(migration, /PRIMARY KEY \(user_id, event_id, occurrence_key\)/u);
  assert.match(migration, /char_length\(occurrence_key\) BETWEEN 1 AND 200/u);
  assert.match(migration, /REFERENCES calendar_events \(user_id, id\)[\s\S]*?ON DELETE CASCADE/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY;[\s\S]*?FORCE ROW LEVEL SECURITY;/u);
  assert.match(migration, /USING \(user_id = current_setting\('chron\.user_id', true\)\)[\s\S]*?WITH CHECK \(user_id = current_setting\('chron\.user_id', true\)\)/u);
});

test("occurrence restoration keeps approval, idempotency, and owner constraints", () => {
  assert.match(restoreMigration, /action IN \('create', 'update', 'delete', 'cancel-occurrence', 'restore-occurrence'\)/u);
  assert.match(restoreMigration, /action IN \('cancel-occurrence', 'restore-occurrence'\) AND scope = 'occurrence'/u);
  assert.match(restoreMigration, /action IN \('delete', 'cancel-occurrence', 'restore-occurrence'\)[\s\S]*?target_event_id IS NULL/u);
  assert.match(restoreMigration, /action IN \('create', 'update', 'cancel-occurrence', 'restore-occurrence'\)[\s\S]*?payload_hash IS NOT NULL/u);
  assert.match(restoreMigration, /action IN \('delete', 'cancel-occurrence', 'restore-occurrence'\)[\s\S]*?result_event_id IS NULL/u);
  assert.match(restoreMigration, /BEGIN;[\s\S]*?COMMIT;/u);
});

test("occurrence moves preserve original identity, cancellation state, and exact proposal scope", () => {
  assert.match(movementMigration, /ADD COLUMN is_cancelled boolean NOT NULL DEFAULT true/u);
  assert.match(movementMigration, /moved_start_local timestamp without time zone/u);
  assert.match(movementMigration, /moved_starts_at timestamptz/u);
  assert.match(movementMigration, /moved_start_date date/u);
  assert.match(movementMigration, /CHECK \([\s\S]*?is_cancelled AND cancelled_at IS NOT NULL[\s\S]*?NOT is_cancelled AND cancelled_at IS NULL/u);
  assert.match(movementMigration, /moved_ends_at > moved_starts_at/u);
  assert.match(movementMigration, /moved_end_date > moved_start_date/u);
  assert.match(movementMigration, /WHERE NOT is_cancelled AND moved_start_local IS NOT NULL/u);
  assert.match(movementMigration, /action IN \('create', 'update', 'delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence'\)/u);
  assert.match(movementMigration, /action IN \('cancel-occurrence', 'restore-occurrence', 'move-occurrence'\) AND scope = 'occurrence'/u);
  assert.match(movementMigration, /action IN \('delete', 'cancel-occurrence', 'restore-occurrence', 'move-occurrence'\)[\s\S]*?result_event_id IS NULL/u);
  assert.match(movementMigration, /BEGIN;[\s\S]*?COMMIT;/u);
});

test("recurring segments retain a stable owner-scoped lineage identity", () => {
  assert.match(lineageMigration, /ADD COLUMN series_root_id uuid/u);
  assert.match(lineageMigration, /SET series_root_id = id[\s\S]*?recurrence_frequency IS NOT NULL/u);
  assert.match(lineageMigration, /recurrence_frequency IS NULL OR series_root_id IS NOT NULL/u);
  assert.match(lineageMigration, /ON calendar_events \(user_id, series_root_id, id\)/u);
  assert.match(lineageMigration, /BEGIN;[\s\S]*?COMMIT;/u);
});
