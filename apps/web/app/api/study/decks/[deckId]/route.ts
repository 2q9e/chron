import { getStudyRepository, requireStudyUser } from "../../../../../features/study/server/runtime.ts";
import { withStudyErrors } from "../../../../../features/study/server/errors.ts";
import {
  parseStudyDeckDraft,
  parseStudyPage,
  parseStudyRevision,
} from "../../../../../features/study/server/validation.ts";
import {
  parseStudyRouteId,
  readStudyJson,
  requireStudySameOriginMutation,
  studyJson,
} from "../../../../../features/study/server/http.ts";

type DeckRouteContext = Readonly<{ params: Promise<{ deckId: string }> }>;

export async function GET(request: Request, context: DeckRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    const userId = await requireStudyUser(request);
    const { deckId: rawDeckId } = await context.params;
    const deckId = parseStudyRouteId(rawDeckId);
    const { limit, cursor } = parseStudyPage(new URL(request.url));
    const result = await (await getStudyRepository()).getDeck(userId, deckId, limit, cursor);
    return studyJson(result, { headers: { ETag: `"${result.deck.revision}"` } });
  });
}

export async function PATCH(request: Request, context: DeckRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    requireStudySameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireStudyUser(request);
    const { deckId: rawDeckId } = await context.params;
    const deckId = parseStudyRouteId(rawDeckId);
    const revision = parseStudyRevision(request.headers.get("if-match"));
    const draft = parseStudyDeckDraft(await readStudyJson(request));
    const deck = await (await getStudyRepository()).updateDeck(userId, deckId, revision, draft.name);
    return studyJson({ deck }, { headers: { ETag: `"${deck.revision}"` } });
  });
}

export async function DELETE(request: Request, context: DeckRouteContext): Promise<Response> {
  return withStudyErrors(async () => {
    requireStudySameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireStudyUser(request);
    const { deckId: rawDeckId } = await context.params;
    const deckId = parseStudyRouteId(rawDeckId);
    const revision = parseStudyRevision(request.headers.get("if-match"));
    await (await getStudyRepository()).deleteDeck(userId, deckId, revision);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  });
}
