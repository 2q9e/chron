export const calendarThemes = [
  "pink-liquid-glass",
  "minimal-light",
  "premium-dark",
  "soft-pastel",
  "high-contrast",
] as const;

export type CalendarTheme = (typeof calendarThemes)[number];
export type CalendarDensity = "comfortable" | "compact";
export type CalendarRecurrenceRule = Readonly<{
  frequency: "daily" | "weekly";
  interval: 1 | 2 | 3 | 4;
  count: number;
}>;

export type CalendarPreferences = Readonly<{
  theme: CalendarTheme;
  density: CalendarDensity;
  weekStartsOn: number;
  timeZone: string;
}>;

type CalendarEventBase = Readonly<{
  id: string;
  title: string;
  details: string | null;
  revision: number;
  recurrenceRule?: CalendarRecurrenceRule;
  createdAt: string;
  updatedAt: string;
}>;

export type TimedCalendarEvent = CalendarEventBase & Readonly<{
  kind: "timed";
  startLocal: string;
  endLocal: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
}>;

export type AllDayCalendarEvent = CalendarEventBase & Readonly<{
  kind: "all-day";
  startDate: string;
  endDate: string;
}>;

export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

type CalendarOccurrenceMetadata = Readonly<{
  /** Stable UI identity for one generated instance, not a database event ID. */
  id: string;
  seriesId: string;
  occurrenceKey: string;
  title: string;
  details: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Persisted root used for whole-series actions. */
  series: CalendarEvent;
}>;

export type CalendarEventOccurrence =
  | (CalendarOccurrenceMetadata & Readonly<{
      kind: "timed";
      startLocal: string;
      endLocal: string;
      timeZone: string;
      startsAt: string;
      endsAt: string;
    }>)
  | (CalendarOccurrenceMetadata & Readonly<{
      kind: "all-day";
      startDate: string;
      endDate: string;
    }>);

export type CalendarEventEntry = CalendarEvent | CalendarEventOccurrence;

export function calendarEventEntryKey(event: CalendarEventEntry): string {
  return "occurrenceKey" in event ? event.occurrenceKey : event.id;
}

export function calendarEventSeries(event: CalendarEventEntry): CalendarEvent {
  return "series" in event ? event.series : event;
}

export type CalendarEventSearchRequest = Readonly<{
  query: string; // Case-insensitive literal substring of the event title.
  from: string; // Inclusive YYYY-MM-DD calendar date.
  to: string; // Exclusive YYYY-MM-DD calendar date.
  timeZone: string; // IANA zone used to bound timed events.
  kind?: CalendarEvent["kind"];
}>;

export type CalendarEventSearchResponse = Readonly<{
  events: readonly CalendarEvent[];
}>;

export type CalendarConflict =
  | Readonly<{
      id: string;
      revision: number;
      title: string;
      occurrenceKey?: string;
      kind: "timed";
      startLocal: string;
      endLocal: string;
      timeZone: string;
    }>
  | Readonly<{
      id: string;
      revision: number;
      title: string;
      occurrenceKey?: string;
      kind: "all-day";
      startDate: string;
      endDate: string;
    }>;

export type CalendarConflictReview = Readonly<{
  id: string;
  revision: number;
}>;

export type CalendarEventCommit = Readonly<{
  event: CalendarEventMutation;
  calendarTimeZone: string;
  reviewedConflicts: readonly CalendarConflictReview[];
}>;

export type CalendarEventCreateRequest =
  | Readonly<{ operation: "create"; commit: CalendarEventCommit }>
  | Readonly<{ operation: "reconcile" }>;

export type CreateTimedCalendarEvent = Readonly<{
  kind: "timed";
  title: string;
  details?: string;
  startLocal: string;
  endLocal: string;
  timeZone: string;
  startDisambiguation?: "earlier" | "later";
  endDisambiguation?: "earlier" | "later";
}>;

export type CreateAllDayCalendarEvent = Readonly<{
  kind: "all-day";
  title: string;
  details?: string;
  startDate: string;
  endDate: string;
}>;

export type CalendarEventMutation =
  | CreateTimedCalendarEvent
  | CreateAllDayCalendarEvent;

export type CalendarApiError = Readonly<{
  error: {
    code: string;
    message: string;
  };
}>;
