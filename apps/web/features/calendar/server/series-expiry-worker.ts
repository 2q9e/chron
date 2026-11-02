import type { Pool, PoolClient, QueryResultRow } from "pg";

const expiryLockName = "chron:calendar-series-proposal-expiry";
const expiryWorkerName = "series-proposals";
const defaultMaximumOwnersPerRun = 128;
const maximumOwnersPerRun = 512;
const defaultProposalLimit = 100;
const maximumProposalLimit = 500;
const defaultMaximumRunMilliseconds = 30_000;
const maximumRunMilliseconds = 120_000;

type OwnerRow = QueryResultRow & { id: string };
type LockRow = QueryResultRow & { acquired: boolean };
type CursorRow = QueryResultRow & { last_user_id: string | null };
type UpdateCursorRow = QueryResultRow & { worker_name: string };

export type SeriesExpiryRepository = Readonly<{
  expirePendingSeriesDrafts(ownerId: string, limit?: number): Promise<number>;
}>;

export type SeriesExpiryRunSummary = Readonly<{
  skipped: boolean;
  ownersVisited: number;
  proposalsExpired: number;
  failedOwners: number;
}>;

export type SeriesExpiryRunOptions = Readonly<{
  maximumOwners?: number;
  proposalLimit?: number;
  maximumRunMilliseconds?: number;
}>;

function boundedOption(
  value: number | undefined,
  fallback: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

async function nextOwner(
  connection: Pick<PoolClient, "query">,
  afterOwnerId: string | null,
): Promise<string | null> {
  const result = afterOwnerId === null
    ? await connection.query<OwnerRow>(
        `SELECT "id" FROM "user" ORDER BY "id" LIMIT 1`,
      )
    : await connection.query<OwnerRow>(
        `SELECT "id" FROM "user" WHERE "id" > $1 ORDER BY "id" LIMIT 1`,
        [afterOwnerId],
      );
  return result.rows[0]?.id ?? null;
}

export async function runSeriesExpiryWorker(
  pool: Pick<Pool, "connect">,
  repository: SeriesExpiryRepository,
  options: SeriesExpiryRunOptions = {},
): Promise<SeriesExpiryRunSummary> {
  const ownersLimit = boundedOption(
    options.maximumOwners,
    defaultMaximumOwnersPerRun,
    maximumOwnersPerRun,
    "maximumOwners",
  );
  const proposalLimit = boundedOption(
    options.proposalLimit,
    defaultProposalLimit,
    maximumProposalLimit,
    "proposalLimit",
  );
  const runDurationLimit = boundedOption(
    options.maximumRunMilliseconds,
    defaultMaximumRunMilliseconds,
    maximumRunMilliseconds,
    "maximumRunMilliseconds",
  );

  const lockClient: PoolClient = await pool.connect();
  let lockAcquired = false;
  try {
    await lockClient.query("SET statement_timeout = '5000ms'");
    const lock = await lockClient.query<LockRow>(
      "SELECT pg_try_advisory_lock(hashtextextended($1::text, 0)) AS acquired",
      [expiryLockName],
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) {
      return {
        skipped: true,
        ownersVisited: 0,
        proposalsExpired: 0,
        failedOwners: 0,
      };
    }

    await lockClient.query(
      "SELECT set_config('chron.series_expiry_worker', 'enabled', false)",
    );
    const cursorState = await lockClient.query<CursorRow>(
      `SELECT last_user_id
       FROM calendar_series_expiry_worker_state
       WHERE worker_name = $1`,
      [expiryWorkerName],
    );
    if (!cursorState.rows[0]) {
      throw new Error("Calendar expiry worker state is not initialized.");
    }

    const startedAt = Date.now();
    let cursor = cursorState.rows[0].last_user_id;
    const visitedOwnerIds = new Set<string>();
    let ownersVisited = 0;
    let proposalsExpired = 0;
    let failedOwners = 0;

    while (ownersVisited < ownersLimit && Date.now() - startedAt < runDurationLimit) {
      let ownerId = await nextOwner(lockClient, cursor);
      if (ownerId === null && cursor !== null) {
        cursor = null;
        ownerId = await nextOwner(lockClient, null);
      }
      if (ownerId === null || visitedOwnerIds.has(ownerId)) break;

      visitedOwnerIds.add(ownerId);
      ownersVisited += 1;
      try {
        const count = await repository.expirePendingSeriesDrafts(ownerId, proposalLimit);
        if (!Number.isInteger(count) || count < 0 || count > proposalLimit) {
          throw new Error("Calendar expiry repository returned an invalid row count.");
        }
        proposalsExpired += count;
      } catch {
        // The cursor still advances. This owner is retried after the cursor
        // wraps; never log account IDs or database error text here.
        failedOwners += 1;
      }

      cursor = ownerId;
      const updatedCursor = await lockClient.query<UpdateCursorRow>(
        `UPDATE calendar_series_expiry_worker_state
         SET last_user_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE worker_name = $1
         RETURNING worker_name`,
        [expiryWorkerName, cursor],
      );
      if (!updatedCursor.rows[0]) {
        throw new Error("Calendar expiry worker cursor could not be persisted.");
      }
    }

    return { skipped: false, ownersVisited, proposalsExpired, failedOwners };
  } finally {
    let releaseError: Error | undefined;
    try {
      if (lockAcquired) {
        const unlocked = await lockClient.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1::text, 0)) AS released",
          [expiryLockName],
        );
        if (unlocked.rows[0]?.released !== true) {
          throw new Error("Calendar expiry scheduler lock was not held by this worker.");
        }
      }
      await lockClient.query("RESET chron.series_expiry_worker");
      await lockClient.query("RESET statement_timeout");
    } catch {
      releaseError = new Error("Calendar expiry lock cleanup failed.");
    }
    lockClient.release(releaseError);
    if (releaseError) {
      throw new Error("Calendar expiry worker could not release its scheduler lock.");
    }
  }
}
