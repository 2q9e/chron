import { Temporal } from "@js-temporal/polyfill";
import { calendarThemes } from "../domain/types.ts";
import {
  allDayCalendarReminderChoices,
  timedCalendarReminderChoices,
  type AllDayCalendarReminderChoice,
  type TimedCalendarReminderChoice,
} from "../domain/reminders.ts";
import type {
  CalendarApiError,
  CalendarConflict,
  CalendarConflictReview,
  CalendarEvent,
  CalendarEventEntry,
  CalendarEventOccurrence,
  CalendarEventSearchRequest,
  CalendarEventMutation,
  CalendarRecurrenceRule,
  CalendarPreferences,
  CalendarReminderStatusSummary,
  CalendarSeriesApproval,
  CalendarSeriesDraft,
  CalendarSeriesDraftRequest,
  CalendarSeriesOccurrenceConflict,
  CalendarSeriesOccurrenceSnapshot,
} from "../domain/types.ts";

export type CalendarEventSearchFields = Readonly<{
  query: string;
  from: string;
  through: string;
  timeZone: string;
  kind: "" | CalendarEvent["kind"];
}>;

export type CalendarEventSearchValidation =
  | Readonly<{ ok: true; request: CalendarEventSearchRequest }>
  | Readonly<{
      ok: false;
      field: "query" | "from" | "through" | "form";
      message: string;
    }>;

export class CalendarRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "CalendarRequestError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index]
      && sameJsonValue(left[key], right[key]));
}

function isCalendarRecurrenceRule(value: unknown): value is CalendarRecurrenceRule {
  return isRecord(value)
    && (value.frequency === "daily" || value.frequency === "weekly")
    && typeof value.interval === "number"
    && Number.isInteger(value.interval)
    && value.interval >= 1
    && value.interval <= 4
    && typeof value.count === "number"
    && Number.isInteger(value.count)
    && value.count >= 2
    && value.count <= 366;
}

function isCalendarEventMutation(value: unknown): value is CalendarEventMutation {
  if (!isRecord(value)
    || !isNonEmptyString(value.title)
    || !(value.details === undefined || typeof value.details === "string")) return false;
  if (value.kind === "all-day") {
    const reminderChoice = value.reminderChoice;
    const reminderValid = reminderChoice === undefined
      || (typeof reminderChoice === "string"
        && allDayCalendarReminderChoices.includes(reminderChoice as AllDayCalendarReminderChoice));
    const hasReminder = reminderChoice !== undefined && reminderChoice !== "none";
    return isNonEmptyString(value.startDate)
      && isNonEmptyString(value.endDate)
      && reminderValid
      && (hasReminder
        ? isNonEmptyString(value.reminderTimeZone)
        : value.reminderTimeZone === undefined);
  }
  return value.kind === "timed"
    && isNonEmptyString(value.startLocal)
    && isNonEmptyString(value.endLocal)
    && isNonEmptyString(value.timeZone)
    && (value.reminderChoice === undefined
      || (typeof value.reminderChoice === "string"
        && timedCalendarReminderChoices.includes(value.reminderChoice as TimedCalendarReminderChoice)))
    && value.reminderTimeZone === undefined
    && (value.startDisambiguation === undefined
      || value.startDisambiguation === "earlier"
      || value.startDisambiguation === "later")
    && (value.endDisambiguation === undefined
      || value.endDisambiguation === "earlier"
      || value.endDisambiguation === "later");
}

function isCalendarSeriesOccurrenceSnapshot(
  value: unknown,
): value is CalendarSeriesOccurrenceSnapshot {
  if (!isRecord(value) || !isNonEmptyString(value.occurrenceKey)) return false;
  if (value.kind === "all-day") {
    return isNonEmptyString(value.startDate) && isNonEmptyString(value.endDate);
  }
  return value.kind === "timed"
    && isNonEmptyString(value.startLocal)
    && isNonEmptyString(value.endLocal)
    && isNonEmptyString(value.timeZone)
    && isNonEmptyString(value.startsAt)
    && isNonEmptyString(value.endsAt);
}

function isCalendarSeriesOccurrenceConflict(
  value: unknown,
): value is CalendarSeriesOccurrenceConflict {
  return isRecord(value)
    && isNonEmptyString(value.candidateOccurrenceKey)
    && isNonEmptyString(value.conflictingEventId)
    && typeof value.conflictingEventRevision === "number"
    && Number.isSafeInteger(value.conflictingEventRevision)
    && value.conflictingEventRevision > 0
    && typeof value.conflictingTitle === "string"
    && isCalendarSeriesOccurrenceSnapshot(value.conflictingOccurrence);
}

function isCalendarSeriesDraft(value: unknown): value is CalendarSeriesDraft {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || (value.action !== "create" && value.action !== "update" && value.action !== "delete"
      && value.action !== "cancel-occurrence" && value.action !== "restore-occurrence")
    || !(((value.action === "cancel-occurrence" || value.action === "restore-occurrence")
      && value.scope === "occurrence")
      || ((value.action !== "cancel-occurrence" && value.action !== "restore-occurrence")
        && value.scope === "series"))
    || !["pending", "approved", "stale", "expired", "deleted"].includes(String(value.outcome))
    || typeof value.replayed !== "boolean"
    || !(value.targetEventId === null || isNonEmptyString(value.targetEventId))
    || !(value.targetRevision === null
      || (typeof value.targetRevision === "number" && Number.isSafeInteger(value.targetRevision) && value.targetRevision > 0))
    || !(value.event === null || isCalendarEventMutation(value.event))
    || !(value.recurrenceRule === null || isCalendarRecurrenceRule(value.recurrenceRule))
    || !(value.calendarTimeZone === null || isNonEmptyString(value.calendarTimeZone))
    || !Array.isArray(value.beforeOccurrences)
    || value.beforeOccurrences.length > 366
    || !value.beforeOccurrences.every(isCalendarSeriesOccurrenceSnapshot)
    || !Array.isArray(value.afterOccurrences)
    || value.afterOccurrences.length > 366
    || !value.afterOccurrences.every(isCalendarSeriesOccurrenceSnapshot)
    || !Array.isArray(value.conflicts)
    || value.conflicts.length > 32
    || !value.conflicts.every(isCalendarSeriesOccurrenceConflict)
    || !isNonEmptyString(value.expiresAt)
    || !Number.isFinite(Date.parse(value.expiresAt))) return false;

  if (value.outcome !== "pending") {
    return value.event === null
      && value.recurrenceRule === null
      && value.calendarTimeZone === null
      && value.beforeOccurrences.length === 0
      && value.afterOccurrences.length === 0
      && value.conflicts.length === 0;
  }

  if (value.action === "delete" || value.action === "cancel-occurrence"
    || value.action === "restore-occurrence") {
    return value.targetEventId !== null
      && value.targetRevision !== null
      && value.event === null
      && value.recurrenceRule === null
      && (value.action === "cancel-occurrence"
        ? value.scope === "occurrence" && value.beforeOccurrences.length === 1
          && value.beforeOccurrences[0].occurrenceKey.length <= 200
          && value.afterOccurrences.length === 0
        : value.action === "restore-occurrence"
          ? value.scope === "occurrence" && value.beforeOccurrences.length === 0
            && value.afterOccurrences.length === 1
            && value.afterOccurrences[0].occurrenceKey.length <= 200
            && value.calendarTimeZone !== null
          : value.beforeOccurrences.length > 0 && value.afterOccurrences.length === 0);
  }
  return (value.action === "create"
      ? value.targetEventId === null && value.targetRevision === null && value.beforeOccurrences.length === 0
      : value.targetEventId !== null && value.targetRevision !== null && value.beforeOccurrences.length > 0)
    && value.event !== null
    && value.recurrenceRule !== null
    && value.calendarTimeZone !== null;
}

function isCalendarSeriesApproval(value: unknown): value is CalendarSeriesApproval {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && (value.action === "create" || value.action === "update" || value.action === "delete"
      || value.action === "cancel-occurrence" || value.action === "restore-occurrence")
    && ["approved", "stale", "expired", "deleted"].includes(String(value.outcome))
    && (value.event === null || isCalendarEvent(value.event));
}

function matchesSeriesDraftRequest(
  draft: CalendarSeriesDraft,
  request: CalendarSeriesDraftRequest,
): boolean {
  if (draft.action !== request.action || draft.scope !== request.scope) return false;
  if (draft.outcome !== "pending") {
    const requestedTarget = request.action === "create" ? null : request.targetEventId;
    const requestedRevision = request.action === "create" ? null : request.targetRevision;
    return (draft.targetEventId === null && draft.targetRevision === null)
      || (draft.targetEventId === requestedTarget && draft.targetRevision === requestedRevision);
  }
  if (request.action === "create") {
    return draft.targetEventId === null
      && draft.targetRevision === null
      && draft.beforeOccurrences.length === 0
      && draft.event !== null
      && sameJsonValue(draft.event, request.event)
      && draft.recurrenceRule !== null
      && sameJsonValue(draft.recurrenceRule, request.recurrenceRule)
      && draft.calendarTimeZone === request.calendarTimeZone
      && draft.afterOccurrences.length === request.recurrenceRule.count;
  }
  if (draft.targetEventId !== request.targetEventId
    || draft.targetRevision !== request.targetRevision) return false;
  if (request.action === "cancel-occurrence") {
    return draft.event === null
      && draft.recurrenceRule === null
      && draft.beforeOccurrences.length === 1
      && draft.beforeOccurrences[0].occurrenceKey === request.occurrenceKey
      && draft.afterOccurrences.length === 0
      && draft.conflicts.length === 0;
  }
  if (request.action === "restore-occurrence") {
    return draft.event === null
      && draft.recurrenceRule === null
      && draft.calendarTimeZone === request.calendarTimeZone
      && draft.beforeOccurrences.length === 0
      && draft.afterOccurrences.length === 1
      && draft.afterOccurrences[0].occurrenceKey === request.occurrenceKey;
  }
  if (request.action === "delete") {
    return draft.event === null
      && draft.recurrenceRule === null
      && draft.afterOccurrences.length === 0
      && draft.beforeOccurrences.length > 0;
  }
  return draft.event !== null
    && sameJsonValue(draft.event, request.event)
    && draft.recurrenceRule !== null
    && sameJsonValue(draft.recurrenceRule, request.recurrenceRule)
    && draft.calendarTimeZone === request.calendarTimeZone
    && draft.beforeOccurrences.length > 0
    && draft.afterOccurrences.length === request.recurrenceRule.count;
}

function matchesApprovedEvent(
  approval: CalendarSeriesApproval,
  draft: CalendarSeriesDraft,
): boolean {
  if (approval.id !== draft.id || approval.action !== draft.action) return false;
  if (approval.outcome !== "approved") return approval.event === null;
  if (draft.action === "delete" || draft.action === "cancel-occurrence"
    || draft.action === "restore-occurrence") {
    return approval.event === null;
  }
  if (!approval.event || !draft.event || !draft.recurrenceRule) return false;

  const expectedId = draft.action === "update"
    ? draft.targetEventId
    : draft.afterOccurrences[0]?.occurrenceKey.split(":", 1)[0] ?? null;
  const event = approval.event;
  if (!expectedId
    || event.id !== expectedId
    || event.kind !== draft.event.kind
    || event.title !== draft.event.title
    || event.details !== (draft.event.details ?? null)
    || event.reminderChoice !== (draft.event.reminderChoice ?? "none")
    || !sameJsonValue(event.recurrenceRule, draft.recurrenceRule)) return false;
  return event.kind === "all-day"
    ? draft.event.kind === "all-day"
      && event.startDate === draft.event.startDate
      && event.endDate === draft.event.endDate
      && event.reminderTimeZone === (draft.event.reminderTimeZone ?? null)
    : draft.event.kind === "timed"
      && event.startLocal === draft.event.startLocal
      && event.endLocal === draft.event.endLocal
      && event.timeZone === draft.event.timeZone;
}

function isAbortError(reason: unknown): reason is Error {
  return reason instanceof Error && reason.name === "AbortError";
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.title)
    || !(typeof value.details === "string" || value.details === null)
    || !Number.isInteger(value.revision)
    || typeof value.revision !== "number"
    || !isNonEmptyString(value.createdAt)
    || !isNonEmptyString(value.updatedAt)) return false;

  if (Object.hasOwn(value, "recurrenceRule")) {
    const rule = value.recurrenceRule;
    if (!isRecord(rule)
      || (rule.frequency !== "daily" && rule.frequency !== "weekly")
      || !Number.isInteger(rule.interval)
      || typeof rule.interval !== "number"
      || rule.interval < 1
      || rule.interval > 4
      || !Number.isInteger(rule.count)
      || typeof rule.count !== "number"
      || rule.count < 2
      || rule.count > 366) return false;
  }

  if (value.kind === "all-day") {
    if (!isNonEmptyString(value.startDate) || !isNonEmptyString(value.endDate)) return false;
    if (Object.hasOwn(value, "occurrenceKey")) return true;
    if (typeof value.reminderChoice !== "string"
      || !allDayCalendarReminderChoices.includes(value.reminderChoice as AllDayCalendarReminderChoice)) {
      return false;
    }
    if (value.reminderChoice === "none") return value.reminderTimeZone === null;
    if (!isNonEmptyString(value.reminderTimeZone)) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.reminderTimeZone });
      return true;
    } catch {
      return false;
    }
  }

  return value.kind === "timed"
    && isNonEmptyString(value.startLocal)
    && isNonEmptyString(value.endLocal)
    && isNonEmptyString(value.timeZone)
    && isNonEmptyString(value.startsAt)
    && isNonEmptyString(value.endsAt)
    && (Object.hasOwn(value, "occurrenceKey")
      || (typeof value.reminderChoice === "string"
        && timedCalendarReminderChoices.includes(value.reminderChoice as TimedCalendarReminderChoice)
        && !Object.hasOwn(value, "reminderTimeZone")));
}

function isCalendarEventEntry(value: unknown): value is CalendarEventEntry {
  if (!isCalendarEvent(value) || !isRecord(value)) return false;
  const record = value as Record<string, unknown>;
  const hasOccurrenceField = Object.hasOwn(record, "seriesId")
    || Object.hasOwn(record, "occurrenceKey")
    || Object.hasOwn(record, "series");
  if (!hasOccurrenceField) return true;

  return isNonEmptyString(record.seriesId)
    && isNonEmptyString(record.occurrenceKey)
    && value.id === record.occurrenceKey
    && record.occurrenceKey.startsWith(`${record.seriesId}:`)
    && isCalendarEvent(record.series)
    && record.series.id === record.seriesId
    && Object.hasOwn(record.series, "recurrenceRule");
}

function isCalendarOccurrenceEntry(value: unknown): value is CalendarEventOccurrence {
  if (!isRecord(value)) return false;
  const record: Record<string, unknown> = value;
  if (!isCalendarEventEntry(value)) return false;
  return isNonEmptyString(record.occurrenceKey)
    && isCalendarEvent(record.series);
}

function isCalendarPreferences(value: unknown): value is CalendarPreferences {
  if (!isRecord(value)) return false;
  if (!calendarThemes.includes(value.theme as (typeof calendarThemes)[number])) return false;
  if (value.density !== "comfortable" && value.density !== "compact") return false;
  if (!Number.isInteger(value.weekStartsOn) || typeof value.weekStartsOn !== "number") return false;
  if (value.weekStartsOn < 0 || value.weekStartsOn > 6 || !isNonEmptyString(value.timeZone)) return false;

  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
    return true;
  } catch {
    return false;
  }
}

function isCalendarReminderStatusSummary(
  value: unknown,
): value is CalendarReminderStatusSummary {
  if (!isRecord(value) || !isRecord(value.failureCounts)) return false;
  const record = value;
  const failureCounts = value.failureCounts;
  const expectedSummaryKeys = [
    "total", "pending", "leased", "sent", "failed", "cancelled", "retrying",
    "nextAttemptAt", "lastAcceptedAt", "failureCounts",
  ];
  if (Object.keys(record).length !== expectedSummaryKeys.length
    || expectedSummaryKeys.some((key) => !Object.hasOwn(record, key))) return false;
  const isBoundedCount = (count: unknown): count is number =>
    typeof count === "number" && Number.isInteger(count) && count >= 0 && count <= 366;
  const stateKeys = ["total", "pending", "leased", "sent", "failed", "cancelled", "retrying"] as const;
  if (!stateKeys.every((key) => isBoundedCount(record[key]))) return false;
  const failureKeys = ["accountEmail", "configuration", "provider", "temporary", "other"] as const;
  if (Object.keys(failureCounts).length !== failureKeys.length
    || failureKeys.some((key) => !Object.hasOwn(failureCounts, key))
    || !failureKeys.every((key) => isBoundedCount(failureCounts[key]))) {
    return false;
  }
  const timestampIsValid = (timestamp: unknown): timestamp is string => {
    if (typeof timestamp !== "string") return false;
    const parsed = new Date(timestamp);
    return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === timestamp;
  };
  const total = record.total as number;
  const pending = record.pending as number;
  const leased = record.leased as number;
  const sent = record.sent as number;
  const failed = record.failed as number;
  const cancelled = record.cancelled as number;
  const retrying = record.retrying as number;
  const totalFailures = failureKeys.reduce((sum, key) => sum + (failureCounts[key] as number), 0);
  return total === pending + leased + sent + failed + cancelled
    && retrying <= pending
    && totalFailures <= total
    && (pending === 0
      ? record.nextAttemptAt === null
      : timestampIsValid(record.nextAttemptAt))
    && (sent === 0
      ? record.lastAcceptedAt === null
      : timestampIsValid(record.lastAcceptedAt));
}

export async function readCalendarError(response: Response): Promise<CalendarRequestError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error as CalendarApiError["error"]
    : null;
  const fallback = response.status === 401
    ? "Your session may have expired. Sign in again to continue."
    : response.status === 409
      ? "The calendar changed while you reviewed this event. Check the latest overlaps before saving."
      : response.status === 412
        ? "This event changed after you opened it. Reload it and review the latest version before saving."
        : response.status === 428
          ? "The event version could not be verified. Reload the calendar and try again."
          : "Chron could not complete this calendar request. Try again.";
  const message = typeof error?.message === "string" && error.message.length > 0
    ? error.message.slice(0, 500)
    : fallback;
  const code = typeof error?.code === "string" ? error.code.slice(0, 100) : "CALENDAR_REQUEST_FAILED";
  return new CalendarRequestError(message, response.status, code);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CalendarRequestError(
      "Chron returned a calendar response that could not be read. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
}

export function prepareCalendarEventSearchRequest(
  fields: CalendarEventSearchFields,
): CalendarEventSearchValidation {
  const query = fields.query.trim();
  if (query.length === 0) {
    return { ok: false, field: "query", message: "Enter a title to search for." };
  }
  if (Array.from(query).length > 120) {
    return { ok: false, field: "query", message: "Use 120 characters or fewer." };
  }
  if (/[\p{Cc}\p{Cs}]/u.test(query)) {
    return { ok: false, field: "query", message: "Remove control or invalid characters from the title search." };
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  let fromDate: Temporal.PlainDate;
  let throughDate: Temporal.PlainDate;
  try {
    if (!datePattern.test(fields.from) || fields.from.startsWith("0000")) throw new RangeError("Invalid date");
    fromDate = Temporal.PlainDate.from(fields.from);
  } catch {
    return { ok: false, field: "from", message: "Enter a valid start date." };
  }
  try {
    if (!datePattern.test(fields.through) || fields.through.startsWith("0000")) throw new RangeError("Invalid date");
    throughDate = Temporal.PlainDate.from(fields.through);
  } catch {
    return { ok: false, field: "through", message: "Enter a valid end date." };
  }
  if (Temporal.PlainDate.compare(throughDate, fromDate) < 0) {
    return { ok: false, field: "through", message: "Through must be on or after From." };
  }

  let to: string;
  try {
    const exclusiveTo = throughDate.add({ days: 1 });
    if (exclusiveTo.year > 9999) {
      return { ok: false, field: "through", message: "Choose an end date before 9999-12-31." };
    }
    if (fromDate.until(exclusiveTo, { largestUnit: "days" }).days > 93) {
      return { ok: false, field: "through", message: "Choose a date window of 93 days or fewer." };
    }
    to = exclusiveTo.toString();
  } catch {
    return { ok: false, field: "through", message: "Choose a valid end date." };
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: fields.timeZone });
  } catch {
    return { ok: false, field: "form", message: "The calendar time zone is invalid. Reload your preferences and try again." };
  }
  if (fields.kind !== "" && fields.kind !== "timed" && fields.kind !== "all-day") {
    return { ok: false, field: "form", message: "Choose a valid event type." };
  }

  return {
    ok: true,
    request: {
      query,
      from: fromDate.toString(),
      to,
      timeZone: fields.timeZone,
      ...(fields.kind ? { kind: fields.kind } : {}),
    },
  };
}

export async function searchCalendarEvents(
  request: CalendarEventSearchRequest,
  signal?: AbortSignal,
): Promise<readonly CalendarEvent[]> {
  let response: Response;
  try {
    response = await fetch("/api/calendar/events/search", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (reason) {
    if (signal?.aborted || isAbortError(reason)) throw reason;
    throw new CalendarRequestError(
      "Chron couldn't reach the calendar. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.events) || !payload.events.every(isCalendarEvent)) {
    throw new CalendarRequestError(
      "Chron returned search results in an unexpected format. Search again to retry.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.events;
}

export async function fetchCalendarEvents(
  from: string,
  to: string,
  timeZone: string,
  signal?: AbortSignal,
): Promise<CalendarEventEntry[]> {
  const query = new URLSearchParams({ from, to, timeZone });
  const response = await fetch(`/api/calendar/events?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.events) || !payload.events.every(isCalendarEventEntry)) {
    throw new CalendarRequestError(
      "Chron returned calendar events in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.events;
}

export async function fetchCalendarCancelledOccurrences(
  from: string,
  to: string,
  timeZone: string,
  signal?: AbortSignal,
): Promise<CalendarEventOccurrence[]> {
  const query = new URLSearchParams({ from, to, timeZone });
  const response = await fetch(`/api/calendar/events/cancelled?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload)
    || !Array.isArray(payload.occurrences)
    || !payload.occurrences.every(isCalendarOccurrenceEntry)) {
    throw new CalendarRequestError(
      "Chron returned cancelled occurrences in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.occurrences;
}

export async function fetchCalendarReminderStatus(
  eventId: string,
  signal?: AbortSignal,
): Promise<CalendarReminderStatusSummary> {
  let response: Response;
  try {
    response = await fetch(
      `/api/calendar/events/${encodeURIComponent(eventId)}/reminders`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal,
      },
    );
  } catch (reason) {
    if (signal?.aborted || isAbortError(reason)) throw reason;
    throw new CalendarRequestError(
      "Chron couldn't reach reminder status. Check your connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarReminderStatusSummary(payload.status)) {
    throw new CalendarRequestError(
      "Chron returned reminder status in an unexpected format. Reload the event and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.status;
}

export async function fetchCalendarPreferences(signal?: AbortSignal): Promise<CalendarPreferences | null> {
  const response = await fetch("/api/calendar/preferences", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !(payload.preferences === null || isCalendarPreferences(payload.preferences))) {
    throw new CalendarRequestError(
      "Chron returned calendar preferences in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.preferences;
}

export async function saveCalendarPreferences(
  preferences: CalendarPreferences,
): Promise<CalendarPreferences> {
  const response = await fetch("/api/calendar/preferences", {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarPreferences(payload.preferences)) {
    throw new CalendarRequestError(
      "Chron returned saved preferences in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.preferences;
}

export async function createCalendarEvent(
  mutation: CalendarEventMutation,
  calendarTimeZone: string,
  conflicts: readonly CalendarConflict[],
  operationKey: string,
): Promise<CalendarEvent> {
  const response = await fetch("/api/calendar/events", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": operationKey,
    },
    body: JSON.stringify({
      event: mutation,
      calendarTimeZone,
      reviewedConflicts: conflictReview(conflicts),
    }),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarEvent(payload.event)) {
    throw new CalendarRequestError(
      "Chron returned a saved event in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.event;
}

export async function reconcileCalendarCreate(operationKey: string): Promise<CalendarEvent | null> {
  const response = await fetch("/api/calendar/events", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": operationKey,
    },
    body: JSON.stringify({ operation: "reconcile" }),
  });
  if (response.status === 404) {
    const error = await readCalendarError(response);
    if (error.code === "CREATE_OPERATION_NOT_FOUND") return null;
    throw error;
  }
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarEvent(payload.event)) {
    throw new CalendarRequestError(
      "Chron returned a recovered event in an unexpected format. Retry verification.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.event;
}

export async function checkCalendarEventConflicts(
  event: CalendarEventMutation,
  calendarTimeZone: string,
  excludeEventId?: string,
): Promise<CalendarConflict[]> {
  const response = await fetch("/api/calendar/events/conflicts", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event,
      calendarTimeZone,
      ...(excludeEventId ? { excludeEventId } : {}),
    }),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.conflicts) || !payload.conflicts.every(isCalendarConflict)) {
    throw new CalendarRequestError(
      "Chron returned calendar conflicts in an unexpected format. Review the event again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.conflicts;
}

function isCalendarConflict(value: unknown): value is CalendarConflict {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.title)
    || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 1) return false;
  if (value.kind === "all-day") {
    return isNonEmptyString(value.startDate) && isNonEmptyString(value.endDate);
  }
  return value.kind === "timed"
    && isNonEmptyString(value.startLocal)
    && isNonEmptyString(value.endLocal)
    && isNonEmptyString(value.timeZone);
}

function conflictReview(conflicts: readonly CalendarConflict[]): CalendarConflictReview[] {
  return conflicts.map(({ id, revision }) => ({ id, revision }));
}

export async function updateCalendarEvent(
  event: CalendarEvent,
  mutation: CalendarEventMutation,
  calendarTimeZone: string,
  conflicts: readonly CalendarConflict[],
): Promise<CalendarEvent> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": `"${event.revision}"`,
    },
    body: JSON.stringify({
      event: mutation,
      calendarTimeZone,
      reviewedConflicts: conflictReview(conflicts),
    }),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarEvent(payload.event)) {
    throw new CalendarRequestError(
      "Chron returned an updated event in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.event;
}

export async function deleteCalendarEvent(event: CalendarEvent): Promise<void> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "If-Match": `"${event.revision}"`,
    },
  });
  if (!response.ok) throw await readCalendarError(response);
  if (response.status !== 204 && response.status !== 200) {
    throw new CalendarRequestError(
      "Chron did not confirm the event deletion. Reload the calendar.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
}

export async function createCalendarSeriesDraft(
  request: CalendarSeriesDraftRequest,
  operationKey: string,
): Promise<CalendarSeriesDraft> {
  const response = await fetch("/api/calendar/events/series-drafts", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": operationKey,
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarSeriesDraft(payload.draft)) {
    throw new CalendarRequestError(
      "Chron returned a recurring proposal in an unexpected format. Review the series again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  if (!matchesSeriesDraftRequest(payload.draft, request)) {
    throw new CalendarRequestError(
      "Chron returned a recurring proposal that did not match the reviewed changes. Review the series again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.draft;
}

export async function approveCalendarSeriesDraft(
  draftId: string,
  expectedAction: CalendarSeriesDraft["action"],
  expectedDraft?: CalendarSeriesDraft,
): Promise<CalendarSeriesApproval> {
  const response = await fetch(
    `/api/calendar/events/series-drafts/${encodeURIComponent(draftId)}/approve`,
    {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok && response.status !== 409 && response.status !== 410) {
    throw await readCalendarError(response);
  }
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarSeriesApproval(payload.approval)) {
    if (!response.ok) throw await readCalendarError(response);
    throw new CalendarRequestError(
      "Chron returned a recurring approval in an unexpected format. Check the calendar before retrying.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  if (payload.approval.id !== draftId || payload.approval.action !== expectedAction) {
    throw new CalendarRequestError(
      "Chron returned an approval for a different recurring proposal. Check the calendar before retrying.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  const expectedStatus = payload.approval.outcome === "approved"
    ? 200
    : payload.approval.outcome === "stale"
      ? 409
      : 410;
  const outcomeMatchesAction = payload.approval.outcome !== "approved"
    ? payload.approval.event === null
    : expectedAction === "delete" || expectedAction === "cancel-occurrence"
      || expectedAction === "restore-occurrence"
      ? payload.approval.event === null
      : payload.approval.event !== null;
  if (response.status !== expectedStatus
    || !outcomeMatchesAction
    || (expectedDraft && !matchesApprovedEvent(payload.approval, expectedDraft))) {
    throw new CalendarRequestError(
      "Chron returned a recurring approval that did not match the reviewed proposal. Check the calendar before retrying.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.approval;
}
