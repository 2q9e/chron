import type { FormEvent } from "react";
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
  onChange: (settings: CalendarPreferences) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
};

export function CalendarPreferencesForm({ settings, busy, onChange, onSave }: Props) {
  return (
    <details className={styles.settings}>
      <summary>Calendar preferences</summary>
      <form onSubmit={onSave} className={styles.form}>
        <label>
          Theme
          <select value={settings.theme} onChange={(e) => onChange({ ...settings, theme: e.target.value as CalendarPreferences["theme"] })}>
            {calendarThemes.map((theme) => <option value={theme} key={theme}>{themeNames[theme]}</option>)}
          </select>
        </label>
        <label>
          Density
          <select value={settings.density} onChange={(e) => onChange({ ...settings, density: e.target.value as CalendarPreferences["density"] })}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label>
          Week starts on
          <select value={settings.weekStartsOn} onChange={(e) => onChange({ ...settings, weekStartsOn: Number(e.target.value) })}>
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
              <option value={index} key={day}>{day}</option>
            ))}
          </select>
        </label>
        <label>
          Display time zone
          <input value={settings.timeZone} required onChange={(e) => onChange({ ...settings, timeZone: e.target.value })} />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save preferences"}</button>
      </form>
    </details>
  );
}
