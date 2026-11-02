"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent, CalendarReminderStatusSummary } from "../domain/types";
import { CalendarRequestError, fetchCalendarReminderStatus } from "./calendar-api";
import styles from "./calendar.module.css";

type StatusState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "loaded"; summary: CalendarReminderStatusSummary }>
  | Readonly<{ kind: "error"; message: string; signInRequired: boolean }>;

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatInstant(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function failureMessages(summary: CalendarReminderStatusSummary): string[] {
  const messages: string[] = [];
  const { failureCounts } = summary;
  if (failureCounts.accountEmail > 0) {
    messages.push("The account email was invalid or unverified when Chron tried these reminders. Check it before relying on future reminders.");
  }
  if (failureCounts.configuration > 0) {
    messages.push("Email sending is not configured on this site.");
  }
  if (failureCounts.provider > 0) {
    messages.push("The email provider rejected one or more reminders.");
  }
  if (failureCounts.temporary > 0) {
    messages.push("A temporary sending error affected one or more reminders.");
  }
  if (failureCounts.other > 0) {
    messages.push("Chron could not send one or more reminders.");
  }
  if (summary.failed > 0) {
    messages.push("Failed reminders are not retried automatically.");
  }
  return messages;
}

export function CalendarReminderStatus({ event }: { event: CalendarEvent }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StatusState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetchCalendarReminderStatus(event.id, controller.signal)
      .then((summary) => {
        if (!controller.signal.aborted) setState({ kind: "loaded", summary });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: reason instanceof Error ? reason.message : "Chron could not load saved reminder status.",
          signInRequired: reason instanceof CalendarRequestError && reason.status === 401,
        });
      });
    return () => controller.abort();
  }, [attempt, event.id]);

  const timeZone = event.kind === "timed"
    ? event.timeZone
    : event.reminderTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const visibleCounts = state.kind === "loaded"
    ? ([
        [state.summary.pending, "scheduled"],
        [state.summary.leased, "sending"],
        [state.summary.sent, "accepted by email server"],
        [state.summary.failed, "failed"],
        [state.summary.cancelled, "cancelled"],
      ] as const)
        .filter(([count]) => count > 0)
        .map(([count, label]) => formatCount(count, label, label))
    : [];

  return (
    <section className={styles.reminderStatus} aria-labelledby="reminder-status-heading">
      <h3 id="reminder-status-heading">Saved reminder delivery</h3>
      <p className={styles.reminderStatusNote}>This reflects the saved event. Your current edits take effect after approval.</p>
      {state.kind === "loading" && <p role="status">Loading saved reminder status…</p>}
      {state.kind === "error" && (
        <div role="alert">
          <p>{state.message}</p>
          {state.signInRequired && <a href="/sign-in">Sign in again</a>}
          <button type="button" onClick={() => {
            setState({ kind: "loading" });
            setAttempt((value) => value + 1);
          }}>Retry status check</button>
        </div>
      )}
      {state.kind === "loaded" && (
        <div aria-live="polite">
          {state.summary.total === 0
            ? <p>{event.reminderChoice === "none"
              ? "No email reminder is saved for this event."
              : "No delivery records are available for this saved reminder."}</p>
            : <>
                <p className={styles.reminderStatusCounts}>{visibleCounts.join(" · ")}</p>
                {state.summary.pending > 0 && state.summary.nextAttemptAt && (
                  <p>Next send attempt time: {formatInstant(state.summary.nextAttemptAt, timeZone)} ({timeZone}).</p>
                )}
                {state.summary.retrying > 0 && (
                  <p>{formatCount(state.summary.retrying, "reminder")} {state.summary.retrying === 1 ? "is" : "are"} queued for another attempt after an earlier error.</p>
                )}
                {state.summary.lastAcceptedAt && (
                  <p>Last accepted: {formatInstant(state.summary.lastAcceptedAt, timeZone)} ({timeZone}).</p>
                )}
                {failureMessages(state.summary).map((message) => <p key={message}>{message}</p>)}
                {state.summary.sent > 0 && (
                  <p className={styles.reminderStatusNote}>Accepted means Chron’s email server accepted the message; inbox delivery is not confirmed.</p>
                )}
              </>}
        </div>
      )}
    </section>
  );
}
