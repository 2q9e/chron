import { Temporal } from "@js-temporal/polyfill";
import {
  CalendarTimeError,
  inspectLocalDateTime,
  parseCalendarDate,
  resolveAllDayRange,
  resolveLocalDateTime,
  resolveTimedDuration,
} from "../domain/time.ts";
import type {
  CalendarEvent,
  CalendarEventEntry,
  CalendarEventCategory,
  CalendarEventMutation,
  CalendarPreferences,
  CalendarRecurrenceRule,
  CalendarSeriesOccurrenceSnapshot,
  CreateAllDayCalendarEvent,
  CreateTimedCalendarEvent,
} from "../domain/types";
import { defaultStudyPlannerDefaults, type StudyPlanSession } from "../domain/study-planner.ts";
import {
  allDayCalendarReminderChoices,
  scheduleCalendarReminder,
  timedCalendarReminderChoices,
  type AllDayCalendarReminderChoice,
  type TimedCalendarReminderChoice,
} from "../domain/reminders.ts";
import { calendarEventCategories } from "../domain/types.ts";

export type CalendarView = "day" | "week" | "month" | "agenda";
export type CalendarRange = Readonly<{ from: string; to: string }>;
export const monthCellVisibleEventLimit = 2;

export function splitMonthCellEvents(
  events: readonly CalendarEventEntry[],
): Readonly<{
  visible: readonly CalendarEventEntry[];
  overflow: readonly CalendarEventEntry[];
}> {
  return {
    visible: events.slice(0, monthCellVisibleEventLimit),
    overflow: events.slice(monthCellVisibleEventLimit),
  };
}

export type EventDraft = Readonly<{
  kind: "timed" | "all-day";
  title: string;
  details: string;
  category?: CalendarEventCategory | null;
  initialCategory?: CalendarEventCategory | null;
  categoryEdited: boolean;
  startLocal: string;
  endLocal: string;
  startDate: string;
  endDate: string;
  startDisambiguation: "" | "earlier" | "later";
  endDisambiguation: "" | "earlier" | "later";
  repeatFrequency: "" | "daily" | "weekly";
  repeatInterval: string;
  repeatCount: string;
  reminderChoice: TimedCalendarReminderChoice | AllDayCalendarReminderChoice;
}>;

export type EventDraftField =
  | "title"
  | "details"
  | "category"
  | "startLocal"
  | "endLocal"
  | "startDate"
  | "endDate"
  | "startDisambiguation"
  | "endDisambiguation"
  | "repeatFrequency"
  | "repeatInterval"
  | "repeatCount"
  | "reminderChoice";

export type EventDraftValidation =
  | Readonly<{ ok: true; mutation: CalendarEventMutation }>
  | Readonly<{ ok: false; errors: Partial<Record<EventDraftField, string>> }>;

export type CalendarEventDraftReview =
  | Readonly<{
      ok: true;
      mutation: CalendarEventMutation;
      recurrenceRule: CalendarRecurrenceRule | null;
    }>
  | Readonly<{ ok: false; errors: Partial<Record<EventDraftField, string>> }>;

const agendaDays = 30;
const millisecondsPerHour = 60 * 60 * 1000;
const rowHeightRem = 2.75;
const minimumTimedEventHeightRem = 1.8;
const minimumTimedEventDurationMs = (minimumTimedEventHeightRem / rowHeightRem) * millisecondsPerHour;

export function localToday(): string {
  return Temporal.Now.plainDateISO().toString();
}

export function dateFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return parseCalendarDate(value).toString();
  } catch {
    return null;
  }
}

export function isCalendarView(value: string | null): value is CalendarView {
  return value === "day" || value === "week" || value === "month" || value === "agenda";
}

export function localTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

export function localeWeekStart(locale: string): number {
  try {
    const intlLocale = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
    };
    const firstDay = intlLocale.getWeekInfo?.().firstDay;
    return typeof firstDay === "number" ? firstDay % 7 : 1;
  } catch {
    return 1;
  }
}

export function defaultPreferences(
  timeZone: string,
  weekStartsOn: number,
): CalendarPreferences {
  return {
    theme: "pink-liquid-glass",
    accentColor: null,
    density: "comfortable",
    reduceMotion: false,
    weekStartsOn,
    timeZone,
    studyPlanner: defaultStudyPlannerDefaults,
  };
}

export function rebaseCalendarPreferenceDraft(
  draft: CalendarPreferences,
  previousSaved: CalendarPreferences,
  latestSaved: CalendarPreferences,
): CalendarPreferences {
  return {
    ...latestSaved,
    theme: draft.theme === previousSaved.theme ? latestSaved.theme : draft.theme,
    accentColor: draft.accentColor === previousSaved.accentColor ? latestSaved.accentColor : draft.accentColor,
    density: draft.density === previousSaved.density ? latestSaved.density : draft.density,
    reduceMotion: draft.reduceMotion === previousSaved.reduceMotion ? latestSaved.reduceMotion : draft.reduceMotion,
    weekStartsOn: draft.weekStartsOn === previousSaved.weekStartsOn ? latestSaved.weekStartsOn : draft.weekStartsOn,
    timeZone: draft.timeZone === previousSaved.timeZone ? latestSaved.timeZone : draft.timeZone,
    studyPlanner: latestSaved.studyPlanner,
  };
}

function date(value: string): Temporal.PlainDate {
  return parseCalendarDate(value);
}

function sundayIndex(value: Temporal.PlainDate): number {
  return value.dayOfWeek % 7;
}

export function startOfWeek(value: string, weekStartsOn: number): Temporal.PlainDate {
  const selected = date(value);
  const offset = (sundayIndex(selected) - weekStartsOn + 7) % 7;
  return selected.subtract({ days: offset });
}

export function monthGrid(value: string, weekStartsOn: number): Readonly<{
  month: Temporal.PlainDate;
  first: Temporal.PlainDate;
  afterLast: Temporal.PlainDate;
  days: readonly Temporal.PlainDate[];
  rows: number;
}> {
  const month = date(value).with({ day: 1 });
  const daysInMonth = month.daysInMonth;
  const offset = (sundayIndex(month) - weekStartsOn + 7) % 7;
  const rows = Math.ceil((offset + daysInMonth) / 7);
  const first = month.subtract({ days: offset });
  const afterLast = first.add({ days: rows * 7 });
  const days = Array.from({ length: rows * 7 }, (_, index) => first.add({ days: index }));
  return { month, first, afterLast, days, rows };
}

export function visibleRange(
  view: CalendarView,
  selectedDate: string,
  weekStartsOn: number,
): CalendarRange {
  const selected = date(selectedDate);
  if (view === "day") {
    return { from: selected.toString(), to: selected.add({ days: 1 }).toString() };
  }
  if (view === "week") {
    const first = startOfWeek(selectedDate, weekStartsOn);
    return { from: first.toString(), to: first.add({ days: 7 }).toString() };
  }
  if (view === "month") {
    const grid = monthGrid(selectedDate, weekStartsOn);
    return { from: grid.first.toString(), to: grid.afterLast.toString() };
  }
  return { from: selected.toString(), to: selected.add({ days: agendaDays }).toString() };
}

export function navigateDate(
  selectedDate: string,
  view: CalendarView,
  direction: -1 | 1,
): string {
  const selected = date(selectedDate);
  if (view === "day") return selected.add({ days: direction }).toString();
  if (view === "week") return selected.add({ days: 7 * direction }).toString();
  if (view === "agenda") return selected.add({ days: agendaDays * direction }).toString();
  return selected.with({ day: 1 }).add({ months: direction }).toString();
}

export function formatDateOnly(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return date(value).toLocaleString(locale, options);
}

export function formatInstant(
  value: string,
  timeZone: string,
  locale: string,
  withZone = false,
): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(withZone ? { timeZoneName: "short" as const } : {}),
    timeZone,
  }).format(new Date(value));
}

export function displayDateForInstant(value: string, timeZone: string): string {
  return Temporal.Instant.from(value).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function eventOccursOnDate(
  event: CalendarEventEntry,
  selectedDate: string,
  timeZone: string,
): boolean {
  const selected = date(selectedDate);
  if (event.kind === "all-day") {
    return event.startDate <= selectedDate && selectedDate < event.endDate;
  }

  const dayStart = selected.toZonedDateTime(timeZone).toInstant();
  const nextDayStart = selected.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  const eventStart = Temporal.Instant.from(event.startsAt);
  const eventEnd = Temporal.Instant.from(event.endsAt);
  return Temporal.Instant.compare(eventStart, nextDayStart) < 0
    && Temporal.Instant.compare(eventEnd, dayStart) > 0;
}

export function sortCalendarEvents(events: readonly CalendarEventEntry[]): CalendarEventEntry[] {
  return [...events].sort((left, right) => {
    const leftDate = left.kind === "all-day" ? left.startDate : left.startsAt;
    const rightDate = right.kind === "all-day" ? right.startDate : right.startsAt;
    return leftDate.localeCompare(rightDate)
      || left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
      || left.id.localeCompare(right.id);
  });
}

export function eventsOnDate(
  events: readonly CalendarEventEntry[],
  selectedDate: string,
  timeZone: string,
): CalendarEventEntry[] {
  return sortCalendarEvents(events.filter((event) =>
    eventOccursOnDate(event, selectedDate, timeZone)
  ));
}

export function buildEventDraft(
  event: CalendarEvent,
): EventDraft {
  if (event.kind === "all-day") {
    return {
      kind: "all-day",
      title: event.title,
      details: event.details ?? "",
      category: event.category,
      initialCategory: event.category,
      categoryEdited: false,
      startLocal: "",
      endLocal: "",
      startDate: event.startDate,
      endDate: event.endDate,
      startDisambiguation: "",
      endDisambiguation: "",
      repeatFrequency: event.recurrenceRule?.frequency ?? "",
      repeatInterval: String(event.recurrenceRule?.interval ?? 1),
      repeatCount: String(event.recurrenceRule?.count ?? 2),
      reminderChoice: event.reminderChoice ?? "none",
    };
  }

  const startLocal = Temporal.Instant.from(event.startsAt)
    .toZonedDateTimeISO(event.timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
  const endLocal = Temporal.Instant.from(event.endsAt)
    .toZonedDateTimeISO(event.timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
  const startResolution = inspectLocalDateTime(startLocal, event.timeZone);
  const endResolution = inspectLocalDateTime(endLocal, event.timeZone);
  const startDisambiguation = startResolution.kind === "ambiguous"
    ? (startResolution.earlier === event.startsAt ? "earlier" : "later")
    : "";
  const endDisambiguation = endResolution.kind === "ambiguous"
    ? (endResolution.earlier === event.endsAt ? "earlier" : "later")
    : "";

  return {
    kind: "timed",
    title: event.title,
    details: event.details ?? "",
    category: event.category,
    initialCategory: event.category,
    categoryEdited: false,
    startLocal,
    endLocal,
    startDate: "",
    endDate: "",
    startDisambiguation,
    endDisambiguation,
    repeatFrequency: event.recurrenceRule?.frequency ?? "",
    repeatInterval: String(event.recurrenceRule?.interval ?? 1),
    repeatCount: String(event.recurrenceRule?.count ?? 2),
    reminderChoice: event.reminderChoice ?? "none",
  };
}

export function newEventDraft(selectedDate: string): EventDraft {
  return {
    kind: "timed",
    title: "",
    details: "",
    category: null,
    initialCategory: null,
    categoryEdited: false,
    startLocal: `${selectedDate}T09:00`,
    endLocal: `${selectedDate}T10:00`,
    startDate: selectedDate,
    endDate: date(selectedDate).add({ days: 1 }).toString(),
    startDisambiguation: "",
    endDisambiguation: "",
    repeatFrequency: "",
    repeatInterval: "1",
    repeatCount: "2",
    reminderChoice: "none",
  };
}

export function buildStudySessionEventDraft(
  draft: EventDraft,
  session: StudyPlanSession,
  eventCategoriesAvailable: boolean,
): EventDraft {
  return {
    ...draft,
    title: session.title,
    ...(eventCategoriesAvailable ? { category: "study", categoryEdited: true } : {}),
    startLocal: session.startLocal,
    endLocal: session.endLocal,
    startDisambiguation: session.startDisambiguation ?? "",
    endDisambiguation: session.endDisambiguation ?? "",
  };
}

export function newEventDraftAtTimeSlot(
  selectedDate: string,
  elapsedMinutes: number,
  timeZone: string,
): EventDraft | null {
  if (!Number.isInteger(elapsedMinutes) || elapsedMinutes < 0
    || elapsedMinutes % 15 !== 0) return null;

  try {
    const dateValue = parseCalendarDate(selectedDate);
    const startOfDay = dateValue.toZonedDateTime(timeZone).toInstant();
    const endOfDay = dateValue.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
    const dayMinutes = Number(endOfDay.epochMilliseconds - startOfDay.epochMilliseconds) / 60_000;
    if (elapsedMinutes >= dayMinutes) return null;

    const startInstant = startOfDay.add({ minutes: elapsedMinutes });
    const endInstant = startInstant.add({ minutes: 60 });
    const startLocal = startInstant.toZonedDateTimeISO(timeZone)
      .toPlainDateTime().toString({ smallestUnit: "minute" });
    const endLocal = endInstant.toZonedDateTimeISO(timeZone)
      .toPlainDateTime().toString({ smallestUnit: "minute" });
    const disambiguationFor = (
      local: string,
      instant: Temporal.Instant,
    ): "" | "earlier" | "later" => {
      const resolution = inspectLocalDateTime(local, timeZone);
      if (resolution.kind !== "ambiguous") return "";
      return Temporal.Instant.compare(
        Temporal.Instant.from(resolution.earlier),
        instant,
      ) === 0 ? "earlier" : "later";
    };

    return {
      ...newEventDraft(dateValue.toString()),
      startLocal,
      endLocal,
      startDisambiguation: disambiguationFor(startLocal, startInstant),
      endDisambiguation: disambiguationFor(endLocal, endInstant),
    };
  } catch {
    return null;
  }
}

export function updateEventDraft(
  draft: EventDraft,
  field: keyof EventDraft,
  value: string,
): EventDraft {
  if (field === "kind") {
    if (value !== "timed" && value !== "all-day") return draft;
    if (value === draft.kind) return draft;
    return { ...draft, kind: value, reminderChoice: "none" };
  }
  if (field === "category") {
    if (value === "") return { ...draft, category: null, categoryEdited: true };
    if (value === "__preserve") {
      return {
        ...draft,
        category: draft.initialCategory,
        categoryEdited: false,
      };
    }
    return calendarEventCategories.includes(value as CalendarEventCategory)
      ? { ...draft, category: value as CalendarEventCategory, categoryEdited: true }
      : draft;
  }
  return { ...draft, [field]: value };
}

export function validateCalendarEventDraft(
  draft: EventDraft,
  timeZone: string,
  minimumRepeatCount = 2,
): CalendarEventDraftReview {
  const event = validateEventDraft(draft, timeZone);
  if (!event.ok) return event;
  if (!draft.repeatFrequency) {
    return { ok: true, mutation: event.mutation, recurrenceRule: null };
  }

  const errors: Partial<Record<EventDraftField, string>> = {};
  const interval = Number(draft.repeatInterval);
  const count = Number(draft.repeatCount);
  if (!Number.isInteger(interval) || interval < 1 || interval > 4) {
    errors.repeatInterval = "Choose an interval from 1 to 4.";
  }
  if (!Number.isInteger(count) || count < minimumRepeatCount || count > 366) {
    errors.repeatCount = `Choose between ${minimumRepeatCount} and 366 occurrences.`;
  }
  const stepDays = draft.repeatFrequency === "weekly" ? 7 : 1;
  if (Number.isInteger(interval) && Number.isInteger(count)
    && interval >= 1 && interval <= 4 && count >= minimumRepeatCount && count <= 366
    && (count - 1) * interval * stepDays > 365) {
    errors.repeatCount = "Repeating events must end within 366 calendar dates.";
  }

  const maximumDurationNanoseconds = BigInt(7) * BigInt(24) * BigInt(60)
    * BigInt(60) * BigInt(1_000_000_000);
  if (event.mutation.kind === "all-day") {
    const duration = Temporal.PlainDate.from(event.mutation.startDate)
      .until(Temporal.PlainDate.from(event.mutation.endDate), { largestUnit: "day" }).days;
    if (duration > 7) errors.repeatFrequency = "Repeating all-day events may last up to 7 days.";
  } else {
    const start = resolveLocalDateTime(
      event.mutation.startLocal,
      event.mutation.timeZone,
      event.mutation.startDisambiguation,
    );
    const end = resolveLocalDateTime(
      event.mutation.endLocal,
      event.mutation.timeZone,
      event.mutation.endDisambiguation,
    );
    const duration = Temporal.Instant.from(end.instant).epochNanoseconds
      - Temporal.Instant.from(start.instant).epochNanoseconds;
    if (duration > maximumDurationNanoseconds) {
      errors.repeatFrequency = "Repeating timed events may last up to 7 days.";
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    mutation: event.mutation,
    recurrenceRule: {
      frequency: draft.repeatFrequency,
      interval: interval as CalendarRecurrenceRule["interval"],
      count,
    },
  };
}

export function validateEventDraft(
  draft: EventDraft,
  timeZone: string,
): EventDraftValidation {
  const errors: Partial<Record<EventDraftField, string>> = {};
  const title = draft.title.trim();
  if (!title) errors.title = "Enter an event title.";
  if (title.length > 160) errors.title = "Event titles can be up to 160 characters.";
  if (draft.details.length > 4000) errors.details = "Details can be up to 4,000 characters.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  try {
    if (draft.kind === "all-day") {
      if (!allDayCalendarReminderChoices.includes(
        draft.reminderChoice as AllDayCalendarReminderChoice,
      )) {
        return { ok: false, errors: { reminderChoice: "Choose a reminder for an all-day event." } };
      }
      const range = resolveAllDayRange(draft.startDate, draft.endDate);
      const reminderChoice = draft.reminderChoice as AllDayCalendarReminderChoice;
      const mutation: CreateAllDayCalendarEvent = {
        kind: "all-day",
        title,
        ...(draft.categoryEdited && draft.category !== undefined ? { category: draft.category } : {}),
        ...(draft.details.trim() ? { details: draft.details.trim() } : {}),
        ...range,
        reminderChoice,
        ...(reminderChoice === "none" ? {} : { reminderTimeZone: timeZone }),
      };
      return { ok: true, mutation };
    }

    if (!timedCalendarReminderChoices.includes(
      draft.reminderChoice as TimedCalendarReminderChoice,
    )) {
      return { ok: false, errors: { reminderChoice: "Choose a reminder for a timed event." } };
    }

    const startResolution = inspectLocalDateTime(draft.startLocal, timeZone);
    const endResolution = inspectLocalDateTime(draft.endLocal, timeZone);
    if (startResolution.kind === "gap") {
      errors.startLocal = "This local time does not exist because the clocks move forward. Choose another time.";
    }
    if (endResolution.kind === "gap") {
      errors.endLocal = "This local time does not exist because the clocks move forward. Choose another time.";
    }
    if (startResolution.kind === "ambiguous" && !draft.startDisambiguation) {
      errors.startDisambiguation = "Choose the earlier or later occurrence of this repeated time.";
    }
    if (endResolution.kind === "ambiguous" && !draft.endDisambiguation) {
      errors.endDisambiguation = "Choose the earlier or later occurrence of this repeated time.";
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    const start = resolveLocalDateTime(
      draft.startLocal,
      timeZone,
      draft.startDisambiguation || undefined,
    );
    const end = resolveLocalDateTime(
      draft.endLocal,
      timeZone,
      draft.endDisambiguation || undefined,
    );
    try {
      resolveTimedDuration(start.instant, end.instant);
    } catch (error) {
      errors.endLocal = error instanceof CalendarTimeError
        ? error.message
        : "Choose an end time after the start time.";
      return { ok: false, errors };
    }

    const mutation: CreateTimedCalendarEvent = {
      kind: "timed",
      title,
      ...(draft.categoryEdited && draft.category !== undefined ? { category: draft.category } : {}),
      ...(draft.details.trim() ? { details: draft.details.trim() } : {}),
      startLocal: start.local,
      endLocal: end.local,
      timeZone: start.timeZone,
      reminderChoice: draft.reminderChoice as TimedCalendarReminderChoice,
      ...(draft.startDisambiguation ? { startDisambiguation: draft.startDisambiguation } : {}),
      ...(draft.endDisambiguation ? { endDisambiguation: draft.endDisambiguation } : {}),
    };
    return { ok: true, mutation };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review the event dates and times.";
    const field = draft.kind === "all-day" ? "startDate" : "startLocal";
    return { ok: false, errors: { [field]: message } };
  }
}

export function reminderReviewText(
  event: CalendarEventMutation,
  occurrence?: CalendarSeriesOccurrenceSnapshot,
): string {
  const reminderChoice = event.reminderChoice ?? "none";
  if (reminderChoice === "none") return "No email reminder.";

  const schedule = event.kind === "timed"
    ? (() => {
        const isMatchingOccurrence = occurrence?.kind === "timed";
        const startLocal = isMatchingOccurrence && occurrence.startLocal
          ? occurrence.startLocal
          : event.startLocal;
        const timeZone = isMatchingOccurrence && occurrence.timeZone
          ? occurrence.timeZone
          : event.timeZone;
        const startsAt = isMatchingOccurrence && occurrence.startsAt
          ? occurrence.startsAt
          : resolveLocalDateTime(startLocal, timeZone, event.startDisambiguation).instant;
        return scheduleCalendarReminder(
          reminderChoice as TimedCalendarReminderChoice,
          { occurrenceKey: occurrence?.occurrenceKey ?? "review", kind: "timed", startLocal, startsAt, timeZone },
        );
      })()
    : (() => {
        const isMatchingOccurrence = occurrence?.kind === "all-day";
        const startDate = isMatchingOccurrence && occurrence.startDate
          ? occurrence.startDate
          : event.startDate;
        const reminderTimeZone = event.reminderTimeZone;
        if (!reminderTimeZone) return null;
        return scheduleCalendarReminder(
          reminderChoice as AllDayCalendarReminderChoice,
          { occurrenceKey: occurrence?.occurrenceKey ?? "review", kind: "all-day", startDate },
          reminderTimeZone,
        );
      })();

  if (!schedule) return "No email reminder.";
  const formatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: schedule.timeZone,
  }).format(new Date(schedule.scheduledAt));
  return `Email reminder at ${formatted} (${schedule.timeZone}), sent to your verified email.`;
}

export type TimedEventSegment = Readonly<{
  event: Extract<CalendarEventEntry, { kind: "timed" }>;
  topRem: number;
  heightRem: number;
  leftPercent: number;
  widthPercent: number;
  startsOnDate: boolean;
  endsOnDate: boolean;
  endsAtMidnight: boolean;
  localStartLabel: string;
  timeZoneLabel: string;
}>;

type PositionedSegment = {
  event: Extract<CalendarEventEntry, { kind: "timed" }>;
  startMs: number;
  layoutEndMs: number;
  topRem: number;
  heightRem: number;
  startsOnDate: boolean;
  endsOnDate: boolean;
  endsAtMidnight: boolean;
  needsAccessibleFallback: boolean;
  localStartLabel: string;
  timeZoneLabel: string;
  lane: number;
  lanes: number;
};

export function timedEventSegmentsForDate(
  events: readonly CalendarEventEntry[],
  selectedDate: string,
  timeZone: string,
  locale: string,
): Readonly<{
  trackHeightRem: number;
  dayDurationMinutes: number;
  hourLabels: readonly string[];
  events: readonly TimedEventSegment[];
  belowTrackEvents: readonly TimedEventSegment[];
}> {
  const selected = date(selectedDate);
  const startOfDay = selected.toZonedDateTime(timeZone).toInstant();
  const startOfNextDay = selected.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  const dayStartMs = Number(startOfDay.epochMilliseconds);
  const dayEndMs = Number(startOfNextDay.epochMilliseconds);
  const durationHours = (dayEndMs - dayStartMs) / millisecondsPerHour;
  const dayDurationMinutes = Math.round(durationHours * 60);
  const trackHeightRem = durationHours * rowHeightRem;
  const hourLabels: string[] = [];
  for (let hour = 0; hour < durationHours; hour += 1) {
    hourLabels.push(new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      timeZone,
      timeZoneName: "short",
    }).format(new Date(dayStartMs + hour * millisecondsPerHour)));
  }

  const positioned: PositionedSegment[] = [];
  for (const event of events) {
    if (event.kind !== "timed") continue;
    const eventStartMs = Number(Temporal.Instant.from(event.startsAt).epochMilliseconds);
    const eventEndMs = Number(Temporal.Instant.from(event.endsAt).epochMilliseconds);
    const startMs = Math.max(eventStartMs, dayStartMs);
    const endMs = Math.min(eventEndMs, dayEndMs);
    if (endMs <= startMs) continue;
    const layoutEndMs = Math.min(dayEndMs, Math.max(endMs, startMs + minimumTimedEventDurationMs));
    const topRem = ((startMs - dayStartMs) / millisecondsPerHour) * rowHeightRem;
    const heightRem = ((layoutEndMs - startMs) / millisecondsPerHour) * rowHeightRem;
    const startZoned = Temporal.Instant.from(event.startsAt).toZonedDateTimeISO(timeZone);
    positioned.push({
      event,
      startMs,
      layoutEndMs,
      topRem,
      heightRem,
      startsOnDate: eventStartMs >= dayStartMs,
      endsOnDate: eventEndMs <= dayEndMs,
      endsAtMidnight: eventEndMs === dayEndMs,
      needsAccessibleFallback: heightRem < minimumTimedEventHeightRem,
      localStartLabel: startZoned.toPlainTime().toLocaleString(locale, { hour: "numeric", minute: "2-digit" }),
      timeZoneLabel: new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
        .format(new Date(startMs)),
      lane: 0,
      lanes: 1,
    });
  }

  positioned.sort((left, right) => left.startMs - right.startMs
    || right.layoutEndMs - left.layoutEndMs
    || left.event.id.localeCompare(right.event.id));

  let cluster: PositionedSegment[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const assignCluster = () => {
    const laneEnds: number[] = [];
    for (const segment of cluster) {
      let lane = laneEnds.findIndex((endMs) => endMs <= segment.startMs);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(segment.layoutEndMs);
      } else {
        laneEnds[lane] = segment.layoutEndMs;
      }
      segment.lane = lane;
    }
    for (const segment of cluster) segment.lanes = laneEnds.length;
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const segment of positioned) {
    if (segment.needsAccessibleFallback) continue;
    if (cluster.length > 0 && segment.startMs >= clusterEnd) assignCluster();
    cluster.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.layoutEndMs);
  }
  if (cluster.length > 0) assignCluster();

  const segments = positioned.map((segment) => ({
    event: segment.event,
    topRem: segment.topRem,
    heightRem: segment.heightRem,
    leftPercent: (segment.lane / segment.lanes) * 100,
    widthPercent: 100 / segment.lanes,
    startsOnDate: segment.startsOnDate,
    endsOnDate: segment.endsOnDate,
    endsAtMidnight: segment.endsAtMidnight,
    localStartLabel: segment.localStartLabel,
    timeZoneLabel: segment.timeZoneLabel,
  }));

  return {
    trackHeightRem,
    dayDurationMinutes,
    hourLabels,
    events: segments.filter((segment) => segment.heightRem >= minimumTimedEventHeightRem),
    belowTrackEvents: segments.filter((segment) => segment.heightRem < minimumTimedEventHeightRem),
  };
}

export function allDayEventsForDate(
  events: readonly CalendarEventEntry[],
  selectedDate: string,
): readonly CalendarEventEntry[] {
  return sortCalendarEvents(events.filter((event) =>
    event.kind === "all-day"
      && event.startDate <= selectedDate
      && selectedDate < event.endDate
  ));
}

export function formatRangeHeading(
  view: CalendarView,
  selectedDate: string,
  weekStartsOn: number,
  locale: string,
): string {
  const selected = date(selectedDate);
  if (view === "day") {
    return selected.toLocaleString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (view === "month") return selected.toLocaleString(locale, { month: "long", year: "numeric" });
  if (view === "week") {
    const first = startOfWeek(selectedDate, weekStartsOn);
    const last = first.add({ days: 6 });
    const firstText = first.toLocaleString(locale, { month: "short", day: "numeric" });
    const lastText = last.toLocaleString(locale, { month: first.month === last.month ? undefined : "short", day: "numeric", year: "numeric" });
    return `${firstText} – ${lastText}`;
  }
  const last = selected.add({ days: agendaDays - 1 });
  const firstText = selected.toLocaleString(locale, { month: "short", day: "numeric" });
  const lastText = last.toLocaleString(locale, { month: selected.month === last.month ? undefined : "short", day: "numeric", year: "numeric" });
  return `Next 30 days · ${firstText} – ${lastText}`;
}
