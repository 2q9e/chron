import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CalendarRouteError } from "./errors.ts";
import { CalendarRepository } from "./repository.ts";

const ownerId = "usr_aegis";

function createPool(queryHandler) {
  const calls = [];
  const releaseErrors = [];
  let releaseCount = 0;
  const client = {
    async query(sql, values = []) {
      calls.push({ sql: String(sql), values });
      return queryHandler(String(sql), values, calls.length);
    },
    release(error) {
      releaseCount += 1;
      releaseErrors.push(error);
    },
  };

  return {
    calls,
    releaseErrors,
    releaseCount: () => releaseCount,
    pool: { async connect() { return client; } },
  };
}

test("creates an owner-scoped event inside one transaction", async () => {
  const operationKey = "create-study-session";
  const row = {
    id: "de305d54-75b4-431b-adb2-eb6b9e546014",
    kind: "timed",
    title: "Study session",
    details: null,
    revision: 1,
    start_local: "2026-10-30T09:00",
    end_local: "2026-10-30T10:00",
    time_zone: "America/Montreal",
    starts_at: new Date("2026-10-30T13:00:00.000Z"),
    ends_at: new Date("2026-10-30T14:00:00.000Z"),
    start_date: null,
    end_date: null,
    created_at: new Date("2026-10-01T12:00:00.000Z"),
    updated_at: new Date("2026-10-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => {
    if (sql.startsWith("INSERT INTO calendar_events")) return { rows: [row] };
    if (sql.includes("INSERT INTO calendar_event_create_requests")
      || sql.includes("UPDATE calendar_event_create_requests")) {
      return { rows: [{ idempotency_key: operationKey }] };
    }
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);
  const result = await repository.createEvent(ownerId, {
    kind: "timed",
    title: "Study session",
    startLocal: "2026-10-30T09:00",
    endLocal: "2026-10-30T10:00",
    timeZone: "America/Montreal",
  }, "America/Montreal", [], operationKey);

  assert.equal(result.replayed, false);
  const event = result.event;
  assert.equal(event.id, row.id);
  assert.equal(event.kind, "timed");
  assert.equal(calls.length, 10);
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls[1].sql, "SELECT set_config('chron.user_id', $1, true)");
  assert.match(calls[2].sql, /pg_advisory_xact_lock/);
  assert.match(calls[3].sql, /FROM calendar_event_create_requests/);
  assert.match(calls[4].sql, /INSERT INTO calendar_event_create_requests/);
  assert.match(calls[7].sql, /INSERT INTO calendar_events/);
  assert.match(calls[8].sql, /UPDATE calendar_event_create_requests/);
  assert.equal(calls[9].sql, "COMMIT");
  assert.equal(calls[1].values[0], ownerId);
  assert.equal(calls[7].values[1], ownerId);
});

test("persists an opted-in timed reminder with its event in the owner transaction", async () => {
  const eventId = "de305d54-75b4-431b-adb2-eb6b9e546014";
  const row = {
    id: eventId,
    kind: "timed",
    title: "Review session",
    details: null,
    revision: 1,
    reminder_choice: "15-minutes-before",
    reminder_time_zone: null,
    start_local: "2026-11-10T09:00",
    end_local: "2026-11-10T10:00",
    time_zone: "America/Montreal",
    starts_at: new Date("2026-11-10T14:00:00.000Z"),
    ends_at: new Date("2026-11-10T15:00:00.000Z"),
    start_date: null,
    end_date: null,
    created_at: new Date("2026-11-01T12:00:00.000Z"),
    updated_at: new Date("2026-11-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => {
    if (sql.startsWith("INSERT INTO calendar_events")) return { rows: [row] };
    if (sql.includes("INSERT INTO calendar_event_create_requests")
      || sql.includes("UPDATE calendar_event_create_requests")) {
      return { rows: [{ idempotency_key: "create-with-reminder" }] };
    }
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);

  const result = await repository.createEvent(ownerId, {
    kind: "timed",
    title: "Review session",
    startLocal: "2026-11-10T09:00",
    endLocal: "2026-11-10T10:00",
    timeZone: "America/Montreal",
    reminderChoice: "15-minutes-before",
  }, "America/Montreal", [], "create-with-reminder");

  assert.equal(result.event.reminderChoice, "15-minutes-before");
  const eventInsert = calls.find(({ sql }) => sql.startsWith("INSERT INTO calendar_events"));
  assert.ok(eventInsert);
  assert.match(eventInsert.sql, /reminder_choice[\s\S]*reminder_time_zone/u);
  assert.equal(eventInsert.values[9], "15-minutes-before");

  const reminderInsert = calls.find(({ sql }) => sql.includes("INSERT INTO calendar_event_reminders"));
  assert.ok(reminderInsert);
  assert.match(reminderInsert.sql, /WHERE job\.scheduled_at > clock_timestamp\(\)/u);
  assert.deepEqual(reminderInsert.values.slice(0, 3), [ownerId, eventId, 1]);
  const [job] = JSON.parse(reminderInsert.values[3]);
  assert.equal(job.occurrenceKey, `${eventId}:single`);
  assert.equal(job.scheduledAt, "2026-11-10T13:45:00Z");
  assert.equal(job.timeZone, "America/Montreal");
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("updates cancel stale reminder work and insert only the current revision", async () => {
  const eventId = "de305d54-75b4-431b-adb2-eb6b9e546014";
  const row = {
    id: eventId,
    kind: "timed",
    title: "Review session",
    details: null,
    revision: 2,
    reminder_choice: "30-minutes-before",
    reminder_time_zone: null,
    start_local: "2026-11-12T09:00",
    end_local: "2026-11-12T10:00",
    time_zone: "America/Montreal",
    starts_at: new Date("2026-11-12T14:00:00.000Z"),
    ends_at: new Date("2026-11-12T15:00:00.000Z"),
    start_date: null,
    end_date: null,
    recurrence_frequency: null,
    created_at: new Date("2026-11-01T12:00:00.000Z"),
    updated_at: new Date("2026-11-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => {
    if (sql.includes("SELECT recurrence_frequency")) {
      return { rows: [{ recurrence_frequency: null }] };
    }
    if (sql.startsWith("UPDATE calendar_events")) return { rows: [row] };
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);

  const event = await repository.updateEvent(ownerId, eventId, 1, {
    kind: "timed",
    title: "Review session",
    startLocal: "2026-11-12T09:00",
    endLocal: "2026-11-12T10:00",
    timeZone: "America/Montreal",
    reminderChoice: "30-minutes-before",
  }, "America/Montreal", []);

  assert.equal(event.revision, 2);
  assert.equal(event.reminderChoice, "30-minutes-before");
  const cancellation = calls.find(({ sql }) => sql.includes("UPDATE calendar_event_reminders"));
  assert.ok(cancellation);
  assert.match(cancellation.sql, /event_revision < \$3/u);
  assert.match(cancellation.sql, /status IN \('pending', 'leased'\)/u);
  assert.deepEqual(cancellation.values, [ownerId, eventId, 2]);
  const insert = calls.find(({ sql }) => sql.includes("INSERT INTO calendar_event_reminders"));
  assert.ok(insert);
  assert.deepEqual(insert.values.slice(0, 3), [ownerId, eventId, 2]);
  const [job] = JSON.parse(insert.values[3]);
  assert.equal(job.scheduledAt, "2026-11-12T13:30:00Z");
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("captures the calendar zone for an all-day reminder without storing event text in the job", async () => {
  const eventId = "de305d54-75b4-431b-adb2-eb6b9e546014";
  const row = {
    id: eventId,
    kind: "all-day",
    title: "Exam week",
    details: "Private location",
    revision: 1,
    reminder_choice: "previous-day-9am",
    reminder_time_zone: "America/Montreal",
    start_local: null,
    end_local: null,
    time_zone: null,
    starts_at: null,
    ends_at: null,
    start_date: "2026-11-10",
    end_date: "2026-11-11",
    created_at: new Date("2026-11-01T12:00:00.000Z"),
    updated_at: new Date("2026-11-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => {
    if (sql.startsWith("INSERT INTO calendar_events")) return { rows: [row] };
    if (sql.includes("INSERT INTO calendar_event_create_requests")
      || sql.includes("UPDATE calendar_event_create_requests")) {
      return { rows: [{ idempotency_key: "create-all-day-reminder" }] };
    }
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);

  const result = await repository.createEvent(ownerId, {
    kind: "all-day",
    title: "Exam week",
    details: "Private location",
    startDate: "2026-11-10",
    endDate: "2026-11-11",
    reminderChoice: "previous-day-9am",
    reminderTimeZone: "America/Montreal",
  }, "America/Montreal", [], "create-all-day-reminder");

  assert.equal(result.event.reminderTimeZone, "America/Montreal");
  const eventInsert = calls.find(({ sql }) => sql.startsWith("INSERT INTO calendar_events"));
  assert.deepEqual(eventInsert.values.slice(-2), ["previous-day-9am", "America/Montreal"]);
  const reminderInsert = calls.find(({ sql }) => sql.includes("INSERT INTO calendar_event_reminders"));
  assert.ok(reminderInsert);
  const [job] = JSON.parse(reminderInsert.values[3]);
  assert.equal(job.scheduledAt, "2026-11-09T14:00:00Z");
  assert.equal(job.timeZone, "America/Montreal");
  assert.deepEqual(Object.keys(job).sort(), ["id", "occurrenceKey", "scheduledAt", "timeZone"]);
  assert.equal(JSON.stringify(job).includes("Private location"), false);
});

test("rolls back the event when its reminder outbox write fails", async () => {
  const row = {
    id: "de305d54-75b4-431b-adb2-eb6b9e546014",
    kind: "timed",
    title: "Review session",
    details: null,
    revision: 1,
    reminder_choice: "5-minutes-before",
    reminder_time_zone: null,
    start_local: "2026-11-10T09:00",
    end_local: "2026-11-10T10:00",
    time_zone: "America/Montreal",
    starts_at: new Date("2026-11-10T14:00:00.000Z"),
    ends_at: new Date("2026-11-10T15:00:00.000Z"),
    start_date: null,
    end_date: null,
    created_at: new Date("2026-11-01T12:00:00.000Z"),
    updated_at: new Date("2026-11-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => {
    if (sql.startsWith("INSERT INTO calendar_events")) return { rows: [row] };
    if (sql.includes("INSERT INTO calendar_event_reminders")) {
      throw new Error("outbox unavailable");
    }
    if (sql.includes("INSERT INTO calendar_event_create_requests")) {
      return { rows: [{ idempotency_key: "create-rollback-reminder" }] };
    }
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);

  await assert.rejects(repository.createEvent(ownerId, {
    kind: "timed",
    title: "Review session",
    startLocal: "2026-11-10T09:00",
    endLocal: "2026-11-10T10:00",
    timeZone: "America/Montreal",
    reminderChoice: "5-minutes-before",
  }, "America/Montreal", [], "create-rollback-reminder"), /outbox unavailable/u);

  assert.equal(calls.some(({ sql }) => sql.startsWith("INSERT INTO calendar_events")), true);
  assert.equal(calls.some(({ sql }) => sql.includes("UPDATE calendar_event_create_requests")), false);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
});

test("does not commit an event when its reviewed conflict set is stale", async () => {
  const conflictRow = {
    id: "de305d54-75b4-431b-adb2-eb6b9e546014",
    kind: "timed",
    title: "Existing class",
    details: null,
    revision: 2,
    start_local: "2026-10-30T09:00",
    end_local: "2026-10-30T10:00",
    time_zone: "America/Montreal",
    starts_at: new Date("2026-10-30T13:00:00.000Z"),
    ends_at: new Date("2026-10-30T14:00:00.000Z"),
    start_date: null,
    end_date: null,
    created_at: new Date("2026-10-01T12:00:00.000Z"),
    updated_at: new Date("2026-10-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => {
    if (sql.includes("INSERT INTO calendar_event_create_requests")) {
      return { rows: [{ idempotency_key: "create-conflicted" }] };
    }
    return { rows: sql.includes("FROM calendar_events") ? [conflictRow] : [] };
  });
  const repository = new CalendarRepository(pool);

  await assert.rejects(repository.createEvent(ownerId, {
    kind: "timed",
    title: "Study session",
    startLocal: "2026-10-30T09:30",
    endLocal: "2026-10-30T10:30",
    timeZone: "America/Montreal",
  }, "America/Montreal", [], "create-conflicted"), (error) => error.code === "CONFLICT_REVIEW_REQUIRED");

  assert.match(calls[2].sql, /pg_advisory_xact_lock/);
  assert.match(calls[6].sql, /SELECT[\s\S]*FROM calendar_events/);
  assert.equal(calls.some(({ sql }) => sql.startsWith("INSERT INTO calendar_events")), false);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
});

test("lists only the owner’s events using a half-open zoned date range", async () => {
  const { pool, calls } = createPool(() => ({ rows: [] }));
  const repository = new CalendarRepository(pool);
  const events = await repository.listEvents(
    ownerId,
    "2026-11-01",
    "2026-11-02",
    "America/Montreal",
  );

  assert.deepEqual(events, []);
  const query = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  assert.ok(query);
  assert.match(query.sql, /WHERE user_id = \$1/);
  assert.match(query.sql, /starts_at < \$5::timestamptz AND ends_at > \$4::timestamptz/);
  assert.deepEqual(query.values.slice(0, 2), [ownerId, "2026-11-01"]);
  assert.equal(query.values[2], "2026-11-02");
  assert.equal(query.values[3], "2026-11-01T04:00:00Z");
  assert.equal(query.values[4], "2026-11-02T05:00:00Z");
  assert.equal(calls.some(({ sql }) => sql.includes("statement_timeout")), false);
});

test("expands a recurring root that starts before the visible range and preserves its series", async () => {
  const seriesId = "de305d54-75b4-431b-adb2-eb6b9e546014";
  const row = {
    id: seriesId,
    kind: "all-day",
    title: "Weekly seminar",
    details: null,
    revision: 4,
    start_local: null,
    end_local: null,
    time_zone: null,
    starts_at: null,
    ends_at: null,
    start_date: "2026-10-12",
    end_date: "2026-10-13",
    recurrence_frequency: "weekly",
    recurrence_interval: 1,
    recurrence_count: 6,
    created_at: new Date("2026-10-01T12:00:00.000Z"),
    updated_at: new Date("2026-10-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => ({
    rows: sql.includes("FROM calendar_events") ? [row] : [],
  }));
  const repository = new CalendarRepository(pool);

  const events = await repository.listEvents(
    ownerId,
    "2026-11-02",
    "2026-11-09",
    "America/Montreal",
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].id, `${seriesId}:2026-11-02`);
  assert.equal(events[0].occurrenceKey, `${seriesId}:2026-11-02`);
  assert.equal(events[0].seriesId, seriesId);
  assert.equal(events[0].startDate, "2026-11-02");
  assert.equal(events[0].series.id, seriesId);
  assert.equal(events[0].series.startDate, "2026-10-12");
  assert.equal(events[0].series.revision, 4);

  const query = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  assert.ok(query);
  assert.match(query.sql, /recurrence_frequency IS NOT NULL/);
  assert.match(query.sql, /start_date >= \$2::date - 374/);
  assert.match(query.sql, /ORDER BY id[\s\S]*LIMIT \$6/);
  assert.equal(query.values[0], ownerId);
});

test("fails closed instead of returning a partial range over 1,000 occurrences", async () => {
  const rows = Array.from({ length: 11 }, (_, index) => ({
    id: `de305d54-75b4-431b-adb2-eb6b9e54${String(index).padStart(4, "0")}`,
    kind: "all-day",
    title: `Daily series ${index}`,
    details: null,
    revision: 1,
    start_local: null,
    end_local: null,
    time_zone: null,
    starts_at: null,
    ends_at: null,
    start_date: "2026-01-01",
    end_date: "2026-01-02",
    recurrence_frequency: "daily",
    recurrence_interval: 1,
    recurrence_count: 366,
    created_at: new Date("2026-01-01T12:00:00.000Z"),
    updated_at: new Date("2026-01-01T12:00:00.000Z"),
  }));
  const { pool } = createPool((sql) => ({
    rows: sql.includes("FROM calendar_events") ? rows : [],
  }));
  const repository = new CalendarRepository(pool);

  await assert.rejects(
    repository.listEvents(ownerId, "2026-02-01", "2026-05-05", "UTC"),
    (error) => error instanceof CalendarRouteError
      && error.status === 422
      && error.code === "RANGE_RESULT_LIMIT",
  );
});

test("search uses a literal case-insensitive pattern, owner scope, and exclusive zoned overlap bounds", async () => {
  const { pool, calls } = createPool(() => ({ rows: [] }));
  const repository = new CalendarRepository(pool);
  const events = await repository.searchEvents(ownerId, {
    query: "50%_\\final",
    from: "2026-11-01",
    to: "2026-11-02",
    timeZone: "America/Montreal",
    kind: "timed",
  });

  assert.deepEqual(events, []);
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls[1].sql, "SELECT set_config('chron.user_id', $1, true)");
  assert.equal(calls[1].values[0], ownerId);
  const query = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  assert.ok(query);
  assert.match(query.sql, /WHERE user_id = \$1/u);
  assert.ok(query.sql.includes(String.raw`title ILIKE $2 ESCAPE E'\\'`));
  assert.match(query.sql, /start_date < \$4::date AND end_date > \$3::date/u);
  assert.match(query.sql, /starts_at < \$7::timestamptz AND ends_at > \$6::timestamptz/u);
  assert.match(query.sql, /\$8::text IS NULL OR kind = \$8::text/u);
  assert.match(query.sql, /ORDER BY[\s\S]*AT TIME ZONE \$5::text[\s\S]*,\s+id/u);
  assert.equal(query.values[0], ownerId);
  assert.equal(query.values[1], String.raw`%50\%\_\\final%`);
  assert.deepEqual(query.values.slice(2, 8), [
    "2026-11-01",
    "2026-11-02",
    "America/Montreal",
    "2026-11-01T04:00:00Z",
    "2026-11-02T05:00:00Z",
    "timed",
  ]);
  assert.equal(query.values[8], 1001);
});

test("search returns only rows scoped to the authenticated owner", async () => {
  const matchingRows = [
    {
      id: "de305d54-75b4-431b-adb2-eb6b9e546014",
      user_id: "owner-one",
      kind: "all-day",
      title: "Owner one exam",
      details: null,
      revision: 1,
      start_local: null,
      end_local: null,
      time_zone: null,
      starts_at: null,
      ends_at: null,
      start_date: "2026-11-01",
      end_date: "2026-11-02",
      created_at: new Date("2026-10-01T12:00:00.000Z"),
      updated_at: new Date("2026-10-01T12:00:00.000Z"),
    },
    {
      id: "de305d54-75b4-431b-adb2-eb6b9e546015",
      user_id: "owner-two",
      kind: "all-day",
      title: "Owner two exam",
      details: null,
      revision: 1,
      start_local: null,
      end_local: null,
      time_zone: null,
      starts_at: null,
      ends_at: null,
      start_date: "2026-11-01",
      end_date: "2026-11-02",
      created_at: new Date("2026-10-01T12:00:00.000Z"),
      updated_at: new Date("2026-10-01T12:00:00.000Z"),
    },
  ];
  const { pool, calls } = createPool((sql, values) => {
    if (!sql.includes("FROM calendar_events")) return { rows: [] };
    assert.match(sql, /WHERE user_id = \$1/u);
    return { rows: matchingRows.filter((row) => row.user_id === values[0]) };
  });
  const repository = new CalendarRepository(pool);
  const events = await repository.searchEvents("owner-one", {
    query: "exam",
    from: "2026-11-01",
    to: "2026-11-02",
    timeZone: "UTC",
  });

  assert.deepEqual(events.map(({ id, title }) => ({ id, title })), [{
    id: "de305d54-75b4-431b-adb2-eb6b9e546014",
    title: "Owner one exam",
  }]);
  assert.equal(calls[1].values[0], "owner-one");
  const query = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  assert.equal(query.values[0], "owner-one");
});

test("search treats the kind filter as optional and rejects more than 1,000 matches", async () => {
  let rows = [];
  const { pool, calls } = createPool((sql) => (
    sql.includes("FROM calendar_events") ? { rows } : { rows: [] }
  ));
  const repository = new CalendarRepository(pool);
  const search = {
    query: "exam",
    from: "2026-11-01",
    to: "2026-11-02",
    timeZone: "UTC",
  };

  assert.deepEqual(await repository.searchEvents(ownerId, search), []);
  let query = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  assert.equal(query.values[7], null);
  assert.equal(query.values[8], 1001);

  rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `de305d54-75b4-431b-adb2-eb6b9e54${String(index).padStart(4, "0")}`,
    kind: "all-day",
    title: "Exam",
    details: null,
    revision: 1,
    start_local: null,
    end_local: null,
    time_zone: null,
    starts_at: null,
    ends_at: null,
    start_date: "2026-11-01",
    end_date: "2026-11-02",
    created_at: new Date("2026-10-01T12:00:00.000Z"),
    updated_at: new Date("2026-10-01T12:00:00.000Z"),
  }));
  await assert.rejects(
    repository.searchEvents(ownerId, search),
    (error) => error.code === "SEARCH_RESULT_LIMIT" && error.status === 422,
  );
  query = calls.filter(({ sql }) => sql.includes("FROM calendar_events")).at(-1);
  assert.equal(query.values[8], 1001);
});

test("search timeout cancels, rolls back, releases the client, and permits a clean retry", async () => {
  let searchAttempt = 0;
  const { pool, calls, releaseCount } = createPool((sql) => {
    if (sql.includes("FROM calendar_events")) {
      searchAttempt += 1;
      if (searchAttempt === 1) {
        throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
      }
    }
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);
  const search = {
    query: "exam",
    from: "2026-11-01",
    to: "2026-11-02",
    timeZone: "UTC",
  };

  await assert.rejects(
    repository.searchEvents(ownerId, search),
    (error) => error instanceof CalendarRouteError
      && error.status === 504
      && error.code === "CALENDAR_SEARCH_TIMEOUT"
      && error.message === "Search could not finish. Refine the title or date range and try again.",
  );
  assert.deepEqual(calls.slice(0, 3).map(({ sql }) => sql), [
    "BEGIN",
    "SELECT set_config('chron.user_id', $1, true)",
    "SELECT set_config('statement_timeout', $1, true)",
  ]);
  assert.match(calls[3].sql, /FROM calendar_events/u);
  assert.equal(calls[4].sql, "ROLLBACK");
  assert.equal(calls[2].values[0], "2000ms");
  assert.equal(releaseCount(), 1);

  assert.deepEqual(await repository.searchEvents(ownerId, search), []);
  assert.deepEqual(calls.slice(5, 8).map(({ sql }) => sql), [
    "BEGIN",
    "SELECT set_config('chron.user_id', $1, true)",
    "SELECT set_config('statement_timeout', $1, true)",
  ]);
  assert.match(calls[8].sql, /FROM calendar_events/u);
  assert.equal(calls[9].sql, "COMMIT");
  assert.equal(calls[7].values[0], "2000ms");
  assert.equal(releaseCount(), 2);
});

test("search preserves other database errors for the existing safe route mapper", async () => {
  const databaseError = Object.assign(new Error("database detail"), { code: "42P01" });
  const { pool, calls, releaseCount } = createPool((sql) => {
    if (sql.includes("FROM calendar_events")) throw databaseError;
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);

  await assert.rejects(repository.searchEvents(ownerId, {
    query: "exam",
    from: "2026-11-01",
    to: "2026-11-02",
    timeZone: "UTC",
  }), (error) => error === databaseError);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
  assert.equal(releaseCount(), 1);
});

test("destroys a connection after rollback failure and preserves the operation error", async () => {
  const operationError = new Error("calendar preference write failed");
  const rollbackError = new Error("transaction rollback failed");
  const { pool, calls, releaseErrors, releaseCount } = createPool((sql) => {
    if (sql.startsWith("INSERT INTO calendar_preferences")) throw operationError;
    if (sql === "ROLLBACK") throw rollbackError;
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);

  await assert.rejects(repository.setPreferences(ownerId, {
    theme: "premium-dark",
    density: "compact",
    weekStartsOn: 1,
    timeZone: "UTC",
  }), (error) => error === operationError);
  assert.deepEqual(calls.slice(0, 2).map(({ sql }) => sql), [
    "BEGIN",
    "SELECT set_config('chron.user_id', $1, true)",
  ]);
  assert.match(calls[2].sql, /pg_advisory_xact_lock/u);
  assert.match(calls[3].sql, /INSERT INTO calendar_preferences/u);
  assert.equal(calls[4].sql, "ROLLBACK");
  assert.equal(releaseCount(), 1);
  assert.equal(releaseErrors[0], rollbackError);
});

test("checks all-day conflicts across a 23-hour daylight-saving date", async () => {
  const { pool, calls } = createPool(() => ({ rows: [] }));
  const repository = new CalendarRepository(pool);
  const conflicts = await repository.findConflicts(ownerId, {
    kind: "all-day",
    title: "Exam day",
    startDate: "2026-03-08",
    endDate: "2026-03-09",
  }, "America/Montreal");

  assert.deepEqual(conflicts, []);
  const query = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  assert.ok(query);
  assert.match(query.sql, /starts_at < \$4::timestamptz AND ends_at > \$3::timestamptz/);
  assert.match(query.sql, /start_date < \$6::date AND end_date > \$5::date/);
  assert.equal(query.values[0], ownerId);
  assert.equal(query.values[2], "2026-03-08T05:00:00Z");
  assert.equal(query.values[3], "2026-03-09T04:00:00Z");
  assert.deepEqual(query.values.slice(4, 6), ["2026-03-08", "2026-03-09"]);
});

test("checks timed conflicts through the final occupied calendar date", async () => {
  const conflictRow = {
    id: "de305d54-75b4-431b-adb2-eb6b9e546014",
    kind: "timed",
    title: "Existing class",
    details: "This private detail is not part of a conflict summary.",
    revision: 3,
    start_local: "2026-11-01T01:30",
    end_local: "2026-11-01T02:30",
    time_zone: "America/Montreal",
    starts_at: new Date("2026-11-01T06:30:00.000Z"),
    ends_at: new Date("2026-11-01T07:30:00.000Z"),
    start_date: null,
    end_date: null,
    created_at: new Date("2026-10-01T12:00:00.000Z"),
    updated_at: new Date("2026-10-01T12:00:00.000Z"),
  };
  const { pool, calls } = createPool((sql) => ({
    rows: sql.includes("FROM calendar_events") ? [conflictRow] : [],
  }));
  const repository = new CalendarRepository(pool);
  const conflicts = await repository.findConflicts(ownerId, {
    kind: "timed",
    title: "Study session",
    startLocal: "2026-11-01T01:30",
    endLocal: "2026-11-01T02:30",
    timeZone: "America/Montreal",
    startDisambiguation: "later",
  }, "America/Montreal");

  assert.deepEqual(conflicts, [{
    id: conflictRow.id,
    revision: 3,
    title: "Existing class",
    kind: "timed",
    startLocal: "2026-11-01T01:30",
    endLocal: "2026-11-01T02:30",
    timeZone: "America/Montreal",
  }]);
  const query = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  assert.ok(query);
  assert.equal(query.values[1], null);
  assert.equal(query.values[2], "2026-11-01T06:30:00Z");
  assert.equal(query.values[3], "2026-11-01T07:30:00Z");
  assert.deepEqual(query.values.slice(4, 6), ["2026-11-01", "2026-11-02"]);
});

test("upserts preferences on the actual user key", async () => {
  const { pool, calls } = createPool((sql) => ({
    rows: sql.startsWith("INSERT INTO calendar_preferences")
      ? [{ theme: "premium-dark", density: "compact", week_starts_on: 1, time_zone: "UTC" }]
      : [],
  }));
  const repository = new CalendarRepository(pool);
  const preferences = await repository.setPreferences(ownerId, {
    theme: "premium-dark",
    density: "compact",
    weekStartsOn: 1,
    timeZone: "UTC",
  });

  const query = calls.find(({ sql }) => sql.includes("INSERT INTO calendar_preferences"));
  assert.ok(query);
  assert.match(query.sql, /ON CONFLICT \(user_id\)/);
  assert.deepEqual(preferences, {
    theme: "premium-dark",
    density: "compact",
    weekStartsOn: 1,
    timeZone: "UTC",
  });
  assert.equal(query.values[0], ownerId);
});

test("expires a bounded owner-scoped proposal batch and clears retained payload references", async () => {
  const { pool, calls } = createPool((sql) => (
    sql.includes("WITH expired_rows")
      ? { rows: [{ id: "de305d54-75b4-431b-adb2-eb6b9e546014" }], rowCount: 1 }
      : { rows: [] }
  ));
  const repository = new CalendarRepository(pool);

  assert.equal(await repository.expirePendingSeriesDrafts(ownerId, 25), 1);
  assert.deepEqual(calls.slice(0, 2).map(({ sql }) => sql), [
    "BEGIN",
    "SELECT set_config('chron.user_id', $1, true)",
  ]);
  assert.equal(calls[1].values[0], ownerId);
  assert.match(calls[2].sql, /set_config\('lock_timeout'/u);
  assert.match(calls[3].sql, /set_config\('statement_timeout'/u);
  assert.match(calls[4].sql, /idle_in_transaction_session_timeout/u);
  assert.match(calls[5].sql, /pg_advisory_xact_lock/u);
  const expiry = calls[6];
  assert.match(expiry.sql, /WHERE user_id = \$1[\s\S]*outcome = 'pending'[\s\S]*expires_at <= clock_timestamp\(\)/u);
  assert.match(expiry.sql, /LIMIT \$2\s+FOR UPDATE SKIP LOCKED/u);
  assert.match(expiry.sql, /normalized_payload = NULL/u);
  assert.match(expiry.sql, /payload_hash = NULL/u);
  assert.match(expiry.sql, /conflict_snapshot = NULL/u);
  assert.match(expiry.sql, /target_event_id = NULL/u);
  assert.match(expiry.sql, /target_revision = NULL/u);
  assert.match(expiry.sql, /result_event_id = NULL/u);
  assert.match(expiry.sql, /resolved_at = expired_rows\.resolution_time/u);
  assert.deepEqual(expiry.values, [ownerId, 25]);
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("rejects unbounded proposal expiry batches before connecting", async () => {
  const { pool, calls } = createPool(() => ({ rows: [] }));
  const repository = new CalendarRepository(pool);

  assert.throws(() => repository.expirePendingSeriesDrafts(ownerId, 501), RangeError);
  assert.deepEqual(calls, []);
});

test("keeps the worker cursor across account deletion and describes its RLS guard accurately", () => {
  const migration = readFileSync(
    new URL("../../../db/migrations/0006_calendar_series_expiry_worker.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /last_user_id text,/u);
  assert.doesNotMatch(migration, /last_user_id text REFERENCES/u);
  assert.doesNotMatch(migration, /ON DELETE SET NULL/u);
  assert.match(migration, /not a boundary against connections using the trusted application database role/u);
  assert.match(migration, /current_setting\('chron\.series_expiry_worker', true\) = 'enabled'/u);
});

test("reads bounded reminder status only for the signed-in event owner and hides raw errors", async () => {
  const eventId = "de305d54-75b4-431b-adb2-eb6b9e546014";
  const { pool, calls } = createPool((sql) => {
    if (sql.includes("FROM calendar_events")) return { rows: [{ revision: 4 }] };
    if (sql.includes("FROM calendar_event_reminders")) {
      return { rows: [
        { status: "pending", attempt_count: 0, next_attempt_at: "2026-11-10T13:45:00.000Z", sent_at: null, last_error_code: null },
        { status: "pending", attempt_count: 2, next_attempt_at: "2026-11-10T13:46:00.000Z", sent_at: null, last_error_code: "SMTP_TRANSIENT" },
        { status: "leased", attempt_count: 1, next_attempt_at: "2026-11-10T13:45:00.000Z", sent_at: null, last_error_code: null },
        { status: "sent", attempt_count: 1, next_attempt_at: "2026-11-10T13:45:00.000Z", sent_at: "2026-11-10T13:44:00.000Z", last_error_code: null },
        { status: "failed", attempt_count: 1, next_attempt_at: "2026-11-10T13:45:00.000Z", sent_at: null, last_error_code: "SMTP_CONFIGURATION" },
        { status: "cancelled", attempt_count: 1, next_attempt_at: "2026-11-10T13:45:00.000Z", sent_at: null, last_error_code: "EVENT_STALE" },
      ] };
    }
    return { rows: [] };
  });
  const repository = new CalendarRepository(pool);

  const status = await repository.getCalendarReminderStatus(ownerId, eventId);

  assert.deepEqual(status, {
    total: 6,
    pending: 2,
    leased: 1,
    sent: 1,
    failed: 1,
    cancelled: 1,
    retrying: 1,
    nextAttemptAt: "2026-11-10T13:45:00.000Z",
    lastAcceptedAt: "2026-11-10T13:44:00.000Z",
    failureCounts: {
      accountEmail: 0,
      configuration: 1,
      provider: 0,
      temporary: 1,
      other: 0,
    },
  });
  assert.equal(calls[1].values[0], ownerId);
  const eventLookup = calls.find(({ sql }) => sql.includes("FROM calendar_events"));
  const reminderLookup = calls.find(({ sql }) => sql.includes("FROM calendar_event_reminders"));
  assert.ok(eventLookup && reminderLookup);
  assert.match(eventLookup.sql, /WHERE user_id = \$1 AND id = \$2::uuid/u);
  assert.deepEqual(eventLookup.values, [ownerId, eventId]);
  assert.match(reminderLookup.sql, /WHERE user_id = \$1[\s\S]*event_id = \$2::uuid[\s\S]*event_revision = \$3/u);
  assert.match(reminderLookup.sql, /LIMIT 367/u);
  assert.deepEqual(reminderLookup.values, [ownerId, eventId, 4]);
  assert.equal(JSON.stringify(status).includes("SMTP_"), false);
  assert.equal(calls.at(-1).sql, "COMMIT");
});

test("does not expose reminder status when the event is not owned by the account", async () => {
  const { pool, calls } = createPool(() => ({ rows: [] }));
  const repository = new CalendarRepository(pool);

  await assert.rejects(
    repository.getCalendarReminderStatus(ownerId, "de305d54-75b4-431b-adb2-eb6b9e546014"),
    (error) => error instanceof CalendarRouteError
      && error.status === 404
      && error.code === "EVENT_NOT_FOUND",
  );
  assert.equal(calls.some(({ sql }) => sql.includes("FROM calendar_event_reminders")), false);
  assert.equal(calls.at(-1).sql, "ROLLBACK");
});
