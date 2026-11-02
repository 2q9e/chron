import assert from "node:assert/strict";
import test from "node:test";
import { runCalendarReminderDeliveryWorker } from "./reminder-delivery-worker.ts";

function makePool(ownerIds = ["owner-a"], lockAcquired = true, state = { lastUserId: null }) {
  const calls = [];
  const lockClient = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: lockAcquired }] };
      if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: true }] };
      if (sql.includes("SELECT last_user_id")) return { rows: [{ last_user_id: state.lastUserId }] };
      if (sql.includes('FROM "user"')) {
        const after = sql.includes('WHERE "id" > $1') ? values[0] : null;
        const next = ownerIds.find((id) => after === null || id > after);
        return { rows: next ? [{ id: next }] : [] };
      }
      if (sql.includes("UPDATE calendar_reminder_worker_state")) {
        state.lastUserId = values[1];
        return { rows: [{ worker_name: values[0] }] };
      }
      return { rows: [] };
    },
    release(error) {
      calls.push({ releaseError: error?.message ?? null });
    },
  };
  return { pool: { calls, async connect() { return lockClient; } }, state };
}

function validClaim(overrides = {}) {
  return {
    id: "reminder-1",
    eventId: "event-1",
    eventRevision: 2,
    occurrenceKey: "event-1:single",
    timeZone: "America/Montreal",
    attemptCount: 1,
    leaseToken: "lease-1",
    recipient: "student@example.test",
    recipientVerified: true,
    ...overrides,
  };
}

test("sends only a current verified reminder and records SMTP acceptance", async () => {
  const { pool } = makePool();
  const claim = validClaim();
  const outcomes = [];
  const sent = [];
  const repository = {
    async claimCalendarReminderJobs(ownerId, limit) {
      assert.equal(ownerId, "owner-a");
      assert.equal(limit, 3);
      return [claim];
    },
    async calendarReminderLeaseIsCurrent() { return true; },
    async calendarReminderDeliveryContext() {
      return {
        eventKind: "timed",
        eventStart: "2026-11-10T14:00:00.000Z",
        timeZone: "America/Montreal",
      };
    },
    async recordCalendarReminderOutcome(_owner, currentClaim, outcome) {
      outcomes.push({ currentClaim, outcome });
      return true;
    },
  };

  const summary = await runCalendarReminderDeliveryWorker(pool, repository, async (message) => {
    sent.push(message);
  }, { maximumOwners: 1 });

  assert.deepEqual(summary, {
    skipped: false,
    ownersVisited: 1,
    attempts: 1,
    accepted: 1,
    retried: 0,
    failed: 0,
    stale: 0,
    failedOwners: 0,
  });
  assert.deepEqual(sent, [{
    recipient: "student@example.test",
    eventKind: "timed",
    eventStart: "2026-11-10T14:00:00.000Z",
    timeZone: "America/Montreal",
  }]);
  assert.equal(outcomes[0].outcome.kind, "sent");
});

test("never sends to unverified accounts", async () => {
  const { pool } = makePool();
  const outcomes = [];
  let sendCount = 0;
  const repository = {
    async claimCalendarReminderJobs() { return [validClaim({ recipientVerified: false })]; },
    async calendarReminderLeaseIsCurrent() { throw new Error("must not check lease"); },
    async calendarReminderDeliveryContext() { throw new Error("must not read event"); },
    async recordCalendarReminderOutcome(_owner, claim, outcome) {
      outcomes.push({ claim, outcome });
      return true;
    },
  };
  const summary = await runCalendarReminderDeliveryWorker(pool, repository, async () => {
    sendCount += 1;
  }, { maximumOwners: 1 });

  assert.equal(sendCount, 0);
  assert.equal(summary.failed, 1);
  assert.equal(outcomes[0].outcome.errorCode, "RECIPIENT_UNVERIFIED");
});

test("retries transient failures with a bounded delay and hides provider details", async () => {
  const { pool } = makePool();
  const outcomes = [];
  const repository = {
    async claimCalendarReminderJobs() { return [validClaim({ attemptCount: 2 })]; },
    async calendarReminderLeaseIsCurrent() { return true; },
    async calendarReminderDeliveryContext() {
      return { eventKind: "all-day", eventStart: "2026-11-10", timeZone: "UTC" };
    },
    async recordCalendarReminderOutcome(_owner, _claim, outcome) {
      outcomes.push(outcome);
      return true;
    },
  };
  const summary = await runCalendarReminderDeliveryWorker(pool, repository, async () => {
    throw Object.assign(new Error("private SMTP diagnostic"), {
      code: "SMTP_TRANSIENT",
      retryable: true,
    });
  }, { maximumOwners: 1 });

  assert.equal(summary.retried, 1);
  assert.equal(outcomes[0].kind, "retry");
  assert.equal(outcomes[0].delaySeconds, 300);
  assert.equal(JSON.stringify(summary).includes("private SMTP diagnostic"), false);
});

test("stops retrying after the fifth transient attempt", async () => {
  const { pool } = makePool();
  const outcomes = [];
  const repository = {
    async claimCalendarReminderJobs() { return [validClaim({ attemptCount: 5 })]; },
    async calendarReminderLeaseIsCurrent() { return true; },
    async calendarReminderDeliveryContext() {
      return { eventKind: "timed", eventStart: "2026-11-10T14:00:00.000Z", timeZone: "UTC" };
    },
    async recordCalendarReminderOutcome(_owner, _claim, outcome) {
      outcomes.push(outcome);
      return true;
    },
  };
  const summary = await runCalendarReminderDeliveryWorker(pool, repository, async () => {
    throw { code: "SMTP_TRANSIENT", retryable: true };
  }, { maximumOwners: 1 });

  assert.equal(summary.failed, 1);
  assert.deepEqual(outcomes[0], { kind: "failed", errorCode: "SMTP_TRANSIENT" });
});

test("skips cancelled leases and prevents unbounded work options", async () => {
  const { pool } = makePool();
  let sends = 0;
  const repository = {
    async claimCalendarReminderJobs() { return [validClaim()]; },
    async calendarReminderLeaseIsCurrent() { return false; },
    async calendarReminderDeliveryContext() { throw new Error("must not read stale event"); },
    async recordCalendarReminderOutcome() { throw new Error("cancelled lease is already resolved"); },
  };
  const summary = await runCalendarReminderDeliveryWorker(pool, repository, async () => {
    sends += 1;
  }, { maximumOwners: 1 });

  assert.equal(sends, 0);
  assert.equal(summary.stale, 1);
  await assert.rejects(
    runCalendarReminderDeliveryWorker(pool, repository, async () => {}, { claimLimit: 26 }),
    /claimLimit/u,
  );
});

test("skips a concurrent scheduler while the database lock is held", async () => {
  const { pool } = makePool(["owner-a"], false);
  let claims = 0;
  const summary = await runCalendarReminderDeliveryWorker(pool, {
    async claimCalendarReminderJobs() { claims += 1; return []; },
    async calendarReminderLeaseIsCurrent() { return false; },
    async calendarReminderDeliveryContext() { return null; },
    async recordCalendarReminderOutcome() { return false; },
  }, async () => {});

  assert.equal(summary.skipped, true);
  assert.equal(claims, 0);
});
