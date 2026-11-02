import { Temporal } from "@js-temporal/polyfill";
import type {
  CalendarOccurrenceMovement,
} from "./types.ts";
import type { CalendarRecurrenceOccurrence } from "./recurrence.ts";
import { parseCalendarDate, validateTimeZone } from "./time.ts";

/** Apply a saved move without changing the recurrence identity or duration. */
export function applyCalendarOccurrenceMovement(
  occurrence: CalendarRecurrenceOccurrence,
  movement: CalendarOccurrenceMovement,
): CalendarRecurrenceOccurrence {
  if (occurrence.kind !== movement.kind) {
    throw new RangeError("An occurrence move cannot change the event type.");
  }

  if (occurrence.kind === "timed" && movement.kind === "timed") {
    const timeZone = validateTimeZone(movement.timeZone);
    if (timeZone !== occurrence.timeZone) {
      throw new RangeError("An occurrence move cannot change its time zone.");
    }

    const originalStart = Temporal.Instant.from(occurrence.startsAt);
    const originalEnd = Temporal.Instant.from(occurrence.endsAt);
    const movedStart = Temporal.Instant.from(movement.startsAt);
    const movedEnd = Temporal.Instant.from(movement.endsAt);
    if (Temporal.Instant.compare(originalEnd, originalStart) <= 0
      || Temporal.Instant.compare(movedEnd, movedStart) <= 0
      || originalStart.until(originalEnd).total({ unit: "nanoseconds" })
        !== movedStart.until(movedEnd).total({ unit: "nanoseconds" })) {
      throw new RangeError("An occurrence move must preserve its elapsed duration.");
    }

    const resolvedStartLocal = movedStart.toZonedDateTimeISO(timeZone)
      .toPlainDateTime().toString({ smallestUnit: "minute" });
    const resolvedEndLocal = movedEnd.toZonedDateTimeISO(timeZone)
      .toPlainDateTime().toString({ smallestUnit: "minute" });
    if (resolvedStartLocal !== movement.startLocal
      || resolvedEndLocal !== movement.endLocal) {
      throw new RangeError("An occurrence move has inconsistent local time bounds.");
    }

    return {
      ...occurrence,
      startLocal: movement.startLocal,
      endLocal: movement.endLocal,
      timeZone,
      startsAt: movedStart.toString(),
      endsAt: movedEnd.toString(),
    };
  }

  if (occurrence.kind === "all-day" && movement.kind === "all-day") {
    const originalStart = parseCalendarDate(occurrence.startDate);
    const originalEnd = parseCalendarDate(occurrence.endDate);
    const movedStart = parseCalendarDate(movement.startDate);
    const movedEnd = parseCalendarDate(movement.endDate);
    const originalDuration = originalStart.until(originalEnd, { largestUnit: "day" }).days;
    const movedDuration = movedStart.until(movedEnd, { largestUnit: "day" }).days;
    if (originalDuration <= 0 || movedDuration !== originalDuration) {
      throw new RangeError("An all-day occurrence move must preserve its date duration.");
    }

    return {
      ...occurrence,
      startDate: movedStart.toString(),
      endDate: movedEnd.toString(),
    };
  }

  throw new RangeError("An occurrence move has an unsupported event type.");
}
