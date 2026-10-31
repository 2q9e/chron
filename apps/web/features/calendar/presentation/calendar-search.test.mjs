import assert from "node:assert/strict";
import test from "node:test";
import { prepareCalendarEventSearchRequest, searchCalendarEvents } from "./calendar-api.ts";

const baseFields = {
  query: "  Review (Q4)? + follow-up  ",
  from: "2026-02-28",
  through: "2026-03-01",
  timeZone: "America/Montreal",
  kind: "",
};

function prepare(overrides = {}) {
  return prepareCalendarEventSearchRequest({ ...baseFields, ...overrides });
}

test("trims a literal title and converts inclusive Through to exclusive to", () => {
  const result = prepare({ kind: "all-day" });

  assert.deepEqual(result, {
    ok: true,
    request: {
      query: "Review (Q4)? + follow-up",
      from: "2026-02-28",
      to: "2026-03-02",
      timeZone: "America/Montreal",
      kind: "all-day",
    },
  });
});

test("rejects invalid, reversed, and unsupported calendar dates", () => {
  assert.deepEqual(prepare({ from: "2026-02-30" }), {
    ok: false,
    field: "from",
    message: "Enter a valid start date.",
  });
  assert.equal(prepare({ from: "2026-04-01", through: "2026-03-31" }).ok, false);
  assert.equal(prepare({ from: "0000-12-31" }).ok, false);
  assert.equal(prepare({ through: "9999-12-31" }).ok, false);
  assert.equal(prepare({ from: "0001-01-01", through: "0001-01-01" }).ok, true);
});

test("accepts a 93-day inclusive window and rejects a 94-day window", () => {
  assert.equal(prepare({ from: "2026-01-01", through: "2026-04-03" }).ok, true);
  const tooWide = prepare({ from: "2026-01-01", through: "2026-04-04" });
  assert.deepEqual(tooWide, {
    ok: false,
    field: "through",
    message: "Choose a date window of 93 days or fewer.",
  });
});

test("limits title queries by Unicode code point and rejects controls and lone surrogates", () => {
  assert.equal(prepare({ query: "🧭".repeat(120) }).ok, true);
  assert.deepEqual(prepare({ query: "🧭".repeat(121) }), {
    ok: false,
    field: "query",
    message: "Use 120 characters or fewer.",
  });
  assert.equal(prepare({ query: "lesson\u0007notes" }).ok, false);
  assert.equal(prepare({ query: `lesson\uD800notes` }).ok, false);
});

test("supports each event kind and omits an unselected kind", () => {
  assert.equal("kind" in prepare().request, false);
  assert.equal(prepare({ kind: "timed" }).request.kind, "timed");
  assert.equal(prepare({ kind: "all-day" }).request.kind, "all-day");
  assert.equal(prepare({ kind: "other" }).ok, false);
});

test("turns browser network failures into an actionable calendar error", async () => {
  const originalFetch = globalThis.fetch;
  const request = prepare().request;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    await assert.rejects(searchCalendarEvents(request), (error) => {
      assert.equal(error.name, "CalendarRequestError");
      assert.equal(error.code, "NETWORK_ERROR");
      assert.equal(error.status, 0);
      assert.equal(error.message, "Chron couldn't reach the calendar. Check your connection and try again.");
      assert.equal(error.message.includes("Failed to fetch"), false);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("preserves abort errors instead of showing them as network failures", async () => {
  const originalFetch = globalThis.fetch;
  const request = prepare().request;
  const controller = new AbortController();
  const abortError = new DOMException("Aborted", "AbortError");
  controller.abort();
  globalThis.fetch = async () => {
    throw abortError;
  };

  try {
    await assert.rejects(searchCalendarEvents(request, controller.signal), (error) => error === abortError);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
