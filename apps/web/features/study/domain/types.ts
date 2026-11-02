import type { StudyRating } from "./scheduler.ts";

export type StudyDeck = Readonly<{
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  totalCards: number;
  dueCards: number;
}>;

export type StudyCard = Readonly<{
  id: string;
  deckId: string;
  front: string;
  back: string;
  revision: number;
  dueAt: string;
  createdAt: string;
  updatedAt: string;
}>;

export type StudyCardDraft = Readonly<{ front: string; back: string }>;
export type StudyDeckDraft = Readonly<{ name: string }>;

export type StudyReviewResult = Readonly<{
  cardId: string;
  rating: StudyRating;
  reviewedAt: string;
  dueAt: string;
  revision: number;
  algorithmVersion: string;
  replayed: boolean;
}>;
