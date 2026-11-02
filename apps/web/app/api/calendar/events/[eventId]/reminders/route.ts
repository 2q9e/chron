import { calendarJson } from "../../../../../../features/calendar/server/http.ts";
import { withCalendarErrors } from "../../../../../../features/calendar/server/errors.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../../../features/calendar/server/runtime.ts";
import { validateCalendarEventId } from "../../../../../../features/calendar/server/validation.ts";

type EventReminderRouteContext = Readonly<{
  params: Promise<{ eventId: string }>;
}>;

export async function GET(
  request: Request,
  context: EventReminderRouteContext,
): Promise<Response> {
  return withCalendarErrors(async () => {
    const userId = await requireCalendarUser(request);
    const { eventId: rawEventId } = await context.params;
    const eventId = validateCalendarEventId(rawEventId);
    const repository = await getCalendarRepository();
    const status = await repository.getCalendarReminderStatus(userId, eventId);
    return calendarJson({ status });
  });
}
