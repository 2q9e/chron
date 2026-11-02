import { calendarJson } from "../../../../features/calendar/server/http.ts";
import { withCalendarErrors } from "../../../../features/calendar/server/errors.ts";
import { requireCalendarUser } from "../../../../features/calendar/server/runtime.ts";

export async function GET(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    await requireCalendarUser(request);
    return calendarJson({ features: { eventCategories: true } });
  });
}
