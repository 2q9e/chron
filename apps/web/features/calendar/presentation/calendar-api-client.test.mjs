import assert from "node:assert/strict";
import test from "node:test";
import {
  approveCalendarSeriesDraft,
  CalendarRequestError,
  createCalendarEvent,
  createCalendarSeriesDraft,
  fetchCalendarCancelledOccurrences,
  fetchCalendarCapabilities,
  fetchCalendarEvents,
  fetchCalendarPreferences,
  fetchCalendarReminderStatus,
  saveCalendarPreferences,
  saveStudyPlannerPreferences,
  searchCalendarEvents,
  updateCalendarEvent,
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

test("loads and saves the complete per-account calendar preference contract", async () => {
  const preferences = {
    theme: "premium-dark",
    accentColor: "#c36b8e",
    density: "compact",
    reduceMotion: true,
    weekStartsOn: 1,
    timeZone: "America/Montreal",
    studyPlanner: {
      weekdays: [1, 2, 3, 4, 5],
      dayStart: "09:00",
      dayEnd: "17:00",
      sessionMinutes: 60,
      eventBufferMinutes: 15,
      sessionBreakMinutes: 15,
    },
  };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return response({ preferences });
  };

  try {
    assert.deepEqual(await fetchCalendarPreferences(), preferences);
    assert.deepEqual(await saveCalendarPreferences(preferences), preferences);
    assert.deepEqual(await saveStudyPlannerPreferences(preferences), preferences);
    assert.equal(calls[0].url, "/api/calendar/preferences");
    assert.equal(calls[0].init.method, "GET");
    assert.equal(calls[0].init.cache, "no-store");
    assert.equal(calls[0].init.credentials, "same-origin");
    assert.equal(calls[1].init.method, "PUT");
    assert.deepEqual(JSON.parse(calls[1].init.body), preferences);
    assert.equal(calls[2].init.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[2].init.body), preferences);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an invalid accent returned by the calendar preference API", async () => {
  globalThis.fetch = async () => response({
    preferences: {
      theme: "minimal-light",
      accentColor: "#ffffff; color: red",
      density: "comfortable",
      reduceMotion: false,
      weekStartsOn: 0,
      timeZone: "UTC",
      studyPlanner: {
        weekdays: [1, 2, 3, 4, 5],
        dayStart: "09:00",
        dayEnd: "17:00",
        sessionMinutes: 60,
        eventBufferMinutes: 15,
        sessionBreakMinutes: 15,
      },
    },
  });

  try {
    await assert.rejects(
      fetchCalendarPreferences(),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an invalid motion preference returned by the calendar preference API", async () => {
  globalThis.fetch = async () => response({
    preferences: {
      theme: "minimal-light",
      accentColor: null,
      density: "comfortable",
      reduceMotion: "false",
      weekStartsOn: 0,
      timeZone: "UTC",
      studyPlanner: {
        weekdays: [1, 2, 3, 4, 5],
        dayStart: "09:00",
        dayEnd: "17:00",
        sessionMinutes: 60,
        eventBufferMinutes: 15,
        sessionBreakMinutes: 15,
      },
    },
  });

  try {
    await assert.rejects(
      fetchCalendarPreferences(),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects invalid study planner defaults returned by the calendar preference API", async () => {
  globalThis.fetch = async () => response({
    preferences: {
      theme: "minimal-light",
      accentColor: null,
      density: "comfortable",
      reduceMotion: false,
      weekStartsOn: 0,
      timeZone: "UTC",
      studyPlanner: {
        weekdays: [1, 1],
        dayStart: "09:00",
        dayEnd: "17:00",
        sessionMinutes: 60,
        eventBufferMinutes: 15,
        sessionBreakMinutes: 15,
      },
    },
  });

  try {
    await assert.rejects(
      fetchCalendarPreferences(),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
    assert.equal(event.category, undefined);
    assert.equal(event.series.category, undefined);
    assert.equal(Object.hasOwn(event, "category"), false);
    assert.equal(Object.hasOwn(event.series, "category"), false);

    const inheritedCategory = occurrence();
    inheritedCategory.series.category = "class";
    globalThis.fetch = async () => response({ events: [inheritedCategory] });
    const [inheritedEvent] = await fetchCalendarEvents("2026-06-01", "2026-07-01", "UTC");
    assert.equal(inheritedEvent.category, "class");

    const invalid = occurrence();
    invalid.seriesId = "another-series";
    globalThis.fetch = async () => response({ events: [invalid] });
    await assert.rejects(
      fetchCalendarEvents("2026-06-01", "2026-07-01", "UTC"),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );

    const categorized = occurrence();
    categorized.category = "exam";
    categorized.series.category = "exam";
    globalThis.fetch = async () => response({ events: [categorized] });
    const [categorizedEvent] = await fetchCalendarEvents("2026-06-01", "2026-07-01", "UTC");
    assert.equal(categorizedEvent.category, "exam");

    categorized.category = "webinar";
    globalThis.fetch = async () => response({ events: [categorized] });
    await assert.rejects(
      fetchCalendarEvents("2026-06-01", "2026-07-01", "UTC"),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("calendar search accepts selectable occurrences and rejects mismatched series results", async () => {
  const request = {
    query: "seminar",
    from: "2026-06-08",
    to: "2026-06-15",
    timeZone: "UTC",
  };
  let captured;
  const searchedOccurrence = occurrence();
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return response({ events: [searchedOccurrence] });
  };

  try {
    assert.deepEqual(await searchCalendarEvents(request), [searchedOccurrence]);
    assert.equal(captured.url, "/api/calendar/events/search");
    assert.equal(captured.init.method, "POST");
    assert.equal(captured.init.credentials, "same-origin");
    assert.deepEqual(JSON.parse(captured.init.body), request);

    const invalid = occurrence();
    invalid.seriesId = "another-series";
    globalThis.fetch = async () => response({ events: [invalid] });
    await assert.rejects(
      searchCalendarEvents(request),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("event create and update requests omit an unedited category", async () => {
  const captured = [];
  globalThis.fetch = async (_url, init) => {
    captured.push(JSON.parse(init.body));
    return response({ event: rootEvent() });
  };

  try {
    const mutation = {
      kind: "all-day",
      title: "Seminar",
      startDate: "2026-06-15",
      endDate: "2026-06-16",
    };
    await createCalendarEvent(mutation, "UTC", [], "category-omitted-create");
    await updateCalendarEvent(rootEvent(), mutation, "UTC", []);

    assert.equal(Object.hasOwn(captured[0].event, "category"), false);
    assert.equal(Object.hasOwn(captured[1].event, "category"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("category support is detected and checked before category-bearing writes", async () => {
  globalThis.fetch = async () => response({}, 404);
  try {
    assert.deepEqual(await fetchCalendarCapabilities(), { eventCategories: false });
    await assert.rejects(
      createCalendarEvent({
        kind: "all-day",
        title: "Exam",
        category: "exam",
        startDate: "2026-06-15",
        endDate: "2026-06-16",
      }, "UTC", [], "category-unsupported-create"),
      (error) => error instanceof CalendarRequestError
        && error.code === "CALENDAR_FEATURE_UNAVAILABLE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push(url);
    if (url === "/api/calendar/capabilities") {
      return response({ features: { eventCategories: true } });
    }
    assert.equal(JSON.parse(init.body).event.category, "exam");
    return response({ event: { ...rootEvent(), category: "exam" } });
  };
  try {
    await createCalendarEvent({
      kind: "all-day",
      title: "Exam",
      category: "exam",
      startDate: "2026-06-15",
      endDate: "2026-06-16",
    }, "UTC", [], "category-supported-create");
    assert.deepEqual(calls, ["/api/calendar/capabilities", "/api/calendar/events"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cancelled occurrence lookup is bounded to same-origin calendar range and validates its series", async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return response({ occurrences: [occurrence()] });
  };
  try {
    const [item] = await fetchCalendarCancelledOccurrences(
      "2026-06-01",
      "2026-07-01",
      "America/Montreal",
    );
    assert.equal(item.occurrenceKey, `${seriesId}:2026-06-08`);
    assert.equal(request.url, "/api/calendar/events/cancelled?from=2026-06-01&to=2026-07-01&timeZone=America%2FMontreal");
    assert.equal(request.init.cache, "no-store");
    assert.equal(request.init.credentials, "same-origin");

    const invalid = occurrence();
    invalid.seriesId = "another-series";
    globalThis.fetch = async () => response({ occurrences: [invalid] });
    await assert.rejects(
      fetchCalendarCancelledOccurrences("2026-06-01", "2026-07-01", "UTC"),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("restoration proposals bind the exact occurrence, timezone, and user approval", async () => {
  const request = {
    action: "restore-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 2,
    occurrenceKey: `${seriesId}:2026-06-08`,
    calendarTimeZone: "America/Montreal",
  };
  const draft = {
    id: "74953a92-52d7-4bb1-b623-1c5e18371490",
    action: request.action,
    scope: request.scope,
    outcome: "pending",
    replayed: false,
    targetEventId: seriesId,
    targetRevision: 2,
    event: null,
    recurrenceRule: null,
    calendarTimeZone: request.calendarTimeZone,
    beforeOccurrences: [],
    afterOccurrences: [{
      occurrenceKey: request.occurrenceKey,
      kind: "all-day",
      startDate: "2026-06-08",
      endDate: "2026-06-09",
    }],
    conflicts: [],
    expiresAt: "2026-06-01T12:15:00.000Z",
  };
  let createRequest;
  globalThis.fetch = async (url, init) => {
    createRequest = { url, init };
    return response({ draft }, 201);
  };
  try {
    const created = await createCalendarSeriesDraft(request, "restore-key-1");
    assert.equal(created.action, "restore-occurrence");
    assert.equal(JSON.parse(createRequest.init.body).occurrenceKey, request.occurrenceKey);
    assert.equal(createRequest.init.headers["Idempotency-Key"], "restore-key-1");

    const approval = {
      id: draft.id,
      action: "restore-occurrence",
      outcome: "approved",
      event: null,
    };
    globalThis.fetch = async () => response({ approval });
    assert.deepEqual(
      await approveCalendarSeriesDraft(draft.id, request.action, draft),
      approval,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("following-series split binds the unchanged prefix, exact tail, and new segment approval", async () => {
  const followingId = "9d8f52e6-b3e7-4a95-b180-0e1d9f2561a4";
  const request = {
    action: "split-series",
    scope: "following",
    targetEventId: seriesId,
    targetRevision: 2,
    occurrenceKey: `${seriesId}:2026-06-08`,
    event: {
      kind: "all-day",
      title: "Weekly seminar",
      startDate: "2026-06-08",
      endDate: "2026-06-09",
    },
    recurrenceRule: { frequency: "weekly", interval: 1, count: 3 },
    calendarTimeZone: "America/Montreal",
  };
  const beforeOccurrences = [1, 8, 15, 22].map((day) => {
    const startDate = `2026-06-${String(day).padStart(2, "0")}`;
    const endDate = `2026-06-${String(day + 1).padStart(2, "0")}`;
    return {
      occurrenceKey: `${seriesId}:${startDate}`,
      kind: "all-day",
      startDate,
      endDate,
    };
  });
  const afterOccurrences = [
    beforeOccurrences[0],
    ...[8, 15, 22].map((day) => {
      const startDate = `2026-06-${String(day).padStart(2, "0")}`;
      const endDate = `2026-06-${String(day + 1).padStart(2, "0")}`;
      return {
        occurrenceKey: `${followingId}:${startDate}`,
        kind: "all-day",
        startDate,
        endDate,
      };
    }),
  ];
  afterOccurrences[1] = {
    ...afterOccurrences[1],
    startDate: "2026-06-12",
    endDate: "2026-06-13",
  };
  const draft = {
    id: "74953a92-52d7-4bb1-b623-1c5e18371490",
    action: request.action,
    scope: request.scope,
    outcome: "pending",
    replayed: false,
    targetEventId: seriesId,
    targetRevision: 2,
    event: request.event,
    recurrenceRule: request.recurrenceRule,
    calendarTimeZone: request.calendarTimeZone,
    beforeOccurrences,
    afterOccurrences,
    conflicts: [],
    expiresAt: "2026-06-01T12:15:00.000Z",
  };
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return response({ draft }, 201);
  };
  try {
    const created = await createCalendarSeriesDraft(request, "split-following-occurrences");
    assert.equal(created.action, "split-series");
    assert.deepEqual(JSON.parse(captured.init.body), request);
    assert.equal(captured.init.headers["Idempotency-Key"], "split-following-occurrences");

    const approvedEvent = {
      ...rootEvent(),
      id: followingId,
      seriesRootId: seriesId,
      title: request.event.title,
      category: null,
      startDate: request.event.startDate,
      endDate: request.event.endDate,
      recurrenceRule: request.recurrenceRule,
    };
    const approval = {
      id: draft.id,
      action: "split-series",
      outcome: "approved",
      event: approvedEvent,
    };
    globalThis.fetch = async () => response({ approval });
    assert.deepEqual(
      await approveCalendarSeriesDraft(draft.id, request.action, draft),
      approval,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("single-occurrence moves bind the stable key and exact proposed schedule", async () => {
  const request = {
    action: "move-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 2,
    occurrenceKey: `${seriesId}:2026-06-08T09:00`,
    calendarTimeZone: "America/Montreal",
    movement: {
      kind: "timed",
      startLocal: "2026-06-08T11:00",
      endLocal: "2026-06-08T12:00",
      timeZone: "America/Montreal",
    },
  };
  const draft = {
    id: "74953a92-52d7-4bb1-b623-1c5e18371490",
    action: request.action,
    scope: request.scope,
    outcome: "pending",
    replayed: false,
    targetEventId: seriesId,
    targetRevision: 2,
    event: null,
    recurrenceRule: null,
    calendarTimeZone: request.calendarTimeZone,
    beforeOccurrences: [{
      occurrenceKey: request.occurrenceKey,
      kind: "timed",
      startLocal: "2026-06-08T09:00",
      endLocal: "2026-06-08T10:00",
      timeZone: "America/Montreal",
      startsAt: "2026-06-08T13:00:00.000Z",
      endsAt: "2026-06-08T14:00:00.000Z",
    }],
    afterOccurrences: [{
      occurrenceKey: request.occurrenceKey,
      kind: "timed",
      startLocal: request.movement.startLocal,
      endLocal: request.movement.endLocal,
      timeZone: request.movement.timeZone,
      startsAt: "2026-06-08T15:00:00.000Z",
      endsAt: "2026-06-08T16:00:00.000Z",
    }],
    conflicts: [],
    expiresAt: "2026-06-01T12:15:00.000Z",
  };
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, init };
    return response({ draft }, 201);
  };
  try {
    const created = await createCalendarSeriesDraft(request, "move-one-occurrence");
    assert.equal(created.action, "move-occurrence");
    assert.deepEqual(JSON.parse(captured.init.body), request);
    assert.equal(captured.init.headers["Idempotency-Key"], "move-one-occurrence");

    globalThis.fetch = async () => response({
      approval: {
        id: draft.id,
        action: "move-occurrence",
        outcome: "approved",
        event: null,
      },
    });
    const approval = await approveCalendarSeriesDraft(draft.id, "move-occurrence", created);
    assert.equal(approval.outcome, "approved");
    assert.equal(approval.event, null);
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

    globalThis.fetch = async () => response({ status: { ...status, privateEmail: "person@example.test" } });
    await assert.rejects(
      fetchCalendarReminderStatus(seriesId),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );

    globalThis.fetch = async () => response({
      status: { ...status, failureCounts: { ...status.failureCounts, provider: 2 } },
    });
    await assert.rejects(
      fetchCalendarReminderStatus(seriesId),
      (error) => error instanceof CalendarRequestError && error.code === "INVALID_RESPONSE",
    );

    globalThis.fetch = async () => { throw new TypeError("private network details"); };
    await assert.rejects(
      fetchCalendarReminderStatus(seriesId),
      (error) => error instanceof CalendarRequestError
        && error.code === "NETWORK_ERROR"
        && error.message === "Chron couldn't reach reminder status. Check your connection and try again.",
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

test("occurrence cancellation uses the reviewed occurrence key for create and approval", async () => {
  const occurrenceKey = `${seriesId}:2026-06-08`;
  const requestBody = {
    action: "cancel-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 2,
    occurrenceKey,
  };
  const draft = {
    id: "74953a92-52d7-4bb1-b623-1c5e18371490",
    action: "cancel-occurrence",
    scope: "occurrence",
    outcome: "pending",
    replayed: false,
    targetEventId: seriesId,
    targetRevision: 2,
    event: null,
    recurrenceRule: null,
    calendarTimeZone: null,
    beforeOccurrences: [{
      occurrenceKey,
      kind: "all-day",
      startDate: "2026-06-08",
      endDate: "2026-06-09",
    }],
    afterOccurrences: [],
    conflicts: [],
    expiresAt: "2026-06-01T12:15:00.000Z",
  };
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return response({ draft }, 201);
  };
  try {
    const created = await createCalendarSeriesDraft(requestBody, "cancel-one-date");
    assert.equal(created.scope, "occurrence");
    assert.equal(created.beforeOccurrences[0].occurrenceKey, occurrenceKey);
    assert.equal(request.url, "/api/calendar/events/series-drafts");
    assert.equal(request.init.headers["Idempotency-Key"], "cancel-one-date");
    assert.deepEqual(JSON.parse(request.init.body), requestBody);

    globalThis.fetch = async (url, init) => {
      request = { url, init };
      return response({
        approval: {
          id: draft.id,
          action: "cancel-occurrence",
          outcome: "approved",
          event: null,
        },
      });
    };
    const approval = await approveCalendarSeriesDraft(draft.id, "cancel-occurrence", created);
    assert.equal(approval.action, "cancel-occurrence");
    assert.equal(approval.outcome, "approved");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.credentials, "same-origin");
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
