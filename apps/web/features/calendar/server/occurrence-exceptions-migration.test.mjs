import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../db/migrations/0009_calendar_occurrence_exceptions.sql", import.meta.url),
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
