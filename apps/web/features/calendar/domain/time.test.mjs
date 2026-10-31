import assert from "node:assert/strict";
import test from "node:test";
import { Temporal } from "@js-temporal/polyfill";
import {
  CalendarTimeError,
  calendarToday,
  inspectLocalDateTime,
  parseCalendarDate,
  resolveAllDayRange,
  resolveCalendarRange,
  resolveLocalDateTime,
} from "./time.ts";

test("rejects invalid calendar dates and fixed-offset timezone values", () => {
  assert.throws(() => parseCalendarDate("2026-02-30"), {
    code: "INVALID_DATE",
  });
  assert.throws(() => parseCalendarDate("0000-01-01"), {
    code: "INVALID_DATE",
  });
  assert.throws(() => resolveCalendarRange(
    "2026-10-01",
    "2026-10-08",
    "+05:00",
  ), {
    code: "INVALID_TIME_ZONE",
  });
});

test("computes Today in the selected calendar timezone", () => {
  const instant = Temporal.Instant.from("2026-10-31T02:30:00Z");

  assert.equal(calendarToday("America/Montreal", instant), "2026-10-30");
  assert.equal(calendarToday("Europe/London", instant), "2026-10-31");
});

test("identifies nonexistent spring-forward wall times", () => {
  assert.deepEqual(
    inspectLocalDateTime("2026-03-08T02:30", "America/Toronto"),
    { kind: "gap" },
  );
  assert.throws(() => resolveLocalDateTime(
    "2026-03-08T02:30",
    "America/Toronto",
  ), {
    code: "NONEXISTENT_LOCAL_TIME",
  });
});

test("requires a deliberate choice for repeated fall-back wall times", () => {
  const result = inspectLocalDateTime("2026-11-01T01:30", "America/Toronto");
  assert.equal(result.kind, "ambiguous");
  if (result.kind !== "ambiguous") return;

  assert.notEqual(result.earlier, result.later);
  assert.throws(() => resolveLocalDateTime(
    "2026-11-01T01:30",
    "America/Toronto",
  ), {
    code: "AMBIGUOUS_LOCAL_TIME",
  });
  assert.equal(resolveLocalDateTime(
    "2026-11-01T01:30",
    "America/Toronto",
    "later",
  ).instant, result.later);
});

test("resolves a date range across a 23-hour daylight-saving day", () => {
  const range = resolveCalendarRange(
    "2026-03-08",
    "2026-03-09",
    "America/Toronto",
  );

  assert.equal(range.startsAt, "2026-03-08T05:00:00Z");
  assert.equal(range.endsAt, "2026-03-09T04:00:00Z");
});

test("keeps all-day event bounds as exclusive calendar dates", () => {
  assert.deepEqual(resolveAllDayRange("2026-11-02", "2026-11-04"), {
    startDate: "2026-11-02",
    endDate: "2026-11-04",
  });
  assert.throws(() => resolveAllDayRange("2026-11-02", "2026-11-02"), {
    code: "INVALID_DATE_RANGE",
  });
});

test("time errors remain typed for safe route mapping", () => {
  assert.throws(() => resolveCalendarRange(
    "2026-10-08",
    "2026-10-01",
    "UTC",
  ), (error) => error instanceof CalendarTimeError && error.code === "INVALID_DATE_RANGE");
});
