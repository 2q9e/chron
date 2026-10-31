"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { calendarThemes, type CalendarEvent, type CalendarEventMutation, type CalendarPreferences } from "../domain/types";
import { createCalendarEvent, deleteCalendarEvent, fetchCalendarEvents, fetchCalendarPreferences, saveCalendarPreferences, updateCalendarEvent } from "./calendar-api";
import { buildEventDraft, defaultPreferences, formatRangeHeading, localeWeekStart, localTimeZone, localToday, navigateDate, newEventDraft, validateEventDraft, visibleRange, type CalendarView, type EventDraft, type EventDraftField } from "./calendar-model";
import { AgendaCalendar, MonthCalendar, TimeCalendar } from "./calendar-views";
import styles from "./calendar.module.css";

type Editor = { event: CalendarEvent | null; draft: EventDraft; zone: string; errors: Partial<Record<EventDraftField, string>>; review: CalendarEventMutation | null; deleting: boolean };
const views: CalendarView[] = ["day", "week", "month", "agenda"];
const themeNames: Record<(typeof calendarThemes)[number], string> = { "pink-liquid-glass": "Pink", "minimal-light": "Light", "premium-dark": "Dark", "soft-pastel": "Pastel", "high-contrast": "High contrast" };

export function CalendarWorkspace() {
  const [locale] = useState(() => typeof navigator === "undefined" ? "en" : navigator.language);
  const [date, setDate] = useState(localToday);
  const [view, setView] = useState<CalendarView>("month");
  const [preferences, setPreferences] = useState<CalendarPreferences | null>(null);
  const [settings, setSettings] = useState<CalendarPreferences | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchCalendarPreferences(controller.signal).then((saved) => {
      const value = saved ?? defaultPreferences(localTimeZone(), localeWeekStart(navigator.language));
      setPreferences(value); setSettings(value);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) { setLoading(false); setError(reason instanceof Error ? reason.message : "Could not load calendar preferences."); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!preferences) return;
    const controller = new AbortController();
    const range = visibleRange(view, date, preferences.weekStartsOn);
    Promise.resolve().then(() => { if (!controller.signal.aborted) { setLoading(true); setError(""); } });
    fetchCalendarEvents(range.from, range.to, preferences.timeZone, controller.signal).then((items) => { setEvents(items); setLoading(false); }).catch((reason: unknown) => { if (!controller.signal.aborted) { setLoading(false); setError(reason instanceof Error ? reason.message : "Could not load events."); } });
    return () => controller.abort();
  }, [date, view, preferences, reload]);



  const openNew = useCallback((day: string) => {
    if (!preferences) return;
    setEditor({ event: null, draft: newEventDraft(day), zone: preferences.timeZone, errors: {}, review: null, deleting: false }); setNotice("");
  }, [preferences]);
  const openEvent = useCallback((event: CalendarEvent) => {
    if (!preferences) return;
    setEditor({ event, draft: buildEventDraft(event), zone: event.kind === "timed" ? event.timeZone : preferences.timeZone, errors: {}, review: null, deleting: false }); setNotice("");
  }, [preferences]);
  function changeDraft(field: keyof EventDraft, value: string) {
    setEditor((current) => current ? { ...current, draft: { ...current.draft, [field]: value }, errors: {}, review: null, deleting: false } : current);
  }
  function reviewEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editor) return;
    const result = validateEventDraft(editor.draft, editor.zone);
    if (!result.ok) { setEditor({ ...editor, errors: result.errors }); return; }
    setEditor({ ...editor, errors: {}, review: result.mutation, deleting: false });
  }
  async function confirmEvent() {
    if (!editor?.review) return;
    setBusy(true); setError("");
    try {
      if (editor.event) await updateCalendarEvent(editor.event, editor.review); else await createCalendarEvent(editor.review);
      setEditor(null); setNotice("Event saved."); setReload((value) => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the event."); }
    finally { setBusy(false); }
  }
  async function confirmDelete() {
    if (!editor?.event) return;
    setBusy(true); setError("");
    try { await deleteCalendarEvent(editor.event); setEditor(null); setNotice("Event deleted."); setReload((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete the event."); }
    finally { setBusy(false); }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings) return;
    try { new Intl.DateTimeFormat("en", { timeZone: settings.timeZone }); }
    catch { setError("Enter a valid IANA time zone, such as America/Montreal."); return; }
    setBusy(true); setError("");
    try { const saved = await saveCalendarPreferences(settings); setPreferences(saved); setSettings(saved); setNotice("Preferences saved."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save preferences."); }
    finally { setBusy(false); }
  }
  const conflict = error && editor && /changed|version|conflict/i.test(error);
  return <main className={styles.workspace} data-theme={preferences?.theme} data-density={preferences?.density}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Chron / Calendar</p><h1>Calendar</h1><p>Make space for what matters.</p></div><button type="button" onClick={() => openNew(date)} disabled={!preferences}>New event</button></header>
    <div className={styles.toolbar}>
      <div className={styles.navigation}><button type="button" onClick={() => setDate(navigateDate(date, view, -1))} aria-label="Previous period">←</button><button type="button" onClick={() => setDate(localToday())}>Today</button><button type="button" onClick={() => setDate(navigateDate(date, view, 1))} aria-label="Next period">→</button></div>
      <h2>{preferences ? formatRangeHeading(view, date, preferences.weekStartsOn, locale) : "Calendar"}</h2>
      <div className={styles.viewSwitcher} aria-label="Calendar view">{views.map((item) => <button type="button" key={item} aria-pressed={view === item} onClick={() => setView(item)}>{item}</button>)}</div>
    </div>
    {preferences && <p className={styles.zone}>Times shown in {preferences.timeZone}</p>}
    <p role="status" className={styles.status}>{notice || (loading ? "Loading calendar…" : "")}</p>
    {error && <div className={styles.error} role="alert"><p>{error}</p>{conflict ? <button type="button" onClick={() => { setEditor(null); setError(""); setReload((value) => value + 1); }}>Reload calendar</button> : <button type="button" onClick={() => { setError(""); if (!preferences) window.location.reload(); else setReload((value) => value + 1); }}>Retry loading</button>}</div>}
    {preferences && !loading && !error && <><div className={styles.calendarSurface}>{view === "month" ? <MonthCalendar events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} /> : view === "agenda" ? <AgendaCalendar events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} /> : <TimeCalendar view={view} events={events} selectedDate={date} weekStartsOn={preferences.weekStartsOn} timeZone={preferences.timeZone} locale={locale} onCreate={openNew} onSelectEvent={openEvent} />}</div>{events.length === 0 && <p className={styles.empty}>No events in this period. <button type="button" onClick={() => openNew(date)}>Create an event</button></p>}</>}
    {editor && <section className={styles.panel} aria-labelledby="editor-heading"><div className={styles.panelHeading}><h2 id="editor-heading">{editor.event ? "Edit event" : "New event"}</h2><button type="button" onClick={() => setEditor(null)} disabled={busy}>Close</button></div>
      <form onSubmit={reviewEvent} className={styles.form}>
        <label>Title<input autoFocus required maxLength={200} value={editor.draft.title} onChange={(e) => changeDraft("title", e.target.value)} aria-invalid={!!editor.errors.title} aria-describedby={editor.errors.title ? "title-error" : undefined} /></label>{editor.errors.title && <p id="title-error" className={styles.fieldError}>{editor.errors.title}</p>}
        <label>Details<textarea maxLength={5000} value={editor.draft.details} onChange={(e) => changeDraft("details", e.target.value)} /></label>
        <label>Event type<select value={editor.draft.kind} onChange={(e) => changeDraft("kind", e.target.value)}><option value="timed">Timed</option><option value="all-day">All day</option></select></label>
        {editor.draft.kind === "timed" ? <><p>Event time zone: {editor.zone}</p>{(["startLocal", "endLocal"] as const).map((field) => <div key={field}><label>{field === "startLocal" ? "Start" : "End"}<input type="datetime-local" required value={editor.draft[field]} onChange={(e) => changeDraft(field, e.target.value)} aria-invalid={!!editor.errors[field]} aria-describedby={editor.errors[field] ? `${field}-error` : undefined} /></label>{editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}{editor.errors[field === "startLocal" ? "startDisambiguation" : "endDisambiguation"] && <label>This time occurs twice. Choose an occurrence<select required value={editor.draft[field === "startLocal" ? "startDisambiguation" : "endDisambiguation"]} onChange={(e) => changeDraft(field === "startLocal" ? "startDisambiguation" : "endDisambiguation", e.target.value)}><option value="">Choose</option><option value="earlier">Earlier</option><option value="later">Later</option></select></label>}</div>)}</> : <>{(["startDate", "endDate"] as const).map((field) => <div key={field}><label>{field === "startDate" ? "First day" : "End date (exclusive)"}<input type="date" required value={editor.draft[field]} onChange={(e) => changeDraft(field, e.target.value)} aria-invalid={!!editor.errors[field]} aria-describedby={editor.errors[field] ? `${field}-error` : undefined} /></label>{editor.errors[field] && <p id={`${field}-error`} className={styles.fieldError}>{editor.errors[field]}</p>}</div>)}<p>The end date is the first day outside the event.</p></>}
        <div className={styles.actions}><button type="submit" disabled={busy}>Review changes</button>{editor.event && <button type="button" disabled={busy} onClick={() => setEditor({ ...editor, deleting: true, review: null })}>Delete event</button>}</div>
      </form>
      {editor.review && <div className={styles.review}><h3>Review event</h3><p><strong>{editor.review.title}</strong></p><p>{editor.review.kind === "timed" ? `${editor.review.startLocal} to ${editor.review.endLocal} · ${editor.review.timeZone}` : `${editor.review.startDate} through the day before ${editor.review.endDate} · All day`}</p>{editor.review.details && <p className={styles.details}>{editor.review.details}</p>}<button type="button" disabled={busy} onClick={confirmEvent}>{busy ? "Saving…" : "Approve and save"}</button></div>}
      {editor.deleting && <div className={styles.review}><h3>Delete this event?</h3><p>{editor.event?.title}</p><button type="button" disabled={busy} onClick={confirmDelete}>{busy ? "Deleting…" : "Confirm deletion"}</button><button type="button" disabled={busy} onClick={() => setEditor({ ...editor, deleting: false })}>Keep event</button></div>}
    </section>}
    {settings && <details className={styles.settings}><summary>Calendar preferences</summary><form onSubmit={saveSettings} className={styles.form}><label>Theme<select value={settings.theme} onChange={(e) => setSettings({ ...settings, theme: e.target.value as CalendarPreferences["theme"] })}>{calendarThemes.map((theme) => <option value={theme} key={theme}>{themeNames[theme]}</option>)}</select></label><label>Density<select value={settings.density} onChange={(e) => setSettings({ ...settings, density: e.target.value as CalendarPreferences["density"] })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label><label>Week starts on<select value={settings.weekStartsOn} onChange={(e) => setSettings({ ...settings, weekStartsOn: Number(e.target.value) })}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label>Display time zone<input value={settings.timeZone} required onChange={(e) => setSettings({ ...settings, timeZone: e.target.value })} /></label><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button></form></details>}
  </main>;
}
