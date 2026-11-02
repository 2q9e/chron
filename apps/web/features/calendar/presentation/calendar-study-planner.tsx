"use client";

import { Temporal } from "@js-temporal/polyfill";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { formatDateOnly, formatInstant } from "./calendar-model";
import { fetchCalendarEvents } from "./calendar-api";
import { resolveCalendarRange } from "../domain/time";
import { planStudyTime, type StudyPlan, type StudyPlanSession, type StudyPlannerInput } from "../domain/study-planner";
import styles from "./calendar-study-planner.module.css";

type Fields = Readonly<{
  topic: string;
  totalMinutes: string;
  sessionMinutes: string;
  startDate: string;
  deadline: string;
  dayStart: string;
  dayEnd: string;
  eventBufferMinutes: string;
  sessionBreakMinutes: string;
}>;

type Props = Readonly<{
  initialDate: string;
  timeZone: string;
  locale: string;
  disabled: boolean;
  savedSessionIds: ReadonlySet<string>;
  onReview: (session: StudyPlanSession, returnFocusTarget: HTMLButtonElement) => void;
  onClose: () => void;
}>;

const weekdayOptions = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
] as const;

function initialFields(initialDate: string): Fields {
  const first = Temporal.PlainDate.from(initialDate);
  return {
    topic: "",
    totalMinutes: "300",
    sessionMinutes: "60",
    startDate: first.toString(),
    deadline: first.add({ days: 14 }).toString(),
    dayStart: "09:00",
    dayEnd: "17:00",
    eventBufferMinutes: "15",
    sessionBreakMinutes: "15",
  };
}

function toInput(fields: Fields, weekdays: readonly number[], timeZone: string): StudyPlannerInput {
  return {
    topic: fields.topic,
    totalMinutes: Number(fields.totalMinutes),
    sessionMinutes: Number(fields.sessionMinutes),
    startDate: fields.startDate,
    deadline: fields.deadline,
    dayStart: fields.dayStart,
    dayEnd: fields.dayEnd,
    timeZone,
    weekdays,
    eventBufferMinutes: Number(fields.eventBufferMinutes),
    sessionBreakMinutes: Number(fields.sessionBreakMinutes),
  };
}

function planSummary(plan: StudyPlan): string {
  const count = plan.sessions.length;
  const placed = `${plan.plannedMinutes} of ${plan.requestedMinutes} minutes placed`;
  return `${count} reviewable study ${count === 1 ? "session" : "sessions"}; ${placed}.`;
}

export function CalendarStudyPlanner({ initialDate, timeZone, locale, disabled, savedSessionIds, onReview, onClose }: Props) {
  const id = useId();
  const [fields, setFields] = useState(() => initialFields(initialDate));
  const [weekdays, setWeekdays] = useState<readonly number[]>([1, 2, 3, 4, 5]);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  function changeField(field: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setPlan(null);
    setError("");
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) => current.includes(day)
      ? current.filter((selected) => selected !== day)
      : [...current, day].sort((left, right) => left - right));
    setPlan(null);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || loading) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setLoading(true);
    setPlan(null);
    setError("");

    try {
      const input = toInput(fields, weekdays, timeZone);
      planStudyTime(input, []);
      const throughDate = Temporal.PlainDate.from(fields.deadline).add({ days: 1 }).toString();
      const range = resolveCalendarRange(fields.startDate, throughDate, timeZone);
      const events = await fetchCalendarEvents(range.fromDate, range.toDate, timeZone, controller.signal);
      if (controller.signal.aborted) return;
      setPlan(planStudyTime(input, events));
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error
        ? reason.message
        : "Chron could not load calendar availability. Try again.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <section id="calendar-study-planner" className={styles.planner} aria-labelledby={`${id}-heading`}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Calendar planning</p>
          <h2 id={`${id}-heading`}>Plan study time</h2>
          <p>Chron checks your saved events and proposes timed sessions in {timeZone}. Nothing is added until you review and save each session.</p>
        </div>
        <button type="button" onClick={onClose}>Close planner</button>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <label className={styles.topic} htmlFor={`${id}-topic`}>
          Study topic
          <input
            id={`${id}-topic`}
            value={fields.topic}
            onChange={(event) => changeField("topic", event.currentTarget.value)}
            maxLength={153}
            autoComplete="off"
            required
            disabled={disabled || loading}
          />
        </label>

        <label htmlFor={`${id}-total`}>
          Total study time (minutes)
          <input id={`${id}-total`} type="number" min="15" max="10080" step="15" value={fields.totalMinutes} onChange={(event) => changeField("totalMinutes", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>
        <label htmlFor={`${id}-session`}>
          Session length (minutes)
          <input id={`${id}-session`} type="number" min="15" max="180" step="15" value={fields.sessionMinutes} onChange={(event) => changeField("sessionMinutes", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>
        <label htmlFor={`${id}-start-date`}>
          Start date
          <input id={`${id}-start-date`} type="date" value={fields.startDate} onChange={(event) => changeField("startDate", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>
        <label htmlFor={`${id}-deadline`}>
          Deadline
          <input id={`${id}-deadline`} type="date" value={fields.deadline} onChange={(event) => changeField("deadline", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>
        <label htmlFor={`${id}-day-start`}>
          Daily window starts
          <input id={`${id}-day-start`} type="time" step="900" value={fields.dayStart} onChange={(event) => changeField("dayStart", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>
        <label htmlFor={`${id}-day-end`}>
          Daily window ends
          <input id={`${id}-day-end`} type="time" step="900" value={fields.dayEnd} onChange={(event) => changeField("dayEnd", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>
        <label htmlFor={`${id}-buffer`}>
          Buffer around saved events (minutes)
          <input id={`${id}-buffer`} type="number" min="0" max="60" step="15" value={fields.eventBufferMinutes} onChange={(event) => changeField("eventBufferMinutes", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>
        <label htmlFor={`${id}-break`}>
          Break between sessions (minutes)
          <input id={`${id}-break`} type="number" min="0" max="60" step="15" value={fields.sessionBreakMinutes} onChange={(event) => changeField("sessionBreakMinutes", event.currentTarget.value)} required disabled={disabled || loading} />
        </label>

        <fieldset className={styles.weekdays} disabled={disabled || loading}>
          <legend>Available weekdays</legend>
          {weekdayOptions.map(({ value, label }) => (
            <label key={value}>
              <input type="checkbox" checked={weekdays.includes(value)} onChange={() => toggleWeekday(value)} />
              {label}
            </label>
          ))}
        </fieldset>

        <p className={styles.note}>Times use your calendar time zone. Session lengths and buffers follow 15-minute increments. Existing event times are padded by the buffer; all-day events block their full dates. On a repeated clock hour, the window uses the first start and last end occurrence. Nonexistent windows are skipped.</p>
        <div className={styles.actions}>
          <button type="submit" disabled={disabled || loading}>{loading ? "Checking calendar…" : "Generate study plan"}</button>
        </div>
      </form>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.status} role="status">Checking your saved calendar events…</p>}
      {plan && (
        <div className={styles.results} aria-live="polite">
          <h3>Proposed sessions</h3>
          <p>{planSummary(plan)}</p>
          {plan.unscheduledMinutes > 0 && <p className={styles.note}>Widen the date range or daily window to place the remaining {plan.unscheduledMinutes} minutes.</p>}
          {plan.skippedDates.length > 0 && <p className={styles.note}>The study window could not be used on {plan.skippedDates.map(({ date }) => formatDateOnly(date, locale, { month: "short", day: "numeric", year: "numeric" })).join(", ")} because of a daylight-saving clock change.</p>}
          {plan.sessions.length > 0 ? (
            <ol className={styles.sessions}>
              {plan.sessions.map((session) => {
                const saved = savedSessionIds.has(session.id);
                return (
                  <li key={session.id}>
                    <div>
                      <strong>{formatDateOnly(session.date, locale, { weekday: "long", month: "short", day: "numeric" })}</strong>
                      <time dateTime={session.startsAt}>
                        {formatInstant(session.startsAt, timeZone, locale, true)}–{formatInstant(session.endsAt, timeZone, locale, true)} · {session.durationMinutes} min
                      </time>
                    </div>
                    <button
                      type="button"
                      disabled={disabled || saved}
                      onClick={(event) => onReview(session, event.currentTarget)}
                    >{saved ? "Added to calendar" : "Review session"}</button>
                  </li>
                );
              })}
            </ol>
          ) : !loading ? (
            <p>No sessions fit the available time. Adjust the study window, available days, or deadline and generate another plan.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
