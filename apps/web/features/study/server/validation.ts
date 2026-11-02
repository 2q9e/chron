import { studyRatings, type StudyRating } from "../domain/scheduler.ts";
import { StudyRouteError } from "./errors.ts";

export const maximumStudyCardsPageSize = 50;

export type StudyCardCursor = Readonly<{ createdAt: string; id: string }>;

export function parseStudyDeckDraft(value: unknown): Readonly<{ name: string }> {
  const record = objectRecord(value);
  allowFields(record, ["name"]);
  return { name: parseText(record.name, "Deck names must contain 1 to 120 characters.", 120) };
}

export function parseStudyCardDraft(value: unknown): Readonly<{ front: string; back: string }> {
  const record = objectRecord(value);
  allowFields(record, ["front", "back"]);
  return {
    front: parseText(record.front, "Card prompts must contain 1 to 4,000 characters.", 4000),
    back: parseText(record.back, "Card answers must contain 1 to 8,000 characters.", 8000),
  };
}

export function parseStudyRating(value: unknown): StudyRating {
  const record = objectRecord(value);
  allowFields(record, ["rating"]);
  if (typeof record.rating !== "string" || !studyRatings.includes(record.rating as StudyRating)) {
    throw new StudyRouteError(400, "INVALID_STUDY_RATING", "Choose Again, Hard, Good, or Easy.");
  }
  return record.rating as StudyRating;
}

export function parseStudyOperationKey(value: string | null): string {
  if (value === null || !/^[A-Za-z0-9._~-]{1,128}$/u.test(value)) {
    throw new StudyRouteError(400, "INVALID_OPERATION_KEY", "The review request key is invalid.");
  }
  return value;
}

export function parseStudyRevision(value: string | null): number {
  if (value === null) {
    throw new StudyRouteError(428, "PRECONDITION_REQUIRED", "Reload this study item before saving changes.");
  }
  const match = /^"([1-9]\d*)"$/u.exec(value.trim());
  const revision = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(revision)) {
    throw new StudyRouteError(400, "INVALID_PRECONDITION", "The study item revision is invalid.");
  }
  return revision;
}

export function parseStudyPage(url: URL): Readonly<{ limit: number; cursor: StudyCardCursor | null }> {
  for (const key of url.searchParams.keys()) {
    if (key !== "limit" && key !== "cursor") {
      throw new StudyRouteError(400, "INVALID_QUERY", "The study query contains an unsupported field.");
    }
  }

  const limits = url.searchParams.getAll("limit");
  const cursors = url.searchParams.getAll("cursor");
  const limit = limits.length === 0 ? maximumStudyCardsPageSize : Number(limits[0]);
  if (
    limits.length > 1 || cursors.length > 1 ||
    !Number.isInteger(limit) || limit < 1 || limit > maximumStudyCardsPageSize
  ) {
    throw new StudyRouteError(400, "INVALID_QUERY", "Choose a page size from 1 to 50 and a valid study cursor.");
  }
  return { limit, cursor: cursors.length === 0 ? null : parseStudyCursor(cursors[0] ?? "") };
}

function parseStudyCursor(value: string): StudyCardCursor {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/iu.exec(value);
  if (!match) throw new StudyRouteError(400, "INVALID_QUERY", "The study cursor is invalid.");
  const timestamp = match[1] ?? "";
  const millisecondTimestamp = timestamp.replace(/\.(\d{3})\d{3}Z$/u, ".$1Z");
  const createdAt = new Date(millisecondTimestamp);
  if (!Number.isFinite(createdAt.valueOf()) || createdAt.toISOString() !== millisecondTimestamp) {
    throw new StudyRouteError(400, "INVALID_QUERY", "The study cursor is invalid.");
  }
  return { createdAt: timestamp, id: (match[2] ?? "").toLowerCase() };
}

function parseText(value: unknown, message: string, maximumLength: number): string {
  if (typeof value !== "string") {
    throw new StudyRouteError(400, "INVALID_STUDY_FIELDS", message);
  }
  const normalized = value.replaceAll("\r\n", "\n").trim();
  const characterCount = [...normalized].length;
  if (
    characterCount < 1 || characterCount > maximumLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)
  ) {
    throw new StudyRouteError(400, "INVALID_STUDY_FIELDS", message);
  }
  return normalized;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new StudyRouteError(400, "INVALID_STUDY_FIELDS", "The study fields are invalid.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new StudyRouteError(400, "INVALID_STUDY_FIELDS", "The study fields are invalid.");
  }
  return value as Record<string, unknown>;
}

function allowFields(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowlist = new Set(allowed);
  if (Object.keys(record).some((key) => !allowlist.has(key))) {
    throw new StudyRouteError(400, "INVALID_STUDY_FIELDS", "The request contains unsupported study fields.");
  }
}
