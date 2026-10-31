import assert from "node:assert/strict";
import test from "node:test";
import { expandCalendarRecurrenceRange } from "./recurrence-range.ts";

const metadata = {
  id: "de305d54-75b4-431b-adb2-eb6b9e546014",
  title: "Recurring study session",
  details: null,
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("expands a window wider than one slice and keeps chronological order", () => {
  const occurrences = expandCalendarRecurrenceRange({
    ...metadata,
    kind: "all-day",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
  }, { frequency: "daily", interval: 1, count: 110 }, {
    fromDate: "2026-01-01",
    toDate: "2026-04-21",
  });

  assert.equal(occurrences.length, 110);
  assert.equal(occurrences[0].startDate, "2026-01-01");
  assert.equal(occurrences.at(-1).startDate, "2026-04-20");
  assert.deepEqual(
    occurrences.map(({ occurrenceKey }) => occurrenceKey),
    [...new Set(occurrences.map(({ occurrenceKey }) => occurrenceKey))],
  );
});

test("de-duplicates a long occurrence returned by slices on both sides of a boundary", () => {
  const occurrences = expandCalendarRecurrenceRange({
    ...metadata,
    kind: "all-day",
    startDate: "2026-01-01",
    endDate: "2026-01-08",
  }, { frequency: "daily", interval: 1, count: 100 }, {
    fromDate: "2026-01-01",
    toDate: "2026-04-20",
  });

  const boundaryCrossing = occurrences.filter(({ startDate }) => startDate === "2026-04-03");
  assert.equal(boundaryCrossing.length, 1);
  assert.equal(boundaryCrossing[0].endDate, "2026-04-10");
});

test("expands timed occurrences across slices in a different zone and DST season", () => {
  const occurrences = expandCalendarRecurrenceRange({
    ...metadata,
    kind: "timed",
    startLocal: "2026-01-01T00:30",
    endLocal: "2026-01-08T00:30",
    timeZone: "America/Montreal",
    startsAt: "2026-01-01T05:30:00.000Z",
    endsAt: "2026-01-08T05:30:00.000Z",
  }, { frequency: "daily", interval: 1, count: 100 }, {
    fromDate: "2026-01-01",
    toDate: "2026-04-05",
    timeZone: "UTC",
  });

  const boundaryCrossing = occurrences.filter(({ startLocal }) =>
    startLocal === "2026-04-03T00:30"
  );
  assert.equal(boundaryCrossing.length, 1);
  assert.equal(boundaryCrossing[0].timeZone, "America/Montreal");
  assert.equal(boundaryCrossing[0].startsAt, "2026-04-03T04:30:00Z");
});

test("uses half-open boundaries so an occurrence ending at the window start is excluded", () => {
  const occurrences = expandCalendarRecurrenceRange({
    ...metadata,
    kind: "all-day",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
  }, { frequency: "daily", interval: 1, count: 3 }, {
    fromDate: "2026-01-02",
    toDate: "2026-01-03",
  });

  assert.deepEqual(occurrences.map(({ startDate }) => startDate), ["2026-01-02"]);
});

test("allows a maximum-horizon series with maximum event duration across the maximum window", () => {
  const occurrences = expandCalendarRecurrenceRange({
    ...metadata,
    kind: "all-day",
    startDate: "2026-01-01",
    endDate: "2026-01-08",
  }, { frequency: "daily", interval: 1, count: 366 }, {
    fromDate: "2026-01-01",
    toDate: "2027-01-09",
  });

  assert.equal(occurrences.length, 366);
  assert.equal(occurrences.at(-1).startDate, "2027-01-01");
  assert.equal(occurrences.at(-1).endDate, "2027-01-08");
});

test("retains occurrences that begin before the requested window but overlap it", () => {
  const occurrences = expandCalendarRecurrenceRange({
    ...metadata,
    kind: "all-day",
    startDate: "2026-01-01",
    endDate: "2026-01-08",
  }, { frequency: "daily", interval: 1, count: 5 }, {
    fromDate: "2026-01-05",
    toDate: "2026-01-07",
  });

  assert.deepEqual(occurrences.map(({ startDate }) => startDate), [
    "2026-01-01",
    "2026-01-02",
    "2026-01-03",
    "2026-01-04",
    "2026-01-05",
  ]);
});

test("rejects unsupported read bounds before returning any partial results", () => {
  assert.throws(() => expandCalendarRecurrenceRange({
    ...metadata,
    kind: "all-day",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
  }, { frequency: "daily", interval: 1, count: 2 }, {
    fromDate: "2026-01-01",
    toDate: "2027-01-15",
  }), /must span 1 to 373 dates/u);
});

test("propagates a later-in-series validation failure instead of returning a partial window", () => {
  assert.throws(() => expandCalendarRecurrenceRange({
    ...metadata,
    kind: "all-day",
    startDate: "9998-12-30",
    endDate: "9999-01-06",
  }, { frequency: "daily", interval: 1, count: 366 }, {
    fromDate: "9998-12-30",
    toDate: "9999-04-01",
  }), /invalid dates or times/u);
});

test("requires an explicit calendar zone for timed recurrence reads", () => {
  assert.throws(() => expandCalendarRecurrenceRange({
    ...metadata,
    kind: "timed",
    startLocal: "2026-03-07T09:00",
    endLocal: "2026-03-07T10:00",
    timeZone: "America/Montreal",
    startsAt: "2026-03-07T14:00:00.000Z",
    endsAt: "2026-03-07T15:00:00.000Z",
  }, { frequency: "daily", interval: 1, count: 3 }, {
    fromDate: "2026-03-07",
    toDate: "2026-03-10",
  }), /require a calendar time zone/u);
});
