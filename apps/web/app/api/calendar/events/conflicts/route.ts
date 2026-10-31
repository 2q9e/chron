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
import { parseCalendarConflictCheck } from "../../../../../features/calendar/server/validation.ts";

export async function POST(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireCalendarUser(request);
    const repository = await getCalendarRepository();
    const check = parseCalendarConflictCheck(await readCalendarJson(request));
    const conflicts = await repository.findConflicts(
      userId,
      check.event,
      check.calendarTimeZone,
      check.excludeEventId,
    );
    return calendarJson({ conflicts });
  });
}
