import assert from "node:assert/strict";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  calendarMinuteAtPointer,
  calendarMoveSnapMinutes,
  moveCalendarEventDraft,
  resizeCalendarEventDraft,
} from "./calendar-move.ts";

function timedEvent({
  id = "event-1",
  date = "2026-06-15",
  start = "09:00",
  end = "10:30",
  timeZone = "America/Toronto",
  recurrenceRule,
} = {}) {
  const startValue = `${date}T${start}`;
  const endValue = `${date}T${end}`;
  const startsAt = Temporal.ZonedDateTime.from(`${startValue}[${timeZone}]`).toInstant().toString();
  const endsAt = Temporal.ZonedDateTime.from(`${endValue}[${timeZone}]`).toInstant().toString();
  return {
    id,
    kind: "timed",
    title: "Study session",
    details: null,
    revision: 1,
    ...(recurrenceRule ? { recurrenceRule } : {}),
    reminderChoice: "none",
    startLocal: startValue,
    endLocal: endValue,
    timeZone,
    startsAt,
    endsAt,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("pointer hit testing snaps to 15-minute intervals and clamps to the track", () => {
  assert.equal(calendarMoveSnapMinutes, 15);
  assert.equal(calendarMinuteAtPointer(0, 0, 1440), 0);
  assert.equal(calendarMinuteAtPointer(366, 0, 1440), 360);
  assert.equal(calendarMinuteAtPointer(-40, 0, 1440), 0);
  assert.equal(calendarMinuteAtPointer(1500, 0, 1440), 1425);
  assert.equal(calendarMinuteAtPointer((150 / 1380) * 100, 0, 100, 1380), 150);
  assert.equal(calendarMinuteAtPointer(100, 0, 100, 1500), 1485);
  assert.equal(calendarMinuteAtPointer(100, 20, 0), null);
  assert.equal(calendarMinuteAtPointer(Number.NaN, 0, 1440), null);
});

test("timed movement preserves duration and the event timezone", () => {
  const event = timedEvent();
  const moved = moveCalendarEventDraft(event, "2026-06-16", 615, "America/Toronto");

  assert.equal(moved.ok, true);
  assert.equal(moved.timeZone, "America/Toronto");
  assert.equal(moved.draft.startLocal, "2026-06-16T10:15");
  assert.equal(moved.draft.endLocal, "2026-06-16T11:45");
  assert.equal(moved.draft.title, event.title);
  assert.equal(moved.draft.reminderChoice, event.reminderChoice);
});

test("month movement keeps the visible clock across different time zones", () => {
  const event = timedEvent();
  const moved = moveCalendarEventDraft(event, "2026-06-16", null, "UTC");

  assert.equal(moved.ok, true);
  assert.equal(moved.timeZone, "America/Toronto");
  assert.equal(moved.draft.startLocal, "2026-06-16T09:00");
  assert.equal(moved.draft.endLocal, "2026-06-16T10:30");
  const movedInstant = Temporal.ZonedDateTime.from(
    `${moved.draft.startLocal}[${moved.timeZone}]`,
  ).toInstant();
  assert.equal(movedInstant.toZonedDateTimeISO("UTC").toPlainDateTime().toString({ smallestUnit: "minute" }), "2026-06-16T13:00");
});

test("all-day movement preserves the exclusive range length", () => {
  const event = {
    id: "all-day-1",
    kind: "all-day",
    title: "Reading week",
    details: null,
    revision: 2,
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2024-02-28",
    endDate: "2024-03-02",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const moved = moveCalendarEventDraft(event, "2024-03-01", null, "UTC");

  assert.equal(moved.ok, true);
  assert.equal(moved.draft.startDate, "2024-03-01");
  assert.equal(moved.draft.endDate, "2024-03-04");
});

test("time-grid movement maps real 23-hour and 25-hour calendar days", () => {
  const event = timedEvent({ date: "2026-03-07" });
  const spring = moveCalendarEventDraft(event, "2026-03-08", 150, "America/Toronto");
  const fallEarlier = moveCalendarEventDraft(event, "2026-11-01", 90, "America/Toronto");
  const fallLater = moveCalendarEventDraft(event, "2026-11-01", 150, "America/Toronto");

  assert.equal(spring.ok, true);
  assert.equal(spring.draft.startLocal, "2026-03-08T03:30");
  assert.equal(fallEarlier.ok, true);
  assert.equal(fallEarlier.draft.startLocal, "2026-11-01T01:30");
  assert.equal(fallEarlier.draft.startDisambiguation, "earlier");
  assert.equal(fallLater.ok, true);
  assert.equal(fallLater.draft.startLocal, "2026-11-01T01:30");
  assert.equal(fallLater.draft.startDisambiguation, "later");
});

test("date-only movement refuses a gap or repeated local wall time", () => {
  const springEvent = timedEvent({ date: "2026-03-07", start: "02:30", end: "03:30" });
  const fallEvent = timedEvent({ date: "2026-10-31", start: "01:30", end: "02:30" });
  const gap = moveCalendarEventDraft(springEvent, "2026-03-08", null, "America/Toronto");
  const repeated = moveCalendarEventDraft(fallEvent, "2026-11-01", null, "America/Toronto");

  assert.equal(gap.ok, false);
  assert.match(gap.message, /does not exist/);
  assert.equal(repeated.ok, false);
  assert.match(repeated.message, /occurs twice/);
});

test("series occurrences require the explicit series editor", () => {
  const event = timedEvent({
    recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
  });
  const moved = moveCalendarEventDraft(event, "2026-06-16", 615, "America/Toronto");

  assert.equal(moved.ok, false);
  assert.match(moved.message, /repeating series/);
});

test("resize changes the end slot while preserving the start and event timezone", () => {
  const event = timedEvent({ start: "09:00", end: "10:30" });
  const resized = resizeCalendarEventDraft(event, "2026-06-15", 690, "America/Toronto");

  assert.equal(resized.ok, true);
  assert.equal(resized.timeZone, "America/Toronto");
  assert.equal(resized.draft.startLocal, "2026-06-15T09:00");
  assert.equal(resized.draft.endLocal, "2026-06-15T11:30");
});

test("resize converts a calendar-zone end slot into the event's timezone", () => {
  const event = timedEvent({ start: "09:00", end: "10:30" });
  const resized = resizeCalendarEventDraft(event, "2026-06-15", 900, "UTC");

  assert.equal(resized.ok, true);
  assert.equal(resized.draft.endLocal, "2026-06-15T11:00");
});

test("resize preserves the chosen fall-back occurrence", () => {
  const event = timedEvent({ date: "2026-11-01", start: "00:30", end: "02:30" });
  const resized = resizeCalendarEventDraft(event, "2026-11-01", 150, "America/Toronto");

  assert.equal(resized.ok, true);
  assert.equal(resized.draft.endLocal, "2026-11-01T01:30");
  assert.equal(resized.draft.endDisambiguation, "later");
});

test("resize matches the server's 366-day duration limit", () => {
  const event = timedEvent({ timeZone: "UTC", start: "09:00", end: "10:30" });
  const maximum = resizeCalendarEventDraft(event, "2027-06-16", 540, "UTC");
  const tooLong = resizeCalendarEventDraft(event, "2027-06-16", 555, "UTC");

  assert.equal(maximum.ok, true);
  assert.equal(maximum.draft.endLocal, "2027-06-16T09:00");
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.message, /366 days/);
});

test("resize rejects short, negative, off-grid, all-day, and recurring changes", () => {
  const event = timedEvent({ start: "09:00", end: "10:30" });
  assert.equal(resizeCalendarEventDraft(event, "2026-06-15", 525, "UTC").ok, false);
  assert.equal(resizeCalendarEventDraft(event, "2026-06-15", 540, "UTC").ok, false);
  assert.equal(resizeCalendarEventDraft(event, "2026-06-15", 547, "UTC").ok, false);
  assert.equal(resizeCalendarEventDraft(event, "2026-06-15", null, "UTC").ok, false);
  assert.equal(resizeCalendarEventDraft(event, "invalid", 600, "UTC").ok, false);
  assert.equal(resizeCalendarEventDraft({ kind: "all-day" }, "2026-06-15", 600, "UTC").ok, false);
  assert.equal(resizeCalendarEventDraft(timedEvent({ recurrenceRule: { frequency: "weekly", interval: 1, count: 3 } }), "2026-06-15", 600, "UTC").ok, false);
});
