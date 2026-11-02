import { Temporal } from "@js-temporal/polyfill";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { CalendarEventEntry } from "../domain/types";
import { calendarMinuteAtPointer } from "./calendar-move.ts";
import styles from "./calendar.module.css";

export type CalendarMoveAction = (
  event: CalendarEventEntry,
  targetDate: string,
  targetMinute: number | null,
  calendarTimeZone: string,
) => void;

type DropTarget = Readonly<{
  date: string;
  minute: number | null;
  timeZone: string;
  key: string;
  element: HTMLElement;
}>;

type PointerInteraction = {
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  target: DropTarget | null;
};

type Props = Readonly<{
  event: CalendarEventEntry;
  calendarTimeZone: string;
  locale: string;
  timeLabel: string;
  accessibleLabel: string;
  onSelect: (event: CalendarEventEntry) => void;
  onMove?: CalendarMoveAction;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}>;

function targetAtPoint(clientX: number, clientY: number): DropTarget | null {
  const hit = document.elementFromPoint(clientX, clientY);
  const element = hit?.closest<HTMLElement>("[data-calendar-drop-date]");
  const date = element?.dataset.calendarDropDate;
  const timeZone = element?.dataset.calendarDropTimeZone;
  if (!element || !date || !timeZone) return null;

  const track = element.matches("[data-calendar-drop-track]")
    ? element
    : element.closest<HTMLElement>("[data-calendar-drop-track]");
  const dayDurationMinutes = track ? Number(track.dataset.calendarDayMinutes) : null;
  const minute = track && timeZone && dayDurationMinutes !== null
    ? calendarMinuteAtPointer(
      clientY,
      track.getBoundingClientRect().top,
      track.getBoundingClientRect().height,
      dayDurationMinutes,
    )
    : null;

  return {
    date,
    minute,
    timeZone,
    key: `${date}:${minute ?? "date"}`,
    element,
  };
}

function removeTargetHighlight(target: DropTarget | null): void {
  target?.element.removeAttribute("data-calendar-drop-active");
  target?.element.style.removeProperty("--calendar-drop-progress");
}

function showTargetHighlight(target: DropTarget): void {
  target.element.setAttribute("data-calendar-drop-active", "true");
  if (target.minute === null || !target.element.matches("[data-calendar-drop-track]")) return;
  const dayDurationMinutes = Number(target.element.dataset.calendarDayMinutes);
  if (dayDurationMinutes > 0) {
    target.element.style.setProperty(
      "--calendar-drop-progress",
      `${(target.minute / dayDurationMinutes) * 100}%`,
    );
  }
}

function announceTarget(target: DropTarget, locale: string): string {
  const targetDate = Temporal.PlainDate.from(target.date);
  const day = targetDate.toLocaleString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (target.minute === null) return `Drop on ${day} to keep the displayed time in ${target.timeZone}.`;
  const dayStart = targetDate.toZonedDateTime(target.timeZone).toInstant();
  const targetInstant = dayStart.add({ minutes: target.minute });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: target.timeZone,
  }).format(new Date(Number(targetInstant.epochMilliseconds)));
  return `Drop on ${day} at ${time} in ${target.timeZone}.`;
}

export function CalendarEventControl({
  event,
  calendarTimeZone,
  locale,
  timeLabel,
  accessibleLabel,
  onSelect,
  onMove,
  compact = false,
  className,
  style,
}: Props) {
  const calendarEvent = event;
  const interaction = useRef<PointerInteraction | null>(null);
  const suppressNextClick = useRef(false);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const canMove = !!onMove
    && !("series" in event)
    && !("recurrenceRule" in event && event.recurrenceRule);

  function updateDropTarget(current: PointerInteraction, clientX: number, clientY: number): void {
    const next = targetAtPoint(clientX, clientY);
    if (current.target?.key === next?.key) return;
    removeTargetHighlight(current.target);
    current.target = next;
    if (next) {
      showTargetHighlight(next);
      setDragAnnouncement(announceTarget(next, locale));
    } else {
      setDragAnnouncement("Move over a calendar day or time to choose a destination.");
    }
  }

  function beginInteraction(event: ReactPointerEvent<HTMLButtonElement>): void {
    if (!canMove || event.button !== 0 || !event.isPrimary) return;
    interaction.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      target: null,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueInteraction(event: ReactPointerEvent<HTMLButtonElement>): void {
    const current = interaction.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!current.dragging) {
      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      if (distance < 7) return;
      current.dragging = true;
      setDragAnnouncement("Moving event. Release to choose a destination.");
    }
    event.preventDefault();
    updateDropTarget(current, event.clientX, event.clientY);
  }

  function finishInteraction(event: ReactPointerEvent<HTMLButtonElement>): void {
    const current = interaction.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.dragging) {
      updateDropTarget(current, event.clientX, event.clientY);
      removeTargetHighlight(current.target);
      suppressNextClick.current = true;
      window.setTimeout(() => { suppressNextClick.current = false; }, 0);
      event.preventDefault();
      if (current.target && onMove) {
        onMove(calendarEvent, current.target.date, current.target.minute, calendarTimeZone);
        setDragAnnouncement("Move proposed. Review its date, time, and conflicts before saving.");
      } else {
        setDragAnnouncement("No calendar destination was selected. The event was not changed.");
      }
    } else {
      removeTargetHighlight(current.target);
      setDragAnnouncement("");
    }
    interaction.current = null;
  }

  function cancelInteraction(event: ReactPointerEvent<HTMLButtonElement>): void {
    const current = interaction.current;
    if (!current || current.pointerId !== event.pointerId) return;
    removeTargetHighlight(current.target);
    interaction.current = null;
    setDragAnnouncement(current.dragging ? "Move cancelled. The event was not changed." : "");
  }

  return (
    <div
      className={`${styles.eventControl} ${compact ? styles.compactEventControl : ""} ${className ?? ""}`}
      style={style}
    >
      <button
        className={`${styles.eventButton} ${compact ? styles.compactEvent : ""}`}
        type="button"
        onClick={() => onSelect(event)}
        aria-label={accessibleLabel}
        title={event.title}
      >
        <span className={styles.eventTime}>{timeLabel}</span>
        <span className={styles.eventTitle}>{event.title}</span>
      </button>
      {canMove && (
        <button
          className={styles.moveHandle}
          type="button"
          aria-label={`Open ${event.title} in the editor. Drag this handle to move it.`}
          title="Drag to move. Activate to edit."
          onClick={(clickEvent) => {
            if (suppressNextClick.current) {
              clickEvent.preventDefault();
              suppressNextClick.current = false;
              return;
            }
            onSelect(event);
          }}
          onPointerDown={beginInteraction}
          onPointerMove={continueInteraction}
          onPointerUp={finishInteraction}
          onPointerCancel={cancelInteraction}
          onLostPointerCapture={cancelInteraction}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <circle cx="5" cy="4" r="1" />
            <circle cx="11" cy="4" r="1" />
            <circle cx="5" cy="8" r="1" />
            <circle cx="11" cy="8" r="1" />
            <circle cx="5" cy="12" r="1" />
            <circle cx="11" cy="12" r="1" />
          </svg>
        </button>
      )}
      {canMove && dragAnnouncement && (
        <span className={styles.visuallyHidden} aria-live="polite">{dragAnnouncement}</span>
      )}
    </div>
  );
}
