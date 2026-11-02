import assert from "node:assert/strict";
import test from "node:test";
import { planStudyTime, StudyPlannerError, studyPlannerInputErrors } from "./study-planner.ts";

const weekdays = [1, 2, 3, 4, 5];

function input(overrides = {}) {
  return {
    topic: "Biology",
    totalMinutes: 180,
    sessionMinutes: 60,
    startDate: "2025-01-06",
    deadline: "2025-01-17",
    dayStart: "09:00",
    dayEnd: "12:00",
    timeZone: "America/Toronto",
    weekdays,
    eventBufferMinutes: 0,
    sessionBreakMinutes: 15,
    ...overrides,
  };
}

function timedEvent(startsAt, endsAt) {
  return {
    id: "exam-review",
    kind: "timed",
    title: "Existing event",
    details: null,
    revision: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    reminderChoice: "none",
    startLocal: "2025-01-06T10:00",
    endLocal: "2025-01-06T11:00",
    timeZone: "America/Toronto",
    startsAt,
    endsAt,
  };
}

test("spreads study sessions across the available deadline window", () => {
  const plan = planStudyTime(input(), []);
  assert.equal(plan.plannedMinutes, 180);
  assert.equal(plan.unscheduledMinutes, 0);
  assert.equal(plan.sessions.length, 3);
  assert.equal(new Set(plan.sessions.map(({ date }) => date)).size, 3);
  assert.deepEqual(plan.sessions.map(({ date }) => date), [
    "2025-01-07",
    "2025-01-13",
    "2025-01-16",
  ]);
  assert.ok(plan.sessions.every(({ title }) => title === "Study: Biology"));
});

test("honors persisted timed events and the configured buffer", () => {
  const plan = planStudyTime(input({
    totalMinutes: 90,
    sessionMinutes: 45,
    startDate: "2025-01-06",
    deadline: "2025-01-06",
    weekdays: [1],
    eventBufferMinutes: 15,
    sessionBreakMinutes: 0,
  }), [timedEvent("2025-01-06T15:00:00Z", "2025-01-06T16:00:00Z")]);

  assert.deepEqual(plan.sessions.map(({ startLocal, endLocal }) => [startLocal, endLocal]), [
    ["2025-01-06T09:00", "2025-01-06T09:45"],
    ["2025-01-06T11:15", "2025-01-06T12:00"],
  ]);
});

test("rounds a proposed start up to a quarter hour after a buffered event", () => {
  const plan = planStudyTime(input({
    totalMinutes: 30,
    sessionMinutes: 30,
    startDate: "2025-01-06",
    deadline: "2025-01-06",
    weekdays: [1],
    eventBufferMinutes: 15,
  }), [timedEvent("2025-01-06T14:10:00Z", "2025-01-06T14:20:00Z")]);

  assert.equal(plan.sessions[0].startLocal, "2025-01-06T09:45");
});

test("keeps the selected instant through a repeated local time", () => {
  const plan = planStudyTime(input({
    totalMinutes: 60,
    sessionMinutes: 60,
    startDate: "2025-11-02",
    deadline: "2025-11-02",
    dayStart: "01:00",
    dayEnd: "02:00",
    timeZone: "America/New_York",
    weekdays: [7],
  }), []);

  assert.equal(plan.sessions.length, 1);
  assert.equal(plan.sessions[0].startLocal, "2025-11-02T01:00");
  assert.equal(plan.sessions[0].endLocal, "2025-11-02T01:00");
  assert.equal(plan.sessions[0].startDisambiguation, "earlier");
  assert.equal(plan.sessions[0].endDisambiguation, "later");
  assert.notEqual(plan.sessions[0].startsAt, plan.sessions[0].endsAt);
});

test("reports a study window lost to a daylight-saving gap", () => {
  const plan = planStudyTime(input({
    totalMinutes: 60,
    sessionMinutes: 60,
    startDate: "2025-03-09",
    deadline: "2025-03-09",
    dayStart: "02:00",
    dayEnd: "03:00",
    timeZone: "America/New_York",
    weekdays: [7],
  }), []);

  assert.equal(plan.sessions.length, 0);
  assert.equal(plan.unscheduledMinutes, 60);
  assert.deepEqual(plan.skippedDates, [{ date: "2025-03-09", reason: "clock-change" }]);
});

test("treats all-day events as unavailable throughout their local dates", () => {
  const plan = planStudyTime(input({
    totalMinutes: 60,
    sessionMinutes: 60,
    startDate: "2025-01-06",
    deadline: "2025-01-07",
    weekdays: [1, 2],
  }), [{
    id: "all-day",
    kind: "all-day",
    title: "Unavailable",
    details: null,
    revision: 1,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    reminderChoice: "none",
    reminderTimeZone: null,
    startDate: "2025-01-06",
    endDate: "2025-01-07",
  }]);

  assert.equal(plan.sessions.length, 1);
  assert.equal(plan.sessions[0].date, "2025-01-07");
});

test("rejects invalid planning windows instead of silently guessing", () => {
  assert.throws(
    () => planStudyTime(input({ deadline: "2025-03-07" }), []),
    (error) => error instanceof StudyPlannerError && error.code === "INVALID_PLAN",
  );
  assert.throws(
    () => planStudyTime(input({ dayStart: "02:07" }), []),
    (error) => error instanceof StudyPlannerError && error.code === "INVALID_PLAN",
  );
});

test("returns field-specific errors for invalid planner controls", () => {
  const errors = studyPlannerInputErrors(input({
    topic: " ",
    totalMinutes: 50,
    deadline: "2025-01-05",
    dayStart: "09:07",
    dayEnd: "09:15",
    eventBufferMinutes: 10,
    weekdays: [],
  }));

  assert.deepEqual(Object.keys(errors).sort(), [
    "dayStart",
    "deadline",
    "eventBufferMinutes",
    "topic",
    "totalMinutes",
    "weekdays",
  ]);
  assert.equal(
    studyPlannerInputErrors(input({ dayStart: "09:00", dayEnd: "08:00" })).dayEnd,
    "Choose an end time after the start time.",
  );
});
