"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "../../auth/client.ts";
import type { StudyCard, StudyDeck } from "../domain/types.ts";
import type { StudyRating } from "../domain/scheduler.ts";
import {
  createStudyCard,
  createStudyDeck,
  deleteStudyCard,
  deleteStudyDeck,
  getDueStudyCard,
  getStudyDeck,
  listStudyDecks,
  reviewStudyCard,
  StudyRequestError,
  updateStudyCard,
  updateStudyDeck,
} from "./study-api.ts";
import { StudyCardEditor } from "./study-card-editor.tsx";
import { StudyCardList } from "./study-card-list.tsx";
import { StudyDeckList } from "./study-deck-list.tsx";
import { StudyReviewPanel } from "./study-review-panel.tsx";
import styles from "./study.module.css";

type PendingReview = Readonly<{
  card: StudyCard;
  rating: StudyRating;
  operationKey: string;
}>;

export function StudyWorkspace() {
  const [decks, setDecks] = useState<readonly StudyDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckPage, setDeckPage] = useState<Awaited<ReturnType<typeof getStudyDeck>> | null>(null);
  const [editingCard, setEditingCard] = useState<StudyCard | null>(null);
  const [renamingDeck, setRenamingDeck] = useState(false);
  const [deckName, setDeckName] = useState("");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [deckListLoadError, setDeckListLoadError] = useState("");
  const [deckPageLoadError, setDeckPageLoadError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [savingDeckName, setSavingDeckName] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [confirmDeleteDeck, setConfirmDeleteDeck] = useState(false);
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [cardFormError, setCardFormError] = useState("");
  const [cardDraftDirty, setCardDraftDirty] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [dueCard, setDueCard] = useState<StudyCard | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [retryRating, setRetryRating] = useState<StudyRating | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [dataRefresh, setDataRefresh] = useState(0);
  const pendingReview = useRef<PendingReview | null>(null);
  const reviewLoadController = useRef<AbortController | null>(null);

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? null;
  const workspaceLoadError = deckListLoadError || deckPageLoadError;
  const deckLoading = selectedDeckId !== null && deckPage?.deck.id !== selectedDeckId && !workspaceLoadError;
  const workspaceBusy = creatingDeck || savingDeckName || savingCard || deletingDeck ||
    deletingCardId !== null || reviewLoading || reviewSaving || loadingMore || workspaceLoading ||
    deckLoading || isReviewing || Boolean(workspaceLoadError);
  const deckSelectionDisabled = workspaceBusy || cardDraftDirty;
  const deckCreationDisabled = workspaceBusy || cardDraftDirty;

  useEffect(() => {
    const controller = new AbortController();
    listStudyDecks(controller.signal).then((items) => {
      if (controller.signal.aborted) return;
      setDecks(items);
      setSelectedDeckId((current) => current && items.some((deck) => deck.id === current)
        ? current
        : items[0]?.id ?? null);
      setDeckListLoadError("");
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setDeckListLoadError(messageOf(reason, "Study decks could not be loaded."));
    }).finally(() => {
      if (!controller.signal.aborted) setWorkspaceLoading(false);
    });
    return () => controller.abort();
  }, [dataRefresh]);

  useEffect(() => {
    if (!selectedDeckId) return;

    const controller = new AbortController();
    getStudyDeck(selectedDeckId, null, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setDeckPage(page);
      setDeckName(page.deck.name);
      setDeckPageLoadError("");
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setDeckPageLoadError(messageOf(reason, "This study deck could not be loaded."));
    });
    return () => controller.abort();
  }, [selectedDeckId, dataRefresh]);

  const refreshData = useCallback(() => {
    setDeckPage(null);
    setDeckListLoadError("");
    setDeckPageLoadError("");
    setWorkspaceLoading(true);
    setDataRefresh((value) => value + 1);
  }, []);

  function retryWorkspaceLoad() {
    refreshData();
  }

  async function handleCreateDeck(name: string) {
    if (deckCreationDisabled) return;
    setCreatingDeck(true);
    try {
      const deck = await createStudyDeck(name);
      setDecks((items) => [deck, ...items]);
      setSelectedDeckId(deck.id);
      setDeckPage(null);
      setWorkspaceError("");
      setDeckListLoadError("");
      setDeckPageLoadError("");
      setEditingCard(null);
      setCardDraftDirty(false);
      setCardFormError("");
      setRenamingDeck(false);
      setConfirmDeleteDeck(false);
      setConfirmDeleteCardId(null);
      resetReview();
    } finally {
      setCreatingDeck(false);
    }
  }

  async function handleRenameDeck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDeck) return;
    setSavingDeckName(true);
    setWorkspaceError("");
    try {
      const updated = await updateStudyDeck(selectedDeck, deckName);
      setDecks((items) => items.map((deck) => deck.id === updated.id ? { ...deck, ...updated } : deck));
      setDeckPage((page) => page ? { ...page, deck: { ...page.deck, ...updated } } : page);
      setDeckName(updated.name);
      setRenamingDeck(false);
    } catch (reason) {
      setWorkspaceError(messageOf(reason, "The deck name could not be saved."));
    } finally {
      setSavingDeckName(false);
    }
  }

  async function handleDeleteDeck() {
    if (!selectedDeck) return;
    setDeletingDeck(true);
    setWorkspaceError("");
    try {
      await deleteStudyDeck(selectedDeck);
      const remaining = decks.filter((deck) => deck.id !== selectedDeck.id);
      setDecks(remaining);
      setSelectedDeckId(remaining[0]?.id ?? null);
      setConfirmDeleteDeck(false);
      setEditingCard(null);
      setCardDraftDirty(false);
      setDeckPage(null);
      resetReview();
    } catch (reason) {
      setWorkspaceError(messageOf(reason, "The deck could not be deleted."));
    } finally {
      setDeletingDeck(false);
    }
  }

  async function handleSaveCard(front: string, back: string): Promise<boolean> {
    if (!selectedDeckId) return false;
    setSavingCard(true);
    setCardFormError("");
    try {
      if (editingCard) await updateStudyCard(editingCard, front, back);
      else await createStudyCard(selectedDeckId, front, back);
      setEditingCard(null);
      setCardDraftDirty(false);
      refreshData();
      return true;
    } catch (reason) {
      setCardFormError(messageOf(reason, "The card could not be saved."));
      return false;
    } finally {
      setSavingCard(false);
    }
  }

  async function handleDeleteCard(card: StudyCard) {
    setDeletingCardId(card.id);
    setWorkspaceError("");
    try {
      await deleteStudyCard(card);
      setConfirmDeleteCardId(null);
      if (editingCard?.id === card.id) {
        setEditingCard(null);
        setCardDraftDirty(false);
      }
      if (dueCard?.id === card.id) resetReview();
      refreshData();
    } catch (reason) {
      setWorkspaceError(messageOf(reason, "The card could not be deleted."));
    } finally {
      setDeletingCardId(null);
    }
  }

  async function handleLoadMore() {
    if (!selectedDeckId || deckPage?.nextCursor === null || deckPage?.nextCursor === undefined) return;
    const requestedDeckId = selectedDeckId;
    setLoadingMore(true);
    try {
      const page = await getStudyDeck(requestedDeckId, deckPage.nextCursor);
      setDeckPage((current) => current && current.deck.id === requestedDeckId
        ? { ...page, cards: [...current.cards, ...page.cards] }
        : current);
    } catch (reason) {
      setWorkspaceError(messageOf(reason, "More cards could not be loaded."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function startReview() {
    if (!selectedDeckId) return;
    reviewLoadController.current?.abort();
    const controller = new AbortController();
    reviewLoadController.current = controller;
    setIsReviewing(true);
    setReviewLoading(true);
    setReviewError("");
    setRetryRating(null);
    pendingReview.current = null;
    try {
      setDueCard(await getDueStudyCard(selectedDeckId, controller.signal));
    } catch (reason) {
      if (!controller.signal.aborted) setReviewError(messageOf(reason, "The next card could not be loaded."));
    } finally {
      if (reviewLoadController.current === controller) {
        reviewLoadController.current = null;
        setReviewLoading(false);
      }
    }
  }

  async function saveReview(rating: StudyRating) {
    if (!dueCard || reviewSaving) return;
    const pending = pendingReview.current?.card.id === dueCard.id
      ? pendingReview.current
      : { card: dueCard, rating, operationKey: crypto.randomUUID() };
    pendingReview.current = pending;
    setRetryRating(pending.rating);
    setReviewSaving(true);
    setReviewError("");
    try {
      await reviewStudyCard(pending.card, pending.rating, pending.operationKey);
      const nextCard = await getDueStudyCard(selectedDeckId ?? "");
      completeReview(nextCard);
    } catch (reason) {
      setReviewError(messageOf(reason, "The review could not be saved. Retry this same rating to verify it."));
      if (
        reason instanceof StudyRequestError &&
        [400, 401, 403, 404, 409, 412, 422].includes(reason.status)
      ) {
        pendingReview.current = null;
        setRetryRating(null);
        void reloadDueCard();
      }
    } finally {
      setReviewSaving(false);
    }
  }

  function completeReview(nextCard: StudyCard | null) {
    pendingReview.current = null;
    setRetryRating(null);
    setReviewError("");
    setDueCard(nextCard);
    setRevealed(false);
    refreshData();
  }

  async function reloadDueCard() {
    if (!selectedDeckId) return;
    reviewLoadController.current?.abort();
    const controller = new AbortController();
    reviewLoadController.current = controller;
    setReviewLoading(true);
    try {
      setDueCard(await getDueStudyCard(selectedDeckId, controller.signal));
      setRevealed(false);
    } catch (reason) {
      if (!controller.signal.aborted) setReviewError(messageOf(reason, "The next card could not be loaded."));
    } finally {
      if (reviewLoadController.current === controller) {
        reviewLoadController.current = null;
        setReviewLoading(false);
      }
    }
  }

  function resetReview() {
    reviewLoadController.current?.abort();
    reviewLoadController.current = null;
    pendingReview.current = null;
    setIsReviewing(false);
    setReviewLoading(false);
    setDueCard(null);
    setRevealed(false);
    setRetryRating(null);
    setReviewError("");
  }

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed.");
      window.location.assign("/sign-in");
    } catch {
      setSignOutError("Sign out failed. Please try again.");
      setSigningOut(false);
    }
  }

  const cards = deckPage?.deck.id === selectedDeckId ? deckPage.cards : [];

  return (
    <main className={styles.study}>
      <header className={styles.topbar}>
        <a className={styles.wordmark} href="/calendar" aria-label="Chron calendar">Chron</a>
        <nav className={styles.navigation} aria-label="Workspace">
          <a href="/calendar">Calendar</a>
          <a href="/study" aria-current="page">Study</a>
          <a href="/research">Research</a>
          <button className={styles.textButton} type="button" onClick={() => { void signOut(); }} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </nav>
      </header>

      <div className={styles.page}>
        <div className={styles.pageHeading}>
          <p className={styles.eyebrow}>Chron / Study</p>
          <h1>Study with intent.</h1>
          <p>Build your own decks, then revisit each idea when it is due.</p>
        </div>

        {workspaceLoadError ? (
          <div className={styles.globalError} role="alert">
            <p>{workspaceLoadError}</p>
            <button className={styles.secondaryButton} type="button" onClick={retryWorkspaceLoad} disabled={workspaceLoading}>
              {workspaceLoading ? "Loading…" : "Retry loading"}
            </button>
          </div>
        ) : null}
        {workspaceError ? <p className={styles.globalError} role="alert">{workspaceError}</p> : null}
        {signOutError ? <p className={styles.globalError} role="alert">{signOutError}</p> : null}

        <div className={styles.workspaceGrid}>
          <StudyDeckList
            decks={decks}
            selectedDeckId={selectedDeckId}
            busy={workspaceBusy}
            creating={creatingDeck}
            loading={workspaceLoading || deckLoading}
            creationDisabled={deckCreationDisabled}
            draftPending={cardDraftDirty}
            loadError={Boolean(workspaceLoadError)}
            selectionDisabled={deckSelectionDisabled}
            onSelect={(deckId) => {
              setSelectedDeckId(deckId);
              setDeckPage(null);
              setDeckPageLoadError("");
              setEditingCard(null);
              setCardDraftDirty(false);
              setCardFormError("");
              setConfirmDeleteDeck(false);
              setConfirmDeleteCardId(null);
              setRenamingDeck(false);
              resetReview();
            }}
            onCreate={handleCreateDeck}
          />

          <div className={styles.mainColumn}>
            {workspaceLoading ? <p className={styles.status} role="status">Loading your decks…</p> : null}
            {deckLoading && !workspaceLoading && !workspaceLoadError ? <p className={styles.status} role="status">Loading this deck…</p> : null}
            {!workspaceLoading && !workspaceLoadError && !selectedDeck ? (
              <section className={styles.emptyWorkspace}>
                <p className={styles.eyebrow}>A clear start</p>
                <h2>Create a deck for a subject you are learning.</h2>
                <p>Your cards stay private to your Chron account. Start with prompts and answers you write yourself.</p>
              </section>
            ) : null}

            {!workspaceLoading && !workspaceLoadError && selectedDeck && deckPage?.deck.id === selectedDeckId ? (
              <>
                <section className={styles.deckHeader}>
                  {renamingDeck ? (
                    <form className={styles.deckRename} onSubmit={handleRenameDeck}>
                      <label htmlFor="study-deck-name">Deck name</label>
                      <input
                        id="study-deck-name"
                        value={deckName}
                        onChange={(event) => setDeckName(event.target.value)}
                        maxLength={120}
                        required
                        disabled={savingDeckName}
                      />
                      <button className={styles.primaryButton} type="submit" disabled={savingDeckName || !deckName.trim()}>
                        {savingDeckName ? "Saving…" : "Save name"}
                      </button>
                      <button className={styles.textButton} type="button" onClick={() => { setDeckName(selectedDeck.name); setRenamingDeck(false); }} disabled={savingDeckName}>Cancel</button>
                    </form>
                  ) : (
                    <div className={styles.deckTitle}>
                      <p className={styles.eyebrow}>Selected deck</p>
                      <h2>{selectedDeck.name}</h2>
                      <div className={styles.deckMeta}>
                        <span>{countLabel(selectedDeck.totalCards, "card")}</span>
                        <span>{selectedDeck.dueCards} due now</span>
                        <span>Reviews use the FSRS schedule saved with each card.</span>
                      </div>
                    </div>
                  )}
                  <div className={styles.deckTools}>
                    <button className={styles.textButton} type="button" onClick={() => { setDeckName(selectedDeck.name); setRenamingDeck(true); }} disabled={renamingDeck || workspaceBusy || cardDraftDirty}>Rename</button>
                    {confirmDeleteDeck ? (
                      <div className={styles.confirmDeckDelete}>
                        <span>Delete this deck, its cards, and their review history?</span>
                        <button className={styles.dangerButton} type="button" onClick={handleDeleteDeck} disabled={deletingDeck || workspaceBusy}>{deletingDeck ? "Deleting…" : "Delete deck"}</button>
                        <button className={styles.textButton} type="button" onClick={() => setConfirmDeleteDeck(false)} disabled={deletingDeck}>Keep deck</button>
                      </div>
                    ) : (
                      <button className={styles.textButton} type="button" onClick={() => setConfirmDeleteDeck(true)} disabled={deletingDeck || workspaceBusy || cardDraftDirty}>Delete deck</button>
                    )}
                  </div>
                </section>

                <StudyReviewPanel
                  active={isReviewing}
                  card={dueCard}
                  loading={reviewLoading}
                  revealed={revealed}
                  saving={reviewSaving}
                  retryRating={retryRating}
                  error={reviewError}
                  startDisabled={workspaceBusy || cardDraftDirty || renamingDeck || confirmDeleteDeck || confirmDeleteCardId !== null}
                  onStart={startReview}
                  onReveal={() => setRevealed(true)}
                  onRate={(rating) => { void saveReview(rating); }}
                  onRetry={() => { if (retryRating) void saveReview(retryRating); }}
                  onRetryLoad={() => { void reloadDueCard(); }}
                  onEnd={resetReview}
                />

                {!isReviewing ? (
                  <>
                    <StudyCardEditor
                      key={`${selectedDeckId}:${editingCard?.id ?? "new-study-card"}`}
                      card={editingCard}
                      busy={workspaceBusy}
                      error={cardFormError}
                      onDirtyChange={setCardDraftDirty}
                      onSave={handleSaveCard}
                      onCancel={() => { setEditingCard(null); setCardDraftDirty(false); setCardFormError(""); }}
                    />
                    <StudyCardList
                      cards={cards}
                      nextCursor={deckPage?.nextCursor ?? null}
                      loadingMore={loadingMore}
                      confirmingDeleteId={confirmDeleteCardId}
                      deletingCardId={deletingCardId}
                      actionsDisabled={workspaceBusy || cardDraftDirty || confirmDeleteDeck}
                      onEdit={(card) => { setEditingCard(card); setCardFormError(""); }}
                      onRequestDelete={(card) => setConfirmDeleteCardId(card.id)}
                      onCancelDelete={() => setConfirmDeleteCardId(null)}
                      onDelete={(card) => { void handleDeleteCard(card); }}
                      onLoadMore={() => { void handleLoadMore(); }}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function countLabel(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function messageOf(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}
