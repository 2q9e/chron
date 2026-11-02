import assert from "node:assert/strict";
import test from "node:test";
import { CalendarReminderError, scheduleCalendarReminder } from "./reminders.ts";

function timed(startLocal, startsAt, timeZone = "America/Toronto") {
  return {
    occurrenceKey: `event:${startLocal}`,
    kind: "timed",
    startLocal,
    startsAt,
    timeZone,
  };
}

function allDay(startDate) {
  return {
    occurrenceKey: `event:${startDate}`,
    kind: "all-day",
    startDate,
  };
}

test("no reminder creates no schedule", () => {
  assert.equal(scheduleCalendarReminder("none", timed("2026-03-08T09:00", "2026-03-08T13:00:00Z")), null);
  assert.equal(scheduleCalendarReminder("none", allDay("2026-03-08")), null);
});

test("minute offsets are elapsed-time offsets across a DST transition", () => {
  const schedule = scheduleCalendarReminder(
    "30-minutes-before",
    timed("2026-03-08T09:00", "2026-03-08T13:00:00Z"),
  );

  assert.deepEqual(schedule, {
    occurrenceKey: "event:2026-03-08T09:00",
    scheduledAt: "2026-03-08T12:30:00Z",
    timeZone: "America/Toronto",
  });
});

test("every timed minute-offset choice resolves to its configured instant", () => {
  const occurrence = timed("2026-03-08T09:00", "2026-03-08T13:00:00Z");
  const expected = [
    ["at-start", "2026-03-08T13:00:00Z"],
    ["5-minutes-before", "2026-03-08T12:55:00Z"],
    ["10-minutes-before", "2026-03-08T12:50:00Z"],
    ["15-minutes-before", "2026-03-08T12:45:00Z"],
    ["30-minutes-before", "2026-03-08T12:30:00Z"],
    ["60-minutes-before", "2026-03-08T12:00:00Z"],
  ];

  for (const [choice, instant] of expected) {
    assert.equal(scheduleCalendarReminder(choice, occurrence)?.scheduledAt, instant);
  }
});

test("one local day before preserves wall time across spring-forward", () => {
  const schedule = scheduleCalendarReminder(
    "one-local-day-before",
    timed("2026-03-08T09:00", "2026-03-08T13:00:00Z"),
  );

  assert.equal(schedule?.scheduledAt, "2026-03-07T14:00:00Z");
});

test("a nonexistent previous-day wall time moves forward by the DST gap", () => {
  const schedule = scheduleCalendarReminder(
    "one-local-day-before",
    timed("2026-03-09T02:30", "2026-03-09T06:30:00Z"),
  );

  assert.equal(schedule?.scheduledAt, "2026-03-08T07:30:00Z");
});

test("an ambiguous previous-day wall time chooses its earlier occurrence", () => {
  const schedule = scheduleCalendarReminder(
    "one-local-day-before",
    timed("2026-11-02T01:30", "2026-11-02T06:30:00Z"),
  );

  assert.equal(schedule?.scheduledAt, "2026-11-01T05:30:00Z");
});

test("all-day reminders use the captured calendar timezone", () => {
  const schedule = scheduleCalendarReminder(
    "previous-day-9am",
    allDay("2026-03-08"),
    "America/Toronto",
  );

  assert.deepEqual(schedule, {
    occurrenceKey: "event:2026-03-08",
    scheduledAt: "2026-03-07T14:00:00Z",
    timeZone: "America/Toronto",
  });
});

test("event-day all-day reminders use 9 AM on the first date", () => {
  const schedule = scheduleCalendarReminder(
    "event-day-9am",
    allDay("2026-03-08"),
    "America/Toronto",
  );

  assert.equal(schedule?.scheduledAt, "2026-03-08T13:00:00Z");
});

test("reminder types cannot be mixed across timed and all-day events", () => {
  assert.throws(
    () => scheduleCalendarReminder("event-day-9am", timed("2026-03-08T09:00", "2026-03-08T13:00:00Z")),
    CalendarReminderError,
  );
  assert.throws(
    () => scheduleCalendarReminder("at-start", allDay("2026-03-08"), "America/Toronto"),
    CalendarReminderError,
  );
});

test("all-day reminders require a valid captured zone", () => {
  assert.throws(
    () => scheduleCalendarReminder("event-day-9am", allDay("2026-03-08")),
    CalendarReminderError,
  );
  assert.throws(
    () => scheduleCalendarReminder("previous-day-9am", allDay("2026-03-08"), "Not/AZone"),
    CalendarReminderError,
  );
});

test("timed schedule rejects mismatched instant and local time", () => {
  assert.throws(
    () => scheduleCalendarReminder(
      "at-start",
      timed("2026-03-08T09:00", "2026-03-08T14:00:00Z"),
    ),
    CalendarReminderError,
  );
});
