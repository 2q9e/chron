import assert from "node:assert/strict";
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
