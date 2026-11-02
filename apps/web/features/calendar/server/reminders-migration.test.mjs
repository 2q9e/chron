import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../db/migrations/0007_calendar_reminders.sql", import.meta.url),
  "utf8",
);

test("reminder schema defaults to no reminder and restricts values by event kind", () => {
  assert.match(migration, /reminder_choice text NOT NULL DEFAULT 'none'/u);
  assert.match(migration, /kind = 'timed'[\s\S]*?'one-local-day-before'/u);
  assert.match(migration, /kind = 'all-day'[\s\S]*?'previous-day-9am'/u);
  assert.match(migration, /reminder_choice <> 'none'[\s\S]*?reminder_time_zone IS NOT NULL/u);
  assert.match(migration, /reminder_choice = 'none' AND reminder_time_zone IS NULL/u);
});

test("reminder jobs bind to the same owner and event and remain owner scoped", () => {
  assert.match(migration, /UNIQUE \(user_id, id\)/u);
  assert.match(migration, /FOREIGN KEY \(user_id, event_id\)[\s\S]*?REFERENCES calendar_events \(user_id, id\)[\s\S]*?ON DELETE CASCADE/u);
  assert.match(migration, /UNIQUE \(user_id, event_id, event_revision, occurrence_key\)/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY;[\s\S]*?FORCE ROW LEVEL SECURITY;/u);
  assert.match(migration, /USING \(user_id = current_setting\('chron\.user_id', true\)\)[\s\S]*?WITH CHECK \(user_id = current_setting\('chron\.user_id', true\)\)/u);
});

test("delivery attempts have bounded states and keep error storage sanitized", () => {
  assert.match(migration, /status IN \('pending', 'leased', 'sent', 'failed', 'cancelled'\)/u);
  assert.match(migration, /attempt_count BETWEEN 0 AND 5/u);
  assert.match(migration, /last_error_code ~ '\^\[A-Z0-9_\]\{1,64\}\$'/u);
  assert.match(migration, /provider messages, addresses, and event content must never be stored/iu);
});
