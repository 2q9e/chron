import assert from "node:assert/strict";
import test from "node:test";
import {
  accessibleCalendarAccent,
  calendarThemeAccentDefaults,
  isCalendarAccentColor,
} from "./calendar-accent.ts";

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(left, right) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("accepts only complete six-digit hexadecimal colors", () => {
  assert.equal(isCalendarAccentColor("#f8a1b4"), true);
  assert.equal(isCalendarAccentColor("#F8A1B4"), true);
  assert.equal(isCalendarAccentColor("#fff"), false);
  assert.equal(isCalendarAccentColor("red"), false);
  assert.equal(isCalendarAccentColor("#ffffff; color: red"), false);
  assert.equal(isCalendarAccentColor(null), false);
});

test("keeps the current theme accent when it already has sufficient contrast", () => {
  for (const [theme, accent] of Object.entries(calendarThemeAccentDefaults)) {
    assert.equal(accessibleCalendarAccent(accent, theme), accent);
  }
});

test("darkens a low-contrast light-theme accent without changing its hue family", () => {
  const adjusted = accessibleCalendarAccent("#ff99bb", "minimal-light");

  assert.notEqual(adjusted, "#ff99bb");
  assert.ok(contrastRatio(adjusted, "#ffffff") >= 4.5);
  assert.match(adjusted, /^#[0-9a-f]{6}$/u);
});

test("lightens a low-contrast dark-theme accent against the theme surface", () => {
  const adjusted = accessibleCalendarAccent("#40303a", "premium-dark");

  assert.notEqual(adjusted, "#40303a");
  assert.ok(contrastRatio(adjusted, "#242126") >= 4.5);
  assert.match(adjusted, /^#[0-9a-f]{6}$/u);
});

test("rejects malformed colors before generating a CSS value", () => {
  assert.throws(() => accessibleCalendarAccent("#fff", "minimal-light"), TypeError);
});
