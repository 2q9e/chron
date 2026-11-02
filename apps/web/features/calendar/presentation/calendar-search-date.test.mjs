import assert from "node:assert/strict";
import test from "node:test";
import { calendarSearchEventDateLabel } from "./calendar-search-date.ts";

const timedEvent = {
  id: "tokyo-event",
  title: "Review",
  details: null,
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  kind: "timed",
  reminderChoice: "none",
  startLocal: "2026-03-01T09:30",
  endLocal: "2026-03-01T10:30",
  timeZone: "Asia/Tokyo",
  startsAt: "2026-03-01T00:30:00.000Z",
  endsAt: "2026-03-01T01:30:00.000Z",
};

test("formats timed search results in the calendar display zone", () => {
  const displayTimeZone = "America/Montreal";
  const label = calendarSearchEventDateLabel(timedEvent, "en-US", displayTimeZone);
  const formatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: displayTimeZone,
  });

  assert.equal(
    label,
    `${formatter.format(new Date(timedEvent.startsAt))} – ${formatter.format(new Date(timedEvent.endsAt))} · ${displayTimeZone}`,
  );
  assert.match(label, /Feb 28/u);
  assert.doesNotMatch(label, /Asia\/Tokyo/u);
});

test("keeps all-day search results date-only regardless of display zone", () => {
  const event = {
    id: "all-day-event",
    title: "Reading week",
    details: null,
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    kind: "all-day",
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2026-01-10",
    endDate: "2026-01-13",
  };

  assert.equal(
    calendarSearchEventDateLabel(event, "en-US", "America/Montreal"),
    "Jan 10, 2026 – Jan 12, 2026",
  );
});

test("falls back to the stored instants without mislabeling them when formatting fails", () => {
  assert.equal(
    calendarSearchEventDateLabel(timedEvent, "invalid_locale", "invalid/zone"),
    `${timedEvent.startsAt} – ${timedEvent.endsAt}`,
  );
});
