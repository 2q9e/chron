import { Temporal } from "@js-temporal/polyfill";
import {
  calendarThemes,
  type CalendarConflictReview,
  type CalendarDensity,
  type CalendarSeriesDraftRequest,
  type CalendarEventCreateRequest,
  type CalendarEventCommit,
  type CalendarEventMutation,
  type CalendarOccurrenceMovementRequest,
  type CalendarEventSearchRequest,
  type CalendarPreferences,
  type CalendarTheme,
} from "../domain/types.ts";
import {
  allDayCalendarReminderChoices,
  timedCalendarReminderChoices,
  type AllDayCalendarReminderChoice,
  type TimedCalendarReminderChoice,
} from "../domain/reminders.ts";
import {
  maximumRecurringEventDurationDays,
  expandCalendarRecurrence,
  normalizeRecurrenceRule,
  RecurrenceError,
  type RecurrenceRule,
} from "../domain/recurrence.ts";
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

function parseTimedReminderChoice(value: unknown): TimedCalendarReminderChoice | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string"
    || !timedCalendarReminderChoices.includes(value as TimedCalendarReminderChoice)) {
    return invalidPayload("Choose a supported reminder for the timed event.");
  }
  return value as TimedCalendarReminderChoice;
}

function parseAllDayReminderChoice(value: unknown): AllDayCalendarReminderChoice | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string"
    || !allDayCalendarReminderChoices.includes(value as AllDayCalendarReminderChoice)) {
    return invalidPayload("Choose a supported reminder for the all-day event.");
  }
  return value as AllDayCalendarReminderChoice;
}

function parseRecurrenceRule(input: unknown): RecurrenceRule {
  let rule: RecurrenceRule;
  try {
    rule = normalizeRecurrenceRule(input);
  } catch {
    return invalidPayload("Choose a finite daily or weekly recurrence from 2 to 366 occurrences.");
  }

  const periodDays = rule.frequency === "weekly" ? 7 : 1;
  if ((rule.count - 1) * rule.interval * periodDays > 365) {
    return invalidPayload("Repeating events must end within 366 calendar dates.");
  }
  return rule;
}

function assertRecurringMutationDuration(event: CalendarEventMutation): void {
  if (event.kind === "all-day") {
    const durationDays = Temporal.PlainDate.from(event.startDate)
      .until(Temporal.PlainDate.from(event.endDate), { largestUnit: "day" }).days;
    if (durationDays > maximumRecurringEventDurationDays) {
      return invalidPayload("Repeating all-day events may span up to 7 days.");
    }
    return;
  }

  const start = resolveLocalDateTime(event.startLocal, event.timeZone, event.startDisambiguation);
  const end = resolveLocalDateTime(event.endLocal, event.timeZone, event.endDisambiguation);
  const maximumNanoseconds = BigInt(maximumRecurringEventDurationDays) * BigInt(24) * BigInt(60) *
    BigInt(60) * BigInt(1_000_000_000);
  const durationNanoseconds = Temporal.Instant.from(end.instant).epochNanoseconds
    - Temporal.Instant.from(start.instant).epochNanoseconds;
  if (durationNanoseconds > maximumNanoseconds) {
    return invalidPayload("Repeating timed events may last up to 7 days.");
  }
}

function assertRecurrenceFullyExpandable(
  event: CalendarEventMutation,
  rule: RecurrenceRule,
  calendarTimeZone: string,
): void {
  const metadata = {
    id: "00000000-0000-4000-8000-000000000000",
    title: event.title,
    details: event.details ?? null,
    revision: 1,
    createdAt: "2000-01-01T00:00:00.000Z",
    updatedAt: "2000-01-01T00:00:00.000Z",
  };
  const series = event.kind === "timed"
    ? (() => {
        const start = resolveLocalDateTime(
          event.startLocal,
          event.timeZone,
          event.startDisambiguation,
        );
        const end = resolveLocalDateTime(
          event.endLocal,
          event.timeZone,
          event.endDisambiguation,
        );
        return {
          ...metadata,
          kind: "timed" as const,
          reminderChoice: event.reminderChoice ?? "none",
          startLocal: start.local,
          endLocal: end.local,
          timeZone: start.timeZone,
          startsAt: start.instant,
          endsAt: end.instant,
        };
      })()
    : {
        ...metadata,
        kind: "all-day" as const,
        reminderChoice: event.reminderChoice ?? "none",
        reminderTimeZone: event.reminderTimeZone ?? null,
        startDate: event.startDate,
        endDate: event.endDate,
      };

  // The recurrence engine validates every candidate and generated end even
  // when none overlaps this small, deterministic window.
  try {
    expandCalendarRecurrence(series, rule, {
      fromDate: "2000-01-01",
      toDate: "2000-01-02",
      ...(event.kind === "timed" ? { timeZone: calendarTimeZone } : {}),
    });
  } catch (error) {
    if (error instanceof RecurrenceError) {
      return invalidPayload(
        "This recurrence cannot be expanded within the supported calendar dates and limits.",
      );
    }
    throw error;
  }
}

function parseSeriesTarget(value: Record<string, unknown>): Readonly<{
  targetEventId: string;
  targetRevision: number;
}> {
  if (typeof value.targetEventId !== "string") {
    return invalidPayload("Choose the calendar series to change.");
  }
  const targetEventId = validateCalendarEventId(value.targetEventId);
  const targetRevision = value.targetRevision;
  if (
    typeof targetRevision !== "number" ||
    !Number.isSafeInteger(targetRevision) ||
    targetRevision < 1 ||
    targetRevision > 2_147_483_647
  ) {
    return invalidPayload("Reload the calendar series before proposing a change.");
  }
  return { targetEventId, targetRevision };
}

export function parseCalendarSeriesDraftRequest(input: unknown): CalendarSeriesDraftRequest {
  const value = objectRecord(input);
  if (value.action === "cancel-occurrence" || value.action === "restore-occurrence"
    || value.action === "move-occurrence") {
    if (value.scope !== "occurrence") {
      return invalidPayload("Choose one occurrence as the change scope.");
    }
    assertAllowedFields(value, value.action === "restore-occurrence" ? [
      "action",
      "scope",
      "targetEventId",
      "targetRevision",
      "occurrenceKey",
      "calendarTimeZone",
    ] : value.action === "move-occurrence" ? [
      "action",
      "scope",
      "targetEventId",
      "targetRevision",
      "occurrenceKey",
      "calendarTimeZone",
      "movement",
    ] : [
      "action",
      "scope",
      "targetEventId",
      "targetRevision",
      "occurrenceKey",
    ]);
    const target = parseSeriesTarget(value);
    if (typeof value.occurrenceKey !== "string"
      || value.occurrenceKey.length < 1
      || value.occurrenceKey.length > 200
      || /[\u0000-\u001f\u007f]/u.test(value.occurrenceKey)) {
      return invalidPayload("Choose a valid occurrence from this recurring series.");
    }
    if (value.action === "restore-occurrence") {
      return {
        action: "restore-occurrence",
        scope: "occurrence",
        ...target,
        occurrenceKey: value.occurrenceKey,
        calendarTimeZone: validateTimeZone(value.calendarTimeZone),
      };
    }
    if (value.action === "move-occurrence") {
      return {
        action: "move-occurrence",
        scope: "occurrence",
        ...target,
        occurrenceKey: value.occurrenceKey,
        calendarTimeZone: validateTimeZone(value.calendarTimeZone),
        movement: parseCalendarOccurrenceMovement(value.movement),
      };
    }
    return {
      action: "cancel-occurrence",
      scope: "occurrence",
      ...target,
      occurrenceKey: value.occurrenceKey,
    };
  }

  if (value.scope !== "series") {
    return invalidPayload("Choose the entire series as the change scope.");
  }

  if (value.action === "delete") {
    assertAllowedFields(value, ["action", "scope", "targetEventId", "targetRevision"]);
    return { action: "delete", scope: "series", ...parseSeriesTarget(value) };
  }

  if (value.action === "create") {
    assertAllowedFields(value, ["action", "scope", "event", "recurrenceRule", "calendarTimeZone"]);
    const event = parseCalendarEventMutation(value.event);
    assertRecurringMutationDuration(event);
    const recurrenceRule = parseRecurrenceRule(value.recurrenceRule);
    const calendarTimeZone = validateTimeZone(value.calendarTimeZone);
    assertRecurrenceFullyExpandable(event, recurrenceRule, calendarTimeZone);
    return {
      action: "create",
      scope: "series",
      event,
      recurrenceRule,
      calendarTimeZone,
    };
  }

  if (value.action === "update") {
    assertAllowedFields(value, [
      "action",
      "scope",
      "targetEventId",
      "targetRevision",
      "event",
      "recurrenceRule",
      "calendarTimeZone",
    ]);
    const target = parseSeriesTarget(value);
    const event = parseCalendarEventMutation(value.event);
    assertRecurringMutationDuration(event);
    const recurrenceRule = parseRecurrenceRule(value.recurrenceRule);
    const calendarTimeZone = validateTimeZone(value.calendarTimeZone);
    assertRecurrenceFullyExpandable(event, recurrenceRule, calendarTimeZone);
    return {
      action: "update",
      scope: "series",
      ...target,
      event,
      recurrenceRule,
      calendarTimeZone,
    };
  }

  return invalidPayload("Choose a supported calendar series action.");
}

function parseCalendarOccurrenceMovement(input: unknown): CalendarOccurrenceMovementRequest {
  const value = objectRecord(input);
  if (value.kind === "timed") {
    assertAllowedFields(value, [
      "kind",
      "startLocal",
      "endLocal",
      "timeZone",
      "startDisambiguation",
      "endDisambiguation",
    ]);
    const timeZone = validateTimeZone(value.timeZone);
    const startDisambiguation = optionalDisambiguation(value.startDisambiguation);
    const endDisambiguation = optionalDisambiguation(value.endDisambiguation);
    const start = resolveLocalDateTime(value.startLocal, timeZone, startDisambiguation);
    const end = resolveLocalDateTime(value.endLocal, timeZone, endDisambiguation);
    resolveTimedDuration(start.instant, end.instant);
    const durationMilliseconds = Temporal.Instant.from(end.instant).epochMilliseconds
      - Temporal.Instant.from(start.instant).epochMilliseconds;
    const maximumMilliseconds = maximumRecurringEventDurationDays * 24 * 60 * 60 * 1000;
    if (durationMilliseconds > maximumMilliseconds) {
      return invalidPayload("A moved recurring occurrence may last up to 7 days.");
    }
    return {
      kind: "timed",
      startLocal: start.local,
      endLocal: end.local,
      timeZone: start.timeZone,
      ...(startDisambiguation ? { startDisambiguation } : {}),
      ...(endDisambiguation ? { endDisambiguation } : {}),
    };
  }

  if (value.kind === "all-day") {
    assertAllowedFields(value, ["kind", "startDate", "endDate"]);
    const bounds = resolveAllDayRange(value.startDate, value.endDate);
    const durationDays = parseCalendarDate(bounds.startDate)
      .until(parseCalendarDate(bounds.endDate), { largestUnit: "day" }).days;
    if (durationDays > maximumRecurringEventDurationDays) {
      return invalidPayload("A moved recurring all-day occurrence may span up to 7 days.");
    }
    return { kind: "all-day", startDate: bounds.startDate, endDate: bounds.endDate };
  }

  return invalidPayload("Choose valid time or date bounds for this occurrence.");
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
      "reminderChoice",
      "startDisambiguation",
      "endDisambiguation",
    ]);
    const reminderChoice = parseTimedReminderChoice(value.reminderChoice);
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
      ...(reminderChoice !== undefined ? { reminderChoice } : {}),
      ...(startDisambiguation ? { startDisambiguation } : {}),
      ...(endDisambiguation ? { endDisambiguation } : {}),
    };
  }

  if (value.kind === "all-day") {
    assertAllowedFields(value, [
      "kind",
      "title",
      "details",
      "startDate",
      "endDate",
      "reminderChoice",
      "reminderTimeZone",
    ]);
    const reminderChoice = parseAllDayReminderChoice(value.reminderChoice);
    if (reminderChoice === undefined || reminderChoice === "none") {
      if (value.reminderTimeZone !== undefined) {
        return invalidPayload("An all-day reminder time zone is only used when a reminder is selected.");
      }
    } else if (typeof value.reminderTimeZone !== "string") {
      return invalidPayload("Choose the calendar time zone for this all-day reminder.");
    }
    const reminderTimeZone = reminderChoice && reminderChoice !== "none"
      ? validateTimeZone(value.reminderTimeZone)
      : undefined;
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
      ...(reminderChoice !== undefined ? { reminderChoice } : {}),
      ...(reminderTimeZone ? { reminderTimeZone } : {}),
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
