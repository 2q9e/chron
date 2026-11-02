"use client";

import type { StudyCard } from "../domain/types.ts";
import styles from "./study.module.css";

type Props = Readonly<{
  cards: readonly StudyCard[];
  nextCursor: string | null;
  loadingMore: boolean;
  confirmingDeleteId: string | null;
  deletingCardId: string | null;
  actionsDisabled: boolean;
  onEdit: (card: StudyCard) => void;
  onRequestDelete: (card: StudyCard) => void;
  onCancelDelete: () => void;
  onDelete: (card: StudyCard) => void;
  onLoadMore: () => void;
}>;

export function StudyCardList({
  cards,
  nextCursor,
  loadingMore,
  confirmingDeleteId,
  deletingCardId,
  actionsDisabled,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onDelete,
  onLoadMore,
}: Props) {
  return (
    <section className={styles.cardLibrary} aria-labelledby="card-library-heading">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Deck contents</p>
          <h2 id="card-library-heading">Your cards</h2>
        </div>
        <span className={styles.libraryCount}>{cards.length === 1 ? "1 shown" : `${cards.length} shown`}</span>
      </div>

      {cards.length === 0 ? (
        <p className={styles.libraryEmpty}>Cards you write for this deck will be listed here.</p>
      ) : (
        <ol className={styles.cardList}>
          {cards.map((card) => (
            <li className={styles.cardRow} key={card.id}>
              <div className={styles.cardText}>
                <h3>{card.front}</h3>
                <details>
                  <summary>View answer</summary>
                  <p>{card.back}</p>
                </details>
              </div>
              <div className={styles.cardActions}>
                {confirmingDeleteId === card.id ? (
                  <>
                    <span>Delete this card and its review history?</span>
                    <button className={styles.dangerButton} type="button" onClick={() => onDelete(card)} disabled={actionsDisabled || deletingCardId === card.id}>{deletingCardId === card.id ? "Deleting…" : "Delete"}</button>
                    <button className={styles.textButton} type="button" onClick={onCancelDelete} disabled={deletingCardId === card.id}>Keep card</button>
                  </>
                ) : (
                  <>
                    <button className={styles.textButton} type="button" onClick={() => onEdit(card)} disabled={actionsDisabled}>Edit</button>
                    <button className={styles.textButton} type="button" onClick={() => onRequestDelete(card)} disabled={actionsDisabled}>Delete</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {nextCursor !== null ? (
        <button className={styles.secondaryButton} type="button" onClick={onLoadMore} disabled={loadingMore || actionsDisabled}>
          {loadingMore ? "Loading…" : "Load more cards"}
        </button>
      ) : null}
    </section>
  );
}
