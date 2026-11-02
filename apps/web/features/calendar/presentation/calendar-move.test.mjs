import assert from "node:assert/strict";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import { expandCalendarRecurrence } from "../domain/recurrence.ts";
import {
  calendarMinuteAtPointer,
  calendarMoveScope,
  calendarMoveSnapMinutes,
  calendarOccurrenceMoveSource,
  moveCalendarEventDraft,
  resizeCalendarEventDraft,
  updateCalendarOccurrenceMoveDraft,
} from "./calendar-move.ts";
import { buildEventDraft, validateCalendarEventDraft } from "./calendar-model.ts";

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

test("recurring occurrence movement uses the selected instance and exposes its scope", () => {
  const series = timedEvent({
    date: "2026-10-25",
    start: "01:30",
    end: "02:30",
    recurrenceRule: { frequency: "weekly", interval: 1, count: 2 },
  });
  const occurrence = {
    id: "event-1:2026-10-25T01:30",
    seriesId: series.id,
    occurrenceKey: "2026-10-25T01:30",
    title: series.title,
    details: series.details,
    revision: series.revision,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
    series,
    kind: "timed",
    startLocal: "2026-10-25T01:30",
    endLocal: "2026-10-25T02:30",
    timeZone: series.timeZone,
    startsAt: "2026-10-25T05:30:00Z",
    endsAt: "2026-10-25T06:30:00Z",
  };
  const source = calendarOccurrenceMoveSource(occurrence);
  const draft = source ? buildEventDraft(source) : null;

  assert.equal(calendarMoveScope(occurrence), "occurrence");
  assert.equal(calendarMoveScope(series), "series");
  assert.equal(calendarMoveScope(timedEvent()), "event");
  assert.notEqual(source, null);
  assert.equal(source.startLocal, occurrence.startLocal);
  assert.equal(source.endLocal, occurrence.endLocal);
  assert.equal(source.recurrenceRule, series.recurrenceRule);
  assert.equal(source.timeZone, occurrence.timeZone);
  assert.equal(source.startsAt, occurrence.startsAt);
  assert.equal(draft?.startLocal, occurrence.startLocal);
  assert.equal(draft?.startDisambiguation, "");
  assert.equal(series.startLocal, "2026-10-25T01:30");
  assert.equal(calendarOccurrenceMoveSource({ ...occurrence, kind: "all-day" }), null);

  const changedFold = updateCalendarOccurrenceMoveDraft(draft, occurrence, "startLocal", "2026-11-01T01:30");
  assert.equal(changedFold.startDisambiguation, "");
  assert.match(validateCalendarEventDraft(changedFold, series.timeZone).errors.startDisambiguation, /Choose the earlier or later/u);
  const laterFold = updateCalendarOccurrenceMoveDraft(changedFold, occurrence, "startDisambiguation", "later");
  assert.equal(laterFold.endLocal, "2026-11-01T02:30");
  assert.equal(validateCalendarEventDraft(laterFold, series.timeZone).ok, true);

  const gap = updateCalendarOccurrenceMoveDraft(draft, occurrence, "startLocal", "2026-03-08T02:30");
  assert.match(validateCalendarEventDraft(gap, series.timeZone).errors.startLocal, /does not exist/u);
});

test("moving an all-day occurrence shifts the end date by the original duration", () => {
  const series = {
    id: "all-day-series",
    kind: "all-day",
    title: "Study block",
    details: null,
    revision: 4,
    recurrenceRule: { frequency: "weekly", interval: 1, count: 2 },
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2026-03-01",
    endDate: "2026-03-03",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const occurrence = {
    id: "all-day-series:2026-03-08",
    seriesId: series.id,
    occurrenceKey: "2026-03-08",
    title: series.title,
    details: series.details,
    revision: series.revision,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
    series,
    kind: "all-day",
    startDate: "2026-03-08",
    endDate: "2026-03-10",
  };
  const source = calendarOccurrenceMoveSource(occurrence);
  const draft = source ? buildEventDraft(source) : null;
  assert.notEqual(draft, null);
  const moved = updateCalendarOccurrenceMoveDraft(draft, occurrence, "startDate", "2026-03-15");

  assert.equal(moved.startDate, "2026-03-15");
  assert.equal(moved.endDate, "2026-03-17");
  assert.equal(series.startDate, "2026-03-01");
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

test("moving a timed series prepares a finite whole-series update", () => {
  const rule = { frequency: "weekly", interval: 1, count: 4 };
  const event = timedEvent({
    recurrenceRule: rule,
  });
  const moved = moveCalendarEventDraft(event, "2026-06-16", 615, "America/Toronto");

  assert.equal(moved.ok, true);
  assert.equal(moved.draft.startLocal, "2026-06-16T10:15");
  assert.equal(moved.draft.endLocal, "2026-06-16T11:45");
  assert.equal(moved.draft.repeatFrequency, "weekly");
  assert.equal(moved.draft.repeatInterval, "1");
  assert.equal(moved.draft.repeatCount, "4");

  const reviewed = validateCalendarEventDraft(moved.draft, moved.timeZone);
  assert.equal(reviewed.ok, true);
  assert.deepEqual(reviewed.recurrenceRule, rule);
  assert.equal(reviewed.mutation.startLocal, "2026-06-16T10:15");
  const proposedEvent = {
    ...event,
    ...reviewed.mutation,
    startsAt: Temporal.ZonedDateTime.from(
      `${reviewed.mutation.startLocal}[${event.timeZone}]`,
    ).toInstant().toString(),
    endsAt: Temporal.ZonedDateTime.from(
      `${reviewed.mutation.endLocal}[${event.timeZone}]`,
    ).toInstant().toString(),
  };
  const occurrences = expandCalendarRecurrence(
    proposedEvent,
    reviewed.recurrenceRule,
    { fromDate: "2026-06-16", toDate: "2026-07-16", timeZone: "America/Toronto" },
  );
  assert.deepEqual(occurrences.map((occurrence) => occurrence.startLocal), [
    "2026-06-16T10:15",
    "2026-06-23T10:15",
    "2026-06-30T10:15",
    "2026-07-07T10:15",
  ]);
});

test("moving an all-day series preserves its date-only duration and finite rule", () => {
  const rule = { frequency: "weekly", interval: 2, count: 5 };
  const event = {
    id: "series-all-day",
    kind: "all-day",
    title: "Study block",
    details: null,
    revision: 3,
    recurrenceRule: rule,
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2024-02-28",
    endDate: "2024-03-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const moved = moveCalendarEventDraft(event, "2024-03-01", null, "UTC");

  assert.equal(moved.ok, true);
  assert.equal(moved.draft.startDate, "2024-03-01");
  assert.equal(moved.draft.endDate, "2024-03-03");
  assert.equal(moved.draft.repeatFrequency, "weekly");
  assert.equal(moved.draft.repeatInterval, "2");
  assert.equal(moved.draft.repeatCount, "5");

  const reviewed = validateCalendarEventDraft(moved.draft, moved.timeZone);
  assert.equal(reviewed.ok, true);
  assert.deepEqual(reviewed.recurrenceRule, rule);
  assert.equal(reviewed.mutation.startDate, "2024-03-01");
  const occurrences = expandCalendarRecurrence(
    { ...event, ...reviewed.mutation },
    reviewed.recurrenceRule,
    { fromDate: "2024-03-01", toDate: "2024-04-01" },
  );
  assert.deepEqual(occurrences.map((occurrence) => occurrence.startDate), [
    "2024-03-01",
    "2024-03-15",
    "2024-03-29",
  ]);
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
