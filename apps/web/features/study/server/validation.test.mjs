import assert from "node:assert/strict";
import test from "node:test";
import { StudyRouteError } from "./errors.ts";
import {
  maximumStudyCardsPageSize,
  parseStudyCardDraft,
  parseStudyDeckDraft,
  parseStudyOperationKey,
  parseStudyPage,
  parseStudyRating,
  parseStudyRevision,
} from "./validation.ts";

test("deck and card text is trimmed, bounded, and preserves permitted line breaks", () => {
  assert.deepEqual(parseStudyDeckDraft({ name: "  Biology  " }), { name: "Biology" });
  assert.deepEqual(parseStudyCardDraft({ front: "  Define osmosis  ", back: "Water movement\nthrough a membrane" }), {
    front: "Define osmosis",
    back: "Water movement\nthrough a membrane",
  });
  assert.throws(() => parseStudyDeckDraft({ name: " \t " }), StudyRouteError);
  assert.throws(() => parseStudyCardDraft({ front: "prompt\u0001", back: "answer" }), StudyRouteError);
  assert.throws(() => parseStudyCardDraft({ front: "prompt", back: "answer", dueAt: "2030-01-01" }), StudyRouteError);
});

test("ratings and operation keys have fixed allowlists", () => {
  assert.equal(parseStudyRating({ rating: "good" }), "good");
  assert.throws(() => parseStudyRating({ rating: "manual" }), StudyRouteError);
  assert.equal(parseStudyOperationKey("review.key-01"), "review.key-01");
  assert.throws(() => parseStudyOperationKey("contains a space"), StudyRouteError);
  assert.throws(() => parseStudyOperationKey("x".repeat(129)), StudyRouteError);
});

test("page bounds and entity revisions reject ambiguous or unbounded requests", () => {
  assert.deepEqual(parseStudyPage(new URL("https://chron.example/api/study")), {
    limit: maximumStudyCardsPageSize,
    cursor: null,
  });
  assert.deepEqual(parseStudyPage(new URL("https://chron.example/api/study?limit=20&cursor=2026-11-02T12%3A00%3A00.000456Z%7C123e4567-e89b-42d3-a456-426614174000")), {
    limit: 20,
    cursor: { createdAt: "2026-11-02T12:00:00.000456Z", id: "123e4567-e89b-42d3-a456-426614174000" },
  });
  assert.throws(() => parseStudyPage(new URL("https://chron.example/api/study?limit=100000")), StudyRouteError);
  assert.throws(() => parseStudyPage(new URL("https://chron.example/api/study?limit=2&limit=3")), StudyRouteError);
  assert.throws(() => parseStudyPage(new URL("https://chron.example/api/study?offset=40")), StudyRouteError);
  assert.throws(() => parseStudyPage(new URL("https://chron.example/api/study?cursor=not-a-cursor")), StudyRouteError);
  assert.throws(() => parseStudyPage(new URL("https://chron.example/api/study?cursor=2026-02-30T12%3A00%3A00.000456Z%7C123e4567-e89b-42d3-a456-426614174000")), StudyRouteError);
  assert.equal(parseStudyRevision('"4"'), 4);
  assert.throws(
    () => parseStudyRevision(null),
    (error) => error instanceof StudyRouteError && error.code === "PRECONDITION_REQUIRED",
  );
});
