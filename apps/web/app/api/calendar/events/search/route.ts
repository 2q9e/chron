import {
  calendarJson,
  readCalendarJson,
  requireSameOriginMutation,
} from "../../../../../features/calendar/server/http.ts";
import { withCalendarErrors } from "../../../../../features/calendar/server/errors.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../../features/calendar/server/runtime.ts";
import { parseCalendarEventSearchRequest } from "../../../../../features/calendar/server/validation.ts";

export async function POST(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireCalendarUser(request);
    const search = parseCalendarEventSearchRequest(await readCalendarJson(request));
    const repository = await getCalendarRepository();
    const events = await repository.searchEvents(userId, search);
    return calendarJson({ events });
  });
}
