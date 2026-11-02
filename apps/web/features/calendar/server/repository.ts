import { createHash, randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  resolveLocalDateTime,
  resolveCalendarRange,
  resolveAllDayRange,
  resolveTimedDuration,
  validateTimeZone,
} from "../domain/time.ts";
import type {
  CalendarConflict,
  CalendarConflictReview,
  CalendarEventCommit,
  CalendarEvent,
  CalendarEventEntry,
  CalendarEventOccurrence,
  CalendarEventMutation,
  CalendarEventSearchRequest,
  CalendarPreferences,
  CalendarReminderFailureCounts,
  CalendarReminderStatusSummary,
  CalendarSeriesDraftRequest,
  CalendarOccurrenceMovementRequest,
  CalendarOccurrenceMovement,
  CalendarRecurrenceRule,
} from "../domain/types.ts";
import { applyCalendarOccurrenceMovement } from "../domain/occurrence-exceptions.ts";
import {
  allDayCalendarReminderChoices,
  scheduleCalendarReminder,
  timedCalendarReminderChoices,
  type CalendarReminderOccurrence,
} from "../domain/reminders.ts";
import {
  normalizeRecurrenceRule,
  RecurrenceError,
  type CalendarRecurrenceOccurrence,
} from "../domain/recurrence.ts";
import { expandCalendarRecurrenceRange } from "../domain/recurrence-range.ts";
import {
  expandFullCalendarSeries,
  findCalendarOccurrenceConflicts,
  findCalendarSeriesConflicts,
  occurrenceOverlapsCalendarInterval,
  type CalendarSeriesOccurrenceConflict,
  type CalendarOccurrenceMovements,
} from "./series-conflicts.ts";
import { parseCalendarSeriesDraftRequest } from "./validation.ts";
import { CalendarRouteError, calendarSearchTimeoutError } from "./errors.ts";

const maximumEventsPerRange = 1000;
const maximumEventsPerSearch = 1000;
const calendarSearchStatementTimeout = "2000ms";
const maximumConflictResults = 32;
const maximumSeriesProposalCandidateRows = 1000;
const seriesProposalTransactionLimits = {
  lockTimeout: "500ms",
  statementTimeout: "5000ms",
  idleTransactionTimeout: "5000ms",
} as const;

type EventRow = QueryResultRow & {
  id: string;
  kind: "timed" | "all-day";
  title: string;
  details: string | null;
  revision: number;
  reminder_choice: string | null;
  reminder_time_zone: string | null;
  start_local: string | null;
  end_local: string | null;
  time_zone: string | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  start_date: string | null;
  end_date: string | null;
  recurrence_frequency: string | null;
  recurrence_interval: number | null;
  recurrence_count: number | null;
  series_root_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type OccurrenceMovementRow = QueryResultRow & {
  event_id: string;
  occurrence_key: string;
  moved_start_local: string | null;
  moved_end_local: string | null;
  moved_time_zone: string | null;
  moved_starts_at: Date | string | null;
  moved_ends_at: Date | string | null;
  moved_start_date: string | null;
  moved_end_date: string | null;
};

type CalendarReminderClaimRow = QueryResultRow & {
  id: string;
  event_id: string;
  event_revision: number;
  occurrence_key: string;
  time_zone: string;
  attempt_count: number;
  lease_token: string;
  email: string | null;
  email_verified: boolean;
};

type CalendarReminderStatusRow = QueryResultRow & {
  status: string;
  attempt_count: number;
  next_attempt_at: Date | string;
  sent_at: Date | string | null;
  last_error_code: string | null;
};

export type CalendarReminderClaim = Readonly<{
  id: string;
  eventId: string;
  eventRevision: number;
  occurrenceKey: string;
  timeZone: string;
  attemptCount: number;
  leaseToken: string;
  recipient: string | null;
  recipientVerified: boolean;
}>;

export type CalendarReminderDeliveryContext = Readonly<{
  eventKind: "timed" | "all-day";
  eventStart: string;
  timeZone: string;
}>;

export type CalendarReminderOutcome =
  | Readonly<{ kind: "sent" }>
  | Readonly<{ kind: "cancelled" }>
  | Readonly<{ kind: "failed"; errorCode: string }>
  | Readonly<{ kind: "retry"; errorCode: string; delaySeconds: number }>;

type PreferencesRow = QueryResultRow & {
  theme: CalendarPreferences["theme"];
  accent_color: CalendarPreferences["accentColor"];
  density: CalendarPreferences["density"];
  week_starts_on: number;
  time_zone: string;
};

type CreateRequestRow = QueryResultRow & {
  request_hash: string | null;
  event_id: string | null;
  state: "pending" | "complete" | "deleted" | "abandoned";
};

type SeriesDraftRow = QueryResultRow & {
  id: string;
  idempotency_key: string;
  action: CalendarSeriesDraftRequest["action"];
  scope: CalendarSeriesDraftRequest["scope"];
  target_event_id: string | null;
  target_revision: number | null;
  normalized_payload: unknown;
  payload_hash: string | null;
  conflict_snapshot: unknown;
  result_event_id: string | null;
  outcome: "pending" | "approved" | "stale" | "expired" | "deleted";
  created_at: Date | string;
  expires_at: Date | string;
  resolved_at: Date | string | null;
};

type SeriesOccurrenceSnapshot = Readonly<{
  occurrenceKey: string;
  kind: "timed" | "all-day";
  startLocal?: string;
  endLocal?: string;
  timeZone?: string;
  startsAt?: string;
  endsAt?: string;
  startDate?: string;
  endDate?: string;
}>;

type SeriesProposalSnapshot = Readonly<{
  version: 1;
  eventId: string;
  calendarTimeZone: string | null;
  target: Readonly<{
    revision: number;
    title: string;
    details: string | null;
    kind: "timed" | "all-day";
    recurrenceRule: CalendarRecurrenceRule;
    seriesRootId?: string;
  }> | null;
  beforeOccurrences: readonly SeriesOccurrenceSnapshot[];
  afterOccurrences: readonly SeriesOccurrenceSnapshot[];
  conflicts: readonly CalendarSeriesOccurrenceConflict[];
}>;

export type CalendarSeriesDraftResult = Readonly<{
  id: string;
  action: CalendarSeriesDraftRequest["action"];
  scope: CalendarSeriesDraftRequest["scope"];
  outcome: SeriesDraftRow["outcome"];
  replayed: boolean;
  targetEventId: string | null;
  targetRevision: number | null;
  event: CalendarEventMutation | null;
  recurrenceRule: CalendarRecurrenceRule | null;
  calendarTimeZone: string | null;
  beforeOccurrences: readonly SeriesOccurrenceSnapshot[];
  afterOccurrences: readonly SeriesOccurrenceSnapshot[];
  conflicts: readonly CalendarSeriesOccurrenceConflict[];
  expiresAt: string;
}>;

export type CalendarSeriesApprovalResult = Readonly<{
  id: string;
  action: SeriesDraftRow["action"];
  outcome: Exclude<SeriesDraftRow["outcome"], "pending">;
  event: CalendarEvent | null;
}>;

type OwnerTransactionLimits = Readonly<{
  lockTimeout?: string;
  statementTimeout?: string;
  idleTransactionTimeout?: string;
}>;

export type CalendarEventCreateResult = Readonly<{
  event: CalendarEvent;
  responseBody: string;
  replayed: boolean;
}>;

export type CalendarEventCreateReconciliation =
  | Readonly<{ status: "found"; result: CalendarEventCreateResult }>
  | Readonly<{ status: "not-found" }>
  | Readonly<{ status: "deleted" }>;

const eventColumns = `
  id,
  kind,
  title,
  details,
  revision,
  reminder_choice,
  reminder_time_zone,
  CASE WHEN kind = 'timed' THEN to_char(start_local, 'YYYY-MM-DD"T"HH24:MI') END AS start_local,
  CASE WHEN kind = 'timed' THEN to_char(end_local, 'YYYY-MM-DD"T"HH24:MI') END AS end_local,
  time_zone,
  starts_at,
  ends_at,
  start_date::text AS start_date,
  end_date::text AS end_date,
  recurrence_frequency,
  recurrence_interval,
  recurrence_count,
  series_root_id,
  created_at,
  updated_at
`;

const seriesDraftColumns = `
  id,
  idempotency_key,
  action,
  scope,
  target_event_id,
  target_revision,
  normalized_payload,
  encode(payload_hash, 'hex') AS payload_hash,
  conflict_snapshot,
  result_event_id,
  outcome,
  created_at,
  expires_at,
  resolved_at
`;

async function withOwnerTransaction<T>(
  pool: Pick<Pool, "connect">,
  ownerId: string,
  operation: (client: PoolClient) => Promise<T>,
  serializeOwnerWrites = false,
  limits?: OwnerTransactionLimits,
): Promise<T> {
  const client = await pool.connect();
  let transactionOpen = false;
  let clientReleaseError: Error | undefined;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT set_config('chron.user_id', $1, true)", [ownerId]);
    if (limits?.lockTimeout) {
      await client.query("SELECT set_config('lock_timeout', $1, true)", [limits.lockTimeout]);
    }
    if (limits?.statementTimeout) {
      await client.query("SELECT set_config('statement_timeout', $1, true)", [limits.statementTimeout]);
    }
    if (limits?.idleTransactionTimeout) {
      await client.query(
        "SELECT set_config('idle_in_transaction_session_timeout', $1, true)",
        [limits.idleTransactionTimeout],
      );
    }
    if (serializeOwnerWrites) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [ownerId],
      );
    }
    const result = await operation(client);
    await client.query("COMMIT");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        clientReleaseError = rollbackError instanceof Error
          ? rollbackError
          : new Error("Calendar transaction rollback failed.");
      }
    }
    throw error;
  } finally {
    client.release(clientReleaseError);
  }
}

function asIsoInstant(value: Date | string | null): string {
  if (value === null) throw new Error("Timed calendar event is missing an instant.");
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.valueOf())) throw new Error("Calendar event instant is invalid.");
  return date.toISOString();
}

function reminderFailureCategory(code: string): keyof CalendarReminderFailureCounts {
  switch (code) {
    case "RECIPIENT_UNVERIFIED":
    case "RECIPIENT_INVALID":
      return "accountEmail";
    case "SMTP_CONFIGURATION":
      return "configuration";
    case "SMTP_REJECTED":
      return "provider";
    case "SMTP_TRANSIENT":
    case "ATTEMPTS_EXHAUSTED":
      return "temporary";
    default:
      return "other";
  }
}

function summarizeCalendarReminderStatuses(
  rows: readonly CalendarReminderStatusRow[],
): CalendarReminderStatusSummary {
  if (rows.length > 366) {
    throw new CalendarRouteError(
      500,
      "REMINDER_STATUS_LIMIT_EXCEEDED",
      "Reminder status could not be loaded.",
    );
  }

  const summary = {
    total: rows.length,
    pending: 0,
    leased: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    retrying: 0,
    nextAttemptAt: null as string | null,
    lastAcceptedAt: null as string | null,
    failureCounts: {
      accountEmail: 0,
      configuration: 0,
      provider: 0,
      temporary: 0,
      other: 0,
    },
  };
  let nextAttemptTime = Number.POSITIVE_INFINITY;
  let lastAcceptedTime = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    if (row.status !== "pending" && row.status !== "leased" && row.status !== "sent"
      && row.status !== "failed" && row.status !== "cancelled") {
      throw new Error("Calendar reminder status is invalid.");
    }
    if (!Number.isInteger(row.attempt_count) || row.attempt_count < 0 || row.attempt_count > 5) {
      throw new Error("Calendar reminder attempt count is invalid.");
    }
    summary[row.status] += 1;

    if (row.status === "pending") {
      if (row.attempt_count > 0) summary.retrying += 1;
      const value = new Date(row.next_attempt_at);
      if (!Number.isFinite(value.valueOf())) throw new Error("Calendar reminder retry time is invalid.");
      if (value.valueOf() < nextAttemptTime) {
        nextAttemptTime = value.valueOf();
        summary.nextAttemptAt = value.toISOString();
      }
    }

    if (row.status === "sent") {
      if (row.sent_at === null) throw new Error("Accepted calendar reminder is missing its timestamp.");
      const value = new Date(row.sent_at);
      if (!Number.isFinite(value.valueOf())) throw new Error("Calendar reminder acceptance time is invalid.");
      if (value.valueOf() > lastAcceptedTime) {
        lastAcceptedTime = value.valueOf();
        summary.lastAcceptedAt = value.toISOString();
      }
    }

    if ((row.status === "pending" || row.status === "leased" || row.status === "failed")
      && row.last_error_code !== null) {
      if (!/^[A-Z0-9_]{1,64}$/u.test(row.last_error_code)) {
        throw new Error("Calendar reminder failure category is invalid.");
      }
      summary.failureCounts[reminderFailureCategory(row.last_error_code)] += 1;
    }
  }

  return summary;
}

function asIsoTimestamp(value: Date | string): string {
  return asIsoInstant(value);
}

function recurrenceRuleFromRow(row: EventRow): CalendarRecurrenceRule | undefined {
  const fields = [
    row.recurrence_frequency,
    row.recurrence_interval,
    row.recurrence_count,
  ];
  if (fields.every((value) => value == null)) return undefined;
  if (fields.some((value) => value == null)) {
    throw new Error("Calendar event has incomplete recurrence data.");
  }
  return normalizeRecurrenceRule({
    frequency: row.recurrence_frequency,
    interval: row.recurrence_interval,
    count: row.recurrence_count,
  });
}

function toCalendarEvent(row: EventRow): CalendarEvent {
  const recurrenceRule = recurrenceRuleFromRow(row);
  const base = {
    id: row.id,
    ...(row.series_root_id ? { seriesRootId: row.series_root_id } : {}),
    title: row.title,
    details: row.details,
    revision: row.revision,
    ...(recurrenceRule ? { recurrenceRule } : {}),
    createdAt: asIsoTimestamp(row.created_at),
    updatedAt: asIsoTimestamp(row.updated_at),
  };

  if (row.kind === "timed") {
    const reminderChoice = row.reminder_choice ?? "none";
    if (!row.start_local || !row.end_local || !row.time_zone
      || !timedCalendarReminderChoices.includes(reminderChoice as (typeof timedCalendarReminderChoices)[number])
      || row.reminder_time_zone != null) {
      throw new Error("Timed calendar event is missing local-time data.");
    }
    return {
      ...base,
      kind: "timed",
      reminderChoice: reminderChoice as (typeof timedCalendarReminderChoices)[number],
      startLocal: row.start_local,
      endLocal: row.end_local,
      timeZone: row.time_zone,
      startsAt: asIsoInstant(row.starts_at),
      endsAt: asIsoInstant(row.ends_at),
    };
  }

  if (row.kind === "all-day") {
    const reminderChoice = row.reminder_choice ?? "none";
    const reminderTimeZone = row.reminder_time_zone ?? null;
    if (!row.start_date || !row.end_date
      || !allDayCalendarReminderChoices.includes(reminderChoice as (typeof allDayCalendarReminderChoices)[number])
      || (reminderChoice === "none" ? reminderTimeZone !== null : reminderTimeZone === null)) {
      throw new Error("All-day calendar event is missing date bounds.");
    }
    return {
      ...base,
      kind: "all-day",
      reminderChoice: reminderChoice as (typeof allDayCalendarReminderChoices)[number],
      reminderTimeZone: reminderTimeZone === null ? null : validateTimeZone(reminderTimeZone),
      startDate: row.start_date,
      endDate: row.end_date,
    };
  }

  throw new Error("Calendar event has an unsupported stored type.");
}

function reminderOccurrences(
  event: CalendarEvent,
  movements: ReadonlyMap<string, CalendarOccurrenceMovement> = new Map(),
): readonly CalendarReminderOccurrence[] {
  const occurrences = event.recurrenceRule
    ? expandFullCalendarSeries(event, event.recurrenceRule)
      .map((occurrence) => applySavedOccurrenceMovement(occurrence, movements))
    : [{
        occurrenceKey: `${event.id}:single`,
        ...(event.kind === "timed"
          ? {
              kind: "timed" as const,
              startLocal: event.startLocal,
              startsAt: event.startsAt,
              timeZone: event.timeZone,
            }
          : {
              kind: "all-day" as const,
              startDate: event.startDate,
            }),
      }];

  return occurrences.map((occurrence) => occurrence.kind === "timed"
    ? {
        occurrenceKey: occurrence.occurrenceKey,
        kind: "timed",
        startLocal: occurrence.startLocal,
        startsAt: occurrence.startsAt,
        timeZone: occurrence.timeZone,
      }
    : {
        occurrenceKey: occurrence.occurrenceKey,
        kind: "all-day",
        startDate: occurrence.startDate,
      });
}

type ReminderJobInput = Readonly<{
  id: string;
  occurrenceKey: string;
  scheduledAt: string;
  timeZone: string;
}>;

function reminderJobsForEvent(
  event: CalendarEvent,
  cancelledOccurrenceKeys: ReadonlySet<string> = new Set(),
  movements: ReadonlyMap<string, CalendarOccurrenceMovement> = new Map(),
): readonly ReminderJobInput[] {
  if (event.reminderChoice === "none") return [];
  const reminderTimeZone = event.kind === "all-day"
    ? event.reminderTimeZone ?? undefined
    : undefined;
  if (event.kind === "all-day" && !reminderTimeZone) {
    throw new Error("An all-day reminder is missing its saved time zone.");
  }

  return reminderOccurrences(event, movements)
    .filter((occurrence) => !cancelledOccurrenceKeys.has(occurrence.occurrenceKey))
    .flatMap((occurrence) => {
      const schedule = scheduleCalendarReminder(
        event.reminderChoice,
        occurrence,
        reminderTimeZone,
      );
      return schedule ? [{ id: randomUUID(), ...schedule }] : [];
    });
}

async function insertCalendarReminderJobs(
  client: PoolClient,
  ownerId: string,
  event: CalendarEvent,
  cancelledOccurrenceKeys: ReadonlySet<string> = new Set(),
  movements: ReadonlyMap<string, CalendarOccurrenceMovement> = new Map(),
  blockedOccurrenceKeys: ReadonlySet<string> = new Set(),
): Promise<void> {
  const jobs = reminderJobsForEvent(event, cancelledOccurrenceKeys, movements)
    .filter(({ occurrenceKey }) => !blockedOccurrenceKeys.has(occurrenceKey))
    .map(({ id, occurrenceKey, scheduledAt, timeZone }) => ({
      id,
      occurrence_key: occurrenceKey,
      scheduled_at: scheduledAt,
      time_zone: timeZone,
    }));
  if (jobs.length === 0) return;

  await client.query(
    `INSERT INTO calendar_event_reminders (
       id, user_id, event_id, event_revision, occurrence_key, scheduled_at,
       time_zone, next_attempt_at, status
     )
     SELECT
       job.id,
       $1,
       $2::uuid,
       $3,
       job.occurrence_key,
       job.scheduled_at,
       job.time_zone,
       job.scheduled_at,
       'pending'
     FROM jsonb_to_recordset($4::jsonb) AS job(
       id uuid,
       occurrence_key text,
       scheduled_at timestamptz,
       time_zone text
     )
     WHERE job.scheduled_at > clock_timestamp()
     ON CONFLICT ON CONSTRAINT calendar_event_reminders_revision_occurrence_unique
     DO NOTHING`,
    [ownerId, event.id, event.revision, JSON.stringify(jobs)],
  );
}

async function replaceCalendarReminderJobs(
  client: PoolClient,
  ownerId: string,
  event: CalendarEvent,
): Promise<void> {
  const cancelled = await loadCancelledOccurrenceKeys(client, ownerId, [event.id]);
  const movements = await loadOccurrenceMovements(client, ownerId, [event.id]);
  await client.query(
    `UPDATE calendar_event_reminders
     SET status = 'cancelled',
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = clock_timestamp()
     WHERE user_id = $1
       AND event_id = $2::uuid
       AND event_revision < $3
       AND status IN ('pending', 'leased')`,
    [ownerId, event.id, event.revision],
  );
  await insertCalendarReminderJobs(
    client,
    ownerId,
    event,
    cancelled.get(event.id),
    movements.get(event.id),
  );
}

async function restoreCalendarOccurrenceReminder(
  client: PoolClient,
  ownerId: string,
  event: CalendarEvent,
  occurrenceKey: string,
  occurrence: CalendarRecurrenceOccurrence,
): Promise<void> {
  if (event.reminderChoice === "none") return;
  const reminderTimeZone = event.kind === "all-day"
    ? event.reminderTimeZone ?? undefined
    : undefined;
  if (event.kind === "all-day" && !reminderTimeZone) {
    throw new Error("An all-day reminder is missing its saved time zone.");
  }
  const scheduled = scheduleCalendarReminder(event.reminderChoice, occurrence, reminderTimeZone);
  const job = scheduled ? { id: randomUUID(), ...scheduled } : undefined;
  if (!job) return;

  await client.query(
    `UPDATE calendar_event_reminders AS reminder
     SET status = CASE
           WHEN $5::timestamptz > clock_timestamp() THEN 'pending'
           ELSE 'cancelled'
         END,
         scheduled_at = $5::timestamptz,
         next_attempt_at = $5::timestamptz,
         time_zone = $6,
         lease_token = NULL,
         lease_expires_at = NULL,
         sent_at = NULL,
         last_error_code = NULL,
         updated_at = clock_timestamp()
     WHERE user_id = $1
       AND event_id = $2::uuid
       AND event_revision = $3
       AND occurrence_key = $4
       AND status = 'cancelled'
       AND attempt_count = 0
       AND NOT EXISTS (
         SELECT 1
         FROM calendar_event_reminders attempted
         WHERE attempted.user_id = reminder.user_id
           AND attempted.event_id = reminder.event_id
           AND attempted.occurrence_key = reminder.occurrence_key
           AND attempted.attempt_count > 0
       )`,
    [ownerId, event.id, event.revision, occurrenceKey, job.scheduledAt, job.timeZone],
  );

  await client.query(
    `INSERT INTO calendar_event_reminders (
       id, user_id, event_id, event_revision, occurrence_key, scheduled_at,
       time_zone, next_attempt_at, status
     )
     SELECT $1::uuid, $2, $3::uuid, $4, $5, $6::timestamptz,
            $7, $6::timestamptz, 'pending'
     WHERE $6::timestamptz > clock_timestamp()
       AND NOT EXISTS (
         SELECT 1
         FROM calendar_event_reminders attempted
         WHERE attempted.user_id = $2
           AND attempted.event_id = $3::uuid
           AND attempted.occurrence_key = $5
           AND attempted.attempt_count > 0
       )
     ON CONFLICT ON CONSTRAINT calendar_event_reminders_revision_occurrence_unique
     DO NOTHING`,
    [randomUUID(), ownerId, event.id, event.revision, occurrenceKey, job.scheduledAt, job.timeZone],
  );
}

async function moveCalendarOccurrenceReminder(
  client: PoolClient,
  ownerId: string,
  event: CalendarEvent,
  occurrence: CalendarRecurrenceOccurrence,
): Promise<void> {
  await client.query(
    `UPDATE calendar_event_reminders
     SET status = 'cancelled',
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = clock_timestamp()
     WHERE user_id = $1
       AND event_id = $2::uuid
       AND occurrence_key = $3
       AND status IN ('pending', 'leased')`,
    [ownerId, event.id, occurrence.occurrenceKey],
  );
  if (event.reminderChoice === "none") return;

  const reminderTimeZone = event.kind === "all-day"
    ? event.reminderTimeZone ?? undefined
    : undefined;
  if (event.kind === "all-day" && !reminderTimeZone) {
    throw new Error("An all-day reminder is missing its saved time zone.");
  }
  const scheduled = scheduleCalendarReminder(event.reminderChoice, occurrence, reminderTimeZone);
  if (!scheduled) return;

  await client.query(
    `UPDATE calendar_event_reminders AS reminder
     SET status = CASE
           WHEN $5::timestamptz > clock_timestamp() THEN 'pending'
           ELSE 'cancelled'
         END,
         scheduled_at = $5::timestamptz,
         next_attempt_at = $5::timestamptz,
         time_zone = $6,
         lease_token = NULL,
         lease_expires_at = NULL,
         sent_at = NULL,
         last_error_code = NULL,
         updated_at = clock_timestamp()
     WHERE reminder.user_id = $1
       AND reminder.event_id = $2::uuid
       AND reminder.event_revision = $3
       AND reminder.occurrence_key = $4
       AND reminder.status = 'cancelled'
       AND reminder.attempt_count = 0
       AND NOT EXISTS (
         SELECT 1 FROM calendar_event_reminders attempted
         WHERE attempted.user_id = reminder.user_id
           AND attempted.event_id = reminder.event_id
           AND attempted.occurrence_key = reminder.occurrence_key
           AND attempted.attempt_count > 0
       )`,
    [ownerId, event.id, event.revision, occurrence.occurrenceKey, scheduled.scheduledAt, scheduled.timeZone],
  );
  await client.query(
    `INSERT INTO calendar_event_reminders (
       id, user_id, event_id, event_revision, occurrence_key, scheduled_at,
       time_zone, next_attempt_at, status
     )
     SELECT $1::uuid, $2, $3::uuid, $4, $5, $6::timestamptz,
            $7, $6::timestamptz,
            CASE WHEN $6::timestamptz > clock_timestamp() THEN 'pending' ELSE 'cancelled' END
     WHERE NOT EXISTS (
       SELECT 1 FROM calendar_event_reminders attempted
       WHERE attempted.user_id = $2
         AND attempted.event_id = $3::uuid
         AND attempted.occurrence_key = $5
         AND attempted.attempt_count > 0
     )
     ON CONFLICT ON CONSTRAINT calendar_event_reminders_revision_occurrence_unique
     DO NOTHING`,
    [randomUUID(), ownerId, event.id, event.revision, occurrence.occurrenceKey, scheduled.scheduledAt, scheduled.timeZone],
  );
}

function preferencesFromRow(row: PreferencesRow): CalendarPreferences {
  return {
    theme: row.theme,
    accentColor: row.accent_color,
    density: row.density,
    weekStartsOn: row.week_starts_on,
    timeZone: row.time_zone,
  };
}

function isPostgresQueryCancelled(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "57014";
}

function throwMissingOrStale(revision: number | undefined): never {
  if (revision === undefined) {
    throw new CalendarRouteError(404, "EVENT_NOT_FOUND", "That calendar event could not be found.");
  }
  throw new CalendarRouteError(412, "REVISION_MISMATCH", "This event changed. Reload it before saving.");
}

function idempotencyKeyConflict(): CalendarRouteError {
  return new CalendarRouteError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "This event request key was already used for a different request.",
  );
}

function abandonedCreateKey(): CalendarRouteError {
  return new CalendarRouteError(
    409,
    "IDEMPOTENCY_KEY_ABANDONED",
    "This event request key was checked before completion and can no longer create an event.",
  );
}

function fingerprintCreateRequest(commit: CalendarEventCommit): Buffer {
  const event = commit.event.kind === "timed"
    ? {
        kind: "timed",
        title: commit.event.title,
        details: commit.event.details ?? null,
        startLocal: commit.event.startLocal,
        endLocal: commit.event.endLocal,
        timeZone: commit.event.timeZone,
        startDisambiguation: commit.event.startDisambiguation ?? null,
        endDisambiguation: commit.event.endDisambiguation ?? null,
      }
    : {
        kind: "all-day",
        title: commit.event.title,
        details: commit.event.details ?? null,
        startDate: commit.event.startDate,
        endDate: commit.event.endDate,
      };
  const reviewedConflicts = commit.reviewedConflicts
    .map(({ id, revision }) => ({ id, revision }))
    .sort((left, right) => left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : left.revision - right.revision);
  const normalizedCommit = {
    event,
    calendarTimeZone: commit.calendarTimeZone,
    reviewedConflicts,
  };
  return createHash("sha256").update(JSON.stringify(normalizedCommit)).digest();
}

function createResultFromEvent(event: CalendarEvent, replayed: boolean): CalendarEventCreateResult {
  const responseBody = JSON.stringify({ event });
  return {
    event,
    responseBody,
    replayed,
  };
}

async function loadCreatedEvent(
  client: PoolClient,
  ownerId: string,
  eventId: string | null,
): Promise<CalendarEvent> {
  if (eventId === null) {
    throw new CalendarRouteError(
      503,
      "IDEMPOTENCY_RESULT_UNAVAILABLE",
      "The saved event result is temporarily unavailable. Retry with the same request key.",
    );
  }
  const result = await client.query<EventRow>(
    `SELECT ${eventColumns}
     FROM calendar_events
     WHERE user_id = $1 AND id = $2::uuid`,
    [ownerId, eventId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new CalendarRouteError(
      410,
      "CREATED_EVENT_DELETED",
      "This event was deleted after it was created. Review a new event before saving it again.",
    );
  }
  return toCalendarEvent(row);
}

type ConflictBounds = Readonly<{
  calendarTimeZone: string;
  startsAt: string;
  endsAt: string;
  fromDate: string;
  toDate: string;
}>;

function conflictBounds(
  mutation: CalendarEventMutation,
  calendarTimeZoneValue: string,
): ConflictBounds {
  const calendarTimeZone = validateTimeZone(calendarTimeZoneValue);
  if (mutation.kind === "timed") {
    const start = resolveLocalDateTime(
      mutation.startLocal,
      mutation.timeZone,
      mutation.startDisambiguation,
    );
    const end = resolveLocalDateTime(
      mutation.endLocal,
      mutation.timeZone,
      mutation.endDisambiguation,
    );
    resolveTimedDuration(start.instant, end.instant);
    const startsAt = start.instant;
    const endsAt = end.instant;
    const fromDate = Temporal.Instant.from(startsAt)
      .toZonedDateTimeISO(calendarTimeZone).toPlainDate().toString();
    const lastOccupiedDate = Temporal.Instant.from(endsAt)
      .subtract({ nanoseconds: 1 })
      .toZonedDateTimeISO(calendarTimeZone).toPlainDate();
    return {
      calendarTimeZone,
      startsAt,
      endsAt,
      fromDate,
      toDate: lastOccupiedDate.add({ days: 1 }).toString(),
    };
  }

  const range = resolveAllDayRange(mutation.startDate, mutation.endDate);
  return {
    calendarTimeZone,
    startsAt: Temporal.PlainDate.from(range.startDate)
      .toZonedDateTime(calendarTimeZone).toInstant().toString(),
    endsAt: Temporal.PlainDate.from(range.endDate)
      .toZonedDateTime(calendarTimeZone).toInstant().toString(),
    fromDate: range.startDate,
    toDate: range.endDate,
  };
}

async function conflictsInTransaction(
  client: PoolClient,
  ownerId: string,
  bounds: ConflictBounds,
  excludeEventId?: string,
): Promise<CalendarConflict[]> {
  const result = await client.query<EventRow>(
    `SELECT ${eventColumns}
     FROM calendar_events
     WHERE user_id = $1
       AND ($2::uuid IS NULL OR id <> $2::uuid)
       AND (
         (
           recurrence_frequency IS NULL
           AND (
             (kind = 'timed' AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz)
             OR
             (kind = 'all-day' AND start_date < $6::date AND end_date > $5::date)
           )
         )
         OR
         (
           recurrence_frequency IS NOT NULL
           AND (
             (kind = 'timed' AND starts_at < $4::timestamptz
               AND starts_at >= $3::timestamptz - interval '374 days')
             OR
             (kind = 'all-day' AND start_date < $6::date
               AND start_date >= $5::date - 374)
             OR EXISTS (
               SELECT 1
               FROM calendar_event_occurrence_exceptions exception
               WHERE exception.user_id = $1
                 AND exception.event_id = calendar_events.id
                 AND NOT exception.is_cancelled
                 AND (
                   (exception.moved_start_local IS NOT NULL
                     AND exception.moved_starts_at < $4::timestamptz
                     AND exception.moved_ends_at > $3::timestamptz)
                   OR
                   (exception.moved_start_date IS NOT NULL
                     AND exception.moved_start_date < $6::date
                     AND exception.moved_end_date > $5::date)
                 )
             )
           )
         )
       )
     ORDER BY id
     LIMIT $7`,
    [
      ownerId,
      excludeEventId ?? null,
      bounds.startsAt,
      bounds.endsAt,
      bounds.fromDate,
      bounds.toDate,
      maximumSeriesProposalCandidateRows + 1,
    ],
  );

  if (result.rows.length > maximumSeriesProposalCandidateRows) {
    throw new CalendarRouteError(
      422,
      "SERIES_CANDIDATE_LIMIT",
      "There are too many calendar events to verify every overlap. Narrow the event range and review it again.",
    );
  }

  const candidateEvents = result.rows.map(toCalendarEvent);
  const cancelledOccurrenceKeys = await loadCancelledOccurrenceKeys(
    client,
    ownerId,
    candidateEvents.filter((event) => event.recurrenceRule).map(({ id }) => id),
  );
  const occurrenceMovements = await loadOccurrenceMovements(
    client,
    ownerId,
    candidateEvents.filter((event) => event.recurrenceRule).map(({ id }) => id),
  );

  const conflicts: CalendarConflict[] = [];
  for (const event of candidateEvents) {
    const base = { id: event.id, revision: event.revision, title: event.title };
    if (!event.recurrenceRule) {
      conflicts.push(event.kind === "timed"
        ? {
            ...base,
            kind: event.kind,
            startLocal: event.startLocal,
            endLocal: event.endLocal,
            timeZone: event.timeZone,
          }
        : {
            ...base,
            kind: event.kind,
            startDate: event.startDate,
            endDate: event.endDate,
          });
      continue;
    }

    try {
      const occurrences = occurrencesForCalendarRange(
        event,
        bounds,
        bounds.calendarTimeZone,
        occurrenceMovements.get(event.id) ?? new Map(),
      ).filter((occurrence) => !cancelledOccurrenceKeys.get(event.id)?.has(occurrence.occurrenceKey));
      if (occurrences.length > 1) {
        throw new CalendarRouteError(
          422,
          "RECURRING_CONFLICT_REVIEW_LIMIT",
          "This change overlaps several instances of a recurring event. Shorten the event range so each overlap can be reviewed.",
        );
      }
      const occurrence = occurrences[0];
      if (occurrence) {
        conflicts.push(occurrence.kind === "timed"
          ? {
              ...base,
              occurrenceKey: occurrence.occurrenceKey,
              kind: occurrence.kind,
              startLocal: occurrence.startLocal,
              endLocal: occurrence.endLocal,
              timeZone: occurrence.timeZone,
            }
          : {
              ...base,
              occurrenceKey: occurrence.occurrenceKey,
              kind: occurrence.kind,
              startDate: occurrence.startDate,
              endDate: occurrence.endDate,
            });
      }
    } catch (error) {
      if (error instanceof CalendarRouteError) throw error;
      if (error instanceof RangeError || error instanceof RecurrenceError) {
        throw new CalendarRouteError(
          422,
          "RECURRING_CONFLICTS_UNVERIFIABLE",
          "Chron could not verify every recurring overlap. Narrow the event range and review it again.",
        );
      }
      throw error;
    }
  }

  conflicts.sort((left, right) => {
    const leftStart = left.kind === "timed" ? left.startLocal : left.startDate;
    const rightStart = right.kind === "timed" ? right.startLocal : right.startDate;
    return leftStart.localeCompare(rightStart) || left.id.localeCompare(right.id);
  });
  if (conflicts.length > maximumConflictResults) {
    throw new CalendarRouteError(
      422,
      "CONFLICT_RESULT_LIMIT",
      "Chron could not verify every overlap. Shorten the event range and review it again.",
    );
  }
  return conflicts;
}

async function assertCalendarTimeZoneCurrent(
  client: PoolClient,
  ownerId: string,
  timeZone: string,
): Promise<void> {
  const result = await client.query<{ time_zone: string } & QueryResultRow>(
    "SELECT time_zone FROM calendar_preferences WHERE user_id = $1",
    [ownerId],
  );
  const currentTimeZone = result.rows[0]?.time_zone;
  if (currentTimeZone && currentTimeZone !== timeZone) {
    throw new CalendarRouteError(
      409,
      "CALENDAR_TIME_ZONE_CHANGED",
      "The calendar time zone changed. Review the event again before saving.",
    );
  }
}

async function assertSingleEventScope(
  client: PoolClient,
  ownerId: string,
  eventId: string,
): Promise<void> {
  const result = await client.query<{ recurrence_frequency: string | null } & QueryResultRow>(
    `SELECT recurrence_frequency
     FROM calendar_events
     WHERE user_id = $1 AND id = $2::uuid
     FOR UPDATE`,
    [ownerId, eventId],
  );
  if (result.rows[0]?.recurrence_frequency != null) {
    throw new CalendarRouteError(
      409,
      "SERIES_SCOPE_REQUIRED",
      "Recurring events must be changed through a reviewed whole-series proposal.",
    );
  }
}

async function requireCalendarTimeZone(
  client: PoolClient,
  ownerId: string,
  requestedTimeZone: string,
): Promise<string> {
  const result = await client.query<{ time_zone: string } & QueryResultRow>(
    `SELECT time_zone
     FROM calendar_preferences
     WHERE user_id = $1
     FOR SHARE`,
    [ownerId],
  );
  const configuredTimeZone = result.rows[0]?.time_zone;
  if (!configuredTimeZone) {
    throw new CalendarRouteError(
      409,
      "CALENDAR_TIME_ZONE_UNCONFIGURED",
      "Save a calendar time zone before reviewing a recurring series.",
    );
  }
  if (configuredTimeZone !== requestedTimeZone) {
    throw new CalendarRouteError(
      409,
      "CALENDAR_TIME_ZONE_CHANGED",
      "The calendar time zone changed. Review the series again before saving.",
    );
  }
  return validateTimeZone(configuredTimeZone);
}

function canonicalSeriesRequest(request: CalendarSeriesDraftRequest): Record<string, unknown> {
  if (request.action === "delete") {
    return {
      action: "delete",
      scope: "series",
      targetEventId: request.targetEventId.toLowerCase(),
      targetRevision: request.targetRevision,
    };
  }
  if (request.action === "cancel-occurrence") {
    return {
      action: request.action,
      scope: request.scope,
      targetEventId: request.targetEventId.toLowerCase(),
      targetRevision: request.targetRevision,
      occurrenceKey: request.occurrenceKey,
    };
  }
  if (request.action === "restore-occurrence") {
    return {
      action: request.action,
      scope: request.scope,
      targetEventId: request.targetEventId.toLowerCase(),
      targetRevision: request.targetRevision,
      occurrenceKey: request.occurrenceKey,
      calendarTimeZone: request.calendarTimeZone,
    };
  }
  if (request.action === "move-occurrence") {
    return {
      action: request.action,
      scope: request.scope,
      targetEventId: request.targetEventId.toLowerCase(),
      targetRevision: request.targetRevision,
      occurrenceKey: request.occurrenceKey,
      calendarTimeZone: request.calendarTimeZone,
      movement: request.movement,
    };
  }

  const event = request.event.kind === "timed"
    ? {
        kind: "timed",
        title: request.event.title,
        details: request.event.details ?? null,
        startLocal: request.event.startLocal,
        endLocal: request.event.endLocal,
        timeZone: request.event.timeZone,
        startDisambiguation: request.event.startDisambiguation ?? null,
        endDisambiguation: request.event.endDisambiguation ?? null,
      }
    : {
        kind: "all-day",
        title: request.event.title,
        details: request.event.details ?? null,
        startDate: request.event.startDate,
        endDate: request.event.endDate,
      };

  return {
    action: request.action,
    scope: request.scope,
    ...(request.action === "update" || request.action === "split-series"
      ? {
          targetEventId: request.targetEventId.toLowerCase(),
          targetRevision: request.targetRevision,
        }
      : {}),
    ...(request.action === "split-series" ? { occurrenceKey: request.occurrenceKey } : {}),
    event,
    recurrenceRule: {
      frequency: request.recurrenceRule.frequency,
      interval: request.recurrenceRule.interval,
      count: request.recurrenceRule.count,
    },
    calendarTimeZone: request.calendarTimeZone,
  };
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value === null || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record).sort().map((key) => [key, stableJsonValue(record[key])]),
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function seriesRequestHash(request: CalendarSeriesDraftRequest): Buffer {
  return createHash("sha256").update(stableJson(canonicalSeriesRequest(request))).digest();
}

function seriesEventFromMutation(
  id: string,
  mutation: CalendarEventMutation,
  recurrenceRule: CalendarRecurrenceRule,
  revision: number,
  createdAt: string,
  updatedAt: string,
  seriesRootId: string = id,
): CalendarEvent {
  const rule = normalizeRecurrenceRule(recurrenceRule);
  const base = {
    id,
    title: mutation.title,
    details: mutation.details ?? null,
    revision,
    recurrenceRule: rule,
    seriesRootId,
    createdAt,
    updatedAt,
  };
  if (mutation.kind === "timed") {
    const start = resolveLocalDateTime(
      mutation.startLocal,
      mutation.timeZone,
      mutation.startDisambiguation,
    );
    const end = resolveLocalDateTime(
      mutation.endLocal,
      mutation.timeZone,
      mutation.endDisambiguation,
    );
    resolveTimedDuration(start.instant, end.instant);
    return {
      ...base,
      kind: "timed",
      reminderChoice: mutation.reminderChoice ?? "none",
      startLocal: start.local,
      endLocal: end.local,
      timeZone: start.timeZone,
      startsAt: start.instant,
      endsAt: end.instant,
    };
  }
  const bounds = resolveAllDayRange(mutation.startDate, mutation.endDate);
  return {
    ...base,
    kind: "all-day",
    reminderChoice: mutation.reminderChoice ?? "none",
    reminderTimeZone: mutation.reminderChoice && mutation.reminderChoice !== "none"
      ? mutation.reminderTimeZone ?? null
      : null,
    startDate: bounds.startDate,
    endDate: bounds.endDate,
  };
}

type CalendarSeriesSplitRequest = Extract<CalendarSeriesDraftRequest, { action: "split-series" }>;

type CalendarSeriesSplitPlan = Readonly<{
  splitIndex: number;
  targetOccurrences: readonly CalendarRecurrenceOccurrence[];
  segment: CalendarEvent;
  segmentOccurrences: readonly CalendarRecurrenceOccurrence[];
  cancelledOccurrenceKeys: ReadonlySet<string>;
  occurrenceMovements: ReadonlyMap<string, CalendarOccurrenceMovement>;
  sourceToFollowingOccurrenceKey: ReadonlyMap<string, string>;
}>;

function planCalendarSeriesSplit(
  target: CalendarEvent,
  request: CalendarSeriesSplitRequest,
  newEventId: string,
  now: string,
  targetCancelledOccurrenceKeys: ReadonlySet<string>,
  targetOccurrenceMovements: ReadonlyMap<string, CalendarOccurrenceMovement>,
): CalendarSeriesSplitPlan {
  if (!target.recurrenceRule || !target.seriesRootId) {
    throw new CalendarRouteError(
      409,
      "SERIES_LINEAGE_UNAVAILABLE",
      "Reload this recurring series before splitting it.",
    );
  }

  const targetOccurrences = expandFullCalendarSeries(target, target.recurrenceRule);
  const splitIndex = targetOccurrences.findIndex(({ occurrenceKey }) =>
    occurrenceKey === request.occurrenceKey
  );
  if (splitIndex < 0) {
    throw new CalendarRouteError(
      409,
      "OCCURRENCE_NOT_IN_SERIES",
      "That occurrence no longer belongs to this recurring series. Reload the calendar.",
    );
  }
  if (splitIndex === 0) {
    throw new CalendarRouteError(
      409,
      "SERIES_SPLIT_HAS_NO_PREFIX",
      "This is the first occurrence. Review a change for the whole series instead.",
    );
  }
  if (targetCancelledOccurrenceKeys.has(request.occurrenceKey)) {
    throw new CalendarRouteError(
      409,
      "OCCURRENCE_ALREADY_CANCELLED",
      "A cancelled occurrence cannot start a following-series split.",
    );
  }

  const suffixCount = targetOccurrences.length - splitIndex;
  if (request.recurrenceRule.count !== suffixCount) {
    throw new CalendarRouteError(
      422,
      "SERIES_SPLIT_COUNT_MISMATCH",
      "The proposed segment must keep the remaining finite occurrence count.",
    );
  }

  const segment = seriesEventFromMutation(
    newEventId,
    request.event,
    request.recurrenceRule,
    1,
    target.createdAt,
    now,
    target.seriesRootId,
  );
  const segmentOccurrences = expandFullCalendarSeries(segment, request.recurrenceRule);
  if (segmentOccurrences.length !== suffixCount) {
    throw new CalendarRouteError(
      422,
      "SERIES_SPLIT_UNVERIFIABLE",
      "Chron could not verify every occurrence in the proposed segment.",
    );
  }

  const cancelledOccurrenceKeys = new Set<string>();
  const occurrenceMovements = new Map<string, CalendarOccurrenceMovement>();
  const sourceToFollowingOccurrenceKey = new Map<string, string>();
  for (let offset = 0; offset < suffixCount; offset += 1) {
    const previous = targetOccurrences[splitIndex + offset];
    const following = segmentOccurrences[offset];
    sourceToFollowingOccurrenceKey.set(previous.occurrenceKey, following.occurrenceKey);
    if (targetCancelledOccurrenceKeys.has(previous.occurrenceKey)) {
      cancelledOccurrenceKeys.add(following.occurrenceKey);
    }
    const movement = targetOccurrenceMovements.get(previous.occurrenceKey);
    if (movement) {
      if (movement.kind !== following.kind) {
        throw new CalendarRouteError(
          409,
          "SERIES_SPLIT_MOVEMENT_NOT_PRESERVED",
          "Resolve moved occurrences before changing the event type in a following-series split.",
        );
      }
      occurrenceMovements.set(following.occurrenceKey, movement);
    }
  }

  return {
    splitIndex,
    targetOccurrences,
    segment,
    segmentOccurrences,
    cancelledOccurrenceKeys,
    occurrenceMovements,
    sourceToFollowingOccurrenceKey,
  };
}

function occurrenceSnapshot(
  occurrence: CalendarRecurrenceOccurrence,
): SeriesOccurrenceSnapshot {
  if (occurrence.kind === "timed") {
    return {
      occurrenceKey: occurrence.occurrenceKey,
      kind: "timed",
      startLocal: occurrence.startLocal,
      endLocal: occurrence.endLocal,
      timeZone: occurrence.timeZone,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
    };
  }
  return {
    occurrenceKey: occurrence.occurrenceKey,
    kind: "all-day",
    startDate: occurrence.startDate,
    endDate: occurrence.endDate,
  };
}

function resolveOccurrenceMovement(
  occurrence: CalendarRecurrenceOccurrence,
  movement: CalendarOccurrenceMovementRequest,
): CalendarOccurrenceMovement {
  if (occurrence.kind !== movement.kind) {
    throw new RangeError("An occurrence move cannot change the event type.");
  }
  if (movement.kind === "timed" && occurrence.kind === "timed") {
    if (movement.timeZone !== occurrence.timeZone) {
      throw new RangeError("An occurrence move cannot change its time zone.");
    }
    const start = resolveLocalDateTime(
      movement.startLocal,
      movement.timeZone,
      movement.startDisambiguation,
    );
    const end = resolveLocalDateTime(
      movement.endLocal,
      movement.timeZone,
      movement.endDisambiguation,
    );
    resolveTimedDuration(start.instant, end.instant);
    return {
      kind: "timed",
      startLocal: start.local,
      endLocal: end.local,
      timeZone: start.timeZone,
      startsAt: start.instant,
      endsAt: end.instant,
    };
  }
  if (movement.kind === "all-day" && occurrence.kind === "all-day") {
    const bounds = resolveAllDayRange(movement.startDate, movement.endDate);
    return {
      kind: "all-day",
      startDate: bounds.startDate,
      endDate: bounds.endDate,
    };
  }
  throw new RangeError("An occurrence move has an unsupported event type.");
}

function applySavedOccurrenceMovement(
  occurrence: CalendarRecurrenceOccurrence,
  movements: ReadonlyMap<string, CalendarOccurrenceMovement>,
): CalendarRecurrenceOccurrence {
  const movement = movements.get(occurrence.occurrenceKey);
  return movement ? applyCalendarOccurrenceMovement(occurrence, movement) : occurrence;
}

function occurrencesForCalendarRange(
  event: CalendarEvent,
  range: Readonly<{ fromDate: string; toDate: string; startsAt: string; endsAt: string }>,
  timeZone: string,
  movements: ReadonlyMap<string, CalendarOccurrenceMovement>,
): readonly CalendarRecurrenceOccurrence[] {
  if (!event.recurrenceRule) return [];
  if (movements.size === 0) {
    return expandCalendarRecurrenceRange(event, event.recurrenceRule, {
      fromDate: range.fromDate,
      toDate: range.toDate,
      timeZone,
    });
  }
  return expandFullCalendarSeries(event, event.recurrenceRule)
    .map((occurrence) => applySavedOccurrenceMovement(occurrence, movements))
    .filter((occurrence) => occurrenceOverlapsCalendarInterval(
      occurrence,
      { startsAt: range.startsAt, endsAt: range.endsAt },
      timeZone,
    ));
}

function snapshotTarget(
  target: CalendarEvent,
  includeSeriesRoot = false,
): SeriesProposalSnapshot["target"] {
  if (!target.recurrenceRule) return null;
  return {
    revision: target.revision,
    title: target.title,
    details: target.details,
    kind: target.kind,
    recurrenceRule: target.recurrenceRule,
    ...(includeSeriesRoot && target.seriesRootId
      ? { seriesRootId: target.seriesRootId }
      : {}),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readOccurrenceSnapshot(value: unknown): SeriesOccurrenceSnapshot | null {
  if (!isPlainRecord(value) || typeof value.occurrenceKey !== "string") return null;
  if (value.kind === "timed"
    && typeof value.startLocal === "string"
    && typeof value.endLocal === "string"
    && typeof value.timeZone === "string"
    && typeof value.startsAt === "string"
    && typeof value.endsAt === "string") {
    return {
      occurrenceKey: value.occurrenceKey,
      kind: "timed",
      startLocal: value.startLocal,
      endLocal: value.endLocal,
      timeZone: validateTimeZone(value.timeZone),
      startsAt: value.startsAt,
      endsAt: value.endsAt,
    };
  }
  if (value.kind === "all-day"
    && typeof value.startDate === "string"
    && typeof value.endDate === "string") {
    return {
      occurrenceKey: value.occurrenceKey,
      kind: "all-day",
      startDate: value.startDate,
      endDate: value.endDate,
    };
  }
  return null;
}

function readSeriesSnapshot(value: unknown): SeriesProposalSnapshot {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  if (!isPlainRecord(parsed)
    || parsed.version !== 1
    || typeof parsed.eventId !== "string"
    || !Array.isArray(parsed.beforeOccurrences)
    || parsed.beforeOccurrences.length > 366
    || !Array.isArray(parsed.afterOccurrences)
    || parsed.afterOccurrences.length > 366
    || !Array.isArray(parsed.conflicts)
    || parsed.conflicts.length > maximumConflictResults) {
    throw new Error("The saved recurring proposal snapshot is invalid.");
  }
  const beforeOccurrences = parsed.beforeOccurrences.map(readOccurrenceSnapshot);
  const afterOccurrences = parsed.afterOccurrences.map(readOccurrenceSnapshot);
  if (beforeOccurrences.some((item) => item === null)
    || afterOccurrences.some((item) => item === null)) {
    throw new Error("The saved recurring proposal occurrences are invalid.");
  }

  let target: SeriesProposalSnapshot["target"] = null;
  if (parsed.target !== null) {
    if (!isPlainRecord(parsed.target)
      || !Number.isSafeInteger(parsed.target.revision)
      || typeof parsed.target.title !== "string"
      || !(typeof parsed.target.details === "string" || parsed.target.details === null)
      || (parsed.target.kind !== "timed" && parsed.target.kind !== "all-day")
      || (Object.hasOwn(parsed.target, "seriesRootId")
        && (typeof parsed.target.seriesRootId !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
            .test(parsed.target.seriesRootId)))) {
      throw new Error("The saved recurring proposal target is invalid.");
    }
    target = {
      revision: parsed.target.revision as number,
      title: parsed.target.title,
      details: parsed.target.details,
      kind: parsed.target.kind,
      recurrenceRule: normalizeRecurrenceRule(parsed.target.recurrenceRule),
      ...(typeof parsed.target.seriesRootId === "string"
        ? { seriesRootId: parsed.target.seriesRootId }
        : {}),
    };
  }

  if (parsed.calendarTimeZone !== null && typeof parsed.calendarTimeZone !== "string") {
    throw new Error("The saved recurring proposal time zone is invalid.");
  }
  const conflicts: CalendarSeriesOccurrenceConflict[] = parsed.conflicts.map((value) => {
    if (!isPlainRecord(value)
      || typeof value.candidateOccurrenceKey !== "string"
      || typeof value.conflictingEventId !== "string"
      || !Number.isSafeInteger(value.conflictingEventRevision)
      || typeof value.conflictingTitle !== "string") {
      throw new Error("The saved recurring proposal conflict is invalid.");
    }
    const conflictingOccurrence = readOccurrenceSnapshot(value.conflictingOccurrence);
    if (!conflictingOccurrence) throw new Error("The saved recurring conflict occurrence is invalid.");
    return {
      candidateOccurrenceKey: value.candidateOccurrenceKey,
      conflictingEventId: value.conflictingEventId,
      conflictingEventRevision: value.conflictingEventRevision as number,
      conflictingTitle: value.conflictingTitle,
      conflictingOccurrence,
    };
  });

  return {
    version: 1,
    eventId: parsed.eventId,
    calendarTimeZone: parsed.calendarTimeZone === null
      ? null
      : validateTimeZone(parsed.calendarTimeZone),
    target,
    beforeOccurrences: beforeOccurrences as SeriesOccurrenceSnapshot[],
    afterOccurrences: afterOccurrences as SeriesOccurrenceSnapshot[],
    conflicts,
  };
}

async function loadSeriesTarget(
  client: PoolClient,
  ownerId: string,
  eventId: string,
  expectedRevision: number,
): Promise<CalendarEvent> {
  const result = await client.query<EventRow>(
    `SELECT ${eventColumns}
     FROM calendar_events
     WHERE user_id = $1 AND id = $2::uuid
     FOR UPDATE`,
    [ownerId, eventId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new CalendarRouteError(404, "EVENT_NOT_FOUND", "That calendar series could not be found.");
  }
  const event = toCalendarEvent(row);
  if (event.revision !== expectedRevision) {
    throw new CalendarRouteError(
      409,
      "SERIES_TARGET_STALE",
      "The recurring series changed. Reload it before preparing another proposal.",
    );
  }
  if (!event.recurrenceRule) {
    throw new CalendarRouteError(
      409,
      "SERIES_TARGET_REQUIRED",
      "Choose a recurring event to prepare a whole-series change.",
    );
  }
  return event;
}

async function loadSeriesCandidates(
  client: PoolClient,
  ownerId: string,
  excludeEventId?: string,
): Promise<SeriesCandidateSet> {
  const result = await client.query<EventRow>(
    `SELECT ${eventColumns}
     FROM calendar_events
     WHERE user_id = $1
       AND ($2::uuid IS NULL OR id <> $2::uuid)
     ORDER BY id
     LIMIT $3`,
    [ownerId, excludeEventId ?? null, maximumSeriesProposalCandidateRows + 1],
  );
  if (result.rows.length > maximumSeriesProposalCandidateRows) {
    throw new CalendarRouteError(
      422,
      "SERIES_CANDIDATE_LIMIT",
      "There are too many calendar events to verify every series overlap. Narrow or archive the calendar and try again.",
    );
  }
  const events = result.rows.map(toCalendarEvent);
  return {
    events,
    cancelledOccurrenceKeys: await loadCancelledOccurrenceKeys(
      client,
      ownerId,
      events.map(({ id }) => id),
    ),
    occurrenceMovements: await loadOccurrenceMovements(
      client,
      ownerId,
      events.map(({ id }) => id),
    ),
  };
}

type SeriesCandidateSet = Readonly<{
  events: readonly CalendarEvent[];
  cancelledOccurrenceKeys: ReadonlyMap<string, ReadonlySet<string>>;
  occurrenceMovements: CalendarOccurrenceMovements;
}>;

const emptySeriesCandidates: SeriesCandidateSet = {
  events: [],
  cancelledOccurrenceKeys: new Map(),
  occurrenceMovements: new Map(),
};

async function loadCancelledOccurrenceKeys(
  client: PoolClient,
  ownerId: string,
  eventIds: readonly string[],
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const uniqueIds = [...new Set(eventIds)];
  if (uniqueIds.length === 0) return new Map();
  const result = await client.query<{
    event_id: string;
    occurrence_key: string;
  } & QueryResultRow>(
    `SELECT event_id, occurrence_key
     FROM calendar_event_occurrence_exceptions
     WHERE user_id = $1 AND event_id = ANY($2::uuid[]) AND is_cancelled
     ORDER BY event_id, occurrence_key`,
    [ownerId, uniqueIds],
  );
  const keys = new Map<string, Set<string>>();
  for (const row of result.rows) {
    let eventKeys = keys.get(row.event_id);
    if (!eventKeys) {
      eventKeys = new Set();
      keys.set(row.event_id, eventKeys);
    }
    eventKeys.add(row.occurrence_key);
  }
  return keys;
}

async function loadOccurrenceMovements(
  client: PoolClient,
  ownerId: string,
  eventIds: readonly string[],
): Promise<CalendarOccurrenceMovements> {
  const uniqueIds = [...new Set(eventIds)];
  if (uniqueIds.length === 0) return new Map();
  const result = await client.query<OccurrenceMovementRow>(
    `SELECT event_id, occurrence_key,
            to_char(moved_start_local, 'YYYY-MM-DD"T"HH24:MI') AS moved_start_local,
            to_char(moved_end_local, 'YYYY-MM-DD"T"HH24:MI') AS moved_end_local,
            moved_time_zone,
            moved_starts_at,
            moved_ends_at,
            moved_start_date::text AS moved_start_date,
            moved_end_date::text AS moved_end_date
     FROM calendar_event_occurrence_exceptions
     WHERE user_id = $1
       AND event_id = ANY($2::uuid[])
       AND (moved_start_local IS NOT NULL OR moved_start_date IS NOT NULL)
     ORDER BY event_id, occurrence_key`,
    [ownerId, uniqueIds],
  );
  const movements = new Map<string, Map<string, CalendarOccurrenceMovement>>();
  for (const row of result.rows) {
    let movement: CalendarOccurrenceMovement;
    if (row.moved_start_local !== null && row.moved_end_local !== null
      && row.moved_time_zone !== null && row.moved_starts_at !== null
      && row.moved_ends_at !== null && row.moved_start_date === null
      && row.moved_end_date === null) {
      movement = {
        kind: "timed",
        startLocal: row.moved_start_local,
        endLocal: row.moved_end_local,
        timeZone: validateTimeZone(row.moved_time_zone),
        startsAt: asIsoInstant(row.moved_starts_at),
        endsAt: asIsoInstant(row.moved_ends_at),
      };
    } else if (row.moved_start_date !== null && row.moved_end_date !== null
      && row.moved_start_local === null && row.moved_end_local === null
      && row.moved_time_zone === null && row.moved_starts_at === null
      && row.moved_ends_at === null) {
      movement = {
        kind: "all-day",
        startDate: row.moved_start_date,
        endDate: row.moved_end_date,
      };
    } else {
      throw new Error("Stored calendar occurrence movement has invalid bounds.");
    }
    let eventMovements = movements.get(row.event_id);
    if (!eventMovements) {
      eventMovements = new Map();
      movements.set(row.event_id, eventMovements);
    }
    eventMovements.set(row.occurrence_key, movement);
  }
  return movements;
}

function buildSeriesProposalSnapshot(
  request: CalendarSeriesDraftRequest,
  eventId: string,
  target: CalendarEvent | null,
  existingCandidates: SeriesCandidateSet,
  now: string,
  targetCancelledOccurrenceKeys: ReadonlySet<string> = new Set(),
  targetOccurrenceMovements: ReadonlyMap<string, CalendarOccurrenceMovement> = new Map(),
): SeriesProposalSnapshot {
  const beforeOccurrences = target?.recurrenceRule
    ? expandFullCalendarSeries(target, target.recurrenceRule)
      .map((occurrence) => applySavedOccurrenceMovement(occurrence, targetOccurrenceMovements))
      .map(occurrenceSnapshot)
    : [];
  const targetSnapshot = target
    ? snapshotTarget(target, request.action === "split-series")
    : null;

  if (request.action === "cancel-occurrence") {
    if (!target || targetCancelledOccurrenceKeys.has(request.occurrenceKey)) {
      throw new CalendarRouteError(
        409,
        "OCCURRENCE_ALREADY_CANCELLED",
        "That occurrence is no longer available to cancel. Reload the calendar.",
      );
    }
    const occurrence = beforeOccurrences.find(({ occurrenceKey }) =>
      occurrenceKey === request.occurrenceKey
    );
    if (!occurrence) {
      throw new CalendarRouteError(
        409,
        "OCCURRENCE_NOT_IN_SERIES",
        "That occurrence no longer belongs to this recurring series. Reload the calendar.",
      );
    }
    return {
      version: 1,
      eventId,
      calendarTimeZone: null,
      target: targetSnapshot,
      beforeOccurrences: [occurrence],
      afterOccurrences: [],
      conflicts: [],
    };
  }

  if (request.action === "restore-occurrence") {
    if (!target || !targetCancelledOccurrenceKeys.has(request.occurrenceKey)) {
      throw new CalendarRouteError(
        409,
        "OCCURRENCE_NOT_CANCELLED",
        "That occurrence is no longer cancelled. Reload the calendar before restoring it.",
      );
    }
    const occurrence = beforeOccurrences.find(({ occurrenceKey }) =>
      occurrenceKey === request.occurrenceKey
    );
    const baseOccurrence = target.recurrenceRule
      ? expandFullCalendarSeries(target, target.recurrenceRule).find(({ occurrenceKey }) =>
          occurrenceKey === request.occurrenceKey
        )
      : undefined;
    const expandedOccurrence = baseOccurrence
      ? applySavedOccurrenceMovement(baseOccurrence, targetOccurrenceMovements)
      : undefined;
    if (!occurrence || !expandedOccurrence) {
      throw new CalendarRouteError(
        409,
        "OCCURRENCE_NOT_IN_SERIES",
        "That occurrence no longer belongs to this recurring series. Reload the calendar.",
      );
    }

    let conflicts: readonly CalendarSeriesOccurrenceConflict[];
    try {
      conflicts = findCalendarOccurrenceConflicts(
        expandedOccurrence,
        existingCandidates.events,
        request.calendarTimeZone,
        existingCandidates.cancelledOccurrenceKeys,
        existingCandidates.occurrenceMovements,
      );
    } catch (error) {
      if (error instanceof RangeError || error instanceof RecurrenceError) {
        throw new CalendarRouteError(
          422,
          "OCCURRENCE_CONFLICTS_UNVERIFIABLE",
          "Chron could not verify every overlap for this occurrence. Narrow or correct the calendar and try again.",
        );
      }
      throw error;
    }

    return {
      version: 1,
      eventId,
      calendarTimeZone: request.calendarTimeZone,
      target: targetSnapshot,
      beforeOccurrences: [],
      afterOccurrences: [occurrence],
      conflicts,
    };
  }

  if (request.action === "move-occurrence") {
    if (!target || targetCancelledOccurrenceKeys.has(request.occurrenceKey)) {
      throw new CalendarRouteError(
        409,
        target ? "OCCURRENCE_ALREADY_CANCELLED" : "OCCURRENCE_NOT_IN_SERIES",
        "That occurrence is no longer available to move. Reload the calendar.",
      );
    }
    const baseOccurrence = target.recurrenceRule
      ? expandFullCalendarSeries(target, target.recurrenceRule).find(({ occurrenceKey }) =>
          occurrenceKey === request.occurrenceKey
        )
      : undefined;
    const original = baseOccurrence
      ? applySavedOccurrenceMovement(baseOccurrence, targetOccurrenceMovements)
      : undefined;
    if (!original) {
      throw new CalendarRouteError(
        409,
        "OCCURRENCE_NOT_IN_SERIES",
        "That occurrence no longer belongs to this recurring series. Reload the calendar.",
      );
    }

    let moved: CalendarRecurrenceOccurrence;
    let conflicts: readonly CalendarSeriesOccurrenceConflict[];
    try {
      moved = applyCalendarOccurrenceMovement(
        original,
        resolveOccurrenceMovement(original, request.movement),
      );
      if (stableJson(occurrenceSnapshot(original)) === stableJson(occurrenceSnapshot(moved))) {
        throw new RangeError("The proposed schedule is unchanged.");
      }
      conflicts = findCalendarOccurrenceConflicts(
        moved,
        existingCandidates.events,
        request.calendarTimeZone,
        existingCandidates.cancelledOccurrenceKeys,
        existingCandidates.occurrenceMovements,
      );
    } catch (error) {
      if (error instanceof RangeError || error instanceof RecurrenceError) {
        throw new CalendarRouteError(
          422,
          "OCCURRENCE_MOVE_UNVERIFIABLE",
          "Chron could not verify the moved occurrence. Check its schedule and try again.",
        );
      }
      throw error;
    }
    return {
      version: 1,
      eventId,
      calendarTimeZone: request.calendarTimeZone,
      target: targetSnapshot,
      beforeOccurrences: [occurrenceSnapshot(original)],
      afterOccurrences: [occurrenceSnapshot(moved)],
      conflicts,
    };
  }

  if (request.action === "split-series") {
    if (!target) {
      throw new CalendarRouteError(
        409,
        "SERIES_TARGET_REQUIRED",
        "Choose a recurring event before splitting its following occurrences.",
      );
    }
    const plan = planCalendarSeriesSplit(
      target,
      request,
      eventId,
      now,
      targetCancelledOccurrenceKeys,
      targetOccurrenceMovements,
    );
    const prefixKeys = new Set(plan.targetOccurrences
      .slice(0, plan.splitIndex)
      .map(({ occurrenceKey }) => occurrenceKey));
    const prefixEvent: CalendarEvent = {
      ...target,
      recurrenceRule: { ...target.recurrenceRule!, count: plan.splitIndex },
    };
    const candidateCancelled = new Map(existingCandidates.cancelledOccurrenceKeys);
    candidateCancelled.set(target.id, new Set([...targetCancelledOccurrenceKeys]
      .filter((key) => prefixKeys.has(key))));
    const candidateMovements = new Map(existingCandidates.occurrenceMovements);
    candidateMovements.set(target.id, new Map([...targetOccurrenceMovements]
      .filter(([key]) => prefixKeys.has(key))));

    let comparison: ReturnType<typeof findCalendarSeriesConflicts>;
    try {
      comparison = findCalendarSeriesConflicts(
        plan.segment,
        request.recurrenceRule,
        [...existingCandidates.events, prefixEvent],
        request.calendarTimeZone,
        undefined,
        candidateCancelled,
        candidateMovements,
        new Map([[plan.segment.id, plan.occurrenceMovements]]),
        plan.cancelledOccurrenceKeys,
      );
    } catch (error) {
      if (error instanceof RangeError || error instanceof RecurrenceError) {
        throw new CalendarRouteError(
          422,
          "SERIES_SPLIT_UNVERIFIABLE",
          "Chron could not verify every overlap for the proposed following occurrences.",
        );
      }
      throw error;
    }

    const afterOccurrences = [
      ...beforeOccurrences.slice(0, plan.splitIndex),
      ...plan.segmentOccurrences
        .map((occurrence) => applySavedOccurrenceMovement(
          occurrence,
          plan.occurrenceMovements,
        ))
        .map(occurrenceSnapshot),
    ];
    return {
      version: 1,
      eventId,
      calendarTimeZone: request.calendarTimeZone,
      target: targetSnapshot,
      beforeOccurrences,
      afterOccurrences,
      conflicts: comparison.conflicts,
    };
  }

  if (request.action === "delete") {
    return {
      version: 1,
      eventId,
      calendarTimeZone: null,
      target: targetSnapshot,
      beforeOccurrences,
      afterOccurrences: [],
      conflicts: [],
    };
  }

  const event = seriesEventFromMutation(
    eventId,
    request.event,
    request.recurrenceRule,
    target ? target.revision + 1 : 1,
    target?.createdAt ?? now,
    now,
  );
  let comparison: ReturnType<typeof findCalendarSeriesConflicts>;
  try {
    comparison = findCalendarSeriesConflicts(
      event,
      request.recurrenceRule,
      existingCandidates.events,
      request.calendarTimeZone,
      target?.id,
      existingCandidates.cancelledOccurrenceKeys,
      existingCandidates.occurrenceMovements,
      target ? new Map([[target.id, targetOccurrenceMovements]]) : new Map(),
    );
  } catch (error) {
    if (error instanceof RangeError || error instanceof RecurrenceError) {
      throw new CalendarRouteError(
        422,
        "SERIES_CONFLICTS_UNVERIFIABLE",
        "Chron could not verify every recurring overlap. Narrow or correct the series and try again.",
      );
    }
    throw error;
  }

  if (request.action === "update") {
    const proposedKeys = new Set(comparison.occurrences.map(({ occurrenceKey }) => occurrenceKey));
    if ([...targetCancelledOccurrenceKeys].some((key) => !proposedKeys.has(key))) {
      throw new CalendarRouteError(
        409,
        "SERIES_CANCELLATION_NOT_PRESERVED",
        "This series change would move or remove a cancelled occurrence. Keep its scheduled date unchanged and review the change again.",
      );
    }
    if ([...targetOccurrenceMovements.keys()].some((key) => !proposedKeys.has(key))) {
      throw new CalendarRouteError(
        409,
        "SERIES_MOVEMENT_NOT_PRESERVED",
        "This series change would remove an occurrence with an approved move. Keep its original identity and review the change again.",
      );
    }
  }

  return {
    version: 1,
    eventId,
    calendarTimeZone: request.calendarTimeZone,
    target: targetSnapshot,
    beforeOccurrences,
    afterOccurrences: comparison.occurrences
      .map((occurrence) => applySavedOccurrenceMovement(occurrence, targetOccurrenceMovements))
      .map(occurrenceSnapshot),
    conflicts: comparison.conflicts,
  };
}

function seriesDraftResult(row: SeriesDraftRow, replayed: boolean): CalendarSeriesDraftResult {
  const request = row.normalized_payload === null
    ? null
    : parseCalendarSeriesDraftRequest(row.normalized_payload);
  const snapshot = row.conflict_snapshot === null
    ? null
    : readSeriesSnapshot(row.conflict_snapshot);
  return {
    id: row.id,
    action: row.action,
    scope: row.scope,
    outcome: row.outcome,
    replayed,
    targetEventId: row.target_event_id,
    targetRevision: row.target_revision,
    event: request && (request.action === "create" || request.action === "update"
      || request.action === "split-series")
      ? request.event
      : null,
    recurrenceRule: request && (request.action === "create" || request.action === "update"
      || request.action === "split-series")
      ? request.recurrenceRule
      : null,
    calendarTimeZone: request && (request.action === "create" || request.action === "update"
      || request.action === "split-series")
      ? request.calendarTimeZone
      : snapshot?.calendarTimeZone ?? null,
    beforeOccurrences: snapshot?.beforeOccurrences ?? [],
    afterOccurrences: snapshot?.afterOccurrences ?? [],
    conflicts: snapshot?.conflicts ?? [],
    expiresAt: asIsoTimestamp(row.expires_at),
  };
}

function calendarSeriesApproval(
  row: SeriesDraftRow,
  event: CalendarEvent | null = null,
): CalendarSeriesApprovalResult {
  if (row.outcome === "pending") throw new Error("A pending series proposal has no approval result.");
  return {
    id: row.id,
    action: row.action,
    outcome: row.outcome,
    event,
  };
}

async function transitionPendingSeriesDraft(
  client: PoolClient,
  ownerId: string,
  draftId: string,
  outcome: "stale" | "expired",
): Promise<SeriesDraftRow> {
  const result = await client.query<SeriesDraftRow>(
    `WITH resolution_clock AS (
       SELECT clock_timestamp() AS transition_at
     )
     UPDATE calendar_event_series_proposal_drafts AS draft
     SET outcome = $3,
         normalized_payload = NULL,
         payload_hash = NULL,
         conflict_snapshot = NULL,
         target_event_id = NULL,
         target_revision = NULL,
         result_event_id = NULL,
         resolved_at = CASE
           WHEN $3 = 'expired' THEN GREATEST(resolution_clock.transition_at, draft.expires_at)
           ELSE resolution_clock.transition_at
         END,
         updated_at = CASE
           WHEN $3 = 'expired' THEN GREATEST(resolution_clock.transition_at, draft.expires_at)
           ELSE resolution_clock.transition_at
         END
     FROM resolution_clock
     WHERE draft.user_id = $1
       AND draft.id = $2::uuid
       AND draft.outcome = 'pending'
     RETURNING ${seriesDraftColumns}`,
    [ownerId, draftId, outcome],
  );
  if (!result.rows[0]) throw new Error("The pending recurring proposal could not be resolved.");
  return result.rows[0];
}

async function staleOtherSeriesDraftsForTarget(
  client: PoolClient,
  ownerId: string,
  eventId: string,
  exceptDraftId: string,
): Promise<void> {
  await client.query(
    `WITH resolution_clock AS (
       SELECT clock_timestamp() AS resolved_at
     )
     UPDATE calendar_event_series_proposal_drafts AS draft
     SET outcome = 'stale',
         normalized_payload = NULL,
         payload_hash = NULL,
         conflict_snapshot = NULL,
         target_event_id = NULL,
         target_revision = NULL,
         result_event_id = NULL,
         resolved_at = resolution_clock.resolved_at,
         updated_at = resolution_clock.resolved_at
     FROM resolution_clock
     WHERE draft.user_id = $1
       AND draft.target_event_id = $2::uuid
       AND draft.id <> $3::uuid
       AND draft.outcome = 'pending'`,
    [ownerId, eventId, exceptDraftId],
  );
}

async function markApprovedSeriesDraftsDeleted(
  client: PoolClient,
  ownerId: string,
  eventId: string,
): Promise<void> {
  await client.query(
    `WITH resolution_clock AS (
       SELECT clock_timestamp() AS resolved_at
     )
     UPDATE calendar_event_series_proposal_drafts AS draft
     SET outcome = 'deleted',
         normalized_payload = NULL,
         payload_hash = NULL,
         conflict_snapshot = NULL,
         target_event_id = NULL,
         target_revision = NULL,
         result_event_id = NULL,
         resolved_at = resolution_clock.resolved_at,
         updated_at = resolution_clock.resolved_at
     FROM resolution_clock
     WHERE draft.user_id = $1
       AND draft.result_event_id = $2::uuid
       AND draft.outcome = 'approved'
       AND draft.action IN ('create', 'update')`,
    [ownerId, eventId],
  );
}

function seriesProposalExpired(expiresAt: Date | string, now: Date | string): boolean {
  return Temporal.Instant.compare(
    Temporal.Instant.from(asIsoTimestamp(now)),
    Temporal.Instant.from(asIsoTimestamp(expiresAt)),
  ) >= 0;
}

async function insertSeriesEvent(
  client: PoolClient,
  ownerId: string,
  eventId: string,
  mutation: CalendarEventMutation,
  rule: CalendarRecurrenceRule,
  seriesRootId: string = eventId,
): Promise<CalendarEvent> {
  const recurrence = normalizeRecurrenceRule(rule);
  const result = mutation.kind === "timed"
    ? await (() => {
        const start = resolveLocalDateTime(
          mutation.startLocal,
          mutation.timeZone,
          mutation.startDisambiguation,
        );
        const end = resolveLocalDateTime(
          mutation.endLocal,
          mutation.timeZone,
          mutation.endDisambiguation,
        );
        resolveTimedDuration(start.instant, end.instant);
        return client.query<EventRow>(
          `INSERT INTO calendar_events (
             id, user_id, kind, title, details, start_local, end_local,
             time_zone, starts_at, ends_at, recurrence_frequency,
             recurrence_interval, recurrence_count, reminder_choice,
             reminder_time_zone, revision, series_root_id
           ) VALUES (
             $1, $2, 'timed', $3, $4, $5::timestamp, $6::timestamp,
             $7, $8::timestamptz, $9::timestamptz, $10, $11, $12, $13,
             NULL, 1, $14::uuid
           )
           RETURNING ${eventColumns}`,
          [
            eventId,
            ownerId,
            mutation.title,
            mutation.details ?? null,
            start.local,
            end.local,
            start.timeZone,
            start.instant,
            end.instant,
            recurrence.frequency,
            recurrence.interval,
            recurrence.count,
            mutation.reminderChoice ?? "none",
            seriesRootId,
          ],
        );
      })()
    : await client.query<EventRow>(
        `INSERT INTO calendar_events (
           id, user_id, kind, title, details, start_date, end_date,
           recurrence_frequency, recurrence_interval, recurrence_count,
           reminder_choice, reminder_time_zone, revision, series_root_id
         ) VALUES (
           $1, $2, 'all-day', $3, $4, $5::date, $6::date, $7, $8, $9,
           $10, $11, 1, $12::uuid
         )
         RETURNING ${eventColumns}`,
        [
          eventId,
          ownerId,
          mutation.title,
          mutation.details ?? null,
          mutation.startDate,
          mutation.endDate,
          recurrence.frequency,
          recurrence.interval,
          recurrence.count,
          mutation.reminderChoice ?? "none",
          mutation.reminderChoice === "none" || mutation.reminderChoice === undefined
            ? null
            : mutation.reminderTimeZone,
          seriesRootId,
        ],
      );
  if (!result.rows[0]) throw new Error("Recurring event insert returned no row.");
  return toCalendarEvent(result.rows[0]);
}

async function updateSeriesEvent(
  client: PoolClient,
  ownerId: string,
  eventId: string,
  expectedRevision: number,
  mutation: CalendarEventMutation,
  rule: CalendarRecurrenceRule,
): Promise<CalendarEvent | null> {
  const recurrence = normalizeRecurrenceRule(rule);
  const result = mutation.kind === "timed"
    ? await (() => {
        const start = resolveLocalDateTime(
          mutation.startLocal,
          mutation.timeZone,
          mutation.startDisambiguation,
        );
        const end = resolveLocalDateTime(
          mutation.endLocal,
          mutation.timeZone,
          mutation.endDisambiguation,
        );
        resolveTimedDuration(start.instant, end.instant);
        return client.query<EventRow>(
          `UPDATE calendar_events
           SET kind = 'timed',
               title = $4,
               details = $5,
               start_local = $6::timestamp,
               end_local = $7::timestamp,
               time_zone = $8,
               starts_at = $9::timestamptz,
               ends_at = $10::timestamptz,
               start_date = NULL,
               end_date = NULL,
               recurrence_frequency = $11,
               recurrence_interval = $12,
               recurrence_count = $13,
               reminder_choice = $14,
               reminder_time_zone = NULL,
               revision = revision + 1,
               updated_at = clock_timestamp()
           WHERE user_id = $1 AND id = $2::uuid AND revision = $3
           RETURNING ${eventColumns}`,
          [
            ownerId,
            eventId,
            expectedRevision,
            mutation.title,
            mutation.details ?? null,
            start.local,
            end.local,
            start.timeZone,
            start.instant,
            end.instant,
            recurrence.frequency,
            recurrence.interval,
            recurrence.count,
            mutation.reminderChoice ?? "none",
          ],
        );
      })()
    : await client.query<EventRow>(
        `UPDATE calendar_events
         SET kind = 'all-day',
             title = $4,
             details = $5,
             start_local = NULL,
             end_local = NULL,
             time_zone = NULL,
             starts_at = NULL,
             ends_at = NULL,
             start_date = $6::date,
             end_date = $7::date,
             recurrence_frequency = $8,
             recurrence_interval = $9,
             recurrence_count = $10,
             reminder_choice = $11,
             reminder_time_zone = $12,
             revision = revision + 1,
             updated_at = clock_timestamp()
         WHERE user_id = $1 AND id = $2::uuid AND revision = $3
         RETURNING ${eventColumns}`,
        [
          ownerId,
          eventId,
          expectedRevision,
          mutation.title,
          mutation.details ?? null,
          mutation.startDate,
          mutation.endDate,
          recurrence.frequency,
          recurrence.interval,
          recurrence.count,
          mutation.reminderChoice ?? "none",
          mutation.reminderChoice === "none" || mutation.reminderChoice === undefined
            ? null
            : mutation.reminderTimeZone,
        ],
      );
  return result.rows[0] ? toCalendarEvent(result.rows[0]) : null;
}

async function truncateCalendarSeriesSegment(
  client: PoolClient,
  ownerId: string,
  eventId: string,
  expectedRevision: number,
  prefixCount: number,
): Promise<CalendarEvent | null> {
  const result = await client.query<EventRow>(
    `UPDATE calendar_events
     SET recurrence_count = $4,
         revision = revision + 1,
         updated_at = clock_timestamp()
     WHERE user_id = $1 AND id = $2::uuid AND revision = $3
       AND recurrence_frequency IS NOT NULL
     RETURNING ${eventColumns}`,
    [ownerId, eventId, expectedRevision, prefixCount],
  );
  return result.rows[0] ? toCalendarEvent(result.rows[0]) : null;
}

async function transferSplitOccurrenceExceptions(
  client: PoolClient,
  ownerId: string,
  sourceEventId: string,
  followingEventId: string,
  plan: CalendarSeriesSplitPlan,
): Promise<void> {
  const mapping = [...plan.sourceToFollowingOccurrenceKey]
    .map(([sourceKey, followingKey]) => ({
      source_key: sourceKey,
      following_key: followingKey,
    }));
  await client.query(
    `INSERT INTO calendar_event_occurrence_exceptions (
       user_id, event_id, occurrence_key, is_cancelled, cancelled_at,
       moved_start_local, moved_end_local, moved_time_zone,
       moved_starts_at, moved_ends_at, moved_start_date, moved_end_date, updated_at
     )
     SELECT exception.user_id,
            $3::uuid,
            mapping.following_key,
            exception.is_cancelled,
            exception.cancelled_at,
            exception.moved_start_local,
            exception.moved_end_local,
            exception.moved_time_zone,
            exception.moved_starts_at,
            exception.moved_ends_at,
            exception.moved_start_date,
            exception.moved_end_date,
            clock_timestamp()
     FROM calendar_event_occurrence_exceptions AS exception
     JOIN jsonb_to_recordset($4::jsonb) AS mapping(source_key text, following_key text)
       ON mapping.source_key = exception.occurrence_key
     WHERE exception.user_id = $1 AND exception.event_id = $2::uuid`,
    [ownerId, sourceEventId, followingEventId, JSON.stringify(mapping)],
  );
  const sourceKeys = [...plan.sourceToFollowingOccurrenceKey.keys()];
  await client.query(
    `DELETE FROM calendar_event_occurrence_exceptions
     WHERE user_id = $1 AND event_id = $2::uuid
       AND occurrence_key = ANY($3::text[])`,
    [ownerId, sourceEventId, sourceKeys],
  );
}

async function reconcileSplitSeriesReminders(
  client: PoolClient,
  ownerId: string,
  source: CalendarEvent,
  prefixRevision: number,
  plan: CalendarSeriesSplitPlan,
  cancelledOccurrenceKeys: ReadonlySet<string>,
): Promise<ReadonlySet<string>> {
  const prefixKeys = plan.targetOccurrences
    .slice(0, plan.splitIndex)
    .map(({ occurrenceKey }) => occurrenceKey);
  const suffixKeys = [...plan.sourceToFollowingOccurrenceKey.keys()];
  const cancelledPrefixKeys = prefixKeys.filter((key) => cancelledOccurrenceKeys.has(key));
  const activePrefixKeys = prefixKeys.filter((key) => !cancelledOccurrenceKeys.has(key));

  await client.query(
    `UPDATE calendar_event_reminders
     SET event_revision = $3,
         updated_at = clock_timestamp()
     WHERE user_id = $1 AND event_id = $2::uuid
       AND event_revision = $4
       AND occurrence_key = ANY($5::text[])
       AND status = 'pending'`,
    [ownerId, source.id, prefixRevision, source.revision, activePrefixKeys],
  );
  await client.query(
    `UPDATE calendar_event_reminders
     SET status = 'cancelled',
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = clock_timestamp()
     WHERE user_id = $1 AND event_id = $2::uuid
       AND occurrence_key = ANY($3::text[])
       AND status IN ('pending', 'leased')
       AND (occurrence_key = ANY($4::text[])
         OR occurrence_key = ANY($5::text[]))`,
    [ownerId, source.id, [...prefixKeys, ...suffixKeys], cancelledPrefixKeys, suffixKeys],
  );

  const attemptedResult = await client.query<{ occurrence_key: string } & QueryResultRow>(
    `SELECT DISTINCT occurrence_key
     FROM calendar_event_reminders
     WHERE user_id = $1 AND event_id = $2::uuid
       AND occurrence_key = ANY($3::text[]) AND attempt_count > 0`,
    [ownerId, source.id, suffixKeys],
  );
  const blockedFollowingKeys = new Set<string>();
  for (const row of attemptedResult.rows) {
    const followingKey = plan.sourceToFollowingOccurrenceKey.get(row.occurrence_key);
    if (followingKey) blockedFollowingKeys.add(followingKey);
  }
  return blockedFollowingKeys;
}

function assertConflictReview(
  current: readonly CalendarConflict[],
  reviewed: readonly CalendarConflictReview[],
): void {
  const currentReferences = current.map(({ id, revision }) => ({ id, revision }));
  if (JSON.stringify(currentReferences) !== JSON.stringify(reviewed)) {
    throw new CalendarRouteError(
      409,
      "CONFLICT_REVIEW_REQUIRED",
      "Calendar overlaps changed. Review the current events before approving this change.",
    );
  }
}

export class CalendarRepository {
  private readonly pool: Pick<Pool, "connect">;

  constructor(pool: Pick<Pool, "connect">) {
    this.pool = pool;
  }

  claimCalendarReminderJobs(
    ownerId: string,
    limit = 5,
  ): Promise<readonly CalendarReminderClaim[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw new RangeError("Calendar reminder claim limit must be between 1 and 25.");
    }
    const leaseToken = randomUUID();
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      await client.query(
        `UPDATE calendar_event_reminders reminder
         SET status = 'cancelled',
             lease_token = NULL,
             lease_expires_at = NULL,
             updated_at = clock_timestamp()
         FROM calendar_events event
         WHERE reminder.user_id = $1
           AND event.user_id = $1
           AND event.id = reminder.event_id
           AND event.revision <> reminder.event_revision
           AND reminder.status IN ('pending', 'leased')`,
        [ownerId],
      );
      await client.query(
        `UPDATE calendar_event_reminders
         SET status = 'failed',
             lease_token = NULL,
             lease_expires_at = NULL,
             last_error_code = 'ATTEMPTS_EXHAUSTED',
             updated_at = clock_timestamp()
         WHERE user_id = $1
           AND status = 'leased'
           AND lease_expires_at <= clock_timestamp()
           AND attempt_count >= 5`,
        [ownerId],
      );
      const result = await client.query<CalendarReminderClaimRow>(
        `WITH claimable AS (
           SELECT reminder.id
           FROM calendar_event_reminders reminder
           JOIN calendar_events event
             ON event.user_id = reminder.user_id
            AND event.id = reminder.event_id
            AND event.revision = reminder.event_revision
           WHERE reminder.user_id = $1
             AND reminder.attempt_count < 5
             AND (
               (reminder.status = 'pending'
                AND reminder.next_attempt_at <= clock_timestamp())
               OR
               (reminder.status = 'leased'
                AND reminder.lease_expires_at <= clock_timestamp())
             )
           ORDER BY reminder.next_attempt_at, reminder.id
           FOR UPDATE OF reminder SKIP LOCKED
           LIMIT $2
         )
         UPDATE calendar_event_reminders reminder
         SET status = 'leased',
             attempt_count = reminder.attempt_count + 1,
             lease_token = $3::uuid,
             lease_expires_at = clock_timestamp() + interval '5 minutes',
             updated_at = clock_timestamp()
         FROM claimable, "user" account
         WHERE reminder.id = claimable.id
           AND account."id" = reminder.user_id
         RETURNING reminder.id,
                   reminder.event_id,
                   reminder.event_revision,
                   reminder.occurrence_key,
                   reminder.time_zone,
                   reminder.attempt_count,
                   reminder.lease_token,
                   account.email,
                   account."emailVerified" AS email_verified`,
        [ownerId, limit, leaseToken],
      );
      return result.rows.map((row) => ({
        id: row.id,
        eventId: row.event_id,
        eventRevision: row.event_revision,
        occurrenceKey: row.occurrence_key,
        timeZone: row.time_zone,
        attemptCount: row.attempt_count,
        leaseToken: row.lease_token,
        recipient: row.email,
        recipientVerified: row.email_verified,
      }));
    }, true);
  }

  calendarReminderLeaseIsCurrent(
    ownerId: string,
    claim: CalendarReminderClaim,
  ): Promise<boolean> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query(
        `SELECT 1
         FROM calendar_event_reminders reminder
         JOIN calendar_events event
           ON event.user_id = reminder.user_id
          AND event.id = reminder.event_id
          AND event.revision = reminder.event_revision
         JOIN "user" account
           ON account."id" = reminder.user_id
          AND account.email = $4
          AND account."emailVerified" IS TRUE
         WHERE reminder.user_id = $1
           AND reminder.id = $2::uuid
           AND reminder.event_revision = $5
           AND reminder.status = 'leased'
           AND reminder.lease_token = $3::uuid
           AND reminder.lease_expires_at > clock_timestamp()`,
        [ownerId, claim.id, claim.leaseToken, claim.recipient, claim.eventRevision],
      );
      return result.rows.length === 1;
    });
  }

  calendarReminderDeliveryContext(
    ownerId: string,
    claim: CalendarReminderClaim,
  ): Promise<CalendarReminderDeliveryContext | null> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query<EventRow>(
        `SELECT ${eventColumns}
         FROM calendar_events
         WHERE user_id = $1 AND id = $2::uuid AND revision = $3`,
        [ownerId, claim.eventId, claim.eventRevision],
      );
      const row = result.rows[0];
      if (!row) return null;
      const event = toCalendarEvent(row);
      if (event.reminderChoice === "none") return null;
      const cancelled = await loadCancelledOccurrenceKeys(client, ownerId, [event.id]);
      if (cancelled.get(event.id)?.has(claim.occurrenceKey)) return null;
      const movements = await loadOccurrenceMovements(client, ownerId, [event.id]);
      const occurrence = reminderOccurrences(event, movements.get(event.id))
        .find((candidate) => candidate.occurrenceKey === claim.occurrenceKey);
      if (!occurrence) return null;
      return occurrence.kind === "timed"
        ? {
            eventKind: "timed",
            eventStart: occurrence.startsAt,
            timeZone: occurrence.timeZone,
          }
        : {
            eventKind: "all-day",
            eventStart: occurrence.startDate,
            timeZone: claim.timeZone,
          };
    });
  }

  recordCalendarReminderOutcome(
    ownerId: string,
    claim: CalendarReminderClaim,
    outcome: CalendarReminderOutcome,
  ): Promise<boolean> {
    const status = outcome.kind === "retry" ? "pending" : outcome.kind;
    const errorCode = outcome.kind === "sent" ? null
      : outcome.kind === "cancelled" ? "EVENT_STALE"
        : outcome.errorCode;
    if (errorCode !== null && !/^[A-Z0-9_]{1,64}$/u.test(errorCode)) {
      throw new RangeError("Calendar reminder error codes must be sanitized categories.");
    }
    const delaySeconds = outcome.kind === "retry" ? outcome.delaySeconds : 0;
    if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 86_400) {
      throw new RangeError("Calendar reminder retry delay must be bounded to one day.");
    }

    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query(
        `UPDATE calendar_event_reminders
         SET status = $4,
             lease_token = NULL,
             lease_expires_at = NULL,
             next_attempt_at = CASE
               WHEN $4 = 'pending'
                 THEN clock_timestamp() + ($7::integer * interval '1 second')
               ELSE next_attempt_at
             END,
             sent_at = CASE WHEN $4 = 'sent' THEN clock_timestamp() ELSE NULL END,
             last_error_code = $5,
             updated_at = clock_timestamp()
         WHERE user_id = $1
           AND id = $2::uuid
           AND event_revision = $6
           AND status = 'leased'
           AND lease_token = $3::uuid
           AND lease_expires_at > clock_timestamp()
         RETURNING id`,
        [ownerId, claim.id, claim.leaseToken, status, errorCode, claim.eventRevision, delaySeconds],
      );
      return result.rows.length === 1;
    }, true);
  }

  getCalendarReminderStatus(
    ownerId: string,
    eventId: string,
  ): Promise<CalendarReminderStatusSummary> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const eventResult = await client.query<{ revision: number }>(
        `SELECT revision
         FROM calendar_events
         WHERE user_id = $1 AND id = $2::uuid`,
        [ownerId, eventId],
      );
      const event = eventResult.rows[0];
      if (!event) {
        throw new CalendarRouteError(
          404,
          "EVENT_NOT_FOUND",
          "That calendar event could not be found.",
        );
      }

      const result = await client.query<CalendarReminderStatusRow>(
        `SELECT status,
                attempt_count,
                next_attempt_at,
                sent_at,
                last_error_code
         FROM calendar_event_reminders
         WHERE user_id = $1
           AND event_id = $2::uuid
           AND event_revision = $3
         ORDER BY next_attempt_at, id
         LIMIT 367`,
        [ownerId, eventId, event.revision],
      );
      return summarizeCalendarReminderStatuses(result.rows);
    });
  }

  listEvents(
    ownerId: string,
    from: string,
    to: string,
    timeZone: string,
  ): Promise<CalendarEventEntry[]> {
    const range = resolveCalendarRange(from, to, timeZone);
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query<EventRow>(
        `SELECT ${eventColumns}
         FROM calendar_events
         WHERE user_id = $1
           AND (
             (
               recurrence_frequency IS NULL
               AND (
                 (kind = 'all-day' AND start_date < $3::date AND end_date > $2::date)
                 OR
                 (kind = 'timed' AND starts_at < $5::timestamptz AND ends_at > $4::timestamptz)
               )
             )
             OR
             (
               recurrence_frequency IS NOT NULL
               AND (
                 (kind = 'all-day' AND start_date < $3::date
                   AND start_date >= $2::date - 374)
                 OR
                 (kind = 'timed' AND starts_at < $5::timestamptz
                   AND starts_at >= $4::timestamptz - interval '374 days')
                OR EXISTS (
                  SELECT 1
                  FROM calendar_event_occurrence_exceptions exception
                  WHERE exception.user_id = $1
                    AND exception.event_id = calendar_events.id
                    AND NOT exception.is_cancelled
                    AND (
                      (exception.moved_start_local IS NOT NULL
                        AND exception.moved_starts_at < $5::timestamptz
                        AND exception.moved_ends_at > $4::timestamptz)
                      OR
                      (exception.moved_start_date IS NOT NULL
                        AND exception.moved_start_date < $3::date
                        AND exception.moved_end_date > $2::date)
                    )
                )
               )
             )
           )
         ORDER BY id
         LIMIT $6`,
        [
          ownerId,
          range.fromDate,
          range.toDate,
          range.startsAt,
          range.endsAt,
          maximumEventsPerRange + 1,
        ],
      );

      if (result.rows.length > maximumEventsPerRange) {
        throw new CalendarRouteError(
          422,
          "RANGE_CANDIDATE_LIMIT",
          "There are too many calendar events to verify in this range. Narrow the date range and try again.",
        );
      }

      const eventRows = result.rows.map(toCalendarEvent);
      const cancelledOccurrenceKeys = await loadCancelledOccurrenceKeys(
        client,
        ownerId,
        eventRows.filter((event) => event.recurrenceRule).map(({ id }) => id),
      );
      const occurrenceMovements = await loadOccurrenceMovements(
        client,
        ownerId,
        eventRows.filter((event) => event.recurrenceRule).map(({ id }) => id),
      );

      const events: CalendarEventEntry[] = [];
      try {
        for (const event of eventRows) {
          if (!event.recurrenceRule) {
            events.push(event);
          } else {
            const occurrences = occurrencesForCalendarRange(
              event,
              range,
              timeZone,
              occurrenceMovements.get(event.id) ?? new Map(),
            );
            for (const occurrence of occurrences) {
              if (cancelledOccurrenceKeys.get(event.id)?.has(occurrence.occurrenceKey)) {
                continue;
              }
              const entry: CalendarEventOccurrence = {
                ...occurrence,
                id: occurrence.occurrenceKey,
                series: event,
              };
              events.push(entry);
              if (events.length > maximumEventsPerRange) {
                throw new CalendarRouteError(
                  422,
                  "RANGE_RESULT_LIMIT",
                  "Narrow the date range to see these events.",
                );
              }
            }
          }
          if (events.length > maximumEventsPerRange) {
            throw new CalendarRouteError(
              422,
              "RANGE_RESULT_LIMIT",
              "Narrow the date range to see these events.",
            );
          }
        }
      } catch (error) {
        if (error instanceof CalendarRouteError) throw error;
        if (error instanceof RangeError || error instanceof RecurrenceError) {
          throw new CalendarRouteError(
            422,
            "RECURRENCE_RANGE_UNVERIFIABLE",
            "Chron could not verify every recurring event in this range. Narrow the date range and try again.",
          );
        }
        throw error;
      }

      const startForOrder = (event: CalendarEventEntry) => event.kind === "timed"
        ? event.startsAt
        : Temporal.PlainDate.from(event.startDate)
            .toZonedDateTime(timeZone)
            .toInstant()
            .toString();
      const seriesIdForOrder = (event: CalendarEventEntry) =>
        "series" in event ? event.series.id : event.id;
      return events.sort((left, right) =>
        startForOrder(left).localeCompare(startForOrder(right))
        || seriesIdForOrder(left).localeCompare(seriesIdForOrder(right))
        || ("occurrenceKey" in left ? left.occurrenceKey : "")
          .localeCompare("occurrenceKey" in right ? right.occurrenceKey : ""),
      );
    });
  }

  listCancelledOccurrences(
    ownerId: string,
    from: string,
    to: string,
    timeZone: string,
  ): Promise<CalendarEventOccurrence[]> {
    const range = resolveCalendarRange(from, to, timeZone);
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query<EventRow>(
        `SELECT ${eventColumns}
         FROM calendar_events
         WHERE user_id = $1
           AND recurrence_frequency IS NOT NULL
           AND (
             (kind = 'all-day' AND start_date < $3::date
               AND start_date >= $2::date - 374)
             OR
             (kind = 'timed' AND starts_at < $5::timestamptz
               AND starts_at >= $4::timestamptz - interval '374 days')
             OR EXISTS (
               SELECT 1
               FROM calendar_event_occurrence_exceptions exception
               WHERE exception.user_id = $1
                 AND exception.event_id = calendar_events.id
                 AND exception.is_cancelled
                 AND (
                   (exception.moved_start_local IS NOT NULL
                     AND exception.moved_starts_at < $5::timestamptz
                     AND exception.moved_ends_at > $4::timestamptz)
                   OR
                   (exception.moved_start_date IS NOT NULL
                     AND exception.moved_start_date < $3::date
                     AND exception.moved_end_date > $2::date)
                 )
             )
           )
         ORDER BY id
         LIMIT $6`,
        [
          ownerId,
          range.fromDate,
          range.toDate,
          range.startsAt,
          range.endsAt,
          maximumEventsPerRange + 1,
        ],
      );
      if (result.rows.length > maximumEventsPerRange) {
        throw new CalendarRouteError(
          422,
          "RANGE_CANDIDATE_LIMIT",
          "There are too many recurring events to verify in this range. Narrow the date range and try again.",
        );
      }

      const events = result.rows.map(toCalendarEvent);
      const cancelledOccurrenceKeys = await loadCancelledOccurrenceKeys(
        client,
        ownerId,
        events.map(({ id }) => id),
      );
      const occurrenceMovements = await loadOccurrenceMovements(
        client,
        ownerId,
        events.map(({ id }) => id),
      );
      const occurrences: CalendarEventOccurrence[] = [];
      try {
        for (const event of events) {
          if (!event.recurrenceRule) continue;
          const cancelled = cancelledOccurrenceKeys.get(event.id);
          if (!cancelled || cancelled.size === 0) continue;
          for (const occurrence of occurrencesForCalendarRange(
            event,
            range,
            timeZone,
            occurrenceMovements.get(event.id) ?? new Map(),
          )) {
            if (!cancelled.has(occurrence.occurrenceKey)) continue;
            occurrences.push({
              ...occurrence,
              id: occurrence.occurrenceKey,
              series: event,
            });
            if (occurrences.length > maximumEventsPerRange) {
              throw new CalendarRouteError(
                422,
                "RANGE_RESULT_LIMIT",
                "Narrow the date range to review cancelled occurrences.",
              );
            }
          }
        }
      } catch (error) {
        if (error instanceof CalendarRouteError) throw error;
        if (error instanceof RangeError || error instanceof RecurrenceError) {
          throw new CalendarRouteError(
            422,
            "RECURRENCE_RANGE_UNVERIFIABLE",
            "Chron could not verify cancelled occurrences in this range. Narrow the date range and try again.",
          );
        }
        throw error;
      }

      const startForOrder = (event: CalendarEventOccurrence) => event.kind === "timed"
        ? event.startsAt
        : Temporal.PlainDate.from(event.startDate).toZonedDateTime(timeZone).toInstant().toString();
      return occurrences.sort((left, right) =>
        startForOrder(left).localeCompare(startForOrder(right))
        || left.series.id.localeCompare(right.series.id)
        || left.occurrenceKey.localeCompare(right.occurrenceKey),
      );
    });
  }

  searchEvents(
    ownerId: string,
    search: CalendarEventSearchRequest,
  ): Promise<CalendarEvent[]> {
    const range = resolveCalendarRange(search.from, search.to, search.timeZone);
    const escapedQuery = search.query.replace(/[\\%_]/gu, (character) => `\\${character}`);
    const pattern = `%${escapedQuery}%`;
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      await client.query(
        "SELECT set_config('statement_timeout', $1, true)",
        [calendarSearchStatementTimeout],
      );
      const result = await client.query<EventRow>(
        `SELECT ${eventColumns}
         FROM calendar_events
         WHERE user_id = $1
           AND title ILIKE $2 ESCAPE E'\\\\'
           AND (
             (kind = 'all-day' AND start_date < $4::date AND end_date > $3::date)
             OR
             (kind = 'timed' AND starts_at < $7::timestamptz AND ends_at > $6::timestamptz)
           )
           AND ($8::text IS NULL OR kind = $8::text)
         ORDER BY
           CASE WHEN kind = 'all-day'
             THEN start_date::timestamp without time zone AT TIME ZONE $5::text
             ELSE starts_at
           END,
           id
         LIMIT $9`,
        [
          ownerId,
          pattern,
          range.fromDate,
          range.toDate,
          search.timeZone,
          range.startsAt,
          range.endsAt,
          search.kind ?? null,
          maximumEventsPerSearch + 1,
        ],
      ).catch((error: unknown) => {
        if (isPostgresQueryCancelled(error)) throw calendarSearchTimeoutError();
        throw error;
      });

      if (result.rows.length > maximumEventsPerSearch) {
        throw new CalendarRouteError(
          422,
          "SEARCH_RESULT_LIMIT",
          "Refine the title or narrow the date range to see these events.",
        );
      }
      return result.rows.map(toCalendarEvent);
    });
  }

  findConflicts(
    ownerId: string,
    mutation: CalendarEventMutation,
    calendarTimeZoneValue: string,
    excludeEventId?: string,
  ): Promise<CalendarConflict[]> {
    const bounds = conflictBounds(mutation, calendarTimeZoneValue);
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      return conflictsInTransaction(client, ownerId, bounds, excludeEventId);
    });
  }

  createEvent(
    ownerId: string,
    mutation: CalendarEventMutation,
    calendarTimeZone: string,
    reviewedConflicts: readonly CalendarConflictReview[],
    idempotencyKey: string,
  ): Promise<CalendarEventCreateResult> {
    const commit: CalendarEventCommit = { event: mutation, calendarTimeZone, reviewedConflicts };
    const requestHash = fingerprintCreateRequest(commit);
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const existing = await client.query<CreateRequestRow>(
        `SELECT encode(request_hash, 'hex') AS request_hash, event_id, state
         FROM calendar_event_create_requests
         WHERE user_id = $1 AND idempotency_key = $2`,
        [ownerId, idempotencyKey],
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        if (existingRow.state === "abandoned") throw abandonedCreateKey();
        if (existingRow.state === "deleted") {
          throw new CalendarRouteError(
            410,
            "CREATED_EVENT_DELETED",
            "This event was deleted after it was created. Review a new event before saving it again.",
          );
        }
        if (existingRow.request_hash !== requestHash.toString("hex")) {
          throw idempotencyKeyConflict();
        }
        if (existingRow.state !== "complete") {
          throw new CalendarRouteError(
            503,
            "IDEMPOTENCY_RESULT_UNAVAILABLE",
            "The saved event result is temporarily unavailable. Retry the same request key.",
          );
        }
        return createResultFromEvent(
          await loadCreatedEvent(client, ownerId, existingRow.event_id),
          true,
        );
      }

      const eventId = randomUUID();
      const reservation = await client.query<{ idempotency_key: string } & QueryResultRow>(
        `INSERT INTO calendar_event_create_requests (
           user_id, idempotency_key, request_hash, event_id, state
         ) VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [ownerId, idempotencyKey, requestHash, eventId],
      );
      if (!reservation.rows[0]) throw idempotencyKeyConflict();

      const bounds = conflictBounds(mutation, calendarTimeZone);
      await assertCalendarTimeZoneCurrent(client, ownerId, bounds.calendarTimeZone);
      assertConflictReview(
        await conflictsInTransaction(client, ownerId, bounds),
        reviewedConflicts,
      );
      const result = mutation.kind === "timed"
        ? await this.insertTimed(client, ownerId, eventId, mutation)
        : await client.query<EventRow>(
          `INSERT INTO calendar_events (
             id, user_id, kind, title, details, start_date, end_date,
             reminder_choice, reminder_time_zone, revision
           ) VALUES ($1, $2, 'all-day', $3, $4, $5::date, $6::date, $7, $8, 1)
           RETURNING ${eventColumns}`,
          [
            eventId,
            ownerId,
            mutation.title,
            mutation.details ?? null,
            mutation.startDate,
            mutation.endDate,
            mutation.reminderChoice ?? "none",
            mutation.reminderChoice === undefined || mutation.reminderChoice === "none"
              ? null
              : mutation.reminderTimeZone,
          ],
        );
      const row = result.rows[0];
      if (!row) throw new Error("Calendar event insert returned no row.");
      const event = toCalendarEvent(row);
      await insertCalendarReminderJobs(client, ownerId, event);
      const completed = await client.query(
        `UPDATE calendar_event_create_requests
         SET state = 'complete', completed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND idempotency_key = $2 AND event_id = $3::uuid AND state = 'pending'
         RETURNING idempotency_key`,
        [ownerId, idempotencyKey, eventId],
      );
      if (!completed.rows[0]) throw new Error("Calendar create request result was not recorded.");
      return createResultFromEvent(event, false);
    }, true);
  }

  reconcileEventCreate(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<CalendarEventCreateReconciliation> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const existing = await client.query<CreateRequestRow>(
        `SELECT encode(request_hash, 'hex') AS request_hash, event_id, state
         FROM calendar_event_create_requests
         WHERE user_id = $1 AND idempotency_key = $2`,
        [ownerId, idempotencyKey],
      );
      const existingRow = existing.rows[0];
      if (existingRow) {
        if (existingRow.state === "complete") {
          const result = await client.query<EventRow>(
            `SELECT ${eventColumns}
             FROM calendar_events
             WHERE user_id = $1 AND id = $2::uuid`,
            [ownerId, existingRow.event_id],
          );
          const row = result.rows[0];
          if (!row) {
            await client.query(
              `UPDATE calendar_event_create_requests
               SET state = 'deleted', request_hash = NULL, event_id = NULL, completed_at = CURRENT_TIMESTAMP
               WHERE user_id = $1 AND idempotency_key = $2 AND state = 'complete'`,
              [ownerId, idempotencyKey],
            );
            return { status: "deleted" };
          }
          const event = toCalendarEvent(row);
          return {
            status: "found",
            result: createResultFromEvent(event, true),
          };
        }
        if (existingRow.state === "deleted") return { status: "deleted" };
        if (existingRow.state === "abandoned") return { status: "not-found" };
        throw new CalendarRouteError(
          503,
          "IDEMPOTENCY_RESULT_UNAVAILABLE",
          "The saved event result is temporarily unavailable. Retry reconciliation with the same key.",
        );
      }

      // Keep a missing operation key while holding the same owner write lock
      // used by createEvent. A delayed POST can then never execute after this
      // reconciliation reports that no create was committed.
      const reservation = await client.query<{ idempotency_key: string } & QueryResultRow>(
        `INSERT INTO calendar_event_create_requests (
           user_id, idempotency_key, state, completed_at
         ) VALUES ($1, $2, 'abandoned', CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [ownerId, idempotencyKey],
      );
      if (!reservation.rows[0]) {
        throw new CalendarRouteError(
          503,
          "IDEMPOTENCY_RESERVATION_UNAVAILABLE",
          "The request key could not be reserved safely. Retry reconciliation with the same key.",
        );
      }
      return { status: "not-found" };
    }, true);
  }

  private async insertTimed(
    client: PoolClient,
    ownerId: string,
    id: string,
    mutation: Extract<CalendarEventMutation, { kind: "timed" }>,
  ) {
    const start = resolveLocalDateTime(
      mutation.startLocal,
      mutation.timeZone,
      mutation.startDisambiguation,
    );
    const end = resolveLocalDateTime(
      mutation.endLocal,
      mutation.timeZone,
      mutation.endDisambiguation,
    );
    resolveTimedDuration(start.instant, end.instant);
    return client.query<EventRow>(
      `INSERT INTO calendar_events (
         id, user_id, kind, title, details, start_local, end_local,
         time_zone, starts_at, ends_at, reminder_choice, reminder_time_zone,
         revision
       ) VALUES (
         $1, $2, 'timed', $3, $4, $5::timestamp, $6::timestamp,
         $7, $8::timestamptz, $9::timestamptz, $10, NULL, 1
       )
       RETURNING ${eventColumns}`,
      [
        id,
        ownerId,
        mutation.title,
        mutation.details ?? null,
        start.local,
        end.local,
        start.timeZone,
        start.instant,
        end.instant,
        mutation.reminderChoice ?? "none",
      ],
    );
  }

  updateEvent(
    ownerId: string,
    eventId: string,
    expectedRevision: number,
    mutation: CalendarEventMutation,
    calendarTimeZone: string,
    reviewedConflicts: readonly CalendarConflictReview[],
  ): Promise<CalendarEvent> {
    const bounds = conflictBounds(mutation, calendarTimeZone);
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      await assertSingleEventScope(client, ownerId, eventId);
      await assertCalendarTimeZoneCurrent(client, ownerId, bounds.calendarTimeZone);
      assertConflictReview(
        await conflictsInTransaction(client, ownerId, bounds, eventId),
        reviewedConflicts,
      );
      const result = mutation.kind === "timed"
        ? await this.updateTimed(client, ownerId, eventId, expectedRevision, mutation)
        : await client.query<EventRow>(
          `UPDATE calendar_events
           SET kind = 'all-day',
               title = $4,
               details = $5,
               start_local = NULL,
               end_local = NULL,
               time_zone = NULL,
               starts_at = NULL,
               ends_at = NULL,
               start_date = $6::date,
               end_date = $7::date,
               reminder_choice = $8,
               reminder_time_zone = $9,
               revision = revision + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND id = $2::uuid AND revision = $3
           RETURNING ${eventColumns}`,
          [
            ownerId,
            eventId,
            expectedRevision,
            mutation.title,
            mutation.details ?? null,
            mutation.startDate,
            mutation.endDate,
            mutation.reminderChoice ?? "none",
            mutation.reminderChoice === undefined || mutation.reminderChoice === "none"
              ? null
              : mutation.reminderTimeZone,
          ],
        );

      if (result.rows[0]) {
        const event = toCalendarEvent(result.rows[0]);
        await replaceCalendarReminderJobs(client, ownerId, event);
        return event;
      }
      const current = await client.query<{ revision: number } & QueryResultRow>(
        "SELECT revision FROM calendar_events WHERE user_id = $1 AND id = $2::uuid",
        [ownerId, eventId],
      );
      throwMissingOrStale(current.rows[0]?.revision);
    }, true);
  }

  private async updateTimed(
    client: PoolClient,
    ownerId: string,
    eventId: string,
    expectedRevision: number,
    mutation: Extract<CalendarEventMutation, { kind: "timed" }>,
  ) {
    const start = resolveLocalDateTime(
      mutation.startLocal,
      mutation.timeZone,
      mutation.startDisambiguation,
    );
    const end = resolveLocalDateTime(
      mutation.endLocal,
      mutation.timeZone,
      mutation.endDisambiguation,
    );
    resolveTimedDuration(start.instant, end.instant);
    return client.query<EventRow>(
      `UPDATE calendar_events
       SET kind = 'timed',
           title = $4,
           details = $5,
           start_local = $6::timestamp,
           end_local = $7::timestamp,
           time_zone = $8,
           starts_at = $9::timestamptz,
           ends_at = $10::timestamptz,
           start_date = NULL,
           end_date = NULL,
           reminder_choice = $11,
           reminder_time_zone = NULL,
           revision = revision + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND id = $2::uuid AND revision = $3
       RETURNING ${eventColumns}`,
      [
        ownerId,
        eventId,
        expectedRevision,
        mutation.title,
        mutation.details ?? null,
        start.local,
        end.local,
        start.timeZone,
        start.instant,
        end.instant,
        mutation.reminderChoice ?? "none",
      ],
    );
  }

  deleteEvent(ownerId: string, eventId: string, expectedRevision: number): Promise<void> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      await assertSingleEventScope(client, ownerId, eventId);
      const result = await client.query(
        `DELETE FROM calendar_events
         WHERE user_id = $1 AND id = $2::uuid AND revision = $3
         RETURNING id`,
        [ownerId, eventId, expectedRevision],
      );
      if (result.rows.length > 0) {
        await client.query(
          `UPDATE calendar_event_create_requests
           SET state = 'deleted', request_hash = NULL, event_id = NULL, completed_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND event_id = $2::uuid AND state = 'complete'`,
          [ownerId, eventId],
        );
        return;
      }

      const current = await client.query<{ revision: number } & QueryResultRow>(
        "SELECT revision FROM calendar_events WHERE user_id = $1 AND id = $2::uuid",
        [ownerId, eventId],
      );
      throwMissingOrStale(current.rows[0]?.revision);
    }, true);
  }

  createSeriesDraft(
    ownerId: string,
    request: CalendarSeriesDraftRequest,
    idempotencyKey: string,
  ): Promise<CalendarSeriesDraftResult> {
    const payloadHash = seriesRequestHash(request);
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const existingResult = await client.query<SeriesDraftRow>(
        `SELECT ${seriesDraftColumns}
         FROM calendar_event_series_proposal_drafts
         WHERE user_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [ownerId, idempotencyKey],
      );
      const existing = existingResult.rows[0];
      if (existing) {
        if (existing.payload_hash !== null
          && existing.payload_hash.toLowerCase() !== payloadHash.toString("hex")) {
          throw new CalendarRouteError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "This recurring-series request key was already used for a different proposal.",
          );
        }
        return seriesDraftResult(existing, true);
      }

      let target: CalendarEvent | null = null;
      if (request.action !== "create") {
        target = await loadSeriesTarget(
          client,
          ownerId,
          request.targetEventId,
          request.targetRevision,
        );
      }

      if (request.action === "create" || request.action === "update"
        || request.action === "split-series" || request.action === "restore-occurrence"
        || request.action === "move-occurrence") {
        await requireCalendarTimeZone(client, ownerId, request.calendarTimeZone);
      }

      const draftId = randomUUID();
      const eventId = request.action === "create" || request.action === "split-series"
        ? randomUUID()
        : target?.id ?? randomUUID();
      const candidates = request.action === "delete" || request.action === "cancel-occurrence"
        ? emptySeriesCandidates
        : await loadSeriesCandidates(
            client,
            ownerId,
            request.action === "restore-occurrence" || request.action === "move-occurrence"
              ? undefined
              : target?.id,
          );
      const targetCancelled = target
        ? await loadCancelledOccurrenceKeys(client, ownerId, [target.id])
        : new Map<string, ReadonlySet<string>>();
      const targetMovements = target
        ? await loadOccurrenceMovements(client, ownerId, [target.id])
        : new Map<string, ReadonlyMap<string, CalendarOccurrenceMovement>>();
      const snapshot = buildSeriesProposalSnapshot(
        request,
        eventId,
        target,
        candidates,
        new Date().toISOString(),
        target ? targetCancelled.get(target.id) ?? new Set() : new Set(),
        target ? targetMovements.get(target.id) ?? new Map() : new Map(),
      );
      const inserted = await client.query<SeriesDraftRow>(
        `INSERT INTO calendar_event_series_proposal_drafts (
           id, user_id, idempotency_key, action, scope,
           target_event_id, target_revision, normalized_payload,
           payload_hash, conflict_snapshot, outcome, expires_at
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6::uuid, $7,
           $8::jsonb, $9, $10::jsonb, 'pending',
           clock_timestamp() + interval '15 minutes'
         )
         RETURNING ${seriesDraftColumns}`,
        [
          draftId,
          ownerId,
          idempotencyKey,
          request.action,
          request.scope,
          target?.id ?? null,
          target?.revision ?? null,
          JSON.stringify(request),
          payloadHash,
          JSON.stringify(snapshot),
        ],
      );
      if (!inserted.rows[0]) throw new Error("The recurring proposal was not persisted.");
      return seriesDraftResult(inserted.rows[0], false);
    }, true, seriesProposalTransactionLimits);
  }

  approveSeriesDraft(
    ownerId: string,
    draftId: string,
  ): Promise<CalendarSeriesApprovalResult> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const draftResult = await client.query<SeriesDraftRow>(
        `SELECT ${seriesDraftColumns}
         FROM calendar_event_series_proposal_drafts
         WHERE user_id = $1 AND id = $2::uuid
         FOR UPDATE`,
        [ownerId, draftId],
      );
      const draft = draftResult.rows[0];
      if (!draft) {
        throw new CalendarRouteError(
          404,
          "SERIES_DRAFT_NOT_FOUND",
          "That recurring series draft could not be found.",
        );
      }

      if (draft.outcome !== "pending") {
        if (draft.outcome === "approved" && draft.result_event_id !== null) {
          const eventResult = await client.query<EventRow>(
            `SELECT ${eventColumns}
             FROM calendar_events
             WHERE user_id = $1 AND id = $2::uuid`,
            [ownerId, draft.result_event_id],
          );
          if (eventResult.rows[0]) {
            return calendarSeriesApproval(draft, toCalendarEvent(eventResult.rows[0]));
          }
          await markApprovedSeriesDraftsDeleted(client, ownerId, draft.result_event_id);
          return calendarSeriesApproval({ ...draft, outcome: "deleted" });
        }
        return calendarSeriesApproval(draft);
      }

      const startTime = await client.query<{ now: Date | string } & QueryResultRow>(
        "SELECT clock_timestamp() AS now",
      );
      if (seriesProposalExpired(draft.expires_at, startTime.rows[0]?.now ?? new Date())) {
        const expired = await transitionPendingSeriesDraft(client, ownerId, draftId, "expired");
        return calendarSeriesApproval(expired);
      }

      let request: CalendarSeriesDraftRequest;
      let savedSnapshot: SeriesProposalSnapshot;
      try {
        request = parseCalendarSeriesDraftRequest(draft.normalized_payload);
        savedSnapshot = readSeriesSnapshot(draft.conflict_snapshot);
      } catch {
        const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
        return calendarSeriesApproval(stale);
      }

      if (draft.payload_hash === null
        || draft.payload_hash.toLowerCase() !== seriesRequestHash(request).toString("hex")
        || request.action !== draft.action
        || request.scope !== draft.scope
        || (request.action === "create"
          ? draft.target_event_id !== null || draft.target_revision !== null
          : request.targetEventId !== draft.target_event_id
            || request.targetRevision !== draft.target_revision)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(savedSnapshot.eventId)) {
        const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
        return calendarSeriesApproval(stale);
      }

      let target: CalendarEvent | null = null;
      if (request.action !== "create") {
        const targetResult = await client.query<EventRow>(
          `SELECT ${eventColumns}
           FROM calendar_events
           WHERE user_id = $1 AND id = $2::uuid
           FOR UPDATE`,
          [ownerId, request.targetEventId],
        );
        const targetRow = targetResult.rows[0];
        if (targetRow) target = toCalendarEvent(targetRow);
        if (!target
          || target.revision !== request.targetRevision
          || target.revision !== draft.target_revision
          || !target.recurrenceRule
          || (request.action === "split-series"
            ? target.id === savedSnapshot.eventId
            : target.id !== savedSnapshot.eventId)
          || stableJson(snapshotTarget(target, request.action === "split-series"))
            !== stableJson(savedSnapshot.target)) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
      } else if (savedSnapshot.target !== null || savedSnapshot.calendarTimeZone === null) {
        const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
        return calendarSeriesApproval(stale);
      }

      let recomputed: SeriesProposalSnapshot;
      try {
        if (request.action === "create" || request.action === "update"
          || request.action === "split-series"
          || request.action === "restore-occurrence" || request.action === "move-occurrence") {
          await requireCalendarTimeZone(client, ownerId, request.calendarTimeZone);
        }
        const candidates = request.action === "delete" || request.action === "cancel-occurrence"
          ? emptySeriesCandidates
          : await loadSeriesCandidates(
              client,
              ownerId,
              request.action === "restore-occurrence" || request.action === "move-occurrence"
                ? undefined
                : target?.id,
            );
        const targetCancelled = target
          ? await loadCancelledOccurrenceKeys(client, ownerId, [target.id])
          : new Map<string, ReadonlySet<string>>();
        const targetMovements = target
          ? await loadOccurrenceMovements(client, ownerId, [target.id])
          : new Map<string, ReadonlyMap<string, CalendarOccurrenceMovement>>();
        recomputed = buildSeriesProposalSnapshot(
          request,
          savedSnapshot.eventId,
          target,
          candidates,
          new Date().toISOString(),
          target ? targetCancelled.get(target.id) ?? new Set() : new Set(),
          target ? targetMovements.get(target.id) ?? new Map() : new Map(),
        );
      } catch (error) {
        if (error instanceof CalendarRouteError && error.status === 422) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        if (error instanceof CalendarRouteError
          && (error.code === "CALENDAR_TIME_ZONE_CHANGED"
            || error.code === "CALENDAR_TIME_ZONE_UNCONFIGURED"
            || error.code === "OCCURRENCE_ALREADY_CANCELLED"
            || error.code === "OCCURRENCE_NOT_CANCELLED"
            || error.code === "OCCURRENCE_NOT_IN_SERIES"
            || error.code === "OCCURRENCE_MOVE_UNVERIFIABLE"
            || error.code === "SERIES_MOVEMENT_NOT_PRESERVED"
            || error.code === "SERIES_CANCELLATION_NOT_PRESERVED"
            || error.code === "SERIES_LINEAGE_UNAVAILABLE"
            || error.code === "SERIES_SPLIT_HAS_NO_PREFIX"
            || error.code === "SERIES_SPLIT_COUNT_MISMATCH"
            || error.code === "SERIES_SPLIT_MOVEMENT_NOT_PRESERVED"
            || error.code === "SERIES_SPLIT_UNVERIFIABLE")) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        throw error;
      }

      if (stableJson(recomputed) !== stableJson(savedSnapshot)) {
        const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
        return calendarSeriesApproval(stale);
      }

      const approvalTimeResult = await client.query<{ now: Date | string } & QueryResultRow>(
        "SELECT clock_timestamp() AS now",
      );
      const approvalTime = approvalTimeResult.rows[0]?.now ?? new Date();
      if (seriesProposalExpired(draft.expires_at, approvalTime)) {
        const expired = await transitionPendingSeriesDraft(client, ownerId, draftId, "expired");
        return calendarSeriesApproval(expired);
      }

      let event: CalendarEvent | null = null;
      if (request.action === "create") {
        event = await insertSeriesEvent(
          client,
          ownerId,
          savedSnapshot.eventId,
          request.event,
          request.recurrenceRule,
        );
        await insertCalendarReminderJobs(client, ownerId, event);
      } else if (request.action === "update") {
        event = await updateSeriesEvent(
          client,
          ownerId,
          request.targetEventId,
          request.targetRevision,
          request.event,
          request.recurrenceRule,
        );
        if (!event) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        await replaceCalendarReminderJobs(client, ownerId, event);
        await staleOtherSeriesDraftsForTarget(client, ownerId, event.id, draftId);
      } else if (request.action === "cancel-occurrence") {
        const inserted = await client.query(
          `INSERT INTO calendar_event_occurrence_exceptions (
             user_id, event_id, occurrence_key, is_cancelled, cancelled_at
           ) VALUES ($1, $2::uuid, $3, TRUE, clock_timestamp())
           ON CONFLICT (user_id, event_id, occurrence_key) DO UPDATE
             SET is_cancelled = TRUE,
                 cancelled_at = clock_timestamp(),
                 updated_at = clock_timestamp()
             WHERE NOT calendar_event_occurrence_exceptions.is_cancelled
           RETURNING occurrence_key`,
          [ownerId, request.targetEventId, request.occurrenceKey],
        );
        if (!inserted.rows[0]) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        await client.query(
          `UPDATE calendar_event_reminders
           SET status = 'cancelled',
               lease_token = NULL,
               lease_expires_at = NULL,
               updated_at = clock_timestamp()
           WHERE user_id = $1
             AND event_id = $2::uuid
             AND occurrence_key = $3
             AND status IN ('pending', 'leased')`,
          [ownerId, request.targetEventId, request.occurrenceKey],
        );
        await staleOtherSeriesDraftsForTarget(
          client,
          ownerId,
          request.targetEventId,
          draftId,
        );
      } else if (request.action === "restore-occurrence") {
        if (!target) throw new Error("A restored occurrence lost its recurring series target.");
        const savedMovements = await loadOccurrenceMovements(client, ownerId, [target.id]);
        const baseOccurrence = target.recurrenceRule
          ? expandFullCalendarSeries(target, target.recurrenceRule).find(({ occurrenceKey }) =>
              occurrenceKey === request.occurrenceKey
            )
          : undefined;
        if (!baseOccurrence) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        const restoredOccurrence = applySavedOccurrenceMovement(
          baseOccurrence,
          savedMovements.get(target.id) ?? new Map(),
        );
        const updated = await client.query(
          `UPDATE calendar_event_occurrence_exceptions
           SET is_cancelled = FALSE,
               cancelled_at = NULL,
               updated_at = clock_timestamp()
           WHERE user_id = $1 AND event_id = $2::uuid AND occurrence_key = $3
             AND is_cancelled
             AND (moved_start_local IS NOT NULL OR moved_start_date IS NOT NULL)
           RETURNING occurrence_key`,
          [ownerId, request.targetEventId, request.occurrenceKey],
        );
        const deleted = updated.rows[0] ? updated : await client.query(
          `DELETE FROM calendar_event_occurrence_exceptions
           WHERE user_id = $1 AND event_id = $2::uuid AND occurrence_key = $3
             AND is_cancelled
             AND moved_start_local IS NULL AND moved_start_date IS NULL
           RETURNING occurrence_key`,
          [ownerId, request.targetEventId, request.occurrenceKey],
        );
        if (!deleted.rows[0]) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        await restoreCalendarOccurrenceReminder(
          client,
          ownerId,
          target,
          request.occurrenceKey,
          restoredOccurrence,
        );
        await staleOtherSeriesDraftsForTarget(
          client,
          ownerId,
          request.targetEventId,
          draftId,
        );
      } else if (request.action === "move-occurrence") {
        if (!target?.recurrenceRule) throw new Error("A moved occurrence lost its recurring series target.");
        const currentOccurrence = expandFullCalendarSeries(target, target.recurrenceRule)
          .find(({ occurrenceKey }) => occurrenceKey === request.occurrenceKey);
        if (!currentOccurrence) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        const savedMovements = await loadOccurrenceMovements(client, ownerId, [target.id]);
        const effectiveOccurrence = applySavedOccurrenceMovement(
          currentOccurrence,
          savedMovements.get(target.id) ?? new Map(),
        );
        const movement = resolveOccurrenceMovement(effectiveOccurrence, request.movement);
        const movedOccurrence = applyCalendarOccurrenceMovement(effectiveOccurrence, movement);
        const saved = movement.kind === "timed"
          ? await client.query(
              `INSERT INTO calendar_event_occurrence_exceptions (
                 user_id, event_id, occurrence_key, is_cancelled, cancelled_at,
                 moved_start_local, moved_end_local, moved_time_zone,
                 moved_starts_at, moved_ends_at
               ) VALUES (
                 $1, $2::uuid, $3, FALSE, NULL,
                 $4::timestamp, $5::timestamp, $6, $7::timestamptz, $8::timestamptz
               )
               ON CONFLICT (user_id, event_id, occurrence_key) DO UPDATE
                 SET is_cancelled = FALSE,
                     cancelled_at = NULL,
                     moved_start_local = EXCLUDED.moved_start_local,
                     moved_end_local = EXCLUDED.moved_end_local,
                     moved_time_zone = EXCLUDED.moved_time_zone,
                     moved_starts_at = EXCLUDED.moved_starts_at,
                     moved_ends_at = EXCLUDED.moved_ends_at,
                     moved_start_date = NULL,
                     moved_end_date = NULL,
                     updated_at = clock_timestamp()
               RETURNING occurrence_key`,
              [ownerId, target.id, request.occurrenceKey, movement.startLocal, movement.endLocal,
                movement.timeZone, movement.startsAt, movement.endsAt],
            )
          : await client.query(
              `INSERT INTO calendar_event_occurrence_exceptions (
                 user_id, event_id, occurrence_key, is_cancelled, cancelled_at,
                 moved_start_date, moved_end_date
               ) VALUES ($1, $2::uuid, $3, FALSE, NULL, $4::date, $5::date)
               ON CONFLICT (user_id, event_id, occurrence_key) DO UPDATE
                 SET is_cancelled = FALSE,
                     cancelled_at = NULL,
                     moved_start_local = NULL,
                     moved_end_local = NULL,
                     moved_time_zone = NULL,
                     moved_starts_at = NULL,
                     moved_ends_at = NULL,
                     moved_start_date = EXCLUDED.moved_start_date,
                     moved_end_date = EXCLUDED.moved_end_date,
                     updated_at = clock_timestamp()
               RETURNING occurrence_key`,
              [ownerId, target.id, request.occurrenceKey, movement.startDate, movement.endDate],
            );
        if (!saved.rows[0]) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        await moveCalendarOccurrenceReminder(client, ownerId, target, movedOccurrence);
        await staleOtherSeriesDraftsForTarget(client, ownerId, target.id, draftId);
      } else if (request.action === "split-series") {
        if (!target) throw new Error("A split recurring series lost its target.");
        const targetCancelled = await loadCancelledOccurrenceKeys(client, ownerId, [target.id]);
        const targetMovements = await loadOccurrenceMovements(client, ownerId, [target.id]);
        const plan = planCalendarSeriesSplit(
          target,
          request,
          savedSnapshot.eventId,
          new Date().toISOString(),
          targetCancelled.get(target.id) ?? new Set(),
          targetMovements.get(target.id) ?? new Map(),
        );
        const prefix = await truncateCalendarSeriesSegment(
          client,
          ownerId,
          target.id,
          target.revision,
          plan.splitIndex,
        );
        if (!prefix) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        event = await insertSeriesEvent(
          client,
          ownerId,
          savedSnapshot.eventId,
          request.event,
          request.recurrenceRule,
          target.seriesRootId,
        );
        await transferSplitOccurrenceExceptions(
          client,
          ownerId,
          target.id,
          event.id,
          plan,
        );
        const blockedReminderKeys = await reconcileSplitSeriesReminders(
          client,
          ownerId,
          target,
          prefix.revision,
          plan,
          targetCancelled.get(target.id) ?? new Set(),
        );
        await insertCalendarReminderJobs(
          client,
          ownerId,
          event,
          plan.cancelledOccurrenceKeys,
          plan.occurrenceMovements,
          blockedReminderKeys,
        );
        await staleOtherSeriesDraftsForTarget(client, ownerId, target.id, draftId);
      } else {
        const deleted = await client.query(
          `DELETE FROM calendar_events
           WHERE user_id = $1 AND id = $2::uuid AND revision = $3
           RETURNING id`,
          [ownerId, request.targetEventId, request.targetRevision],
        );
        if (!deleted.rows[0]) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        await staleOtherSeriesDraftsForTarget(client, ownerId, request.targetEventId, draftId);
        await client.query(
          `UPDATE calendar_event_create_requests
           SET state = 'deleted',
               request_hash = NULL,
               event_id = NULL,
               completed_at = clock_timestamp()
           WHERE user_id = $1 AND event_id = $2::uuid AND state = 'complete'`,
          [ownerId, request.targetEventId],
        );
        await markApprovedSeriesDraftsDeleted(client, ownerId, request.targetEventId);
      }

      const resolvedAt = asIsoTimestamp(approvalTime);
      const completed = request.action === "delete"
        ? await client.query<SeriesDraftRow>(
            `UPDATE calendar_event_series_proposal_drafts
             SET outcome = 'approved',
                 normalized_payload = NULL,
                 payload_hash = NULL,
                 conflict_snapshot = NULL,
                 target_event_id = NULL,
                 target_revision = NULL,
                 result_event_id = NULL,
                 resolved_at = $3::timestamptz,
                 updated_at = $3::timestamptz
             WHERE user_id = $1 AND id = $2::uuid AND outcome = 'pending'
             RETURNING ${seriesDraftColumns}`,
            [ownerId, draftId, resolvedAt],
          )
        : request.action === "cancel-occurrence" || request.action === "restore-occurrence"
            || request.action === "move-occurrence"
          ? await client.query<SeriesDraftRow>(
              `UPDATE calendar_event_series_proposal_drafts
               SET outcome = 'approved',
                   normalized_payload = NULL,
                   conflict_snapshot = NULL,
                   target_event_id = NULL,
                   target_revision = NULL,
                   result_event_id = NULL,
                   resolved_at = $3::timestamptz,
                   updated_at = $3::timestamptz
               WHERE user_id = $1 AND id = $2::uuid AND outcome = 'pending'
               RETURNING ${seriesDraftColumns}`,
              [ownerId, draftId, resolvedAt],
            )
        : await client.query<SeriesDraftRow>(
            `UPDATE calendar_event_series_proposal_drafts
             SET outcome = 'approved',
                 normalized_payload = NULL,
                 conflict_snapshot = NULL,
                 result_event_id = $3::uuid,
                 resolved_at = $4::timestamptz,
                 updated_at = $4::timestamptz
             WHERE user_id = $1 AND id = $2::uuid AND outcome = 'pending'
             RETURNING ${seriesDraftColumns}`,
            [ownerId, draftId, event?.id, resolvedAt],
          );
      const completedRow = completed.rows[0];
      if (!completedRow) throw new Error("The approved recurring proposal was not recorded.");
      return calendarSeriesApproval(completedRow, event);
    }, true, seriesProposalTransactionLimits);
  }

  expirePendingSeriesDrafts(ownerId: string, limit = 100): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new RangeError("Series proposal expiry limit must be between 1 and 500.");
    }

    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const expired = await client.query(
        `WITH expired_rows AS (
           SELECT id, GREATEST(clock_timestamp(), expires_at) AS resolution_time
           FROM calendar_event_series_proposal_drafts
           WHERE user_id = $1
             AND outcome = 'pending'
             AND expires_at <= clock_timestamp()
           ORDER BY expires_at, id
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         UPDATE calendar_event_series_proposal_drafts AS proposal
         SET outcome = 'expired',
             normalized_payload = NULL,
             payload_hash = NULL,
             conflict_snapshot = NULL,
             target_event_id = NULL,
             target_revision = NULL,
             result_event_id = NULL,
             resolved_at = expired_rows.resolution_time,
             updated_at = expired_rows.resolution_time
         FROM expired_rows
         WHERE proposal.user_id = $1
           AND proposal.id = expired_rows.id
           AND proposal.outcome = 'pending'
         RETURNING proposal.id`,
        [ownerId, limit],
      );
      return expired.rowCount ?? expired.rows.length;
    }, true, {
      lockTimeout: "500ms",
      statementTimeout: "2500ms",
      idleTransactionTimeout: "5000ms",
    });
  }

  async getPreferences(ownerId: string): Promise<CalendarPreferences | null> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query<PreferencesRow>(
        `SELECT theme, accent_color, density, week_starts_on, time_zone
         FROM calendar_preferences
         WHERE user_id = $1`,
        [ownerId],
      );
      const row = result.rows[0];
      return row ? preferencesFromRow(row) : null;
    });
  }

  async setPreferences(
    ownerId: string,
    preferences: CalendarPreferences,
  ): Promise<CalendarPreferences> {
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query<PreferencesRow>(
        `INSERT INTO calendar_preferences (
         user_id, theme, accent_color, density, week_starts_on, time_zone
       ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
           theme = EXCLUDED.theme,
           accent_color = EXCLUDED.accent_color,
           density = EXCLUDED.density,
           week_starts_on = EXCLUDED.week_starts_on,
           time_zone = EXCLUDED.time_zone,
           updated_at = CURRENT_TIMESTAMP
         RETURNING theme, accent_color, density, week_starts_on, time_zone`,
        [ownerId, preferences.theme, preferences.accentColor, preferences.density, preferences.weekStartsOn, preferences.timeZone],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Calendar preferences update returned no row.");
      return preferencesFromRow(row);
    }, true);
  }
}
