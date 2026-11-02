import assert from "node:assert/strict";
import test from "node:test";
import {
  expandFullCalendarSeries,
  findCalendarSeriesConflicts,
} from "./series-conflicts.ts";

const metadata = {
  title: "Study session",
  details: null,
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function allDayEvent(id, startDate, endDate, recurrenceRule) {
  return {
    ...metadata,
    id,
    kind: "all-day",
    startDate,
    endDate,
    ...(recurrenceRule ? { recurrenceRule } : {}),
  };
}

function timedEvent(id, {
  startLocal,
  endLocal,
  startsAt,
  endsAt,
  timeZone = "America/Montreal",
  recurrenceRule,
}) {
  return {
    ...metadata,
    id,
    kind: "timed",
    startLocal,
    endLocal,
    timeZone,
    startsAt,
    endsAt,
    ...(recurrenceRule ? { recurrenceRule } : {}),
  };
}

test("expands every finite occurrence using stable series keys", () => {
  const rule = { frequency: "weekly", interval: 1, count: 3 };
  const series = allDayEvent("series-a", "2026-11-02", "2026-11-03", rule);

  assert.deepEqual(
    expandFullCalendarSeries(series, rule).map(({ occurrenceKey, startDate }) => [
      occurrenceKey,
      startDate,
    ]),
    [
      ["series-a:2026-11-02", "2026-11-02"],
      ["series-a:2026-11-09", "2026-11-09"],
      ["series-a:2026-11-16", "2026-11-16"],
    ],
  );
});

test("uses half-open all-day overlap and reports the exact occurrence pair", () => {
  const rule = { frequency: "daily", interval: 1, count: 2 };
  const proposal = allDayEvent("series-b", "2026-11-02", "2026-11-03", rule);
  const adjacent = allDayEvent("adjacent", "2026-11-04", "2026-11-05");
  const overlapping = {
    ...allDayEvent("exam", "2026-11-02", "2026-11-03"),
    title: "Exam",
    revision: 4,
  };

  const adjacentResult = findCalendarSeriesConflicts(
    proposal,
    rule,
    [adjacent],
    "America/Montreal",
  );
  assert.deepEqual(adjacentResult.conflicts, []);

  const overlapResult = findCalendarSeriesConflicts(
    proposal,
    rule,
    [overlapping],
    "America/Montreal",
  );
  assert.equal(overlapResult.conflicts.length, 1);
  assert.deepEqual(overlapResult.conflicts[0], {
    candidateOccurrenceKey: "series-b:2026-11-02",
    conflictingEventId: "exam",
    conflictingEventRevision: 4,
    conflictingTitle: "Exam",
    conflictingOccurrence: {
      occurrenceKey: "exam:single",
      kind: "all-day",
      startDate: "2026-11-02",
      endDate: "2026-11-03",
    },
  });
});

test("compares timed occurrences with all-day dates in the configured calendar zone", () => {
  const rule = { frequency: "weekly", interval: 1, count: 2 };
  const proposal = timedEvent("series-c", {
    startLocal: "2026-03-08T00:10",
    endLocal: "2026-03-08T00:40",
    startsAt: "2026-03-08T05:10:00.000Z",
    endsAt: "2026-03-08T05:40:00.000Z",
    timeZone: "America/New_York",
    recurrenceRule: rule,
  });
  const allDay = allDayEvent("holiday", "2026-03-08", "2026-03-09");

  const result = findCalendarSeriesConflicts(
    proposal,
    rule,
    [allDay],
    "America/Montreal",
  );
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].candidateOccurrenceKey, "series-c:2026-03-08T00:10");
  assert.equal(result.conflicts[0].conflictingEventId, "holiday");
});

test("expands existing series and surfaces overlaps within the proposed series", () => {
  const rule = { frequency: "daily", interval: 1, count: 3 };
  const proposal = allDayEvent("series-d", "2026-11-02", "2026-11-04", rule);
  const existingRule = { frequency: "weekly", interval: 1, count: 3 };
  const existingSeries = allDayEvent("series-e", "2026-11-02", "2026-11-03", existingRule);

  const result = findCalendarSeriesConflicts(
    proposal,
    rule,
    [existingSeries],
    "America/Montreal",
  );
  assert.ok(result.conflicts.some((conflict) =>
    conflict.conflictingEventId === "series-e"
      && conflict.conflictingOccurrence.occurrenceKey === "series-e:2026-11-02"
  ));
  assert.ok(result.conflicts.some((conflict) =>
    conflict.conflictingEventId === "series-d"
      && conflict.candidateOccurrenceKey === "series-d:2026-11-02"
      && conflict.conflictingOccurrence.occurrenceKey === "series-d:2026-11-03"
  ));
});

test("fails instead of returning a partial snapshot when the conflict set exceeds its cap", () => {
  const rule = { frequency: "daily", interval: 1, count: 2 };
  const proposal = allDayEvent("series-f", "2026-11-02", "2026-11-03", rule);
  const existing = Array.from({ length: 33 }, (_, index) =>
    allDayEvent(`exam-${index}`, "2026-11-02", "2026-11-03")
  );

  assert.throws(
    () => findCalendarSeriesConflicts(proposal, rule, existing, "America/Montreal"),
    /too many overlaps/u,
  );
});
