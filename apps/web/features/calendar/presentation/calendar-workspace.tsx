"use client";

import { authClient } from "../../auth/client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { calendarToday } from "../domain/time";
import { type CalendarEvent, type CalendarPreferences } from "../domain/types";
import { CalendarRequestError, checkCalendarEventConflicts, createCalendarEvent, deleteCalendarEvent, fetchCalendarEvents, fetchCalendarPreferences, saveCalendarPreferences, updateCalendarEvent } from "./calendar-api";
import { buildEventDraft, defaultPreferences, formatRangeHeading, localeWeekStart, localTimeZone, navigateDate, newEventDraft, validateEventDraft, visibleRange, type CalendarView, type EventDraft } from "./calendar-model";
import { CalendarEditor, type Editor } from "./calendar-editor";
import { CalendarPreferencesForm } from "./calendar-preferences";
import { AgendaCalendar, MonthCalendar, TimeCalendar } from "./calendar-views";
import styles from "./calendar.module.css";

const views: CalendarView[] = ["day", "week", "month", "agenda"];

export function CalendarWorkspace({ userName }: { userName: string }) {
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
  const [settingsError, setSettingsError] = useState("");
  const editorGeneration = useRef(0);
  const editorOpener = useRef<HTMLElement | null>(null);
  const restoreEditorFocus = useRef(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

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
    if (!preferences || !date) return;
    const controller = new AbortController();
    const range = visibleRange(view, date, preferences.weekStartsOn);
    Promise.resolve().then(() => { if (!controller.signal.aborted) { setLoading(true); setLoadError(""); } });
    fetchCalendarEvents(range.from, range.to, preferences.timeZone, controller.signal).then((items) => { setEvents(items); setLoading(false); }).catch((reason: unknown) => { if (!controller.signal.aborted) { setLoading(false); setLoadError(reason instanceof Error ? reason.message : "Could not load events."); } });
    return () => controller.abort();
  }, [date, view, preferences, reload]);

  useEffect(() => {
    if (editor || !restoreEditorFocus.current) return;
    restoreEditorFocus.current = false;
    const opener = editorOpener.current;
    editorOpener.current = null;
    if (opener?.isConnected) opener.focus();
  }, [editor]);



  const rememberEditorOpener = useCallback(() => {
    editorOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  function closeEditor() {
    editorGeneration.current += 1;
    restoreEditorFocus.current = true;
    setEditor(null);
    setEditorError("");
    setEditorStale(false);
  }
  function discardAndReload() {
    closeEditor();
    setReload((value) => value + 1);
  }
  function navigateTo(nextDate: string) {
    setNotice("");
    setDate(nextDate);
  }
  function changeView(nextView: CalendarView) {
    setNotice("");
    setView(nextView);
  }
  function goToToday() {
    if (!preferences) return;
    navigateTo(calendarToday(preferences.timeZone));
  }
  const openNew = useCallback((day: string) => {
    if (!preferences) return;
    rememberEditorOpener();
    editorGeneration.current += 1;
    setEditor({ generation: editorGeneration.current, event: null, draft: newEventDraft(day), zone: preferences.timeZone, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false }); setEditorError(""); setEditorStale(false); setNotice("");
  }, [preferences, rememberEditorOpener]);
  const openEvent = useCallback((event: CalendarEvent) => {
    if (!preferences) return;
    rememberEditorOpener();
    editorGeneration.current += 1;
    setEditor({ generation: editorGeneration.current, event, draft: buildEventDraft(event), zone: event.kind === "timed" ? event.timeZone : preferences.timeZone, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false }); setEditorError(""); setEditorStale(false); setNotice("");
  }, [preferences, rememberEditorOpener]);
  function changeDraft(field: keyof EventDraft, value: string) {
    if (editorStale) return;
    setEditor((current) => current ? { ...current, draft: { ...current.draft, [field]: value }, errors: {}, review: null, conflicts: [], reviewTimeZone: null, deleting: false } : current);
    setEditorError("");
  }
  async function reviewEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor) return;
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
    if (!editor?.review || !preferences) return;
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
        await createCalendarEvent(editor.review, preferences.timeZone, editor.conflicts);
      }
      if (editorGeneration.current === generation) closeEditor();
      setNotice("Event saved."); setReload((value) => value + 1);
    } catch (reason) {
      if (editorGeneration.current !== generation) return;
      if (reason instanceof CalendarRequestError && reason.status === 409) {
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
          setEditor({ ...editor, conflicts, reviewTimeZone: timeZone });
          setEditorError("An overlapping event changed while you approved this one. Review the updated list and approve again.");
        } catch {
          if (editorGeneration.current === generation) {
            setEditorError("The calendar changed while you approved this event. Reload and review it again.");
            setEditorStale(true);
          }
        }
      } else if (reason instanceof CalendarRequestError && (reason.status === 412 || reason.status === 428)) {
        setEditorError(reason.message);
        setEditorStale(true);
      } else {
        setEditorError(reason instanceof Error ? reason.message : "Could not save the event. Try approving it again.");
      }
    }
    finally { setBusy(false); }
  }
  async function confirmDelete() {
    if (!editor?.event) return;
    const generation = editor.generation;
    setBusy(true); setEditorError("");
    try {
      await deleteCalendarEvent(editor.event);
      if (editorGeneration.current === generation) closeEditor();
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
    event.preventDefault(); if (!settings) return;
    try { new Intl.DateTimeFormat("en", { timeZone: settings.timeZone }); }
    catch { setSettingsError("Enter a valid IANA time zone, such as America/Montreal."); return; }
    setBusy(true); setSettingsError("");
    try { const saved = await saveCalendarPreferences(settings); setPreferences(saved); setSettings(saved); setSettingsError(""); setNotice("Preferences saved."); }
    catch (reason) { setSettingsError(reason instanceof Error ? reason.message : "Could not save preferences. Try saving again."); }
    finally { setBusy(false); }
  }
  async function signOut() {
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
        <h1>Calendar</h1>
        <p>Plan and manage your events.</p>
        <p>Signed in as {userName}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={() => openNew(date)} disabled={!preferences || !date || busy}>New event</button>
        <button type="button" onClick={signOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </header>
    {signOutError && <p className={styles.error} role="alert">{signOutError}</p>}
    <div className={styles.toolbar}>
      <div className={styles.navigation}><button disabled={!date} type="button" onClick={() => navigateTo(navigateDate(date, view, -1))} aria-label="Previous period">←</button><button type="button" disabled={!date} onClick={goToToday}>Today</button><button type="button" disabled={!date} onClick={() => navigateTo(navigateDate(date, view, 1))} aria-label="Next period">→</button></div>
      <h2>{preferences && date ? formatRangeHeading(view, date, preferences.weekStartsOn, locale) : "Calendar"}</h2>
      <div className={styles.viewSwitcher} aria-label="Calendar view">{views.map((item) => <button type="button" key={item} aria-pressed={view === item} onClick={() => changeView(item)}>{item}</button>)}</div>
    </div>
    {preferences && <p className={styles.zone}>Times shown in {preferences.timeZone}</p>}
    <p role="status" className={styles.status}>{loading ? "Loading calendar…" : notice}</p>
    {loadError && <div className={styles.error} role="alert"><p>{loadError}</p><button type="button" onClick={() => { setLoadError(""); if (!preferences) window.location.reload(); else setReload((value) => value + 1); }}>Retry loading calendar</button></div>}
    {preferences && !loading && !loadError && <><div className={styles.calendarSurface}>{view === "month" ? <MonthCalendar events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} /> : view === "agenda" ? <AgendaCalendar events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} /> : <TimeCalendar view={view} events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} />}</div>{events.length === 0 && <p className={styles.empty}>No events in this period. <button type="button" onClick={() => openNew(date)}>Create an event</button></p>}</>}
    {editor && (
      <CalendarEditor
        editor={editor}
        busy={busy}
        error={editorError}
        stale={editorStale}
        onChange={changeDraft}
        onReview={reviewEvent}
        onClose={closeEditor}
        onReloadLatest={discardAndReload}
        onDeleteReview={() => setEditor({ ...editor, deleting: true, review: null })}
        onDeleteCancel={() => setEditor({ ...editor, deleting: false })}
        onDeleteConfirm={confirmDelete}
        onSave={confirmEvent}
      />
    )}
    {settings && (
      <CalendarPreferencesForm settings={settings} busy={busy} error={settingsError} onChange={(value) => { setSettings(value); setSettingsError(""); }} onSave={saveSettings} />
    )}
  </main>;
}
