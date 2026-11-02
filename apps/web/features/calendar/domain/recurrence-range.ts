import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEvent } from "./types.ts";
import {
  expandCalendarRecurrence,
  maximumRecurrenceRangeDays,
  maximumRecurrenceHorizonDays,
  maximumRecurringEventDurationDays,
  type CalendarRecurrenceOccurrence,
  type RecurrenceRule,
} from "./recurrence.ts";
import { parseCalendarDate } from "./time.ts";

export const maximumRecurrenceReadWindowDays =
  maximumRecurrenceHorizonDays + maximumRecurringEventDurationDays;

export type CalendarRecurrenceReadRange = Readonly<{
  fromDate: string;
  toDate: string;
  timeZone?: string;
}>;

/**
 * Expand a bounded read window that can be wider than the recurrence engine's
 * 93-day slice. The 373-day cap bounds this request; it is not a promise that
 * an entire series fits in a window when viewed in a different time zone.
 * Each slice is all-or-error; results are returned only after every slice
 * succeeds and overlapping boundary instances are de-duplicated.
 */
export function expandCalendarRecurrenceRange(
  series: CalendarEvent,
  rule: RecurrenceRule,
  range: CalendarRecurrenceReadRange,
  onCandidate?: () => void,
): readonly CalendarRecurrenceOccurrence[] {
  const fromDate = parseCalendarDate(range.fromDate);
  const toDate = parseCalendarDate(range.toDate);
  const spanDays = fromDate.until(toDate, { largestUnit: "day" }).days;
  if (spanDays <= 0 || spanDays > maximumRecurrenceReadWindowDays) {
    throw new RangeError(
      `Recurrence read ranges must span 1 to ${maximumRecurrenceReadWindowDays} dates.`,
    );
  }
  if (series.kind === "timed" && typeof range.timeZone !== "string") {
    throw new RangeError("Timed recurrence reads require a calendar time zone.");
  }

  const byKey = new Map<string, CalendarRecurrenceOccurrence>();
  let cursor = fromDate;
  while (Temporal.PlainDate.compare(cursor, toDate) < 0) {
    const afterSlice = cursor.add({ days: maximumRecurrenceRangeDays });
    const sliceEnd = Temporal.PlainDate.compare(afterSlice, toDate) < 0
      ? afterSlice
      : toDate;
    const occurrences = expandCalendarRecurrence(series, rule, {
      fromDate: cursor.toString(),
      toDate: sliceEnd.toString(),
      ...(range.timeZone === undefined ? {} : { timeZone: range.timeZone }),
    }, onCandidate);

    for (const occurrence of occurrences) {
      byKey.set(occurrence.occurrenceKey, occurrence);
      if (byKey.size > 366) {
        throw new RangeError("A recurrence read cannot return more than 366 occurrences.");
      }
    }
    cursor = sliceEnd;
  }

  return [...byKey.values()].sort((left, right) => {
    const leftStart = left.kind === "timed" ? left.startsAt : left.startDate;
    const rightStart = right.kind === "timed" ? right.startsAt : right.startDate;
    return leftStart.localeCompare(rightStart)
      || left.occurrenceKey.localeCompare(right.occurrenceKey);
  });
}
