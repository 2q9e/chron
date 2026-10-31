"use client";

import { authClient } from "../../auth/client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { calendarToday } from "../domain/time";
import { type CalendarEvent, type CalendarPreferences } from "../domain/types";
import { CalendarRequestError, checkCalendarEventConflicts, createCalendarEvent, deleteCalendarEvent, fetchCalendarEvents, fetchCalendarPreferences, reconcileCalendarCreate, saveCalendarPreferences, updateCalendarEvent } from "./calendar-api";
import { countCalendarCreateRecoveryOutcomes, forgetPendingCalendarCreate, pendingCalendarCreates, reconcileCalendarCreateBatch, storePendingCalendarCreate, summarizeCalendarCreateRecovery } from "./calendar-create-recovery";
import { buildEventDraft, defaultPreferences, formatRangeHeading, localeWeekStart, localTimeZone, navigateDate, newEventDraft, validateEventDraft, visibleRange, type CalendarView, type EventDraft } from "./calendar-model";
import { CalendarEditor, type Editor } from "./calendar-editor";
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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
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
      if (!active) return;
      if (operationKeys === null) {
        setRecoveryError("Chron could not read browser recovery storage. Enable site storage and try verifying again.");
        setRecoveryState("error");
        return;
      }
      if (operationKeys.length === 0) {
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
      const counts = countCalendarCreateRecoveryOutcomes(batch.outcomes);
      const summary = summarizeCalendarCreateRecovery(counts);
      if (batch.error !== null) {
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
      if (summary.message) setNotice(summary.message);
      if (summary.reloadCalendar) setReload((value) => value + 1);
      for (const operationKey of operationKeys) forgetPendingCalendarCreate(userId, operationKey);
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
    setEditor({ generation: editorGeneration.current, event: null, operationKey: crypto.randomUUID(), draft: newEventDraft(day), zone: preferences.timeZone, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false }); setEditorError(""); setEditorStale(false); setEditorRetryOnly(false); setEditorReauthRequired(false); setNotice("");
  }, [preferences, calendarLocked, rememberEditorOpener]);
  const openEvent = useCallback((event: CalendarEvent) => {
    if (!preferences || calendarLocked) return;
    rememberEditorOpener();
    focusAfterEditor.current = null;
    editorGeneration.current += 1;
    setEditor({ generation: editorGeneration.current, event, operationKey: null, draft: buildEventDraft(event), zone: event.kind === "timed" ? event.timeZone : preferences.timeZone, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false }); setEditorError(""); setEditorStale(false); setEditorRetryOnly(false); setEditorReauthRequired(false); setNotice("");
  }, [preferences, calendarLocked, rememberEditorOpener]);
  function changeDraft(field: keyof EventDraft, value: string) {
    if (editorStale || calendarLocked) return;
    const nextOperationKey = editor?.event ? editor.operationKey : crypto.randomUUID();
    setEditor((current) => current ? { ...current, operationKey: current.event ? current.operationKey : nextOperationKey, draft: { ...current.draft, [field]: value }, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false } : current);
    setEditorError("");
  }
  async function reviewEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor || backgroundLocked || editorRetryOnly) return;
    const generation = editor.generation;
    const result = validateEventDraft(editor.draft, editor.zone);
    if (!result.ok) { setEditor({ ...editor, errors: result.errors }); return; }
    setBusy(true); setEditorError("");
    try {
      const conflicts = await checkCalendarEventConflicts(
        result.mutation,
        preferences?.timeZone ?? editor.zone,
        editor.event?.id,
      );
      if (editorGeneration.current !== generation) return;
      setEditor({ ...editor, errors: {}, review: result.mutation, conflicts, reviewTimeZone: preferences?.timeZone ?? editor.zone, deleting: false });
    } catch (reason) {
      if (editorGeneration.current === generation) {
        setEditorError(reason instanceof Error ? reason.message : "Could not check for overlapping events. Try reviewing this event again.");
      }
    } finally {
      setBusy(false);
    }
  }
  async function confirmEvent() {
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
  async function confirmDelete() {
    if (!editor?.event || backgroundLocked || editorRetryOnly) return;
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
        onDeleteReview={() => setEditor({ ...editor, deleting: true, review: null })}
        onDeleteCancel={() => setEditor({ ...editor, deleting: false })}
        onDeleteConfirm={confirmDelete}
        onSave={confirmEvent}
      />
    )}
    {settings && (
      <CalendarPreferencesForm settings={settings} busy={calendarLocked} error={settingsError} onChange={(value) => { setSettings(value); setSettingsError(""); }} onSave={saveSettings} />
    )}
  </main>;
}
