import assert from "node:assert/strict";
import test from "node:test";
import { CalendarExportSession, runCalendarExport } from "./calendar-export-session.ts";

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("an active export is single-flight and can be retried after completion", () => {
  const session = new CalendarExportSession();
  const first = session.begin();

  assert.ok(first);
  assert.equal(session.begin(), null);
  assert.equal(session.finish(first), true);

  const retry = session.begin();
  assert.ok(retry);
  assert.notEqual(retry, first);
  assert.equal(session.finish(retry), true);
});

test("cancellation aborts the request and suppresses delayed completion after unmount", async () => {
  const session = new CalendarExportSession();
  const attempt = session.begin();
  const pending = deferred();
  let downloads = 0;
  let failures = 0;
  let finishes = 0;

  assert.ok(attempt);
  const task = runCalendarExport(
    session,
    attempt,
    async (signal) => {
      assert.equal(signal, attempt.controller.signal);
      return pending.promise;
    },
    () => { downloads += 1; },
    () => { failures += 1; },
    () => { finishes += 1; },
  );

  session.cancel();
  assert.equal(attempt.controller.signal.aborted, true);
  pending.resolve();
  await task;

  assert.equal(downloads, 0);
  assert.equal(failures, 0);
  assert.equal(finishes, 0);
  assert.equal(session.finish(attempt), false);
});

test("a stale finally cannot finish or clear a newer export", async () => {
  const session = new CalendarExportSession();
  const stale = session.begin();
  const pending = deferred();
  const currentPending = deferred();
  let staleFinishes = 0;
  let currentCompletions = 0;

  assert.ok(stale);
  const staleTask = runCalendarExport(session, stale, () => pending.promise, () => {}, () => {}, () => { staleFinishes += 1; });
  session.cancel();
  const current = session.begin();

  assert.ok(current);
  let currentFinishes = 0;
  const currentTask = runCalendarExport(session, current, () => currentPending.promise, () => { currentCompletions += 1; }, () => {}, () => { currentFinishes += 1; });
  pending.resolve("stale");
  await staleTask;

  assert.equal(session.isCurrent(stale), false);
  assert.equal(session.finish(stale), false);
  assert.equal(staleFinishes, 0);
  assert.equal(session.isCurrent(current), true);
  assert.equal(currentCompletions, 0);
  assert.equal(currentFinishes, 0);

  currentPending.resolve("current");
  await currentTask;

  assert.equal(currentCompletions, 1);
  assert.equal(currentFinishes, 1);
});

test("successful exports finish after completion and can be retried", async () => {
  const session = new CalendarExportSession();
  let completions = 0;
  let failures = 0;
  let finishes = 0;

  const first = session.begin();
  assert.ok(first);
  await runCalendarExport(session, first, async () => "calendar-data", (value) => {
    assert.equal(value, "calendar-data");
    completions += 1;
  }, () => { failures += 1; }, () => { finishes += 1; });

  const retry = session.begin();
  assert.ok(retry);
  await runCalendarExport(session, retry, async () => "retry-data", () => { completions += 1; }, () => {}, () => { finishes += 1; });

  assert.equal(completions, 2);
  assert.equal(failures, 0);
  assert.equal(finishes, 2);
});

test("request errors reach the current attempt and allow retry", async () => {
  const session = new CalendarExportSession();
  const error = new Error("network unavailable");
  let observed;
  let finishes = 0;

  const attempt = session.begin();
  assert.ok(attempt);
  await runCalendarExport(session, attempt, async () => { throw error; }, () => {}, (reason) => { observed = reason; }, () => { finishes += 1; });

  assert.equal(observed, error);
  assert.equal(finishes, 1);
  assert.ok(session.begin());
});
