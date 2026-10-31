import assert from "node:assert/strict";
import test from "node:test";
import { CalendarTimeError } from "../domain/time.ts";
import { CalendarRouteError } from "./errors.ts";
import {
  errorResponse,
} from "./errors.ts";
import {
  exactQueryValues,
  eventEtag,
  parseRevisionPrecondition,
  readCalendarJson,
  requireSameOriginMutation,
} from "./http.ts";
import {
  parseCalendarEventMutation,
  parseCalendarEventCommit,
  parseCalendarConflictCheck,
  parseCalendarPreferences,
  validateCalendarEventId,
} from "./validation.ts";

const validTimedEvent = {
  kind: "timed",
  title: "Study session",
  startLocal: "2026-10-30T09:00",
  endLocal: "2026-10-30T10:00",
  timeZone: "America/Montreal",
};

test("accepts a valid timed event and normalizes optional details", () => {
  assert.deepEqual(parseCalendarEventMutation({
    ...validTimedEvent,
    details: "  Review chapter 4  ",
  }), {
    ...validTimedEvent,
    details: "Review chapter 4",
  });
});

test("rejects unknown event fields, blank titles, and oversized content", () => {
  assert.throws(
    () => parseCalendarEventMutation({ ...validTimedEvent, userId: "another-user" }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
  assert.throws(
    () => parseCalendarEventMutation({ ...validTimedEvent, title: "  " }),
    (error) => error instanceof CalendarRouteError && error.code === "INVALID_CALENDAR_FIELDS",
  );
  assert.throws(
    () => parseCalendarEventMutation({ ...validTimedEvent, title: "x".repeat(161) }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
  assert.throws(
    () => parseCalendarEventMutation({ ...validTimedEvent, details: "x".repeat(4001) }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
});

test("requires an explicit choice for repeated local times", () => {
  assert.throws(
    () => parseCalendarEventMutation({
      ...validTimedEvent,
      startLocal: "2026-11-01T01:30",
      endLocal: "2026-11-01T02:30",
    }),
    (error) => error instanceof CalendarTimeError && error.code === "AMBIGUOUS_LOCAL_TIME",
  );

  const event = parseCalendarEventMutation({
    ...validTimedEvent,
    startLocal: "2026-11-01T01:30",
    endLocal: "2026-11-01T02:30",
    startDisambiguation: "later",
  });
  assert.equal(event.kind, "timed");
});

test("keeps all-day bounds date-only and end-exclusive", () => {
  assert.deepEqual(parseCalendarEventMutation({
    kind: "all-day",
    title: "Exam week",
    startDate: "2026-11-02",
    endDate: "2026-11-09",
  }), {
    kind: "all-day",
    title: "Exam week",
    startDate: "2026-11-02",
    endDate: "2026-11-09",
  });
  assert.throws(
    () => parseCalendarEventMutation({
      kind: "all-day",
      title: "Exam week",
      startDate: "2026-11-09",
      endDate: "2026-11-09",
    }),
    (error) => error instanceof CalendarTimeError && error.code === "INVALID_DATE_RANGE",
  );
});

test("validates the complete persisted preference contract", () => {
  assert.deepEqual(parseCalendarPreferences({
    theme: "high-contrast",
    density: "compact",
    weekStartsOn: 1,
    timeZone: "America/Montreal",
  }), {
    theme: "high-contrast",
    density: "compact",
    weekStartsOn: 1,
    timeZone: "America/Montreal",
  });
  assert.throws(
    () => parseCalendarPreferences({
      theme: "high-contrast",
      density: "compact",
      weekStartsOn: 8,
      timeZone: "America/Montreal",
    }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
});

test("validates conflict checks against a calendar zone and owned event id", () => {
  const id = "de305d54-75b4-431b-adb2-eb6b9e546014";
  assert.deepEqual(parseCalendarConflictCheck({
    event: validTimedEvent,
    calendarTimeZone: "America/Montreal",
    excludeEventId: id,
  }), {
    event: validTimedEvent,
    calendarTimeZone: "America/Montreal",
    excludeEventId: id,
  });
  assert.throws(
    () => parseCalendarConflictCheck({ event: validTimedEvent, calendarTimeZone: "America/Montreal", ownerId: "other" }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
  assert.throws(
    () => parseCalendarConflictCheck({ event: validTimedEvent, calendarTimeZone: "America/Montreal", excludeEventId: 1 }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
});

test("requires a bounded, unique conflict snapshot for event approval", () => {
  assert.deepEqual(parseCalendarEventCommit({
    event: validTimedEvent,
    calendarTimeZone: "America/Montreal",
    reviewedConflicts: [],
  }), {
    event: validTimedEvent,
    calendarTimeZone: "America/Montreal",
    reviewedConflicts: [],
  });
  const conflict = { id: "de305d54-75b4-431b-adb2-eb6b9e546014", revision: 2 };
  assert.deepEqual(parseCalendarEventCommit({
    event: validTimedEvent,
    calendarTimeZone: "America/Montreal",
    reviewedConflicts: [conflict],
  }).reviewedConflicts, [conflict]);
  assert.throws(
    () => parseCalendarEventCommit({
      event: validTimedEvent,
      calendarTimeZone: "America/Montreal",
      reviewedConflicts: [conflict, conflict],
    }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
});

test("rejects unsupported, duplicate, and missing range query fields", () => {
  const url = new URL("https://chron.example/api/calendar/events?from=2026-10-30&to=2026-10-31&timeZone=UTC");
  assert.deepEqual(exactQueryValues(url, ["from", "to", "timeZone"]), {
    from: "2026-10-30",
    to: "2026-10-31",
    timeZone: "UTC",
  });
  assert.throws(
    () => exactQueryValues(new URL(`${url}&from=2026-10-31`), ["from", "to", "timeZone"]),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
  assert.throws(
    () => exactQueryValues(new URL(`${url}&ownerId=other`), ["from", "to", "timeZone"]),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
});

test("bounds JSON bodies and preserves the too-large error status", async () => {
  const response = await readCalendarJson(new Request("https://chron.example/api/calendar/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": "2" },
    body: "{}",
  }));
  assert.deepEqual(response, {});

  await assert.rejects(
    readCalendarJson(new Request("https://chron.example/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: " ".repeat(24 * 1024 + 1),
    })),
    (error) => error instanceof CalendarRouteError && error.status === 413,
  );

  const responseForError = errorResponse(new CalendarRouteError(413, "PAYLOAD_TOO_LARGE", "Too large."));
  assert.equal(responseForError.status, 413);
  assert.equal(responseForError.headers.get("cache-control"), "private, no-store");
});

test("allows only exact configured origins for mutations", () => {
  const request = new Request("https://chron.example/api/calendar/events", {
    method: "POST",
    headers: { origin: "https://chron.example" },
  });
  assert.doesNotThrow(() => requireSameOriginMutation(request, "https://chron.example"));
  assert.throws(
    () => requireSameOriginMutation(new Request(request.url, {
      method: "POST",
      headers: { origin: "https://other.example" },
    }), "https://chron.example"),
    (error) => error instanceof CalendarRouteError && error.status === 403,
  );
  assert.throws(
    () => requireSameOriginMutation(new Request(request.url, { method: "POST" }), "https://chron.example"),
    (error) => error instanceof CalendarRouteError && error.status === 403,
  );
});

test("requires event revisions and validates opaque identifiers", () => {
  assert.equal(parseRevisionPrecondition('"9"'), 9);
  assert.equal(eventEtag(10), '"10"');
  assert.throws(
    () => parseRevisionPrecondition(null),
    (error) => error instanceof CalendarRouteError && error.status === 428,
  );
  assert.throws(
    () => parseRevisionPrecondition('"9", "10"'),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
  assert.equal(validateCalendarEventId("de305d54-75b4-431b-adb2-eb6b9e546014"), "de305d54-75b4-431b-adb2-eb6b9e546014");
  assert.throws(
    () => validateCalendarEventId("not-an-id"),
    (error) => error instanceof CalendarRouteError && error.status === 404,
  );
});
