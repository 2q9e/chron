import { getStudyRepository, requireStudyUser } from "../../../../../../features/study/server/runtime.ts";
import { withStudyErrors } from "../../../../../../features/study/server/errors.ts";
import { parseStudyRating, parseStudyOperationKey, parseStudyRevision } from "../../../../../../features/study/server/validation.ts";
import {
  parseStudyRouteId,
  readStudyJson,
  requireStudySameOriginMutation,
  studyJson,
} from "../../../../../../features/study/server/http.ts";

type ReviewRouteContext = Readonly<{ params: Promise<{ cardId: string }> }>;

export async function POST(request: Request, context: ReviewRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    requireStudySameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireStudyUser(request);
    const { cardId: rawCardId } = await context.params;
    const cardId = parseStudyRouteId(rawCardId);
    const revision = parseStudyRevision(request.headers.get("if-match"));
    const operationKey = parseStudyOperationKey(request.headers.get("idempotency-key"));
    const rating = parseStudyRating(await readStudyJson(request));
    const review = await (await getStudyRepository()).reviewCard(
      userId,
      cardId,
      operationKey,
      revision,
      rating,
    );
    return studyJson({ review }, { headers: { ETag: `"${review.revision}"` } });
  });
}
