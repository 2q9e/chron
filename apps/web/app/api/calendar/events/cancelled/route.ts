import {
  calendarJson,
  exactQueryValues,
} from "../../../../../features/calendar/server/http.ts";
import { withCalendarErrors } from "../../../../../features/calendar/server/errors.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../../features/calendar/server/runtime.ts";

export async function GET(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    const userId = await requireCalendarUser(request);
    const repository = await getCalendarRepository();
    const values = exactQueryValues(
      new URL(request.url),
      ["from", "to", "timeZone"],
    );
    const occurrences = await repository.listCancelledOccurrences(
      userId,
      values.from,
      values.to,
      values.timeZone,
    );
    return calendarJson({ occurrences });
  });
}
