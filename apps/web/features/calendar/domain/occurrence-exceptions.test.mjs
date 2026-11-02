import assert from "node:assert/strict";
import test from "node:test";
import { applyCalendarOccurrenceMovement } from "./occurrence-exceptions.ts";

const timedOccurrence = {
  seriesId: "series-1",
  occurrenceKey: "series-1:2026-11-02T09:00[America/Toronto]",
  title: "Seminar",
  details: null,
  revision: 3,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  kind: "timed",
  startLocal: "2026-11-02T09:00",
  endLocal: "2026-11-02T10:30",
  timeZone: "America/Toronto",
  startsAt: "2026-11-02T14:00:00.000Z",
  endsAt: "2026-11-02T15:30:00.000Z",
};

test("moves one timed occurrence without changing its stable key, zone, or elapsed duration", () => {
  const moved = applyCalendarOccurrenceMovement(timedOccurrence, {
    kind: "timed",
    startLocal: "2026-11-03T13:15",
    endLocal: "2026-11-03T14:45",
    timeZone: "America/Toronto",
    startsAt: "2026-11-03T18:15:00.000Z",
    endsAt: "2026-11-03T19:45:00.000Z",
  });

  assert.equal(moved.occurrenceKey, timedOccurrence.occurrenceKey);
  assert.equal(moved.seriesId, timedOccurrence.seriesId);
  assert.equal(moved.timeZone, timedOccurrence.timeZone);
  assert.equal(moved.startLocal, "2026-11-03T13:15");
  assert.equal(moved.endsAt, "2026-11-03T19:45:00Z");
});

test("rejects timed moves that change event type, zone, elapsed duration, or resolved local time", () => {
  const base = {
    kind: "timed",
    startLocal: "2026-11-03T13:15",
    endLocal: "2026-11-03T14:45",
    timeZone: "America/Toronto",
    startsAt: "2026-11-03T18:15:00.000Z",
    endsAt: "2026-11-03T19:45:00.000Z",
  };

  assert.throws(() => applyCalendarOccurrenceMovement(timedOccurrence, {
    ...base,
    timeZone: "UTC",
  }), /time zone/u);
  assert.throws(() => applyCalendarOccurrenceMovement(timedOccurrence, {
    ...base,
    endsAt: "2026-11-03T20:00:00.000Z",
  }), /elapsed duration/u);
  assert.throws(() => applyCalendarOccurrenceMovement(timedOccurrence, {
    ...base,
    startLocal: "2026-11-03T12:15",
  }), /inconsistent local/u);
  assert.throws(() => applyCalendarOccurrenceMovement(timedOccurrence, {
    kind: "all-day",
    startDate: "2026-11-03",
    endDate: "2026-11-04",
  }), /event type/u);
});

test("moves an all-day occurrence by date while preserving its exclusive duration and key", () => {
  const occurrence = {
    seriesId: "series-2",
    occurrenceKey: "series-2:2028-02-28",
    title: "Conference",
    details: "Two days",
    revision: 2,
    createdAt: "2028-01-01T00:00:00.000Z",
    updatedAt: "2028-01-01T00:00:00.000Z",
    kind: "all-day",
    startDate: "2028-02-28",
    endDate: "2028-03-01",
  };
  const moved = applyCalendarOccurrenceMovement(occurrence, {
    kind: "all-day",
    startDate: "2028-03-30",
    endDate: "2028-04-01",
  });

  assert.equal(moved.occurrenceKey, occurrence.occurrenceKey);
  assert.equal(moved.startDate, "2028-03-30");
  assert.equal(moved.endDate, "2028-04-01");
  assert.throws(() => applyCalendarOccurrenceMovement(occurrence, {
    kind: "all-day",
    startDate: "2028-03-30",
    endDate: "2028-04-02",
  }), /date duration/u);
});
