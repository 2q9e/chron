import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEvent } from "../domain/types";
import {
  prepareCalendarEventSearchRequest,
  searchCalendarEvents,
  type CalendarEventSearchFields,
} from "./calendar-api";
import styles from "./calendar.module.css";

type Props = {
  initialDate: string;
  locale: string;
  timeZone: string;
  disabled: boolean;
  onSelect: (event: CalendarEvent, returnFocusTarget: HTMLElement | null) => void;
};

type SearchState =
  | Readonly<{ status: "idle" | "loading" | "empty" }>
  | Readonly<{ status: "results"; events: readonly CalendarEvent[] }>
  | Readonly<{ status: "error"; message: string }>;

type SearchField = "query" | "from" | "through";

function eventDateLabel(event: CalendarEvent, locale: string): string {
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
      timeZone: event.timeZone,
    });
    return `${formatter.format(new Date(event.startsAt))} – ${formatter.format(new Date(event.endsAt))} · ${event.timeZone}`;
  } catch {
    return `${event.startLocal.replace("T", " ")} – ${event.endLocal.replace("T", " ")} · ${event.timeZone}`;
  }
}

function kindLabel(event: CalendarEvent): string {
  return event.kind === "all-day" ? "All day" : "Timed";
}

export function CalendarSearch({ initialDate, locale, timeZone, disabled, onSelect }: Props) {
  const ids = useId();
  const formId = `${ids}-form`;
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(initialDate);
  const [through, setThrough] = useState(initialDate);
  const [kind, setKind] = useState<CalendarEventSearchFields["kind"]>("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SearchField, string>>>({});
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const sequence = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const pendingFieldFocus = useRef<SearchField | null>(null);
  const searchHeading = useRef<HTMLHeadingElement | null>(null);
  const queryInput = useRef<HTMLInputElement | null>(null);
  const fromInput = useRef<HTMLInputElement | null>(null);
  const throughInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
  }, []);

  useEffect(() => {
    if (!disabled) return;
    sequence.current += 1;
    const invalidatedBy = sequence.current;
    activeController.current?.abort();
    activeController.current = null;
    pendingFieldFocus.current = null;
    if (sequence.current !== invalidatedBy) return;
    setSearch({ status: "idle" });
    setFieldErrors({});
    setFormError("");
  }, [disabled]);

  useEffect(() => {
    const field = pendingFieldFocus.current;
    if (!field || !fieldErrors[field]) return;
    const errorId = `${ids}-${field}-error`;
    const input = field === "query"
      ? queryInput.current
      : field === "from"
        ? fromInput.current
        : throughInput.current;
    const describedBy = input?.getAttribute("aria-describedby")?.split(/\s+/);
    if (input && document.getElementById(errorId) && describedBy?.includes(errorId)) {
      pendingFieldFocus.current = null;
      input.focus();
    }
  }, [fieldErrors, ids]);

  function invalidateSearch() {
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    pendingFieldFocus.current = null;
    setSearch({ status: "idle" });
    setFieldErrors({});
    setFormError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sequence.current += 1;
    activeController.current?.abort();
    activeController.current = null;
    setSearch({ status: "idle" });
    setFieldErrors({});
    setFormError("");

    const prepared = prepareCalendarEventSearchRequest({ query, from, through, timeZone, kind });
    if (!prepared.ok) {
      if (prepared.field === "form") {
        pendingFieldFocus.current = null;
        setFormError(prepared.message);
      } else {
        pendingFieldFocus.current = prepared.field;
        setFieldErrors({ [prepared.field]: prepared.message });
      }
      return;
    }

    const requestId = sequence.current;
    const controller = new AbortController();
    activeController.current = controller;
    setSearch({ status: "loading" });
    void searchCalendarEvents(prepared.request, controller.signal).then((events) => {
      if (controller.signal.aborted || requestId !== sequence.current) return;
      setSearch(events.length > 0 ? { status: "results", events } : { status: "empty" });
    }).catch((reason: unknown) => {
      if (controller.signal.aborted
        || (reason instanceof Error && reason.name === "AbortError")
        || requestId !== sequence.current) return;
      setSearch({
        status: "error",
        message: reason instanceof Error
          ? reason.message
          : "Could not search calendar events. Try again.",
      });
    }).finally(() => {
      if (requestId === sequence.current && activeController.current === controller) {
        activeController.current = null;
      }
    });
  }

  function selectEvent(event: CalendarEvent) {
    invalidateSearch();
    onSelect(event, searchHeading.current);
  }

  const queryId = `${ids}-query`;
  const queryHintId = `${ids}-query-hint`;
  const dateRangeHintId = `${ids}-date-range-hint`;
  const fromId = `${ids}-from`;
  const throughId = `${ids}-through`;
  const kindId = `${ids}-kind`;
  const queryErrorId = `${ids}-query-error`;
  const fromErrorId = `${ids}-from-error`;
  const throughErrorId = `${ids}-through-error`;
  const visibleSearch: SearchState = disabled ? { status: "idle" } : search;

  return (
    <section className={styles.searchPanel} aria-labelledby={`${ids}-heading`}>
      <div className={styles.searchHeading}>
        <div>
          <p className={styles.searchEyebrow}>Find an event</p>
          <h2 ref={searchHeading} id={`${ids}-heading`} tabIndex={-1}>Search calendar</h2>
        </div>
        <p className={styles.searchHint}>Search titles within an inclusive date window.</p>
      </div>
      <form id={formId} className={styles.searchForm} onSubmit={submit} noValidate>
        <div className={`${styles.searchField} ${styles.searchQuery}`}>
          <label htmlFor={queryId}>Title contains</label>
          <input
            ref={queryInput}
            id={queryId}
            type="search"
            autoComplete="off"
            value={query}
            disabled={disabled}
            aria-invalid={!!fieldErrors.query}
            aria-describedby={[queryHintId, fieldErrors.query ? queryErrorId : null].filter(Boolean).join(" ")}
            onChange={(event) => {
              invalidateSearch();
              setQuery(event.target.value);
            }}
          />
          <p id={queryHintId} className={styles.searchQueryHint}>
            Titles are limited to 120 code points · {Math.max(0, 120 - Array.from(query).length)} remaining
          </p>
          {fieldErrors.query && <p id={queryErrorId} className={styles.searchFieldError}>{fieldErrors.query}</p>}
        </div>
        <div className={styles.searchField}>
          <label htmlFor={fromId}>From</label>
          <input
            ref={fromInput}
            id={fromId}
            type="date"
            value={from}
            disabled={disabled}
            aria-invalid={!!fieldErrors.from}
            aria-describedby={[dateRangeHintId, fieldErrors.from ? fromErrorId : null].filter(Boolean).join(" ")}
            onChange={(event) => {
              invalidateSearch();
              setFrom(event.target.value);
            }}
          />
          {fieldErrors.from && <p id={fromErrorId} className={styles.searchFieldError}>{fieldErrors.from}</p>}
        </div>
        <div className={styles.searchField}>
          <label htmlFor={throughId}>Through</label>
          <input
            ref={throughInput}
            id={throughId}
            type="date"
            value={through}
            disabled={disabled}
            aria-invalid={!!fieldErrors.through}
            aria-describedby={[dateRangeHintId, fieldErrors.through ? throughErrorId : null].filter(Boolean).join(" ")}
            onChange={(event) => {
              invalidateSearch();
              setThrough(event.target.value);
            }}
          />
          {fieldErrors.through && <p id={throughErrorId} className={styles.searchFieldError}>{fieldErrors.through}</p>}
        </div>
        <div className={styles.searchField}>
          <label htmlFor={kindId}>Event type</label>
          <select
            id={kindId}
            value={kind}
            disabled={disabled}
            onChange={(event) => {
              invalidateSearch();
              setKind(event.target.value as CalendarEventSearchFields["kind"]);
            }}
          >
            <option value="">Any type</option>
            <option value="timed">Timed</option>
            <option value="all-day">All day</option>
          </select>
        </div>
        <p id={dateRangeHintId} className={styles.searchDateNote}>
          Both dates are included. Choose a window of 93 days or fewer. Times use {timeZone}.
        </p>
        <div className={styles.searchActions}>
          <button type="submit" disabled={disabled}>
          {visibleSearch.status === "loading" ? "Search again" : visibleSearch.status === "error" ? "Try again" : "Search events"}
          </button>
        </div>
        {formError && <p className={styles.searchFieldError} role="alert">{formError}</p>}
      </form>

      <div className={styles.searchFeedback} aria-live="polite" aria-atomic="true">
        {visibleSearch.status === "loading" && <p className={styles.searchStatus} role="status">Searching calendar…</p>}
        {visibleSearch.status === "empty" && <p className={styles.searchStatus} role="status">No matching events in this date window.</p>}
        {visibleSearch.status === "results" && (
          <p className={styles.searchStatus} role="status">
            {visibleSearch.events.length} {visibleSearch.events.length === 1 ? "event" : "events"} found.
          </p>
        )}
        {visibleSearch.status === "error" && <p className={styles.searchError} role="alert">{visibleSearch.message}</p>}
      </div>

      {visibleSearch.status === "results" && (
        <ul className={styles.searchResults} aria-label="Matching calendar events">
          {visibleSearch.events.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                className={styles.searchResult}
                disabled={disabled}
                onClick={() => selectEvent(event)}
              >
                <span className={styles.searchResultMain}>
                  <span className={styles.searchResultTitle}>{event.title}</span>
                  <span className={styles.searchResultDate}>{eventDateLabel(event, locale)}</span>
                </span>
                <span className={styles.searchResultKind}>{kindLabel(event)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
