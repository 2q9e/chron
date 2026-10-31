import assert from "node:assert/strict";
import test from "node:test";
import { CalendarRepository } from "./repository.ts";

const ownerId = "usr_aegis";

function createPool(queryHandler) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      calls.push({ sql: String(sql), values });
      return queryHandler(String(sql), values, calls.length);
    },
    release() {},
  };

  return {
    calls,
    pool: { async connect() { return client; } },
  };
}

test("creates an owner-scoped event inside one transaction", async () => {
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
  const { pool, calls } = createPool((sql) => ({
    rows: sql.startsWith("INSERT INTO calendar_events") ? [row] : [],
  }));
  const repository = new CalendarRepository(pool);
  const event = await repository.createEvent(ownerId, {
    kind: "timed",
    title: "Study session",
    startLocal: "2026-10-30T09:00",
    endLocal: "2026-10-30T10:00",
    timeZone: "America/Montreal",
  }, "America/Montreal", []);

  assert.equal(event.id, row.id);
  assert.equal(event.kind, "timed");
  assert.equal(calls.length, 7);
  assert.equal(calls[0].sql, "BEGIN");
  assert.equal(calls[1].sql, "SELECT set_config('chron.user_id', $1, true)");
  assert.match(calls[2].sql, /pg_advisory_xact_lock/);
  assert.match(calls[5].sql, /INSERT INTO calendar_events/);
  assert.equal(calls[6].sql, "COMMIT");
  assert.equal(calls[1].values[0], ownerId);
  assert.equal(calls[5].values[1], ownerId);
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
  const { pool, calls } = createPool((sql) => ({
    rows: sql.includes("FROM calendar_events") ? [conflictRow] : [],
  }));
  const repository = new CalendarRepository(pool);

  await assert.rejects(repository.createEvent(ownerId, {
    kind: "timed",
    title: "Study session",
    startLocal: "2026-10-30T09:30",
    endLocal: "2026-10-30T10:30",
    timeZone: "America/Montreal",
  }, "America/Montreal", []), (error) => error.code === "CONFLICT_REVIEW_REQUIRED");

  assert.match(calls[2].sql, /pg_advisory_xact_lock/);
  assert.match(calls[4].sql, /SELECT[\s\S]*FROM calendar_events/);
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
