import { getStudyRepository, requireStudyUser } from "../../../../../features/study/server/runtime.ts";
import { withStudyErrors } from "../../../../../features/study/server/errors.ts";
import { parseStudyCardDraft, parseStudyRevision } from "../../../../../features/study/server/validation.ts";
import {
  parseStudyRouteId,
  readStudyJson,
  requireStudySameOriginMutation,
  studyJson,
} from "../../../../../features/study/server/http.ts";

type CardRouteContext = Readonly<{ params: Promise<{ cardId: string }> }>;

export async function PATCH(request: Request, context: CardRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    requireStudySameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireStudyUser(request);
    const { cardId: rawCardId } = await context.params;
    const cardId = parseStudyRouteId(rawCardId);
    const revision = parseStudyRevision(request.headers.get("if-match"));
    const draft = parseStudyCardDraft(await readStudyJson(request));
    const card = await (await getStudyRepository()).updateCard(userId, cardId, revision, draft.front, draft.back);
    return studyJson({ card }, { headers: { ETag: `"${card.revision}"` } });
  });
}

export async function DELETE(request: Request, context: CardRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    requireStudySameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireStudyUser(request);
    const { cardId: rawCardId } = await context.params;
    const cardId = parseStudyRouteId(rawCardId);
    const revision = parseStudyRevision(request.headers.get("if-match"));
    await (await getStudyRepository()).deleteCard(userId, cardId, revision);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  });
}
