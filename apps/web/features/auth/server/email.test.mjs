import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalendarReminderEmail,
  isValidAuthActionURL,
  sendCalendarReminderEmail,
} from "./email.ts";

const origin = "https://chron.example.test";

test("accepts a Better Auth verification link with its token in the query", () => {
  assert.equal(isValidAuthActionURL({
    actionURL: `${origin}/api/auth/verify-email?token=verify-token&callbackURL=%2F`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/verify-email",
    token: "verify-token",
    tokenLocation: "query",
  }), true);
});

test("accepts a Better Auth reset link with its token in the path", () => {
  assert.equal(isValidAuthActionURL({
    actionURL: `${origin}/api/auth/reset-password/reset-token?callbackURL=%2F`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/reset-password",
    token: "reset-token",
    tokenLocation: "path",
  }), true);
});

test("rejects an unexpected origin, route, or token", () => {
  const expected = {
    actionURL: `${origin}/api/auth/reset-password/reset-token`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/reset-password",
    token: "reset-token",
    tokenLocation: "path",
  };

  assert.equal(isValidAuthActionURL({ ...expected, actionURL: "https://attacker.example/reset-token" }), false);
  assert.equal(isValidAuthActionURL({ ...expected, actionURL: `${origin}/reset-token` }), false);
  assert.equal(isValidAuthActionURL({ ...expected, actionURL: `${origin}/api/auth/reset-password/other-token` }), false);
  assert.equal(isValidAuthActionURL({ ...expected, actionURL: `${origin}/api/auth/reset-password/reset-token#fragment` }), false);
});

test("rejects malformed links and tokens in the wrong URL location", () => {
  assert.equal(isValidAuthActionURL({
    actionURL: "not-a-url",
    expectedOrigin: origin,
    expectedPath: "/api/auth/verify-email",
    token: "verify-token",
    tokenLocation: "query",
  }), false);

  assert.equal(isValidAuthActionURL({
    actionURL: `${origin}/api/auth/verify-email?token=other-token`,
    expectedOrigin: origin,
    expectedPath: "/api/auth/verify-email",
    token: "verify-token",
    tokenLocation: "query",
  }), false);
});

test("builds a timed reminder with the event time, zone, and HTTPS calendar link", () => {
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = origin;
  try {
    const message = buildCalendarReminderEmail({
      eventKind: "timed",
      eventStart: "2026-11-10T14:00:00.000Z",
      timeZone: "America/Montreal",
    });

    assert.equal(message.subject, "Your Chron calendar reminder");
    assert.match(message.text, /November 10, 2026/u);
    assert.match(message.text, /9:00 AM/u);
    assert.match(message.text, /America\/Montreal/u);
    assert.match(message.text, /https:\/\/chron\.example\.test\/calendar/u);
    assert.doesNotMatch(message.text, /event title|event details|private location/iu);
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
  }
});

test("builds all-day reminder copy from the calendar date and rejects public HTTP links", () => {
  const previous = process.env.BETTER_AUTH_URL;
  try {
    process.env.BETTER_AUTH_URL = origin;
    const message = buildCalendarReminderEmail({
      eventKind: "all-day",
      eventStart: "2026-11-10",
      timeZone: "America/Montreal",
    });
    assert.match(message.text, /Tuesday, November 10, 2026/u);
    assert.match(message.text, /America\/Montreal/u);

    process.env.BETTER_AUTH_URL = "http://chron.example.test";
    assert.throws(
      () => buildCalendarReminderEmail({
        eventKind: "all-day",
        eventStart: "2026-11-10",
        timeZone: "America/Montreal",
      }),
      /HTTPS/u,
    );
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
  }
});

test("classifies an insecure public calendar origin as a permanent configuration error", async () => {
  const previous = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = "http://chron.example.test";
  try {
    await assert.rejects(
      sendCalendarReminderEmail({
        recipient: "student@example.test",
        eventKind: "timed",
        eventStart: "2026-11-10T14:00:00.000Z",
        timeZone: "America/Montreal",
      }),
      (error) => error.code === "SMTP_CONFIGURATION" && error.retryable === false,
    );
  } finally {
    if (previous === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = previous;
  }
});

test("classifies missing SMTP configuration as permanent without attempting delivery", async () => {
  const previous = new Map(
    ["BETTER_AUTH_URL", "SMTP_HOST", "SMTP_PORT", "SMTP_TLS_MODE", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"]
      .map((key) => [key, process.env[key]]),
  );
  process.env.BETTER_AUTH_URL = origin;
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_TLS_MODE", "SMTP_FROM", "SMTP_USER", "SMTP_PASSWORD"]) {
    delete process.env[key];
  }
  try {
    await assert.rejects(
      sendCalendarReminderEmail({
        recipient: "student@example.test",
        eventKind: "timed",
        eventStart: "2026-11-10T14:00:00.000Z",
        timeZone: "America/Montreal",
      }),
      (error) => error.code === "SMTP_CONFIGURATION" && error.retryable === false,
    );
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
