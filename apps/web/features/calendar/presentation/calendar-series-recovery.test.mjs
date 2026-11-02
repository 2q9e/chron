import assert from "node:assert/strict";
import test from "node:test";
import {
  forgetPendingCalendarSeriesApproval,
  pendingCalendarSeriesApprovals,
  reconcileCalendarSeriesApprovalBatch,
  storePendingCalendarSeriesApproval,
} from "./calendar-series-recovery.ts";

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

  getItem(key) {
    if (this.unavailable) throw new Error("Storage is unavailable.");
    return this.values.get(key) ?? null;
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

const firstDraftId = "74953a92-52d7-4bb1-b623-1c5e18371490";
const secondDraftId = "84953a92-52d7-4bb1-b623-1c5e18371490";
const thirdDraftId = "94953a92-52d7-4bb1-b623-1c5e18371490";

test("stores only opaque, user-scoped series draft IDs", () => {
  assert.equal(storePendingCalendarSeriesApproval("user/one", firstDraftId, "create"), true);
  assert.equal(storePendingCalendarSeriesApproval("user/one", secondDraftId, "delete"), true);
  assert.equal(storePendingCalendarSeriesApproval("user/one", thirdDraftId, "cancel-occurrence"), true);
  assert.equal(storePendingCalendarSeriesApproval("user/two", firstDraftId, "update"), true);

  assert.deepEqual(pendingCalendarSeriesApprovals("user/one"), [
    { draftId: firstDraftId, action: "create" },
    { draftId: secondDraftId, action: "delete" },
    { draftId: thirdDraftId, action: "cancel-occurrence" },
  ]);
  assert.deepEqual(pendingCalendarSeriesApprovals("user/two"), [
    { draftId: firstDraftId, action: "update" },
  ]);
  assert.equal([...storage.values.values()].every((value) => ["create", "update", "delete", "cancel-occurrence"].includes(value)), true);
  assert.equal([...storage.values.keys()].some((key) => key.includes("Seminar")), false);
});

test("clears one pending approval without affecting other drafts or users", () => {
  assert.equal(forgetPendingCalendarSeriesApproval("user/one", firstDraftId), true);
  assert.deepEqual(pendingCalendarSeriesApprovals("user/one"), [
    { draftId: secondDraftId, action: "delete" },
    { draftId: thirdDraftId, action: "cancel-occurrence" },
  ]);
  assert.deepEqual(pendingCalendarSeriesApprovals("user/two"), [
    { draftId: firstDraftId, action: "update" },
  ]);
});

test("rejects invalid draft IDs and fails closed when browser storage is unavailable", () => {
  assert.equal(storePendingCalendarSeriesApproval("user/one", "private text", "create"), false);
  assert.equal(pendingCalendarSeriesApprovals(""), null);
  storage.unavailable = true;
  assert.equal(storePendingCalendarSeriesApproval("user/one", firstDraftId, "create"), false);
  assert.equal(pendingCalendarSeriesApprovals("user/one"), null);
  assert.equal(forgetPendingCalendarSeriesApproval("user/one", firstDraftId), false);
  storage.unavailable = false;
});

test("replays the same approval IDs after an uncertain earlier result", async () => {
  const approvals = [
    { draftId: firstDraftId, action: "create" },
    { draftId: secondDraftId, action: "delete" },
    { draftId: thirdDraftId, action: "cancel-occurrence" },
  ];
  const firstAttempt = await reconcileCalendarSeriesApprovalBatch(approvals, async ({ draftId }) => {
    if (draftId === secondDraftId) throw new Error("The response was lost.");
    return "approved";
  });
  assert.deepEqual(firstAttempt.outcomes, ["approved"]);
  assert.match(firstAttempt.error.message, /response was lost/u);

  const replayed = [];
  const retry = await reconcileCalendarSeriesApprovalBatch(approvals, async (approval) => {
    replayed.push(approval);
    return "approved";
  });
  assert.deepEqual(replayed, approvals);
  assert.deepEqual(retry.outcomes, ["approved", "approved", "approved"]);
  assert.equal(retry.error, null);
});
