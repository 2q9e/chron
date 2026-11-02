import { getStudyRepository, requireStudyUser } from "../../../../features/study/server/runtime.ts";
import { withStudyErrors } from "../../../../features/study/server/errors.ts";
import { parseStudyDeckDraft } from "../../../../features/study/server/validation.ts";
import { readStudyJson, requireStudySameOriginMutation, studyJson } from "../../../../features/study/server/http.ts";

export async function GET(request: Request): Promise<Response> {
  return withStudyErrors(async () => {
    const userId = await requireStudyUser(request);
    const decks = await (await getStudyRepository()).listDecks(userId);
    return studyJson({ decks });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withStudyErrors(async () => {
    requireStudySameOriginMutation(request, process.env.BETTER_AUTH_URL);
    const userId = await requireStudyUser(request);
    const draft = parseStudyDeckDraft(await readStudyJson(request));
    const deck = await (await getStudyRepository()).createDeck(userId, draft.name);
    return studyJson({ deck }, { status: 201, headers: { ETag: `"${deck.revision}"` } });
  });
}
