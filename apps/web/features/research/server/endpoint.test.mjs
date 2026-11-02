import assert from "node:assert/strict";
import test from "node:test";
import { createResearchReadEndpoint } from "./endpoint.ts";

function request(origin = "https://testing.uwu.markets") {
  return new Request("https://testing.uwu.markets/api/research/web/read", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({ url: "https://source.example.org/report" }),
  });
}

function dependencies(overrides = {}) {
  return {
    baseURL: "https://testing.uwu.markets",
    authenticate: async () => "user-1",
    consumeReadLimit: async () => true,
    readSource: async (url) => ({
      requestedUrl: url,
      finalUrl: url,
      title: "Report",
      text: "Retrieved source text",
      contentType: "text/html",
      byteLength: 512,
      redirectCount: 0,
      retrievedAt: "2026-11-02T12:00:00.000Z",
    }),
    ...overrides,
  };
}

async function readError(response) {
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const payload = await response.json();
  return payload.error;
}

test("endpoint rejects a cross-origin source request before authentication or retrieval", async () => {
  let authenticated = false;
  let read = false;
  const endpoint = createResearchReadEndpoint(dependencies({
    authenticate: async () => { authenticated = true; return "user-1"; },
    readSource: async () => { read = true; throw new Error("not reached"); },
  }));
  const response = await endpoint(request("https://attacker.example.org"));
  assert.equal(response.status, 403);
  assert.equal((await readError(response)).code, "CROSS_ORIGIN_REQUEST");
  assert.equal(authenticated, false);
  assert.equal(read, false);
});

test("endpoint requires a signed-in user before spending a retrieval request", async () => {
  let limited = false;
  let read = false;
  const endpoint = createResearchReadEndpoint(dependencies({
    authenticate: async () => null,
    consumeReadLimit: async () => { limited = true; return true; },
    readSource: async () => { read = true; throw new Error("not reached"); },
  }));
  const response = await endpoint(request());
  assert.equal(response.status, 401);
  assert.equal((await readError(response)).code, "AUTHENTICATION_REQUIRED");
  assert.equal(limited, false);
  assert.equal(read, false);
});

test("endpoint reports auth and storage outages without exposing internal errors", async () => {
  const authFailure = createResearchReadEndpoint(dependencies({
    authenticate: async () => { throw new Error("database connection secret"); },
  }));
  const authResponse = await authFailure(request());
  assert.equal(authResponse.status, 503);
  assert.equal((await readError(authResponse)).code, "AUTHENTICATION_UNAVAILABLE");

  const storageFailure = createResearchReadEndpoint(dependencies({
    consumeReadLimit: async () => { throw new Error("private database detail"); },
  }));
  const storageResponse = await storageFailure(request());
  assert.equal(storageResponse.status, 503);
  const storageError = await readError(storageResponse);
  assert.equal(storageError.code, "RESEARCH_STORAGE_UNAVAILABLE");
  assert.doesNotMatch(storageError.message, /database connection secret|private database detail/u);
});

test("endpoint enforces per-user rate limits before external reads", async () => {
  let reads = 0;
  const endpoint = createResearchReadEndpoint(dependencies({
    consumeReadLimit: async () => false,
    readSource: async () => { reads += 1; throw new Error("not reached"); },
  }));
  const response = await endpoint(request());
  assert.equal(response.status, 429);
  assert.equal((await readError(response)).code, "SOURCE_READ_RATE_LIMITED");
  assert.equal(reads, 0);
});

test("endpoint returns the retrieved source privately after same-origin auth and quota checks", async () => {
  const calls = [];
  const endpoint = createResearchReadEndpoint(dependencies({
    authenticate: async (incoming) => {
      calls.push(["auth", incoming.headers.get("origin")]);
      return "user-42";
    },
    consumeReadLimit: async (userId) => {
      calls.push(["limit", userId]);
      return true;
    },
    readSource: async (url) => {
      calls.push(["read", url]);
      return {
        requestedUrl: url,
        finalUrl: "https://source.example.org/final",
        title: "Report",
        text: "Retrieved source text",
        contentType: "text/html",
        byteLength: 512,
        redirectCount: 1,
        retrievedAt: "2026-11-02T12:00:00.000Z",
      };
    },
  }));

  const response = await endpoint(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    ["auth", "https://testing.uwu.markets"],
    ["limit", "user-42"],
    ["read", "https://source.example.org/report"],
  ]);
  assert.deepEqual(await response.json(), {
    source: {
      requestedUrl: "https://source.example.org/report",
      finalUrl: "https://source.example.org/final",
      title: "Report",
      text: "Retrieved source text",
      contentType: "text/html",
      byteLength: 512,
      redirectCount: 1,
      retrievedAt: "2026-11-02T12:00:00.000Z",
    },
  });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
