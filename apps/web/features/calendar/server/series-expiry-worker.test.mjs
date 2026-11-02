import assert from "node:assert/strict";
import test from "node:test";
import { runSeriesExpiryWorker } from "./series-expiry-worker.ts";

function makePool(ownerIds, lockAcquired = true, state = { lastUserId: null }) {
  const calls = [];
  const lockClient = {
    async query(sql, values = []) {
      calls.push({ sql, values, connection: "lock" });
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: lockAcquired }] };
      if (sql.includes("pg_advisory_unlock")) return { rows: [{ released: true }] };
      if (sql.includes("SELECT last_user_id")) return { rows: [{ last_user_id: state.lastUserId }] };
      if (sql.includes('FROM "user"')) {
        const after = sql.includes('WHERE "id" > $1') ? values[0] : null;
        const next = ownerIds.find((id) => after === null || id > after);
        return { rows: next ? [{ id: next }] : [] };
      }
      if (sql.includes("UPDATE calendar_series_expiry_worker_state")) {
        state.lastUserId = values[1];
        return { rows: [{ worker_name: values[0] }] };
      }
      return { rows: [] };
    },
    release(error) {
      calls.push({ releaseError: error?.message ?? null });
    },
  };
  const pool = {
    calls,
    async connect() {
      return lockClient;
    },
  };
  return { pool, state };
}

test("expires a bounded owner round and releases the singleton lock", async () => {
  const { pool, state } = makePool(["owner-a", "owner-b", "owner-c"]);
  const visited = [];
  const repository = {
    async expirePendingSeriesDrafts(ownerId, limit) {
      visited.push({ ownerId, limit });
      return ownerId === "owner-b" ? 2 : 0;
    },
  };
  const summary = await runSeriesExpiryWorker(pool, repository, { maximumOwners: 2, proposalLimit: 5 });

  assert.deepEqual(summary, {
    skipped: false,
    ownersVisited: 2,
    proposalsExpired: 2,
    failedOwners: 0,
  });
  assert.deepEqual(visited, [
    { ownerId: "owner-a", limit: 5 },
    { ownerId: "owner-b", limit: 5 },
  ]);
  assert.equal(state.lastUserId, "owner-b");
  assert.equal(pool.calls.some(({ sql }) => sql?.includes("pg_advisory_unlock")), true);
  assert.equal(pool.calls.some(({ sql }) => sql === "RESET chron.series_expiry_worker"), true);
  assert.equal(pool.calls.some(({ sql }) => sql === "RESET statement_timeout"), true);
  assert.equal(pool.calls.at(-1).releaseError, null);

  const nextRun = await runSeriesExpiryWorker(pool, repository, { maximumOwners: 2, proposalLimit: 5 });
  assert.equal(nextRun.ownersVisited, 2);
  assert.deepEqual(visited.slice(2).map(({ ownerId }) => ownerId), ["owner-c", "owner-a"]);
  assert.equal(state.lastUserId, "owner-a");
});

test("skips a second worker while the advisory lock is held", async () => {
  const { pool } = makePool(["owner-a"], false);
  let repositoryCalls = 0;
  const summary = await runSeriesExpiryWorker(pool, {
    async expirePendingSeriesDrafts() {
      repositoryCalls += 1;
      return 0;
    },
  });

  assert.deepEqual(summary, {
    skipped: true,
    ownersVisited: 0,
    proposalsExpired: 0,
    failedOwners: 0,
  });
  assert.equal(repositoryCalls, 0);
  assert.equal(pool.calls.some(({ sql }) => sql?.includes('FROM "user"')), false);
  assert.equal(pool.calls.at(-1).releaseError, null);
});

test("continues after an owner failure so later scheduled runs can retry", async () => {
  const { pool, state } = makePool(["owner-a", "owner-b"]);
  const visited = [];
  let firstAttempt = true;
  const repository = {
    async expirePendingSeriesDrafts(ownerId) {
      visited.push(ownerId);
      if (ownerId === "owner-a" && firstAttempt) {
        firstAttempt = false;
        throw new Error("sensitive database detail");
      }
      return 1;
    },
  };
  const summary = await runSeriesExpiryWorker(pool, {
    ...repository,
  });

  assert.deepEqual(summary, {
    skipped: false,
    ownersVisited: 2,
    proposalsExpired: 1,
    failedOwners: 1,
  });
  assert.deepEqual(visited, ["owner-a", "owner-b"]);
  assert.equal(JSON.stringify(summary).includes("sensitive database detail"), false);
  assert.equal(state.lastUserId, "owner-b");

  const retry = await runSeriesExpiryWorker(pool, repository);
  assert.equal(retry.failedOwners, 0);
  assert.deepEqual(visited.slice(2), ["owner-a", "owner-b"]);
});

test("keeps processing after the saved cursor account has been deleted", async () => {
  const { pool } = makePool(["owner-b", "owner-c"], true, { lastUserId: "owner-a" });
  const visited = [];
  await runSeriesExpiryWorker(pool, {
    async expirePendingSeriesDrafts(ownerId) {
      visited.push(ownerId);
      return 0;
    },
  }, { maximumOwners: 1 });

  assert.deepEqual(visited, ["owner-b"]);
});

test("run duration prevents starting another owner after the current bounded operation", async () => {
  const { pool } = makePool(["owner-a", "owner-b"]);
  const visited = [];
  const summary = await runSeriesExpiryWorker(pool, {
    async expirePendingSeriesDrafts(ownerId) {
      visited.push(ownerId);
      await new Promise((resolve) => setTimeout(resolve, 15));
      return 0;
    },
  }, { maximumOwners: 2, maximumRunMilliseconds: 5 });

  assert.equal(summary.ownersVisited, 1);
  assert.deepEqual(visited, ["owner-a"]);
});

test("rejects unbounded worker settings", async () => {
  await assert.rejects(
    runSeriesExpiryWorker(makePool([]).pool, { async expirePendingSeriesDrafts() { return 0; } }, {
      maximumOwners: 513,
    }),
    RangeError,
  );
});
