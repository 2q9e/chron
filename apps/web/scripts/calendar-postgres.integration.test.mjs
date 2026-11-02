import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { CalendarRepository } from "../features/calendar/server/repository.ts";

const { Pool } = pg;
const migrationDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const databaseUrl = process.env.CHRON_TEST_DATABASE_URL;
const required = process.env.CHRON_TEST_REQUIRED === "1";

function assertLocalAdminUrl(value) {
  const url = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol), "Use a PostgreSQL URL.");
  assert.ok(["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname),
    "The integration test only accepts a loopback PostgreSQL server.");
  assert.equal(decodeURIComponent(url.pathname.slice(1)), "postgres",
    "The integration test connects to the disposable local postgres database.");
  return url;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function applyMigrations(client) {
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  assert.ok(names.length > 0, "Expected calendar and authentication migrations.");
  for (const name of names) {
    await client.query(await readFile(join(migrationDirectory, name), "utf8"));
  }
}

test("PostgreSQL migrations enforce calendar owner isolation and transaction-local context", {
  skip: !databaseUrl && !required,
}, async () => {
  assert.ok(databaseUrl, "CHRON_TEST_DATABASE_URL is required in CI.");
  const adminUrl = assertLocalAdminUrl(databaseUrl);
  const suffix = randomUUID().replaceAll("-", "");
  const databaseName = `chron_test_${suffix}`;
  const roleName = `chron_test_app_${suffix}`;
  const appPassword = randomBytes(32).toString("hex");
  const databaseIdentifier = quoteIdentifier(databaseName);
  const roleIdentifier = quoteIdentifier(roleName);
  const adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  let databasePool;
  let applicationPool;
  let databaseCreated = false;
  let roleCreated = false;

  try {
    await adminPool.query(`CREATE DATABASE ${databaseIdentifier}`);
    databaseCreated = true;
    await adminPool.query(
      `CREATE ROLE ${roleIdentifier} LOGIN PASSWORD ${quoteLiteral(appPassword)} ` +
        "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS",
    );
    roleCreated = true;

    const databaseAdminUrl = new URL(adminUrl);
    databaseAdminUrl.pathname = `/${databaseName}`;
    databasePool = new Pool({ connectionString: databaseAdminUrl.toString(), max: 1 });
    await applyMigrations(databasePool);
    await databasePool.query(`GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${roleIdentifier}`);
    await databasePool.query(`GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`);
    await databasePool.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleIdentifier}`,
    );
    await databasePool.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${roleIdentifier}`,
    );

    const applicationUrl = new URL(databaseAdminUrl);
    applicationUrl.username = roleName;
    applicationUrl.password = appPassword;
    applicationPool = new Pool({ connectionString: applicationUrl.toString(), max: 1 });

    const accountA = `chron-integration-a-${suffix}`;
    const accountB = `chron-integration-b-${suffix}`;
    const eventA = randomUUID();
    const eventB = randomUUID();
    await databasePool.query(
      `INSERT INTO "user" (id, name, email, "updatedAt")
       VALUES ($1, 'Chron integration account A', $2, CURRENT_TIMESTAMP),
              ($3, 'Chron integration account B', $4, CURRENT_TIMESTAMP)`,
      [accountA, `${accountA}@example.invalid`, accountB, `${accountB}@example.invalid`],
    );
    await databasePool.query(
      `INSERT INTO calendar_events (id, user_id, kind, title, start_date, end_date)
       VALUES ($1::uuid, $2, 'all-day', 'Owner A event', DATE '2026-11-02', DATE '2026-11-03'),
              ($3::uuid, $4, 'all-day', 'Owner B event', DATE '2026-11-02', DATE '2026-11-03')`,
      [eventA, accountA, eventB, accountB],
    );

    const repository = new CalendarRepository(applicationPool);
    const range = { from: "2026-11-01", to: "2026-11-04", timeZone: "UTC" };
    const eventsA = await repository.listEvents(accountA, range.from, range.to, range.timeZone);
    const eventsB = await repository.listEvents(accountB, range.from, range.to, range.timeZone);
    assert.deepEqual(eventsA.map((event) => event.id), [eventA]);
    assert.deepEqual(eventsB.map((event) => event.id), [eventB]);

    const matchesA = await repository.searchEvents(accountA, {
      query: "Owner A",
      from: range.from,
      to: range.to,
      timeZone: range.timeZone,
    });
    assert.deepEqual(matchesA.map((event) => event.id), [eventA]);
    assert.deepEqual(await repository.getPreferences(accountB), null);
    const preferences = {
      theme: "minimal-light",
      density: "comfortable",
      weekStartsOn: 1,
      timeZone: "UTC",
    };
    await repository.setPreferences(accountA, preferences);
    assert.deepEqual(await repository.getPreferences(accountA), preferences);
    assert.deepEqual(await repository.getPreferences(accountB), null);

    const cancelledOccurrenceKey = `${eventA}:2026-11-09`;
    await databasePool.query(
      `UPDATE calendar_events
       SET recurrence_frequency = 'weekly', recurrence_interval = 1, recurrence_count = 3,
           reminder_choice = 'event-day-9am', reminder_time_zone = 'UTC'
       WHERE user_id = $1 AND id = $2::uuid`,
      [accountA, eventA],
    );
    await databasePool.query(
      `INSERT INTO calendar_event_reminders (
         id, user_id, event_id, event_revision, occurrence_key, scheduled_at,
         time_zone, next_attempt_at, status
       ) VALUES (
         $1::uuid, $2, $3::uuid, 1, $4, TIMESTAMPTZ '2026-11-09 09:00:00+00',
         'UTC', TIMESTAMPTZ '2026-11-09 09:00:00+00', 'pending'
       )`,
      [randomUUID(), accountA, eventA, cancelledOccurrenceKey],
    );
    const cancellationDraft = await repository.createSeriesDraft(accountA, {
      action: "cancel-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 1,
      occurrenceKey: cancelledOccurrenceKey,
    }, "postgres-occurrence-cancel");
    assert.equal(cancellationDraft.beforeOccurrences.length, 1);
    const cancellation = await repository.approveSeriesDraft(accountA, cancellationDraft.id);
    assert.equal(cancellation.outcome, "approved");
    assert.deepEqual(
      await repository.listEvents(accountA, "2026-11-09", "2026-11-10", "UTC"),
      [],
    );
    assert.deepEqual(
      await repository.findConflicts(accountA, {
        kind: "all-day",
        title: "Replacement exam review",
        startDate: "2026-11-09",
        endDate: "2026-11-10",
      }, "UTC"),
      [],
    );
    assert.deepEqual(
      (await repository.listEvents(accountA, "2026-11-02", "2026-11-03", "UTC"))
        .map((event) => event.occurrenceKey),
      [`${eventA}:2026-11-02`],
    );
    assert.equal((await repository.getCalendarReminderStatus(accountA, eventA)).cancelled, 1);

    const appRole = await adminPool.query(
      "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1",
      [roleName],
    );
    assert.deepEqual(appRole.rows[0], { rolsuper: false, rolbypassrls: false });

    const rlsTables = [
      "calendar_events",
      "calendar_preferences",
      "calendar_event_create_requests",
      "calendar_event_series_proposal_drafts",
      "calendar_event_occurrence_exceptions",
      "calendar_series_expiry_worker_state",
      "calendar_event_reminders",
      "calendar_reminder_worker_state",
    ];
    const rlsResult = await databasePool.query(
      `SELECT relation.relname, relation.relrowsecurity, relation.relforcerowsecurity
       FROM pg_class relation
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])`,
      [rlsTables],
    );
    assert.equal(rlsResult.rows.length, rlsTables.length);
    assert.ok(rlsResult.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity));

    const unscoped = await applicationPool.query(
      "SELECT count(*)::integer AS count FROM calendar_events",
    );
    assert.equal(unscoped.rows[0].count, 0);
    const unscopedExceptions = await applicationPool.query(
      "SELECT count(*)::integer AS count FROM calendar_event_occurrence_exceptions",
    );
    assert.equal(unscopedExceptions.rows[0].count, 0);

    const client = await applicationPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('chron.user_id', $1, true)", [accountA]);
      const ownRows = await client.query(
        "SELECT id FROM calendar_events WHERE user_id = $1",
        [accountA],
      );
      assert.deepEqual(ownRows.rows.map((row) => row.id), [eventA]);
      const ownExceptions = await client.query(
        "SELECT event_id, occurrence_key FROM calendar_event_occurrence_exceptions WHERE user_id = $1",
        [accountA],
      );
      assert.deepEqual(ownExceptions.rows, [{
        event_id: eventA,
        occurrence_key: cancelledOccurrenceKey,
      }]);
      const crossOwnerExceptions = await client.query(
        "SELECT event_id FROM calendar_event_occurrence_exceptions WHERE user_id = $1",
        [accountB],
      );
      assert.deepEqual(crossOwnerExceptions.rows, []);
      const crossOwnerRows = await client.query(
        "SELECT id FROM calendar_events WHERE user_id = $1",
        [accountB],
      );
      assert.deepEqual(crossOwnerRows.rows, []);
      await assert.rejects(
        client.query(
          `INSERT INTO calendar_events (id, user_id, kind, title, start_date, end_date)
           VALUES ($1::uuid, $2, 'all-day', 'Cross-owner write', DATE '2026-11-02', DATE '2026-11-03')`,
          [randomUUID(), accountB],
        ),
        (error) => error?.code === "42501",
      );
      await assert.rejects(
        client.query(
          `INSERT INTO calendar_event_occurrence_exceptions (user_id, event_id, occurrence_key)
           VALUES ($1, $2::uuid, $3)`,
          [accountB, eventA, `${eventA}:2026-11-16`],
        ),
        (error) => error?.code === "42501" || error?.code === "23503",
      );
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    const resetContext = await applicationPool.query(
      "SELECT current_setting('chron.user_id', true) AS owner_id",
    );
    assert.ok(resetContext.rows[0].owner_id === null || resetContext.rows[0].owner_id === "");

    await databasePool.query('DELETE FROM "user" WHERE id = ANY($1::text[])', [[accountA, accountB]]);
    const cascadeCheck = await databasePool.query(
      "SELECT count(*)::integer AS count FROM calendar_events WHERE user_id = ANY($1::text[])",
      [[accountA, accountB]],
    );
    assert.equal(cascadeCheck.rows[0].count, 0);
    const exceptionCascadeCheck = await databasePool.query(
      "SELECT count(*)::integer AS count FROM calendar_event_occurrence_exceptions WHERE user_id = ANY($1::text[])",
      [[accountA, accountB]],
    );
    assert.equal(exceptionCascadeCheck.rows[0].count, 0);
  } finally {
    await applicationPool?.end();
    await databasePool?.end();
    if (databaseCreated) await adminPool.query(`DROP DATABASE ${databaseIdentifier}`);
    if (roleCreated) await adminPool.query(`DROP ROLE ${roleIdentifier}`);
    await adminPool.end();
  }
});
