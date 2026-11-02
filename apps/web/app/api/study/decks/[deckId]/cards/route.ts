import { getStudyRepository, requireStudyUser } from "../../../../../../features/study/server/runtime.ts";
import { withStudyErrors } from "../../../../../../features/study/server/errors.ts";
import { parseStudyCardDraft } from "../../../../../../features/study/server/validation.ts";
import {
  parseStudyRouteId,
  readStudyJson,
  requireStudySameOriginMutation,
  studyJson,
} from "../../../../../../features/study/server/http.ts";

type CardsRouteContext = Readonly<{ params: Promise<{ deckId: string }> }>;

export async function POST(request: Request, context: CardsRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    requireStudySameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireStudyUser(request);
    const { deckId: rawDeckId } = await context.params;
    const deckId = parseStudyRouteId(rawDeckId);
    const draft = parseStudyCardDraft(await readStudyJson(request));
    const card = await (await getStudyRepository()).createCard(userId, deckId, draft.front, draft.back);
    return studyJson({ card }, { status: 201, headers: { ETag: `"${card.revision}"` } });
  });
}
