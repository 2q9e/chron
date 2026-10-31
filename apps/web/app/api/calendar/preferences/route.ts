import {
  calendarJson,
  readCalendarJson,
  requireSameOriginMutation,
} from "../../../../features/calendar/server/http.ts";
import { withCalendarErrors } from "../../../../features/calendar/server/errors.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../features/calendar/server/runtime.ts";
import { parseCalendarPreferences } from "../../../../features/calendar/server/validation.ts";

export async function GET(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    const userId = await requireCalendarUser(request);
    const repository = await getCalendarRepository();
    const preferences = await repository.getPreferences(userId);
    return calendarJson({ preferences });
  });
}

export async function PUT(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireCalendarUser(request);
    const preferences = parseCalendarPreferences(await readCalendarJson(request));
    const repository = await getCalendarRepository();
    const saved = await repository.setPreferences(userId, preferences);
    return calendarJson({ preferences: saved });
  });
}
