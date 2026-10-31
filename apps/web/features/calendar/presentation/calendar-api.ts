import { calendarThemes } from "../domain/types";
import type {
  CalendarApiError,
  CalendarEvent,
  CalendarEventMutation,
  CalendarPreferences,
} from "../domain/types";

export class CalendarRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "CalendarRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCalendarEvent(value: unknown): value is CalendarEvent {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.title)
    || !(typeof value.details === "string" || value.details === null)
    || !Number.isInteger(value.revision)
    || typeof value.revision !== "number"
    || !isNonEmptyString(value.createdAt)
    || !isNonEmptyString(value.updatedAt)) return false;

  if (value.kind === "all-day") {
    return isNonEmptyString(value.startDate) && isNonEmptyString(value.endDate);
  }

  return value.kind === "timed"
    && isNonEmptyString(value.startLocal)
    && isNonEmptyString(value.endLocal)
    && isNonEmptyString(value.timeZone)
    && isNonEmptyString(value.startsAt)
    && isNonEmptyString(value.endsAt);
}

function isCalendarPreferences(value: unknown): value is CalendarPreferences {
  if (!isRecord(value)) return false;
  if (!calendarThemes.includes(value.theme as (typeof calendarThemes)[number])) return false;
  if (value.density !== "comfortable" && value.density !== "compact") return false;
  if (!Number.isInteger(value.weekStartsOn) || typeof value.weekStartsOn !== "number") return false;
  if (value.weekStartsOn < 0 || value.weekStartsOn > 6 || !isNonEmptyString(value.timeZone)) return false;

  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
    return true;
  } catch {
    return false;
  }
}

export async function readCalendarError(response: Response): Promise<CalendarRequestError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const error = isRecord(payload) && isRecord(payload.error)
    ? payload.error as CalendarApiError["error"]
    : null;
  const fallback = response.status === 401
    ? "Your session may have expired. Sign in again to continue."
    : response.status === 412
      ? "This event changed after you opened it. Reload it and review the latest version before saving."
      : response.status === 428
        ? "The event version could not be verified. Reload the calendar and try again."
        : "Chron could not complete this calendar request. Try again.";
  const message = typeof error?.message === "string" && error.message.length > 0
    ? error.message.slice(0, 500)
    : fallback;
  const code = typeof error?.code === "string" ? error.code.slice(0, 100) : "CALENDAR_REQUEST_FAILED";
  return new CalendarRequestError(message, response.status, code);
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CalendarRequestError(
      "Chron returned a calendar response that could not be read. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
}

export async function fetchCalendarEvents(
  from: string,
  to: string,
  timeZone: string,
  signal?: AbortSignal,
): Promise<CalendarEvent[]> {
  const query = new URLSearchParams({ from, to, timeZone });
  const response = await fetch(`/api/calendar/events?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.events) || !payload.events.every(isCalendarEvent)) {
    throw new CalendarRequestError(
      "Chron returned calendar events in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.events;
}

export async function fetchCalendarPreferences(signal?: AbortSignal): Promise<CalendarPreferences | null> {
  const response = await fetch("/api/calendar/preferences", {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !(payload.preferences === null || isCalendarPreferences(payload.preferences))) {
    throw new CalendarRequestError(
      "Chron returned calendar preferences in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.preferences;
}

export async function saveCalendarPreferences(
  preferences: CalendarPreferences,
): Promise<CalendarPreferences> {
  const response = await fetch("/api/calendar/preferences", {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarPreferences(payload.preferences)) {
    throw new CalendarRequestError(
      "Chron returned saved preferences in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.preferences;
}

export async function createCalendarEvent(
  mutation: CalendarEventMutation,
): Promise<CalendarEvent> {
  const response = await fetch("/api/calendar/events", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mutation),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarEvent(payload.event)) {
    throw new CalendarRequestError(
      "Chron returned a saved event in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.event;
}

export async function updateCalendarEvent(
  event: CalendarEvent,
  mutation: CalendarEventMutation,
): Promise<CalendarEvent> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
    method: "PUT",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": `"${event.revision}"`,
    },
    body: JSON.stringify(mutation),
  });
  if (!response.ok) throw await readCalendarError(response);
  const payload = await parseJson(response);
  if (!isRecord(payload) || !isCalendarEvent(payload.event)) {
    throw new CalendarRequestError(
      "Chron returned an updated event in an unexpected format. Reload and try again.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  return payload.event;
}

export async function deleteCalendarEvent(event: CalendarEvent): Promise<void> {
  const response = await fetch(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
    method: "DELETE",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "If-Match": `"${event.revision}"`,
    },
  });
  if (!response.ok) throw await readCalendarError(response);
  if (response.status !== 204 && response.status !== 200) {
    throw new CalendarRequestError(
      "Chron did not confirm the event deletion. Reload the calendar.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
}
