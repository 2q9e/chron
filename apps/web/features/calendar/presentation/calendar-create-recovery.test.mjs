import assert from "node:assert/strict";
import test from "node:test";
import {
  forgetPendingCalendarCreate,
  pendingCalendarCreates,
  countCalendarCreateRecoveryOutcomes,
  reconcileCalendarCreateBatch,
  storePendingCalendarCreate,
  summarizeCalendarCreateRecovery,
} from "./calendar-create-recovery.ts";

class MemoryStorage {
  values = new Map();
  unavailable = false;

  get length() {
    if (this.unavailable) throw new Error("Storage is unavailable.");
    return this.values.size;
  }

  key(index) {
    if (this.unavailable) throw new Error("Storage is unavailable.");
    return [...this.values.keys()][index] ?? null;
  }

  setItem(key, value) {
    if (this.unavailable) throw new Error("Storage is unavailable.");
    this.values.set(key, String(value));
  }

  removeItem(key) {
    if (this.unavailable) throw new Error("Storage is unavailable.");
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

test("stores only opaque operation keys and scopes them to the signed-in user", () => {
  assert.equal(storePendingCalendarCreate("user/one", "e4a2f046-6a26-4e11-83fc-e4632cd21948"), true);
  assert.equal(storePendingCalendarCreate("user/one", "a4a2f046-6a26-4e11-83fc-e4632cd21948"), true);
  assert.equal(storePendingCalendarCreate("user/two", "e4a2f046-6a26-4e11-83fc-e4632cd21948"), true);

  assert.deepEqual(pendingCalendarCreates("user/one"), [
    "a4a2f046-6a26-4e11-83fc-e4632cd21948",
    "e4a2f046-6a26-4e11-83fc-e4632cd21948",
  ]);
  assert.deepEqual(pendingCalendarCreates("user/two"), [
    "e4a2f046-6a26-4e11-83fc-e4632cd21948",
  ]);
  assert.equal([...storage.values.values()].every((value) => value === "pending"), true);
  assert.equal([...storage.values.keys()].some((key) => key.includes("Exam")), false);
});

test("clears one pending operation without affecting another owner or key", () => {
  assert.equal(forgetPendingCalendarCreate("user/one", "a4a2f046-6a26-4e11-83fc-e4632cd21948"), true);
  assert.deepEqual(pendingCalendarCreates("user/one"), [
    "e4a2f046-6a26-4e11-83fc-e4632cd21948",
  ]);
  assert.deepEqual(pendingCalendarCreates("user/two"), [
    "e4a2f046-6a26-4e11-83fc-e4632cd21948",
  ]);
});

test("rejects invalid operation keys and reports unavailable browser storage", () => {
  assert.equal(storePendingCalendarCreate("user/one", "contains/private text"), false);
  storage.unavailable = true;
  assert.equal(storePendingCalendarCreate("user/one", "valid-key"), false);
  assert.equal(pendingCalendarCreates("user/one"), null);
  assert.equal(forgetPendingCalendarCreate("user/one", "valid-key"), false);
  storage.unavailable = false;
});

test("reports every result in a mixed recovery batch and reloads saved or deleted events", () => {
  assert.deepEqual(summarizeCalendarCreateRecovery({ saved: 1, missing: 1, deleted: 1 }), {
    message: "1 previously approved event was saved. No event was saved for 1 approved request. Create it again from the calendar. 1 previously approved event was deleted before confirmation.",
    reloadCalendar: true,
  });
});

test("retains a batch after later verification fails and reports all results after retry", async () => {
  const keys = [
    "b2d7f08e-b013-41fa-b154-829644017932",
    "c38ca861-fc55-483c-94fa-830d9483f1f3",
  ];
  for (const key of keys) assert.equal(storePendingCalendarCreate("user/retry", key), true);

  const firstAttempt = await reconcileCalendarCreateBatch(keys, async (key) => {
    if (key === keys[0]) return "saved";
    throw new Error("Verification temporarily failed.");
  });
  assert.deepEqual(firstAttempt.outcomes, ["saved"]);
  assert.match(firstAttempt.error.message, /temporarily failed/u);
  assert.deepEqual(pendingCalendarCreates("user/retry"), keys);

  const retriedKeys = [];
  const retry = await reconcileCalendarCreateBatch(keys, async (key) => {
    retriedKeys.push(key);
    return key === keys[0] ? "saved" : "missing";
  });
  assert.deepEqual(retriedKeys, keys);
  assert.equal(retry.error, null);
  assert.deepEqual(countCalendarCreateRecoveryOutcomes(retry.outcomes), {
    saved: 1,
    missing: 1,
    deleted: 0,
  });
  const summary = summarizeCalendarCreateRecovery(countCalendarCreateRecoveryOutcomes(retry.outcomes));
  assert.match(summary.message, /1 previously approved event was saved/u);
  assert.match(summary.message, /No event was saved for 1 approved request/u);
  for (const key of keys) forgetPendingCalendarCreate("user/retry", key);
  assert.deepEqual(pendingCalendarCreates("user/retry"), []);
});
