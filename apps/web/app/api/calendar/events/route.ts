import {
  calendarJson,
  exactQueryValues,
  readCalendarJson,
  requireSameOriginMutation,
} from "../../../../features/calendar/server/http.ts";
import { withCalendarErrors } from "../../../../features/calendar/server/errors.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../features/calendar/server/runtime.ts";
import { parseCalendarEventCommit } from "../../../../features/calendar/server/validation.ts";

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
    const repository = await getCalendarRepository();
    const commit = parseCalendarEventCommit(await readCalendarJson(request));
    const event = await repository.createEvent(
      userId,
      commit.event,
      commit.calendarTimeZone,
      commit.reviewedConflicts,
    );
    return calendarJson(
      { event },
      { status: 201, headers: { ETag: `"${event.revision}"` } },
    );
  });
}
