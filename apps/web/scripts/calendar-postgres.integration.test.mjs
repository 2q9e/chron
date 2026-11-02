import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";
import { CalendarRepository } from "../features/calendar/server/repository.ts";
import { ResearchRateLimitRepository } from "../features/research/server/rate-limit-repository.ts";

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

async function assertQueryRejectedInTransaction(client, query, validate) {
  await client.query("SAVEPOINT chron_expected_rejection");
  try {
    await assert.rejects(query(), validate);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT chron_expected_rejection");
    await client.query("RELEASE SAVEPOINT chron_expected_rejection");
  }
}

async function applyMigrations(client) {
  const names = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort();
  assert.ok(names.length > 0, "Expected calendar and authentication migrations.");
  for (const name of names) {
    let lineageFixture;
    if (name === "0012_calendar_series_lineage.sql") {
      const userId = `chron-lineage-${randomUUID()}`;
      const eventId = randomUUID();
      await client.query(
        `INSERT INTO "user" (id, name, email, "updatedAt")
         VALUES ($1, 'Synthetic lineage migration fixture', $2, CURRENT_TIMESTAMP)`,
        [userId, `${userId}@example.invalid`],
      );
      await client.query(
        `INSERT INTO calendar_events (
           id, user_id, kind, title, start_date, end_date,
           recurrence_frequency, recurrence_interval, recurrence_count
         ) VALUES (
           $1::uuid, $2, 'all-day', 'Synthetic recurring migration fixture',
           DATE '2026-11-02', DATE '2026-11-03', 'weekly', 1, 2
         )`,
        [eventId, userId],
      );
      lineageFixture = { userId, eventId };
    }
    await client.query(await readFile(join(migrationDirectory, name), "utf8"));
    if (lineageFixture) {
      const backfill = await client.query(
        `SELECT series_root_id::text FROM calendar_events WHERE id = $1::uuid`,
        [lineageFixture.eventId],
      );
      assert.equal(backfill.rows[0]?.series_root_id, lineageFixture.eventId);
      await client.query(`DELETE FROM "user" WHERE id = $1`, [lineageFixture.userId]);
    }
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
    const researchRateLimit = new ResearchRateLimitRepository(applicationPool);
    const researchWindowStart = new Date("2026-11-02T12:00:00.000Z");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(await researchRateLimit.consume(accountA, researchWindowStart), true);
    }
    assert.equal(await researchRateLimit.consume(accountA, researchWindowStart), false);
    assert.equal(await researchRateLimit.consume(accountB, researchWindowStart), true);
    assert.equal(
      await researchRateLimit.consume(accountA, new Date(researchWindowStart.getTime() + 60_000)),
      true,
    );
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
      accentColor: "#b44772",
      density: "comfortable",
      reduceMotion: true,
      weekStartsOn: 1,
      timeZone: "UTC",
      studyPlanner: {
        weekdays: [2, 4],
        dayStart: "08:15",
        dayEnd: "19:45",
        sessionMinutes: 75,
        eventBufferMinutes: 30,
        sessionBreakMinutes: 0,
      },
    };
    await repository.setPreferences(accountA, preferences);
    assert.deepEqual(await repository.getPreferences(accountA), preferences);
    assert.deepEqual(await repository.getPreferences(accountB), null);
    await assert.rejects(repository.setPreferences(accountA, {
      ...preferences,
      studyPlanner: { ...preferences.studyPlanner, weekdays: [2, 2] },
    }));
    assert.deepEqual(await repository.getPreferences(accountA), preferences);

    const cancelledOccurrenceKey = `${eventA}:2098-11-09`;
    await databasePool.query(
      `UPDATE calendar_events
       SET start_date = DATE '2098-11-02', end_date = DATE '2098-11-03',
           recurrence_frequency = 'weekly', recurrence_interval = 1, recurrence_count = 6,
           series_root_id = id,
           reminder_choice = 'event-day-9am', reminder_time_zone = 'UTC'
       WHERE user_id = $1 AND id = $2::uuid`,
      [accountA, eventA],
    );
    const lineage = await databasePool.query(
      `SELECT series_root_id::text FROM calendar_events WHERE id = $1::uuid`,
      [eventA],
    );
    assert.equal(lineage.rows[0]?.series_root_id, eventA);
    await databasePool.query(
      `INSERT INTO calendar_event_reminders (
         id, user_id, event_id, event_revision, occurrence_key, scheduled_at,
         time_zone, next_attempt_at, status
       ) VALUES (
         $1::uuid, $2, $3::uuid, 1, $4, TIMESTAMPTZ '2098-11-09 09:00:00+00',
         'UTC', TIMESTAMPTZ '2098-11-09 09:00:00+00', 'pending'
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
    const cancelledOccurrences = await repository.listCancelledOccurrences(
      accountA,
      "2098-11-09",
      "2098-11-10",
      "UTC",
    );
    assert.deepEqual(cancelledOccurrences.map((event) => event.occurrenceKey), [cancelledOccurrenceKey]);
    const exceptionClient = await applicationPool.connect();
    try {
      await exceptionClient.query("BEGIN");
      await exceptionClient.query("SELECT set_config('chron.user_id', $1, true)", [accountA]);
      const ownExceptionsBeforeRestore = await exceptionClient.query(
        "SELECT event_id, occurrence_key FROM calendar_event_occurrence_exceptions WHERE user_id = $1",
        [accountA],
      );
      assert.deepEqual(ownExceptionsBeforeRestore.rows, [{
        event_id: eventA,
        occurrence_key: cancelledOccurrenceKey,
      }]);
      const otherOwnerExceptionsBeforeRestore = await exceptionClient.query(
        "SELECT event_id FROM calendar_event_occurrence_exceptions WHERE user_id = $1",
        [accountB],
      );
      assert.deepEqual(otherOwnerExceptionsBeforeRestore.rows, []);
      await exceptionClient.query("COMMIT");
    } finally {
      exceptionClient.release();
    }
    assert.deepEqual(
      await repository.listEvents(accountA, "2098-11-09", "2098-11-10", "UTC"),
      [],
    );
    assert.deepEqual(
      await repository.findConflicts(accountA, {
        kind: "all-day",
        title: "Replacement exam review",
        startDate: "2098-11-09",
        endDate: "2098-11-10",
      }, "UTC"),
      [],
    );
    assert.deepEqual(
      (await repository.listEvents(accountA, "2098-11-02", "2098-11-03", "UTC"))
        .map((event) => event.occurrenceKey),
      [`${eventA}:2098-11-02`],
    );
    assert.equal((await repository.getCalendarReminderStatus(accountA, eventA)).cancelled, 1);

    const restorationDraft = await repository.createSeriesDraft(accountA, {
      action: "restore-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 1,
      occurrenceKey: cancelledOccurrenceKey,
      calendarTimeZone: "UTC",
    }, "postgres-occurrence-restore");
    assert.deepEqual(restorationDraft.afterOccurrences.map(({ occurrenceKey }) => occurrenceKey), [cancelledOccurrenceKey]);
    const restoration = await repository.approveSeriesDraft(accountA, restorationDraft.id);
    assert.equal(restoration.outcome, "approved");
    assert.deepEqual(
      (await repository.listEvents(accountA, "2098-11-09", "2098-11-10", "UTC"))
        .map((event) => event.occurrenceKey),
      [cancelledOccurrenceKey],
    );
    assert.equal((await repository.getCalendarReminderStatus(accountA, eventA)).pending, 1);
    assert.equal((await repository.getCalendarReminderStatus(accountA, eventA)).cancelled, 0);
    assert.deepEqual(
      await repository.listCancelledOccurrences(accountA, "2098-11-09", "2098-11-10", "UTC"),
      [],
    );

    const movedOccurrenceKey = `${eventA}:2098-11-16`;
    const moveDraft = await repository.createSeriesDraft(accountA, {
      action: "move-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 1,
      occurrenceKey: movedOccurrenceKey,
      calendarTimeZone: "UTC",
      movement: { kind: "all-day", startDate: "2098-12-01", endDate: "2098-12-02" },
    }, "postgres-occurrence-move");
    assert.equal(moveDraft.beforeOccurrences[0].startDate, "2098-11-16");
    assert.equal(moveDraft.afterOccurrences[0].startDate, "2098-12-01");
    assert.equal((await repository.approveSeriesDraft(accountA, moveDraft.id)).outcome, "approved");
    assert.deepEqual(
      (await repository.listEvents(accountA, "2098-12-01", "2098-12-02", "UTC"))
        .filter((event) => event.occurrenceKey === movedOccurrenceKey)
        .map((event) => event.startDate),
      ["2098-12-01"],
    );
    assert.deepEqual(
      (await repository.listEvents(accountA, "2098-11-16", "2098-11-17", "UTC"))
        .filter((event) => event.occurrenceKey === movedOccurrenceKey),
      [],
    );
    assert.deepEqual(
      await repository.findConflicts(accountA, {
        kind: "all-day",
        title: "Old schedule",
        startDate: "2098-11-16",
        endDate: "2098-11-17",
      }, "UTC"),
      [],
    );

    const cancelMovedDraft = await repository.createSeriesDraft(accountA, {
      action: "cancel-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 1,
      occurrenceKey: movedOccurrenceKey,
    }, "postgres-cancel-moved-occurrence");
    assert.equal((await repository.approveSeriesDraft(accountA, cancelMovedDraft.id)).outcome, "approved");
    assert.deepEqual(
      (await repository.listCancelledOccurrences(accountA, "2098-12-01", "2098-12-02", "UTC"))
        .map((event) => event.occurrenceKey),
      [movedOccurrenceKey],
    );
    const restoreMovedDraft = await repository.createSeriesDraft(accountA, {
      action: "restore-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 1,
      occurrenceKey: movedOccurrenceKey,
      calendarTimeZone: "UTC",
    }, "postgres-restore-moved-occurrence");
    assert.equal(restoreMovedDraft.afterOccurrences[0].startDate, "2098-12-01");
    assert.equal((await repository.approveSeriesDraft(accountA, restoreMovedDraft.id)).outcome, "approved");
    assert.deepEqual(
      (await repository.listEvents(accountA, "2098-12-01", "2098-12-02", "UTC"))
        .filter((event) => event.occurrenceKey === movedOccurrenceKey)
        .map((event) => event.startDate),
      ["2098-12-01"],
    );
    assert.equal((await repository.getCalendarReminderStatus(accountA, eventA)).pending, 2);

    const attemptedOccurrenceKey = `${eventA}:2098-11-23`;
    const attemptedWithoutCurrentJobKey = `${eventA}:2098-11-30`;
    const noReminderHistoryKey = `${eventA}:2098-12-07`;
    await databasePool.query(
      `UPDATE calendar_events SET revision = 2 WHERE user_id = $1 AND id = $2::uuid`,
      [accountA, eventA],
    );
    await databasePool.query(
      `INSERT INTO calendar_event_occurrence_exceptions (user_id, event_id, occurrence_key)
       VALUES ($1, $2::uuid, $3), ($1, $2::uuid, $4), ($1, $2::uuid, $5)`,
      [accountA, eventA, attemptedOccurrenceKey, attemptedWithoutCurrentJobKey, noReminderHistoryKey],
    );
    await databasePool.query(
      `INSERT INTO calendar_event_reminders (
         id, user_id, event_id, event_revision, occurrence_key, scheduled_at,
         time_zone, next_attempt_at, status, attempt_count
       ) VALUES
         ($1::uuid, $4, $5::uuid, 1, $6, TIMESTAMPTZ '2098-11-16 09:00:00+00',
          'UTC', TIMESTAMPTZ '2098-11-16 09:00:00+00', 'cancelled', 1),
         ($2::uuid, $4, $5::uuid, 2, $6, TIMESTAMPTZ '2098-11-16 09:00:00+00',
          'UTC', TIMESTAMPTZ '2098-11-16 09:00:00+00', 'cancelled', 0),
         ($3::uuid, $4, $5::uuid, 1, $7, TIMESTAMPTZ '2098-11-23 09:00:00+00',
          'UTC', TIMESTAMPTZ '2098-11-23 09:00:00+00', 'cancelled', 1)`,
      [randomUUID(), randomUUID(), randomUUID(), accountA, eventA, attemptedOccurrenceKey, attemptedWithoutCurrentJobKey],
    );
    const priorAttemptDraft = await repository.createSeriesDraft(accountA, {
      action: "restore-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 2,
      occurrenceKey: attemptedOccurrenceKey,
      calendarTimeZone: "UTC",
    }, "postgres-restore-prior-attempt");
    assert.equal((await repository.approveSeriesDraft(accountA, priorAttemptDraft.id)).outcome, "approved");
    let currentReminderStatus = await repository.getCalendarReminderStatus(accountA, eventA);
    assert.equal(currentReminderStatus.pending, 0);
    assert.equal(currentReminderStatus.cancelled, 1);

    const noCurrentJobDraft = await repository.createSeriesDraft(accountA, {
      action: "restore-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 2,
      occurrenceKey: attemptedWithoutCurrentJobKey,
      calendarTimeZone: "UTC",
    }, "postgres-restore-prior-attempt-no-current-job");
    assert.equal((await repository.approveSeriesDraft(accountA, noCurrentJobDraft.id)).outcome, "approved");
    currentReminderStatus = await repository.getCalendarReminderStatus(accountA, eventA);
    assert.equal(currentReminderStatus.pending, 0);
    assert.equal(currentReminderStatus.cancelled, 1);

    const freshReminderDraft = await repository.createSeriesDraft(accountA, {
      action: "restore-occurrence",
      scope: "occurrence",
      targetEventId: eventA,
      targetRevision: 2,
      occurrenceKey: noReminderHistoryKey,
      calendarTimeZone: "UTC",
    }, "postgres-restore-without-reminder-history");
    assert.equal((await repository.approveSeriesDraft(accountA, freshReminderDraft.id)).outcome, "approved");
    currentReminderStatus = await repository.getCalendarReminderStatus(accountA, eventA);
    assert.equal(currentReminderStatus.pending, 1);
    assert.equal(currentReminderStatus.cancelled, 1);

    const splitSeed = await repository.createSeriesDraft(accountA, {
      action: "create",
      scope: "series",
      event: {
        kind: "all-day",
        title: "Following segment source",
        startDate: "2099-02-02",
        endDate: "2099-02-03",
        reminderChoice: "event-day-9am",
        reminderTimeZone: "UTC",
      },
      recurrenceRule: { frequency: "weekly", interval: 1, count: 4 },
      calendarTimeZone: "UTC",
    }, `postgres-split-seed-${randomUUID()}`);
    const splitSource = await repository.approveSeriesDraft(accountA, splitSeed.id);
    assert.equal(splitSource.outcome, "approved");
    assert.equal(splitSource.event.reminderChoice, "event-day-9am");
    assert.equal(splitSource.event.reminderTimeZone, "UTC");
    const splitSourceId = splitSource.event.id;
    const seededSplitReminders = await databasePool.query(
      `SELECT occurrence_key
       FROM calendar_event_reminders
       WHERE user_id = $1 AND event_id = $2::uuid
       ORDER BY occurrence_key`,
      [accountA, splitSourceId],
    );
    assert.equal(seededSplitReminders.rows.length, 4);
    const splitSourceKeys = [2, 9, 16, 23].map((day) =>
      `${splitSourceId}:2099-02-${String(day).padStart(2, "0")}`
    );
    await databasePool.query(
      `INSERT INTO calendar_event_occurrence_exceptions (
         user_id, event_id, occurrence_key, is_cancelled, cancelled_at,
         moved_start_date, moved_end_date
       ) VALUES
         ($1, $2::uuid, $3, TRUE, CURRENT_TIMESTAMP, NULL, NULL),
         ($1, $2::uuid, $4, FALSE, NULL, DATE '2099-03-02', DATE '2099-03-03')`,
      [accountA, splitSourceId, splitSourceKeys[3], splitSourceKeys[2]],
    );
    await databasePool.query(
      `UPDATE calendar_event_reminders
       SET status = 'failed', attempt_count = 1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND event_id = $2::uuid AND occurrence_key = $3`,
      [accountA, splitSourceId, splitSourceKeys[1]],
    );
    const splitDraft = await repository.createSeriesDraft(accountA, {
      action: "split-series",
      scope: "following",
      targetEventId: splitSourceId,
      targetRevision: splitSource.event.revision,
      occurrenceKey: splitSourceKeys[1],
      event: {
        kind: "all-day",
        title: "Revised following segment",
        startDate: "2099-02-09",
        endDate: "2099-02-10",
        reminderChoice: "event-day-9am",
        reminderTimeZone: "UTC",
      },
      recurrenceRule: { frequency: "weekly", interval: 1, count: 3 },
      calendarTimeZone: "UTC",
    }, `postgres-split-review-${randomUUID()}`);
    assert.equal(splitDraft.outcome, "pending");
    assert.equal(splitDraft.beforeOccurrences.length, 4);
    assert.equal(splitDraft.afterOccurrences.length, 4);
    assert.equal(splitDraft.afterOccurrences[0].occurrenceKey, splitSourceKeys[0]);
    assert.equal(splitDraft.afterOccurrences[1].kind, "all-day");
    assert.equal(splitDraft.afterOccurrences[1].startDate, "2099-02-09");
    const splitApproval = await repository.approveSeriesDraft(accountA, splitDraft.id);
    assert.equal(splitApproval.outcome, "approved");
    assert.notEqual(splitApproval.event.id, splitSourceId);
    assert.equal(splitApproval.event.seriesRootId, splitSourceId);
    assert.deepEqual(splitApproval.event.recurrenceRule, {
      frequency: "weekly",
      interval: 1,
      count: 3,
    });
    const splitSourceRow = await databasePool.query(
      `SELECT recurrence_count, revision, series_root_id::text
       FROM calendar_events WHERE user_id = $1 AND id = $2::uuid`,
      [accountA, splitSourceId],
    );
    assert.deepEqual(splitSourceRow.rows[0], {
      recurrence_count: 1,
      revision: 2,
      series_root_id: splitSourceId,
    });
    const splitExceptions = await databasePool.query(
      `SELECT event_id::text, occurrence_key, is_cancelled,
              moved_start_date::text, moved_end_date::text
       FROM calendar_event_occurrence_exceptions
       WHERE user_id = $1 AND event_id = ANY($2::uuid[])
       ORDER BY event_id, occurrence_key`,
      [accountA, [splitSourceId, splitApproval.event.id]],
    );
    assert.deepEqual(splitExceptions.rows, [
      {
        event_id: splitApproval.event.id,
        occurrence_key: `${splitApproval.event.id}:2099-02-16`,
        is_cancelled: false,
        moved_start_date: "2099-03-02",
        moved_end_date: "2099-03-03",
      },
      {
        event_id: splitApproval.event.id,
        occurrence_key: `${splitApproval.event.id}:2099-02-23`,
        is_cancelled: true,
        moved_start_date: null,
        moved_end_date: null,
      },
    ]);
    assert.deepEqual(
      (await repository.listEvents(accountA, "2099-03-02", "2099-03-03", "UTC"))
        .filter((event) => event.seriesId === splitApproval.event.id)
        .map((event) => [event.occurrenceKey, event.startDate]),
      [[`${splitApproval.event.id}:2099-02-16`, "2099-03-02"]],
    );
    assert.deepEqual(
      (await repository.listCancelledOccurrences(accountA, "2099-02-23", "2099-02-24", "UTC"))
        .map((event) => event.occurrenceKey),
      [`${splitApproval.event.id}:2099-02-23`],
    );
    const oldReminderRows = await databasePool.query(
      `SELECT occurrence_key, event_revision, status, attempt_count
       FROM calendar_event_reminders
       WHERE user_id = $1 AND event_id = $2::uuid
       ORDER BY occurrence_key`,
      [accountA, splitSourceId],
    );
    assert.deepEqual(oldReminderRows.rows, [
      { occurrence_key: splitSourceKeys[0], event_revision: 2, status: "pending", attempt_count: 0 },
      { occurrence_key: splitSourceKeys[1], event_revision: 1, status: "failed", attempt_count: 1 },
      { occurrence_key: splitSourceKeys[2], event_revision: 1, status: "cancelled", attempt_count: 0 },
      { occurrence_key: splitSourceKeys[3], event_revision: 1, status: "cancelled", attempt_count: 0 },
    ]);
    const newReminderRows = await databasePool.query(
      `SELECT occurrence_key, event_revision, status, attempt_count
       FROM calendar_event_reminders
       WHERE user_id = $1 AND event_id = $2::uuid
       ORDER BY occurrence_key`,
      [accountA, splitApproval.event.id],
    );
    assert.deepEqual(newReminderRows.rows, [{
      occurrence_key: `${splitApproval.event.id}:2099-02-16`,
      event_revision: 1,
      status: "pending",
      attempt_count: 0,
    }]);

    const staleSeed = await repository.createSeriesDraft(accountA, {
      action: "create",
      scope: "series",
      event: { kind: "all-day", title: "Stale split source", startDate: "2099-04-01", endDate: "2099-04-02" },
      recurrenceRule: { frequency: "weekly", interval: 1, count: 3 },
      calendarTimeZone: "UTC",
    }, `postgres-stale-split-seed-${randomUUID()}`);
    const staleSource = await repository.approveSeriesDraft(accountA, staleSeed.id);
    const staleSplit = await repository.createSeriesDraft(accountA, {
      action: "split-series",
      scope: "following",
      targetEventId: staleSource.event.id,
      targetRevision: staleSource.event.revision,
      occurrenceKey: `${staleSource.event.id}:2099-04-08`,
      event: { kind: "all-day", title: "Stale split source", startDate: "2099-04-08", endDate: "2099-04-09" },
      recurrenceRule: { frequency: "weekly", interval: 1, count: 2 },
      calendarTimeZone: "UTC",
    }, `postgres-stale-split-review-${randomUUID()}`);
    await databasePool.query(
      "UPDATE calendar_events SET revision = revision + 1 WHERE user_id = $1 AND id = $2::uuid",
      [accountA, staleSource.event.id],
    );
    assert.equal((await repository.approveSeriesDraft(accountA, staleSplit.id)).outcome, "stale");

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
      "research_web_rate_limits",
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
    const unscopedResearchLimits = await applicationPool.query(
      "SELECT count(*)::integer AS count FROM research_web_rate_limits",
    );
    assert.equal(unscopedResearchLimits.rows[0].count, 0);

    const client = await applicationPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('chron.user_id', $1, true)", [accountA]);
      const ownRows = await client.query(
        "SELECT id FROM calendar_events WHERE user_id = $1 AND id = $2::uuid",
        [accountA, eventA],
      );
      assert.deepEqual(ownRows.rows.map((row) => row.id), [eventA]);
      const ownExceptions = await client.query(
        "SELECT event_id, occurrence_key FROM calendar_event_occurrence_exceptions WHERE user_id = $1 AND event_id = $2::uuid",
        [accountA, eventA],
      );
      assert.deepEqual(ownExceptions.rows, [{
        event_id: eventA,
        occurrence_key: movedOccurrenceKey,
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
      await assertQueryRejectedInTransaction(
        client,
        () => client.query(
          `INSERT INTO calendar_events (id, user_id, kind, title, start_date, end_date)
           VALUES ($1::uuid, $2, 'all-day', 'Cross-owner write', DATE '2026-11-02', DATE '2026-11-03')`,
          [randomUUID(), accountB],
        ),
        (error) => error?.code === "42501",
      );
      await assertQueryRejectedInTransaction(
        client,
        () => client.query(
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
    const researchLimitCascadeCheck = await databasePool.query(
      "SELECT count(*)::integer AS count FROM research_web_rate_limits WHERE user_id = ANY($1::text[])",
      [[accountA, accountB]],
    );
    assert.equal(researchLimitCascadeCheck.rows[0].count, 0);
  } finally {
    await applicationPool?.end();
    await databasePool?.end();
    if (databaseCreated) await adminPool.query(`DROP DATABASE ${databaseIdentifier}`);
    if (roleCreated) await adminPool.query(`DROP ROLE ${roleIdentifier}`);
    await adminPool.end();
  }
});
