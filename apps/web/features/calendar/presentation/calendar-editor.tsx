import { useEffect, useRef, type FormEvent } from "react";
import type {
  CalendarConflict,
  CalendarEvent,
  CalendarEventMutation,
  CalendarSeriesDraft,
} from "../domain/types";
import type { EventDraft, EventDraftField } from "./calendar-model";
import styles from "./calendar.module.css";

export type Editor = {
  generation: number;
  event: CalendarEvent | null;
  operationKey: string | null;
  operationAction: "create" | "update" | "delete" | null;
  draft: EventDraft;
  zone: string;
  errors: Partial<Record<EventDraftField, string>>;
  review: CalendarEventMutation | null;
  conflicts: readonly CalendarConflict[];
  reviewTimeZone: string | null;
  deleting: boolean;
  seriesDraft: CalendarSeriesDraft | null;
};

type Props = {
  editor: Editor;
  busy: boolean;
  error: string;
  stale: boolean;
  retryOnly: boolean;
  reauthRequired: boolean;
  onChange: (field: keyof EventDraft, value: string) => void;
  onReview: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onReloadLatest: () => void;
  onDeleteReview: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onSave: () => void;
};

export function CalendarEditor({ editor, busy, error, stale, retryOnly, reauthRequired, onChange, onReview, onClose, onReloadLatest, onDeleteReview, onDeleteCancel, onDeleteConfirm, onSave }: Props) {
  const locked = busy || stale || retryOnly;
  const errorPanel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (error && !busy) errorPanel.current?.focus();
  }, [busy, error]);

  useEffect(() => {
    if (Object.keys(editor.errors).length === 0) return;
    document.querySelector<HTMLElement>("#calendar-event-editor [aria-invalid='true']")?.focus();
  }, [editor.errors]);

  return (
    <section id="calendar-event-editor" className={styles.panel} aria-labelledby="editor-heading">
      <div className={styles.panelHeading}>
        <h2 id="editor-heading">{editor.event?.recurrenceRule ? "Edit recurring series" : editor.event ? "Edit event" : "New event"}</h2>
        <button type="button" onClick={onClose} disabled={busy || retryOnly}>Close</button>
      </div>
      {error && <div ref={errorPanel} className={styles.error} role="alert" tabIndex={-1}><p>{error}</p>{reauthRequired && <a className={styles.recoveryLink} href="/sign-in">Sign in again</a>}{stale && <button type="button" disabled={busy} onClick={onReloadLatest}>Discard edits and reload calendar</button>}</div>}
      <form onSubmit={onReview} className={styles.form}>
        <label>
          Title
          <input autoFocus disabled={locked} required maxLength={160} value={editor.draft.title}
            onChange={(e) => onChange("title", e.target.value)}
            aria-invalid={!!editor.errors.title} aria-describedby={editor.errors.title ? "title-error" : undefined} />
        </label>
        {editor.errors.title && <p id="title-error" className={styles.fieldError}>{editor.errors.title}</p>}
        <label>
          Details
          <textarea disabled={locked} maxLength={4000} value={editor.draft.details} onChange={(e) => onChange("details", e.target.value)}
            aria-invalid={!!editor.errors.details} aria-describedby={editor.errors.details ? "details-error" : undefined} />
        </label>
        {editor.errors.details && <p id="details-error" className={styles.fieldError}>{editor.errors.details}</p>}
        <label>
          Event type
          <select disabled={locked} value={editor.draft.kind} onChange={(e) => onChange("kind", e.target.value)}>
            <option value="timed">Timed</option>
            <option value="all-day">All day</option>
          </select>
        </label>
        {(!editor.event || editor.event.recurrenceRule) && (
          <fieldset className={styles.recurrence}>
            <legend>{editor.event ? "Repeating series" : "Repeat"}</legend>
            {editor.event && <p>Changes apply to the entire series.</p>}
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
                    disabled={locked}
                    type="number"
                    min={2}
                    max={366}
                    step={1}
                    required
                    value={editor.draft.repeatCount}
                    onChange={(e) => onChange("repeatCount", e.target.value)}
                    aria-invalid={!!editor.errors.repeatCount}
                    aria-describedby={editor.errors.repeatCount ? "repeat-count-error" : undefined}
                  />
                </label>
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
          {editor.event && <button type="button" disabled={locked} onClick={onDeleteReview}>{editor.event.recurrenceRule ? "Delete series" : "Delete event"}</button>}
        </div>
      </form>
      {editor.seriesDraft && (
        <SeriesDraftReview
          draft={editor.seriesDraft}
          currentEvent={editor.event}
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
  busy,
  cancelDisabled,
  onApprove,
  onCancel,
}: {
  draft: CalendarSeriesDraft;
  currentEvent: CalendarEvent | null;
  busy: boolean;
  cancelDisabled: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const isDelete = draft.action === "delete";
  const occurrences = isDelete ? draft.beforeOccurrences : draft.afterOccurrences;
  const headline = isDelete
    ? `Delete ${occurrences.length} occurrences?`
    : draft.action === "create"
      ? `Create ${occurrences.length} occurrences?`
      : `Update ${draft.beforeOccurrences.length} current occurrences to ${draft.afterOccurrences.length} proposed occurrences?`;
  const candidateByKey = new Map(draft.afterOccurrences.map((occurrence) => [
    occurrence.occurrenceKey,
    occurrence,
  ]));

  return (
    <div className={styles.review}>
      <h3>Review repeating series</h3>
      <p><strong>{headline}</strong></p>
      {draft.action === "create" && draft.event && (
        <p><strong>Proposed:</strong> {describeSeries(draft.event, draft.recurrenceRule)} · Calendar time zone {draft.calendarTimeZone}</p>
      )}
      {draft.action === "update" && currentEvent && draft.event && (
        <dl className={styles.seriesSummary}>
          <div><dt>Current</dt><dd>{describeSeries(currentEvent, currentEvent.recurrenceRule ?? null)}</dd></div>
          <div><dt>Proposed</dt><dd>{describeSeries(draft.event, draft.recurrenceRule)} · Calendar time zone {draft.calendarTimeZone}</dd></div>
        </dl>
      )}
      {isDelete && currentEvent && (
        <p><strong>Current:</strong> {describeSeries(currentEvent, currentEvent.recurrenceRule ?? null)}</p>
      )}
      <p>This proposal expires at {new Date(draft.expiresAt).toLocaleString()}.</p>
      {draft.action === "update" ? (
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
        <p className={styles.conflictStatus}>No overlaps were found in the proposed series.</p>
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
          <p className={styles.conflictStatus}>Review each overlap before approving the series.</p>
        </div>
      )}
      <button type="button" disabled={busy} onClick={onApprove}>
        {busy ? "Approving…" : isDelete ? "Approve and delete series" : "Approve series changes"}
      </button>
      {isDelete && <button type="button" disabled={busy || cancelDisabled} onClick={onCancel}>Keep series</button>}
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
