import type { FormEvent } from "react";
import type { CalendarConflict, CalendarEvent, CalendarEventMutation } from "../domain/types";
import type { EventDraft, EventDraftField } from "./calendar-model";
import styles from "./calendar.module.css";

export type Editor = {
  generation: number;
  event: CalendarEvent | null;
  draft: EventDraft;
  zone: string;
  errors: Partial<Record<EventDraftField, string>>;
  review: CalendarEventMutation | null;
  conflicts: readonly CalendarConflict[];
  reviewTimeZone: string | null;
  deleting: boolean;
};

type Props = {
  editor: Editor;
  busy: boolean;
  error: string;
  stale: boolean;
  onChange: (field: keyof EventDraft, value: string) => void;
  onReview: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onReloadLatest: () => void;
  onDeleteReview: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onSave: () => void;
};

export function CalendarEditor({ editor, busy, error, stale, onChange, onReview, onClose, onReloadLatest, onDeleteReview, onDeleteCancel, onDeleteConfirm, onSave }: Props) {
  return (
    <section className={styles.panel} aria-labelledby="editor-heading">
      <div className={styles.panelHeading}>
        <h2 id="editor-heading">{editor.event ? "Edit event" : "New event"}</h2>
        <button type="button" onClick={onClose} disabled={busy}>Close</button>
      </div>
      {error && <div className={styles.error} role="alert"><p>{error}</p>{stale && <button type="button" disabled={busy} onClick={onReloadLatest}>Discard edits and reload calendar</button>}</div>}
      <form onSubmit={onReview} className={styles.form}>
        <label>
          Title
          <input autoFocus disabled={busy || stale} required maxLength={160} value={editor.draft.title}
            onChange={(e) => onChange("title", e.target.value)}
            aria-invalid={!!editor.errors.title} aria-describedby={editor.errors.title ? "title-error" : undefined} />
        </label>
        {editor.errors.title && <p id="title-error" className={styles.fieldError}>{editor.errors.title}</p>}
        <label>
          Details
          <textarea disabled={busy || stale} maxLength={4000} value={editor.draft.details} onChange={(e) => onChange("details", e.target.value)} />
        </label>
        <label>
          Event type
          <select disabled={busy || stale} value={editor.draft.kind} onChange={(e) => onChange("kind", e.target.value)}>
            <option value="timed">Timed</option>
            <option value="all-day">All day</option>
          </select>
        </label>
        {editor.draft.kind === "timed" ? (
          <>
            <p>Event time zone: {editor.zone}</p>
            {(["startLocal", "endLocal"] as const).map((field) => {
              const disambiguation = field === "startLocal" ? "startDisambiguation" : "endDisambiguation";
              return (
                <div key={field}>
                  <label>
                    {field === "startLocal" ? "Start" : "End"}
                    <input disabled={busy || stale} type="datetime-local" required value={editor.draft[field]}
                      onChange={(e) => onChange(field, e.target.value)} aria-invalid={!!editor.errors[field]}
                      aria-describedby={editor.errors[field] ? `${field}-error` : undefined} />
                  </label>
                  {editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}
                  {editor.errors[disambiguation] && (
                    <label>
                      This time occurs twice. Choose an occurrence
                      <select disabled={busy || stale} required value={editor.draft[disambiguation]} onChange={(e) => onChange(disambiguation, e.target.value)}>
                        <option value="">Choose</option>
                        <option value="earlier">Earlier</option>
                        <option value="later">Later</option>
                      </select>
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
                  <input disabled={busy || stale} type="date" required value={editor.draft[field]} onChange={(e) => onChange(field, e.target.value)}
                    aria-invalid={!!editor.errors[field]} aria-describedby={editor.errors[field] ? `${field}-error` : undefined} />
                </label>
                {editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}
              </div>
            ))}
            <p>The end date is the first day outside the event.</p>
          </>
        )}
        <div className={styles.actions}>
          <button type="submit" disabled={busy || stale}>{busy ? "Checking calendar…" : "Review changes"}</button>
          {editor.event && <button type="button" disabled={busy || stale} onClick={onDeleteReview}>Delete event</button>}
        </div>
      </form>
      {editor.review && <EventReview event={editor.review} conflicts={editor.conflicts} busy={busy || stale} onSave={onSave} />}
      {editor.deleting && (
        <div className={styles.review}>
          <h3>Delete this event?</h3>
          <p>{editor.event?.title}</p>
          <button type="button" disabled={busy || stale} onClick={onDeleteConfirm}>{busy ? "Deleting…" : "Confirm deletion"}</button>
          <button type="button" disabled={busy || stale} onClick={onDeleteCancel}>Keep event</button>
        </div>
      )}
    </section>
  );
}

function EventReview({ event, conflicts, busy, onSave }: { event: CalendarEventMutation; conflicts: readonly CalendarConflict[]; busy: boolean; onSave: () => void }) {
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
      <button type="button" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Approve and save"}</button>
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
