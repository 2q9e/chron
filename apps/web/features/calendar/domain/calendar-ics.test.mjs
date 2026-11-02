import assert from "node:assert/strict";
import test from "node:test";
import { buildCalendarIcs } from "./calendar-ics.ts";

const exportedAt = new Date("2026-11-02T18:45:00.000Z");

test("exports timed events as UTC and escapes untrusted text", () => {
  const calendar = buildCalendarIcs([{
    id: "123e4567-e89b-42d3-a456-426614174000",
    kind: "timed",
    title: "Exam; final, written\\review\nNext line",
    details: "Bring, notes; no\\sharing\r\nRoom 5",
    revision: 2,
    reminderChoice: "none",
    startLocal: "2026-11-02T09:30",
    endLocal: "2026-11-02T10:45",
    timeZone: "America/Montreal",
    startsAt: "2026-11-02T09:30:00-05:00",
    endsAt: "2026-11-02T10:45:00-05:00",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }], exportedAt);

  assert.match(calendar, /DTSTAMP:20261102T184500Z\r\n/u);
  assert.match(calendar, /DTSTART:20261102T143000Z\r\n/u);
  assert.match(calendar, /DTEND:20261102T154500Z\r\n/u);
  assert.doesNotMatch(calendar, /TZID=/u);
  assert.match(calendar, /SUMMARY:Exam\\; final\\, written\\\\review\\nNext line\r\n/u);
  assert.match(calendar, /DESCRIPTION:Bring\\, notes\\; no\\\\sharing\\nRoom 5\r\n/u);
  assert.doesNotMatch(calendar, /CATEGORIES:/u);
  assert.ok(calendar.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(calendar.endsWith("END:VCALENDAR\r\n"));
});

test("keeps all-day values date-only and preserves their exclusive end", () => {
  const calendar = buildCalendarIcs([{
    id: "123e4567-e89b-42d3-a456-426614174001",
    kind: "all-day",
    title: "Study break",
    category: "assignment",
    details: null,
    revision: 1,
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2026-11-05",
    endDate: "2026-11-08",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }], exportedAt);

  assert.match(calendar, /DTSTART;VALUE=DATE:20261105\r\n/u);
  assert.match(calendar, /DTEND;VALUE=DATE:20261108\r\n/u);
  assert.match(calendar, /CATEGORIES:Assignment\r\n/u);
  assert.doesNotMatch(calendar, /DTSTART:20261105T/u);
});

test("exports only known explicit categories with their display labels", () => {
  const event = {
    id: "123e4567-e89b-42d3-a456-426614174005",
    kind: "all-day",
    title: "Category check",
    details: null,
    revision: 1,
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2026-11-05",
    endDate: "2026-11-06",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const categories = [
    ["class", "Class"],
    ["assignment", "Assignment"],
    ["exam", "Exam"],
    ["study", "Study"],
    ["personal", "Personal"],
    ["other", "Other"],
  ];

  for (const [category, label] of categories) {
    const calendar = buildCalendarIcs([{ ...event, category }], exportedAt);
    assert.match(calendar, new RegExp(`^CATEGORIES:${label}\\r$`, "mu"));
  }

  for (const candidate of [event, { ...event, category: null }, { ...event, category: "unrecognized" }]) {
    const calendar = buildCalendarIcs([candidate], exportedAt);
    assert.doesNotMatch(calendar, /CATEGORIES:/u);
  }
});

test("exports moved recurrence instances as separate stable events", () => {
  const series = {
    id: "123e4567-e89b-42d3-a456-426614174002",
    kind: "timed",
    title: "Weekly seminar",
    details: null,
    category: "class",
    revision: 4,
    recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
    reminderChoice: "none",
    startLocal: "2026-11-02T09:00",
    endLocal: "2026-11-02T10:00",
    timeZone: "America/Montreal",
    startsAt: "2026-11-02T14:00:00.000Z",
    endsAt: "2026-11-02T15:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const occurrence = (date, startsAt, endsAt) => ({
    id: `${series.id}:${date}`,
    seriesId: series.id,
    occurrenceKey: `${series.id}:${date}`,
    kind: "timed",
    title: series.title,
    details: null,
    category: series.category,
    revision: series.revision,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
    series,
    startLocal: `${date}T09:00`,
    endLocal: `${date}T10:00`,
    timeZone: "America/Montreal",
    startsAt,
    endsAt,
  });
  const calendar = buildCalendarIcs([
    occurrence("2026-11-09", "2026-11-09T14:00:00.000Z", "2026-11-09T15:00:00.000Z"),
    occurrence("2026-11-02", "2026-11-02T14:00:00.000Z", "2026-11-02T15:00:00.000Z"),
  ], exportedAt);

  const ids = calendar.match(/^UID:.+$/gmu);
  assert.equal(ids?.length, 2);
  assert.notEqual(ids?.[0], ids?.[1]);
  assert.equal(calendar.match(/^CATEGORIES:Class$/gmu)?.length, 2);
  assert.ok(calendar.indexOf("DTSTART:20261102T140000Z") < calendar.indexOf("DTSTART:20261109T140000Z"));
  assert.doesNotMatch(calendar, /RRULE:/u);
});

test("folds UTF-8 content lines at no more than 75 octets", () => {
  const title = "Révision d'été " + "épreuve ".repeat(14);
  const calendar = buildCalendarIcs([{
    id: "123e4567-e89b-42d3-a456-426614174003",
    kind: "all-day",
    title,
    details: null,
    revision: 1,
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2026-11-05",
    endDate: "2026-11-06",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }], exportedAt);

  for (const line of calendar.split("\r\n").filter(Boolean)) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `${Buffer.byteLength(line, "utf8")} octets: ${line}`);
  }
  const unfolded = calendar.replace(/\r\n[ \t]/gu, "");
  assert.ok(unfolded.includes(`SUMMARY:${title}`));
});

test("rejects duplicate event instances and invalid dates instead of corrupting the export", () => {
  const event = {
    id: "123e4567-e89b-42d3-a456-426614174004",
    kind: "all-day",
    title: "One day",
    details: null,
    revision: 1,
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2026-11-05",
    endDate: "2026-11-06",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.throws(() => buildCalendarIcs([event, event], exportedAt), /duplicate event instance/u);
  assert.throws(() => buildCalendarIcs([{ ...event, startDate: "2026-02-30" }], exportedAt));
  assert.throws(() => buildCalendarIcs([{ ...event, endDate: "2026-11-05" }], exportedAt), /positive duration/u);
  assert.throws(() => buildCalendarIcs([{ ...event, endDate: "2026-11-04" }], exportedAt), /positive duration/u);
  assert.throws(() => buildCalendarIcs([{ ...event, title: "One\u0001day" }], exportedAt), /control characters/u);
});
