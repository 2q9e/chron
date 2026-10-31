import {
  calendarThemes,
  type CalendarConflictReview,
  type CalendarDensity,
  type CalendarEventMutation,
  type CalendarPreferences,
  type CalendarTheme,
} from "../domain/types.ts";
import {
  parseCalendarDate,
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

export function validateCalendarEventId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CalendarRouteError(404, "EVENT_NOT_FOUND", "That calendar event could not be found.");
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

export function parseCalendarEventCommit(input: unknown): Readonly<{
  event: CalendarEventMutation;
  calendarTimeZone: string;
  reviewedConflicts: readonly CalendarConflictReview[];
}> {
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
