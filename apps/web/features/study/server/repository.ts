import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { createStudySchedule, applyStudyRating, restoreStoredStudySchedule } from "../domain/scheduler.ts";
import type { StudyCard, StudyDeck, StudyReviewResult } from "../domain/types.ts";
import type { StudyRating, StoredStudySchedule } from "../domain/scheduler.ts";
import { StudyRouteError } from "./errors.ts";
import type { StudyCardCursor } from "./validation.ts";

type DeckRow = {
  id: string;
  name: string;
  revision: number;
  created_at: Date | string;
  updated_at: Date | string;
  total_cards?: string | number;
  due_cards?: string | number;
};

type CardRow = {
  id: string;
  deck_id: string;
  cursor_created_at: string;
  front: string;
  back: string;
  revision: number;
  algorithm_version: string;
  algorithm_parameters: unknown;
  due_at: Date | string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ReviewRow = {
  rating: StudyRating;
  request_revision: number;
  reviewed_at: Date | string;
  due_after: Date | string;
  card_revision: number;
  algorithm_version: string;
};

type TransactionLimits = Readonly<{ lockTimeout?: string; statementTimeout?: string }>;

async function withOwnerTransaction<T>(
  pool: Pick<Pool, "connect">,
  ownerId: string,
  operation: (client: PoolClient) => Promise<T>,
  limits: TransactionLimits = {},
): Promise<T> {
  const client = await pool.connect();
  let transactionOpen = false;
  let releaseError: Error | undefined;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT set_config('chron.user_id', $1, true)", [ownerId]);
    await client.query("SELECT set_config('lock_timeout', $1, true)", [limits.lockTimeout ?? "2s"]);
    await client.query("SELECT set_config('statement_timeout', $1, true)", [limits.statementTimeout ?? "5s"]);
    await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", ["5s"]);
    const result = await operation(client);
    await client.query("COMMIT");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError = rollbackError instanceof Error
          ? rollbackError
          : new Error("Study transaction rollback failed.");
      }
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

export class StudyRepository {
  private readonly database: Pool;

  constructor(database: Pool) {
    this.database = database;
  }

  listDecks(userId: string): Promise<StudyDeck[]> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      const result = await client.query<DeckRow>(
        `SELECT d.id::text, d.name, d.revision, d.created_at, d.updated_at,
                count(c.id)::int AS total_cards,
                count(c.id) FILTER (WHERE c.due_at <= clock_timestamp())::int AS due_cards
           FROM study_decks AS d
           LEFT JOIN study_cards AS c ON c.user_id = d.user_id AND c.deck_id = d.id
          WHERE d.user_id = $1
          GROUP BY d.id
          ORDER BY d.updated_at DESC, d.id
          `,
        [userId],
      );
      return result.rows.map(mapDeck);
    });
  }

  createDeck(userId: string, name: string): Promise<StudyDeck> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      const result = await client.query<DeckRow>(
        `INSERT INTO study_decks (id, user_id, name)
         VALUES ($1::uuid, $2, $3)
         RETURNING id::text, name, revision, created_at, updated_at`,
        [randomUUID(), userId, name],
      );
      const row = result.rows[0];
      if (!row) throw new Error("The study deck was not created.");
      return mapDeck(row);
    });
  }

  getDeck(
    userId: string,
    deckId: string,
    limit: number,
    cursor: StudyCardCursor | null,
  ): Promise<Readonly<{ deck: StudyDeck; cards: StudyCard[]; nextCursor: string | null }>> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      const deckResult = await client.query<DeckRow>(
        `SELECT d.id::text, d.name, d.revision, d.created_at, d.updated_at,
                count(c.id)::int AS total_cards,
                count(c.id) FILTER (WHERE c.due_at <= clock_timestamp())::int AS due_cards
           FROM study_decks AS d
           LEFT JOIN study_cards AS c ON c.user_id = d.user_id AND c.deck_id = d.id
          WHERE d.user_id = $1 AND d.id = $2::uuid
          GROUP BY d.id`,
        [userId, deckId],
      );
      const deckRow = deckResult.rows[0];
      if (!deckRow) throw missingStudyItem();

      const cardsResult = await client.query<CardRow>(
        `SELECT c.id::text, c.deck_id::text,
                to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
                c.front, c.back, c.revision,
                c.algorithm_version, c.algorithm_parameters, c.due_at,
                c.stability, c.difficulty, c.elapsed_days, c.scheduled_days,
                c.learning_steps, c.reps, c.lapses, c.state, c.last_review,
                c.created_at, c.updated_at
           FROM study_cards AS c
          WHERE c.user_id = $1 AND c.deck_id = $2::uuid
            AND ($3::timestamptz IS NULL OR c.created_at < $3::timestamptz
              OR (c.created_at = $3::timestamptz AND c.id > $4::uuid))
          ORDER BY c.created_at DESC, c.id
          LIMIT $5`,
        [userId, deckId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
      );
      const hasMore = cardsResult.rows.length > limit;
      const visibleRows = cardsResult.rows.slice(0, limit);
      const lastVisible = visibleRows.at(-1);
      return {
        deck: mapDeck(deckRow),
        cards: visibleRows.map(mapCard),
        nextCursor: hasMore && lastVisible
          ? `${lastVisible.cursor_created_at}|${lastVisible.id}`
          : null,
      };
    });
  }

  updateDeck(userId: string, deckId: string, revision: number, name: string): Promise<StudyDeck> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      const updated = await client.query<DeckRow>(
        `UPDATE study_decks
            SET name = $3, revision = revision + 1, updated_at = clock_timestamp()
          WHERE user_id = $1 AND id = $2::uuid AND revision = $4
          RETURNING id::text, name, revision, created_at, updated_at`,
        [userId, deckId, name, revision],
      );
      if (updated.rows[0]) {
        const result = await client.query<DeckRow>(
          `SELECT d.id::text, d.name, d.revision, d.created_at, d.updated_at,
                  count(c.id)::int AS total_cards,
                  count(c.id) FILTER (WHERE c.due_at <= clock_timestamp())::int AS due_cards
             FROM study_decks AS d
             LEFT JOIN study_cards AS c ON c.user_id = d.user_id AND c.deck_id = d.id
            WHERE d.user_id = $1 AND d.id = $2::uuid
            GROUP BY d.id`,
          [userId, deckId],
        );
        if (result.rows[0]) return mapDeck(result.rows[0]);
      }
      await this.assertDeckRevision(client, userId, deckId, revision);
      throw new Error("The study deck update did not complete.");
    });
  }

  deleteDeck(userId: string, deckId: string, revision: number): Promise<void> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      const result = await client.query(
        "DELETE FROM study_decks WHERE user_id = $1 AND id = $2::uuid AND revision = $3 RETURNING id",
        [userId, deckId, revision],
      );
      if (result.rows.length !== 1) await this.assertDeckRevision(client, userId, deckId, revision);
    });
  }

  createCard(userId: string, deckId: string, front: string, back: string): Promise<StudyCard> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      await lockStudyDeck(client, userId, deckId);

      const clock = await client.query<{ now: Date | string }>("SELECT clock_timestamp() AS now");
      const now = dateValue(clock.rows[0]?.now);
      const schedule = createStudySchedule(now);
      const row = await client.query<CardRow>(
        `INSERT INTO study_cards (
           id, user_id, deck_id, front, back, algorithm_version, algorithm_parameters,
           due_at, stability, difficulty, elapsed_days, scheduled_days, learning_steps,
           reps, lapses, state, last_review
         ) VALUES (
           $1::uuid, $2, $3::uuid, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12,
           $13, $14, $15, $16, $17
         )
         RETURNING id::text, deck_id::text, front, back, revision,
                   algorithm_version, algorithm_parameters, due_at, stability,
                   difficulty, elapsed_days, scheduled_days, learning_steps,
                   reps, lapses, state, last_review, created_at, updated_at`,
        [...cardInsertValues(userId, deckId, front, back, schedule)],
      );
      const inserted = row.rows[0];
      if (!inserted) throw new Error("The study card was not created.");
      await touchStudyDeck(client, userId, deckId);
      return mapCard(inserted);
    });
  }

  updateCard(
    userId: string,
    cardId: string,
    revision: number,
    front: string,
    back: string,
  ): Promise<StudyCard> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      const deckId = await lockStudyCardParent(client, userId, cardId);
      const result = await client.query<CardRow>(
        `UPDATE study_cards
            SET front = $3, back = $4, revision = revision + 1, updated_at = clock_timestamp()
          WHERE user_id = $1 AND id = $2::uuid AND revision = $5
          RETURNING id::text, deck_id::text, front, back, revision,
                    algorithm_version, algorithm_parameters, due_at, stability,
                    difficulty, elapsed_days, scheduled_days, learning_steps,
                    reps, lapses, state, last_review, created_at, updated_at`,
        [userId, cardId, front, back, revision],
      );
      const row = result.rows[0];
      if (row) {
        await touchStudyDeck(client, userId, deckId);
        return mapCard(row);
      }
      await this.assertCardRevision(client, userId, cardId, revision);
      throw new Error("The study card update did not complete.");
    });
  }

  getDueCard(userId: string, deckId: string): Promise<StudyCard | null> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      const deck = await client.query(
        "SELECT id FROM study_decks WHERE user_id = $1 AND id = $2::uuid",
        [userId, deckId],
      );
      if (deck.rows.length !== 1) throw missingStudyItem();
      const result = await client.query<CardRow>(
        `SELECT id::text, deck_id::text, front, back, revision,
                algorithm_version, algorithm_parameters, due_at, stability,
                difficulty, elapsed_days, scheduled_days, learning_steps,
                reps, lapses, state, last_review, created_at, updated_at
           FROM study_cards
          WHERE user_id = $1 AND deck_id = $2::uuid AND due_at <= clock_timestamp()
          ORDER BY due_at, id
          LIMIT 1`,
        [userId, deckId],
      );
      return result.rows[0] ? mapCard(result.rows[0]) : null;
    });
  }

  reviewCard(
    userId: string,
    cardId: string,
    operationKey: string,
    revision: number,
    rating: StudyRating,
  ): Promise<StudyReviewResult> {
    return withOwnerTransaction(this.database, userId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [`study-review:${userId}:${cardId}:${operationKey}`],
      );
      const previousReview = await client.query<ReviewRow>(
        `SELECT rating, request_revision, reviewed_at, due_after, card_revision, algorithm_version
           FROM study_card_reviews
          WHERE user_id = $1 AND card_id = $2::uuid AND operation_key = $3`,
        [userId, cardId, operationKey],
      );
      if (previousReview.rows[0]) {
        if (
          previousReview.rows[0].rating !== rating ||
          previousReview.rows[0].request_revision !== revision
        ) {
          throw new StudyRouteError(409, "IDEMPOTENCY_KEY_REUSED", "This review request key was already used for different review details.");
        }
        return mapReview(previousReview.rows[0], cardId, true);
      }

      const deckId = await lockStudyCardParent(client, userId, cardId);
      const cardResult = await client.query<CardRow>(
        `SELECT id::text, deck_id::text, front, back, revision,
                algorithm_version, algorithm_parameters, due_at, stability,
                difficulty, elapsed_days, scheduled_days, learning_steps,
                reps, lapses, state, last_review, created_at, updated_at
           FROM study_cards
          WHERE user_id = $1 AND id = $2::uuid AND deck_id = $3::uuid
          FOR UPDATE`,
        [userId, cardId, deckId],
      );
      const currentRow = cardResult.rows[0];
      if (!currentRow) throw missingStudyItem();
      if (currentRow.revision !== revision) {
        throw new StudyRouteError(412, "STUDY_REVISION_MISMATCH", "This card changed in another view. Reload it before reviewing.");
      }

      const clock = await client.query<{ now: Date | string }>("SELECT clock_timestamp() AS now");
      const reviewedAt = dateValue(clock.rows[0]?.now);
      if (dateValue(currentRow.due_at).valueOf() > reviewedAt.valueOf()) {
        throw new StudyRouteError(409, "STUDY_CARD_NOT_DUE", "This card is not due for review yet.");
      }
      const previousSchedule = scheduleFromRow(currentRow);
      const next = applyStudyRating(previousSchedule, rating, reviewedAt);
      const updated = await client.query<CardRow>(
        `UPDATE study_cards
            SET due_at = $3, stability = $4, difficulty = $5, elapsed_days = $6,
                scheduled_days = $7, learning_steps = $8, reps = $9, lapses = $10,
                state = $11, last_review = $12, revision = revision + 1,
                updated_at = clock_timestamp()
          WHERE user_id = $1 AND id = $2::uuid AND revision = $13
          RETURNING id::text, deck_id::text, front, back, revision,
                    algorithm_version, algorithm_parameters, due_at, stability,
                    difficulty, elapsed_days, scheduled_days, learning_steps,
                    reps, lapses, state, last_review, created_at, updated_at`,
        [
          userId,
          cardId,
          next.schedule.due,
          next.schedule.stability,
          next.schedule.difficulty,
          next.schedule.elapsedDays,
          next.schedule.scheduledDays,
          next.schedule.learningSteps,
          next.schedule.reps,
          next.schedule.lapses,
          next.schedule.state,
          next.schedule.lastReview,
          revision,
        ],
      );
      const updatedRow = updated.rows[0];
      if (!updatedRow) throw new StudyRouteError(412, "STUDY_REVISION_MISMATCH", "This card changed before its review could be saved.");

      await client.query(
        `INSERT INTO study_card_reviews (
           id, user_id, deck_id, card_id, operation_key, rating, reviewed_at,
           due_before, due_after, algorithm_version, state_before, state_after,
           review_log, request_revision, card_revision
         ) VALUES (
           $1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10,
           $11::jsonb, $12::jsonb, $13::jsonb, $14, $15
         )`,
        [
          randomUUID(),
          userId,
          currentRow.deck_id,
          cardId,
          operationKey,
          rating,
          reviewedAt,
          previousSchedule.due,
          next.schedule.due,
          next.schedule.algorithmVersion,
          JSON.stringify(previousSchedule),
          JSON.stringify(next.schedule),
          JSON.stringify(next.log),
          revision,
          updatedRow.revision,
        ],
      );
      await touchStudyDeck(client, userId, currentRow.deck_id);
      return {
        cardId,
        rating,
        reviewedAt: reviewedAt.toISOString(),
        dueAt: next.schedule.due,
        revision: updatedRow.revision,
        algorithmVersion: next.schedule.algorithmVersion,
        replayed: false,
      };
    }, { lockTimeout: "3s", statementTimeout: "8s" });
  }

  private async assertDeckRevision(
    client: PoolClient,
    userId: string,
    deckId: string,
    expectedRevision: number,
  ): Promise<never> {
    const current = await client.query<{ revision: number }>(
      "SELECT revision FROM study_decks WHERE user_id = $1 AND id = $2::uuid",
      [userId, deckId],
    );
    if (!current.rows[0]) throw missingStudyItem();
    if (current.rows[0].revision !== expectedRevision) {
      throw new StudyRouteError(412, "STUDY_REVISION_MISMATCH", "This deck changed in another view. Reload it before saving.");
    }
    throw new Error("The study deck update did not complete.");
  }

  private async assertCardRevision(
    client: PoolClient,
    userId: string,
    cardId: string,
    expectedRevision: number,
  ): Promise<never> {
    const current = await client.query<{ revision: number }>(
      "SELECT revision FROM study_cards WHERE user_id = $1 AND id = $2::uuid",
      [userId, cardId],
    );
    if (!current.rows[0]) throw missingStudyItem();
    if (current.rows[0].revision !== expectedRevision) {
      throw new StudyRouteError(412, "STUDY_REVISION_MISMATCH", "This card changed in another view. Reload it before saving.");
    }
    throw new Error("The study card update did not complete.");
  }

  async deleteCard(userId: string, cardId: string, revision: number): Promise<void> {
    await withOwnerTransaction(this.database, userId, async (client) => {
      const deckId = await lockStudyCardParent(client, userId, cardId);
      const result = await client.query(
        "DELETE FROM study_cards WHERE user_id = $1 AND id = $2::uuid AND deck_id = $3::uuid AND revision = $4 RETURNING deck_id::text",
        [userId, cardId, deckId, revision],
      );
      const row = result.rows[0] as { deck_id?: string } | undefined;
      if (!row?.deck_id) {
        await this.assertCardRevision(client, userId, cardId, revision);
      }
      await touchStudyDeck(client, userId, deckId);
    });
  }
}

function cardInsertValues(
  userId: string,
  deckId: string,
  front: string,
  back: string,
  schedule: StoredStudySchedule,
): readonly unknown[] {
  return [
    randomUUID(), userId, deckId, front, back,
    schedule.algorithmVersion, JSON.stringify(schedule.parameters), schedule.due,
    schedule.stability, schedule.difficulty, schedule.elapsedDays,
    schedule.scheduledDays, schedule.learningSteps, schedule.reps,
    schedule.lapses, schedule.state, schedule.lastReview,
  ];
}

function mapDeck(row: DeckRow): StudyDeck {
  return {
    id: row.id,
    name: row.name,
    revision: row.revision,
    createdAt: dateValue(row.created_at).toISOString(),
    updatedAt: dateValue(row.updated_at).toISOString(),
    totalCards: safeCount(row.total_cards),
    dueCards: safeCount(row.due_cards),
  };
}

function mapCard(row: CardRow): StudyCard {
  return {
    id: row.id,
    deckId: row.deck_id,
    front: row.front,
    back: row.back,
    revision: row.revision,
    dueAt: dateValue(row.due_at).toISOString(),
    createdAt: dateValue(row.created_at).toISOString(),
    updatedAt: dateValue(row.updated_at).toISOString(),
  };
}

function scheduleFromRow(row: CardRow): StoredStudySchedule {
  return restoreStoredStudySchedule({
    algorithmVersion: row.algorithm_version,
    parameters: row.algorithm_parameters,
    due: dateValue(row.due_at).toISOString(),
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    elapsedDays: Number(row.elapsed_days),
    scheduledDays: Number(row.scheduled_days),
    learningSteps: Number(row.learning_steps),
    reps: Number(row.reps),
    lapses: Number(row.lapses),
    state: Number(row.state),
    lastReview: row.last_review === null ? null : dateValue(row.last_review).toISOString(),
  });
}

function mapReview(row: ReviewRow, cardId: string, replayed: boolean): StudyReviewResult {
  return {
    cardId,
    rating: row.rating,
    reviewedAt: dateValue(row.reviewed_at).toISOString(),
    dueAt: dateValue(row.due_after).toISOString(),
    revision: row.card_revision,
    algorithmVersion: row.algorithm_version,
    replayed,
  };
}

function dateValue(value: Date | string | undefined): Date {
  const date = value instanceof Date ? value : new Date(value ?? Number.NaN);
  if (!Number.isFinite(date.valueOf())) throw new Error("The study record contains an invalid timestamp.");
  return date;
}

function safeCount(value: string | number | undefined): number {
  const count = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("The study record count is invalid.");
  return count;
}

function missingStudyItem(): StudyRouteError {
  return new StudyRouteError(404, "STUDY_ITEM_NOT_FOUND", "That study item could not be found.");
}

async function lockStudyCardParent(
  client: PoolClient,
  userId: string,
  cardId: string,
): Promise<string> {
  const card = await client.query<{ deck_id: string }>(
    "SELECT deck_id::text FROM study_cards WHERE user_id = $1 AND id = $2::uuid",
    [userId, cardId],
  );
  const deckId = card.rows[0]?.deck_id;
  if (!deckId) throw missingStudyItem();
  await lockStudyDeck(client, userId, deckId);
  return deckId;
}

async function lockStudyDeck(client: PoolClient, userId: string, deckId: string): Promise<void> {
  const result = await client.query(
    "SELECT id FROM study_decks WHERE user_id = $1 AND id = $2::uuid FOR UPDATE",
    [userId, deckId],
  );
  if (result.rows.length !== 1) throw missingStudyItem();
}

async function touchStudyDeck(client: PoolClient, userId: string, deckId: string): Promise<void> {
  const result = await client.query(
    `UPDATE study_decks
        SET revision = revision + 1, updated_at = clock_timestamp()
      WHERE user_id = $1 AND id = $2::uuid
      RETURNING revision`,
    [userId, deckId],
  );
  if (result.rows.length !== 1) throw missingStudyItem();
}
