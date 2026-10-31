import {
  calendarJson,
  exactQueryValues,
  readCalendarJson,
  requireSameOriginMutation,
} from "../../../../features/calendar/server/http.ts";
import { CalendarRouteError, withCalendarErrors } from "../../../../features/calendar/server/errors.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../features/calendar/server/runtime.ts";
import {
  parseCalendarEventCreateRequest,
  parseCalendarIdempotencyKey,
} from "../../../../features/calendar/server/validation.ts";

export async function GET(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    const userId = await requireCalendarUser(request);
    const repository = await getCalendarRepository();
    const values = exactQueryValues(
      new URL(request.url),
      ["from", "to", "timeZone"],
    );
    const events = await repository.listEvents(
      userId,
      values.from,
      values.to,
      values.timeZone,
    );
    return calendarJson({ events });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireCalendarUser(request);
    const idempotencyKey = parseCalendarIdempotencyKey(request.headers.get("Idempotency-Key"));
    const createRequest = parseCalendarEventCreateRequest(await readCalendarJson(request));
    const repository = await getCalendarRepository();
    if (createRequest.operation === "reconcile") {
      const reconciliation = await repository.reconcileEventCreate(userId, idempotencyKey);
      if (reconciliation.status === "not-found") {
        throw new CalendarRouteError(
          404,
          "CREATE_OPERATION_NOT_FOUND",
          "No completed event creation was found for this request key. It cannot be created with this key now.",
        );
      }
      if (reconciliation.status === "deleted") {
        throw new CalendarRouteError(
          410,
          "CREATED_EVENT_DELETED",
          "This event was deleted after it was created. Review a new event before saving it again.",
        );
      }
      return calendarJson(
        JSON.parse(reconciliation.result.responseBody) as unknown,
        { status: 201, headers: { ETag: `"${reconciliation.result.event.revision}"` } },
      );
    }
    const { commit } = createRequest;
    const result = await repository.createEvent(
      userId,
      commit.event,
      commit.calendarTimeZone,
      commit.reviewedConflicts,
      idempotencyKey,
    );
    return calendarJson(
      JSON.parse(result.responseBody) as unknown,
      { status: 201, headers: { ETag: `"${result.event.revision}"` } },
    );
  });
}
