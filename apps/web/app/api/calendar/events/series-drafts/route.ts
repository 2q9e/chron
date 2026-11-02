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
import {
  parseCalendarIdempotencyKey,
  parseCalendarSeriesDraftRequest,
} from "../../../../../features/calendar/server/validation.ts";

export async function POST(request: Request): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const ownerId = await requireCalendarUser(request);
    const idempotencyKey = parseCalendarIdempotencyKey(
      request.headers.get("Idempotency-Key"),
    );
    const draftRequest = parseCalendarSeriesDraftRequest(await readCalendarJson(request));
    const repository = await getCalendarRepository();
    const draft = await repository.createSeriesDraft(
      ownerId,
      draftRequest,
      idempotencyKey,
    );

    return calendarJson(
      { draft },
      { status: draft.outcome === "pending" && !draft.replayed ? 201 : 200 },
    );
  });
}
