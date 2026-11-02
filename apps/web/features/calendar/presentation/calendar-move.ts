import { Temporal } from "@js-temporal/polyfill";
import { inspectLocalDateTime, parseCalendarDate } from "../domain/time.ts";
import type { CalendarEvent } from "../domain/types";
import { buildEventDraft, type EventDraft } from "./calendar-model.ts";

export const calendarMoveSnapMinutes = 15;
const minutesPerDay = 24 * 60;

export type CalendarMoveResult =
  | Readonly<{ ok: true; draft: EventDraft; timeZone: string }>
  | Readonly<{ ok: false; message: string }>;

export function calendarMinuteAtPointer(
  clientY: number,
  trackTop: number,
  trackHeight: number,
  dayDurationMinutes = minutesPerDay,
): number | null {
  if (!Number.isFinite(clientY) || !Number.isFinite(trackTop)
    || !Number.isFinite(trackHeight) || trackHeight <= 0
    || !Number.isFinite(dayDurationMinutes)
    || dayDurationMinutes < calendarMoveSnapMinutes) {
    return null;
  }

  const relativeMinute = ((clientY - trackTop) / trackHeight) * dayDurationMinutes;
  const snapped = Math.round(relativeMinute / calendarMoveSnapMinutes) * calendarMoveSnapMinutes;
  const finalSlot = Math.floor((dayDurationMinutes - calendarMoveSnapMinutes) / calendarMoveSnapMinutes)
    * calendarMoveSnapMinutes;
  return Math.min(finalSlot, Math.max(0, snapped));
}

function localMinute(date: Temporal.PlainDate, minute: number): string {
  return date.toPlainDateTime({
    hour: Math.floor(minute / 60),
    minute: minute % 60,
  }).toString({ smallestUnit: "minute" });
}

function disambiguationFor(
  local: string,
  timeZone: string,
  instant: Temporal.Instant,
): "" | "earlier" | "later" {
  const resolution = inspectLocalDateTime(local, timeZone);
  if (resolution.kind !== "ambiguous") return "";
  return Temporal.Instant.compare(Temporal.Instant.from(resolution.earlier), instant) === 0
    ? "earlier"
    : "later";
}

export function moveCalendarEventDraft(
  event: CalendarEvent,
  targetDateValue: string,
  targetMinute: number | null,
  calendarTimeZone: string,
): CalendarMoveResult {
  if (event.recurrenceRule) {
    return {
      ok: false,
      message: "Open the repeating series to review a series move.",
    };
  }

  let targetDate: Temporal.PlainDate;
  try {
    targetDate = parseCalendarDate(targetDateValue);
  } catch {
    return { ok: false, message: "Choose a valid calendar date for this move." };
  }

  const draft = buildEventDraft(event);
  if (event.kind === "all-day") {
    const startDate = Temporal.PlainDate.from(event.startDate);
    const shiftDays = startDate.until(targetDate, { largestUnit: "day" }).days;
    return {
      ok: true,
      timeZone: event.reminderTimeZone ?? calendarTimeZone,
      draft: {
        ...draft,
        startDate: targetDate.toString(),
        endDate: Temporal.PlainDate.from(event.endDate).add({ days: shiftDays }).toString(),
      },
    };
  }

  let movedStart: Temporal.Instant;
  if (targetMinute === null) {
    const currentVisibleStart = Temporal.Instant.from(event.startsAt)
      .toZonedDateTimeISO(calendarTimeZone);
    const visibleMinute = currentVisibleStart.hour * 60 + currentVisibleStart.minute;
    const movedStartLocalInCalendarZone = localMinute(targetDate, visibleMinute);
    const startResolution = inspectLocalDateTime(movedStartLocalInCalendarZone, calendarTimeZone);
    if (startResolution.kind === "gap") {
      return {
        ok: false,
        message: `That time does not exist in ${calendarTimeZone} because the clocks move forward. Open the event editor to choose another time.`,
      };
    }
    if (startResolution.kind === "ambiguous") {
      return {
        ok: false,
        message: `That time occurs twice in ${calendarTimeZone}. Open the event editor to choose an occurrence.`,
      };
    }
    movedStart = Temporal.Instant.from(startResolution.instant);
  } else {
    if (!Number.isInteger(targetMinute) || targetMinute < 0) {
      return { ok: false, message: "Choose a valid time for this move." };
    }
    let dayStart: Temporal.Instant;
    let dayEnd: Temporal.Instant;
    try {
      dayStart = targetDate.toZonedDateTime(calendarTimeZone).toInstant();
      dayEnd = targetDate.add({ days: 1 }).toZonedDateTime(calendarTimeZone).toInstant();
    } catch {
      return { ok: false, message: "Choose a valid calendar time zone before moving this event." };
    }
    const dayDurationMinutes = Number(dayEnd.epochMilliseconds - dayStart.epochMilliseconds) / 60_000;
    const finalSlot = Math.floor((dayDurationMinutes - calendarMoveSnapMinutes) / calendarMoveSnapMinutes)
      * calendarMoveSnapMinutes;
    const snappedMinute = Math.min(
      finalSlot,
      Math.max(0, Math.round(targetMinute / calendarMoveSnapMinutes) * calendarMoveSnapMinutes),
    );
    movedStart = dayStart.add({ minutes: snappedMinute });
  }

  const originalStart = Temporal.Instant.from(event.startsAt);
  const originalEnd = Temporal.Instant.from(event.endsAt);
  if (Temporal.Instant.compare(originalEnd, originalStart) <= 0) {
    return { ok: false, message: "This event has an invalid duration and cannot be moved." };
  }

  const duration = originalStart.until(originalEnd, { largestUnit: "hour" });
  const movedEnd = movedStart.add(duration);
  const movedStartLocal = movedStart.toZonedDateTimeISO(event.timeZone)
    .toPlainDateTime().toString({ smallestUnit: "minute" });
  const movedEndLocal = movedEnd.toZonedDateTimeISO(event.timeZone)
    .toPlainDateTime().toString({ smallestUnit: "minute" });

  return {
    ok: true,
    timeZone: event.timeZone,
    draft: {
      ...draft,
      startLocal: movedStartLocal,
      endLocal: movedEndLocal,
      startDisambiguation: disambiguationFor(movedStartLocal, event.timeZone, movedStart),
      endDisambiguation: disambiguationFor(movedEndLocal, event.timeZone, movedEnd),
    },
  };
}
