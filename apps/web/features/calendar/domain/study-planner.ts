import { Temporal } from "@js-temporal/polyfill";
import {
  inspectLocalDateTime,
  parseCalendarDate,
  validateTimeZone,
} from "./time.ts";
import type { CalendarEventEntry } from "./types";

const maximumPlanningDays = 60;
const maximumStudyMinutes = 10_080;
const quarterHourTimePattern = /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/u;

export type StudyPlannerInput = Readonly<{
  topic: string;
  totalMinutes: number;
  sessionMinutes: number;
  startDate: string;
  deadline: string;
  dayStart: string;
  dayEnd: string;
  timeZone: string;
  weekdays: readonly number[];
  eventBufferMinutes: number;
  sessionBreakMinutes: number;
}>;

export type StudyPlannerField =
  | "topic"
  | "totalMinutes"
  | "sessionMinutes"
  | "startDate"
  | "deadline"
  | "dayStart"
  | "dayEnd"
  | "eventBufferMinutes"
  | "sessionBreakMinutes"
  | "weekdays"
  | "timeZone";

export type StudyPlanSession = Readonly<{
  id: string;
  date: string;
  title: string;
  startLocal: string;
  endLocal: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  durationMinutes: number;
  startDisambiguation?: "earlier" | "later";
  endDisambiguation?: "earlier" | "later";
}>;

export type StudyPlanSkippedDate = Readonly<{
  date: string;
  reason: "clock-change";
}>;

export type StudyPlan = Readonly<{
  title: string;
  timeZone: string;
  requestedMinutes: number;
  plannedMinutes: number;
  unscheduledMinutes: number;
  sessions: readonly StudyPlanSession[];
  skippedDates: readonly StudyPlanSkippedDate[];
}>;

export class StudyPlannerError extends Error {
  readonly code: "INVALID_PLAN" | "INVALID_EVENT";

  constructor(message: string, code: "INVALID_PLAN" | "INVALID_EVENT") {
    super(message);
    this.name = "StudyPlannerError";
    this.code = code;
  }
}

type Interval = Readonly<{ start: Temporal.Instant; end: Temporal.Instant }>;
type DayAvailability = { date: string; intervals: Interval[] };

function invalidPlan(message: string): never {
  throw new StudyPlannerError(message, "INVALID_PLAN");
}

function isValidMultiple(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max && value % 15 === 0;
}

function localDateTime(date: string, time: string): string {
  return `${date}T${time}`;
}

function resolveWindowBoundary(
  local: string,
  timeZone: string,
  edge: "start" | "end",
): Temporal.Instant | null {
  const resolution = inspectLocalDateTime(local, timeZone);
  if (resolution.kind === "gap") return null;
  if (resolution.kind === "unique") return Temporal.Instant.from(resolution.instant);
  return Temporal.Instant.from(edge === "start" ? resolution.earlier : resolution.later);
}

function instantForAllDayBoundary(date: string, timeZone: string): Temporal.Instant {
  try {
    return parseCalendarDate(date).toZonedDateTime(timeZone).toInstant();
  } catch {
    throw new StudyPlannerError("A saved all-day event has an invalid date.", "INVALID_EVENT");
  }
}

function eventInterval(
  event: CalendarEventEntry,
  timeZone: string,
  eventBufferMinutes: number,
): Interval {
  try {
    if (event.kind === "all-day") {
      return {
        start: instantForAllDayBoundary(event.startDate, timeZone),
        end: instantForAllDayBoundary(event.endDate, timeZone),
      };
    }
    const buffer = eventBufferMinutes;
    return {
      start: Temporal.Instant.from(event.startsAt).subtract({ minutes: buffer }),
      end: Temporal.Instant.from(event.endsAt).add({ minutes: buffer }),
    };
  } catch (reason) {
    if (reason instanceof StudyPlannerError) throw reason;
    throw new StudyPlannerError("A saved calendar event has an invalid time.", "INVALID_EVENT");
  }
}

function compareIntervals(left: Interval, right: Interval): number {
  return Temporal.Instant.compare(left.start, right.start)
    || Temporal.Instant.compare(left.end, right.end);
}

function getFreeIntervals(
  start: Temporal.Instant,
  end: Temporal.Instant,
  events: readonly Interval[],
): Interval[] {
  const ordered = events
    .filter((event) => Temporal.Instant.compare(event.start, end) < 0
      && Temporal.Instant.compare(event.end, start) > 0)
    .sort(compareIntervals);
  const free: Interval[] = [];
  let cursor = start;
  for (const event of ordered) {
    const busyStart = Temporal.Instant.compare(event.start, start) < 0 ? start : event.start;
    const busyEnd = Temporal.Instant.compare(event.end, end) > 0 ? end : event.end;
    if (Temporal.Instant.compare(cursor, busyStart) < 0) free.push({ start: cursor, end: busyStart });
    if (Temporal.Instant.compare(busyEnd, cursor) > 0) cursor = busyEnd;
    if (Temporal.Instant.compare(cursor, end) >= 0) break;
  }
  if (Temporal.Instant.compare(cursor, end) < 0) free.push({ start: cursor, end });
  return free;
}

function nextQuarterHourAtOrAfter(
  candidate: Temporal.Instant,
  timeZone: string,
  notBefore: Temporal.Instant,
): Temporal.Instant | null {
  let local = candidate.toZonedDateTimeISO(timeZone).toPlainDateTime()
    .with({ second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 });
  const remainder = local.minute % 15;
  if (remainder !== 0 || candidate.epochNanoseconds !== candidate.round({ smallestUnit: "minute" }).epochNanoseconds) {
    local = local.add({ minutes: remainder === 0 ? 15 : 15 - remainder });
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const localText = local.toString({ smallestUnit: "minute" });
    const resolution = inspectLocalDateTime(localText, timeZone);
    if (resolution.kind === "gap") {
      local = local.add({ minutes: 15 });
      continue;
    }
    const choices = resolution.kind === "unique"
      ? [Temporal.Instant.from(resolution.instant)]
      : [Temporal.Instant.from(resolution.earlier), Temporal.Instant.from(resolution.later)];
    const chosen = choices.find((instant) => Temporal.Instant.compare(instant, notBefore) >= 0);
    if (chosen) return chosen;
    local = local.add({ minutes: 15 });
  }
  return null;
}

function disambiguationFor(
  local: string,
  timeZone: string,
  instant: Temporal.Instant,
): "earlier" | "later" | undefined {
  const resolution = inspectLocalDateTime(local, timeZone);
  if (resolution.kind !== "ambiguous") return undefined;
  return Temporal.Instant.compare(Temporal.Instant.from(resolution.earlier), instant) === 0
    ? "earlier"
    : "later";
}

function makeSession(
  topic: string,
  date: string,
  start: Temporal.Instant,
  durationMinutes: number,
  timeZone: string,
): StudyPlanSession {
  const end = start.add({ minutes: durationMinutes });
  const startLocal = start.toZonedDateTimeISO(timeZone).toPlainDateTime()
    .toString({ smallestUnit: "minute" });
  const endLocal = end.toZonedDateTimeISO(timeZone).toPlainDateTime()
    .toString({ smallestUnit: "minute" });
  const startDisambiguation = disambiguationFor(startLocal, timeZone, start);
  const endDisambiguation = disambiguationFor(endLocal, timeZone, end);
  return {
    id: `${start.epochNanoseconds.toString()}:${durationMinutes}`,
    date,
    title: `Study: ${topic}`,
    startLocal,
    endLocal,
    startsAt: start.toString(),
    endsAt: end.toString(),
    timeZone,
    durationMinutes,
    ...(startDisambiguation ? { startDisambiguation } : {}),
    ...(endDisambiguation ? { endDisambiguation } : {}),
  };
}

export function studyPlannerInputErrors(
  input: StudyPlannerInput,
): Partial<Record<StudyPlannerField, string>> {
  const errors: Partial<Record<StudyPlannerField, string>> = {};
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  if (!topic || topic.length > 153 || /[\u0000-\u001f\u007f]/u.test(topic)) {
    errors.topic = "Enter a topic of 1 to 153 characters without control characters.";
  }
  if (!isValidMultiple(input.totalMinutes, 15, maximumStudyMinutes)) {
    errors.totalMinutes = "Use 15-minute increments from 15 to 10,080 minutes.";
  }
  if (!isValidMultiple(input.sessionMinutes, 15, 180)) {
    errors.sessionMinutes = "Use 15-minute increments from 15 to 180 minutes.";
  }
  if (!isValidMultiple(input.eventBufferMinutes, 0, 60)) {
    errors.eventBufferMinutes = "Use 15-minute increments from 0 to 60 minutes.";
  }
  if (!isValidMultiple(input.sessionBreakMinutes, 0, 60)) {
    errors.sessionBreakMinutes = "Use 15-minute increments from 0 to 60 minutes.";
  }
  if (!quarterHourTimePattern.test(input.dayStart)) {
    errors.dayStart = "Choose a start time on a 15-minute boundary.";
  }
  if (!quarterHourTimePattern.test(input.dayEnd)) {
    errors.dayEnd = "Choose an end time on a 15-minute boundary.";
  } else if (quarterHourTimePattern.test(input.dayStart) && input.dayStart >= input.dayEnd) {
    errors.dayEnd = "Choose an end time after the start time.";
  }

  let start: Temporal.PlainDate | null = null;
  let deadline: Temporal.PlainDate | null = null;
  try {
    start = parseCalendarDate(input.startDate);
  } catch {
    errors.startDate = "Choose a valid start date.";
  }
  try {
    deadline = parseCalendarDate(input.deadline);
  } catch {
    errors.deadline = "Choose a valid deadline.";
  }
  if (start && deadline) {
    const span = start.until(deadline, { largestUnit: "day" }).days;
    if (span < 0 || span >= maximumPlanningDays) {
      errors.deadline = "Choose a deadline on or after the start date and within 59 days.";
    }
  }

  try {
    validateTimeZone(input.timeZone);
  } catch {
    errors.timeZone = "The saved calendar time zone is invalid. Update calendar settings before planning.";
  }

  const weekdayValues = Array.isArray(input.weekdays) ? input.weekdays : [];
  const selectedDays = new Set(weekdayValues);
  if (selectedDays.size === 0
    || selectedDays.size !== weekdayValues.length
    || [...selectedDays].some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    errors.weekdays = "Select one or more available weekdays.";
  }
  return errors;
}

function validateInput(input: StudyPlannerInput): Readonly<{
  topic: string;
  timeZone: string;
  start: Temporal.PlainDate;
  deadline: Temporal.PlainDate;
}> {
  const errors = studyPlannerInputErrors(input);
  if (Object.keys(errors).length > 0) invalidPlan(Object.values(errors)[0]!);
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const timeZone = validateTimeZone(input.timeZone);
  const start = parseCalendarDate(input.startDate);
  const deadline = parseCalendarDate(input.deadline);
  const span = start.until(deadline, { largestUnit: "day" }).days;
  if (span < 0 || span >= maximumPlanningDays) {
    invalidPlan("Choose a deadline from the start date through 59 days later.");
  }
  const weekdays = new Set(input.weekdays);
  if (weekdays.size === 0 || [...weekdays].some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    invalidPlan("Select at least one valid weekday.");
  }
  return { topic, timeZone, start, deadline };
}

export function planStudyTime(
  input: StudyPlannerInput,
  events: readonly CalendarEventEntry[],
): StudyPlan {
  const { topic, timeZone, start, deadline } = validateInput(input);
  const busy = events.map((event) => eventInterval(event, timeZone, input.eventBufferMinutes));
  const weekdays = new Set(input.weekdays);
  const days: DayAvailability[] = [];
  const skippedDates: StudyPlanSkippedDate[] = [];

  for (let date = start; Temporal.PlainDate.compare(date, deadline) <= 0; date = date.add({ days: 1 })) {
    if (!weekdays.has(date.dayOfWeek)) continue;
    const dateText = date.toString();
    const dayStart = resolveWindowBoundary(localDateTime(dateText, input.dayStart), timeZone, "start");
    const dayEnd = resolveWindowBoundary(localDateTime(dateText, input.dayEnd), timeZone, "end");
    if (!dayStart || !dayEnd) {
      skippedDates.push({ date: dateText, reason: "clock-change" });
      continue;
    }
    if (Temporal.Instant.compare(dayStart, dayEnd) >= 0) {
      skippedDates.push({ date: dateText, reason: "clock-change" });
      continue;
    }
    days.push({ date: dateText, intervals: getFreeIntervals(dayStart, dayEnd, busy) });
  }

  const requestedSessions = Math.ceil(input.totalMinutes / input.sessionMinutes);
  let remainingMinutes = input.totalMinutes;
  const sessions: StudyPlanSession[] = [];
  for (let index = 0; index < requestedSessions && remainingMinutes > 0; index += 1) {
    const durationMinutes = Math.min(input.sessionMinutes, remainingMinutes);
    const idealDayIndex = Math.min(
      days.length - 1,
      Math.floor((index + 0.5) * days.length / requestedSessions),
    );
    const candidates = days
      .map((day, dayIndex) => ({ day, dayIndex }))
      .sort((left, right) => Math.abs(left.dayIndex - idealDayIndex) - Math.abs(right.dayIndex - idealDayIndex)
        || left.dayIndex - right.dayIndex);

    let placed: Readonly<{ day: DayAvailability; session: StudyPlanSession; intervalIndex: number }> | null = null;
    for (const { day } of candidates) {
      for (let intervalIndex = 0; intervalIndex < day.intervals.length; intervalIndex += 1) {
        const interval = day.intervals[intervalIndex];
        const notBefore = interval.start;
        const slotStart = nextQuarterHourAtOrAfter(interval.start, timeZone, notBefore);
        if (!slotStart) continue;
        const slotEnd = slotStart.add({ minutes: durationMinutes });
        if (Temporal.Instant.compare(slotEnd, interval.end) > 0) continue;
        placed = {
          day,
          intervalIndex,
          session: makeSession(topic, day.date, slotStart, durationMinutes, timeZone),
        };
        break;
      }
      if (placed) break;
    }
    if (!placed) break;

    sessions.push(placed.session);
    remainingMinutes -= durationMinutes;
    const oldInterval = placed.day.intervals[placed.intervalIndex];
    const nextStart = placed.session.endsAt
      ? Temporal.Instant.from(placed.session.endsAt).add({ minutes: input.sessionBreakMinutes })
      : oldInterval.end;
    const updated: Interval[] = [];
    if (Temporal.Instant.compare(nextStart, oldInterval.end) < 0) {
      updated.push({ start: nextStart, end: oldInterval.end });
    }
    placed.day.intervals.splice(placed.intervalIndex, 1, ...updated);
  }

  const plannedMinutes = sessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  return {
    title: `Study: ${topic}`,
    timeZone,
    requestedMinutes: input.totalMinutes,
    plannedMinutes,
    unscheduledMinutes: input.totalMinutes - plannedMinutes,
    sessions,
    skippedDates,
  };
}
