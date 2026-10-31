import assert from "node:assert/strict";
import test from "node:test";
import { allDayEventsForDate, timedEventSegmentsForDate } from "./calendar-model.ts";

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
  assert.equal(timeline.belowTrackEvents.length, 0);
  assert.ok(first.leftPercent + first.widthPercent <= second.leftPercent);
});

test("a one-minute event ending at midnight gets a below-track target", () => {
  const lateEvent = timedEvent(
    "late",
    "2026-06-15T23:59",
    "2026-06-16T00:00",
    "UTC",
    "2026-06-15T23:59:00Z",
    "2026-06-16T00:00:00Z",
  );
  const timeline = timedEventSegmentsForDate([
    utcEvent("normal", "09:00", "10:00"),
    lateEvent,
  ], "2026-06-15", "UTC", "en-US");
  const [normal] = timeline.events;
  const [late] = timeline.belowTrackEvents;

  assert.equal(timeline.trackHeightRem, 24 * 2.75);
  assert.deepEqual(timeline.events.map((segment) => segment.event.id), ["normal"]);
  assert.equal(normal.heightRem, 2.75);
  assert.equal(late.event.id, "late");
  assert.ok(Math.abs(late.heightRem - (2.75 / 60)) < 1e-9);
  assert.ok(late.heightRem < 1.8);
  assert.equal(late.endsAtMidnight, true);
  assert.ok(late.topRem + late.heightRem <= timeline.trackHeightRem + 1e-9);
  assert.ok(Math.abs(late.topRem + late.heightRem - timeline.trackHeightRem) < 1e-9);
});

test("a continued segment ending at midnight remains a full-height track event", () => {
  const continued = timedEvent(
    "continued",
    "2026-06-14T23:30",
    "2026-06-16T00:00",
    "UTC",
    "2026-06-14T23:30:00Z",
    "2026-06-16T00:00:00Z",
  );
  const timeline = timedEventSegmentsForDate([
    continued,
  ], "2026-06-15", "UTC", "en-US");
  const [segment] = timeline.events;

  assert.equal(segment.event.id, "continued");
  assert.equal(segment.startsOnDate, false);
  assert.equal(segment.endsOnDate, true);
  assert.equal(segment.endsAtMidnight, true);
  assert.equal(segment.heightRem, timeline.trackHeightRem);
  assert.equal(timeline.belowTrackEvents.length, 0);
});

test("all-day events stay in the all-day event list", () => {
  const allDay = {
    id: "all-day",
    kind: "all-day",
    title: "All-day event",
    details: null,
    revision: 1,
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const timeline = timedEventSegmentsForDate([
    allDay,
    utcEvent("normal", "09:00", "10:00"),
  ], "2026-06-15", "UTC", "en-US");

  assert.deepEqual(allDayEventsForDate([allDay], "2026-06-15").map((event) => event.id), ["all-day"]);
  assert.deepEqual(timeline.events.map((segment) => segment.event.id), ["normal"]);
  assert.equal(timeline.belowTrackEvents.length, 0);
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
