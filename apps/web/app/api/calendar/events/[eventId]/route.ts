import {
  calendarEmpty,
  calendarJson,
  parseRevisionPrecondition,
  readCalendarJson,
} from "../../../../../features/calendar/server/http.ts";
import { withCalendarErrors } from "../../../../../features/calendar/server/errors.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../../features/calendar/server/runtime.ts";
import {
  parseCalendarEventCommit,
  validateCalendarEventId,
} from "../../../../../features/calendar/server/validation.ts";
import { requireSameOriginMutation } from "../../../../../features/calendar/server/http.ts";

type EventRouteContext = Readonly<{
  params: Promise<{ eventId: string }>;
}>;

export async function PUT(request: Request, context: EventRouteContext): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireCalendarUser(request);
    const repository = await getCalendarRepository();
    const { eventId: rawEventId } = await context.params;
    const eventId = validateCalendarEventId(rawEventId);
    const revision = parseRevisionPrecondition(request.headers.get("if-match"));
    const commit = parseCalendarEventCommit(await readCalendarJson(request));
    const event = await repository.updateEvent(
      userId,
      eventId,
      revision,
      commit.event,
      commit.calendarTimeZone,
      commit.reviewedConflicts,
    );
    return calendarJson(
      { event },
      { headers: { ETag: `"${event.revision}"` } },
    );
  });
}

export async function DELETE(request: Request, context: EventRouteContext): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireCalendarUser(request);
    const repository = await getCalendarRepository();
    const { eventId: rawEventId } = await context.params;
    const eventId = validateCalendarEventId(rawEventId);
    const revision = parseRevisionPrecondition(request.headers.get("if-match"));
    await repository.deleteEvent(userId, eventId, revision);
    return calendarEmpty({ status: 204 });
  });
}
