"use client";

import { authClient } from "../../auth/client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { calendarToday } from "../domain/time";
import { calendarEventSeries, type CalendarEventEntry, type CalendarPreferences, type CalendarSeriesDraftRequest } from "../domain/types";
import { approveCalendarSeriesDraft, CalendarRequestError, checkCalendarEventConflicts, createCalendarEvent, createCalendarSeriesDraft, deleteCalendarEvent, fetchCalendarEvents, fetchCalendarPreferences, reconcileCalendarCreate, saveCalendarPreferences, updateCalendarEvent } from "./calendar-api";
import { countCalendarCreateRecoveryOutcomes, forgetPendingCalendarCreate, pendingCalendarCreates, reconcileCalendarCreateBatch, storePendingCalendarCreate, summarizeCalendarCreateRecovery } from "./calendar-create-recovery";
import { forgetPendingCalendarSeriesApproval, pendingCalendarSeriesApprovals, reconcileCalendarSeriesApprovalBatch, storePendingCalendarSeriesApproval } from "./calendar-series-recovery";
import { buildEventDraft, defaultPreferences, formatRangeHeading, localeWeekStart, localTimeZone, navigateDate, newEventDraft, updateEventDraft, validateCalendarEventDraft, visibleRange, type CalendarView, type EventDraft } from "./calendar-model";
import { CalendarEditor, type Editor } from "./calendar-editor";
import { CalendarSearch } from "./calendar-search";
import { CalendarPreferencesForm } from "./calendar-preferences";
import { AgendaCalendar, MonthCalendar, TimeCalendar } from "./calendar-views";
import styles from "./calendar.module.css";

const views: CalendarView[] = ["day", "week", "month", "agenda"];
type RecoveryState = "checking" | "idle" | "verifying" | "reauth" | "error";

function isUncertainCreateOutcome(reason: unknown): boolean {
  if (!(reason instanceof CalendarRequestError)) return true;
  return (reason.status >= 200 && reason.status < 300)
    || reason.status === 408
    || reason.status === 429
    || reason.status >= 500;
}

export function CalendarWorkspace({ userId, userName }: { userId: string; userName: string }) {
  const [locale, setLocale] = useState("en");
  const [date, setDate] = useState("");
  const [view, setView] = useState<CalendarView>("month");
  const [preferences, setPreferences] = useState<CalendarPreferences | null>(null);
  const [settings, setSettings] = useState<CalendarPreferences | null>(null);
  const [events, setEvents] = useState<CalendarEventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState("");
  const [editorStale, setEditorStale] = useState(false);
  const [editorRetryOnly, setEditorRetryOnly] = useState(false);
  const [editorReauthRequired, setEditorReauthRequired] = useState(false);
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const [settingsError, setSettingsError] = useState("");
  const editorGeneration = useRef(0);
  const editorOpener = useRef<HTMLElement | null>(null);
  const focusAfterEditor = useRef<"immediate" | "after-load" | null>(null);
  const newEventButton = useRef<HTMLButtonElement | null>(null);
  const calendarHeading = useRef<HTMLHeadingElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const backgroundLocked = busy || signingOut || recoveryState !== "idle";
  const calendarLocked = backgroundLocked || editorRetryOnly;

  useEffect(() => {
    const controller = new AbortController();
    fetchCalendarPreferences(controller.signal).then((saved) => {
      if (controller.signal.aborted) return;
      const value = saved ?? defaultPreferences(localTimeZone(), localeWeekStart(navigator.language));
      setLocale(navigator.language); setPreferences(value); setSettings(value); setDate(calendarToday(value.timeZone));
    }).catch((reason: unknown) => { if (!controller.signal.aborted) { setLoading(false); setLoadError(reason instanceof Error ? reason.message : "Could not load calendar preferences."); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      const operationKeys = pendingCalendarCreates(userId);
      const seriesApprovals = pendingCalendarSeriesApprovals(userId);
      if (!active) return;
      if (operationKeys === null || seriesApprovals === null) {
        setRecoveryError("Chron could not read browser recovery storage. Enable site storage and try verifying again.");
        setRecoveryState("error");
        return;
      }
      if (operationKeys.length === 0 && seriesApprovals.length === 0) {
        setRecoveryError("");
        setRecoveryState("idle");
        return;
      }

      setRecoveryError("");
      setNotice("");
      setRecoveryState("verifying");
      const batch = await reconcileCalendarCreateBatch(operationKeys, async (operationKey) => {
        try {
          const event = await reconcileCalendarCreate(operationKey);
          if (!active) throw new Error("Calendar save verification was cancelled.");
          return event ? "saved" : "missing";
        } catch (reason) {
          if (!active) throw reason;
          if (reason instanceof CalendarRequestError && reason.code === "CREATED_EVENT_DELETED") {
            return "deleted";
          }
          throw reason;
        }
      });
      if (!active) return;
      if (batch.error !== null) {
        const summary = summarizeCalendarCreateRecovery(countCalendarCreateRecoveryOutcomes(batch.outcomes));
        if (summary.message) setNotice(summary.message);
        if (summary.reloadCalendar) setReload((value) => value + 1);
        setRecoveryError(batch.error instanceof CalendarRequestError && batch.error.status === 401
          ? "Your sign-in expired. Sign in again to verify the approved event save."
          : batch.error instanceof Error
            ? batch.error.message
            : "Chron could not verify the approved event save. Try again.");
        setRecoveryState(batch.error instanceof CalendarRequestError && batch.error.status === 401 ? "reauth" : "error");
        return;
      }

      const seriesBatch = await reconcileCalendarSeriesApprovalBatch(seriesApprovals, async ({ draftId, action }) => {
        try {
          return (await approveCalendarSeriesDraft(draftId, action)).outcome;
        } catch (reason) {
          if (reason instanceof CalendarRequestError
            && reason.status === 404
            && reason.code === "SERIES_DRAFT_NOT_FOUND") return "missing";
          throw reason;
        }
      });
      if (!active) return;

      const createSummary = summarizeCalendarCreateRecovery(countCalendarCreateRecoveryOutcomes(batch.outcomes));
      const approvedSeriesCount = seriesBatch.outcomes.filter((outcome) => outcome === "approved").length;
      const deletedSeriesCount = seriesBatch.outcomes.filter((outcome) => outcome === "deleted").length;
      const missingSeriesCount = seriesBatch.outcomes.filter((outcome) => outcome === "missing").length;
      const staleSeriesCount = seriesBatch.outcomes.filter((outcome) => outcome === "stale").length;
      const expiredSeriesCount = seriesBatch.outcomes.filter((outcome) => outcome === "expired").length;
      const messages = [createSummary.message];
      if (approvedSeriesCount > 0) messages.push(`${approvedSeriesCount} previously approved recurring change${approvedSeriesCount === 1 ? " was" : "s were"} completed.`);
      if (deletedSeriesCount > 0) messages.push(`${deletedSeriesCount} previously approved recurring series ${deletedSeriesCount === 1 ? "is" : "are"} no longer present.`);
      if (staleSeriesCount > 0) messages.push(`${staleSeriesCount} recurring proposal${staleSeriesCount === 1 ? " became" : "s became"} stale before approval; no changes were made for those proposals.`);
      if (expiredSeriesCount > 0) messages.push(`${expiredSeriesCount} recurring proposal${expiredSeriesCount === 1 ? " expired" : "s expired"} before approval; no changes were made for those proposals.`);
      if (missingSeriesCount > 0) messages.push(`${missingSeriesCount} recurring proposal${missingSeriesCount === 1 ? " could not be found and was not applied" : "s could not be found and were not applied"}.`);
      const message = messages.filter(Boolean).join(" ");
      if (message) setNotice(message);
      if (createSummary.reloadCalendar || approvedSeriesCount > 0 || deletedSeriesCount > 0) setReload((value) => value + 1);

      if (seriesBatch.error !== null) {
        setRecoveryError(seriesBatch.error instanceof CalendarRequestError && seriesBatch.error.status === 401
          ? "Your sign-in expired. Sign in again to verify previously approved calendar changes."
          : seriesBatch.error instanceof Error
            ? seriesBatch.error.message
            : "Chron could not verify a previously approved calendar change. Try again.");
        setRecoveryState(seriesBatch.error instanceof CalendarRequestError && seriesBatch.error.status === 401 ? "reauth" : "error");
        return;
      }

      for (const operationKey of operationKeys) forgetPendingCalendarCreate(userId, operationKey);
      for (const { draftId } of seriesApprovals) forgetPendingCalendarSeriesApproval(userId, draftId);
      setRecoveryState("idle");
    });

    return () => { active = false; };
  }, [userId, recoveryAttempt]);

  useEffect(() => {
    if (!preferences || !date) return;
    const controller = new AbortController();
    const range = visibleRange(view, date, preferences.weekStartsOn);
    Promise.resolve().then(() => { if (!controller.signal.aborted) { setLoading(true); setLoadError(""); } });
    fetchCalendarEvents(range.from, range.to, preferences.timeZone, controller.signal).then((items) => { setEvents(items); setLoading(false); }).catch((reason: unknown) => { if (!controller.signal.aborted) { setLoading(false); setLoadError(reason instanceof Error ? reason.message : "Could not load events."); } });
    return () => controller.abort();
  }, [date, view, preferences, reload]);

  useEffect(() => {
    const timing = focusAfterEditor.current;
    if (editor || !timing || recoveryState !== "idle" || (timing === "after-load" && (loading || busy))) return;
    focusAfterEditor.current = null;
    const opener = editorOpener.current;
    editorOpener.current = null;
    if (opener?.isConnected && !(opener instanceof HTMLButtonElement && opener.disabled)) {
      opener.focus();
    } else if (!loadError && newEventButton.current && !newEventButton.current.disabled) {
      newEventButton.current.focus();
    } else {
      calendarHeading.current?.focus();
    }
  }, [editor, loading, busy, events, loadError, recoveryState]);



  const rememberEditorOpener = useCallback(() => {
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  function closeEditor(afterLoad = false) {
    editorGeneration.current += 1;
    focusAfterEditor.current = afterLoad ? "after-load" : "immediate";
    if (afterLoad) {
      setLoading(true);
      setLoadError("");
    }
    setEditor(null);
    setEditorError("");
    setEditorStale(false);
    setEditorRetryOnly(false);
    setEditorReauthRequired(false);
  }
  function discardAndReload() {
    closeEditor(true);
    setReload((value) => value + 1);
    setRecoveryState("checking");
    setRecoveryAttempt((value) => value + 1);
  }
  function navigateTo(nextDate: string) {
    if (calendarLocked) return;
    setNotice("");
    setDate(nextDate);
  }
  function changeView(nextView: CalendarView) {
    if (calendarLocked) return;
    setNotice("");
    setView(nextView);
  }
  function goToToday() {
    if (!preferences) return;
    navigateTo(calendarToday(preferences.timeZone));
  }
  const openNew = useCallback((day: string) => {
    if (!preferences || calendarLocked) return;
    rememberEditorOpener();
    focusAfterEditor.current = null;
    editorGeneration.current += 1;
    setEditor({ generation: editorGeneration.current, event: null, operationKey: crypto.randomUUID(), operationAction: "create", draft: newEventDraft(day), zone: preferences.timeZone, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false, seriesDraft: null }); setEditorError(""); setEditorStale(false); setEditorRetryOnly(false); setEditorReauthRequired(false); setNotice("");
  }, [preferences, calendarLocked, rememberEditorOpener]);
  const openEvent = useCallback((selected: CalendarEventEntry, returnFocusTarget?: HTMLElement | null) => {
    if (!preferences || calendarLocked) return;
    const event = calendarEventSeries(selected);
    if (returnFocusTarget?.isConnected) editorOpener.current = returnFocusTarget;
    else rememberEditorOpener();
    focusAfterEditor.current = null;
    editorGeneration.current += 1;
    setEditor({ generation: editorGeneration.current, event, operationKey: event.recurrenceRule ? crypto.randomUUID() : null, operationAction: event.recurrenceRule ? "update" : null, draft: buildEventDraft(event), zone: event.kind === "timed" ? event.timeZone : event.reminderTimeZone ?? preferences.timeZone, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false, seriesDraft: null }); setEditorError(""); setEditorStale(false); setEditorRetryOnly(false); setEditorReauthRequired(false); setNotice("");
  }, [preferences, calendarLocked, rememberEditorOpener]);
  function changeDraft(field: keyof EventDraft, value: string) {
    if (editorStale || calendarLocked) return;
    const nextOperationKey = crypto.randomUUID();
    setEditor((current) => current ? {
      ...current,
      operationKey: !current.event || current.event.recurrenceRule ? nextOperationKey : current.operationKey,
      operationAction: !current.event ? "create" : current.event.recurrenceRule ? "update" : null,
      draft: updateEventDraft(current.draft, field, value),
      errors: {},
      review: null,
      conflicts: [],
      reviewTimeZone: null,
      deleting: false,
      seriesDraft: null,
    } : current);
    setEditorError("");
  }
  async function reviewEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor || backgroundLocked || editorRetryOnly) return;
    setEditorError("");
    const generation = editor.generation;
    const result = validateCalendarEventDraft(editor.draft, editor.zone);
    if (!result.ok) { setEditor({ ...editor, errors: result.errors }); return; }
    if (editor.event?.recurrenceRule && !result.recurrenceRule) {
      setEditorError("A repeating series must keep a finite recurrence rule.");
      return;
    }
    const proposalAction: "update" | "create" = editor.event ? "update" : "create";
    const operationKey = editor.operationAction === proposalAction
      ? editor.operationKey
      : crypto.randomUUID();
    if (!operationKey) {
      setEditorError("The series proposal key is missing. Reload the calendar before continuing.");
      return;
    }
    const reviewedEditor: Editor = {
      ...editor,
      operationAction: proposalAction,
      operationKey,
      review: null,
      conflicts: [],
      reviewTimeZone: null,
      deleting: false,
      seriesDraft: null,
    };
    setEditor(reviewedEditor);
    setBusy(true); setEditorError("");
    try {
      if (result.recurrenceRule) {
        const request: CalendarSeriesDraftRequest = reviewedEditor.event
          ? {
              action: "update",
              scope: "series",
              targetEventId: reviewedEditor.event.id,
              targetRevision: reviewedEditor.event.revision,
              event: result.mutation,
              recurrenceRule: result.recurrenceRule,
              calendarTimeZone: preferences?.timeZone ?? reviewedEditor.zone,
            }
          : {
              action: "create",
              scope: "series",
              event: result.mutation,
              recurrenceRule: result.recurrenceRule,
              calendarTimeZone: preferences?.timeZone ?? reviewedEditor.zone,
            };
        const draft = await createCalendarSeriesDraft(request, operationKey);
        if (editorGeneration.current !== generation) return;
        if (draft.outcome !== "pending") {
          setEditor({ ...reviewedEditor, operationKey: crypto.randomUUID(), seriesDraft: null });
          setEditorError("That recurring proposal is no longer pending. Review the series again.");
          return;
        }
        setEditor({
          ...reviewedEditor,
          errors: {},
          review: null,
          conflicts: [],
          reviewTimeZone: preferences?.timeZone ?? editor.zone,
          deleting: false,
          seriesDraft: draft,
        });
        return;
      }
      const conflicts = await checkCalendarEventConflicts(
        result.mutation,
        preferences?.timeZone ?? reviewedEditor.zone,
        reviewedEditor.event?.id,
      );
      if (editorGeneration.current !== generation) return;
      setEditor({ ...reviewedEditor, errors: {}, review: result.mutation, conflicts, reviewTimeZone: preferences?.timeZone ?? reviewedEditor.zone, deleting: false, seriesDraft: null });
    } catch (reason) {
      if (editorGeneration.current === generation) {
        setEditorError(reason instanceof Error ? reason.message : "Could not check for overlapping events. Try reviewing this event again.");
        if (reason instanceof CalendarRequestError
          && (reason.status === 412 || reason.code === "SERIES_TARGET_STALE" || reason.code === "EVENT_NOT_FOUND")) {
          setEditorStale(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function confirmEvent() {
    if (editor?.seriesDraft) {
      if (!preferences || backgroundLocked) return;
      const current = editor;
      const proposal = current.seriesDraft;
      if (!proposal) return;
      const generation = current.generation;
      if (proposal.action !== "delete"
        && proposal.calendarTimeZone !== preferences.timeZone) {
        setEditor({ ...current, operationKey: crypto.randomUUID(), operationAction: proposal.action, seriesDraft: null });
        setEditorError("The calendar time zone changed. Review the recurring proposal again.");
        return;
      }
      if (!storePendingCalendarSeriesApproval(userId, proposal.id, proposal.action)) {
        setEditorError("Chron could not prepare safe approval recovery because browser storage is unavailable. No series change was sent. Enable site storage and try again.");
        return;
      }
      setEditorRetryOnly(true);
      setBusy(true); setEditorError("");
      try {
        const approval = await approveCalendarSeriesDraft(proposal.id, proposal.action, proposal);
        if (editorGeneration.current !== generation) return;
        if (approval.outcome === "approved") {
          forgetPendingCalendarSeriesApproval(userId, proposal.id);
          closeEditor(true);
          setNotice(approval.action === "create"
            ? "Repeating series created."
            : approval.action === "update"
              ? "Repeating series updated."
              : "Repeating series deleted.");
          setReload((value) => value + 1);
        } else if (approval.outcome === "expired") {
          forgetPendingCalendarSeriesApproval(userId, proposal.id);
          setEditor({ ...current, operationKey: crypto.randomUUID(), operationAction: proposal.action, seriesDraft: null });
          setEditorRetryOnly(false);
          setEditorError("This proposal expired without changing the calendar. Review the series again to create a new proposal.");
        } else {
          forgetPendingCalendarSeriesApproval(userId, proposal.id);
          setEditorError(approval.outcome === "stale"
            ? "The calendar changed after this proposal was prepared. Reload it and review the series again."
            : "This series is no longer available. Reload the calendar to see its current state.");
          setEditorRetryOnly(false);
          setEditorStale(true);
          setReload((value) => value + 1);
        }
      } catch (reason) {
        if (editorGeneration.current !== generation) return;
        if (reason instanceof CalendarRequestError && reason.status === 401) {
          setEditorReauthRequired(true);
          setEditorRetryOnly(true);
          setEditorError("Your sign-in expired. Sign in again, then retry this same series approval.");
        } else if (reason instanceof CalendarRequestError && reason.status === 404) {
          forgetPendingCalendarSeriesApproval(userId, proposal.id);
          setEditorRetryOnly(false);
          setEditorError("This proposal could not be found. Reload the calendar and review the series again.");
          setEditorStale(true);
        } else {
          setEditorRetryOnly(true);
          setEditorError("Chron could not confirm this series approval. Retry the same approval to check its result.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!editor?.review || !preferences || backgroundLocked) return;
    const generation = editor.generation;
    setBusy(true); setEditorError("");
    try {
      if (editor.reviewTimeZone !== preferences.timeZone) {
        const conflicts = await checkCalendarEventConflicts(
          editor.review,
          preferences.timeZone,
          editor.event?.id,
        );
        if (editorGeneration.current !== generation) return;
        setEditor({ ...editor, conflicts, reviewTimeZone: preferences.timeZone });
        setEditorError("The calendar time zone changed. Review the updated overlaps before approving this event.");
        return;
      }
      if (editor.event) {
        await updateCalendarEvent(editor.event, editor.review, preferences.timeZone, editor.conflicts);
      } else {
        if (!editor.operationKey) throw new Error("The create request key is missing. Reload the calendar before retrying.");
        if (!storePendingCalendarCreate(userId, editor.operationKey)) {
          setEditorError("Chron could not prepare safe save recovery because browser storage is unavailable. No event was sent. Enable site storage and try again.");
          return;
        }
        await createCalendarEvent(editor.review, preferences.timeZone, editor.conflicts, editor.operationKey);
        forgetPendingCalendarCreate(userId, editor.operationKey);
      }
      if (editorGeneration.current === generation) closeEditor(true);
      setNotice("Event saved."); setReload((value) => value + 1);
    } catch (reason) {
      if (editorGeneration.current !== generation) return;
      if (reason instanceof CalendarRequestError && reason.code === "IDEMPOTENCY_KEY_REUSED") {
        setEditorError(reason.message);
        setEditorStale(true);
      } else if (reason instanceof CalendarRequestError && reason.code === "IDEMPOTENCY_KEY_ABANDONED") {
        if (editor.operationKey) forgetPendingCalendarCreate(userId, editor.operationKey);
        setEditor({ ...editor, operationKey: crypto.randomUUID() });
        setEditorRetryOnly(false);
        setEditorStale(false);
        setEditorError("The earlier save was verified as incomplete. Review the event again before starting a new save.");
      } else if (reason instanceof CalendarRequestError && reason.code === "CREATED_EVENT_DELETED") {
        if (editor.operationKey) forgetPendingCalendarCreate(userId, editor.operationKey);
        setEditorRetryOnly(false);
        setEditorError("This event was saved and then deleted before Chron could confirm the result. Reload the calendar before creating another event.");
        setEditorStale(true);
      } else if (reason instanceof CalendarRequestError && reason.status === 401) {
        if (!editor.event && !editorRetryOnly && editor.operationKey) {
          forgetPendingCalendarCreate(userId, editor.operationKey);
        }
        setEditorReauthRequired(true);
        setEditorError(editorRetryOnly
          ? "Your sign-in expired. The approved save is still queued for verification. Sign in again to check its result."
          : "Your sign-in expired. Sign in again, then review and save the event.");
      } else if (reason instanceof CalendarRequestError && reason.status === 409) {
        const recoveringCreate = !editor.event && editorRetryOnly && (
          reason.code === "CONFLICT_REVIEW_REQUIRED"
          || reason.code === "CALENDAR_TIME_ZONE_CHANGED"
        );
        if (!editor.event && editorRetryOnly && !recoveringCreate) {
          setEditorError(reason.message);
          setEditorStale(true);
          return;
        }
        if (!editor.event && editor.operationKey) {
          forgetPendingCalendarCreate(userId, editor.operationKey);
        }
        try {
          const latestPreferences = reason.code === "CALENDAR_TIME_ZONE_CHANGED"
            ? await fetchCalendarPreferences()
            : null;
          const timeZone = latestPreferences?.timeZone ?? preferences.timeZone;
          const conflicts = await checkCalendarEventConflicts(
            editor.review,
            timeZone,
            editor.event?.id,
          );
          if (editorGeneration.current !== generation) return;
          if (latestPreferences) {
            setPreferences(latestPreferences);
            setSettings(latestPreferences);
          }
          setEditor({
            ...editor,
            ...(!editor.event ? { operationKey: crypto.randomUUID() } : {}),
            conflicts,
            reviewTimeZone: timeZone,
          });
          if (recoveringCreate) {
            setEditorRetryOnly(false);
            setEditorError("The save was rejected because calendar overlaps changed. Review the updated list and approve again.");
          } else {
            setEditorError("An overlapping event changed while you approved this one. Review the updated list and approve again.");
          }
        } catch {
          if (editorGeneration.current === generation) {
            setEditorError("The calendar changed while you approved this event. Reload and review it again.");
            setEditorStale(true);
          }
        }
      } else if (!editor.event && isUncertainCreateOutcome(reason)) {
        setEditorError("Chron could not confirm whether this event saved. Retry the same approved save to reconcile the result.");
        setEditorRetryOnly(true);
      } else if (reason instanceof CalendarRequestError && (reason.status === 412 || reason.status === 428)) {
        if (!editor.event && editor.operationKey) {
          forgetPendingCalendarCreate(userId, editor.operationKey);
        }
        setEditorError(reason.message);
        setEditorStale(true);
      } else {
        if (!editor.event && editor.operationKey && !isUncertainCreateOutcome(reason)) {
          forgetPendingCalendarCreate(userId, editor.operationKey);
        }
        setEditorError(reason instanceof Error ? reason.message : "Could not save the event. Try approving it again.");
      }
    }
    finally { setBusy(false); }
  }
  async function reviewDelete() {
    if (!editor?.event || backgroundLocked || editorRetryOnly) return;
    if (!editor.event.recurrenceRule) {
      setEditor({ ...editor, deleting: true, review: null, seriesDraft: null });
      return;
    }

    if (!editor.operationKey) {
      setEditorError("The series proposal key is missing. Reload the calendar before continuing.");
      return;
    }
    const generation = editor.generation;
    const operationKey = editor.operationAction === "delete"
      ? editor.operationKey
      : crypto.randomUUID();
    if (!operationKey) {
      setEditorError("The series proposal key is missing. Reload the calendar before continuing.");
      return;
    }
    setEditor({
      ...editor,
      operationKey,
      operationAction: "delete",
      review: null,
      conflicts: [],
      reviewTimeZone: null,
      deleting: false,
      seriesDraft: null,
    });
    setBusy(true); setEditorError("");
    try {
      const draft = await createCalendarSeriesDraft({
        action: "delete",
        scope: "series",
        targetEventId: editor.event.id,
        targetRevision: editor.event.revision,
      }, operationKey);
      if (editorGeneration.current !== generation) return;
      if (draft.outcome !== "pending") {
        setEditor({ ...editor, operationKey: crypto.randomUUID(), operationAction: "delete", seriesDraft: null });
        setEditorError("That deletion proposal is no longer pending. Review the series again.");
        return;
      }
      setEditor({ ...editor, operationKey, operationAction: "delete", review: null, conflicts: [], deleting: false, seriesDraft: draft });
    } catch (reason) {
      if (editorGeneration.current !== generation) return;
      setEditorError(reason instanceof Error ? reason.message : "Could not prepare the series deletion. Try again.");
      if (reason instanceof CalendarRequestError
        && (reason.status === 412 || reason.code === "SERIES_TARGET_STALE" || reason.code === "EVENT_NOT_FOUND")) {
        setEditorStale(true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!editor?.event || backgroundLocked || editorRetryOnly) return;
    if (editor.event.recurrenceRule) {
      setEditorError("Review and approve the entire series before deleting it.");
      return;
    }
    const generation = editor.generation;
    setBusy(true); setEditorError("");
    try {
      await deleteCalendarEvent(editor.event);
      if (editorGeneration.current === generation) closeEditor(true);
      setNotice("Event deleted."); setReload((value) => value + 1);
    }
    catch (reason) {
      if (editorGeneration.current !== generation) return;
      if (reason instanceof CalendarRequestError && (reason.status === 412 || reason.status === 428)) {
        setEditorError(reason.message);
        setEditorStale(true);
      } else {
        setEditorError(reason instanceof Error ? reason.message : "Could not delete the event. Try again.");
      }
    }
    finally { setBusy(false); }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings || calendarLocked) return;
    try { new Intl.DateTimeFormat("en", { timeZone: settings.timeZone }); }
    catch { setSettingsError("Enter a valid IANA time zone, such as America/Montreal."); return; }
    setBusy(true); setSettingsError("");
    try { const saved = await saveCalendarPreferences(settings); setPreferences(saved); setSettings(saved); setSettingsError(""); setNotice("Preferences saved."); }
    catch (reason) { setSettingsError(reason instanceof Error ? reason.message : "Could not save preferences. Try saving again."); }
    finally { setBusy(false); }
  }
  async function signOut() {
    if (calendarLocked || editor) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed. Please try again.");
      window.location.assign("/sign-in");
    } catch {
      setSignOutError("Sign out failed. Please try again.");
      setSigningOut(false);
    }
  }
  return <main className={styles.workspace} data-theme={preferences?.theme} data-density={preferences?.density}>
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>Chron / Calendar</p>
        <h1 ref={calendarHeading} tabIndex={-1}>Calendar</h1>
        <p>Plan and manage your events.</p>
        <p>Signed in as {userName}</p>
      </div>
      <div className={styles.actions}>
        <button ref={newEventButton} type="button" onClick={() => openNew(date)} disabled={!preferences || !date || calendarLocked}>New event</button>
        <button type="button" onClick={signOut} disabled={calendarLocked || !!editor}>{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </header>
    {signOutError && <p className={styles.error} role="alert">{signOutError}</p>}
    {recoveryState === "checking" || recoveryState === "verifying" ? (
      <p className={styles.status} role="status">Verifying approved event saves…</p>
    ) : recoveryState === "reauth" || recoveryState === "error" ? (
      <div className={styles.error} role="alert">
        <p>{recoveryError}</p>
        {recoveryState === "reauth" && <a className={styles.recoveryLink} href="/sign-in">Sign in again</a>}
        <button type="button" onClick={() => { setRecoveryState("checking"); setRecoveryAttempt((value) => value + 1); }}>Retry verification</button>
      </div>
    ) : null}
    <div className={styles.toolbar}>
      <div className={styles.navigation}><button disabled={!date || calendarLocked} type="button" onClick={() => navigateTo(navigateDate(date, view, -1))} aria-label="Previous period">←</button><button type="button" disabled={!date || calendarLocked} onClick={goToToday}>Today</button><button type="button" disabled={!date || calendarLocked} onClick={() => navigateTo(navigateDate(date, view, 1))} aria-label="Next period">→</button></div>
      <h2>{preferences && date ? formatRangeHeading(view, date, preferences.weekStartsOn, locale) : "Calendar"}</h2>
      <div className={styles.viewSwitcher} aria-label="Calendar view">{views.map((item) => <button type="button" key={item} aria-pressed={view === item} disabled={calendarLocked} onClick={() => changeView(item)}>{item}</button>)}</div>
    </div>
    {preferences && date && <CalendarSearch
      key={`${userId}:${preferences.timeZone}`}
      initialDate={date}
      locale={locale}
      timeZone={preferences.timeZone}
      disabled={calendarLocked || !!editor}
      onSelect={(event, returnFocusTarget) => openEvent(event, returnFocusTarget)}
    />}
    {preferences && <p className={styles.zone}>Times shown in {preferences.timeZone}</p>}
    <p role="status" className={styles.status}>{loading ? "Loading calendar…" : notice}</p>
    {loadError && <div className={styles.error} role="alert"><p>{loadError}</p><button type="button" onClick={() => { setLoadError(""); if (!preferences) window.location.reload(); else setReload((value) => value + 1); }}>Retry loading calendar</button></div>}
    {preferences && !loading && !loadError && <><div className={styles.calendarSurface} inert={calendarLocked}>{view === "month" ? <MonthCalendar events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} /> : view === "agenda" ? <AgendaCalendar events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} /> : <TimeCalendar view={view} events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} />}</div>{events.length === 0 && <p className={styles.empty}>No events in this period. <button type="button" disabled={calendarLocked} onClick={() => openNew(date)}>Create an event</button></p>}</>}
    {editor && (
      <CalendarEditor
        editor={editor}
        busy={backgroundLocked}
        error={editorError}
        stale={editorStale}
        retryOnly={editorRetryOnly}
        reauthRequired={editorReauthRequired}
        onChange={changeDraft}
        onReview={reviewEvent}
        onClose={() => closeEditor()}
        onReloadLatest={discardAndReload}
        onDeleteReview={reviewDelete}
        onDeleteCancel={() => setEditor({
          ...editor,
          operationKey: editor.event?.recurrenceRule ? crypto.randomUUID() : editor.operationKey,
          operationAction: editor.event?.recurrenceRule ? "update" : editor.operationAction,
          deleting: false,
          seriesDraft: null,
        })}
        onDeleteConfirm={confirmDelete}
        onSave={confirmEvent}
      />
    )}
    {settings && (
      <CalendarPreferencesForm settings={settings} busy={calendarLocked} error={settingsError} onChange={(value) => { setSettings(value); setSettingsError(""); }} onSave={saveSettings} />
    )}
  </main>;
}
