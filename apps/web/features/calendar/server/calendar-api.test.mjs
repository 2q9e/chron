import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CalendarTimeError } from "../domain/time.ts";
import {
  CalendarRouteError,
  calendarSearchTimeoutError,
  errorResponse,
} from "./errors.ts";
import { CalendarRepository } from "./repository.ts";
import {
  calendarJson,
  exactQueryValues,
  eventEtag,
  parseRevisionPrecondition,
  readCalendarJson,
  requireSameOriginMutation,
} from "./http.ts";
import {
  parseCalendarEventMutation,
  parseCalendarEventCreateRequest,
  parseCalendarEventCommit,
  parseCalendarConflictCheck,
  parseCalendarIdempotencyKey,
  parseCalendarEventSearchRequest,
  parseCalendarSeriesDraftRequest,
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

const validSeriesRule = { frequency: "weekly", interval: 1, count: 6 };
const validSeriesCreate = {
  action: "create",
  scope: "series",
  event: validTimedEvent,
  recurrenceRule: validSeriesRule,
  calendarTimeZone: "America/Montreal",
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

test("normalizes exact create and update series draft scopes", () => {
  assert.deepEqual(parseCalendarSeriesDraftRequest(validSeriesCreate), {
    ...validSeriesCreate,
    event: validTimedEvent,
    recurrenceRule: validSeriesRule,
  });

  const target = {
    targetEventId: "de305d54-75b4-431b-adb2-eb6b9e546014",
    targetRevision: 3,
  };
  assert.deepEqual(parseCalendarSeriesDraftRequest({
    action: "update",
    scope: "series",
    ...target,
    event: validTimedEvent,
    recurrenceRule: validSeriesRule,
    calendarTimeZone: "America/Montreal",
  }), {
    action: "update",
    scope: "series",
    ...target,
    event: validTimedEvent,
    recurrenceRule: validSeriesRule,
    calendarTimeZone: "America/Montreal",
  });

  assert.deepEqual(parseCalendarSeriesDraftRequest({
    action: "delete",
    scope: "series",
    ...target,
  }), {
    action: "delete",
    scope: "series",
    ...target,
  });
});

test("requires a finite supported rule, exact series scope, and current target revision", () => {
  const target = {
    action: "delete",
    scope: "series",
    targetEventId: "de305d54-75b4-431b-adb2-eb6b9e546014",
    targetRevision: 1,
  };
  const invalidRequests = [
    { ...validSeriesCreate, scope: "occurrence" },
    { ...validSeriesCreate, ownerId: "another-user" },
    { ...validSeriesCreate, recurrenceRule: { ...validSeriesRule, until: "2027-01-01" } },
    { ...validSeriesCreate, recurrenceRule: { frequency: "monthly", interval: 1, count: 2 } },
    { ...validSeriesCreate, recurrenceRule: { frequency: "daily", interval: 1, count: 367 } },
    { ...validSeriesCreate, recurrenceRule: { frequency: "weekly", interval: 1, count: 54 } },
    { ...validSeriesCreate, calendarTimeZone: "Not/AZone" },
    { ...target, targetEventId: "not-a-uuid" },
    { ...target, targetRevision: 0 },
    { ...target, targetRevision: 1.5 },
    { ...target, proposalId: "client-controlled" },
  ];
  for (const input of invalidRequests) {
    assert.throws(
      () => parseCalendarSeriesDraftRequest(input),
      (error) => error instanceof CalendarRouteError || error instanceof CalendarTimeError,
    );
  }

  assert.throws(
    () => parseCalendarSeriesDraftRequest({
      ...validSeriesCreate,
      recurrenceRule: { frequency: "weekly", interval: 1, count: 54 },
    }),
    (error) => error instanceof CalendarRouteError &&
      error.message === "Repeating events must end within 366 calendar dates.",
  );
});

test("bounds recurring event duration while preserving the supported maximum", () => {
  assert.doesNotThrow(() => parseCalendarSeriesDraftRequest({
    ...validSeriesCreate,
    event: {
      kind: "all-day",
      title: "Study week",
      startDate: "2026-11-02",
      endDate: "2026-11-09",
    },
    recurrenceRule: { frequency: "daily", interval: 1, count: 366 },
  }));

  const tooLongAllDay = {
    ...validSeriesCreate,
    event: {
      kind: "all-day",
      title: "Study week",
      startDate: "2026-11-02",
      endDate: "2026-11-10",
    },
  };
  assert.throws(
    () => parseCalendarSeriesDraftRequest(tooLongAllDay),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );

  const tooLongTimed = {
    ...validSeriesCreate,
    event: {
      ...validTimedEvent,
      startLocal: "2026-11-02T09:00",
      endLocal: "2026-11-09T09:01",
    },
  };
  assert.throws(
    () => parseCalendarSeriesDraftRequest(tooLongTimed),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );

  assert.throws(
    () => parseCalendarSeriesDraftRequest({
      ...validSeriesCreate,
      event: {
        ...validTimedEvent,
        startLocal: "2026-03-07T02:30",
        endLocal: "2026-03-07T03:30",
      },
      recurrenceRule: { frequency: "daily", interval: 1, count: 366 },
    }),
    (error) => error instanceof CalendarRouteError &&
      error.message.includes("cannot be expanded"),
  );

  assert.throws(
    () => parseCalendarSeriesDraftRequest({
      ...validSeriesCreate,
      event: {
        kind: "all-day",
        title: "Year-end study",
        startDate: "9999-12-30",
        endDate: "9999-12-31",
      },
      recurrenceRule: { frequency: "daily", interval: 1, count: 2 },
    }),
    (error) => error instanceof CalendarRouteError &&
      error.message.includes("cannot be expanded"),
  );
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

test("validates exact calendar search fields and normalizes bounded Unicode text", () => {
  assert.deepEqual(parseCalendarEventSearchRequest({
    query: "  Révision de chimie  ",
    from: "2026-10-30",
    to: "2027-01-31",
    timeZone: "America/Montreal",
    kind: "timed",
  }), {
    query: "Révision de chimie",
    from: "2026-10-30",
    to: "2027-01-31",
    timeZone: "America/Montreal",
    kind: "timed",
  });
  assert.deepEqual(parseCalendarEventSearchRequest({
    query: "😀".repeat(120),
    from: "2026-10-30",
    to: "2026-10-31",
    timeZone: "UTC",
  }), {
    query: "😀".repeat(120),
    from: "2026-10-30",
    to: "2026-10-31",
    timeZone: "UTC",
  });

  const invalidSearches = [
    { query: "title", from: "2026-10-30", to: "2026-10-31", timeZone: "UTC", ownerId: "other" },
    { query: "   ", from: "2026-10-30", to: "2026-10-31", timeZone: "UTC" },
    { query: "😀".repeat(121), from: "2026-10-30", to: "2026-10-31", timeZone: "UTC" },
    { query: "Plan\nexam", from: "2026-10-30", to: "2026-10-31", timeZone: "UTC" },
    { query: "\u0085Plan", from: "2026-10-30", to: "2026-10-31", timeZone: "UTC" },
    { query: "\uD800", from: "2026-10-30", to: "2026-10-31", timeZone: "UTC" },
    { query: "Plan", from: "2026-10-30", to: "2026-10-31", timeZone: "Not/AZone" },
    { query: "Plan", from: "2026-10-30", to: "2027-02-01", timeZone: "UTC" },
    { query: "Plan", from: "2026-10-31", to: "2026-10-31", timeZone: "UTC" },
    { query: "Plan", from: "2026-10-30", to: "2026-10-31", timeZone: "UTC", kind: "other" },
  ];
  for (const input of invalidSearches) {
    assert.throws(
      () => parseCalendarEventSearchRequest(input),
      (error) => error instanceof CalendarRouteError || error instanceof CalendarTimeError,
    );
  }
});

test("search route authenticates a JSON body and uses private no-store responses", () => {
  const route = readFileSync(
    new URL("../../../app/api/calendar/events/search/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireSameOriginMutation/u);
  assert.match(route, /requireCalendarUser/u);
  assert.match(route, /readCalendarJson\(request\)/u);
  assert.match(route, /repository\.searchEvents\(userId, search\)/u);
  assert.match(route, /calendarJson\(\{ events \}\)/u);
  assert.match(route, /withCalendarErrors/u);
  assert.doesNotMatch(route, /searchParams|URLSearchParams|console\.(?:log|info|debug)/u);

  const response = calendarJson({ events: [] });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
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

test("maps search timeouts to a safe private no-store response", async () => {
  const response = errorResponse(calendarSearchTimeoutError());
  assert.equal(response.status, 504);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), {
    error: {
      code: "CALENDAR_SEARCH_TIMEOUT",
      message: "Search could not finish. Refine the title or date range and try again.",
    },
  });

  const databaseError = Object.assign(new Error("statement details"), { code: "57014" });
  const safeResponse = errorResponse(databaseError);
  assert.equal(safeResponse.status, 500);
  assert.deepEqual(await safeResponse.json(), {
    error: {
      code: "CALENDAR_REQUEST_FAILED",
      message: "The calendar request could not be completed.",
    },
  });
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
  assert.equal(validateCalendarEventId("DE305D54-75B4-431B-ADB2-EB6B9E546014"), "de305d54-75b4-431b-adb2-eb6b9e546014");
  assert.throws(
    () => validateCalendarEventId("not-an-id"),
    (error) => error instanceof CalendarRouteError && error.status === 404,
  );
});

class MemoryCalendarPool {
  events = new Map();
  requests = new Map();
  failCreateCompletion = false;
  failAbandonedReservation = false;

  async connect() {
    let ownerId;
    let snapshot;
    const cloneMap = (values, cloneValue = (value) => ({ ...value })) =>
      new Map([...values].map(([key, value]) => [key, cloneValue(value)]));
    return {
      query: async (sql, values = []) => {
        const statement = sql.replace(/\s+/gu, " ").trim();
        if (statement === "BEGIN") {
          snapshot = {
            events: cloneMap(this.events),
            requests: cloneMap(this.requests, (request) => ({
              ...request,
              request_hash: request.request_hash === null ? null : Buffer.from(request.request_hash),
            })),
          };
          return { rows: [] };
        }
        if (statement === "COMMIT") {
          snapshot = undefined;
          return { rows: [] };
        }
        if (statement === "ROLLBACK") {
          if (snapshot) {
            this.events = snapshot.events;
            this.requests = snapshot.requests;
            snapshot = undefined;
          }
          return { rows: [] };
        }
        if (statement.startsWith("SELECT set_config('chron.user_id'")) {
          ownerId = values[0];
          return { rows: [{ set_config: ownerId }] };
        }
        if (statement.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (statement.startsWith("SELECT encode(request_hash, 'hex')")) {
          const [queryOwnerId, key] = values;
          const request = this.requests.get(requestMapKey(queryOwnerId, key));
          if (!request || queryOwnerId !== ownerId) {
            return { rows: [] };
          }
          return {
            rows: [{
              request_hash: request.request_hash?.toString("hex") ?? null,
              event_id: request.event_id,
              state: request.state,
            }],
          };
        }
        if (statement.startsWith("INSERT INTO calendar_event_create_requests")) {
          if (statement.includes("'abandoned'")) {
            const [requestOwnerId, key] = values;
            if (this.failAbandonedReservation) return { rows: [] };
            const requestKey = requestMapKey(requestOwnerId, key);
            if (requestOwnerId !== ownerId || this.requests.has(requestKey)) return { rows: [] };
            this.requests.set(requestKey, {
              user_id: requestOwnerId,
              idempotency_key: key,
              request_hash: null,
              event_id: null,
              state: "abandoned",
            });
            return { rows: [{ idempotency_key: key }] };
          }
          const [requestOwnerId, key, requestHash, eventId] = values;
          const requestKey = requestMapKey(requestOwnerId, key);
          if (requestOwnerId !== ownerId || this.requests.has(requestKey)) return { rows: [] };
          this.requests.set(requestKey, {
            user_id: requestOwnerId,
            idempotency_key: key,
            request_hash: Buffer.from(requestHash),
            event_id: eventId,
            state: "pending",
          });
          return { rows: [{ idempotency_key: key }] };
        }
        if (statement.startsWith("UPDATE calendar_event_create_requests")) {
          if (
            statement.includes("SET state = 'deleted'")
            && statement.includes("WHERE user_id = $1 AND idempotency_key = $2")
          ) {
            const [requestOwnerId, key] = values;
            const request = this.requests.get(requestMapKey(requestOwnerId, key));
            if (request && requestOwnerId === ownerId && request.state === "complete") {
              request.state = "deleted";
              request.request_hash = null;
              request.event_id = null;
            }
            return { rows: [] };
          }
          if (statement.includes("SET state = 'complete'")) {
            if (this.failCreateCompletion) throw new Error("Injected create-result write failure.");
            const [requestOwnerId, key, eventId] = values;
            const request = this.requests.get(requestMapKey(requestOwnerId, key));
            if (
              !request || request.user_id !== requestOwnerId || requestOwnerId !== ownerId
              || request.event_id !== eventId || request.state !== "pending"
            ) return { rows: [] };
            request.state = "complete";
            return { rows: [{ idempotency_key: key }] };
          }
          if (statement.includes("SET state = 'deleted'")) {
            const [requestOwnerId, eventId] = values;
            for (const request of this.requests.values()) {
              if (
                request.user_id === requestOwnerId && request.user_id === ownerId
                && request.event_id === eventId && request.state === "complete"
              ) {
                request.state = "deleted";
                request.request_hash = null;
                request.event_id = null;
              }
            }
            return { rows: [] };
          }
        }
        if (statement.startsWith("SELECT time_zone FROM calendar_preferences")) {
          return { rows: [] };
        }
        if (
          statement.startsWith("SELECT id, kind,")
          && statement.includes("WHERE user_id = $1 AND id = $2::uuid")
        ) {
          const [queryOwnerId, eventId] = values;
          const row = this.events.get(eventId);
          return {
            rows: row && row.user_id === queryOwnerId && queryOwnerId === ownerId ? [row] : [],
          };
        }
        if (
          statement.startsWith("SELECT id, kind,")
          && statement.includes("FROM calendar_events")
          && statement.includes("WHERE user_id = $1")
          && !statement.includes("id <> $2::uuid")
          && !statement.includes("id = $2::uuid")
        ) {
          const [queryOwnerId] = values;
          return {
            rows: [...this.events.values()].filter((row) =>
              row.user_id === queryOwnerId && queryOwnerId === ownerId
            ),
          };
        }
        if (statement.includes("FROM calendar_events") && statement.includes("id <> $2::uuid")) {
          return { rows: [] };
        }
        if (statement.startsWith("SELECT recurrence_frequency FROM calendar_events")) {
          const [queryOwnerId, eventId] = values;
          const row = this.events.get(eventId);
          return {
            rows: row && row.user_id === queryOwnerId && queryOwnerId === ownerId
              ? [{ recurrence_frequency: row.recurrence_frequency ?? null }]
              : [],
          };
        }
        if (statement.startsWith("INSERT INTO calendar_events")) {
          const [id, rowOwnerId, title, details, startDate, endDate] = values;
          const now = "2026-10-30T12:00:00.000Z";
          const row = {
            id,
            user_id: rowOwnerId,
            kind: "all-day",
            title,
            details,
            revision: 1,
            start_local: null,
            end_local: null,
            time_zone: null,
            starts_at: null,
            ends_at: null,
            start_date: startDate,
            end_date: endDate,
            recurrence_frequency: null,
            recurrence_interval: null,
            recurrence_count: null,
            created_at: now,
            updated_at: now,
          };
          this.events.set(id, row);
          return { rows: [row] };
        }
        if (statement.startsWith("UPDATE calendar_events")) {
          const [queryOwnerId, eventId, expectedRevision, title, details, startDate, endDate] = values;
          const row = this.events.get(eventId);
          if (
            !row || row.user_id !== queryOwnerId || queryOwnerId !== ownerId
            || row.revision !== expectedRevision
          ) return { rows: [] };
          Object.assign(row, {
            title,
            details,
            start_date: startDate,
            end_date: endDate,
            revision: row.revision + 1,
            updated_at: "2026-10-30T13:00:00.000Z",
          });
          return { rows: [row] };
        }
        if (statement.startsWith("DELETE FROM calendar_events")) {
          const [queryOwnerId, eventId, revision] = values;
          const row = this.events.get(eventId);
          if (row && row.user_id === queryOwnerId && queryOwnerId === ownerId && row.revision === revision) {
            this.events.delete(eventId);
            return { rows: [{ id: eventId }] };
          }
          return { rows: [] };
        }
        if (statement.startsWith("SELECT revision FROM calendar_events")) {
          const [queryOwnerId, eventId] = values;
          const row = this.events.get(eventId);
          return {
            rows: row && row.user_id === queryOwnerId && queryOwnerId === ownerId
              ? [{ revision: row.revision }]
              : [],
          };
        }
        throw new Error(`Unhandled SQL in calendar test fixture: ${statement}`);
      },
      release: () => undefined,
    };
  }
}

function requestMapKey(ownerId, idempotencyKey) {
  return `${ownerId}\u0000${idempotencyKey}`;
}

function validAllDayCommit(title = "  Exam week  ", reviewedConflicts = [], calendarTimeZone = "America/Montreal") {
  return parseCalendarEventCommit({
    event: {
      kind: "all-day",
      title,
      details: "  Bring the approved notes  ",
      startDate: "2026-11-02",
      endDate: "2026-11-09",
    },
    calendarTimeZone,
    reviewedConflicts,
  });
}

function createCalendarEvent(repository, ownerId, key, commit) {
  return repository.createEvent(
    ownerId,
    commit.event,
    commit.calendarTimeZone,
    commit.reviewedConflicts,
    key,
  );
}

test("validates the Idempotency-Key header value", () => {
  assert.equal(parseCalendarIdempotencyKey("create-123._~"), "create-123._~");
  assert.throws(
    () => parseCalendarIdempotencyKey(null),
    (error) => error instanceof CalendarRouteError && error.code === "IDEMPOTENCY_KEY_REQUIRED",
  );
  assert.throws(
    () => parseCalendarIdempotencyKey("not safe/for header"),
    (error) => error instanceof CalendarRouteError && error.code === "INVALID_IDEMPOTENCY_KEY",
  );
  assert.throws(
    () => parseCalendarIdempotencyKey("x".repeat(129)),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
});

test("accepts reconciliation requests with only the opaque operation selector", () => {
  assert.deepEqual(parseCalendarEventCreateRequest({ operation: "reconcile" }), {
    operation: "reconcile",
  });
  assert.deepEqual(parseCalendarEventCreateRequest({
    event: validTimedEvent,
    calendarTimeZone: "America/Montreal",
    reviewedConflicts: [],
  }), {
    operation: "create",
    commit: {
      event: validTimedEvent,
      calendarTimeZone: "America/Montreal",
      reviewedConflicts: [],
    },
  });
  assert.throws(
    () => parseCalendarEventCreateRequest({ operation: "reconcile", event: validTimedEvent }),
    (error) => error instanceof CalendarRouteError && error.status === 400,
  );
});

test("sequential exact create retries replay the same response without another event", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const commit = validAllDayCommit();
  const created = await createCalendarEvent(repository, "owner-one", "create-1", commit);
  const replay = await createCalendarEvent(repository, "owner-one", "create-1", validAllDayCommit("Exam week"));

  assert.equal(created.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.event, created.event);
  assert.equal(replay.responseBody, created.responseBody);
  assert.equal(pool.events.size, 1);

  const firstResponse = calendarJson(JSON.parse(created.responseBody), {
    status: 201,
    headers: { ETag: `"${created.event.revision}"` },
  });
  const replayResponse = calendarJson(JSON.parse(replay.responseBody), {
    status: 201,
    headers: { ETag: `"${replay.event.revision}"` },
  });
  assert.equal(replayResponse.status, firstResponse.status);
  assert.equal(replayResponse.headers.get("etag"), firstResponse.headers.get("etag"));
  assert.equal(replayResponse.headers.get("cache-control"), "private, no-store");
  assert.equal(await replayResponse.text(), await firstResponse.text());
});

test("rejects same-owner key reuse when the normalized event or review snapshot changes", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  await createCalendarEvent(repository, "owner-one", "create-2", validAllDayCommit());

  await assert.rejects(
    createCalendarEvent(repository, "owner-one", "create-2", validAllDayCommit("Different title")),
    (error) => error instanceof CalendarRouteError && error.code === "IDEMPOTENCY_KEY_REUSED" && error.status === 409,
  );
  await assert.rejects(
    createCalendarEvent(repository, "owner-one", "create-2", validAllDayCommit("  Exam week  ", [
      { id: "de305d54-75b4-431b-adb2-eb6b9e546014", revision: 3 },
    ])),
    (error) => error instanceof CalendarRouteError && error.code === "IDEMPOTENCY_KEY_REUSED" && error.status === 409,
  );
  await assert.rejects(
    createCalendarEvent(repository, "owner-one", "create-2", validAllDayCommit("  Exam week  ", [], "UTC")),
    (error) => error instanceof CalendarRouteError && error.code === "IDEMPOTENCY_KEY_REUSED" && error.status === 409,
  );
  assert.equal(pool.events.size, 1);
});

test("the same opaque key is independent across owners", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const ownerOneCommit = validAllDayCommit("Owner one's exam");
  const ownerTwoCommit = validAllDayCommit("Owner two's exam");
  const ownerOneResult = await createCalendarEvent(repository, "owner-one", "create-3", ownerOneCommit);
  const ownerTwoResult = await createCalendarEvent(repository, "owner-two", "create-3", ownerTwoCommit);
  const ownerOneReplay = await createCalendarEvent(repository, "owner-one", "create-3", ownerOneCommit);
  const ownerTwoReplay = await createCalendarEvent(repository, "owner-two", "create-3", ownerTwoCommit);

  assert.equal(pool.events.size, 2);
  assert.equal(ownerOneReplay.responseBody, ownerOneResult.responseBody);
  assert.equal(ownerTwoReplay.responseBody, ownerTwoResult.responseBody);
  assert.notEqual(ownerOneReplay.event.id, ownerTwoReplay.event.id);
  assert.equal(pool.events.get(ownerOneResult.event.id).user_id, "owner-one");
  assert.equal(pool.events.get(ownerTwoResult.event.id).user_id, "owner-two");
});

test("rolls event and request reservation back together when recording the result fails", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const commit = validAllDayCommit();
  pool.failCreateCompletion = true;

  await assert.rejects(
    createCalendarEvent(repository, "owner-one", "create-4", commit),
    /Injected create-result write failure/u,
  );
  assert.equal(pool.events.size, 0);
  assert.equal(pool.requests.size, 0);

  pool.failCreateCompletion = false;
  const retry = await createCalendarEvent(repository, "owner-one", "create-4", commit);
  assert.equal(retry.replayed, false);
  assert.equal(pool.events.size, 1);
  assert.equal(pool.requests.get(requestMapKey("owner-one", "create-4")).state, "complete");
});

test("event deletion leaves only a tombstone against duplicate creation", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const commit = validAllDayCommit();
  const created = await createCalendarEvent(repository, "owner-one", "create-5", commit);

  await repository.deleteEvent("owner-one", created.event.id, created.event.revision);
  assert.equal(pool.events.size, 0);
  const request = pool.requests.get(requestMapKey("owner-one", "create-5"));
  assert.equal(request.state, "deleted");
  assert.equal(request.request_hash, null);
  assert.equal(request.event_id, null);
  assert.equal(Object.hasOwn(request, "response_body"), false);
  await assert.rejects(
    createCalendarEvent(repository, "owner-one", "create-5", commit),
    (error) => error instanceof CalendarRouteError && error.code === "CREATED_EVENT_DELETED" && error.status === 410,
  );
  assert.equal(pool.events.size, 0);
  assert.equal(pool.requests.size, 1);
});

test("round-trips recurrence rules and prevents single-event edits or deletes of a series", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const created = await createCalendarEvent(repository, "owner-one", "series-guard", validAllDayCommit());
  const stored = pool.events.get(created.event.id);
  Object.assign(stored, {
    recurrence_frequency: "weekly",
    recurrence_interval: 1,
    recurrence_count: 6,
  });

  const listed = await repository.listEvents(
    "owner-one",
    "2026-11-02",
    "2026-11-09",
    "America/Montreal",
  );
  assert.deepEqual(listed[0].recurrenceRule, {
    frequency: "weekly",
    interval: 1,
    count: 6,
  });

  await assert.rejects(
    repository.updateEvent(
      "owner-one",
      created.event.id,
      created.event.revision,
      validAllDayCommit("Edited once").event,
      "America/Montreal",
      [],
    ),
    (error) => error instanceof CalendarRouteError
      && error.code === "SERIES_SCOPE_REQUIRED"
      && error.status === 409,
  );
  await assert.rejects(
    repository.deleteEvent("owner-one", created.event.id, created.event.revision),
    (error) => error instanceof CalendarRouteError
      && error.code === "SERIES_SCOPE_REQUIRED"
      && error.status === 409,
  );
  assert.equal(stored.revision, created.event.revision);
  assert.equal(pool.events.size, 1);
});

test("reconciliation replays a saved result without requiring or storing event text", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const created = await createCalendarEvent(repository, "owner-one", "recover-1", validAllDayCommit());

  const recovered = await repository.reconcileEventCreate("owner-one", "recover-1");
  assert.equal(recovered.status, "found");
  assert.equal(recovered.result.replayed, true);
  assert.equal(recovered.result.responseBody, created.responseBody);
  assert.deepEqual(recovered.result.event, created.event);
  assert.equal(pool.events.size, 1);
});

test("create replay and reconciliation return current edited event details", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const commit = validAllDayCommit();
  const created = await createCalendarEvent(repository, "owner-one", "recover-edited", commit);
  const editedCommit = parseCalendarEventCommit({
    event: {
      kind: "all-day",
      title: "Updated exam week",
      details: "Updated room information",
      startDate: "2026-11-02",
      endDate: "2026-11-09",
    },
    calendarTimeZone: "America/Montreal",
    reviewedConflicts: [],
  });
  await repository.updateEvent(
    "owner-one",
    created.event.id,
    created.event.revision,
    editedCommit.event,
    editedCommit.calendarTimeZone,
    editedCommit.reviewedConflicts,
  );

  const replay = await createCalendarEvent(repository, "owner-one", "recover-edited", commit);
  const reconciled = await repository.reconcileEventCreate("owner-one", "recover-edited");
  assert.equal(replay.event.title, "Updated exam week");
  assert.equal(replay.event.details, "Updated room information");
  assert.equal(reconciled.status, "found");
  assert.equal(reconciled.result.event.title, "Updated exam week");
  assert.equal(reconciled.result.event.details, "Updated room information");
  assert.notEqual(replay.responseBody, created.responseBody);
});

test("missing reconciliation commits a payload-free tombstone against a late create", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const key = "recover-missing";

  assert.deepEqual(await repository.reconcileEventCreate("owner-one", key), { status: "not-found" });
  assert.deepEqual(pool.requests.get(requestMapKey("owner-one", key)), {
    user_id: "owner-one",
    idempotency_key: key,
    request_hash: null,
    event_id: null,
    state: "abandoned",
  });
  await assert.rejects(
    createCalendarEvent(repository, "owner-one", key, validAllDayCommit()),
    (error) => error instanceof CalendarRouteError
      && error.code === "IDEMPOTENCY_KEY_ABANDONED"
      && error.status === 409,
  );
  assert.equal(pool.events.size, 0);
});

test("reconciliation fails closed when the abandoned-key reservation is not recorded", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  pool.failAbandonedReservation = true;

  await assert.rejects(
    repository.reconcileEventCreate("owner-one", "recover-reservation-failed"),
    (error) => error instanceof CalendarRouteError
      && error.code === "IDEMPOTENCY_RESERVATION_UNAVAILABLE"
      && error.status === 503,
  );
  assert.equal(pool.requests.size, 0);
});

test("reconciliation isolates owners and deleted results retain only a tombstone", async () => {
  const pool = new MemoryCalendarPool();
  const repository = new CalendarRepository(pool);
  const created = await createCalendarEvent(repository, "owner-one", "recover-private", validAllDayCommit());

  assert.deepEqual(await repository.reconcileEventCreate("owner-two", "recover-private"), { status: "not-found" });
  assert.equal(pool.requests.get(requestMapKey("owner-one", "recover-private")).state, "complete");
  assert.equal(pool.requests.get(requestMapKey("owner-two", "recover-private")).state, "abandoned");
  await repository.deleteEvent("owner-one", created.event.id, created.event.revision);
  assert.deepEqual(await repository.reconcileEventCreate("owner-one", "recover-private"), { status: "deleted" });
  const tombstone = pool.requests.get(requestMapKey("owner-one", "recover-private"));
  assert.equal(tombstone.request_hash, null);
  assert.equal(tombstone.event_id, null);
  assert.equal(Object.hasOwn(tombstone, "response_body"), false);
});

test("migration scopes requests to accounts and leaves no event foreign key that can discard a tombstone", () => {
  const migration = readFileSync(
    new URL("../../../db/migrations/0004_calendar_create_requests.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /user_id text NOT NULL REFERENCES "user"\s*\("id"\) ON DELETE CASCADE/u);
  assert.match(migration, /PRIMARY KEY \(user_id, idempotency_key\)/u);
  assert.doesNotMatch(migration, /UNIQUE \(idempotency_key\)/u);
  assert.match(migration, /'abandoned'/u);
  assert.match(migration, /state = 'abandoned'[\s\S]*?request_hash IS NULL[\s\S]*?event_id IS NULL/u);
  assert.doesNotMatch(migration, /response_body/u);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/u);
  assert.doesNotMatch(migration, /event_id\s+uuid[^,\n]*REFERENCES\s+calendar_events/u);
});
