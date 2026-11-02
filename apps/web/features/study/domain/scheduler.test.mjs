import assert from "node:assert/strict";
import test from "node:test";
import {
  applyStudyRating,
  createStudySchedule,
  restoreStoredStudySchedule,
  studySchedulerVersion,
} from "./scheduler.ts";

const reviewedAt = new Date("2026-11-02T15:00:00.000Z");

test("new cards are due immediately and preserve their explicit FSRS version and parameters", () => {
  const schedule = createStudySchedule(reviewedAt);
  assert.equal(schedule.algorithmVersion, studySchedulerVersion);
  assert.equal(schedule.due, reviewedAt.toISOString());
  assert.equal(schedule.state, 0);
  assert.equal(schedule.reps, 0);
  assert.equal(schedule.lastReview, null);
  assert.equal(schedule.parameters.request_retention, 0.9);
  assert.equal(schedule.parameters.enable_fuzz, false);
  assert.deepEqual(restoreStoredStudySchedule(JSON.parse(JSON.stringify(schedule))), schedule);
});

test("ratings are scheduled by FSRS and the replayable review log records the selected rating", () => {
  const initial = createStudySchedule(reviewedAt);
  const again = applyStudyRating(initial, "again", reviewedAt);
  const easy = applyStudyRating(initial, "easy", reviewedAt);

  assert.equal(again.log.rating, "again");
  assert.equal(easy.log.rating, "easy");
  assert.ok(Date.parse(again.schedule.due) > reviewedAt.valueOf());
  assert.ok(Date.parse(easy.schedule.due) > Date.parse(again.schedule.due));
  assert.equal(again.schedule.reps, 1);
  assert.equal(again.schedule.lastReview, reviewedAt.toISOString());
  assert.equal(again.schedule.algorithmVersion, initial.algorithmVersion);
  assert.deepEqual(again.schedule.parameters, initial.parameters);
});

test("invalid or unsupported stored scheduler state is rejected instead of silently reset", () => {
  const schedule = createStudySchedule(reviewedAt);
  assert.throws(
    () => restoreStoredStudySchedule({ ...schedule, algorithmVersion: "future-version" }),
    /invalid or uses a newer algorithm version/u,
  );
  assert.throws(
    () => restoreStoredStudySchedule({ ...schedule, state: 8 }),
    /invalid learning state/u,
  );
  assert.throws(
    () => restoreStoredStudySchedule({ ...schedule, due: "invalid" }),
    /invalid or uses a newer algorithm version/u,
  );
});
