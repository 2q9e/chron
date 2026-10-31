import type { FormEvent } from "react";
import type { CalendarEvent, CalendarEventMutation } from "../domain/types";
import type { EventDraft, EventDraftField } from "./calendar-model";
import styles from "./calendar.module.css";

export type Editor = {
  event: CalendarEvent | null;
  draft: EventDraft;
  zone: string;
  errors: Partial<Record<EventDraftField, string>>;
  review: CalendarEventMutation | null;
  deleting: boolean;
};

type Props = {
  editor: Editor;
  busy: boolean;
  onChange: (field: keyof EventDraft, value: string) => void;
  onReview: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onDeleteReview: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
  onSave: () => void;
};

export function CalendarEditor({ editor, busy, onChange, onReview, onClose, onDeleteReview, onDeleteCancel, onDeleteConfirm, onSave }: Props) {
  return (
    <section className={styles.panel} aria-labelledby="editor-heading">
      <div className={styles.panelHeading}>
        <h2 id="editor-heading">{editor.event ? "Edit event" : "New event"}</h2>
        <button type="button" onClick={onClose} disabled={busy}>Close</button>
      </div>
      <form onSubmit={onReview} className={styles.form}>
        <label>
          Title
          <input autoFocus required maxLength={160} value={editor.draft.title}
            onChange={(e) => onChange("title", e.target.value)}
            aria-invalid={!!editor.errors.title} aria-describedby={editor.errors.title ? "title-error" : undefined} />
        </label>
        {editor.errors.title && <p id="title-error" className={styles.fieldError}>{editor.errors.title}</p>}
        <label>
          Details
          <textarea maxLength={4000} value={editor.draft.details} onChange={(e) => onChange("details", e.target.value)} />
        </label>
        <label>
          Event type
          <select value={editor.draft.kind} onChange={(e) => onChange("kind", e.target.value)}>
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
                    <input type="datetime-local" required value={editor.draft[field]}
                      onChange={(e) => onChange(field, e.target.value)} aria-invalid={!!editor.errors[field]}
                      aria-describedby={editor.errors[field] ? `${field}-error` : undefined} />
                  </label>
                  {editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}
                  {editor.errors[disambiguation] && (
                    <label>
                      This time occurs twice. Choose an occurrence
                      <select required value={editor.draft[disambiguation]} onChange={(e) => onChange(disambiguation, e.target.value)}>
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
                  <input type="date" required value={editor.draft[field]} onChange={(e) => onChange(field, e.target.value)}
                    aria-invalid={!!editor.errors[field]} aria-describedby={editor.errors[field] ? `${field}-error` : undefined} />
                </label>
                {editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}
              </div>
            ))}
            <p>The end date is the first day outside the event.</p>
          </>
        )}
        <div className={styles.actions}>
          <button type="submit" disabled={busy}>Review changes</button>
          {editor.event && <button type="button" disabled={busy} onClick={onDeleteReview}>Delete event</button>}
        </div>
      </form>
      {editor.review && <EventReview event={editor.review} busy={busy} onSave={onSave} />}
      {editor.deleting && (
        <div className={styles.review}>
          <h3>Delete this event?</h3>
          <p>{editor.event?.title}</p>
          <button type="button" disabled={busy} onClick={onDeleteConfirm}>{busy ? "Deleting…" : "Confirm deletion"}</button>
          <button type="button" disabled={busy} onClick={onDeleteCancel}>Keep event</button>
        </div>
      )}
    </section>
  );
}

function EventReview({ event, busy, onSave }: { event: CalendarEventMutation; busy: boolean; onSave: () => void }) {
  const occurrence = (value: "earlier" | "later" | undefined) => value ? ` (${value} occurrence)` : "";
  return (
    <div className={styles.review}>
      <h3>Review event</h3>
      <p><strong>{event.title}</strong></p>
      <p>{event.kind === "timed"
        ? `${event.startLocal}${occurrence(event.startDisambiguation)} to ${event.endLocal}${occurrence(event.endDisambiguation)} · ${event.timeZone}`
        : `${event.startDate} through the day before ${event.endDate} · All day`}</p>
      {event.details && <p className={styles.details}>{event.details}</p>}
      <button type="button" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Approve and save"}</button>
    </div>
  );
}
