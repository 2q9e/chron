import { Temporal } from "@js-temporal/polyfill";
import {
  CalendarTimeError,
  inspectLocalDateTime,
  parseCalendarDate,
  resolveAllDayRange,
  resolveLocalDateTime,
  resolveTimedDuration,
} from "../domain/time";
import type {
  CalendarEvent,
  CalendarEventMutation,
  CalendarPreferences,
  CreateAllDayCalendarEvent,
  CreateTimedCalendarEvent,
  TimedCalendarEvent,
} from "../domain/types";

export type CalendarView = "day" | "week" | "month" | "agenda";
export type CalendarRange = Readonly<{ from: string; to: string }>;

export type EventDraft = Readonly<{
  kind: "timed" | "all-day";
  title: string;
  details: string;
  startLocal: string;
  endLocal: string;
  startDate: string;
  endDate: string;
  startDisambiguation: "" | "earlier" | "later";
  endDisambiguation: "" | "earlier" | "later";
}>;

export type EventDraftField =
  | "title"
  | "details"
  | "startLocal"
  | "endLocal"
  | "startDate"
  | "endDate"
  | "startDisambiguation"
  | "endDisambiguation";

export type EventDraftValidation =
  | Readonly<{ ok: true; mutation: CalendarEventMutation }>
  | Readonly<{ ok: false; errors: Partial<Record<EventDraftField, string>> }>;

const agendaDays = 30;
const millisecondsPerHour = 60 * 60 * 1000;
const rowHeightRem = 2.75;

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
    density: "comfortable",
    weekStartsOn,
    timeZone,
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
  event: CalendarEvent,
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

export function sortCalendarEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((left, right) => {
    const leftDate = left.kind === "all-day" ? left.startDate : left.startsAt;
    const rightDate = right.kind === "all-day" ? right.startDate : right.startsAt;
    return leftDate.localeCompare(rightDate)
      || left.title.localeCompare(right.title, undefined, { sensitivity: "base" })
      || left.id.localeCompare(right.id);
  });
}

export function eventsOnDate(
  events: readonly CalendarEvent[],
  selectedDate: string,
  timeZone: string,
): CalendarEvent[] {
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
      startLocal: "",
      endLocal: "",
      startDate: event.startDate,
      endDate: event.endDate,
      startDisambiguation: "",
      endDisambiguation: "",
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
    startLocal,
    endLocal,
    startDate: "",
    endDate: "",
    startDisambiguation,
    endDisambiguation,
  };
}

export function newEventDraft(selectedDate: string): EventDraft {
  return {
    kind: "timed",
    title: "",
    details: "",
    startLocal: `${selectedDate}T09:00`,
    endLocal: `${selectedDate}T10:00`,
    startDate: selectedDate,
    endDate: date(selectedDate).add({ days: 1 }).toString(),
    startDisambiguation: "",
    endDisambiguation: "",
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
      const range = resolveAllDayRange(draft.startDate, draft.endDate);
      const mutation: CreateAllDayCalendarEvent = {
        kind: "all-day",
        title,
        ...(draft.details.trim() ? { details: draft.details.trim() } : {}),
        ...range,
      };
      return { ok: true, mutation };
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
      ...(draft.details.trim() ? { details: draft.details.trim() } : {}),
      startLocal: start.local,
      endLocal: end.local,
      timeZone: start.timeZone,
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

export type TimedEventSegment = Readonly<{
  event: TimedCalendarEvent;
  topRem: number;
  heightRem: number;
  leftPercent: number;
  widthPercent: number;
  startsOnDate: boolean;
  endsOnDate: boolean;
  localStartLabel: string;
  timeZoneLabel: string;
}>;

type PositionedSegment = {
  event: TimedCalendarEvent;
  startMs: number;
  endMs: number;
  topRem: number;
  heightRem: number;
  startsOnDate: boolean;
  endsOnDate: boolean;
  localStartLabel: string;
  timeZoneLabel: string;
  lane: number;
  lanes: number;
};

export function timedEventSegmentsForDate(
  events: readonly CalendarEvent[],
  selectedDate: string,
  timeZone: string,
  locale: string,
): Readonly<{ trackHeightRem: number; hourLabels: readonly string[]; events: readonly TimedEventSegment[] }> {
  const selected = date(selectedDate);
  const startOfDay = selected.toZonedDateTime(timeZone).toInstant();
  const startOfNextDay = selected.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  const dayStartMs = Number(startOfDay.epochMilliseconds);
  const dayEndMs = Number(startOfNextDay.epochMilliseconds);
  const durationHours = (dayEndMs - dayStartMs) / millisecondsPerHour;
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
    const startMs = Math.max(Number(Temporal.Instant.from(event.startsAt).epochMilliseconds), dayStartMs);
    const endMs = Math.min(Number(Temporal.Instant.from(event.endsAt).epochMilliseconds), dayEndMs);
    if (endMs <= startMs) continue;
    const startZoned = Temporal.Instant.from(event.startsAt).toZonedDateTimeISO(timeZone);
    positioned.push({
      event,
      startMs,
      endMs,
      topRem: ((startMs - dayStartMs) / millisecondsPerHour) * rowHeightRem,
      heightRem: Math.max(((endMs - startMs) / millisecondsPerHour) * rowHeightRem, 1.8),
      startsOnDate: Number(Temporal.Instant.from(event.startsAt).epochMilliseconds) >= dayStartMs,
      endsOnDate: Number(Temporal.Instant.from(event.endsAt).epochMilliseconds) <= dayEndMs,
      localStartLabel: startZoned.toPlainTime().toLocaleString(locale, { hour: "numeric", minute: "2-digit" }),
      timeZoneLabel: new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
        .format(new Date(startMs)),
      lane: 0,
      lanes: 1,
    });
  }

  positioned.sort((left, right) => left.startMs - right.startMs
    || right.endMs - left.endMs
    || left.event.id.localeCompare(right.event.id));

  let cluster: PositionedSegment[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const assignCluster = () => {
    const laneEnds: number[] = [];
    for (const segment of cluster) {
      let lane = laneEnds.findIndex((endMs) => endMs <= segment.startMs);
      if (lane < 0) {
        lane = laneEnds.length;
        laneEnds.push(segment.endMs);
      } else {
        laneEnds[lane] = segment.endMs;
      }
      segment.lane = lane;
    }
    for (const segment of cluster) segment.lanes = laneEnds.length;
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const segment of positioned) {
    if (cluster.length > 0 && segment.startMs >= clusterEnd) assignCluster();
    cluster.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.endMs);
  }
  if (cluster.length > 0) assignCluster();

  return {
    trackHeightRem,
    hourLabels,
    events: positioned.map((segment) => ({
      event: segment.event,
      topRem: segment.topRem,
      heightRem: segment.heightRem,
      leftPercent: (segment.lane / segment.lanes) * 100,
      widthPercent: 100 / segment.lanes,
      startsOnDate: segment.startsOnDate,
      endsOnDate: segment.endsOnDate,
      localStartLabel: segment.localStartLabel,
      timeZoneLabel: segment.timeZoneLabel,
    })),
  };
}

export function allDayEventsForDate(
  events: readonly CalendarEvent[],
  selectedDate: string,
): readonly CalendarEvent[] {
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
