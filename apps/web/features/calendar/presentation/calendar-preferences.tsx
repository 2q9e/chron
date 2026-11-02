import type { FormEvent } from "react";
import { calendarThemeAccentDefaults } from "../domain/calendar-accent";
import { calendarThemes, type CalendarPreferences } from "../domain/types";
import styles from "./calendar.module.css";

const themeNames: Record<(typeof calendarThemes)[number], string> = {
  "pink-liquid-glass": "Pink Liquid Glass",
  "minimal-light": "Minimal Light",
  "premium-dark": "Premium Dark",
  "soft-pastel": "Soft Pastel",
  "high-contrast": "High contrast",
};

type Props = {
  settings: CalendarPreferences;
  busy: boolean;
  error: string;
  onChange: (settings: CalendarPreferences) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

export function CalendarPreferencesForm({ settings, busy, error, onChange, onSave }: Props) {
  return (
    <details className={styles.settings}>
      <summary>Calendar preferences</summary>
      <form onSubmit={onSave} className={styles.form}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <label>
          Theme
          <select disabled={busy} value={settings.theme} onChange={(e) => onChange({ ...settings, theme: e.target.value as CalendarPreferences["theme"] })}>
            {calendarThemes.map((theme) => <option value={theme} key={theme}>{themeNames[theme]}</option>)}
          </select>
        </label>
        <div className={styles.accentPreference}>
          <label htmlFor="calendar-accent-color">Accent color</label>
          <div className={styles.accentControl}>
            <input
              id="calendar-accent-color"
              type="color"
              value={settings.accentColor ?? calendarThemeAccentDefaults[settings.theme]}
              aria-describedby="calendar-accent-color-help"
              disabled={busy}
              onChange={(event) => onChange({ ...settings, accentColor: event.target.value })}
            />
            <button
              type="button"
              disabled={busy || settings.accentColor === null}
              onClick={() => onChange({ ...settings, accentColor: null })}
            >Use theme default</button>
          </div>
          <p id="calendar-accent-color-help">
            The calendar previews this color now. Save preferences to keep it. Low-contrast accents are adjusted for readability.
          </p>
        </div>
        <label>
          Density
          <select disabled={busy} value={settings.density} onChange={(e) => onChange({ ...settings, density: e.target.value as CalendarPreferences["density"] })}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label>
          Week starts on
          <select disabled={busy} value={settings.weekStartsOn} onChange={(e) => onChange({ ...settings, weekStartsOn: Number(e.target.value) })}>
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
              <option value={index} key={day}>{day}</option>
            ))}
          </select>
        </label>
        <label>
          Display time zone
          <input disabled={busy} value={settings.timeZone} required onChange={(e) => onChange({ ...settings, timeZone: e.target.value })} />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button>
      </form>
    </details>
  );
}
