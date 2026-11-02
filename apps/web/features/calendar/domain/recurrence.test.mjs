import assert from "node:assert/strict";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  RecurrenceError,
  expandCalendarRecurrence,
  normalizeRecurrenceRule,
} from "./recurrence.ts";

const metadata = {
  id: "series-1",
  title: "Study session",
  details: null,
  revision: 1,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

function allDayEvent(startDate, endDate, overrides = {}) {
  return {
    ...metadata,
    kind: "all-day",
    startDate,
    endDate,
    ...overrides,
  };
}

function timedEvent({
  startLocal,
  endLocal,
  startsAt,
  endsAt,
  timeZone = "America/New_York",
  overrides = {},
}) {
  return {
    ...metadata,
    kind: "timed",
    startLocal,
    endLocal,
    timeZone,
    startsAt,
    endsAt,
    ...overrides,
  };
}

function expand(series, rule, fromDate, toDate, timeZone) {
  return expandCalendarRecurrence(series, rule, {
    fromDate,
    toDate,
    ...(timeZone === undefined ? {} : { timeZone }),
  });
}

function assertRecurrenceError(action, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof RecurrenceError);
    assert.equal(error.code, code);
    return true;
  });
}

test("normalizes only the finite daily/weekly recurrence shape", () => {
  const input = { frequency: "weekly", interval: 2, count: 12 };
  const normalized = normalizeRecurrenceRule(input);
  assert.deepEqual(normalized, input);
  assert.notEqual(normalized, input);
  assert.ok(Object.isFrozen(normalized));

  for (const invalid of [
    null,
    [],
    { frequency: "monthly", interval: 1, count: 2 },
    { frequency: "daily", interval: 0, count: 2 },
    { frequency: "daily", interval: 5, count: 2 },
    { frequency: "daily", interval: 1.5, count: 2 },
    { frequency: "daily", interval: 1, count: 367 },
    { frequency: "daily", interval: 1, count: 2, until: "2025-01-01" },
    { frequency: "daily", interval: 1 },
  ]) {
    assertRecurrenceError(() => normalizeRecurrenceRule(invalid), "INVALID_RULE");
  }

  let getterWasRead = false;
  const accessorRule = { frequency: "daily", interval: 1, count: 2 };
  Object.defineProperty(accessorRule, "count", {
    enumerable: true,
    get() {
      getterWasRead = true;
      return 2;
    },
  });
  assertRecurrenceError(() => normalizeRecurrenceRule(accessorRule), "INVALID_RULE");
  assert.equal(getterWasRead, false);
});

test("recurring occurrences inherit categories and preserve missing legacy categories", () => {
  const categorized = expand(
    allDayEvent("2026-06-01", "2026-06-02", { category: "assignment" }),
    { frequency: "weekly", interval: 1, count: 2 },
    "2026-06-01",
    "2026-06-15",
  );
  const legacy = expand(
    allDayEvent("2026-06-01", "2026-06-02"),
    { frequency: "weekly", interval: 1, count: 2 },
    "2026-06-01",
    "2026-06-15",
  );

  assert.deepEqual(categorized.map(({ category }) => category), ["assignment", "assignment"]);
  assert.deepEqual(legacy.map(({ category }) => category), [undefined, undefined]);
  assert.ok(legacy.every((occurrence) => !Object.hasOwn(occurrence, "category")));
});

test("accepts a single-occurrence segment after a recurring-series split", () => {
  assert.deepEqual(
    normalizeRecurrenceRule({ frequency: "weekly", interval: 1, count: 1 }),
    { frequency: "weekly", interval: 1, count: 1 },
  );
});

test("expands daily and weekly date-only rules on the DTSTART weekday", () => {
  const daily = expand(
    allDayEvent("2025-04-01", "2025-04-03"),
    { frequency: "daily", interval: 2, count: 4 },
    "2025-04-03",
    "2025-04-09",
  );
  assert.deepEqual(daily.map(({ startDate, endDate }) => [startDate, endDate]), [
    ["2025-04-03", "2025-04-05"],
    ["2025-04-05", "2025-04-07"],
    ["2025-04-07", "2025-04-09"],
  ]);
  assert.deepEqual(daily.map(({ occurrenceKey }) => occurrenceKey), [
    "series-1:2025-04-03",
    "series-1:2025-04-05",
    "series-1:2025-04-07",
  ]);

  const weekly = expand(
    allDayEvent("2025-01-08", "2025-01-09"),
    { frequency: "weekly", interval: 2, count: 3 },
    "2025-01-01",
    "2025-02-10",
  );
  assert.deepEqual(weekly.map(({ startDate }) => startDate), [
    "2025-01-08",
    "2025-01-22",
    "2025-02-05",
  ]);
});

test("advances all-day events by calendar dates through leap days and months", () => {
  const occurrences = expand(
    allDayEvent("2024-02-28", "2024-03-01"),
    { frequency: "daily", interval: 1, count: 4 },
    "2024-02-27",
    "2024-03-04",
  );
  assert.deepEqual(occurrences.map(({ startDate, endDate }) => [startDate, endDate]), [
    ["2024-02-28", "2024-03-01"],
    ["2024-02-29", "2024-03-02"],
    ["2024-03-01", "2024-03-03"],
    ["2024-03-02", "2024-03-04"],
  ]);
});

test("uses half-open overlap for date-only windows", () => {
  const series = allDayEvent("2025-01-01", "2025-01-03");
  assert.deepEqual(
    expand(series, { frequency: "daily", interval: 2, count: 2 }, "2025-01-02", "2025-01-03")
      .map(({ startDate }) => startDate),
    ["2025-01-01"],
  );
  assert.deepEqual(
    expand(series, { frequency: "daily", interval: 2, count: 2 }, "2025-01-03", "2025-01-04")
      .map(({ startDate }) => startDate),
    ["2025-01-03"],
  );
  assert.deepEqual(
    expand(series, { frequency: "daily", interval: 2, count: 2 }, "2025-01-01", "2025-01-02"),
    [
      {
        seriesId: "series-1",
        occurrenceKey: "series-1:2025-01-01",
        title: "Study session",
        details: null,
        revision: 1,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        kind: "all-day",
        startDate: "2025-01-01",
        endDate: "2025-01-03",
      },
    ],
  );
});

test("rejects a nonexistent DTSTART and skips generated spring-gap starts", () => {
  const nonexistentStart = timedEvent({
    startLocal: "2025-03-09T02:30",
    endLocal: "2025-03-09T03:30",
    startsAt: "2025-03-09T07:30:00Z",
    endsAt: "2025-03-09T08:30:00Z",
  });
  assertRecurrenceError(
    () => expand(nonexistentStart, { frequency: "daily", interval: 1, count: 2 }, "2025-03-09", "2025-03-11", "America/New_York"),
    "INVALID_SERIES",
  );

  const beforeGap = timedEvent({
    startLocal: "2025-03-08T02:30",
    endLocal: "2025-03-08T03:30",
    startsAt: "2025-03-08T07:30:00Z",
    endsAt: "2025-03-08T08:30:00Z",
  });
  const occurrences = expand(
    beforeGap,
    { frequency: "daily", interval: 1, count: 3 },
    "2025-03-08",
    "2025-03-12",
    "America/New_York",
  );
  assert.deepEqual(occurrences.map(({ startLocal }) => startLocal), [
    "2025-03-08T02:30",
    "2025-03-10T02:30",
    "2025-03-11T02:30",
  ]);
  assert.deepEqual(occurrences.map(({ occurrenceKey }) => occurrenceKey), [
    "series-1:2025-03-08T02:30",
    "series-1:2025-03-10T02:30",
    "series-1:2025-03-11T02:30",
  ]);
});

test("preserves exact elapsed duration across the spring transition", () => {
  const series = timedEvent({
    startLocal: "2025-03-08T01:30",
    endLocal: "2025-03-08T03:30",
    startsAt: "2025-03-08T06:30:00Z",
    endsAt: "2025-03-08T08:30:00Z",
  });
  const [occurrence] = expand(
    series,
    { frequency: "daily", interval: 1, count: 2 },
    "2025-03-09",
    "2025-03-10",
    "America/New_York",
  );
  assert.equal(occurrence.startLocal, "2025-03-09T01:30");
  assert.equal(occurrence.endLocal, "2025-03-09T04:30");
  assert.equal(
    Temporal.Instant.from(occurrence.endsAt).epochNanoseconds -
      Temporal.Instant.from(occurrence.startsAt).epochNanoseconds,
    BigInt(2 * 60 * 60) * BigInt(1_000_000_000),
  );
});

test("preserves generated end seconds across historical second-offset changes", () => {
  const series = timedEvent({
    startLocal: "1972-01-06T23:30",
    endLocal: "1972-01-07T01:00",
    startsAt: "1972-01-07T00:14:30Z",
    endsAt: "1972-01-07T01:00:00Z",
    timeZone: "Africa/Monrovia",
  });
  const occurrences = expand(
    series,
    { frequency: "daily", interval: 1, count: 2 },
    "1972-01-07",
    "1972-01-08",
    "Africa/Monrovia",
  );
  const occurrence = occurrences.find(({ startLocal }) => startLocal === "1972-01-07T23:30");
  assert.ok(occurrence);
  assert.equal(occurrence.startLocal, "1972-01-07T23:30");
  assert.equal(occurrence.endLocal, "1972-01-08T00:15:30");
  assert.equal(occurrence.endsAt, "1972-01-08T00:15:30Z");
});

test("uses the series fold preference for generated repeated starts", () => {
  const earlierPreference = timedEvent({
    startLocal: "2025-11-01T01:30",
    endLocal: "2025-11-01T02:30",
    startsAt: "2025-11-01T05:30:00Z",
    endsAt: "2025-11-01T06:30:00Z",
  });
  const [earlierOccurrence] = expand(
    earlierPreference,
    { frequency: "daily", interval: 1, count: 2 },
    "2025-11-02",
    "2025-11-03",
    "America/New_York",
  );
  assert.equal(earlierOccurrence.startsAt, "2025-11-02T05:30:00Z");

  const laterPreference = timedEvent({
    startLocal: "2025-11-02T01:30",
    endLocal: "2025-11-02T02:30",
    startsAt: "2025-11-02T06:30:00Z",
    endsAt: "2025-11-02T07:30:00Z",
  });
  const [laterOccurrence] = expand(
    laterPreference,
    { frequency: "weekly", interval: 1, count: 53 },
    "2026-11-01",
    "2026-11-02",
    "America/New_York",
  );
  assert.equal(laterOccurrence.startLocal, "2026-11-01T01:30");
  assert.equal(laterOccurrence.startsAt, "2026-11-01T06:30:00Z");
});

test("uses timed half-open overlap and accepts a 93-day range", () => {
  const series = timedEvent({
    startLocal: "2025-04-01T09:00",
    endLocal: "2025-04-01T10:00",
    startsAt: "2025-04-01T13:00:00Z",
    endsAt: "2025-04-01T14:00:00Z",
  });
  assert.deepEqual(
    expand(series, { frequency: "daily", interval: 1, count: 2 }, "2025-04-02", "2025-04-03", "America/New_York")
      .map(({ startLocal }) => startLocal),
    ["2025-04-02T09:00"],
  );
  assert.deepEqual(
    expand(series, { frequency: "daily", interval: 1, count: 2 }, "2025-04-03", "2025-04-04", "America/New_York"),
    [],
  );
  assert.deepEqual(
    expand(series, { frequency: "daily", interval: 1, count: 2 }, "2025-01-01", "2025-04-04", "America/New_York")
      .map(({ startLocal }) => startLocal),
    ["2025-04-01T09:00", "2025-04-02T09:00"],
  );
});

test("rejects invalid or oversized windows and recurring durations", () => {
  const allDay = allDayEvent("2025-01-01", "2025-01-09");
  assertRecurrenceError(
    () => expand(allDay, { frequency: "daily", interval: 1, count: 2 }, "2025-01-01", "2025-01-02"),
    "INVALID_SERIES",
  );
  assertRecurrenceError(
    () => expand(allDayEvent("2025-01-01", "2025-01-02"), { frequency: "daily", interval: 1, count: 2 }, "2025-01-01", "2025-04-05"),
    "RANGE_TOO_LARGE",
  );
  assertRecurrenceError(
    () => expand(allDayEvent("2025-01-01", "2025-01-02"), { frequency: "daily", interval: 1, count: 2 }, "2025-02-01", "2025-01-01"),
    "INVALID_RANGE",
  );
  assertRecurrenceError(
    () => expand(allDayEvent("2025-01-01", "2025-01-02"), { frequency: "daily", interval: 1, count: 2 }, "2025-01-01", "2025-01-02", "Not/AZone"),
    "INVALID_RANGE",
  );
});

test("rejects an unsupported generated end date even outside the requested window", () => {
  const series = timedEvent({
    startLocal: "9999-12-26T23:00",
    endLocal: "9999-12-31T23:00",
    startsAt: "9999-12-26T23:00:00Z",
    endsAt: "9999-12-31T23:00:00Z",
    timeZone: "UTC",
  });
  assertRecurrenceError(
    () => expand(
      series,
      { frequency: "daily", interval: 1, count: 2 },
      "9999-12-26",
      "9999-12-27",
      "UTC",
    ),
    "INVALID_SERIES",
  );
});

test("accepts the 366-date boundary and rejects horizon and skipped-gap overflow", () => {
  const boundary = expand(
    allDayEvent("2024-01-01", "2024-01-02"),
    { frequency: "daily", interval: 1, count: 366 },
    "2024-01-01",
    "2024-04-03",
  );
  assert.equal(boundary.length, 93);

  assertRecurrenceError(
    () => expand(
      allDayEvent("2025-01-01", "2025-01-02"),
      { frequency: "daily", interval: 4, count: 93 },
      "2025-01-01",
      "2025-01-02",
    ),
    "HORIZON_EXCEEDED",
  );

  const springGap = timedEvent({
    startLocal: "2025-03-08T02:30",
    endLocal: "2025-03-08T03:30",
    startsAt: "2025-03-08T07:30:00Z",
    endsAt: "2025-03-08T08:30:00Z",
  });
  assertRecurrenceError(
    () => expand(
      springGap,
      { frequency: "daily", interval: 1, count: 366 },
      "2025-03-08",
      "2025-03-09",
      "America/New_York",
    ),
    "HORIZON_EXCEEDED",
  );
});
