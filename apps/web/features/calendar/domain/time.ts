import { Temporal } from "@js-temporal/polyfill";

const calendarDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localMinutePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const maximumCalendarRangeDays = 93;

export type LocalTimeResolution =
  | Readonly<{ kind: "unique"; instant: string }>
  | Readonly<{ kind: "ambiguous"; earlier: string; later: string }>
  | Readonly<{ kind: "gap" }>;

export class CalendarTimeError extends Error {
  constructor(
    code:
      | "INVALID_DATE"
      | "INVALID_LOCAL_TIME"
      | "INVALID_TIME_ZONE"
      | "NONEXISTENT_LOCAL_TIME"
      | "AMBIGUOUS_LOCAL_TIME"
      | "INVALID_DATE_RANGE"
      | "DATE_RANGE_TOO_LARGE"
      | "INVALID_EVENT_DURATION",
    message: string,
  ) {
    super(message);
    this.name = "CalendarTimeError";
    this.code = code;
  }

  readonly code:
    | "INVALID_DATE"
    | "INVALID_LOCAL_TIME"
    | "INVALID_TIME_ZONE"
    | "NONEXISTENT_LOCAL_TIME"
    | "AMBIGUOUS_LOCAL_TIME"
    | "INVALID_DATE_RANGE"
    | "DATE_RANGE_TOO_LARGE"
    | "INVALID_EVENT_DURATION";
}

export function parseCalendarDate(value: unknown): Temporal.PlainDate {
  if (typeof value !== "string" || !calendarDatePattern.test(value)) {
    throw new CalendarTimeError("INVALID_DATE", "Use a valid YYYY-MM-DD date.");
  }

  try {
    const date = Temporal.PlainDate.from(value, { overflow: "reject" });
    if (date.year < 1 || date.year > 9999 || date.toString() !== value) {
      throw new RangeError("Unsupported calendar date");
    }
    return date;
  } catch {
    throw new CalendarTimeError("INVALID_DATE", "Use a valid YYYY-MM-DD date.");
  }
}

export function validateTimeZone(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 100 ||
    /^[+-]\d{2}(?::?\d{2})?$/.test(value)
  ) {
    throw new CalendarTimeError("INVALID_TIME_ZONE", "Choose a valid time zone.");
  }

  try {
    Temporal.Now.zonedDateTimeISO(value);
    return value;
  } catch {
    throw new CalendarTimeError("INVALID_TIME_ZONE", "Choose a valid time zone.");
  }
}

export function calendarToday(
  timeZoneValue: unknown,
  now: Temporal.Instant = Temporal.Now.instant(),
): string {
  const timeZone = validateTimeZone(timeZoneValue);
  return now.toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function inspectLocalDateTime(
  value: unknown,
  timeZoneValue: unknown,
): LocalTimeResolution {
  if (typeof value !== "string" || !localMinutePattern.test(value)) {
    throw new CalendarTimeError(
      "INVALID_LOCAL_TIME",
      "Use a valid local date and time.",
    );
  }

  const timeZone = validateTimeZone(timeZoneValue);
  let local: Temporal.PlainDateTime;
  try {
    local = Temporal.PlainDateTime.from(value, { overflow: "reject" });
    if (local.year < 1 || local.year > 9999) throw new RangeError("Unsupported calendar date");
  } catch {
    throw new CalendarTimeError(
      "INVALID_LOCAL_TIME",
      "Use a valid local date and time.",
    );
  }

  const earlier = local.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  const later = local.toZonedDateTime(timeZone, { disambiguation: "later" });
  const earlierMatches = earlier.toPlainDateTime().equals(local);
  const laterMatches = later.toPlainDateTime().equals(local);

  if (!earlierMatches && !laterMatches) return { kind: "gap" };
  if (earlierMatches && laterMatches && !earlier.toInstant().equals(later.toInstant())) {
    return {
      kind: "ambiguous",
      earlier: earlier.toInstant().toString(),
      later: later.toInstant().toString(),
    };
  }

  const instant = earlierMatches ? earlier.toInstant() : later.toInstant();
  return { kind: "unique", instant: instant.toString() };
}

export function resolveLocalDateTime(
  value: unknown,
  timeZone: unknown,
  disambiguation?: "earlier" | "later",
): Readonly<{ local: string; instant: string; timeZone: string }> {
  const resolution = inspectLocalDateTime(value, timeZone);

  if (resolution.kind === "gap") {
    throw new CalendarTimeError(
      "NONEXISTENT_LOCAL_TIME",
      "That local time does not occur because the clocks change. Choose another time.",
    );
  }

  if (resolution.kind === "ambiguous" && !disambiguation) {
    throw new CalendarTimeError(
      "AMBIGUOUS_LOCAL_TIME",
      "That local time occurs twice. Choose the earlier or later occurrence.",
    );
  }

  const instant = resolution.kind === "unique"
    ? resolution.instant
    : disambiguation === "later"
      ? resolution.later
      : resolution.earlier;

  return {
    local: value as string,
    instant,
    timeZone: validateTimeZone(timeZone),
  };
}

export function resolveCalendarRange(
  fromValue: unknown,
  toValue: unknown,
  timeZoneValue: unknown,
): Readonly<{ fromDate: string; toDate: string; startsAt: string; endsAt: string }> {
  const fromDate = parseCalendarDate(fromValue);
  const toDate = parseCalendarDate(toValue);
  const timeZone = validateTimeZone(timeZoneValue);
  const rangeDays = fromDate.until(toDate, { largestUnit: "day" }).days;

  if (rangeDays <= 0) {
    throw new CalendarTimeError("INVALID_DATE_RANGE", "Choose an increasing date range.");
  }
  if (rangeDays > maximumCalendarRangeDays) {
    throw new CalendarTimeError(
      "DATE_RANGE_TOO_LARGE",
      "Calendar requests may span up to 93 days.",
    );
  }

  const startsAt = fromDate.toZonedDateTime(timeZone).toInstant();
  const endsAt = toDate.toZonedDateTime(timeZone).toInstant();
  return {
    fromDate: fromDate.toString(),
    toDate: toDate.toString(),
    startsAt: startsAt.toString(),
    endsAt: endsAt.toString(),
  };
}

export function resolveAllDayRange(
  startValue: unknown,
  endValue: unknown,
): Readonly<{ startDate: string; endDate: string }> {
  const startDate = parseCalendarDate(startValue);
  const endDate = parseCalendarDate(endValue);

  if (Temporal.PlainDate.compare(startDate, endDate) >= 0) {
    throw new CalendarTimeError(
      "INVALID_DATE_RANGE",
      "The end date must be after the start date.",
    );
  }

  return { startDate: startDate.toString(), endDate: endDate.toString() };
}

export function resolveTimedDuration(startInstantValue: string, endInstantValue: string): void {
  const startsAt = Temporal.Instant.from(startInstantValue);
  const endsAt = Temporal.Instant.from(endInstantValue);
  const duration = endsAt.epochNanoseconds - startsAt.epochNanoseconds;
  const minimum = BigInt(60) * BigInt(1_000_000_000);
  const maximum = BigInt(366) * BigInt(24) * BigInt(60) * BigInt(60) * BigInt(1_000_000_000);

  if (duration < minimum || duration > maximum) {
    throw new CalendarTimeError(
      "INVALID_EVENT_DURATION",
      "Timed events must last at least one minute and no more than 366 days.",
    );
  }
}
