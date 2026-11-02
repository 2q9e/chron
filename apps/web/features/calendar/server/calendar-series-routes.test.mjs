import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { calendarJson } from "./http.ts";

const createRoute = readFileSync(
  new URL("../../../app/api/calendar/events/series-drafts/route.ts", import.meta.url),
  "utf8",
);
const approveRoute = readFileSync(
  new URL("../../../app/api/calendar/events/series-drafts/[draftId]/approve/route.ts", import.meta.url),
  "utf8",
);

test("series draft creation is authenticated, same-origin, parsed, idempotent, and private", () => {
  assert.match(createRoute, /export async function POST/u);
  assert.doesNotMatch(createRoute, /export async function GET/u);
  assert.match(createRoute, /requireSameOriginMutation\(request/u);
  assert.match(createRoute, /requireCalendarUser\(request\)/u);
  assert.match(createRoute, /parseCalendarIdempotencyKey\(\s*request\.headers\.get\("Idempotency-Key"\)/u);
  assert.match(createRoute, /parseCalendarSeriesDraftRequest\(await readCalendarJson\(request\)\)/u);
  assert.match(createRoute, /repository\.createSeriesDraft\(\s*ownerId,\s*draftRequest,\s*idempotencyKey/u);
  assert.match(createRoute, /draft\.outcome === "pending" && !draft\.replayed \? 201 : 200/u);
  assert.match(createRoute, /calendarJson\(/u);
  assert.match(createRoute, /withCalendarErrors/u);
  assert.equal(calendarJson({ draft: {} }).headers.get("cache-control"), "private, no-store");
});

test("series approval is explicit POST, owner-scoped, UUID-validated, and maps typed outcomes", () => {
  assert.match(approveRoute, /export async function POST/u);
  assert.doesNotMatch(approveRoute, /export async function GET/u);
  assert.match(approveRoute, /requireSameOriginMutation\(request/u);
  assert.match(approveRoute, /requireCalendarUser\(request\)/u);
  assert.match(approveRoute, /validateSeriesDraftId\(rawDraftId\)/u);
  assert.match(approveRoute, /repository\.approveSeriesDraft\(ownerId, draftId\)/u);
  assert.match(approveRoute, /error\.status === 404/u);
  assert.match(approveRoute, /case "stale":\s*return 409/u);
  assert.match(approveRoute, /case "expired":\s*case "deleted":\s*return 410/u);
  assert.match(approveRoute, /calendarJson\(/u);
  assert.match(approveRoute, /withCalendarErrors/u);
});
