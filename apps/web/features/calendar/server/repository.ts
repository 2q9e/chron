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
  CalendarRecurrenceRule,
} from "../domain/types.ts";
import {
  normalizeRecurrenceRule,
  RecurrenceError,
  type CalendarRecurrenceOccurrence,
} from "../domain/recurrence.ts";
import { expandCalendarRecurrenceRange } from "../domain/recurrence-range.ts";
import {
  expandFullCalendarSeries,
  findCalendarSeriesConflicts,
  occurrenceOverlapsCalendarInterval,
  type CalendarSeriesOccurrenceConflict,
} from "./series-conflicts.ts";
import type { CalendarSeriesDraftRequest } from "./validation.ts";
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
  created_at: Date | string;
  updated_at: Date | string;
};

type PreferencesRow = QueryResultRow & {
  theme: CalendarPreferences["theme"];
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
  action: "create" | "update" | "delete";
  scope: "series";
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
  }> | null;
  beforeOccurrences: readonly SeriesOccurrenceSnapshot[];
  afterOccurrences: readonly SeriesOccurrenceSnapshot[];
  conflicts: readonly CalendarSeriesOccurrenceConflict[];
}>;

export type CalendarSeriesDraftResult = Readonly<{
  id: string;
  action: "create" | "update" | "delete";
  scope: "series";
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
    title: row.title,
    details: row.details,
    revision: row.revision,
    ...(recurrenceRule ? { recurrenceRule } : {}),
    createdAt: asIsoTimestamp(row.created_at),
    updatedAt: asIsoTimestamp(row.updated_at),
  };

  if (row.kind === "timed") {
    if (!row.start_local || !row.end_local || !row.time_zone) {
      throw new Error("Timed calendar event is missing local-time data.");
    }
    return {
      ...base,
      kind: "timed",
      startLocal: row.start_local,
      endLocal: row.end_local,
      timeZone: row.time_zone,
      startsAt: asIsoInstant(row.starts_at),
      endsAt: asIsoInstant(row.ends_at),
    };
  }

  if (row.kind === "all-day") {
    if (!row.start_date || !row.end_date) {
      throw new Error("All-day calendar event is missing date bounds.");
    }
    return {
      ...base,
      kind: "all-day",
      startDate: row.start_date,
      endDate: row.end_date,
    };
  }

  throw new Error("Calendar event has an unsupported stored type.");
}

function preferencesFromRow(row: PreferencesRow): CalendarPreferences {
  return {
    theme: row.theme,
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

  const conflicts: CalendarConflict[] = [];
  for (const row of result.rows) {
    const event = toCalendarEvent(row);
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
      const occurrences = expandCalendarRecurrenceRange(
        event,
        event.recurrenceRule,
        {
          fromDate: bounds.fromDate,
          toDate: bounds.toDate,
          timeZone: bounds.calendarTimeZone,
        },
      ).filter((occurrence) => occurrenceOverlapsCalendarInterval(
        occurrence,
        { startsAt: bounds.startsAt, endsAt: bounds.endsAt },
        bounds.calendarTimeZone,
      ));
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
    scope: "series",
    ...(request.action === "update"
      ? {
          targetEventId: request.targetEventId.toLowerCase(),
          targetRevision: request.targetRevision,
        }
      : {}),
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
): CalendarEvent {
  const rule = normalizeRecurrenceRule(recurrenceRule);
  const base = {
    id,
    title: mutation.title,
    details: mutation.details ?? null,
    revision,
    recurrenceRule: rule,
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
    startDate: bounds.startDate,
    endDate: bounds.endDate,
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

function snapshotTarget(target: CalendarEvent): SeriesProposalSnapshot["target"] {
  if (!target.recurrenceRule) return null;
  return {
    revision: target.revision,
    title: target.title,
    details: target.details,
    kind: target.kind,
    recurrenceRule: target.recurrenceRule,
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
      || (parsed.target.kind !== "timed" && parsed.target.kind !== "all-day")) {
      throw new Error("The saved recurring proposal target is invalid.");
    }
    target = {
      revision: parsed.target.revision as number,
      title: parsed.target.title,
      details: parsed.target.details,
      kind: parsed.target.kind,
      recurrenceRule: normalizeRecurrenceRule(parsed.target.recurrenceRule),
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
): Promise<CalendarEvent[]> {
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
  return result.rows.map(toCalendarEvent);
}

function buildSeriesProposalSnapshot(
  request: CalendarSeriesDraftRequest,
  eventId: string,
  target: CalendarEvent | null,
  existingEvents: readonly CalendarEvent[],
  now: string,
): SeriesProposalSnapshot {
  const beforeOccurrences = target?.recurrenceRule
    ? expandFullCalendarSeries(target, target.recurrenceRule).map(occurrenceSnapshot)
    : [];
  const targetSnapshot = target ? snapshotTarget(target) : null;

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
      existingEvents,
      request.calendarTimeZone,
      target?.id,
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

  return {
    version: 1,
    eventId,
    calendarTimeZone: request.calendarTimeZone,
    target: targetSnapshot,
    beforeOccurrences,
    afterOccurrences: comparison.occurrences.map(occurrenceSnapshot),
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
    event: request && request.action !== "delete" ? request.event : null,
    recurrenceRule: request && request.action !== "delete" ? request.recurrenceRule : null,
    calendarTimeZone: request && request.action !== "delete"
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
       SELECT clock_timestamp() AS resolved_at
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
           WHEN $3 = 'expired' THEN GREATEST(resolution_clock.resolved_at, draft.expires_at)
           ELSE resolution_clock.resolved_at
         END,
         updated_at = CASE
           WHEN $3 = 'expired' THEN GREATEST(resolution_clock.resolved_at, draft.expires_at)
           ELSE resolution_clock.resolved_at
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
             recurrence_interval, recurrence_count, revision
           ) VALUES (
             $1, $2, 'timed', $3, $4, $5::timestamp, $6::timestamp,
             $7, $8::timestamptz, $9::timestamptz, $10, $11, $12, 1
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
          ],
        );
      })()
    : await client.query<EventRow>(
        `INSERT INTO calendar_events (
           id, user_id, kind, title, details, start_date, end_date,
           recurrence_frequency, recurrence_interval, recurrence_count, revision
         ) VALUES ($1, $2, 'all-day', $3, $4, $5::date, $6::date, $7, $8, $9, 1)
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
        ],
      );
  return result.rows[0] ? toCalendarEvent(result.rows[0]) : null;
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

      const events: CalendarEventEntry[] = [];
      try {
        for (const row of result.rows) {
          const event = toCalendarEvent(row);
          if (!event.recurrenceRule) {
            events.push(event);
          } else {
            const occurrences = expandCalendarRecurrenceRange(
              event,
              event.recurrenceRule,
              {
                fromDate: range.fromDate,
                toDate: range.toDate,
                timeZone,
              },
            );
            for (const occurrence of occurrences) {
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
             id, user_id, kind, title, details, start_date, end_date, revision
           ) VALUES ($1, $2, 'all-day', $3, $4, $5::date, $6::date, 1)
           RETURNING ${eventColumns}`,
          [eventId, ownerId, mutation.title, mutation.details ?? null, mutation.startDate, mutation.endDate],
        );
      const row = result.rows[0];
      if (!row) throw new Error("Calendar event insert returned no row.");
      const event = toCalendarEvent(row);
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
         time_zone, starts_at, ends_at, revision
       ) VALUES (
         $1, $2, 'timed', $3, $4, $5::timestamp, $6::timestamp,
         $7, $8::timestamptz, $9::timestamptz, 1
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
               revision = revision + 1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND id = $2::uuid AND revision = $3
           RETURNING ${eventColumns}`,
          [ownerId, eventId, expectedRevision, mutation.title, mutation.details ?? null, mutation.startDate, mutation.endDate],
        );

      if (result.rows[0]) return toCalendarEvent(result.rows[0]);
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

      if (request.action !== "delete") {
        await requireCalendarTimeZone(client, ownerId, request.calendarTimeZone);
      }

      const draftId = randomUUID();
      const eventId = target?.id ?? randomUUID();
      const candidates = request.action === "delete"
        ? []
        : await loadSeriesCandidates(client, ownerId, target?.id);
      const snapshot = buildSeriesProposalSnapshot(
        request,
        eventId,
        target,
        candidates,
        new Date().toISOString(),
      );
      const inserted = await client.query<SeriesDraftRow>(
        `INSERT INTO calendar_event_series_proposal_drafts (
           id, user_id, idempotency_key, action, scope,
           target_event_id, target_revision, normalized_payload,
           payload_hash, conflict_snapshot, outcome, expires_at
         ) VALUES (
           $1::uuid, $2, $3, $4, 'series', $5::uuid, $6,
           $7::jsonb, $8, $9::jsonb, 'pending',
           clock_timestamp() + interval '15 minutes'
         )
         RETURNING ${seriesDraftColumns}`,
        [
          draftId,
          ownerId,
          idempotencyKey,
          request.action,
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
          || target.id !== savedSnapshot.eventId
          || stableJson(snapshotTarget(target)) !== stableJson(savedSnapshot.target)) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
      } else if (savedSnapshot.target !== null || savedSnapshot.calendarTimeZone === null) {
        const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
        return calendarSeriesApproval(stale);
      }

      let recomputed: SeriesProposalSnapshot;
      try {
        if (request.action !== "delete") {
          await requireCalendarTimeZone(client, ownerId, request.calendarTimeZone);
        }
        const candidates = request.action === "delete"
          ? []
          : await loadSeriesCandidates(client, ownerId, target?.id);
        recomputed = buildSeriesProposalSnapshot(
          request,
          savedSnapshot.eventId,
          target,
          candidates,
          new Date().toISOString(),
        );
      } catch (error) {
        if (error instanceof CalendarRouteError && error.status === 422) {
          const stale = await transitionPendingSeriesDraft(client, ownerId, draftId, "stale");
          return calendarSeriesApproval(stale);
        }
        if (error instanceof CalendarRouteError
          && (error.code === "CALENDAR_TIME_ZONE_CHANGED"
            || error.code === "CALENDAR_TIME_ZONE_UNCONFIGURED")) {
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
        await staleOtherSeriesDraftsForTarget(client, ownerId, event.id, draftId);
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
        `SELECT theme, density, week_starts_on, time_zone
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
           user_id, theme, density, week_starts_on, time_zone
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           theme = EXCLUDED.theme,
           density = EXCLUDED.density,
           week_starts_on = EXCLUDED.week_starts_on,
           time_zone = EXCLUDED.time_zone,
           updated_at = CURRENT_TIMESTAMP
         RETURNING theme, density, week_starts_on, time_zone`,
        [ownerId, preferences.theme, preferences.density, preferences.weekStartsOn, preferences.timeZone],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Calendar preferences update returned no row.");
      return preferencesFromRow(row);
    }, true);
  }
}
