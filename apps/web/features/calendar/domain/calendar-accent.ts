import type { CalendarTheme } from "./types.ts";

export const calendarThemeAccentDefaults: Readonly<Record<CalendarTheme, string>> = {
  "pink-liquid-glass": "#8e365b",
  "minimal-light": "#334b64",
  "premium-dark": "#f1a9c9",
  "soft-pastel": "#624b76",
  "high-contrast": "#78002e",
};

const minimumTextContrast = 4.5;

export function isCalendarAccentColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/u.test(value);
}

export function accessibleCalendarAccent(color: string, theme: CalendarTheme): string {
  if (!isCalendarAccentColor(color)) throw new TypeError("Calendar accent must be a six-digit hex color.");

  const background = theme === "premium-dark" ? "#242126" : "#ffffff";
  const target = theme === "premium-dark" ? "#ffffff" : "#000000";
  const normalized = color.toLowerCase();
  if (contrastRatio(normalized, background) >= minimumTextContrast) return normalized;

  const sourceRgb = toRgb(normalized);
  const targetRgb = toRgb(target);
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const amount = (lower + upper) / 2;
    const candidate = toHex(mix(sourceRgb, targetRgb, amount));
    if (contrastRatio(candidate, background) >= minimumTextContrast) upper = amount;
    else lower = amount;
  }

  let candidate = toHex(mix(sourceRgb, targetRgb, upper));
  while (contrastRatio(candidate, background) < minimumTextContrast && upper < 1) {
    upper = Math.min(1, upper + 1 / 4096);
    candidate = toHex(mix(sourceRgb, targetRgb, upper));
  }
  return candidate;
}

function toRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex([red, green, blue]: readonly [number, number, number]): string {
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function mix(
  source: readonly [number, number, number],
  target: readonly [number, number, number],
  amount: number,
): readonly [number, number, number] {
  return [
    source[0] + (target[0] - source[0]) * amount,
    source[1] + (target[1] - source[1]) * amount,
    source[2] + (target[2] - source[2]) * amount,
  ];
}

function relativeLuminance(hex: string): number {
  const channels = toRgb(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(left: string, right: string): number {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}
