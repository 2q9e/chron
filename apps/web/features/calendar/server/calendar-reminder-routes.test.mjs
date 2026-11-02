import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calendarJson } from "./http.ts";

const route = readFileSync(
  new URL("../../../app/api/calendar/events/[eventId]/reminders/route.ts", import.meta.url),
  "utf8",
);

test("reminder status reads require a signed-in owner, validate event IDs, and never cache", () => {
  assert.match(route, /export async function GET/u);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/u);
  assert.match(route, /requireCalendarUser\(request\)/u);
  assert.match(route, /validateCalendarEventId\(rawEventId\)/u);
  assert.match(route, /repository\.getCalendarReminderStatus\(userId, eventId\)/u);
  assert.match(route, /calendarJson\(\{ status \}\)/u);
  assert.match(route, /withCalendarErrors/u);
  assert.doesNotMatch(route, /console\.(?:log|info|debug)/u);

  const response = calendarJson({ status: {} });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
