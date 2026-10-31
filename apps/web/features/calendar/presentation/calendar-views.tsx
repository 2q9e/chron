import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEvent } from "../domain/types";
import {
  allDayEventsForDate,
  eventsOnDate,
  formatDateOnly,
  formatInstant,
  monthGrid,
  startOfWeek,
  timedEventSegmentsForDate,
  type CalendarView,
} from "./calendar-model";
import styles from "./calendar.module.css";

type EventButtonProps = Readonly<{
  event: CalendarEvent;
  date: string;
  timeZone: string;
  locale: string;
  onSelect: (event: CalendarEvent) => void;
  compact?: boolean;
  timeLabelOverride?: string;
}>;

type TimedEventDaySegment = Readonly<{
  startsOnDate: boolean;
  endsOnDate: boolean;
  endsAtMidnight: boolean;
}>;

function timedEventDaySegment(
  event: Extract<CalendarEvent, { kind: "timed" }>,
  selectedDate: string,
  timeZone: string,
): TimedEventDaySegment {
  const date = Temporal.PlainDate.from(selectedDate);
  const dayStart = date.toZonedDateTime(timeZone).toInstant();
  const dayEnd = date.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  const start = Temporal.Instant.from(event.startsAt);
  const end = Temporal.Instant.from(event.endsAt);
  const startAtOrAfterDayStart = Temporal.Instant.compare(start, dayStart) >= 0;
  const startBeforeDayEnd = Temporal.Instant.compare(start, dayEnd) < 0;
  const endAfterDayStart = Temporal.Instant.compare(end, dayStart) > 0;
  const endAtOrBeforeDayEnd = Temporal.Instant.compare(end, dayEnd) <= 0;
  const endsAtMidnight = Temporal.Instant.compare(end, dayEnd) === 0;

  return {
    startsOnDate: startAtOrAfterDayStart && startBeforeDayEnd,
    endsOnDate: endAfterDayStart && endAtOrBeforeDayEnd,
    endsAtMidnight,
  };
}

function timedEventEndLabel(
  event: Extract<CalendarEvent, { kind: "timed" }>,
  selectedDate: string,
  timeZone: string,
  locale: string,
  withZone = false,
): string {
  const segment = timedEventDaySegment(event, selectedDate, timeZone);
  return segment.endsAtMidnight
    ? "midnight"
    : formatInstant(event.endsAt, timeZone, locale, withZone);
}

function timedEventDayLabel(
  event: Extract<CalendarEvent, { kind: "timed" }>,
  selectedDate: string,
  timeZone: string,
  locale: string,
): string {
  const segment = timedEventDaySegment(event, selectedDate, timeZone);
  if (segment.startsOnDate) {
    const start = formatInstant(event.startsAt, timeZone, locale);
    return segment.endsAtMidnight
      ? `${start}–midnight`
      : start;
  }
  if (segment.endsOnDate) {
    return `Until ${timedEventEndLabel(event, selectedDate, timeZone, locale)}`;
  }
  return "Continues";
}

function shortTimedEventLabel(
  event: Extract<CalendarEvent, { kind: "timed" }>,
  selectedDate: string,
  timeZone: string,
  locale: string,
): string {
  const segment = timedEventDaySegment(event, selectedDate, timeZone);
  if (segment.startsOnDate) {
    const start = formatInstant(event.startsAt, timeZone, locale);
    if (segment.endsAtMidnight) return `${start}–midnight`;
    if (segment.endsOnDate) {
      return `${start}–${timedEventEndLabel(event, selectedDate, timeZone, locale)}`;
    }
    return `${start} – continues`;
  }
  if (segment.endsOnDate) {
    return `Until ${timedEventEndLabel(event, selectedDate, timeZone, locale)}`;
  }
  return "Continues";
}

function eventAccessibleLabel(
  event: CalendarEvent,
  selectedDate: string,
  timeZone: string,
  locale: string,
): string {
  if (event.kind === "all-day") {
    const endExclusive = Temporal.PlainDate.from(event.endDate);
    const lastDay = endExclusive.subtract({ days: 1 }).toString();
    return `${event.title}, all day, ${formatDateOnly(event.startDate, locale, { month: "long", day: "numeric", year: "numeric" })} through ${formatDateOnly(lastDay, locale, { month: "long", day: "numeric", year: "numeric" })}`;
  }

  const segment = timedEventDaySegment(event, selectedDate, timeZone);
  const start = segment.startsOnDate
    ? `starts at ${formatInstant(event.startsAt, timeZone, locale, true)}`
    : "continues from an earlier day";
  const end = segment.endsOnDate
    ? segment.endsAtMidnight
      ? "ends at midnight"
      : `ends at ${formatInstant(event.endsAt, timeZone, locale, true)}`
    : "continues into a later day";
  return `${event.title}, ${start} and ${end}, ${formatDateOnly(selectedDate, locale, { month: "long", day: "numeric", year: "numeric" })}`;
}

export function CalendarEventButton({
  event,
  date,
  timeZone,
  locale,
  onSelect,
  compact = false,
  timeLabelOverride,
}: EventButtonProps) {
  const timeLabel = event.kind === "timed"
    ? timeLabelOverride ?? timedEventDayLabel(event, date, timeZone, locale)
    : "All day";
  return (
    <button
      className={`${styles.eventButton} ${compact ? styles.compactEvent : ""}`}
      type="button"
      onClick={() => onSelect(event)}
      aria-label={eventAccessibleLabel(event, date, timeZone, locale)}
      title={event.title}
    >
      <span className={styles.eventTime}>{timeLabel}</span>
      <span className={styles.eventTitle}>{event.title}</span>
    </button>
  );
}

type CalendarViewProps = Readonly<{
  events: readonly CalendarEvent[];
  selectedDate: string;
  weekStartsOn: number;
  timeZone: string;
  locale: string;
  onCreate: (date: string) => void;
  onSelectEvent: (event: CalendarEvent) => void;
}>;

function weekdayLabels(weekStartsOn: number, locale: string): readonly string[] {
  const referenceSunday = Temporal.PlainDate.from("2026-11-01");
  return Array.from({ length: 7 }, (_, index) => referenceSunday
    .add({ days: (weekStartsOn + index) % 7 })
    .toLocaleString(locale, { weekday: "short" }));
}

export function MonthCalendar(props: CalendarViewProps) {
  const { events, selectedDate, weekStartsOn, timeZone, locale, onCreate, onSelectEvent } = props;
  const grid = monthGrid(selectedDate, weekStartsOn);
  const labels = weekdayLabels(weekStartsOn, locale);
  return (
    <section className={styles.monthView} aria-label="Month calendar">
      <div className={styles.weekdayHeader} aria-hidden="true">
        {labels.map((label, index) => <span key={`${index}-${label}`}>{label}</span>)}
      </div>
      <div className={styles.monthGrid} style={{ "--month-rows": grid.rows } as React.CSSProperties}>
        {grid.days.map((day) => {
          const dateKey = day.toString();
          const dayEvents = eventsOnDate(events, dateKey, timeZone);
          const currentMonth = day.month === grid.month.month;
          return (
            <article
              className={`${styles.monthCell} ${currentMonth ? "" : styles.adjacentMonthCell}`}
              key={dateKey}
              aria-label={`${day.toLocaleString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${dayEvents.length ? `, ${dayEvents.length} events` : ", no events"}`}
            >
              <button
                className={styles.monthDate}
                type="button"
                onClick={() => onCreate(dateKey)}
                aria-label={`Create an event on ${day.toLocaleString(locale, { month: "long", day: "numeric", year: "numeric" })}`}
                aria-current={dateKey === selectedDate ? "date" : undefined}
              >
                <span>{day.day}</span>
                <span className={styles.monthDateLabel}>
                  {day.toLocaleString(locale, { month: "short" })}
                </span>
              </button>
              <div className={styles.monthEvents}>
                {dayEvents.map((event) => (
                  <CalendarEventButton
                    compact
                    date={dateKey}
                    event={event}
                    key={event.id}
                    locale={locale}
                    onSelect={onSelectEvent}
                    timeZone={timeZone}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type DayColumnProps = CalendarViewProps & Readonly<{ date: string; view: CalendarView }>;

function DayColumn({
  events,
  date,
  timeZone,
  locale,
  onCreate,
  onSelectEvent,
}: DayColumnProps) {
  const dayEvents = eventsOnDate(events, date, timeZone);
  const allDayEvents = allDayEventsForDate(dayEvents, date);
  const timeline = timedEventSegmentsForDate(dayEvents, date, timeZone, locale);
  const dateTitle = Temporal.PlainDate.from(date)
    .toLocaleString(locale, { weekday: "long", month: "short", day: "numeric" });

  return (
    <article className={styles.dayColumn} aria-label={dateTitle}>
      <header className={styles.dayColumnHeader}>
        <h3>{dateTitle}</h3>
        <button
          className={styles.addDayEvent}
          type="button"
          onClick={() => onCreate(date)}
          aria-label={`Create an event on ${dateTitle}`}
        >
          Add event
        </button>
      </header>
      <div className={styles.allDayRow}>
        <span className={styles.rowLabel}>All day</span>
        <div className={styles.allDayEvents}>
          {allDayEvents.map((event) => (
            <CalendarEventButton
              compact
              date={date}
              event={event}
              key={event.id}
              locale={locale}
              onSelect={onSelectEvent}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>
      <div
        className={styles.dayTrack}
        style={{ "--track-height": `${timeline.trackHeightRem}rem` } as React.CSSProperties}
      >
        <div className={styles.hourAxis} aria-hidden="true">
          {timeline.hourLabels.map((label, index) => (
            <span className={styles.hourLabel} key={`${index}-${label}`} style={{ top: `${index * 2.75}rem` }}>
              {label}
            </span>
          ))}
        </div>
        <div className={styles.eventLayer}>
          {timeline.events.map((segment) => {
            const time = segment.startsOnDate
              ? segment.endsAtMidnight
                ? `${segment.localStartLabel}–midnight ${segment.timeZoneLabel}`
                : `${segment.localStartLabel} ${segment.timeZoneLabel}`
            : segment.endsOnDate
              ? `Until ${timedEventEndLabel(segment.event, date, timeZone, locale, true)}`
              : "Continues";
            const suffix = segment.startsOnDate && !segment.endsOnDate
              ? "; continues into a later day"
              : "";
            return (
              <button
                className={`${styles.timedEvent} ${styles.eventButton}`}
                type="button"
                key={segment.event.id}
                onClick={() => onSelectEvent(segment.event)}
                aria-label={eventAccessibleLabel(segment.event, date, timeZone, locale)}
                title={`${segment.event.title} · ${time}${suffix}`}
                style={{
                  top: `${segment.topRem}rem`,
                  height: `${segment.heightRem}rem`,
                  left: `${segment.leftPercent}%`,
                  width: `${segment.widthPercent}%`,
                }}
              >
                <span className={styles.eventTime}>{time}</span>
                <span className={styles.eventTitle}>{segment.event.title}</span>
              </button>
            );
          })}
        </div>
      </div>
      {timeline.belowTrackEvents.length > 0 && (
        <ul className={styles.shortTimedEvents} aria-label={`Short events for ${dateTitle}`}>
          {timeline.belowTrackEvents.map((segment) => (
            <li key={segment.event.id}>
              <CalendarEventButton
                date={date}
                event={segment.event}
                locale={locale}
                onSelect={onSelectEvent}
                timeLabelOverride={shortTimedEventLabel(segment.event, date, timeZone, locale)}
                timeZone={timeZone}
              />
            </li>
          ))}
        </ul>
      )}
      <div className={styles.mobileTimedEvents}>
        {dayEvents.filter((event) => event.kind === "timed").map((event) => (
          <CalendarEventButton date={date} event={event} key={event.id} locale={locale} onSelect={onSelectEvent} timeZone={timeZone} />
        ))}
      </div>
      {dayEvents.length === 0 && (
        <p className={styles.noDayEvents}>No events on this day.</p>
      )}
    </article>
  );
}

export function TimeCalendar({
  events,
  selectedDate,
  weekStartsOn,
  timeZone,
  locale,
  onCreate,
  onSelectEvent,
  view,
}: CalendarViewProps & Readonly<{ view: "day" | "week" }>) {
  const first = view === "day" ? Temporal.PlainDate.from(selectedDate) : startOfWeek(selectedDate, weekStartsOn);
  const count = view === "day" ? 1 : 7;
  const days = Array.from({ length: count }, (_, index) => first.add({ days: index }).toString());

  return (
    <section
      className={`${styles.timeCalendar} ${view === "day" ? styles.singleDayCalendar : styles.weekCalendar}`}
      aria-label={view === "day" ? "Day calendar" : "Week calendar"}
    >
      {days.map((dateKey) => (
        <DayColumn
          {...{ events, selectedDate, weekStartsOn, timeZone, locale, onCreate, onSelectEvent }}
          date={dateKey}
          key={dateKey}
          view={view}
        />
      ))}
    </section>
  );
}

export function AgendaCalendar(props: CalendarViewProps) {
  const { events, selectedDate, timeZone, locale, onCreate, onSelectEvent } = props;
  const dates = Array.from({ length: 30 }, (_, index) =>
    Temporal.PlainDate.from(selectedDate).add({ days: index }).toString()
  );
  const rows = dates.flatMap((date) => {
    const dayEvents = eventsOnDate(events, date, timeZone);
    return dayEvents.length > 0 ? [{ date, events: dayEvents }] : [];
  });

  return (
    <section className={styles.agendaView} aria-label="Agenda for the next 30 days">
      {rows.map(({ date, events: dayEvents }) => (
        <article className={styles.agendaDay} key={date}>
          <header className={styles.agendaDayHeader}>
            <h3>{Temporal.PlainDate.from(date).toLocaleString(locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}</h3>
            <button
              className={styles.addDayEvent}
              type="button"
              onClick={() => onCreate(date)}
              aria-label={`Create an event on ${formatDateOnly(date, locale, { month: "long", day: "numeric", year: "numeric" })}`}
            >
              Add event
            </button>
          </header>
          <ul className={styles.agendaEvents}>
            {dayEvents.map((event) => (
              <li key={event.id}>
                <CalendarEventButton
                  date={date}
                  event={event}
                  key={event.id}
                  locale={locale}
                  onSelect={onSelectEvent}
                  timeZone={timeZone}
                />
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
