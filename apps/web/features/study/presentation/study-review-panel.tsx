"use client";

import { useEffect, useRef } from "react";
import type { StudyCard } from "../domain/types.ts";
import type { StudyRating } from "../domain/scheduler.ts";
import styles from "./study.module.css";

const ratings: readonly Readonly<{ value: StudyRating; label: string; description: string }>[] = [
  { value: "again", label: "Again", description: "I could not recall it." },
  { value: "hard", label: "Hard", description: "I recalled it with effort." },
  { value: "good", label: "Good", description: "I recalled it correctly." },
  { value: "easy", label: "Easy", description: "I recalled it immediately." },
];

type Props = Readonly<{
  active: boolean;
  card: StudyCard | null;
  loading: boolean;
  revealed: boolean;
  saving: boolean;
  retryRating: StudyRating | null;
  error: string;
  startDisabled: boolean;
  onStart: () => void;
  onReveal: () => void;
  onRate: (rating: StudyRating) => void;
  onRetry: () => void;
  onRetryLoad: () => void;
  onEnd: () => void;
}>;

export function StudyReviewPanel({
  active,
  card,
  loading,
  revealed,
  saving,
  retryRating,
  error,
  startDisabled,
  onStart,
  onReveal,
  onRate,
  onRetry,
  onRetryLoad,
  onEnd,
}: Props) {
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const sessionRef = useRef<HTMLElement>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  const answerRef = useRef<HTMLDivElement>(null);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const ratingFieldsetRef = useRef<HTMLFieldSetElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);
  const previousActive = useRef(active);
  const currentCardId = card?.id;
  const focusPrompt = active && currentCardId !== undefined && !revealed;
  const focusAnswer = active && currentCardId !== undefined && revealed;

  useEffect(() => {
    if (active && !previousActive.current) sessionRef.current?.focus();
    if (!active && previousActive.current) startButtonRef.current?.focus();
    previousActive.current = active;
  }, [active]);

  useEffect(() => {
    if (focusPrompt) promptRef.current?.focus();
  }, [focusPrompt, currentCardId]);

  useEffect(() => {
    if (focusAnswer) answerRef.current?.focus();
  }, [focusAnswer, currentCardId]);

  useEffect(() => {
    if (active && retryRating && !saving) retryButtonRef.current?.focus();
  }, [active, retryRating, saving]);

  useEffect(() => {
    if (active && revealed && error && !retryRating && !saving) ratingFieldsetRef.current?.focus();
  }, [active, revealed, error, retryRating, saving]);

  useEffect(() => {
    if (active && !loading && !card && !error) completionRef.current?.focus();
  }, [active, loading, card, error]);

  if (!active) {
    return (
      <section className={styles.reviewPrompt} aria-labelledby="review-heading">
        <div>
          <p className={styles.eyebrow}>Recall practice</p>
          <h2 id="review-heading">Work through what is due.</h2>
          <p>Chron shows one due card at a time. Your answer ratings update its next review using the saved FSRS schedule.</p>
        </div>
        {startDisabled ? <p className={styles.editorNote}>Save or cancel the current card before starting a review.</p> : null}
        <button ref={startButtonRef} className={styles.primaryButton} type="button" onClick={onStart} disabled={loading || startDisabled}>
          {loading ? "Loading…" : "Start review"}
        </button>
      </section>
    );
  }

  return (
    <section ref={sessionRef} className={styles.review} aria-labelledby="review-heading" tabIndex={-1}>
      <div className={styles.reviewHeader}>
        <div>
          <p className={styles.eyebrow}>Recall practice</p>
          <h2 id="review-heading">Review session</h2>
        </div>
        <button className={styles.textButton} type="button" onClick={onEnd} disabled={saving}>
          End session
        </button>
      </div>

      {loading ? <p className={styles.status} role="status">Finding the next due card…</p> : null}
      {!loading && !card && error ? (
        <div className={styles.sessionComplete}>
          <p className={styles.formError} role="alert">{error}</p>
          <button className={styles.secondaryButton} type="button" onClick={onRetryLoad}>Retry loading</button>
        </div>
      ) : null}
      {!loading && !card && !error ? (
          <div ref={completionRef} className={styles.sessionComplete} role="status" tabIndex={-1}>
          <p className={styles.eyebrow}>Up to date</p>
          <h3>No cards are due.</h3>
          <p>Any remaining cards can be reviewed when their saved schedule makes them due.</p>
        </div>
      ) : null}
      {!loading && card ? (
        <div className={styles.reviewBody}>
          <div className={styles.flashcard} aria-live="polite">
            <p className={styles.cardFaceLabel}>Prompt</p>
            <p ref={promptRef} className={styles.cardFace} tabIndex={-1}>{card.front}</p>
            {revealed ? (
              <div ref={answerRef} className={styles.cardAnswer} tabIndex={-1}>
                <p className={styles.cardFaceLabel}>Answer</p>
                <p className={styles.cardFace}>{card.back}</p>
              </div>
            ) : (
              <button className={styles.secondaryButton} type="button" onClick={onReveal} disabled={saving}>
                Show answer
              </button>
            )}
          </div>

          {error ? <p className={styles.formError} role="alert">{error}</p> : null}
          {revealed ? (
            retryRating && !saving ? (
              <div className={styles.retryReview}>
                <p>Retry the saved <strong>{ratingLabel(retryRating)}</strong> rating to verify this review.</p>
                <button ref={retryButtonRef} className={styles.primaryButton} type="button" onClick={onRetry}>
                  Retry review
                </button>
              </div>
            ) : (
              <fieldset ref={ratingFieldsetRef} className={styles.ratingFieldset} disabled={saving} tabIndex={-1}>
                <legend>How well did you recall it?</legend>
                <div className={styles.ratingChoices}>
                  {ratings.map((rating) => (
                    <button
                      className={styles.ratingButton}
                      key={rating.value}
                      type="button"
                      onClick={() => onRate(rating.value)}
                      aria-label={`${rating.label}: ${rating.description}`}
                    >
                      <span>{rating.label}</span>
                      <small>{rating.description}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ratingLabel(rating: StudyRating): string {
  return ratings.find((item) => item.value === rating)?.label ?? "rating";
}
