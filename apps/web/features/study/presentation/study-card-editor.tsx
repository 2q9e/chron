"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { StudyCard } from "../domain/types.ts";
import styles from "./study.module.css";

type Props = Readonly<{
  card: StudyCard | null;
  busy: boolean;
  error: string;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (front: string, back: string) => Promise<boolean>;
  onCancel: () => void;
}>;

export function StudyCardEditor({ card, busy, error, onDirtyChange, onSave, onCancel }: Props) {
  const originalFront = card?.front ?? "";
  const originalBack = card?.back ?? "";
  const [front, setFront] = useState(originalFront);
  const [back, setBack] = useState(originalBack);

  useEffect(() => {
    onDirtyChange(front !== originalFront || back !== originalBack);
  }, [front, back, originalFront, originalBack, onDirtyChange]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSave(front, back);
    if (saved && !card) {
      setFront("");
      setBack("");
    }
  }

  function clearDraft() {
    setFront("");
    setBack("");
    onDirtyChange(false);
    onCancel();
  }

  return (
    <form className={styles.editor} onSubmit={submit}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>{card ? "Edit card" : "Write a card"}</p>
          <h2>{card ? "Revise your prompt" : "Add a retrieval prompt"}</h2>
          <p className={styles.editorNote}>
            {card
              ? "Editing this card keeps its saved review schedule. Delete and create a new card when the learning target changes."
              : "Keep one recall target on each card."}
          </p>
        </div>
      </div>
      <label htmlFor="study-card-front">Front</label>
      <textarea
        id="study-card-front"
        value={front}
        onChange={(event) => setFront(event.target.value)}
        maxLength={4000}
        rows={3}
        required
        disabled={busy}
      />
      <label htmlFor="study-card-back">Back</label>
      <textarea
        id="study-card-back"
        value={back}
        onChange={(event) => setBack(event.target.value)}
        maxLength={8000}
        rows={4}
        required
        disabled={busy}
      />
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
      <div className={styles.formActions}>
        <button className={styles.primaryButton} type="submit" disabled={busy || !front.trim() || !back.trim()}>
          {busy ? "Saving…" : card ? "Save card" : "Add card"}
        </button>
        <button className={styles.textButton} type="button" onClick={clearDraft} disabled={busy || (!card && !front && !back)}>
          {card ? "Cancel" : "Clear draft"}
        </button>
      </div>
    </form>
  );
}
