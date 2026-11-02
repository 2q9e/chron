import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEventEntry } from "../domain/types.ts";

export function calendarSearchEventDateLabel(
  event: CalendarEventEntry,
  locale: string,
  displayTimeZone: string,
): string {
  if (event.kind === "all-day") {
    try {
      const start = Temporal.PlainDate.from(event.startDate);
      const inclusiveEnd = Temporal.PlainDate.from(event.endDate).subtract({ days: 1 });
      const startLabel = start.toLocaleString(locale, { dateStyle: "medium" });
      return Temporal.PlainDate.compare(start, inclusiveEnd) === 0
        ? startLabel
        : `${startLabel} – ${inclusiveEnd.toLocaleString(locale, { dateStyle: "medium" })}`;
    } catch {
      return `${event.startDate} – ${event.endDate}`;
    }
  }

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: displayTimeZone,
    });
    return `${formatter.format(new Date(event.startsAt))} – ${formatter.format(new Date(event.endsAt))} · ${displayTimeZone}`;
  } catch {
    return `${event.startsAt} – ${event.endsAt}`;
  }
}
