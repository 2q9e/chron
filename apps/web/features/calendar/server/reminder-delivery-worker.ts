import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  CalendarReminderClaim,
  CalendarReminderDeliveryContext,
} from "./repository.ts";
import type { CalendarReminderEmailInput } from "../../auth/server/email.ts";

const workerName = "reminders";
const workerLockName = "chron:calendar-reminder-delivery";
const defaultMaximumOwners = 128;
const maximumOwners = 512;
const defaultClaimLimit = 3;
const maximumClaimLimit = 25;
const defaultMaximumRunMilliseconds = 45_000;
const maximumRunMilliseconds = 120_000;
const retryDelaysSeconds = [60, 300, 900, 3600] as const;

type OwnerRow = QueryResultRow & { id: string };
type LockRow = QueryResultRow & { acquired: boolean };
type CursorRow = QueryResultRow & { last_user_id: string | null };
type UpdatedCursorRow = QueryResultRow & { worker_name: string };

export type ReminderDeliveryRepository = Readonly<{
  claimCalendarReminderJobs(ownerId: string, limit?: number): Promise<readonly CalendarReminderClaim[]>;
  calendarReminderLeaseIsCurrent(ownerId: string, claim: CalendarReminderClaim): Promise<boolean>;
  calendarReminderDeliveryContext(
    ownerId: string,
    claim: CalendarReminderClaim,
  ): Promise<CalendarReminderDeliveryContext | null>;
  recordCalendarReminderOutcome(
    ownerId: string,
    claim: CalendarReminderClaim,
    outcome:
      | Readonly<{ kind: "sent" }>
      | Readonly<{ kind: "cancelled" }>
      | Readonly<{ kind: "failed"; errorCode: string }>
      | Readonly<{ kind: "retry"; errorCode: string; delaySeconds: number }>,
  ): Promise<boolean>;
}>;

export type ReminderDeliverySummary = Readonly<{
  skipped: boolean;
  ownersVisited: number;
  attempts: number;
  accepted: number;
  retried: number;
  failed: number;
  stale: number;
  failedOwners: number;
}>;

export type ReminderDeliveryRunOptions = Readonly<{
  maximumOwners?: number;
  claimLimit?: number;
  maximumRunMilliseconds?: number;
}>;

export type ReminderEmailSender = (message: CalendarReminderEmailInput) => Promise<void>;

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
    ? await connection.query<OwnerRow>(`SELECT "id" FROM "user" ORDER BY "id" LIMIT 1`)
    : await connection.query<OwnerRow>(
        `SELECT "id" FROM "user" WHERE "id" > $1 ORDER BY "id" LIMIT 1`,
        [afterOwnerId],
      );
  return result.rows[0]?.id ?? null;
}

function deliveryFailure(error: unknown): Readonly<{ code: string; retryable: boolean }> {
  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; retryable?: unknown };
    if (typeof candidate.code === "string"
      && /^[A-Z0-9_]{1,64}$/u.test(candidate.code)
      && typeof candidate.retryable === "boolean") {
      return { code: candidate.code, retryable: candidate.retryable };
    }
  }
  return { code: "SMTP_TRANSIENT", retryable: true };
}

async function deliverOwnerBatch(
  ownerId: string,
  repository: ReminderDeliveryRepository,
  send: ReminderEmailSender,
  claimLimit: number,
): Promise<Pick<ReminderDeliverySummary, "attempts" | "accepted" | "retried" | "failed" | "stale">> {
  const summary = { attempts: 0, accepted: 0, retried: 0, failed: 0, stale: 0 };
  const claims = await repository.claimCalendarReminderJobs(ownerId, claimLimit);
  for (const claim of claims) {
    if (!claim.recipientVerified) {
      if (await repository.recordCalendarReminderOutcome(ownerId, claim, {
        kind: "failed",
        errorCode: "RECIPIENT_UNVERIFIED",
      })) summary.failed += 1;
      continue;
    }
    if (!claim.recipient || claim.recipient.length > 320
      || /[\r\n\u0000]/u.test(claim.recipient) || !claim.recipient.includes("@")) {
      if (await repository.recordCalendarReminderOutcome(ownerId, claim, {
        kind: "failed",
        errorCode: "RECIPIENT_INVALID",
      })) summary.failed += 1;
      continue;
    }
    if (!await repository.calendarReminderLeaseIsCurrent(ownerId, claim)) {
      summary.stale += 1;
      continue;
    }
    const context = await repository.calendarReminderDeliveryContext(ownerId, claim);
    if (!context) {
      if (await repository.recordCalendarReminderOutcome(ownerId, claim, { kind: "cancelled" })) {
        summary.stale += 1;
      }
      continue;
    }

    summary.attempts += 1;
    try {
      await send({ recipient: claim.recipient, ...context });
      if (await repository.recordCalendarReminderOutcome(ownerId, claim, { kind: "sent" })) {
        summary.accepted += 1;
      } else {
        summary.stale += 1;
      }
    } catch (error) {
      const failure = deliveryFailure(error);
      const canRetry = failure.retryable && claim.attemptCount < 5;
      const recorded = await repository.recordCalendarReminderOutcome(
        ownerId,
        claim,
        canRetry
          ? {
              kind: "retry",
              errorCode: failure.code,
              delaySeconds: retryDelaysSeconds[Math.min(claim.attemptCount - 1, retryDelaysSeconds.length - 1)],
            }
          : { kind: "failed", errorCode: failure.code },
      );
      if (recorded) {
        if (canRetry) summary.retried += 1;
        else summary.failed += 1;
      } else {
        summary.stale += 1;
      }
    }
  }
  return summary;
}

export async function runCalendarReminderDeliveryWorker(
  pool: Pick<Pool, "connect">,
  repository: ReminderDeliveryRepository,
  send: ReminderEmailSender,
  options: ReminderDeliveryRunOptions = {},
): Promise<ReminderDeliverySummary> {
  const ownersLimit = boundedOption(options.maximumOwners, defaultMaximumOwners, maximumOwners, "maximumOwners");
  const claimLimit = boundedOption(options.claimLimit, defaultClaimLimit, maximumClaimLimit, "claimLimit");
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
      [workerLockName],
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) {
      return {
        skipped: true,
        ownersVisited: 0,
        attempts: 0,
        accepted: 0,
        retried: 0,
        failed: 0,
        stale: 0,
        failedOwners: 0,
      };
    }

    await lockClient.query("SELECT set_config('chron.calendar_reminder_worker', 'enabled', false)");
    const cursorState = await lockClient.query<CursorRow>(
      `SELECT last_user_id
       FROM calendar_reminder_worker_state
       WHERE worker_name = $1`,
      [workerName],
    );
    if (!cursorState.rows[0]) throw new Error("Calendar reminder worker state is not initialized.");

    const startedAt = Date.now();
    let cursor = cursorState.rows[0].last_user_id;
    const visited = new Set<string>();
    const summary = {
      skipped: false,
      ownersVisited: 0,
      attempts: 0,
      accepted: 0,
      retried: 0,
      failed: 0,
      stale: 0,
      failedOwners: 0,
    };

    while (summary.ownersVisited < ownersLimit && Date.now() - startedAt < runDurationLimit) {
      let ownerId = await nextOwner(lockClient, cursor);
      if (ownerId === null && cursor !== null) {
        cursor = null;
        ownerId = await nextOwner(lockClient, null);
      }
      if (ownerId === null || visited.has(ownerId)) break;

      visited.add(ownerId);
      summary.ownersVisited += 1;
      try {
        const ownerSummary = await deliverOwnerBatch(ownerId, repository, send, claimLimit);
        summary.attempts += ownerSummary.attempts;
        summary.accepted += ownerSummary.accepted;
        summary.retried += ownerSummary.retried;
        summary.failed += ownerSummary.failed;
        summary.stale += ownerSummary.stale;
      } catch {
        summary.failedOwners += 1;
      }

      cursor = ownerId;
      const updated = await lockClient.query<UpdatedCursorRow>(
        `UPDATE calendar_reminder_worker_state
         SET last_user_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE worker_name = $1
         RETURNING worker_name`,
        [workerName, cursor],
      );
      if (!updated.rows[0]) throw new Error("Calendar reminder worker cursor could not be persisted.");
    }

    return summary;
  } finally {
    let releaseError: Error | undefined;
    try {
      if (lockAcquired) {
        const unlocked = await lockClient.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1::text, 0)) AS released",
          [workerLockName],
        );
        if (unlocked.rows[0]?.released !== true) {
          throw new Error("Calendar reminder scheduler lock was not held by this worker.");
        }
      }
      await lockClient.query("RESET chron.calendar_reminder_worker");
      await lockClient.query("RESET statement_timeout");
    } catch {
      releaseError = new Error("Calendar reminder lock cleanup failed.");
    }
    lockClient.release(releaseError);
    if (releaseError) throw new Error("Calendar reminder worker could not release its scheduler lock.");
  }
}
