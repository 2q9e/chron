import { Temporal } from "@js-temporal/polyfill";
import type {
  CalendarEvent,
  CalendarRecurrenceRule,
} from "../domain/types.ts";
import {
  normalizeRecurrenceRule,
  type CalendarRecurrenceOccurrence,
} from "../domain/recurrence.ts";
import { expandCalendarRecurrenceRange } from "../domain/recurrence-range.ts";
import { parseCalendarDate, validateTimeZone } from "../domain/time.ts";

export const maximumSeriesProposalConflicts = 32;
export const maximumSeriesProposalExpandedOccurrences = 50_000;
const maximumRecurringInstanceDurationLookback = 9 * 24 * 60 * 60 * 1000;

export type CalendarSeriesOccurrenceConflict = Readonly<{
  candidateOccurrenceKey: string;
  conflictingEventId: string;
  conflictingEventRevision: number;
  conflictingTitle: string;
  conflictingOccurrence: Readonly<{
    occurrenceKey: string;
    kind: "timed" | "all-day";
    startLocal?: string;
    endLocal?: string;
    timeZone?: string;
    startsAt?: string;
    endsAt?: string;
    startDate?: string;
    endDate?: string;
  }>;
}>;

type OccurrenceInterval = Readonly<{
  occurrence: CalendarRecurrenceOccurrence;
  start: number;
  end: number;
}>;

function recurrenceStartDate(series: CalendarEvent): Temporal.PlainDate {
  return series.kind === "all-day"
    ? parseCalendarDate(series.startDate)
    : Temporal.PlainDateTime.from(series.startLocal, { overflow: "reject" }).toPlainDate();
}

/** Expand all finite occurrences; the count and horizon caps make this bounded. */
export function expandFullCalendarSeries(
  series: CalendarEvent,
  ruleValue: CalendarRecurrenceRule,
): readonly CalendarRecurrenceOccurrence[] {
  const rule = normalizeRecurrenceRule(ruleValue);
  const startDate = recurrenceStartDate(series);
  const stepDays = rule.frequency === "daily" ? rule.interval : rule.interval * 7;
  const lastCandidateDate = startDate.add({ days: (rule.count - 1) * stepDays });
  const range = {
    fromDate: startDate.toString(),
    // Recurrences are keyed by their local start date; one day past the last
    // candidate includes it even when its event duration crosses another date.
    toDate: lastCandidateDate.add({ days: 1 }).toString(),
    ...(series.kind === "timed" ? { timeZone: validateTimeZone(series.timeZone) } : {}),
  };
  return expandCalendarRecurrenceRange(series, rule, range);
}

function singleEventOccurrence(event: CalendarEvent): CalendarRecurrenceOccurrence {
  const metadata = {
    seriesId: event.id,
    occurrenceKey: `${event.id}:single`,
    title: event.title,
    details: event.details,
    revision: event.revision,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
  if (event.kind === "timed") {
    return {
      ...metadata,
      kind: "timed",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      timeZone: event.timeZone,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    };
  }
  return {
    ...metadata,
    kind: "all-day",
    startDate: event.startDate,
    endDate: event.endDate,
  };
}

function instantMilliseconds(value: string): number {
  const result = Temporal.Instant.from(value).epochMilliseconds;
  if (!Number.isFinite(result)) throw new RangeError("Calendar occurrence instant is invalid.");
  return result;
}

function occurrenceInterval(
  occurrence: CalendarRecurrenceOccurrence,
  calendarTimeZone: string,
): OccurrenceInterval {
  if (occurrence.kind === "timed") {
    const start = instantMilliseconds(occurrence.startsAt);
    const end = instantMilliseconds(occurrence.endsAt);
    if (end <= start) throw new RangeError("Calendar occurrence has invalid timed bounds.");
    return { occurrence, start, end };
  }

  const startDate = parseCalendarDate(occurrence.startDate);
  const endDate = parseCalendarDate(occurrence.endDate);
  if (Temporal.PlainDate.compare(endDate, startDate) <= 0) {
    throw new RangeError("Calendar occurrence has invalid date bounds.");
  }
  return {
    occurrence,
    start: startDate.toZonedDateTime(calendarTimeZone).toInstant().epochMilliseconds,
    end: endDate.toZonedDateTime(calendarTimeZone).toInstant().epochMilliseconds,
  };
}

export function occurrenceOverlapsCalendarInterval(
  occurrence: CalendarRecurrenceOccurrence,
  interval: Readonly<{ startsAt: string; endsAt: string }>,
  calendarTimeZoneValue: string,
): boolean {
  const calendarTimeZone = validateTimeZone(calendarTimeZoneValue);
  const candidateStart = instantMilliseconds(interval.startsAt);
  const candidateEnd = instantMilliseconds(interval.endsAt);
  if (candidateEnd <= candidateStart) throw new RangeError("Calendar interval bounds are invalid.");
  const candidate = occurrenceInterval(occurrence, calendarTimeZone);
  return candidate.start < candidateEnd && candidate.end > candidateStart;
}

function conflictOccurrence(
  occurrence: CalendarRecurrenceOccurrence,
): CalendarSeriesOccurrenceConflict["conflictingOccurrence"] {
  if (occurrence.kind === "timed") {
    return {
      occurrenceKey: occurrence.occurrenceKey,
      kind: "timed",
      startLocal: occurrence.startLocal,
      endLocal: occurrence.endLocal,
      timeZone: occurrence.timeZone,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
    };
  }
  return {
    occurrenceKey: occurrence.occurrenceKey,
    kind: "all-day",
    startDate: occurrence.startDate,
    endDate: occurrence.endDate,
  };
}

function compareConflicts(
  left: CalendarSeriesOccurrenceConflict,
  right: CalendarSeriesOccurrenceConflict,
): number {
  return left.candidateOccurrenceKey.localeCompare(right.candidateOccurrenceKey)
    || left.conflictingEventId.localeCompare(right.conflictingEventId)
    || left.conflictingOccurrence.occurrenceKey.localeCompare(
      right.conflictingOccurrence.occurrenceKey,
    );
}

function firstStartAtOrAfter(
  intervals: readonly OccurrenceInterval[],
  start: number,
): number {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (intervals[middle].start < start) low = middle + 1;
    else high = middle;
  }
  return low;
}

function addConflict(
  conflicts: CalendarSeriesOccurrenceConflict[],
  candidate: OccurrenceInterval,
  existing: OccurrenceInterval,
): void {
  conflicts.push({
    candidateOccurrenceKey: candidate.occurrence.occurrenceKey,
    conflictingEventId: existing.occurrence.seriesId,
    conflictingEventRevision: existing.occurrence.revision,
    conflictingTitle: existing.occurrence.title,
    conflictingOccurrence: conflictOccurrence(existing.occurrence),
  });
  if (conflicts.length > maximumSeriesProposalConflicts) {
    throw new RangeError("The full series has too many overlaps to review safely.");
  }
}

/**
 * Compare every proposed occurrence with owner-scoped rows already fetched by
 * the repository. Stored series are expanded in their own time zones, while
 * mixed timed/all-day overlap uses the owner's verified calendar time zone.
 */
export function findCalendarSeriesConflicts(
  proposedSeries: CalendarEvent,
  rule: CalendarRecurrenceRule,
  existingEvents: readonly CalendarEvent[],
  calendarTimeZoneValue: string,
  excludedEventId?: string,
): Readonly<{
  occurrences: readonly CalendarRecurrenceOccurrence[];
  conflicts: readonly CalendarSeriesOccurrenceConflict[];
}> {
  const calendarTimeZone = validateTimeZone(calendarTimeZoneValue);
  const occurrences = expandFullCalendarSeries(proposedSeries, rule);
  if (occurrences.length === 0) {
    throw new RangeError("The recurrence did not produce a complete occurrence set.");
  }

  const proposedIntervals = occurrences
    .map((occurrence) => occurrenceInterval(occurrence, calendarTimeZone))
    .sort((left, right) => left.start - right.start
      || left.occurrence.occurrenceKey.localeCompare(right.occurrence.occurrenceKey));
  const recurringIntervals: OccurrenceInterval[] = [];
  const oneOffIntervals: OccurrenceInterval[] = [];
  let expandedExistingCount = 0;

  for (const event of existingEvents) {
    if (event.id === excludedEventId) continue;
    if (event.recurrenceRule) {
      const expanded = expandFullCalendarSeries(event, event.recurrenceRule);
      expandedExistingCount += expanded.length;
      if (expandedExistingCount > maximumSeriesProposalExpandedOccurrences) {
        throw new RangeError("There are too many calendar series to verify this proposal safely.");
      }
      recurringIntervals.push(...expanded.map((occurrence) =>
        occurrenceInterval(occurrence, calendarTimeZone)
      ));
    } else {
      oneOffIntervals.push(occurrenceInterval(singleEventOccurrence(event), calendarTimeZone));
    }
  }

  recurringIntervals.sort((left, right) => left.start - right.start
    || left.occurrence.occurrenceKey.localeCompare(right.occurrence.occurrenceKey));

  const conflicts: CalendarSeriesOccurrenceConflict[] = [];
  // Detect collisions within the proposed series itself. These are surfaced in
  // the persisted review snapshot and cannot be silently omitted.
  for (let leftIndex = 0; leftIndex < proposedIntervals.length; leftIndex += 1) {
    const left = proposedIntervals[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < proposedIntervals.length; rightIndex += 1) {
      const right = proposedIntervals[rightIndex];
      if (right.start >= left.end) break;
      if (right.end > left.start) addConflict(conflicts, left, right);
    }
  }

  for (const candidate of proposedIntervals) {
    for (const existing of oneOffIntervals) {
      if (existing.start < candidate.end && existing.end > candidate.start) {
        addConflict(conflicts, candidate, existing);
      }
    }

    // Recurring instances last at most seven calendar/elapsed days. The
    // nine-day lookback includes zone-offset changes around mixed comparisons.
    const first = firstStartAtOrAfter(
      recurringIntervals,
      candidate.start - maximumRecurringInstanceDurationLookback,
    );
    for (let index = first; index < recurringIntervals.length; index += 1) {
      const existing = recurringIntervals[index];
      if (existing.start >= candidate.end) break;
      if (existing.end > candidate.start) addConflict(conflicts, candidate, existing);
    }
  }

  conflicts.sort(compareConflicts);
  return { occurrences, conflicts };
}
