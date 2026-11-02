import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  type Card,
  type FSRSParameters,
} from "ts-fsrs";

export const studySchedulerVersion = "fsrs-v5-ts-fsrs-5.4.2-chron-1";

export const studyRatings = ["again", "hard", "good", "easy"] as const;
export type StudyRating = (typeof studyRatings)[number];

export type StoredStudySchedule = Readonly<{
  algorithmVersion: string;
  parameters: FSRSParameters;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: string | null;
}>;

const defaultParameters = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
});

export function createStudySchedule(now: Date): StoredStudySchedule {
  return storeCard(createEmptyCard(now), defaultParameters);
}

export function applyStudyRating(
  schedule: StoredStudySchedule,
  rating: StudyRating,
  reviewedAt: Date,
): Readonly<{ schedule: StoredStudySchedule; log: Readonly<Record<string, unknown>> }> {
  if (schedule.algorithmVersion !== studySchedulerVersion) {
    throw new Error("This card uses an unsupported review schedule version.");
  }

  const scheduler = fsrs(schedule.parameters);
  const result = scheduler.next(
    restoreCard(schedule),
    reviewedAt,
    ratingValue(rating),
  );

  return {
    schedule: storeCard(result.card, schedule.parameters),
    log: {
      rating,
      state: result.log.state,
      due: result.log.due.toISOString(),
      stability: result.log.stability,
      difficulty: result.log.difficulty,
      elapsedDays: result.log.elapsed_days,
      lastElapsedDays: result.log.last_elapsed_days,
      scheduledDays: result.log.scheduled_days,
      learningSteps: result.log.learning_steps,
      reviewedAt: result.log.review.toISOString(),
    },
  };
}

export function restoreStoredStudySchedule(value: unknown): StoredStudySchedule {
  if (!isRecord(value)) throw new Error("The saved review schedule is invalid.");

  const { algorithmVersion, parameters, due, lastReview } = value;
  const numericFields = [
    "stability",
    "difficulty",
    "elapsedDays",
    "scheduledDays",
    "learningSteps",
    "reps",
    "lapses",
    "state",
  ] as const;
  if (
    algorithmVersion !== studySchedulerVersion ||
    typeof due !== "string" || !Number.isFinite(Date.parse(due)) ||
    (lastReview !== null && (typeof lastReview !== "string" || !Number.isFinite(Date.parse(lastReview)))) ||
    !isRecord(parameters) ||
    numericFields.some((field) => typeof value[field] !== "number" || !Number.isFinite(value[field]))
  ) {
    throw new Error("The saved review schedule is invalid or uses a newer algorithm version.");
  }

  const state = value.state as number;
  if (!Number.isInteger(state) || state < 0 || state > 3) {
    throw new Error("The saved review schedule has an invalid learning state.");
  }

  const normalized = {
    algorithmVersion,
    parameters: parameters as unknown as FSRSParameters,
    due,
    stability: value.stability as number,
    difficulty: value.difficulty as number,
    elapsedDays: value.elapsedDays as number,
    scheduledDays: value.scheduledDays as number,
    learningSteps: value.learningSteps as number,
    reps: value.reps as number,
    lapses: value.lapses as number,
    state,
    lastReview,
  } satisfies StoredStudySchedule;

  try {
    fsrs(normalized.parameters);
  } catch {
    throw new Error("The saved review schedule parameters are invalid.");
  }
  return normalized;
}

function storeCard(card: Card, parameters: FSRSParameters): StoredStudySchedule {
  return {
    algorithmVersion: studySchedulerVersion,
    parameters,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review?.toISOString() ?? null,
  };
}

function restoreCard(schedule: StoredStudySchedule): Card {
  const due = new Date(schedule.due);
  const lastReview = schedule.lastReview === null ? undefined : new Date(schedule.lastReview);
  if (!Number.isFinite(due.valueOf()) || (lastReview && !Number.isFinite(lastReview.valueOf()))) {
    throw new Error("The saved review schedule contains an invalid date.");
  }

  return {
    due,
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: schedule.elapsedDays,
    scheduled_days: schedule.scheduledDays,
    learning_steps: schedule.learningSteps,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: schedule.state as Card["state"],
    ...(lastReview ? { last_review: lastReview } : {}),
  };
}

function ratingValue(rating: StudyRating): Exclude<Rating, Rating.Manual> {
  switch (rating) {
    case "again": return Rating.Again;
    case "hard": return Rating.Hard;
    case "good": return Rating.Good;
    case "easy": return Rating.Easy;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
