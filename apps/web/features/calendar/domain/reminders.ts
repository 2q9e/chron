import { Temporal } from "@js-temporal/polyfill";
import { parseCalendarDate, validateTimeZone } from "./time.ts";

export const timedCalendarReminderChoices = [
  "none",
  "at-start",
  "5-minutes-before",
  "10-minutes-before",
  "15-minutes-before",
  "30-minutes-before",
  "60-minutes-before",
  "one-local-day-before",
] as const;

export const allDayCalendarReminderChoices = [
  "none",
  "event-day-9am",
  "previous-day-9am",
] as const;

export type TimedCalendarReminderChoice = (typeof timedCalendarReminderChoices)[number];
export type AllDayCalendarReminderChoice = (typeof allDayCalendarReminderChoices)[number];

export type CalendarReminderOccurrence = Readonly<{
  occurrenceKey: string;
  kind: "timed";
  startLocal: string;
  startsAt: string;
  timeZone: string;
}> | Readonly<{
  occurrenceKey: string;
  kind: "all-day";
  startDate: string;
}>;

export type CalendarReminderSchedule = Readonly<{
  occurrenceKey: string;
  scheduledAt: string;
  timeZone: string;
}>;

export class CalendarReminderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarReminderError";
  }
}

const timedOffsets = {
  "at-start": 0,
  "5-minutes-before": 5,
  "10-minutes-before": 10,
  "15-minutes-before": 15,
  "30-minutes-before": 30,
  "60-minutes-before": 60,
} satisfies Readonly<Record<Exclude<TimedCalendarReminderChoice,
  "none" | "one-local-day-before">, number>>;

function invalidReminder(): never {
  throw new CalendarReminderError("The reminder choice does not match its event type.");
}

function timedSchedule(
  choice: Exclude<TimedCalendarReminderChoice, "none">,
  occurrence: Extract<CalendarReminderOccurrence, { kind: "timed" }>,
): CalendarReminderSchedule {
  const timeZone = validateTimeZone(occurrence.timeZone);
  const instant = Temporal.Instant.from(occurrence.startsAt);
  const startLocal = Temporal.PlainDateTime.from(occurrence.startLocal, { overflow: "reject" });
  if (!instant.toZonedDateTimeISO(timeZone).toPlainDateTime().equals(startLocal)) {
    throw new CalendarReminderError("The timed reminder occurrence has inconsistent local-time data.");
  }

  const scheduledAt = choice === "one-local-day-before"
    ? startLocal.subtract({ days: 1 })
      .toZonedDateTime(timeZone, { disambiguation: "compatible" })
      .toInstant()
    : instant.subtract({ minutes: timedOffsets[choice] });

  return {
    occurrenceKey: occurrence.occurrenceKey,
    scheduledAt: scheduledAt.toString(),
    timeZone,
  };
}

function allDaySchedule(
  choice: Exclude<AllDayCalendarReminderChoice, "none">,
  occurrence: Extract<CalendarReminderOccurrence, { kind: "all-day" }>,
  reminderTimeZone: string,
): CalendarReminderSchedule {
  const timeZone = validateTimeZone(reminderTimeZone);
  const eventDate = parseCalendarDate(occurrence.startDate);
  const reminderDate = choice === "event-day-9am"
    ? eventDate
    : eventDate.subtract({ days: 1 });
  const localReminder = reminderDate.toPlainDateTime({ hour: 9 });
  const scheduledAt = localReminder
    .toZonedDateTime(timeZone, { disambiguation: "compatible" })
    .toInstant();

  return {
    occurrenceKey: occurrence.occurrenceKey,
    scheduledAt: scheduledAt.toString(),
    timeZone,
  };
}

/**
 * Resolve one reminder occurrence to an instant. A one-day timed reminder
 * means the same local wall-clock time on the previous date. If that local
 * time is ambiguous, choose the earlier instant; if it falls in a clock gap,
 * move forward by the gap. All-day reminders use the calendar zone captured
 * when the reminder was saved.
 */
export function scheduleCalendarReminder(
  choice: TimedCalendarReminderChoice | AllDayCalendarReminderChoice,
  occurrence: CalendarReminderOccurrence,
  reminderTimeZone?: string,
): CalendarReminderSchedule | null {
  if (choice === "none") return null;

  try {
    if (occurrence.kind === "timed") {
      if (!(timedCalendarReminderChoices as readonly string[]).includes(choice)) {
        return invalidReminder();
      }
      return timedSchedule(
        choice as Exclude<TimedCalendarReminderChoice, "none">,
        occurrence,
      );
    }

    if (!(allDayCalendarReminderChoices as readonly string[]).includes(choice)
      || !reminderTimeZone) {
      return invalidReminder();
    }
    return allDaySchedule(
      choice as Exclude<AllDayCalendarReminderChoice, "none">,
      occurrence,
      reminderTimeZone,
    );
  } catch (error) {
    if (error instanceof CalendarReminderError) throw error;
    throw new CalendarReminderError("The reminder time or time zone is invalid.");
  }
}
