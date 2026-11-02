import {
  CalendarRouteError,
  withCalendarErrors,
} from "../../../../../../../features/calendar/server/errors.ts";
import {
  calendarJson,
  requireSameOriginMutation,
} from "../../../../../../../features/calendar/server/http.ts";
import {
  getCalendarRepository,
  requireCalendarUser,
} from "../../../../../../../features/calendar/server/runtime.ts";

type SeriesDraftApprovalRouteContext = Readonly<{
  params: Promise<{ draftId: string }>;
}>;

function validateSeriesDraftId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new CalendarRouteError(
      404,
      "SERIES_DRAFT_NOT_FOUND",
      "That recurring series draft could not be found.",
    );
  }
  return value.toLowerCase();
}

function statusForApprovalOutcome(
  outcome: "approved" | "stale" | "expired" | "deleted",
): number {
  switch (outcome) {
    case "approved":
      return 200;
    case "stale":
      return 409;
    case "expired":
    case "deleted":
      return 410;
  }
}

export async function POST(
  request: Request,
  context: SeriesDraftApprovalRouteContext,
): Promise<Response> {
  return withCalendarErrors(async () => {
    requireSameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const ownerId = await requireCalendarUser(request);
    const { draftId: rawDraftId } = await context.params;
    const draftId = validateSeriesDraftId(rawDraftId);
    const repository = await getCalendarRepository();

    let approval;
    try {
      approval = await repository.approveSeriesDraft(ownerId, draftId);
    } catch (error) {
      if (error instanceof CalendarRouteError && error.status === 404) {
        throw new CalendarRouteError(
          404,
          "SERIES_DRAFT_NOT_FOUND",
          "That recurring series draft could not be found.",
        );
      }
      throw error;
    }

    return calendarJson(
      { approval },
      { status: statusForApprovalOutcome(approval.outcome) },
    );
  });
}
