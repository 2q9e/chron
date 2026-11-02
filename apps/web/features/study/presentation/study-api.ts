import type { StudyCard, StudyDeck, StudyReviewResult } from "../domain/types.ts";
import type { StudyRating } from "../domain/scheduler.ts";

export class StudyRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "StudyRequestError";
    this.status = status;
    this.code = code;
  }
}

export type StudyDeckPage = Readonly<{
  deck: StudyDeck;
  cards: readonly StudyCard[];
  nextCursor: string | null;
}>;

export async function listStudyDecks(signal?: AbortSignal): Promise<readonly StudyDeck[]> {
  const response = await request("/api/study/decks", { method: "GET", signal });
  const result = await readJson<{ decks: StudyDeck[] }>(response);
  return result.decks;
}

export async function createStudyDeck(name: string): Promise<StudyDeck> {
  const response = await request("/api/study/decks", jsonInit("POST", { name }));
  return (await readJson<{ deck: StudyDeck }>(response)).deck;
}

export async function getStudyDeck(
  deckId: string,
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<StudyDeckPage> {
  const query = new URLSearchParams({ limit: "50" });
  if (cursor) query.set("cursor", cursor);
  const response = await request(`/api/study/decks/${encodeURIComponent(deckId)}?${query}`, {
    method: "GET",
    signal,
  });
  return readJson<StudyDeckPage>(response);
}

export async function updateStudyDeck(deck: StudyDeck, name: string): Promise<StudyDeck> {
  const response = await request(`/api/study/decks/${encodeURIComponent(deck.id)}`, {
    ...jsonInit("PATCH", { name }),
    headers: { "Content-Type": "application/json", "If-Match": `"${deck.revision}"` },
  });
  return (await readJson<{ deck: StudyDeck }>(response)).deck;
}

export async function deleteStudyDeck(deck: StudyDeck): Promise<void> {
  await request(`/api/study/decks/${encodeURIComponent(deck.id)}`, {
    method: "DELETE",
    headers: { "If-Match": `"${deck.revision}"` },
  });
}

export async function createStudyCard(deckId: string, front: string, back: string): Promise<StudyCard> {
  const response = await request(
    `/api/study/decks/${encodeURIComponent(deckId)}/cards`,
    jsonInit("POST", { front, back }),
  );
  return (await readJson<{ card: StudyCard }>(response)).card;
}

export async function updateStudyCard(card: StudyCard, front: string, back: string): Promise<StudyCard> {
  const response = await request(`/api/study/cards/${encodeURIComponent(card.id)}`, {
    ...jsonInit("PATCH", { front, back }),
    headers: { "Content-Type": "application/json", "If-Match": `"${card.revision}"` },
  });
  return (await readJson<{ card: StudyCard }>(response)).card;
}

export async function deleteStudyCard(card: StudyCard): Promise<void> {
  await request(`/api/study/cards/${encodeURIComponent(card.id)}`, {
    method: "DELETE",
    headers: { "If-Match": `"${card.revision}"` },
  });
}

export async function getDueStudyCard(deckId: string, signal?: AbortSignal): Promise<StudyCard | null> {
  const response = await request(`/api/study/decks/${encodeURIComponent(deckId)}/due`, {
    method: "GET",
    signal,
  });
  return (await readJson<{ card: StudyCard | null }>(response)).card;
}

export async function reviewStudyCard(
  card: StudyCard,
  rating: StudyRating,
  operationKey: string,
): Promise<StudyReviewResult> {
  const response = await request(`/api/study/cards/${encodeURIComponent(card.id)}/reviews`, {
    ...jsonInit("POST", { rating }),
    headers: {
      "Content-Type": "application/json",
      "If-Match": `"${card.revision}"`,
      "Idempotency-Key": operationKey,
    },
  });
  return (await readJson<{ review: StudyReviewResult }>(response)).review;
}

function jsonInit(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json", ...init.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      error?: { code?: unknown; message?: unknown };
    } | null;
    throw new StudyRequestError(
      response.status,
      typeof payload?.error?.code === "string" ? payload.error.code : "STUDY_REQUEST_FAILED",
      typeof payload?.error?.message === "string" ? payload.error.message : "The study request could not be completed.",
    );
  }
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    throw new StudyRequestError(502, "INVALID_STUDY_RESPONSE", "Chron returned an invalid study response.");
  }
}
