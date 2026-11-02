import { Temporal } from "@js-temporal/polyfill";
import type {
  AllDayCalendarEvent,
  CalendarEvent,
  CalendarEventCategory,
  CalendarRecurrenceRule,
  TimedCalendarEvent,
} from "./types.ts";
import { calendarEventCategories } from "./types.ts";
import {
  CalendarTimeError,
  inspectLocalDateTime,
  maximumCalendarRangeDays,
  parseCalendarDate,
  resolveCalendarRange,
  validateTimeZone,
} from "./time.ts";

export const maximumRecurrenceCandidates = 366;
export const maximumRecurrenceHorizonDays = 366;
export const maximumRecurrenceRangeDays = maximumCalendarRangeDays;
export const maximumRecurringEventDurationDays = 7;

export type RecurrenceRule = CalendarRecurrenceRule;

export type RecurrenceErrorCode =
  | "INVALID_RULE"
  | "INVALID_SERIES"
  | "INVALID_RANGE"
  | "RANGE_TOO_LARGE"
  | "HORIZON_EXCEEDED"
  | "CANDIDATE_LIMIT_EXCEEDED"
  | "OCCURRENCE_LIMIT_EXCEEDED";

export class RecurrenceError extends Error {
  constructor(code: RecurrenceErrorCode, message: string) {
    super(message);
    this.name = "RecurrenceError";
    this.code = code;
  }

  readonly code: RecurrenceErrorCode;
}

export type RecurrenceExpansionWindow = Readonly<{
  fromDate: string;
  toDate: string;
  /** Required for timed series; omitted for date-only series. */
  timeZone?: string;
}>;

type OccurrenceMetadata = Readonly<{
  seriesId: string;
  occurrenceKey: string;
  title: string;
  details: string | null;
  category?: CalendarEventCategory | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type TimedCalendarOccurrence = OccurrenceMetadata & Readonly<{
  kind: "timed";
  startLocal: string;
  endLocal: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
}>;

export type AllDayCalendarOccurrence = OccurrenceMetadata & Readonly<{
  kind: "all-day";
  startDate: string;
  endDate: string;
}>;

export type CalendarRecurrenceOccurrence =
  | TimedCalendarOccurrence
  | AllDayCalendarOccurrence;

type PlainRecord = Record<string, unknown>;

function invalidRule(): never {
  throw new RecurrenceError(
    "INVALID_RULE",
    "Use a daily or weekly rule with an interval from 1 to 4 and a count from 1 to 366.",
  );
}

function exactPlainRecord(
  value: unknown,
  allowedKeys: readonly string[],
): PlainRecord {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Expected an object");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Expected a plain object");
    }

    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== allowedKeys.length ||
      keys.some((key) => typeof key !== "string" || !allowedKeys.includes(key))
    ) {
      throw new Error("Unexpected object fields");
    }

    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error("Expected enumerable data fields");
      }
      snapshot[key as string] = descriptor.value;
    }

    return snapshot;
  } catch {
    return invalidRule();
  }
}

/** Validate the complete supported shape and return a detached, frozen rule. */
export function normalizeRecurrenceRule(value: unknown): RecurrenceRule {
  const rule = exactPlainRecord(value, ["frequency", "interval", "count"]);
  if (
    (rule.frequency !== "daily" && rule.frequency !== "weekly") ||
    typeof rule.interval !== "number" ||
    !Number.isInteger(rule.interval) ||
    rule.interval < 1 ||
    rule.interval > 4 ||
    typeof rule.count !== "number" ||
    !Number.isInteger(rule.count) ||
    rule.count < 1 ||
    rule.count > maximumRecurrenceCandidates
  ) {
    return invalidRule();
  }

  return Object.freeze({
    frequency: rule.frequency,
    interval: rule.interval as RecurrenceRule["interval"],
    count: rule.count,
  });
}

function invalidSeries(): never {
  throw new RecurrenceError(
    "INVALID_SERIES",
    "The recurrence series has invalid dates or times for the bounded recurrence model.",
  );
}

function invalidRange(): never {
  throw new RecurrenceError(
    "INVALID_RANGE",
    "Use an increasing half-open date range and a valid time zone for timed events.",
  );
}

function readWindow(value: unknown): RecurrenceExpansionWindow {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Expected a range object");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("Expected a plain object");
    }
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => key !== "fromDate" && key !== "toDate" && key !== "timeZone") ||
      !Object.prototype.hasOwnProperty.call(value, "fromDate") ||
      !Object.prototype.hasOwnProperty.call(value, "toDate")
    ) {
      throw new Error("Unexpected range fields");
    }
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") throw new Error("Unexpected range field");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
        throw new Error("Expected data fields");
      }
      snapshot[key] = descriptor.value;
    }
    if (typeof snapshot.fromDate !== "string" || typeof snapshot.toDate !== "string") {
      throw new Error("Expected date strings");
    }
    if (snapshot.timeZone !== undefined && typeof snapshot.timeZone !== "string") {
      throw new Error("Expected a time-zone string");
    }
    return {
      fromDate: snapshot.fromDate,
      toDate: snapshot.toDate,
      ...(snapshot.timeZone === undefined ? {} : { timeZone: snapshot.timeZone }),
    };
  } catch {
    return invalidRange();
  }
}

function readMetadata(series: unknown): OccurrenceMetadata {
  if (series === null || typeof series !== "object" || Array.isArray(series)) {
    return invalidSeries();
  }
  const candidate = series as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" || candidate.id.length === 0 ||
    typeof candidate.title !== "string" ||
    !(typeof candidate.details === "string" || candidate.details === null) ||
    !(candidate.category === undefined || candidate.category === null
      || (typeof candidate.category === "string"
        && calendarEventCategories.includes(candidate.category as CalendarEventCategory))) ||
    typeof candidate.revision !== "number" || !Number.isSafeInteger(candidate.revision) || candidate.revision < 0 ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string"
  ) {
    return invalidSeries();
  }
  return {
    seriesId: candidate.id,
    title: candidate.title,
    details: candidate.details,
    ...(candidate.category === undefined
      ? {}
      : { category: candidate.category as CalendarEventCategory | null }),
    revision: candidate.revision,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    occurrenceKey: "",
  };
}

function makeMetadata(
  metadata: OccurrenceMetadata,
  scheduledStart: string,
): OccurrenceMetadata {
  return {
    ...metadata,
    occurrenceKey: `${metadata.seriesId}:${scheduledStart}`,
  };
}

function readDateRange(
  window: RecurrenceExpansionWindow,
): Readonly<{ fromDate: Temporal.PlainDate; toDate: Temporal.PlainDate }> {
  let fromDate: Temporal.PlainDate;
  let toDate: Temporal.PlainDate;
  try {
    fromDate = parseCalendarDate(window.fromDate);
    toDate = parseCalendarDate(window.toDate);
  } catch {
    return invalidRange();
  }

  const rangeDays = fromDate.until(toDate, { largestUnit: "day" }).days;
  if (rangeDays <= 0) return invalidRange();
  if (rangeDays > maximumRecurrenceRangeDays) {
    throw new RecurrenceError(
      "RANGE_TOO_LARGE",
      "Recurrence expansion ranges may span up to 93 days.",
    );
  }
  return { fromDate, toDate };
}

function ensureSupportedDate(date: Temporal.PlainDate): void {
  if (date.year < 1 || date.year > 9999) return invalidSeries();
}

function addDateDays(date: Temporal.PlainDate, days: number): Temporal.PlainDate {
  try {
    const next = date.add({ days });
    ensureSupportedDate(next);
    return next;
  } catch (error) {
    if (error instanceof RecurrenceError) throw error;
    return invalidSeries();
  }
}

function checkCandidateBounds(
  firstDate: Temporal.PlainDate,
  candidateDate: Temporal.PlainDate,
  candidatesExamined: number,
): void {
  const daysFromFirst = firstDate.until(candidateDate, { largestUnit: "day" }).days;
  if (daysFromFirst >= maximumRecurrenceHorizonDays) {
    throw new RecurrenceError(
      "HORIZON_EXCEEDED",
      "The recurrence exceeds its 366-calendar-date horizon.",
    );
  }
  if (candidatesExamined >= maximumRecurrenceCandidates) {
    throw new RecurrenceError(
      "CANDIDATE_LIMIT_EXCEEDED",
      "The recurrence needs more than 366 candidate dates.",
    );
  }
}

type TimedSeriesState = Readonly<{
  series: TimedCalendarEvent;
  metadata: OccurrenceMetadata;
  startDateTime: Temporal.PlainDateTime;
  durationNanoseconds: number;
  foldPreference: "earlier" | "later";
}>;

function readTimedSeries(seriesValue: unknown): TimedSeriesState {
  const metadata = readMetadata(seriesValue);
  const series = seriesValue as TimedCalendarEvent;
  if (
    series.kind !== "timed" ||
    typeof series.startLocal !== "string" ||
    typeof series.endLocal !== "string" ||
    typeof series.timeZone !== "string" ||
    typeof series.startsAt !== "string" ||
    typeof series.endsAt !== "string"
  ) {
    return invalidSeries();
  }

  try {
    const timeZone = validateTimeZone(series.timeZone);
    const startResolution = inspectLocalDateTime(series.startLocal, timeZone);
    if (startResolution.kind === "gap") return invalidSeries();
    const initialInstant = Temporal.Instant.from(series.startsAt);
    let foldPreference: "earlier" | "later" = "earlier";
    if (startResolution.kind === "unique") {
      if (!initialInstant.equals(Temporal.Instant.from(startResolution.instant))) {
        return invalidSeries();
      }
    } else if (initialInstant.equals(Temporal.Instant.from(startResolution.earlier))) {
      foldPreference = "earlier";
    } else if (initialInstant.equals(Temporal.Instant.from(startResolution.later))) {
      foldPreference = "later";
    } else {
      return invalidSeries();
    }

    const endResolution = inspectLocalDateTime(series.endLocal, timeZone);
    if (endResolution.kind === "gap") return invalidSeries();
    const endInstant = Temporal.Instant.from(series.endsAt);
    const endMatches = endResolution.kind === "unique"
      ? endInstant.equals(Temporal.Instant.from(endResolution.instant))
      : endInstant.equals(Temporal.Instant.from(endResolution.earlier)) ||
        endInstant.equals(Temporal.Instant.from(endResolution.later));
    if (!endMatches || Temporal.Instant.compare(endInstant, initialInstant) <= 0) {
      return invalidSeries();
    }

    const durationNanosecondsBigInt = endInstant.epochNanoseconds - initialInstant.epochNanoseconds;
    const minimumDuration = BigInt(60) * BigInt(1_000_000_000);
    const maximumDuration = BigInt(maximumRecurringEventDurationDays) * BigInt(24) *
      BigInt(60) * BigInt(60) * BigInt(1_000_000_000);
    if (
      durationNanosecondsBigInt < minimumDuration ||
      durationNanosecondsBigInt > maximumDuration
    ) {
      return invalidSeries();
    }
    // Temporal DurationLike uses numeric units; the seven-day cap fits safely.
    const durationNanoseconds = Number(durationNanosecondsBigInt);
    if (!Number.isSafeInteger(durationNanoseconds)) return invalidSeries();

    const startDateTime = Temporal.PlainDateTime.from(series.startLocal, { overflow: "reject" });
    ensureSupportedDate(startDateTime.toPlainDate());
    return {
      series,
      metadata,
      startDateTime,
      durationNanoseconds,
      foldPreference,
    };
  } catch {
    return invalidSeries();
  }
}

function resolveCandidateStart(
  localDateTime: Temporal.PlainDateTime,
  timeZone: string,
  foldPreference: "earlier" | "later",
): Temporal.Instant | null {
  let resolution;
  try {
    resolution = inspectLocalDateTime(localDateTime.toString({ smallestUnit: "minute" }), timeZone);
  } catch {
    return invalidSeries();
  }
  if (resolution.kind === "gap") return null;
  if (resolution.kind === "unique") return Temporal.Instant.from(resolution.instant);
  return Temporal.Instant.from(resolution[foldPreference]);
}

function formatLocalDateTime(localDateTime: Temporal.PlainDateTime): string {
  if (localDateTime.millisecond !== 0 ||
      localDateTime.microsecond !== 0 ||
      localDateTime.nanosecond !== 0) {
    return localDateTime.toString({ smallestUnit: "nanosecond" });
  }
  if (localDateTime.second !== 0) {
    return localDateTime.toString({ smallestUnit: "second" });
  }
  return localDateTime.toString({ smallestUnit: "minute" });
}

function makeTimedOccurrence(
  state: TimedSeriesState,
  localStart: Temporal.PlainDateTime,
  instantStart: Temporal.Instant,
  instantEnd: Temporal.Instant,
  localEnd: string,
): TimedCalendarOccurrence {
  const localStartString = localStart.toString({ smallestUnit: "minute" });
  return {
    ...makeMetadata(state.metadata, localStartString),
    kind: "timed",
    startLocal: localStartString,
    endLocal: localEnd,
    timeZone: state.series.timeZone,
    startsAt: instantStart.toString(),
    endsAt: instantEnd.toString(),
  };
}

function expandTimedSeries(
  seriesValue: unknown,
  rule: RecurrenceRule,
  window: RecurrenceExpansionWindow,
): readonly TimedCalendarOccurrence[] {
  const state = readTimedSeries(seriesValue);
  if (typeof window.timeZone !== "string") return invalidRange();

  let rangeBounds: ReturnType<typeof resolveCalendarRange>;
  try {
    rangeBounds = resolveCalendarRange(window.fromDate, window.toDate, window.timeZone);
  } catch (error) {
    if (error instanceof CalendarTimeError && error.code === "DATE_RANGE_TOO_LARGE") {
      throw new RecurrenceError(
        "RANGE_TOO_LARGE",
        "Recurrence expansion ranges may span up to 93 days.",
      );
    }
    return invalidRange();
  }

  const rangeStart = Temporal.Instant.from(rangeBounds.startsAt);
  const rangeEnd = Temporal.Instant.from(rangeBounds.endsAt);
  const occurrences: TimedCalendarOccurrence[] = [];
  let candidateDate = state.startDateTime.toPlainDate();
  let candidatesExamined = 0;
  let emitted = 0;

  while (emitted < rule.count) {
    checkCandidateBounds(state.startDateTime.toPlainDate(), candidateDate, candidatesExamined);
    candidatesExamined += 1;
    const localStart = candidateDate.toPlainDateTime(state.startDateTime.toPlainTime());
    const instantStart = resolveCandidateStart(localStart, state.series.timeZone, state.foldPreference);
    if (instantStart !== null) {
      if (emitted >= maximumRecurrenceCandidates) {
        throw new RecurrenceError(
          "OCCURRENCE_LIMIT_EXCEEDED",
          "The recurrence emits more than 366 instances.",
        );
      }
      emitted += 1;
      const instantEnd = instantStart.add({ nanoseconds: state.durationNanoseconds });
      const localEndDateTime = instantEnd.toZonedDateTimeISO(state.series.timeZone)
        .toPlainDateTime();
      ensureSupportedDate(localEndDateTime.toPlainDate());
      const localEnd = formatLocalDateTime(localEndDateTime);
      if (Temporal.Instant.compare(instantStart, rangeEnd) < 0 &&
          Temporal.Instant.compare(instantEnd, rangeStart) > 0) {
        occurrences.push(makeTimedOccurrence(state, localStart, instantStart, instantEnd, localEnd));
      }
    }

    if (emitted < rule.count) {
      const stepDays = rule.frequency === "daily" ? rule.interval : rule.interval * 7;
      candidateDate = addDateDays(candidateDate, stepDays);
    }
  }

  return occurrences;
}

type AllDaySeriesState = Readonly<{
  series: AllDayCalendarEvent;
  metadata: OccurrenceMetadata;
  startDate: Temporal.PlainDate;
  durationDays: number;
}>;

function readAllDaySeries(seriesValue: unknown): AllDaySeriesState {
  const metadata = readMetadata(seriesValue);
  const series = seriesValue as AllDayCalendarEvent;
  if (
    series.kind !== "all-day" ||
    typeof series.startDate !== "string" ||
    typeof series.endDate !== "string"
  ) {
    return invalidSeries();
  }
  try {
    const startDate = parseCalendarDate(series.startDate);
    const endDate = parseCalendarDate(series.endDate);
    const durationDays = startDate.until(endDate, { largestUnit: "day" }).days;
    if (durationDays < 1 || durationDays > maximumRecurringEventDurationDays) {
      return invalidSeries();
    }
    return { series, metadata, startDate, durationDays };
  } catch {
    return invalidSeries();
  }
}

function makeAllDayOccurrence(
  state: AllDaySeriesState,
  startDate: Temporal.PlainDate,
): AllDayCalendarOccurrence {
  const endDate = addDateDays(startDate, state.durationDays);
  const startDateString = startDate.toString();
  return {
    ...makeMetadata(state.metadata, startDateString),
    kind: "all-day",
    startDate: startDateString,
    endDate: endDate.toString(),
  };
}

function expandAllDaySeries(
  seriesValue: unknown,
  rule: RecurrenceRule,
  range: Readonly<{ fromDate: Temporal.PlainDate; toDate: Temporal.PlainDate }>,
): readonly AllDayCalendarOccurrence[] {
  const state = readAllDaySeries(seriesValue);
  const occurrences: AllDayCalendarOccurrence[] = [];
  let candidateDate = state.startDate;
  let candidatesExamined = 0;
  let emitted = 0;

  while (emitted < rule.count) {
    checkCandidateBounds(state.startDate, candidateDate, candidatesExamined);
    candidatesExamined += 1;
    if (emitted >= maximumRecurrenceCandidates) {
      throw new RecurrenceError(
        "OCCURRENCE_LIMIT_EXCEEDED",
        "The recurrence emits more than 366 instances.",
      );
    }
    emitted += 1;

    const occurrence = makeAllDayOccurrence(state, candidateDate);
    const occurrenceStart = parseCalendarDate(occurrence.startDate);
    const occurrenceEnd = parseCalendarDate(occurrence.endDate);
    if (
      Temporal.PlainDate.compare(occurrenceStart, range.toDate) < 0 &&
      Temporal.PlainDate.compare(occurrenceEnd, range.fromDate) > 0
    ) {
      occurrences.push(occurrence);
    }

    if (emitted < rule.count) {
      const stepDays = rule.frequency === "daily" ? rule.interval : rule.interval * 7;
      candidateDate = addDateDays(candidateDate, stepDays);
    }
  }

  return occurrences;
}

/**
 * Expand a finite series into only the occurrences overlapping a validated
 * half-open date window. All bounds are checked before results are returned.
 */
export function expandCalendarRecurrence(
  seriesValue: CalendarEvent,
  ruleValue: unknown,
  windowValue: unknown,
): readonly CalendarRecurrenceOccurrence[] {
  const rule = normalizeRecurrenceRule(ruleValue);
  const window = readWindow(windowValue);
  const range = readDateRange(window);
  if (seriesValue === null || typeof seriesValue !== "object") return invalidSeries();

  if (seriesValue.kind === "timed") {
    try {
      validateTimeZone(seriesValue.timeZone);
    } catch {
      return invalidSeries();
    }
    return expandTimedSeries(seriesValue, rule, window);
  }
  if (seriesValue.kind === "all-day") {
    if (window.timeZone !== undefined) {
      try {
        validateTimeZone(window.timeZone);
      } catch {
        return invalidRange();
      }
    }
    return expandAllDaySeries(seriesValue, rule, range);
  }
  return invalidSeries();
}
