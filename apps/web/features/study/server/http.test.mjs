import assert from "node:assert/strict";
import test from "node:test";
import { StudyRouteError } from "./errors.ts";
import { requireStudySameOriginMutation, studyJson } from "./http.ts";

function mutation(origin, fetchSite) {
  return new Request("https://testing.uwu.markets/api/study/decks", {
    method: "POST",
    headers: {
      ...(origin ? { origin } : {}),
      ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
    },
  });
}

test("study mutations accept the configured HTTPS origin and reject HTTP or cross-site origins", () => {
  assert.doesNotThrow(() => requireStudySameOriginMutation(
    mutation("https://testing.uwu.markets", "same-origin"),
    "https://testing.uwu.markets",
  ));
  assert.throws(
    () => requireStudySameOriginMutation(mutation("http://testing.uwu.markets", "same-origin"), "https://testing.uwu.markets"),
    (error) => error instanceof StudyRouteError && error.status === 403,
  );
  assert.throws(
    () => requireStudySameOriginMutation(mutation("https://evil.example", "cross-site"), "https://testing.uwu.markets"),
    (error) => error instanceof StudyRouteError && error.status === 403,
  );
  assert.throws(
    () => requireStudySameOriginMutation(mutation("https://testing.uwu.markets"), "http://testing.uwu.markets"),
    (error) => error instanceof StudyRouteError && error.status === 503,
  );
});

test("study responses are private, uncached JSON", async () => {
  const response = studyJson({ ok: true });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { ok: true });
});
