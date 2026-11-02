import assert from "node:assert/strict";
import test from "node:test";
import { invokeReminderEndpoint } from "./index.js";

const token = "synthetic-calendar-reminder-worker-token-32";

test("calls only the fixed HTTPS endpoint with a bearer secret and no redirects", async () => {
  let request;
  await invokeReminderEndpoint({ CALENDAR_REMINDER_WORKER_TOKEN: token }, async (url, init) => {
    request = { url: String(url), init };
    return new Response(null, { status: 200 });
  });

  assert.equal(request.url, "https://testing.uwu.markets/api/internal/calendar-reminders");
  assert.equal(new URL(request.url).protocol, "https:");
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, `Bearer ${token}`);
  assert.equal(request.init.redirect, "error");
  assert.equal(request.init.cache, "no-store");
});

test("fails closed for missing credentials and unsuccessful app responses", async () => {
  await assert.rejects(invokeReminderEndpoint({}), /credentials/u);
  await assert.rejects(
    invokeReminderEndpoint({ CALENDAR_REMINDER_WORKER_TOKEN: token }, async () => new Response(null, { status: 503 })),
    /request failed/u,
  );
});
