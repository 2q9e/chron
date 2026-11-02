import assert from "node:assert/strict";
import test from "node:test";
import {
  approveCalendarSeriesDraft,
  CalendarRequestError,
  createCalendarSeriesDraft,
  fetchCalendarEvents,
  fetchCalendarReminderStatus,
} from "./calendar-api.ts";

const seriesId = "de305d54-75b4-431b-adb2-eb6b9e546014";
const originalFetch = globalThis.fetch;

function rootEvent() {
  return {
    id: seriesId,
    kind: "all-day",
    title: "Weekly seminar",
    details: null,
    revision: 2,
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2026-06-01",
    endDate: "2026-06-02",
    recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function occurrence() {
  return {
    id: `${seriesId}:2026-06-08`,
    seriesId,
    occurrenceKey: `${seriesId}:2026-06-08`,
    kind: "all-day",
    title: "Weekly seminar",
    details: null,
    revision: 2,
    startDate: "2026-06-08",
    endDate: "2026-06-09",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    series: rootEvent(),
  };
}

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function proposedOccurrences() {
  return [1, 8, 15, 22].map((day) => {
    const startDate = `2026-06-${String(day).padStart(2, "0")}`;
    const endDate = `2026-06-${String(day + 1).padStart(2, "0")}`;
    return {
      occurrenceKey: `series:${startDate}`,
      kind: "all-day",
      startDate,
      endDate,
    };
  });
}

function terminalDraft(action, outcome, targetEventId = null, targetRevision = null) {
  return {
    id: "74953a92-52d7-4bb1-b623-1c5e18371490",
    action,
    scope: "series",
    outcome,
    replayed: true,
    targetEventId,
    targetRevision,
    event: null,
    recurrenceRule: null,
    calendarTimeZone: null,
    beforeOccurrences: [],
    afterOccurrences: [],
    conflicts: [],
    expiresAt: "2026-06-01T12:15:00.000Z",
  };
}

test("calendar list accepts dated occurrences only when their series root matches", async () => {
  globalThis.fetch = async () => response({ events: [occurrence()] });
  try {
    const [event] = await fetchCalendarEvents("2026-06-01", "2026-07-01", "UTC");
    assert.equal(event.id, `${seriesId}:2026-06-08`);
    assert.equal(event.series.id, seriesId);
    assert.equal(event.series.startDate, "2026-06-01");

    const invalid = occurrence();
    invalid.seriesId = "another-series";
    globalThis.fetch = async () => response({ events: [invalid] });
    await assert.rejects(
      fetchCalendarEvents("2026-06-01", "2026-07-01", "UTC"),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reminder status uses a same-origin no-store read and validates persisted state counts", async () => {
  const status = {
    total: 2,
    pending: 1,
    leased: 0,
    sent: 1,
    failed: 0,
    cancelled: 0,
    retrying: 1,
    nextAttemptAt: "2026-11-10T13:45:00.000Z",
    lastAcceptedAt: "2026-11-10T13:44:00.000Z",
    failureCounts: {
      accountEmail: 0,
      configuration: 0,
      provider: 0,
      temporary: 1,
      other: 0,
    },
  };
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return response({ status });
  };
  try {
    const loaded = await fetchCalendarReminderStatus(seriesId);
    assert.deepEqual(loaded, status);
    assert.equal(request.url, `/api/calendar/events/${seriesId}/reminders`);
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.cache, "no-store");
    assert.equal(request.init.credentials, "same-origin");

    globalThis.fetch = async () => response({ status: { ...status, total: 3 } });
    await assert.rejects(
      fetchCalendarReminderStatus(seriesId),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("series draft creation carries an idempotency key and validates its snapshot", async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return response({
      draft: {
        id: "74953a92-52d7-4bb1-b623-1c5e18371490",
        action: "create",
        scope: "series",
        outcome: "pending",
        replayed: false,
        targetEventId: null,
        targetRevision: null,
        event: { kind: "all-day", title: "Seminar", startDate: "2026-06-01", endDate: "2026-06-02" },
        recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
        calendarTimeZone: "UTC",
        beforeOccurrences: [],
        afterOccurrences: proposedOccurrences(),
        conflicts: [],
        expiresAt: "2026-06-01T12:15:00.000Z",
      },
    }, 201);
  };
  try {
    const draft = await createCalendarSeriesDraft({
      action: "create",
      scope: "series",
      event: { kind: "all-day", title: "Seminar", startDate: "2026-06-01", endDate: "2026-06-02" },
      recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
      calendarTimeZone: "UTC",
    }, "opaque-operation-key");

    assert.equal(draft.outcome, "pending");
    assert.equal(request.url, "/api/calendar/events/series-drafts");
    assert.equal(request.init.headers["Idempotency-Key"], "opaque-operation-key");
    assert.equal(request.init.credentials, "same-origin");

    globalThis.fetch = async () => {
      const mismatched = {
        draft: {
          id: "74953a92-52d7-4bb1-b623-1c5e18371490",
          action: "create",
          scope: "series",
          outcome: "pending",
          replayed: false,
          targetEventId: null,
          targetRevision: null,
          event: { kind: "all-day", title: "Different title", startDate: "2026-06-01", endDate: "2026-06-02" },
          recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
          calendarTimeZone: "UTC",
          beforeOccurrences: [],
          afterOccurrences: proposedOccurrences(),
          conflicts: [],
          expiresAt: "2026-06-01T12:15:00.000Z",
        },
      };
      return response(mismatched);
    };
    await assert.rejects(
      createCalendarSeriesDraft({
        action: "create",
        scope: "series",
        event: { kind: "all-day", title: "Seminar", startDate: "2026-06-01", endDate: "2026-06-02" },
        recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
        calendarTimeZone: "UTC",
      }, "another-operation-key"),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("approval reads typed stale outcomes from the API's conflict response", async () => {
  globalThis.fetch = async () => response({
    approval: {
      id: "74953a92-52d7-4bb1-b623-1c5e18371490",
      action: "update",
      outcome: "stale",
      event: null,
    },
  }, 409);
  try {
    const approval = await approveCalendarSeriesDraft("74953a92-52d7-4bb1-b623-1c5e18371490", "update");
    assert.equal(approval.outcome, "stale");
    assert.equal(approval.action, "update");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("approval rejects responses with the wrong proposal binding or status", async () => {
  globalThis.fetch = async () => response({
    approval: {
      id: "84953a92-52d7-4bb1-b623-1c5e18371490",
      action: "update",
      outcome: "stale",
      event: null,
    },
  }, 409);
  try {
    await assert.rejects(
      approveCalendarSeriesDraft("74953a92-52d7-4bb1-b623-1c5e18371490", "update"),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );

    globalThis.fetch = async () => response({
      approval: {
        id: "74953a92-52d7-4bb1-b623-1c5e18371490",
        action: "update",
        outcome: "stale",
        event: null,
      },
    }, 200);
    await assert.rejects(
      approveCalendarSeriesDraft("74953a92-52d7-4bb1-b623-1c5e18371490", "update"),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("idempotent series draft replay accepts scrubbed stale and expired outcomes", async () => {
  const targetEventId = "de305d54-75b4-431b-adb2-eb6b9e546014";
  const requests = [
    {
      action: "create",
      scope: "series",
      event: { kind: "all-day", title: "Seminar", startDate: "2026-06-01", endDate: "2026-06-02" },
      recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
      calendarTimeZone: "UTC",
    },
    {
      action: "update",
      scope: "series",
      targetEventId,
      targetRevision: 2,
      event: { kind: "all-day", title: "Seminar", startDate: "2026-06-01", endDate: "2026-06-02" },
      recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
      calendarTimeZone: "UTC",
    },
    {
      action: "delete",
      scope: "series",
      targetEventId,
      targetRevision: 2,
    },
  ];

  try {
    for (const outcome of ["stale", "expired"]) {
      for (const request of requests) {
        globalThis.fetch = async () => response({
          draft: terminalDraft(request.action, outcome),
        });
        const result = await createCalendarSeriesDraft(request, `replay-${request.action}-${outcome}`);
        assert.equal(result.action, request.action);
        assert.equal(result.outcome, outcome);
        assert.equal(result.event, null);
        assert.deepEqual(result.afterOccurrences, []);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
