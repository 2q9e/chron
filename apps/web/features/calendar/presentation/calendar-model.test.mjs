import assert from "node:assert/strict";
import test from "node:test";
import { timedEventSegmentsForDate } from "./calendar-model.ts";

function timedEvent(id, startLocal, endLocal, timeZone, startsAt, endsAt) {
  return {
    id,
    kind: "timed",
    title: `Event ${id}`,
    details: null,
    revision: 1,
    startLocal,
    endLocal,
    timeZone,
    startsAt,
    endsAt,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function utcEvent(id, start, end) {
  const date = "2026-06-15";
  return timedEvent(
    id,
    `${date}T${start}`,
    `${date}T${end}`,
    "UTC",
    `${date}T${start}:00Z`,
    `${date}T${end}:00Z`,
  );
}

test("adjacent five-minute events occupy separate rendered lanes", () => {
  const timeline = timedEventSegmentsForDate([
    utcEvent("first", "09:00", "09:05"),
    utcEvent("second", "09:05", "09:10"),
  ], "2026-06-15", "UTC", "en-US");
  const [first, second] = timeline.events;

  assert.equal(first.event.id, "first");
  assert.equal(second.event.id, "second");
  assert.ok(Math.abs(first.heightRem - 1.8) < 1e-9);
  assert.ok(Math.abs(second.heightRem - 1.8) < 1e-9);
  assert.ok(first.leftPercent + first.widthPercent <= second.leftPercent);
});

test("a short event near midnight is clipped to the day's elapsed-time track", () => {
  const timeline = timedEventSegmentsForDate([
    utcEvent("late", "23:58", "23:59"),
  ], "2026-06-15", "UTC", "en-US");
  const [late] = timeline.events;

  assert.equal(timeline.trackHeightRem, 24 * 2.75);
  assert.ok(late.topRem + late.heightRem <= timeline.trackHeightRem + 1e-9);
  assert.ok(late.heightRem < 1.8);
});

test("the spring-forward day keeps event positions mapped to elapsed time", () => {
  const timeline = timedEventSegmentsForDate([
    timedEvent(
      "before-transition",
      "2026-03-08T01:55",
      "2026-03-08T03:00",
      "America/Toronto",
      "2026-03-08T06:55:00Z",
      "2026-03-08T07:00:00Z",
    ),
    timedEvent(
      "after-transition",
      "2026-03-08T03:00",
      "2026-03-08T03:05",
      "America/Toronto",
      "2026-03-08T07:00:00Z",
      "2026-03-08T07:05:00Z",
    ),
  ], "2026-03-08", "America/Toronto", "en-US");
  const [before, after] = timeline.events;

  assert.equal(timeline.trackHeightRem, 23 * 2.75);
  assert.ok(Math.abs(after.topRem - before.topRem - (5 / 60) * 2.75) < 1e-9);
  assert.ok(before.leftPercent + before.widthPercent <= after.leftPercent);
});
