import { CalendarTimeError } from "../domain/time.ts";

export class CalendarRouteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "CalendarRouteError";
    this.status = status;
    this.code = code;
  }
}

export function calendarSearchTimeoutError(): CalendarRouteError {
  return new CalendarRouteError(
    504,
    "CALENDAR_SEARCH_TIMEOUT",
    "Search could not finish. Refine the title or date range and try again.",
  );
}

export function calendarRouteError(error: unknown): CalendarRouteError {
  if (error instanceof CalendarRouteError) return error;

  if (error instanceof CalendarTimeError) {
    const status = error.code === "AMBIGUOUS_LOCAL_TIME" ||
        error.code === "NONEXISTENT_LOCAL_TIME"
      ? 422
      : 400;
    return new CalendarRouteError(status, error.code, error.message);
  }

  return new CalendarRouteError(
    500,
    "CALENDAR_REQUEST_FAILED",
    "The calendar request could not be completed.",
  );
}

export function errorResponse(error: unknown): Response {
  const mapped = calendarRouteError(error);
  return Response.json(
    { error: { code: mapped.code, message: mapped.message } },
    {
      status: mapped.status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function withCalendarErrors(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return errorResponse(error);
  }
}
