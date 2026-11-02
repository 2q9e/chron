import { useEffect, useRef, type FormEvent, type RefObject } from "react";
import type {
  CalendarConflict,
  CalendarEvent,
  CalendarEventOccurrence,
  CalendarEventMutation,
  CalendarSeriesDraft,
} from "../domain/types";
import { reminderReviewText, type EventDraft, type EventDraftField } from "./calendar-model";
import {
  allDayCalendarReminderChoices,
  timedCalendarReminderChoices,
} from "../domain/reminders.ts";
import { CalendarReminderStatus } from "./calendar-reminder-status";
import styles from "./calendar.module.css";

export type Editor = {
  generation: number;
  event: CalendarEvent | null;
  occurrence?: CalendarEventOccurrence;
  occurrenceIndex?: number;
  occurrenceKey?: string;
  seriesScope?: "series" | "following";
  operationKey: string | null;
  operationAction: "create" | "update" | "delete" | "cancel-occurrence" | "restore-occurrence" | "move-occurrence" | "split-series" | null;
  draft: EventDraft;
  zone: string;
  errors: Partial<Record<EventDraftField, string>>;
  review: CalendarEventMutation | null;
  conflicts: readonly CalendarConflict[];
  reviewTimeZone: string | null;
  deleting: boolean;
  seriesDraft: CalendarSeriesDraft | null;
  purpose?: "move" | "move-occurrence" | "resize" | "restore";
  restoreOccurrence?: CalendarEventOccurrence;
  reviewCalendarTimeZone?: string;
};

type Props = {
  editor: Editor;
  busy: boolean;
  error: string;
  stale: boolean;
  retryOnly: boolean;
  reauthRequired: boolean;
  onChange: (field: keyof EventDraft, value: string) => void;
  onSeriesScopeChange: (scope: "series" | "following") => void;
  onReview: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onReloadLatest: () => void;
  onDeleteReview: () => void;
  onCancelOccurrenceReview: () => void;
  onRestoreOccurrenceReview: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onSave: () => void;
};

export function CalendarEditor({ editor, busy, error, stale, retryOnly, reauthRequired, onChange, onSeriesScopeChange, onReview, onClose, onReloadLatest, onDeleteReview, onCancelOccurrenceReview, onRestoreOccurrenceReview, onDeleteCancel, onDeleteConfirm, onSave }: Props) {
  const locked = busy || stale || retryOnly;
  const movementOnly = editor.purpose === "move-occurrence";
  const errorPanel = useRef<HTMLDivElement | null>(null);
  const seriesReviewHeading = useRef<HTMLHeadingElement | null>(null);
  const reminderOptions = editor.draft.kind === "timed"
    ? timedCalendarReminderChoices.map((value) => ({
        value,
        label: value === "none" ? "No reminder"
          : value === "at-start" ? "At event start"
            : value === "one-local-day-before" ? "One local day before, at the same time"
              : `${value.split("-")[0]} minutes before`,
      }))
    : allDayCalendarReminderChoices.map((value) => ({
        value,
        label: value === "none" ? "No reminder"
          : value === "event-day-9am" ? "9:00 AM on the first day"
            : "9:00 AM on the previous day",
      }));
  const reminderNote = editor.draft.reminderChoice === "none"
    ? "No email reminder is scheduled."
    : `Reminders go to your verified Chron email address. ${editor.draft.kind === "all-day" ? `All-day reminder time zone: ${editor.zone}.` : `Timed reminders use ${editor.zone}.`}`;
  const heading = editor.purpose === "restore"
    ? "Restore canceled occurrence"
    : editor.purpose === "move"
    ? editor.event?.recurrenceRule ? "Review series move" : "Review event move"
    : editor.purpose === "move-occurrence"
      ? "Move one occurrence"
    : editor.purpose === "resize"
      ? "Review event duration change"
      : editor.event?.recurrenceRule
        ? editor.seriesScope === "following" ? "Edit this and following occurrences" : "Edit recurring series"
        : editor.event
          ? "Edit event"
          : "New event";

  useEffect(() => {
    if (error && !busy) errorPanel.current?.focus();
  }, [busy, error]);

  useEffect(() => {
    if (editor.seriesDraft) seriesReviewHeading.current?.focus();
  }, [editor.seriesDraft]);

  useEffect(() => {
    if (Object.keys(editor.errors).length === 0) return;
    document.querySelector<HTMLElement>("#calendar-event-editor [aria-invalid='true']")?.focus();
  }, [editor.errors]);

  return (
    <section id="calendar-event-editor" className={styles.panel} aria-labelledby="editor-heading">
      <div className={styles.panelHeading}>
        <h2 id="editor-heading">{heading}</h2>
        <button type="button" onClick={onClose} disabled={busy || retryOnly}>Close</button>
      </div>
      {(editor.purpose === "move" || editor.purpose === "move-occurrence" || editor.purpose === "resize") && (
        <p className={styles.moveReviewNote}>
          {editor.purpose === "move-occurrence"
            ? "Only the occurrence you dragged will move. Its original series identity and duration stay the same; review the new time and any overlaps before approving."
            : editor.purpose === "move"
            ? editor.event?.recurrenceRule
              ? "This proposes moving the entire repeating series, not only the occurrence you dragged. Nothing is saved until you review the affected occurrences and approve the proposal."
              : "This proposed move is not saved yet. Review its dates, reminder, and conflicts before approving it."
            : "This proposed duration change is not saved yet. Review its end time, reminder, and conflicts before approving it."}
          {editor.draft.kind === "timed" && (
            <> The drop used {editor.reviewCalendarTimeZone ?? editor.zone}; this event remains in {editor.zone}.</>
          )}
        </p>
      )}
      {error && <div ref={errorPanel} className={styles.error} role="alert" tabIndex={-1}><p>{error}</p>{reauthRequired && <a className={styles.recoveryLink} href="/sign-in">Sign in again</a>}{stale && <button type="button" disabled={busy} onClick={onReloadLatest}>Discard edits and reload calendar</button>}</div>}
      {editor.purpose === "restore" ? (
        <div className={styles.review}>
          <h3>{editor.event?.title}</h3>
          {editor.restoreOccurrence && (
            <p>{editor.restoreOccurrence.kind === "all-day"
              ? `${editor.restoreOccurrence.startDate} through the day before ${editor.restoreOccurrence.endDate} · All day`
              : `${editor.restoreOccurrence.startLocal} to ${editor.restoreOccurrence.endLocal} · ${editor.restoreOccurrence.timeZone}`}</p>
          )}
          <p>This makes only this scheduled occurrence active again. Chron will check overlaps before you approve it.</p>
          <p>{editor.event?.reminderChoice === "none"
            ? "This series has no reminder for the occurrence."
            : "Only a future reminder that has not been attempted can be queued again. Chron will not resend reminders that were already attempted or sent."}</p>
          <button autoFocus type="button" disabled={locked || !editor.occurrenceKey} onClick={onRestoreOccurrenceReview}>
            {busy ? "Checking calendar…" : "Review restoration"}
          </button>
        </div>
      ) : (
      <form onSubmit={onReview} className={styles.form}>
        <label>
          Title
          <input autoFocus disabled={locked || movementOnly} required maxLength={160} value={editor.draft.title}
            onChange={(e) => onChange("title", e.target.value)}
            aria-invalid={!!editor.errors.title} aria-describedby={editor.errors.title ? "title-error" : undefined} />
        </label>
        {editor.errors.title && <p id="title-error" className={styles.fieldError}>{editor.errors.title}</p>}
        <label>
          Details
          <textarea disabled={locked || movementOnly} maxLength={4000} value={editor.draft.details} onChange={(e) => onChange("details", e.target.value)}
            aria-invalid={!!editor.errors.details} aria-describedby={editor.errors.details ? "details-error" : undefined} />
        </label>
        {editor.errors.details && <p id="details-error" className={styles.fieldError}>{editor.errors.details}</p>}
        <label>
          Event type
          <select disabled={locked || movementOnly} value={editor.draft.kind} onChange={(e) => onChange("kind", e.target.value)}>
            <option value="timed">Timed</option>
            <option value="all-day">All day</option>
          </select>
        </label>
        <fieldset className={styles.reminder}>
          <legend>Email reminder</legend>
          <label htmlFor="reminder-choice">Timing
            <select
              id="reminder-choice"
              disabled={locked || movementOnly}
              value={editor.draft.reminderChoice}
              onChange={(e) => onChange("reminderChoice", e.target.value)}
              aria-invalid={!!editor.errors.reminderChoice}
              aria-describedby={editor.errors.reminderChoice ? "reminder-choice-error" : "reminder-choice-note"}
            >
              {reminderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {editor.errors.reminderChoice
            ? <p id="reminder-choice-error" className={styles.fieldError}>{editor.errors.reminderChoice}</p>
            : <p id="reminder-choice-note" aria-live="polite">{reminderNote}</p>}
        </fieldset>
        {editor.event && <CalendarReminderStatus key={`${editor.event.id}:${editor.event.revision}`} event={editor.event} />}
        {(!editor.event || editor.event.recurrenceRule) && !movementOnly && (
          <fieldset className={styles.recurrence}>
            <legend>{editor.event ? "Repeating series" : "Repeat"}</legend>
            {editor.event?.recurrenceRule && editor.occurrence && editor.occurrenceIndex !== undefined && (
              <fieldset className={styles.recurrence}>
                <legend>Change scope</legend>
                <label>
                  <input
                    type="radio"
                    name="calendar-series-scope"
                    value="series"
                    checked={editor.seriesScope !== "following"}
                    disabled={locked}
                    onChange={() => onSeriesScopeChange("series")}
                  />
                  This series
                </label>
                <label>
                  <input
                    type="radio"
                    name="calendar-series-scope"
                    value="following"
                    checked={editor.seriesScope === "following"}
                    disabled={locked || editor.occurrenceIndex < 1}
                    onChange={() => onSeriesScopeChange("following")}
                  />
                  This and following occurrences
                </label>
                <p>
                  {editor.occurrenceIndex < 1
                    ? "The first occurrence starts the series, so it has no earlier segment to preserve."
                    : editor.seriesScope === "following"
                      ? "Earlier occurrences stay unchanged. This occurrence and later ones become a new segment."
                      : "Changes apply to every occurrence in this recurring segment."}
                </p>
              </fieldset>
            )}
            {editor.event && !editor.occurrence && <p>Changes apply to this recurring segment.</p>}
            {editor.event?.recurrenceRule && editor.seriesScope === "following" && (
              <p>The following segment keeps {editor.draft.repeatCount} remaining occurrences.</p>
            )}
            <label>
              Frequency
              <select
                id="repeat-frequency"
                disabled={locked}
                value={editor.draft.repeatFrequency}
                onChange={(e) => onChange("repeatFrequency", e.target.value)}
                aria-invalid={!!editor.errors.repeatFrequency}
                aria-describedby={editor.errors.repeatFrequency ? "repeat-frequency-error" : undefined}
              >
                {!editor.event && <option value="">Does not repeat</option>}
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>
            {editor.draft.repeatFrequency && (
              <>
                <label>
                  Repeat every
                  <select
                    id="repeat-interval"
                    disabled={locked}
                    value={editor.draft.repeatInterval}
                    onChange={(e) => onChange("repeatInterval", e.target.value)}
                    aria-invalid={!!editor.errors.repeatInterval}
                    aria-describedby={editor.errors.repeatInterval ? "repeat-interval-error" : undefined}
                  >
                    {[1, 2, 3, 4].map((interval) => (
                      <option key={interval} value={String(interval)}>{interval}</option>
                    ))}
                  </select>
                  {editor.draft.repeatFrequency === "daily" ? " days" : " weeks"}
                </label>
                {editor.errors.repeatInterval && <p id="repeat-interval-error" className={styles.fieldError}>{editor.errors.repeatInterval}</p>}
                <label>
                  Number of occurrences
                  <input
                    disabled={locked || editor.seriesScope === "following"}
                    type="number"
                    min={editor.seriesScope === "following" || editor.event?.recurrenceRule?.count === 1 ? 1 : 2}
                    max={366}
                    step={1}
                    required
                    value={editor.draft.repeatCount}
                    onChange={(e) => onChange("repeatCount", e.target.value)}
                    aria-invalid={!!editor.errors.repeatCount}
                    aria-describedby={editor.errors.repeatCount ? "repeat-count-error" : undefined}
                  />
                </label>
                {editor.seriesScope === "following" && <p>The number of remaining occurrences is preserved.</p>}
                {editor.errors.repeatCount && <p id="repeat-count-error" className={styles.fieldError}>{editor.errors.repeatCount}</p>}
                {editor.errors.repeatFrequency && <p id="repeat-frequency-error" className={styles.fieldError}>{editor.errors.repeatFrequency}</p>}
                <p>Repeating events are finite and end within 366 calendar dates.</p>
              </>
            )}
          </fieldset>
        )}
        {editor.draft.kind === "timed" ? (
          <>
            <p>Event time zone: {editor.zone}</p>
            {(["startLocal", "endLocal"] as const).map((field) => {
              const disambiguation = field === "startLocal" ? "startDisambiguation" : "endDisambiguation";
              return (
                <div key={field}>
                  <label>
                    {field === "startLocal" ? "Start" : "End"}
                    <input disabled={locked} type="datetime-local" required value={editor.draft[field]}
                      onChange={(e) => onChange(field, e.target.value)} aria-invalid={!!editor.errors[field]}
                      aria-describedby={editor.errors[field] ? `${field}-error` : undefined} />
                  </label>
                  {editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}
                  {editor.errors[disambiguation] && (
                    <label>
                      This time occurs twice. Choose an occurrence
                      <select id={`${field}-disambiguation`} disabled={locked} required value={editor.draft[disambiguation]} onChange={(e) => onChange(disambiguation, e.target.value)}
                        aria-invalid="true" aria-describedby={`${disambiguation}-error`}>
                        <option value="">Choose</option>
                        <option value="earlier">Earlier</option>
                        <option value="later">Later</option>
                      </select>
                      <span id={`${disambiguation}-error`} className={styles.fieldError}>{editor.errors[disambiguation]}</span>
                    </label>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <>
            {(["startDate", "endDate"] as const).map((field) => (
              <div key={field}>
                <label>
                  {field === "startDate" ? "First day" : "End date (exclusive)"}
                  <input disabled={locked} type="date" required value={editor.draft[field]} onChange={(e) => onChange(field, e.target.value)}
                    aria-invalid={!!editor.errors[field]} aria-describedby={editor.errors[field] ? `${field}-error` : undefined} />
                </label>
                {editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}
              </div>
            ))}
            <p>The end date is the first day outside the event.</p>
          </>
        )}
        <div className={styles.actions}>
          <button type="submit" disabled={locked}>{busy ? "Checking calendar…" : "Review changes"}</button>
          {!movementOnly && editor.event?.recurrenceRule && editor.occurrenceKey && <button type="button" disabled={locked} onClick={onCancelOccurrenceReview}>Cancel this occurrence</button>}
          {!movementOnly && editor.event && <button type="button" disabled={locked} onClick={onDeleteReview}>{editor.event.recurrenceRule ? "Delete series" : "Delete event"}</button>}
        </div>
      </form>
      )}
      {editor.seriesDraft && (
        <SeriesDraftReview
          draft={editor.seriesDraft}
          currentEvent={editor.event}
          headingRef={seriesReviewHeading}
          busy={busy || stale}
          cancelDisabled={retryOnly}
          onApprove={onSave}
          onCancel={onDeleteCancel}
        />
      )}
      {editor.review && <EventReview event={editor.review} conflicts={editor.conflicts} busy={busy || stale} retryOnly={retryOnly} onSave={onSave} />}
      {editor.deleting && (
        <div className={styles.review}>
          <h3>Delete this event?</h3>
          <p>{editor.event?.title}</p>
          <button type="button" disabled={locked} onClick={onDeleteConfirm}>{busy ? "Deleting…" : "Confirm deletion"}</button>
          <button type="button" disabled={locked} onClick={onDeleteCancel}>Keep event</button>
        </div>
      )}
    </section>
  );
}

function describeOccurrence(occurrence: CalendarSeriesDraft["afterOccurrences"][number]): string {
  return occurrence.kind === "all-day"
    ? `${occurrence.startDate} through the day before ${occurrence.endDate} · All day`
    : `${occurrence.startLocal} to ${occurrence.endLocal} · ${occurrence.timeZone}`;
}

function describeSeries(event: CalendarEvent | CalendarSeriesDraft["event"], rule: CalendarSeriesDraft["recurrenceRule"]): string {
  if (!event || !rule) return "";
  const cadence = rule.frequency === "daily" ? "day" : "week";
  const interval = rule.interval === 1 ? `every ${cadence}` : `every ${rule.interval} ${cadence}s`;
  const eventTimeZone = event.kind === "timed" ? ` · ${event.timeZone}` : " · All-day dates";
  return `${event.title} · ${rule.count} occurrences, ${interval}${eventTimeZone}`;
}

function SeriesDraftReview({
  draft,
  currentEvent,
  headingRef,
  busy,
  cancelDisabled,
  onApprove,
  onCancel,
}: {
  draft: CalendarSeriesDraft;
  currentEvent: CalendarEvent | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  cancelDisabled: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const isDelete = draft.action === "delete";
  const isOccurrenceCancellation = draft.action === "cancel-occurrence";
  const isOccurrenceRestoration = draft.action === "restore-occurrence";
  const isOccurrenceMovement = draft.action === "move-occurrence";
  const isSplit = draft.action === "split-series";
  const splitIndex = isSplit && draft.targetEventId
    ? draft.afterOccurrences.findIndex(({ occurrenceKey }) =>
        !occurrenceKey.startsWith(`${draft.targetEventId}:`)
      )
    : -1;
  const occurrences = isDelete ? draft.beforeOccurrences : draft.afterOccurrences;
  const headline = isDelete
    ? `Delete ${occurrences.length} occurrences?`
    : isOccurrenceCancellation
      ? `Cancel ${draft.beforeOccurrences.length === 1 ? "this occurrence" : "this date"}?`
      : isOccurrenceRestoration
        ? "Restore this occurrence?"
        : isOccurrenceMovement
          ? "Move this occurrence?"
        : isSplit
          ? `Keep ${splitIndex} earlier occurrences and split ${draft.afterOccurrences.length - splitIndex} following occurrences?`
    : draft.action === "create"
      ? `Create ${occurrences.length} occurrences?`
      : `Update ${draft.beforeOccurrences.length} current occurrences to ${draft.afterOccurrences.length} proposed occurrences?`;
  const candidateByKey = new Map(draft.afterOccurrences.map((occurrence) => [
    occurrence.occurrenceKey,
    occurrence,
  ]));

  return (
    <div className={styles.review}>
      <h3 ref={headingRef} tabIndex={-1}>{isOccurrenceCancellation
        ? "Review occurrence cancellation"
        : isOccurrenceRestoration ? "Review occurrence restoration"
          : isOccurrenceMovement ? "Review occurrence move"
            : isSplit ? "Review this and following occurrences" : "Review repeating series"}</h3>
      <p><strong>{headline}</strong></p>
      {draft.action === "create" && draft.event && (
        <p><strong>Proposed:</strong> {describeSeries(draft.event, draft.recurrenceRule)} · Calendar time zone {draft.calendarTimeZone}</p>
      )}
      {draft.action !== "delete" && draft.action !== "cancel-occurrence"
        && draft.action !== "restore-occurrence" && draft.event && (
        <p aria-live="polite">{reminderReviewText(
          draft.event,
          isSplit ? draft.afterOccurrences[splitIndex] : draft.afterOccurrences[0],
        )}</p>
      )}
      {draft.action === "update" && currentEvent && draft.event && (
        <dl className={styles.seriesSummary}>
          <div><dt>Current</dt><dd>{describeSeries(currentEvent, currentEvent.recurrenceRule ?? null)}</dd></div>
          <div><dt>Proposed</dt><dd>{describeSeries(draft.event, draft.recurrenceRule)} · Calendar time zone {draft.calendarTimeZone}</dd></div>
        </dl>
      )}
      {isSplit && currentEvent && draft.event && (
        <dl className={styles.seriesSummary}>
          <div><dt>Unchanged earlier segment</dt><dd>{describeSeries(
            currentEvent,
            currentEvent.recurrenceRule
              ? { ...currentEvent.recurrenceRule, count: splitIndex }
              : null,
          )}</dd></div>
          <div><dt>New following segment</dt><dd>{describeSeries(draft.event, draft.recurrenceRule)} · Calendar time zone {draft.calendarTimeZone}</dd></div>
        </dl>
      )}
      {isDelete && currentEvent && (
        <p><strong>Current:</strong> {describeSeries(currentEvent, currentEvent.recurrenceRule ?? null)}</p>
      )}
      <p>This proposal expires at {new Date(draft.expiresAt).toLocaleString()}.</p>
      {isOccurrenceCancellation ? (
        <ol className={styles.seriesOccurrences}>
          {draft.beforeOccurrences.map((occurrence) => (
            <li key={occurrence.occurrenceKey}>{describeOccurrence(occurrence)}</li>
          ))}
        </ol>
      ) : isOccurrenceRestoration ? (
        <ol className={styles.seriesOccurrences}>
          {draft.afterOccurrences.map((occurrence) => (
            <li key={occurrence.occurrenceKey}>{describeOccurrence(occurrence)}</li>
          ))}
        </ol>
      ) : isOccurrenceMovement ? (
        <dl className={styles.seriesSummary}>
          <div><dt>Current</dt><dd>{draft.beforeOccurrences.map(describeOccurrence).join(" · ")}</dd></div>
          <div><dt>Proposed</dt><dd>{draft.afterOccurrences.map(describeOccurrence).join(" · ")}</dd></div>
        </dl>
      ) : isSplit ? (
        <>
          <details className={styles.seriesOccurrences}>
            <summary>View {splitIndex} unchanged earlier occurrences</summary>
            <ol>{draft.beforeOccurrences.slice(0, splitIndex).map((occurrence) => (
              <li key={occurrence.occurrenceKey}>{describeOccurrence(occurrence)}</li>
            ))}</ol>
          </details>
          <details className={styles.seriesOccurrences}>
            <summary>View {draft.afterOccurrences.length - splitIndex} following occurrences</summary>
            <ol>{draft.afterOccurrences.slice(splitIndex).map((occurrence) => (
              <li key={occurrence.occurrenceKey}>{describeOccurrence(occurrence)}</li>
            ))}</ol>
          </details>
        </>
      ) : draft.action === "update" ? (
        <>
          <details className={styles.seriesOccurrences}>
            <summary>View all {draft.beforeOccurrences.length} current occurrences</summary>
            <ol>{draft.beforeOccurrences.map((occurrence) => (
              <li key={occurrence.occurrenceKey}>{describeOccurrence(occurrence)}</li>
            ))}</ol>
          </details>
          <details className={styles.seriesOccurrences}>
            <summary>View all {draft.afterOccurrences.length} proposed occurrences</summary>
            <ol>{draft.afterOccurrences.map((occurrence) => (
              <li key={occurrence.occurrenceKey}>{describeOccurrence(occurrence)}</li>
            ))}</ol>
          </details>
        </>
      ) : occurrences.length > 0 && (
        <details className={styles.seriesOccurrences}>
          <summary>View all {occurrences.length} {isDelete ? "current" : "proposed"} occurrences</summary>
          <ol>{occurrences.map((occurrence) => (
            <li key={occurrence.occurrenceKey}>{describeOccurrence(occurrence)}</li>
          ))}</ol>
        </details>
      )}
      {draft.conflicts.length === 0 ? (
        <p className={styles.conflictStatus}>{isOccurrenceCancellation
          ? "Only this scheduled occurrence changes. Chron cancels queued reminders; one already being delivered may still arrive."
          : isOccurrenceRestoration
            ? `No overlaps were found for this occurrence in ${draft.calendarTimeZone}.`
            : isOccurrenceMovement
              ? `No overlaps were found for this occurrence in ${draft.calendarTimeZone}.`
              : isSplit
                ? `No overlaps were found in the new following segment in ${draft.calendarTimeZone}.`
            : "No overlaps were found in the proposed series."}</p>
      ) : (
        <div className={styles.conflictList}>
          <h4>{draft.conflicts.length} overlapping occurrences</h4>
          <ul>
            {draft.conflicts.map((conflict) => {
              const candidate = candidateByKey.get(conflict.candidateOccurrenceKey);
              return (
                <li key={`${conflict.candidateOccurrenceKey}:${conflict.conflictingEventId}:${conflict.conflictingOccurrence.occurrenceKey}`}>
                  <strong>{conflict.conflictingTitle}</strong>
                  <span>{candidate ? `Proposed: ${describeOccurrence(candidate)} · ` : ""}Conflicts with {describeOccurrence(conflict.conflictingOccurrence)}.</span>
                </li>
              );
            })}
          </ul>
          <p className={styles.conflictStatus}>{isOccurrenceCancellation || isOccurrenceRestoration
            ? "Review each overlap before approving this occurrence."
            : isSplit
              ? "Review each overlap in the new following segment before approving the split."
            : "Review each overlap before approving the series."}</p>
        </div>
      )}
      <button type="button" disabled={busy} onClick={onApprove}>
        {busy ? "Approving…" : isDelete
          ? "Approve and delete series"
          : isOccurrenceCancellation
            ? "Approve occurrence cancellation"
            : isOccurrenceRestoration ? "Approve restoration"
              : isOccurrenceMovement ? "Approve occurrence move"
                : isSplit ? "Approve following occurrences" : "Approve series changes"}
      </button>
      {isDelete && <button type="button" disabled={busy || cancelDisabled} onClick={onCancel}>Keep series</button>}
      {isOccurrenceCancellation && <button type="button" disabled={busy || cancelDisabled} onClick={onCancel}>Keep occurrence</button>}
      {isOccurrenceRestoration && <button type="button" disabled={busy || cancelDisabled} onClick={onCancel}>Keep occurrence cancelled</button>}
      {isOccurrenceMovement && <button type="button" disabled={busy || cancelDisabled} onClick={onCancel}>Keep current time</button>}
    </div>
  );
}

function EventReview({ event, conflicts, busy, retryOnly, onSave }: { event: CalendarEventMutation; conflicts: readonly CalendarConflict[]; busy: boolean; retryOnly: boolean; onSave: () => void }) {
  const occurrence = (value: "earlier" | "later" | undefined) => value ? ` (${value} occurrence)` : "";
  return (
    <div className={styles.review}>
      <h3>Review event</h3>
      <p><strong>{event.title}</strong></p>
      <p>{event.kind === "timed"
        ? `${event.startLocal}${occurrence(event.startDisambiguation)} to ${event.endLocal}${occurrence(event.endDisambiguation)} · ${event.timeZone}`
        : `${event.startDate} through the day before ${event.endDate} · All day`}</p>
      <p aria-live="polite">{reminderReviewText(event)}</p>
      {event.details && <p className={styles.details}>{event.details}</p>}
      <ConflictSummary conflicts={conflicts} />
      <button type="button" disabled={busy} onClick={onSave}>{busy ? "Saving…" : retryOnly ? "Retry approved save" : "Approve and save"}</button>
    </div>
  );
}

function ConflictSummary({ conflicts }: { conflicts: readonly CalendarConflict[] }) {
  if (conflicts.length === 0) {
    return <p className={styles.conflictStatus}>No overlapping events were found.</p>;
  }

  return (
    <div className={styles.conflictList}>
      <h4>{conflicts.length === 1 ? "Overlapping event" : `${conflicts.length} overlapping events`}</h4>
      <ul>
        {conflicts.map((conflict) => (
          <li key={conflict.id}>
            <strong>{conflict.title}</strong>
            <span>{conflict.kind === "all-day"
              ? `${conflict.startDate} through the day before ${conflict.endDate} · All day`
              : `${conflict.startLocal} to ${conflict.endLocal} · ${conflict.timeZone}`}</span>
          </li>
        ))}
      </ul>
      <p className={styles.conflictStatus}>Review the overlaps before approving this event.</p>
    </div>
  );
}
