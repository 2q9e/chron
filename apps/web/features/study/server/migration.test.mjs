import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../db/migrations/0019_study_flashcards.sql", import.meta.url), "utf8");

test("study records enforce bounded content and same-owner deck/card relationships", () => {
  assert.match(migration, /char_length\(name\) BETWEEN 1 AND 120/u);
  assert.match(migration, /char_length\(front\) BETWEEN 1 AND 4000/u);
  assert.match(migration, /char_length\(back\) BETWEEN 1 AND 8000/u);
  assert.match(migration, /FOREIGN KEY \(user_id, deck_id\)[\s\S]*?REFERENCES study_decks \(user_id, id\) ON DELETE CASCADE/u);
  assert.match(migration, /FOREIGN KEY \(user_id, deck_id, card_id\)[\s\S]*?REFERENCES study_cards \(user_id, deck_id, id\) ON DELETE CASCADE/u);
});

test("all study tables force transaction-scoped owner policies and support due queue order", () => {
  assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY;/gu) ?? []).length, 3);
  assert.equal((migration.match(/FORCE ROW LEVEL SECURITY;/gu) ?? []).length, 3);
  assert.equal((migration.match(/current_setting\('chron\.user_id', true\)/gu) ?? []).length, 6);
  assert.match(migration, /study_cards_owner_due_idx[\s\S]*?\(user_id, deck_id, due_at, id\)/u);
});

test("review records keep an immutable rating, scheduler states, version, and idempotency key", () => {
  assert.match(migration, /rating IN \('again', 'hard', 'good', 'easy'\)/u);
  assert.match(migration, /UNIQUE \(user_id, card_id, operation_key\)/u);
  assert.match(migration, /state_before jsonb NOT NULL/u);
  assert.match(migration, /state_after jsonb NOT NULL/u);
  assert.match(migration, /review_log jsonb NOT NULL/u);
  assert.match(migration, /algorithm_version text NOT NULL/u);
  assert.match(migration, /request_revision integer NOT NULL CHECK \(request_revision > 0\)/u);
});
