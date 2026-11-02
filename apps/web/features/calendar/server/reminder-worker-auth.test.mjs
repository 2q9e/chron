import assert from "node:assert/strict";
import test from "node:test";
import { isAuthorizedReminderWorkerRequest } from "./reminder-worker-auth.ts";

const token = "synthetic-calendar-reminder-worker-token-32";

test("authorizes only a matching bearer token of sufficient length", () => {
  const request = new Request("https://testing.uwu.markets/api/internal/calendar-reminders", {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(isAuthorizedReminderWorkerRequest(request, token), true);
  assert.equal(isAuthorizedReminderWorkerRequest(request, "a-short-token"), false);
  assert.equal(isAuthorizedReminderWorkerRequest(request, `${token}x`), false);
});

test("rejects missing, malformed, and query-string worker credentials", () => {
  assert.equal(isAuthorizedReminderWorkerRequest(new Request("https://testing.uwu.markets/api/internal/calendar-reminders"), token), false);
  assert.equal(isAuthorizedReminderWorkerRequest(new Request("https://testing.uwu.markets/api/internal/calendar-reminders", {
    headers: { Authorization: `Basic ${token}` },
  }), token), false);
  assert.equal(isAuthorizedReminderWorkerRequest(new Request(`https://testing.uwu.markets/api/internal/calendar-reminders?token=${token}`), token), false);
  assert.equal(isAuthorizedReminderWorkerRequest(new Request("https://testing.uwu.markets/api/internal/calendar-reminders", {
    headers: { Authorization: "Bearer synthetic" },
  }), undefined), false);
});
