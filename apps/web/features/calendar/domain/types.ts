import type {
  AllDayCalendarReminderChoice,
  TimedCalendarReminderChoice,
} from "./reminders.ts";

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

export type CalendarSeriesDraftRequest =
  | Readonly<{
      action: "create";
      scope: "series";
      event: CalendarEventMutation;
      recurrenceRule: CalendarRecurrenceRule;
      calendarTimeZone: string;
    }>
  | Readonly<{
      action: "update";
      scope: "series";
      targetEventId: string;
      targetRevision: number;
      event: CalendarEventMutation;
      recurrenceRule: CalendarRecurrenceRule;
      calendarTimeZone: string;
    }>
  | Readonly<{
      action: "delete";
      scope: "series";
      targetEventId: string;
      targetRevision: number;
    }>;

export type CalendarSeriesOccurrenceSnapshot = Readonly<{
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

export type CalendarSeriesOccurrenceConflict = Readonly<{
  candidateOccurrenceKey: string;
  conflictingEventId: string;
  conflictingEventRevision: number;
  conflictingTitle: string;
  conflictingOccurrence: CalendarSeriesOccurrenceSnapshot;
}>;

export type CalendarSeriesDraft = Readonly<{
  id: string;
  action: CalendarSeriesDraftRequest["action"];
  scope: "series";
  outcome: "pending" | "approved" | "stale" | "expired" | "deleted";
  replayed: boolean;
  targetEventId: string | null;
  targetRevision: number | null;
  event: CalendarEventMutation | null;
  recurrenceRule: CalendarRecurrenceRule | null;
  calendarTimeZone: string | null;
  beforeOccurrences: readonly CalendarSeriesOccurrenceSnapshot[];
  afterOccurrences: readonly CalendarSeriesOccurrenceSnapshot[];
  conflicts: readonly CalendarSeriesOccurrenceConflict[];
  expiresAt: string;
}>;

export type CalendarSeriesApproval = Readonly<{
  id: string;
  action: CalendarSeriesDraftRequest["action"];
  outcome: "approved" | "stale" | "expired" | "deleted";
  event: CalendarEvent | null;
}>;

export type CalendarPreferences = Readonly<{
  theme: CalendarTheme;
  density: CalendarDensity;
  weekStartsOn: number;
  timeZone: string;
}>;

export type CalendarReminderFailureCounts = Readonly<{
  accountEmail: number;
  configuration: number;
  provider: number;
  temporary: number;
  other: number;
}>;

export type CalendarReminderStatusSummary = Readonly<{
  total: number;
  pending: number;
  leased: number;
  sent: number;
  failed: number;
  cancelled: number;
  retrying: number;
  nextAttemptAt: string | null;
  lastAcceptedAt: string | null;
  failureCounts: CalendarReminderFailureCounts;
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
  reminderChoice: TimedCalendarReminderChoice;
  startLocal: string;
  endLocal: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
}>;

export type AllDayCalendarEvent = CalendarEventBase & Readonly<{
  kind: "all-day";
  reminderChoice: AllDayCalendarReminderChoice;
  reminderTimeZone: string | null;
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
  reminderChoice?: TimedCalendarReminderChoice;
  startDisambiguation?: "earlier" | "later";
  endDisambiguation?: "earlier" | "later";
}>;

export type CreateAllDayCalendarEvent = Readonly<{
  kind: "all-day";
  title: string;
  details?: string;
  startDate: string;
  endDate: string;
  reminderChoice?: AllDayCalendarReminderChoice;
  reminderTimeZone?: string;
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
