import { Temporal } from "@js-temporal/polyfill";
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { calendarEventCategoryLabels, type CalendarEventEntry } from "../domain/types";
import { calendarMinuteAtPointer } from "./calendar-move.ts";
import styles from "./calendar.module.css";

export type CalendarMoveAction = (
  event: CalendarEventEntry,
  targetDate: string,
  targetMinute: number | null,
  calendarTimeZone: string,
) => void;
export type CalendarResizeAction = CalendarMoveAction;

type DropTarget = Readonly<{
  date: string;
  minute: number | null;
  timeZone: string;
  key: string;
  element: HTMLElement;
}>;

type PointerInteraction = {
  pointerId: number;
  mode: "move" | "resize";
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
  onResize?: CalendarResizeAction;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}>;

function targetAtPoint(
  clientX: number,
  clientY: number,
  requireTimeSlot = false,
): DropTarget | null {
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
  if (requireTimeSlot && minute === null) return null;

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

function announceTarget(
  target: DropTarget,
  locale: string,
  mode: PointerInteraction["mode"],
  movesWholeSeries: boolean,
): string {
  const targetDate = Temporal.PlainDate.from(target.date);
  const day = targetDate.toLocaleString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (target.minute === null) {
    if (mode === "resize") return `Resize the event end on the time grid for ${day}.`;
    const subject = movesWholeSeries ? "the entire repeating series" : "the event";
    return `Move ${subject} to ${day} while keeping its displayed time in ${target.timeZone}.`;
  }
  const dayStart = targetDate.toZonedDateTime(target.timeZone).toInstant();
  const targetInstant = dayStart.add({ minutes: target.minute });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: target.timeZone,
  }).format(new Date(Number(targetInstant.epochMilliseconds)));
  return mode === "resize"
    ? `Resize the end to ${day} at ${time} in ${target.timeZone}.`
    : `Move ${movesWholeSeries ? "the entire repeating series" : "the event"} to ${day} at ${time} in ${target.timeZone}.`;
}

export function CalendarEventControl({
  event,
  calendarTimeZone,
  locale,
  timeLabel,
  accessibleLabel,
  onSelect,
  onMove,
  onResize,
  compact = false,
  className,
  style,
}: Props) {
  const calendarEvent = event;
  const movesWholeSeries = "series" in event
    || ("recurrenceRule" in event && !!event.recurrenceRule);
  const interaction = useRef<PointerInteraction | null>(null);
  const suppressNextClick = useRef(false);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const canMove = !!onMove;
  const canResize = !!onResize
    && event.kind === "timed"
    && !("series" in event)
    && !("recurrenceRule" in event && event.recurrenceRule);

  function updateDropTarget(current: PointerInteraction, clientX: number, clientY: number): void {
    const next = targetAtPoint(clientX, clientY, current.mode === "resize");
    if (current.target?.key === next?.key) return;
    removeTargetHighlight(current.target);
    current.target = next;
    if (next) {
      showTargetHighlight(next);
      setDragAnnouncement(announceTarget(next, locale, current.mode, movesWholeSeries));
    } else {
      setDragAnnouncement(current.mode === "resize"
        ? "Resize the end on a day or week time grid."
        : movesWholeSeries
          ? "Move the repeating series over a calendar day or time to choose its new start."
          : "Move over a calendar day or time to choose a destination.");
    }
  }

  function beginInteraction(
    event: ReactPointerEvent<HTMLButtonElement>,
    mode: PointerInteraction["mode"],
  ): void {
    if ((mode === "move" ? !canMove : !canResize)
      || event.button !== 0 || !event.isPrimary) return;
    interaction.current = {
      pointerId: event.pointerId,
      mode,
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
      setDragAnnouncement(current.mode === "resize"
        ? "Resizing event. Release to choose its new end time."
        : movesWholeSeries
          ? "Moving the entire repeating series. Release to choose its new start."
          : "Moving event. Release to choose a destination.");
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
      const action = current.mode === "move" ? onMove : onResize;
      if (current.target && action) {
        action(calendarEvent, current.target.date, current.target.minute, calendarTimeZone);
        setDragAnnouncement(current.mode === "resize"
          ? "Resize proposed. Review its end time and conflicts before saving."
          : movesWholeSeries
            ? "Series move proposed. Review all occurrences and conflicts, then approve the series."
            : "Move proposed. Review its date, time, and conflicts before saving.");
      } else {
        setDragAnnouncement(current.mode === "resize"
          ? "No time-grid end was selected. The event was not changed."
          : movesWholeSeries
            ? "No calendar destination was selected. The repeating series was not changed."
            : "No calendar destination was selected. The event was not changed.");
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
    setDragAnnouncement(current.dragging
      ? current.mode === "resize"
        ? "Resize cancelled. The event was not changed."
        : movesWholeSeries
          ? "Series move cancelled. The repeating series was not changed."
          : "Move cancelled. The event was not changed."
      : "");
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
        aria-label={`${accessibleLabel}, ${event.category === undefined ? "Category unavailable" : event.category === null ? "Uncategorized" : calendarEventCategoryLabels[event.category]}`}
        title={`${event.title} · ${event.category === undefined ? "Category unavailable" : event.category === null ? "Uncategorized" : calendarEventCategoryLabels[event.category]}`}
      >
        <span className={styles.eventTime}>{timeLabel}</span>
        <span className={styles.eventCategory}>{event.category === undefined ? "Category unavailable" : event.category === null ? "Uncategorized" : calendarEventCategoryLabels[event.category]}</span>
        <span className={styles.eventTitle}>{event.title}</span>
      </button>
      {canMove && (
        <button
          className={styles.moveHandle}
          type="button"
          aria-label={movesWholeSeries
            ? `Open the repeating series ${event.title} in the editor. Drag to propose moving the entire series.`
            : `Open ${event.title} in the editor. Drag this handle to move it.`}
          title={movesWholeSeries
            ? "Drag to propose moving the entire series. Activate to edit."
            : "Drag to move. Activate to edit."}
          onClick={(clickEvent) => {
            if (suppressNextClick.current) {
              clickEvent.preventDefault();
              suppressNextClick.current = false;
              return;
            }
            onSelect(event);
          }}
          onPointerDown={(pointerEvent) => beginInteraction(pointerEvent, "move")}
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
      {canResize && (
        <button
          className={styles.resizeHandle}
          type="button"
          aria-label={`Open ${event.title} in the editor to change its end time. Drag this handle to resize.`}
          title="Drag to resize. Activate to edit."
          onClick={(clickEvent) => {
            if (suppressNextClick.current) {
              clickEvent.preventDefault();
              suppressNextClick.current = false;
              return;
            }
            onSelect(event);
          }}
          onPointerDown={(pointerEvent) => beginInteraction(pointerEvent, "resize")}
          onPointerMove={continueInteraction}
          onPointerUp={finishInteraction}
          onPointerCancel={cancelInteraction}
          onLostPointerCapture={cancelInteraction}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <path d="M3 5h10M3 11h10M8 6v4m-2-2 2 2 2-2" />
          </svg>
        </button>
      )}
      {(canMove || canResize) && dragAnnouncement && (
        <span className={styles.visuallyHidden} aria-live="polite">{dragAnnouncement}</span>
      )}
    </div>
  );
}
