"use client";

import { useState, type FormEvent } from "react";
import type { StudyDeck } from "../domain/types.ts";
import styles from "./study.module.css";

type Props = Readonly<{
  decks: readonly StudyDeck[];
  selectedDeckId: string | null;
  busy: boolean;
  creating: boolean;
  loading: boolean;
  creationDisabled: boolean;
  draftPending: boolean;
  loadError: boolean;
  selectionDisabled: boolean;
  onSelect: (deckId: string) => void;
  onCreate: (name: string) => Promise<void>;
}>;

export function StudyDeckList({ decks, selectedDeckId, busy, creating, loading, creationDisabled, draftPending, loadError, selectionDisabled, onSelect, onCreate }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await onCreate(name);
      setName("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The deck could not be created.");
    }
  }

  return (
    <aside className={styles.sidebar} aria-label="Study decks">
      <div className={styles.sidebarHeading}>
        <p className={styles.eyebrow}>Your study space</p>
        <h2>Decks</h2>
      </div>

      {decks.length > 0 ? (
        <ul className={styles.deckList}>
          {decks.map((deck) => (
            <li key={deck.id}>
              <button
                className={styles.deckChoice}
                data-active={deck.id === selectedDeckId}
                type="button"
                aria-pressed={deck.id === selectedDeckId}
                disabled={selectionDisabled}
                onClick={() => onSelect(deck.id)}
              >
                <span className={styles.deckName}>{deck.name}</span>
                <span className={styles.deckCount}>
                  {deck.dueCards > 0 ? `${deck.dueCards} due` : `${deck.totalCards} cards`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.sidebarEmpty}>
          {loading
            ? "Loading your decks…"
            : loadError
              ? "Chron could not load your decks. Use Retry loading above to try again."
              : "No decks yet. Create one below to start reviewing your own cards."}
        </p>
      )}

      <form className={styles.deckCreate} onSubmit={submit}>
        <label htmlFor="new-study-deck">Create a deck</label>
        {draftPending ? <p className={styles.editorNote}>Save or cancel the current card before changing decks.</p> : null}
        <input
          id="new-study-deck"
          autoComplete="off"
          maxLength={120}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={busy || creationDisabled}
        />
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <button className={styles.secondaryButton} type="submit" disabled={busy || creationDisabled || !name.trim()}>
          {creating ? "Saving…" : "Add deck"}
        </button>
      </form>
    </aside>
  );
}
