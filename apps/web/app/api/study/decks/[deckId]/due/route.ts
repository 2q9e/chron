import { getStudyRepository, requireStudyUser } from "../../../../../../features/study/server/runtime.ts";
import { withStudyErrors } from "../../../../../../features/study/server/errors.ts";
import { parseStudyRouteId, studyJson } from "../../../../../../features/study/server/http.ts";

type DueRouteContext = Readonly<{ params: Promise<{ deckId: string }> }>;

export async function GET(request: Request, context: DueRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    const userId = await requireStudyUser(request);
    const { deckId: rawDeckId } = await context.params;
    const deckId = parseStudyRouteId(rawDeckId);
    const card = await (await getStudyRepository()).getDueCard(userId, deckId);
    return studyJson({ card }, { headers: card ? { ETag: `"${card.revision}"` } : undefined });
  });
}
