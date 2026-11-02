import assert from "node:assert/strict";
import test from "node:test";
import { ResearchRouteError } from "./errors.ts";
import {
  maximumResearchRequestBytes,
  parseResearchSourceRequest,
  readResearchJSON,
  researchJson,
  requireResearchSameOrigin,
} from "./http.ts";

function postRequest(body, headers = {}) {
  return new Request("https://testing.uwu.markets/api/research/web/read", {
    method: "POST",
    body,
    headers: {
      origin: "https://testing.uwu.markets",
      "content-type": "application/json",
      ...headers,
    },
  });
}

function expectRouteError(operation, status, code) {
  assert.throws(operation, (error) => {
    assert.ok(error instanceof ResearchRouteError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test("research mutations require the canonical HTTPS origin", () => {
  requireResearchSameOrigin(
    postRequest("{}"),
    "https://testing.uwu.markets",
  );
  expectRouteError(
    () => requireResearchSameOrigin(
      new Request("https://testing.uwu.markets/api/research/web/read", {
        method: "POST",
        headers: { origin: "http://testing.uwu.markets" },
      }),
      "https://testing.uwu.markets",
    ),
    403,
    "CROSS_ORIGIN_REQUEST",
  );
  expectRouteError(
    () => requireResearchSameOrigin(
      new Request("https://testing.uwu.markets/api/research/web/read", { method: "POST" }),
      "https://testing.uwu.markets",
    ),
    403,
    "CROSS_ORIGIN_REQUEST",
  );
  expectRouteError(
    () => requireResearchSameOrigin(postRequest("{}"), "http://testing.uwu.markets"),
    503,
    "RESEARCH_CONFIGURATION_UNAVAILABLE",
  );
  assert.doesNotThrow(() => requireResearchSameOrigin(
    new Request("http://localhost:3000/api/research/web/read", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }),
    "http://localhost:3000",
  ));
});

test("research JSON responses are private and cannot be MIME-sniffed", async () => {
  const response = researchJson({ result: true });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(await response.json(), { result: true });
});

test("request body parsing enforces JSON and the byte limit", async () => {
  const body = JSON.stringify({ url: "https://source.example.org" });
  assert.deepEqual(await readResearchJSON(postRequest(body)), { url: "https://source.example.org" });

  await assert.rejects(
    readResearchJSON(postRequest("not-json")),
    (error) => error.code === "INVALID_JSON",
  );
  await assert.rejects(
    readResearchJSON(postRequest("{}", { "content-type": "text/plain" })),
    (error) => error.code === "UNSUPPORTED_MEDIA_TYPE",
  );
  await assert.rejects(
    readResearchJSON(postRequest("{}", { "content-length": String(maximumResearchRequestBytes + 1) })),
    (error) => error.code === "REQUEST_TOO_LARGE",
  );

  const tooLarge = " ".repeat(maximumResearchRequestBytes + 1);
  await assert.rejects(
    readResearchJSON(postRequest(tooLarge)),
    (error) => error.code === "REQUEST_TOO_LARGE",
  );
});

test("source request accepts exactly one string URL", () => {
  assert.equal(parseResearchSourceRequest({ url: "https://source.example.org" }), "https://source.example.org");
  for (const value of [
    null,
    [],
    {},
    { url: "https://source.example.org", extra: true },
    { url: ["https://source.example.org"] },
  ]) {
    expectRouteError(() => parseResearchSourceRequest(value), 400, "INVALID_SOURCE_REQUEST");
  }
});
