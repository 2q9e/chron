import assert from "node:assert/strict";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  allDayEventsForDate,
  buildEventDraft,
  newEventDraft,
  newEventDraftAtTimeSlot,
  reminderReviewText,
  timedEventSegmentsForDate,
  updateEventDraft,
  validateCalendarEventDraft,
} from "./calendar-model.ts";

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

test("time-slot creation starts at the snapped local slot and defaults to one elapsed hour", () => {
  const draft = newEventDraftAtTimeSlot("2026-06-15", 615, "America/Toronto");

  assert.equal(draft?.startLocal, "2026-06-15T10:15");
  assert.equal(draft?.endLocal, "2026-06-15T11:15");
  assert.equal(draft?.kind, "timed");
  assert.equal(draft?.title, "");
});

test("time-slot creation skips the spring-forward gap using elapsed day time", () => {
  const draft = newEventDraftAtTimeSlot("2026-03-08", 150, "America/Toronto");

  assert.equal(draft?.startLocal, "2026-03-08T03:30");
  assert.equal(draft?.endLocal, "2026-03-08T04:30");
  assert.equal(draft?.startDisambiguation, "");
});

test("time-slot creation distinguishes both occurrences in a fall-back fold", () => {
  const earlier = newEventDraftAtTimeSlot("2026-11-01", 90, "America/Toronto");
  const later = newEventDraftAtTimeSlot("2026-11-01", 150, "America/Toronto");

  assert.equal(earlier?.startLocal, "2026-11-01T01:30");
  assert.equal(earlier?.startDisambiguation, "earlier");
  assert.equal(earlier?.endLocal, "2026-11-01T01:30");
  assert.equal(earlier?.endDisambiguation, "later");
  assert.equal(later?.startLocal, "2026-11-01T01:30");
  assert.equal(later?.startDisambiguation, "later");
  assert.equal(later?.endLocal, "2026-11-01T02:30");

  const start = Temporal.ZonedDateTime.from(
    `${earlier?.startLocal}[America/Toronto]`,
    { disambiguation: "earlier" },
  ).toInstant();
  const end = Temporal.ZonedDateTime.from(
    `${earlier?.endLocal}[America/Toronto]`,
    { disambiguation: "later" },
  ).toInstant();
  assert.equal(end.epochMilliseconds - start.epochMilliseconds, 60 * 60 * 1000);
});

test("time-slot creation rejects dates, zones, and offsets outside the day", () => {
  assert.equal(newEventDraftAtTimeSlot("not-a-date", 0, "UTC"), null);
  assert.equal(newEventDraftAtTimeSlot("2026-06-15", 10, "UTC"), null);
  assert.equal(newEventDraftAtTimeSlot("2026-06-15", -15, "UTC"), null);
  assert.equal(newEventDraftAtTimeSlot("2026-06-15", 1440, "UTC"), null);
  assert.equal(newEventDraftAtTimeSlot("2026-03-08", 1380, "America/Toronto"), null);
});

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
  assert.equal(timeline.dayDurationMinutes, 23 * 60);
  assert.ok(Math.abs(after.topRem - before.topRem - (5 / 60) * 2.75) < 1e-9);
  assert.ok(before.leftPercent + before.widthPercent <= after.leftPercent);
});

test("the fall-back day exposes both repeated hours and its full duration", () => {
  const timeline = timedEventSegmentsForDate([], "2026-11-01", "America/Toronto", "en-US");

  assert.equal(timeline.trackHeightRem, 25 * 2.75);
  assert.equal(timeline.dayDurationMinutes, 25 * 60);
  assert.equal(timeline.hourLabels.length, 25);
  assert.equal(timeline.hourLabels.filter((label) => label.startsWith("1 AM")).length, 2);
});

test("new event drafts default to one-off and accept a finite weekly series", () => {
  const draft = newEventDraft("2026-06-15");
  assert.equal(draft.repeatFrequency, "");
  assert.equal(draft.reminderChoice, "none");

  const reviewed = validateCalendarEventDraft({
    ...draft,
    title: "Seminar",
    repeatFrequency: "weekly",
    repeatInterval: "2",
    repeatCount: "5",
  }, "UTC");

  assert.equal(reviewed.ok, true);
  assert.deepEqual(reviewed.recurrenceRule, {
    frequency: "weekly",
    interval: 2,
    count: 5,
  });
  assert.equal(reviewed.mutation.reminderChoice, "none");
});

test("all-day reminder choices persist the calendar zone and reject timed choices", () => {
  const draft = newEventDraft("2026-06-15");
  const event = validateCalendarEventDraft({
    ...draft,
    kind: "all-day",
    title: "Exam",
    reminderChoice: "previous-day-9am",
  }, "America/Montreal");
  assert.equal(event.ok, true);
  assert.deepEqual(event.mutation, {
    kind: "all-day",
    title: "Exam",
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    reminderChoice: "previous-day-9am",
    reminderTimeZone: "America/Montreal",
  });

  const invalid = validateCalendarEventDraft({
    ...draft,
    kind: "all-day",
    title: "Exam",
    reminderChoice: "15-minutes-before",
  }, "America/Montreal");
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.reminderChoice, /all-day event/u);
});

test("changing event type clears an incompatible reminder and accepts only known types", () => {
  const timed = { ...newEventDraft("2026-06-15"), reminderChoice: "15-minutes-before" };
  const allDay = updateEventDraft(timed, "kind", "all-day");
  assert.equal(allDay.kind, "all-day");
  assert.equal(allDay.reminderChoice, "none");
  assert.equal(updateEventDraft(allDay, "kind", "invalid"), allDay);
});

test("timed event reminder review shows the exact local delivery time", () => {
  const draft = newEventDraft("2026-11-10");
  const event = validateCalendarEventDraft({
    ...draft,
    title: "Exam",
    startLocal: "2026-11-10T09:00",
    endLocal: "2026-11-10T10:00",
    reminderChoice: "15-minutes-before",
  }, "America/Montreal");
  assert.equal(event.ok, true);
  assert.equal(event.mutation.reminderChoice, "15-minutes-before");
  assert.match(reminderReviewText(event.mutation), /8:45 AM \(America\/Montreal\)/u);
});

test("all-day reminder review uses the captured zone and previous calendar date", () => {
  const text = reminderReviewText({
    kind: "all-day",
    title: "Exam",
    startDate: "2026-11-10",
    endDate: "2026-11-11",
    reminderChoice: "previous-day-9am",
    reminderTimeZone: "America/Montreal",
  });
  assert.match(text, /Monday, November 9, 2026 at 9:00 AM/u);
  assert.match(text, /America\/Montreal/u);
});

test("recurrence validation enforces the finite horizon and seven-day event cap", () => {
  const draft = newEventDraft("2026-06-15");
  const outsideHorizon = validateCalendarEventDraft({
    ...draft,
    title: "Seminar",
    repeatFrequency: "weekly",
    repeatInterval: "4",
    repeatCount: "15",
  }, "UTC");
  assert.equal(outsideHorizon.ok, false);
  assert.match(outsideHorizon.errors.repeatCount, /366 calendar dates/u);

  const longAllDay = validateCalendarEventDraft({
    ...draft,
    kind: "all-day",
    title: "Conference",
    startDate: "2026-06-15",
    endDate: "2026-06-23",
    repeatFrequency: "daily",
    repeatInterval: "1",
    repeatCount: "2",
  }, "UTC");
  assert.equal(longAllDay.ok, false);
  assert.match(longAllDay.errors.repeatFrequency, /up to 7 days/u);
});

test("editing a recurring root retains its original series dates and rule", () => {
  const draft = buildEventDraft({
    id: "series-root",
    kind: "all-day",
    title: "Seminar",
    details: null,
    revision: 2,
    startDate: "2026-06-15",
    endDate: "2026-06-16",
    reminderChoice: "previous-day-9am",
    reminderTimeZone: "America/Montreal",
    recurrenceRule: { frequency: "weekly", interval: 1, count: 8 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(draft.startDate, "2026-06-15");
  assert.equal(draft.endDate, "2026-06-16");
  assert.equal(draft.repeatFrequency, "weekly");
  assert.equal(draft.repeatCount, "8");
  assert.equal(draft.reminderChoice, "previous-day-9am");
});
