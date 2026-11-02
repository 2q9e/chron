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
  CalendarEventMutation,
  CalendarEventSearchRequest,
  CalendarPreferences,
} from "../domain/types.ts";
import { CalendarRouteError, calendarSearchTimeoutError } from "./errors.ts";

const maximumEventsPerRange = 1000;
const maximumEventsPerSearch = 1000;
const calendarSearchStatementTimeout = "2000ms";
const maximumConflictResults = 32;

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
  created_at,
  updated_at
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

function toCalendarEvent(row: EventRow): CalendarEvent {
  const base = {
    id: row.id,
    title: row.title,
    details: row.details,
    revision: row.revision,
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
         (kind = 'timed' AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz)
         OR
         (kind = 'all-day' AND start_date < $6::date AND end_date > $5::date)
       )
     ORDER BY
       CASE WHEN kind = 'all-day'
         THEN start_date::timestamp without time zone AT TIME ZONE $7::text
         ELSE starts_at
       END,
       id
     LIMIT $8`,
    [
      ownerId,
      excludeEventId ?? null,
      bounds.startsAt,
      bounds.endsAt,
      bounds.fromDate,
      bounds.toDate,
      bounds.calendarTimeZone,
      maximumConflictResults + 1,
    ],
  );

  if (result.rows.length > maximumConflictResults) {
    throw new CalendarRouteError(
      422,
      "CONFLICT_RESULT_LIMIT",
      "Chron could not verify every overlap. Shorten the event range and review it again.",
    );
  }

  return result.rows.map((row) => {
    const event = toCalendarEvent(row);
    const base = { id: event.id, revision: event.revision, title: event.title };
    return event.kind === "timed"
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
        };
  });
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
  ): Promise<CalendarEvent[]> {
    const range = resolveCalendarRange(from, to, timeZone);
    return withOwnerTransaction(this.pool, ownerId, async (client) => {
      const result = await client.query<EventRow>(
        `SELECT ${eventColumns}
         FROM calendar_events
         WHERE user_id = $1
           AND (
             (kind = 'all-day' AND start_date < $3::date AND end_date > $2::date)
             OR
             (kind = 'timed' AND starts_at < $5::timestamptz AND ends_at > $4::timestamptz)
           )
         ORDER BY
           CASE WHEN kind = 'all-day'
             THEN start_date::timestamp without time zone AT TIME ZONE $7::text
             ELSE starts_at
           END,
           id
         LIMIT $6`,
        [
          ownerId,
          range.fromDate,
          range.toDate,
          range.startsAt,
          range.endsAt,
          maximumEventsPerRange + 1,
          timeZone,
        ],
      );

      if (result.rows.length > maximumEventsPerRange) {
        throw new CalendarRouteError(
          422,
          "RANGE_RESULT_LIMIT",
          "Narrow the date range to see these events.",
        );
      }
      return result.rows.map(toCalendarEvent);
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
