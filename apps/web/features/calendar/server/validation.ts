import {
  calendarThemes,
  type CalendarConflictReview,
  type CalendarDensity,
  type CalendarEventCreateRequest,
  type CalendarEventCommit,
  type CalendarEventMutation,
  type CalendarEventSearchRequest,
  type CalendarPreferences,
  type CalendarTheme,
} from "../domain/types.ts";
import {
  parseCalendarDate,
  resolveCalendarRange,
  resolveAllDayRange,
  resolveTimedDuration,
  resolveLocalDateTime,
  validateTimeZone,
} from "../domain/time.ts";
import { CalendarRouteError } from "./errors.ts";

const maximumAllDayEventDays = 366;
const maximumTitleLength = 160;
const maximumDetailsLength = 4000;
const maximumConflictCount = 32;
const maximumSearchQueryLength = 120;

function invalidPayload(message = "The calendar fields are invalid."): never {
  throw new CalendarRouteError(400, "INVALID_CALENDAR_FIELDS", message);
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return invalidPayload();
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalidPayload();
  return value as Record<string, unknown>;
}

function assertAllowedFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const allowlist = new Set(allowed);
  if (Object.keys(value).some((key) => !allowlist.has(key))) invalidPayload();
}

function parseTitle(value: unknown): string {
  if (typeof value !== "string") return invalidPayload("Add an event title.");
  const title = value.trim();
  if (
    title.length < 1 ||
    title.length > maximumTitleLength ||
    /[\u0000-\u001f\u007f]/u.test(title)
  ) {
    return invalidPayload("Titles must contain 1 to 160 characters without control characters.");
  }
  return title;
}

function parseDetails(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maximumDetailsLength || /\u0000/u.test(value)) {
    return invalidPayload("Details must be 4,000 characters or fewer.");
  }
  const details = value.trim();
  return details || undefined;
}

function optionalDisambiguation(value: unknown): "earlier" | "later" | undefined {
  if (value === undefined) return undefined;
  if (value !== "earlier" && value !== "later") {
    return invalidPayload("Choose the earlier or later time when clocks repeat.");
  }
  return value;
}

export function parseCalendarEventMutation(input: unknown): CalendarEventMutation {
  const value = objectRecord(input);
  const title = parseTitle(value.title);
  const details = parseDetails(value.details);

  if (value.kind === "timed") {
    assertAllowedFields(value, [
      "kind",
      "title",
      "details",
      "startLocal",
      "endLocal",
      "timeZone",
      "startDisambiguation",
      "endDisambiguation",
    ]);
    const startDisambiguation = optionalDisambiguation(value.startDisambiguation);
    const endDisambiguation = optionalDisambiguation(value.endDisambiguation);
    const start = resolveLocalDateTime(value.startLocal, value.timeZone, startDisambiguation);
    const end = resolveLocalDateTime(value.endLocal, value.timeZone, endDisambiguation);
    resolveTimedDuration(start.instant, end.instant);
    return {
      kind: "timed",
      title,
      ...(details ? { details } : {}),
      startLocal: start.local,
      endLocal: end.local,
      timeZone: start.timeZone,
      ...(startDisambiguation ? { startDisambiguation } : {}),
      ...(endDisambiguation ? { endDisambiguation } : {}),
    };
  }

  if (value.kind === "all-day") {
    assertAllowedFields(value, ["kind", "title", "details", "startDate", "endDate"]);
    const range = resolveAllDayRange(value.startDate, value.endDate);
    const start = parseCalendarDate(range.startDate);
    const end = parseCalendarDate(range.endDate);
    if (start.until(end, { largestUnit: "day" }).days > maximumAllDayEventDays) {
      throw new CalendarRouteError(400, "INVALID_DATE_RANGE", "All-day events may span up to 366 days.");
    }
    return {
      kind: "all-day",
      title,
      ...(details ? { details } : {}),
      ...range,
    };
  }

  return invalidPayload("Choose a supported calendar event type.");
}

export function parseCalendarPreferences(input: unknown): CalendarPreferences {
  const value = objectRecord(input);
  assertAllowedFields(value, ["theme", "density", "weekStartsOn", "timeZone"]);

  const theme = value.theme;
  if (typeof theme !== "string" || !calendarThemes.includes(theme as CalendarTheme)) {
    return invalidPayload("Choose a supported calendar theme.");
  }

  const density = value.density;
  if (density !== "comfortable" && density !== "compact") {
    return invalidPayload("Choose a supported calendar density.");
  }

  const weekStartsOn = value.weekStartsOn;
  if (typeof weekStartsOn !== "number" || !Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) {
    return invalidPayload("Choose a week start from Sunday through Saturday.");
  }

  const timeZone = validateTimeZone(value.timeZone);
  return {
    theme: theme as CalendarTheme,
    density: density as CalendarDensity,
    weekStartsOn,
    timeZone,
  };
}

export function parseCalendarEventSearchRequest(input: unknown): CalendarEventSearchRequest {
  const value = objectRecord(input);
  assertAllowedFields(value, ["query", "from", "to", "timeZone", "kind"]);

  if (typeof value.query !== "string" || /[\p{Cc}\p{Cs}]/u.test(value.query)) {
    return invalidPayload("Search text must contain 1 to 120 characters without control characters.");
  }
  const query = value.query.trim();
  const queryLength = Array.from(query).length;
  if (queryLength < 1 || queryLength > maximumSearchQueryLength) {
    return invalidPayload("Search text must contain 1 to 120 characters without control characters.");
  }

  let kind: CalendarEventSearchRequest["kind"];
  if (value.kind !== undefined) {
    if (value.kind !== "timed" && value.kind !== "all-day") {
      return invalidPayload("Choose a supported calendar event type.");
    }
    kind = value.kind;
  }

  const timeZone = validateTimeZone(value.timeZone);
  const range = resolveCalendarRange(value.from, value.to, timeZone);
  return {
    query,
    from: range.fromDate,
    to: range.toDate,
    timeZone,
    ...(kind ? { kind } : {}),
  };
}

export function validateCalendarEventId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CalendarRouteError(404, "EVENT_NOT_FOUND", "That calendar event could not be found.");
  }
  return value.toLowerCase();
}

export function parseCalendarIdempotencyKey(value: string | null): string {
  if (value === null) {
    throw new CalendarRouteError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "This event request needs an idempotency key. Retry with the same key.",
    );
  }
  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(value)) {
    throw new CalendarRouteError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "The event request key must be 1 to 128 safe characters.",
    );
  }
  return value;
}

export function parseCalendarConflictCheck(input: unknown): Readonly<{
  event: CalendarEventMutation;
  calendarTimeZone: string;
  excludeEventId?: string;
}> {
  const value = objectRecord(input);
  assertAllowedFields(value, ["event", "calendarTimeZone", "excludeEventId"]);
  const event = parseCalendarEventMutation(value.event);
  const calendarTimeZone = validateTimeZone(value.calendarTimeZone);
  const excludeEventId = value.excludeEventId === undefined
    ? undefined
    : typeof value.excludeEventId === "string"
      ? validateCalendarEventId(value.excludeEventId)
      : invalidPayload("The event being edited is invalid.");

  return {
    event,
    calendarTimeZone,
    ...(excludeEventId ? { excludeEventId } : {}),
  };
}

export function parseCalendarEventCommit(input: unknown): CalendarEventCommit {
  const value = objectRecord(input);
  assertAllowedFields(value, ["event", "calendarTimeZone", "reviewedConflicts"]);
  const event = parseCalendarEventMutation(value.event);
  const calendarTimeZone = validateTimeZone(value.calendarTimeZone);
  if (!Array.isArray(value.reviewedConflicts) || value.reviewedConflicts.length > maximumConflictCount) {
    return invalidPayload("This event has too many overlaps to review at once.");
  }

  const seen = new Set<string>();
  const reviewedConflicts = value.reviewedConflicts.map((item): CalendarConflictReview => {
    const conflict = objectRecord(item);
    assertAllowedFields(conflict, ["id", "revision"]);
    if (typeof conflict.id !== "string") return invalidPayload("An overlapping event is invalid.");
    const id = validateCalendarEventId(conflict.id);
    if (seen.has(id)) return invalidPayload("An overlapping event was repeated.");
    seen.add(id);
    if (
      typeof conflict.revision !== "number" ||
      !Number.isSafeInteger(conflict.revision) ||
      conflict.revision < 1 ||
      conflict.revision > 2_147_483_647
    ) {
      return invalidPayload("An overlapping event version is invalid.");
    }
    return { id, revision: conflict.revision };
  });

  return { event, calendarTimeZone, reviewedConflicts };
}

export function parseCalendarEventCreateRequest(input: unknown): CalendarEventCreateRequest {
  const value = objectRecord(input);
  if (value.operation === "reconcile") {
    assertAllowedFields(value, ["operation"]);
    return { operation: "reconcile" };
  }
  return { operation: "create", commit: parseCalendarEventCommit(input) };
}
