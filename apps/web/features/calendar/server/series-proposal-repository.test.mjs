import assert from "node:assert/strict";
import test from "node:test";
import { CalendarRouteError } from "./errors.ts";
import { CalendarRepository } from "./repository.ts";
import { parseCalendarSeriesDraftRequest } from "./validation.ts";

const ownerId = "owner-series";
const seriesId = "10000000-0000-4000-8000-000000000001";
const eventId = "10000000-0000-4000-8000-000000000002";
const conflictingEventId = "10000000-0000-4000-8000-000000000003";
const fixedNow = "2026-11-01T12:00:00.000Z";

function proposal(overrides = {}) {
  return parseCalendarSeriesDraftRequest({
    action: "create",
    scope: "series",
    event: {
      kind: "all-day",
      title: "Study group",
      startDate: "2026-11-02",
      endDate: "2026-11-03",
    },
    recurrenceRule: { frequency: "weekly", interval: 1, count: 3 },
    calendarTimeZone: "America/Montreal",
    ...overrides,
  });
}

function allDayRow({
  id,
  user_id = ownerId,
  title = "Study group",
  start_date = "2026-11-02",
  end_date = "2026-11-03",
  revision = 1,
  recurrence_frequency = "weekly",
  recurrence_interval = 1,
  recurrence_count = 3,
  reminder_choice = "none",
  reminder_time_zone = null,
} = {}) {
  return {
    id,
    user_id,
    kind: "all-day",
    title,
    details: null,
    revision,
    start_local: null,
    end_local: null,
    time_zone: null,
    starts_at: null,
    ends_at: null,
    start_date,
    end_date,
    recurrence_frequency,
    recurrence_interval,
    recurrence_count,
    reminder_choice,
    reminder_time_zone,
    created_at: fixedNow,
    updated_at: fixedNow,
  };
}

function cloneValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cloneDraft(draft) {
  return {
    ...draft,
    payload_hash: draft.payload_hash === null ? null : Buffer.from(draft.payload_hash),
    normalized_payload: cloneValue(draft.normalized_payload),
    conflict_snapshot: cloneValue(draft.conflict_snapshot),
  };
}

class SeriesProposalPool {
  events = new Map();
  drafts = new Map();
  exceptions = new Set();
  movementRecords = new Map();
  reminderJobs = [];
  preferences = new Map([[ownerId, "America/Montreal"]]);

  addEvent(row) {
    this.events.set(row.id, { ...row });
  }

  draftByKey(owner, key) {
    return [...this.drafts.values()].find((draft) =>
      draft.user_id === owner && draft.idempotency_key === key
    );
  }

  projectedDraft(draft) {
    return {
      ...draft,
      payload_hash: draft.payload_hash === null ? null : Buffer.from(draft.payload_hash).toString("hex"),
    };
  }

  async connect() {
    let owner;
    let snapshot;
    return {
      query: async (sql, values = []) => {
        const statement = String(sql).replace(/\s+/gu, " ").trim();
        if (statement === "BEGIN") {
          snapshot = {
            events: new Map([...this.events].map(([id, row]) => [id, { ...row }])),
            drafts: new Map([...this.drafts].map(([id, row]) => [id, cloneDraft(row)])),
            exceptions: new Set(this.exceptions),
            movementRecords: new Map(this.movementRecords),
            reminderJobs: this.reminderJobs.map((job) => ({ ...job })),
          };
          return { rows: [] };
        }
        if (statement === "COMMIT") {
          snapshot = undefined;
          return { rows: [] };
        }
        if (statement === "ROLLBACK") {
          if (snapshot) {
            this.events = snapshot.events;
            this.drafts = snapshot.drafts;
            this.exceptions = snapshot.exceptions;
            this.movementRecords = snapshot.movementRecords;
            this.reminderJobs = snapshot.reminderJobs;
            snapshot = undefined;
          }
          return { rows: [] };
        }
        if (statement.startsWith("SELECT set_config('chron.user_id'")) {
          owner = values[0];
          return { rows: [{ set_config: owner }] };
        }
        if (statement.startsWith("SELECT set_config('lock_timeout'")
          || statement.startsWith("SELECT set_config('statement_timeout'")
          || statement.startsWith("SELECT set_config('idle_in_transaction_session_timeout'")) {
          return { rows: [] };
        }
        if (statement.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (statement === "SELECT clock_timestamp() AS now") {
          return { rows: [{ now: new Date() }] };
        }
        if (statement.startsWith("SELECT time_zone FROM calendar_preferences")) {
          const [queryOwner] = values;
          return {
            rows: queryOwner === owner && this.preferences.has(queryOwner)
              ? [{ time_zone: this.preferences.get(queryOwner) }]
              : [],
          };
        }
        if (statement.startsWith("SELECT id, idempotency_key, action, scope,")) {
          const [queryOwner, selector] = values;
          const draft = statement.includes("idempotency_key = $2")
            ? this.draftByKey(queryOwner, selector)
            : this.drafts.get(selector);
          if (!draft || queryOwner !== owner || draft.user_id !== queryOwner) return { rows: [] };
          return { rows: [this.projectedDraft(draft)] };
        }
        if (statement.startsWith("SELECT id, kind, title, details, revision,")) {
          const [queryOwner, selector] = values;
          if (statement.includes("id = $2::uuid")) {
            const row = this.events.get(selector);
            return {
              rows: row && row.user_id === queryOwner && queryOwner === owner ? [row] : [],
            };
          }
          const excludedId = statement.includes("id <> $2::uuid") ? selector : null;
          return {
            rows: [...this.events.values()].filter((row) =>
              row.user_id === queryOwner && queryOwner === owner && row.id !== excludedId
            ),
          };
        }
        if (statement.startsWith("SELECT event_id, occurrence_key FROM calendar_event_occurrence_exceptions")) {
          const [queryOwner, eventIds] = values;
          return {
            rows: [...this.exceptions]
              .map((key) => key.split("\u0000"))
              .filter(([rowOwner, eventId]) => rowOwner === queryOwner
                && queryOwner === owner && eventIds.includes(eventId))
              .map(([, event_id, occurrence_key]) => ({ event_id, occurrence_key })),
          };
        }
        if (statement.startsWith("SELECT event_id, occurrence_key, to_char(moved_start_local")) {
          const [queryOwner, eventIds] = values;
          return {
            rows: [...this.movementRecords.entries()]
              .filter(([key]) => {
                const [rowOwner, eventId] = key.split("\u0000");
                return rowOwner === queryOwner && queryOwner === owner && eventIds.includes(eventId);
              })
              .map(([, record]) => record),
          };
        }
        if (statement.startsWith("INSERT INTO calendar_event_series_proposal_drafts")) {
          const [id, user_id, idempotency_key, action, scope, target_event_id, target_revision,
            normalizedPayload, payload_hash, conflictSnapshot] = values;
          if (user_id !== owner || this.draftByKey(user_id, idempotency_key)) return { rows: [] };
          const created_at = new Date();
          const draft = {
            id,
            user_id,
            idempotency_key,
            action,
            scope,
            target_event_id,
            target_revision,
            normalized_payload: JSON.parse(normalizedPayload),
            payload_hash: Buffer.from(payload_hash),
            conflict_snapshot: JSON.parse(conflictSnapshot),
            result_event_id: null,
            outcome: "pending",
            created_at,
            updated_at: created_at,
            expires_at: new Date(created_at.valueOf() + 15 * 60_000),
            resolved_at: null,
          };
          this.drafts.set(id, draft);
          return { rows: [this.projectedDraft(draft)] };
        }
        if (statement.startsWith("INSERT INTO calendar_events")) {
          const now = new Date().toISOString();
          if (statement.includes("VALUES ($1, $2, 'timed'")) {
            const [id, user_id, title, details, start_local, end_local, time_zone,
              starts_at, ends_at, recurrence_frequency, recurrence_interval,
              recurrence_count, reminder_choice] = values;
            const row = {
              id, user_id, kind: "timed", title, details, revision: 1,
              start_local, end_local, time_zone, starts_at, ends_at,
              start_date: null, end_date: null,
              recurrence_frequency, recurrence_interval, recurrence_count,
              reminder_choice, reminder_time_zone: null,
              created_at: now, updated_at: now,
            };
            this.events.set(id, row);
            return { rows: [row] };
          }
          const [id, user_id, title, details, start_date, end_date,
            recurrence_frequency, recurrence_interval, recurrence_count,
            reminder_choice, reminder_time_zone] = values;
          const row = {
            id, user_id, kind: "all-day", title, details, revision: 1,
            start_local: null, end_local: null, time_zone: null,
            starts_at: null, ends_at: null, start_date, end_date,
            recurrence_frequency, recurrence_interval, recurrence_count,
            reminder_choice, reminder_time_zone,
            created_at: now, updated_at: now,
          };
          this.events.set(id, row);
          return { rows: [row] };
        }
        if (statement.startsWith("UPDATE calendar_event_series_proposal_drafts")) {
          const [queryOwner, first, second] = values;
          if (statement.includes("SET outcome = 'approved'")) {
            const draft = this.drafts.get(first);
            if (!draft || draft.user_id !== queryOwner || queryOwner !== owner || draft.outcome !== "pending") {
              return { rows: [] };
            }
            if (["delete", "cancel-occurrence", "restore-occurrence", "move-occurrence"].includes(draft.action)) {
              draft.outcome = "approved";
              draft.normalized_payload = null;
              if (draft.action === "delete") draft.payload_hash = null;
              draft.conflict_snapshot = null;
              draft.target_event_id = null;
              draft.target_revision = null;
              draft.result_event_id = null;
              draft.resolved_at = new Date(second);
              draft.updated_at = new Date(second);
            } else {
              const [, , resultEventId, resolvedAt] = values;
              draft.outcome = "approved";
              draft.normalized_payload = null;
              draft.conflict_snapshot = null;
              draft.result_event_id = resultEventId;
              draft.resolved_at = new Date(resolvedAt);
              draft.updated_at = new Date(resolvedAt);
            }
            return { rows: [this.projectedDraft(draft)] };
          }
          if (statement.includes("draft.result_event_id = $2::uuid")) {
            const [, eventToClear] = values;
            for (const draft of this.drafts.values()) {
              if (draft.user_id === queryOwner && draft.result_event_id === eventToClear
                && draft.outcome === "approved" && ["create", "update"].includes(draft.action)) {
                Object.assign(draft, {
                  outcome: "deleted", normalized_payload: null, payload_hash: null,
                  conflict_snapshot: null, target_event_id: null, target_revision: null,
                  result_event_id: null, resolved_at: new Date(), updated_at: new Date(),
                });
              }
            }
            return { rows: [] };
          }
          if (statement.includes("draft.target_event_id = $2::uuid")) {
            const [, targetId, currentDraftId] = values;
            for (const draft of this.drafts.values()) {
              if (draft.user_id === queryOwner && draft.target_event_id === targetId
                && draft.id !== currentDraftId && draft.outcome === "pending") {
                Object.assign(draft, {
                  outcome: "stale", normalized_payload: null, payload_hash: null,
                  conflict_snapshot: null, target_event_id: null, target_revision: null,
                  result_event_id: null, resolved_at: new Date(), updated_at: new Date(),
                });
              }
            }
            return { rows: [] };
          }
        }
        if (statement.startsWith("WITH resolution_clock AS (")
          && statement.includes("draft.result_event_id = $2::uuid")) {
          const [queryOwner, eventId] = values;
          for (const draft of this.drafts.values()) {
            if (draft.user_id === queryOwner && queryOwner === owner
              && draft.result_event_id === eventId && draft.outcome === "approved"
              && ["create", "update"].includes(draft.action)) {
              Object.assign(draft, {
                outcome: "deleted", normalized_payload: null, payload_hash: null,
                conflict_snapshot: null, target_event_id: null, target_revision: null,
                result_event_id: null, resolved_at: new Date(), updated_at: new Date(),
              });
            }
          }
          return { rows: [] };
        }
        if (statement.startsWith("WITH resolution_clock AS (")
          && statement.includes("draft.target_event_id = $2::uuid")) {
          const [queryOwner, targetId, currentDraftId] = values;
          for (const draft of this.drafts.values()) {
            if (draft.user_id === queryOwner && queryOwner === owner
              && draft.target_event_id === targetId && draft.id !== currentDraftId
              && draft.outcome === "pending") {
              Object.assign(draft, {
                outcome: "stale", normalized_payload: null, payload_hash: null,
                conflict_snapshot: null, target_event_id: null, target_revision: null,
                result_event_id: null, resolved_at: new Date(), updated_at: new Date(),
              });
            }
          }
          return { rows: [] };
        }
        if (statement.startsWith("WITH resolution_clock AS (")
          && statement.includes("draft.id = $2::uuid")
          && statement.includes("draft.outcome = 'pending'")) {
          const [, draftId, outcome] = values;
          const draft = this.drafts.get(draftId);
          if (!draft || draft.user_id !== owner || draft.outcome !== "pending") return { rows: [] };
          const now = new Date();
          Object.assign(draft, {
            outcome,
            normalized_payload: null,
            payload_hash: null,
            conflict_snapshot: null,
            target_event_id: null,
            target_revision: null,
            result_event_id: null,
            resolved_at: outcome === "expired" && now < draft.expires_at ? draft.expires_at : now,
            updated_at: outcome === "expired" && now < draft.expires_at ? draft.expires_at : now,
          });
          return { rows: [this.projectedDraft(draft)] };
        }
        if (statement.startsWith("UPDATE calendar_event_reminders")) {
          if (statement.includes("occurrence_key = $3")) {
            const [queryOwner, eventId, occurrenceKey] = values;
            for (const job of this.reminderJobs) {
              if (job.user_id === queryOwner && job.event_id === eventId
                && job.occurrence_key === occurrenceKey
                && ["pending", "leased"].includes(job.status)) {
                Object.assign(job, { status: "cancelled", lease_token: null, lease_expires_at: null });
              }
            }
          } else if (statement.includes("occurrence_key = $4")) {
            const [queryOwner, eventId, revision, occurrenceKey, scheduledAt, timeZone] = values;
            const occurrenceWasAttempted = this.reminderJobs.some((job) =>
              job.user_id === queryOwner && job.event_id === eventId
                && job.occurrence_key === occurrenceKey && job.attempt_count > 0
            );
            for (const job of this.reminderJobs) {
              if (job.user_id === queryOwner && job.event_id === eventId
                && job.event_revision === revision && job.occurrence_key === occurrenceKey
                && job.status === "cancelled" && job.attempt_count === 0
                && !occurrenceWasAttempted) {
                Object.assign(job, {
                  status: new Date(scheduledAt) > new Date() ? "pending" : "cancelled",
                  scheduled_at: scheduledAt,
                  next_attempt_at: scheduledAt,
                  time_zone: timeZone ?? job.time_zone,
                  lease_token: null,
                  lease_expires_at: null,
                  sent_at: null,
                  last_error_code: null,
                });
              }
            }
          }
          return { rows: [] };
        }
        if (statement.startsWith("DELETE FROM calendar_event_occurrence_exceptions")) {
          const [queryOwner, eventId, occurrenceKey] = values;
          const key = `${queryOwner}\u0000${eventId}\u0000${occurrenceKey}`;
          return this.exceptions.delete(key) ? { rows: [{ occurrence_key: occurrenceKey }] } : { rows: [] };
        }
        if (statement.startsWith("UPDATE calendar_event_occurrence_exceptions")) {
          const [queryOwner, eventId, occurrenceKey] = values;
          const key = `${queryOwner}\u0000${eventId}\u0000${occurrenceKey}`;
          if (queryOwner !== owner || !this.exceptions.has(key) || !this.movementRecords.has(key)) {
            return { rows: [] };
          }
          this.exceptions.delete(key);
          return { rows: [{ occurrence_key: occurrenceKey }] };
        }
        if (statement.startsWith("INSERT INTO calendar_event_occurrence_exceptions")) {
          if (statement.includes("moved_start_local") || statement.includes("moved_start_date")) {
            const [queryOwner, eventId, occurrenceKey, ...bounds] = values;
            const key = `${queryOwner}\u0000${eventId}\u0000${occurrenceKey}`;
            if (queryOwner !== owner) return { rows: [] };
            this.exceptions.delete(key);
            this.movementRecords.set(key, statement.includes("$4::timestamp")
              ? {
                  event_id: eventId,
                  occurrence_key: occurrenceKey,
                  moved_start_local: bounds[0],
                  moved_end_local: bounds[1],
                  moved_time_zone: bounds[2],
                  moved_starts_at: bounds[3],
                  moved_ends_at: bounds[4],
                  moved_start_date: null,
                  moved_end_date: null,
                }
              : {
                  event_id: eventId,
                  occurrence_key: occurrenceKey,
                  moved_start_local: null,
                  moved_end_local: null,
                  moved_time_zone: null,
                  moved_starts_at: null,
                  moved_ends_at: null,
                  moved_start_date: bounds[0],
                  moved_end_date: bounds[1],
                });
            return { rows: [{ occurrence_key: occurrenceKey }] };
          }
          const [queryOwner, eventId, occurrenceKey] = values;
          const key = `${queryOwner}\u0000${eventId}\u0000${occurrenceKey}`;
          if (queryOwner !== owner || this.exceptions.has(key)) return { rows: [] };
          this.exceptions.add(key);
          return { rows: [{ occurrence_key: occurrenceKey }] };
        }
        if (statement.startsWith("INSERT INTO calendar_event_reminders")) {
          if (statement.includes("jsonb_to_recordset")) {
            this.reminderJobs.push(...JSON.parse(values[3]));
          } else {
            const [id, user_id, event_id, event_revision, occurrence_key, scheduled_at, time_zone] = values;
            const occurrenceWasAttempted = this.reminderJobs.some((job) =>
              job.user_id === user_id && job.event_id === event_id
                && job.occurrence_key === occurrence_key && job.attempt_count > 0
            );
            if (!occurrenceWasAttempted && !this.reminderJobs.some((job) => job.user_id === user_id
              && job.event_id === event_id && job.event_revision === event_revision
              && job.occurrence_key === occurrence_key)) {
              this.reminderJobs.push({
                id, user_id, event_id, event_revision, occurrence_key, scheduled_at,
                time_zone, next_attempt_at: scheduled_at, status: "pending", attempt_count: 0,
                lease_token: null, lease_expires_at: null, sent_at: null, last_error_code: null,
              });
            }
          }
          return { rows: [] };
        }
        if (statement.startsWith("UPDATE calendar_events") && statement.includes("SET kind = 'all-day'")) {
          const [queryOwner, id, revision, title, details, start_date, end_date,
            recurrence_frequency, recurrence_interval, recurrence_count,
            reminder_choice, reminder_time_zone] = values;
          const row = this.events.get(id);
          if (!row || row.user_id !== queryOwner || queryOwner !== owner || row.revision !== revision) return { rows: [] };
          Object.assign(row, {
            kind: "all-day", title, details, start_local: null, end_local: null,
            time_zone: null, starts_at: null, ends_at: null, start_date, end_date,
            recurrence_frequency, recurrence_interval, recurrence_count,
            reminder_choice, reminder_time_zone,
            revision: row.revision + 1, updated_at: new Date().toISOString(),
          });
          return { rows: [row] };
        }
        if (statement.startsWith("UPDATE calendar_events") && statement.includes("SET kind = 'timed'")) {
          const [queryOwner, id, revision, title, details, start_local, end_local,
            time_zone, starts_at, ends_at, recurrence_frequency,
            recurrence_interval, recurrence_count, reminder_choice] = values;
          const row = this.events.get(id);
          if (!row || row.user_id !== queryOwner || queryOwner !== owner || row.revision !== revision) return { rows: [] };
          Object.assign(row, {
            kind: "timed", title, details, start_local, end_local, time_zone,
            starts_at, ends_at, start_date: null, end_date: null,
            recurrence_frequency, recurrence_interval, recurrence_count,
            reminder_choice, reminder_time_zone: null,
            revision: row.revision + 1, updated_at: new Date().toISOString(),
          });
          return { rows: [row] };
        }
        if (statement.startsWith("DELETE FROM calendar_events")) {
          const [queryOwner, id, revision] = values;
          const row = this.events.get(id);
          if (!row || row.user_id !== queryOwner || queryOwner !== owner || row.revision !== revision) return { rows: [] };
          this.events.delete(id);
          return { rows: [{ id }] };
        }
        if (statement.startsWith("UPDATE calendar_event_create_requests")) return { rows: [] };
        throw new Error(`Unhandled series proposal SQL: ${statement}`);
      },
      release: () => undefined,
    };
  }
}

test("persists a full-series conflict snapshot without writing an event and replays the same key", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  const request = proposal();

  const draft = await repository.createSeriesDraft(ownerId, request, "series-create-1");
  assert.equal(draft.outcome, "pending");
  assert.equal(draft.replayed, false);
  assert.equal(draft.afterOccurrences.length, 3);
  assert.equal(pool.events.size, 0);
  assert.equal(pool.drafts.size, 1);

  const replay = await repository.createSeriesDraft(ownerId, request, "series-create-1");
  assert.equal(replay.id, draft.id);
  assert.equal(replay.replayed, true);
  assert.equal(pool.events.size, 0);

  await assert.rejects(
    repository.createSeriesDraft(ownerId, proposal({
      event: { kind: "all-day", title: "Different plan", startDate: "2026-11-02", endDate: "2026-11-03" },
    }), "series-create-1"),
    (error) => error instanceof CalendarRouteError
      && error.code === "IDEMPOTENCY_KEY_REUSED"
      && error.status === 409,
  );
});

test("approval creates once, binds the exact draft, and returns the saved event on replay", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  const draft = await repository.createSeriesDraft(ownerId, proposal(), "series-create-2");

  const approval = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.equal(approval.outcome, "approved");
  assert.ok(approval.event);
  assert.deepEqual(approval.event.recurrenceRule, { frequency: "weekly", interval: 1, count: 3 });
  assert.equal(pool.events.size, 1);
  const ledger = pool.drafts.get(draft.id);
  assert.equal(ledger.outcome, "approved");
  assert.equal(ledger.normalized_payload, null);
  assert.equal(ledger.conflict_snapshot, null);
  assert.ok(ledger.payload_hash);
  assert.equal(ledger.result_event_id, approval.event.id);

  const replay = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.equal(replay.outcome, "approved");
  assert.equal(replay.event.id, approval.event.id);
  assert.equal(pool.events.size, 1);
});

test("approved recurring reminders are generated per finite occurrence", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  const request = proposal({
    event: {
      kind: "all-day",
      title: "Study group",
      startDate: "2026-11-02",
      endDate: "2026-11-03",
      reminderChoice: "event-day-9am",
      reminderTimeZone: "America/Montreal",
    },
  });
  const draft = await repository.createSeriesDraft(ownerId, request, "series-reminder-1");

  const approval = await repository.approveSeriesDraft(ownerId, draft.id);

  assert.equal(approval.event.reminderChoice, "event-day-9am");
  assert.equal(approval.event.reminderTimeZone, "America/Montreal");
  assert.equal(pool.reminderJobs.length, 3);
  assert.equal(new Set(pool.reminderJobs.map(({ occurrenceKey }) => occurrenceKey)).size, 3);
  assert.deepEqual(
    pool.reminderJobs.map(({ scheduledAt, timeZone }) => [scheduledAt, timeZone]),
    [
      ["2026-11-02T14:00:00Z", "America/Montreal"],
      ["2026-11-09T14:00:00Z", "America/Montreal"],
      ["2026-11-16T14:00:00Z", "America/Montreal"],
    ],
  );
});

test("stales and scrubs a draft when a new event changes its conflict snapshot", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  const draft = await repository.createSeriesDraft(ownerId, proposal(), "series-create-3");
  pool.addEvent(allDayRow({
    id: conflictingEventId,
    title: "Exam",
    start_date: "2026-11-02",
    end_date: "2026-11-03",
    recurrence_frequency: null,
    recurrence_interval: null,
    recurrence_count: null,
  }));

  const approval = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.equal(approval.outcome, "stale");
  assert.equal(pool.events.size, 1);
  const ledger = pool.drafts.get(draft.id);
  assert.equal(ledger.normalized_payload, null);
  assert.equal(ledger.payload_hash, null);
  assert.equal(ledger.conflict_snapshot, null);
  assert.equal(ledger.result_event_id, null);
});

test("updates and deletes an owned series atomically and scrubs prior approved pointers", async () => {
  const pool = new SeriesProposalPool();
  pool.addEvent(allDayRow({ id: seriesId }));
  const repository = new CalendarRepository(pool);
  const updateRequest = proposal({
    action: "update",
    targetEventId: seriesId,
    targetRevision: 1,
    event: { kind: "all-day", title: "Updated study group", startDate: "2026-11-04", endDate: "2026-11-05" },
  });
  const updateDraft = await repository.createSeriesDraft(ownerId, updateRequest, "series-update-1");
  const updated = await repository.approveSeriesDraft(ownerId, updateDraft.id);
  assert.equal(updated.outcome, "approved");
  assert.equal(updated.event.id, seriesId);
  assert.equal(updated.event.revision, 2);
  assert.equal(pool.events.get(seriesId).title, "Updated study group");

  const deleteRequest = parseCalendarSeriesDraftRequest({
    action: "delete",
    scope: "series",
    targetEventId: seriesId,
    targetRevision: 2,
  });
  const deleteDraft = await repository.createSeriesDraft(ownerId, deleteRequest, "series-delete-1");
  const deleted = await repository.approveSeriesDraft(ownerId, deleteDraft.id);
  assert.equal(deleted.outcome, "approved");
  assert.equal(deleted.event, null);
  assert.equal(pool.events.has(seriesId), false);
  assert.equal(pool.drafts.get(updateDraft.id).outcome, "deleted");
  assert.equal(pool.drafts.get(updateDraft.id).payload_hash, null);
  assert.equal(pool.drafts.get(updateDraft.id).result_event_id, null);
});

test("expires proposals at approval time and hides another owner's target", async () => {
  const pool = new SeriesProposalPool();
  pool.addEvent(allDayRow({ id: eventId, user_id: "other-owner" }));
  const repository = new CalendarRepository(pool);
  const request = parseCalendarSeriesDraftRequest({
    action: "delete",
    scope: "series",
    targetEventId: eventId,
    targetRevision: 1,
  });
  await assert.rejects(
    repository.createSeriesDraft(ownerId, request, "series-cross-owner"),
    (error) => error instanceof CalendarRouteError && error.status === 404,
  );

  const draft = await repository.createSeriesDraft(ownerId, proposal(), "series-expired-1");
  pool.drafts.get(draft.id).expires_at = new Date(Date.now() - 1000);
  const approval = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.equal(approval.outcome, "expired");
  assert.equal(pool.events.size, 1);
  assert.equal(pool.drafts.get(draft.id).normalized_payload, null);
  assert.equal(pool.drafts.get(draft.id).payload_hash, null);
});

test("cancels one reviewed occurrence, its reminder, and only once", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  pool.addEvent(allDayRow({ id: seriesId }));
  const occurrenceKey = `${seriesId}:2026-11-09`;
  const request = parseCalendarSeriesDraftRequest({
    action: "cancel-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
  });
  pool.reminderJobs.push({
    user_id: ownerId,
    event_id: seriesId,
    occurrence_key: occurrenceKey,
    status: "leased",
    lease_token: "lease-1",
    lease_expires_at: new Date(Date.now() + 60_000),
  });

  const draft = await repository.createSeriesDraft(ownerId, request, "cancel-occurrence-1");
  assert.equal(draft.scope, "occurrence");
  assert.equal(draft.action, "cancel-occurrence");
  assert.deepEqual(draft.beforeOccurrences.map(({ occurrenceKey: key }) => key), [occurrenceKey]);
  assert.deepEqual(draft.afterOccurrences, []);
  assert.equal(pool.exceptions.size, 0);

  const approval = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.deepEqual(approval, {
    id: draft.id,
    action: "cancel-occurrence",
    outcome: "approved",
    event: null,
  });
  assert.equal(pool.exceptions.has(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`), true);
  assert.equal(pool.reminderJobs[0].status, "cancelled");
  assert.equal(pool.reminderJobs[0].lease_token, null);
  assert.equal(pool.reminderJobs[0].lease_expires_at, null);

  const replay = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.equal(replay.outcome, "approved");
  assert.equal(pool.exceptions.size, 1);
  const draftReplay = await repository.createSeriesDraft(ownerId, request, "cancel-occurrence-1");
  assert.equal(draftReplay.outcome, "approved");
  assert.equal(draftReplay.replayed, true);
  await assert.rejects(
    repository.createSeriesDraft(ownerId, parseCalendarSeriesDraftRequest({
      ...request,
      occurrenceKey: `${seriesId}:2026-11-16`,
    }), "cancel-occurrence-1"),
    (error) => error instanceof CalendarRouteError
      && error.code === "IDEMPOTENCY_KEY_REUSED"
      && error.status === 409,
  );
});

test("occurrence proposals reject keys outside the owned series and already-cancelled keys", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  pool.addEvent(allDayRow({ id: seriesId }));
  await assert.rejects(
    repository.createSeriesDraft(ownerId, parseCalendarSeriesDraftRequest({
      action: "cancel-occurrence",
      scope: "occurrence",
      targetEventId: seriesId,
      targetRevision: 1,
      occurrenceKey: `${seriesId}:2026-11-10`,
    }), "cancel-occurrence-invalid"),
    (error) => error instanceof CalendarRouteError
      && error.code === "OCCURRENCE_NOT_IN_SERIES"
      && error.status === 409,
  );

  const occurrenceKey = `${seriesId}:2026-11-09`;
  pool.exceptions.add(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`);
  await assert.rejects(
    repository.createSeriesDraft(ownerId, parseCalendarSeriesDraftRequest({
      action: "cancel-occurrence",
      scope: "occurrence",
      targetEventId: seriesId,
      targetRevision: 1,
      occurrenceKey,
    }), "cancel-occurrence-replay"),
    (error) => error instanceof CalendarRouteError
      && error.code === "OCCURRENCE_ALREADY_CANCELLED"
      && error.status === 409,
  );
});

test("restores one cancelled occurrence after exact review and re-arms only a future untouched reminder", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  pool.addEvent(allDayRow({
    id: seriesId,
    start_date: "2027-01-04",
    end_date: "2027-01-05",
    recurrence_count: 2,
    reminder_choice: "event-day-9am",
    reminder_time_zone: "America/Montreal",
  }));
  const occurrenceKey = `${seriesId}:2027-01-11`;
  pool.exceptions.add(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`);
  pool.reminderJobs.push({
    user_id: ownerId,
    event_id: seriesId,
    event_revision: 1,
    occurrence_key: occurrenceKey,
    scheduled_at: "2027-01-11T14:00:00.000Z",
    status: "cancelled",
    attempt_count: 0,
    lease_token: null,
    lease_expires_at: null,
    sent_at: null,
    last_error_code: null,
  });
  const request = parseCalendarSeriesDraftRequest({
    action: "restore-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
    calendarTimeZone: "America/Montreal",
  });

  const draft = await repository.createSeriesDraft(ownerId, request, "restore-occurrence-1");
  assert.equal(draft.action, "restore-occurrence");
  assert.deepEqual(draft.beforeOccurrences, []);
  assert.deepEqual(draft.afterOccurrences.map(({ occurrenceKey: key }) => key), [occurrenceKey]);
  assert.equal(pool.exceptions.size, 1);
  assert.equal(pool.reminderJobs[0].status, "cancelled");

  const approval = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.deepEqual(approval, {
    id: draft.id,
    action: "restore-occurrence",
    outcome: "approved",
    event: null,
  });
  assert.equal(pool.exceptions.size, 0);
  assert.equal(pool.reminderJobs[0].status, "pending");
  assert.equal(pool.reminderJobs[0].attempt_count, 0);
  assert.equal((await repository.approveSeriesDraft(ownerId, draft.id)).outcome, "approved");
  const replay = await repository.createSeriesDraft(ownerId, request, "restore-occurrence-1");
  assert.equal(replay.outcome, "approved");
  assert.equal(replay.replayed, true);
  await assert.rejects(
    repository.createSeriesDraft(ownerId, parseCalendarSeriesDraftRequest({
      ...request,
      occurrenceKey: `${seriesId}:2027-01-04`,
    }), "restore-occurrence-1"),
    (error) => error instanceof CalendarRouteError
      && error.code === "IDEMPOTENCY_KEY_REUSED"
      && error.status === 409,
  );
});

test("restoration leaves an attempted reminder cancelled and detects overlaps before approval", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  pool.addEvent(allDayRow({
    id: seriesId,
    start_date: "2027-01-04",
    end_date: "2027-01-05",
    recurrence_count: 2,
    reminder_choice: "event-day-9am",
    reminder_time_zone: "America/Montreal",
  }));
  const occurrenceKey = `${seriesId}:2027-01-11`;
  pool.exceptions.add(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`);
  pool.reminderJobs.push({
    user_id: ownerId,
    event_id: seriesId,
    event_revision: 1,
    occurrence_key: occurrenceKey,
    scheduled_at: "2027-01-11T14:00:00.000Z",
    status: "cancelled",
    attempt_count: 1,
    lease_token: null,
    lease_expires_at: null,
    sent_at: null,
    last_error_code: null,
  });
  const request = parseCalendarSeriesDraftRequest({
    action: "restore-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
    calendarTimeZone: "America/Montreal",
  });
  const draft = await repository.createSeriesDraft(ownerId, request, "restore-occurrence-attempted");
  assert.equal(draft.conflicts.length, 0);

  pool.addEvent(allDayRow({
    id: conflictingEventId,
    title: "Exam",
    start_date: "2027-01-11",
    end_date: "2027-01-12",
    recurrence_frequency: null,
    recurrence_interval: null,
    recurrence_count: null,
  }));
  const approval = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.equal(approval.outcome, "stale");
  assert.equal(pool.exceptions.size, 1);
  assert.equal(pool.reminderJobs[0].status, "cancelled");
  assert.equal(pool.reminderJobs[0].attempt_count, 1);
});

test("restoration does not requeue a reminder attempted before a series revision", async () => {
  const pool = new SeriesProposalPool();
  const repository = new CalendarRepository(pool);
  pool.addEvent(allDayRow({
    id: seriesId,
    start_date: "2027-01-04",
    end_date: "2027-01-05",
    revision: 2,
    recurrence_count: 2,
    reminder_choice: "event-day-9am",
    reminder_time_zone: "America/Montreal",
  }));
  const occurrenceKey = `${seriesId}:2027-01-11`;
  pool.exceptions.add(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`);
  pool.reminderJobs.push(
    {
      user_id: ownerId,
      event_id: seriesId,
      event_revision: 1,
      occurrence_key: occurrenceKey,
      scheduled_at: "2027-01-10T14:00:00.000Z",
      status: "cancelled",
      attempt_count: 1,
      sent_at: "2027-01-10T14:00:01.000Z",
    },
    {
      user_id: ownerId,
      event_id: seriesId,
      event_revision: 2,
      occurrence_key: occurrenceKey,
      scheduled_at: "2027-01-11T14:00:00.000Z",
      status: "cancelled",
      attempt_count: 0,
      sent_at: null,
    },
  );
  const request = parseCalendarSeriesDraftRequest({
    action: "restore-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 2,
    occurrenceKey,
    calendarTimeZone: "America/Montreal",
  });
  const draft = await repository.createSeriesDraft(ownerId, request, "restore-after-revision");

  const approval = await repository.approveSeriesDraft(ownerId, draft.id);

  assert.equal(approval.outcome, "approved");
  assert.equal(pool.exceptions.size, 0);
  assert.equal(pool.reminderJobs.length, 2);
  assert.equal(pool.reminderJobs[0].status, "cancelled");
  assert.equal(pool.reminderJobs[1].status, "cancelled");
  assert.equal(pool.reminderJobs[1].attempt_count, 0);
});

test("a reviewed single-occurrence move preserves identity and reports an overlap before approval", async () => {
  const pool = new SeriesProposalPool();
  pool.addEvent(allDayRow({ id: seriesId }));
  pool.addEvent(allDayRow({
    id: conflictingEventId,
    title: "Exam",
    start_date: "2026-11-11",
    end_date: "2026-11-12",
    recurrence_frequency: null,
    recurrence_interval: null,
    recurrence_count: null,
  }));
  const repository = new CalendarRepository(pool);
  const occurrenceKey = `${seriesId}:2026-11-09`;
  const request = parseCalendarSeriesDraftRequest({
    action: "move-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
    calendarTimeZone: "America/Montreal",
    movement: { kind: "all-day", startDate: "2026-11-11", endDate: "2026-11-12" },
  });

  const draft = await repository.createSeriesDraft(ownerId, request, "move-occurrence-1");
  assert.equal(draft.action, "move-occurrence");
  assert.deepEqual(draft.beforeOccurrences.map(({ occurrenceKey: key }) => key), [occurrenceKey]);
  assert.deepEqual(draft.afterOccurrences.map(({ occurrenceKey: key }) => key), [occurrenceKey]);
  assert.equal(draft.beforeOccurrences[0].startDate, "2026-11-09");
  assert.equal(draft.afterOccurrences[0].startDate, "2026-11-11");
  assert.equal(draft.conflicts.length, 1);
  assert.equal(draft.conflicts[0].conflictingEventId, conflictingEventId);
  assert.equal(pool.movementRecords.size, 0);

  const approval = await repository.approveSeriesDraft(ownerId, draft.id);
  assert.deepEqual(approval, {
    id: draft.id,
    action: "move-occurrence",
    outcome: "approved",
    event: null,
  });
  const [saved] = pool.movementRecords.values();
  assert.equal(saved.moved_start_date, "2026-11-11");
  assert.equal(saved.occurrence_key, occurrenceKey);
  assert.equal(pool.events.get(seriesId).start_date, "2026-11-02");
  const replay = await repository.createSeriesDraft(ownerId, request, "move-occurrence-1");
  assert.equal(replay.outcome, "approved");
  assert.equal(replay.replayed, true);
});

test("cancelling and restoring a moved occurrence retains its approved schedule", async () => {
  const pool = new SeriesProposalPool();
  pool.addEvent(allDayRow({ id: seriesId }));
  const repository = new CalendarRepository(pool);
  const occurrenceKey = `${seriesId}:2026-11-09`;
  const moveRequest = parseCalendarSeriesDraftRequest({
    action: "move-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
    calendarTimeZone: "America/Montreal",
    movement: { kind: "all-day", startDate: "2026-11-11", endDate: "2026-11-12" },
  });
  const moveDraft = await repository.createSeriesDraft(ownerId, moveRequest, "move-restore-1");
  await repository.approveSeriesDraft(ownerId, moveDraft.id);

  const cancelRequest = parseCalendarSeriesDraftRequest({
    action: "cancel-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
  });
  const cancelDraft = await repository.createSeriesDraft(ownerId, cancelRequest, "move-cancel-1");
  await repository.approveSeriesDraft(ownerId, cancelDraft.id);
  assert.equal(pool.exceptions.has(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`), true);

  const restoreRequest = parseCalendarSeriesDraftRequest({
    action: "restore-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
    calendarTimeZone: "America/Montreal",
  });
  const restoreDraft = await repository.createSeriesDraft(ownerId, restoreRequest, "move-restore-2");
  assert.equal(restoreDraft.afterOccurrences[0].startDate, "2026-11-11");
  await repository.approveSeriesDraft(ownerId, restoreDraft.id);
  assert.equal(pool.exceptions.has(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`), false);
  assert.equal(pool.movementRecords.get(`${ownerId}\u0000${seriesId}\u0000${occurrenceKey}`).moved_start_date, "2026-11-11");
});

test("a future unattempted occurrence reminder follows an approved move", async () => {
  const pool = new SeriesProposalPool();
  pool.addEvent(allDayRow({
    id: seriesId,
    reminder_choice: "event-day-9am",
    reminder_time_zone: "America/Montreal",
  }));
  const occurrenceKey = `${seriesId}:2026-11-09`;
  pool.reminderJobs.push({
    user_id: ownerId,
    event_id: seriesId,
    event_revision: 1,
    occurrence_key: occurrenceKey,
    scheduled_at: "2026-11-09T14:00:00.000Z",
    next_attempt_at: "2026-11-09T14:00:00.000Z",
    time_zone: "America/Montreal",
    status: "pending",
    attempt_count: 0,
    lease_token: null,
    lease_expires_at: null,
    sent_at: null,
    last_error_code: null,
  });
  const repository = new CalendarRepository(pool);
  const request = parseCalendarSeriesDraftRequest({
    action: "move-occurrence",
    scope: "occurrence",
    targetEventId: seriesId,
    targetRevision: 1,
    occurrenceKey,
    calendarTimeZone: "America/Montreal",
    movement: { kind: "all-day", startDate: "2026-11-11", endDate: "2026-11-12" },
  });
  const draft = await repository.createSeriesDraft(ownerId, request, "move-reminder-1");
  await repository.approveSeriesDraft(ownerId, draft.id);
  assert.equal(pool.reminderJobs.length, 1);
  assert.equal(pool.reminderJobs[0].status, "pending");
  assert.equal(pool.reminderJobs[0].scheduled_at, "2026-11-11T14:00:00Z");
  assert.equal(pool.reminderJobs[0].time_zone, "America/Montreal");
});

test("series updates cannot move or remove an already-cancelled scheduled date", async () => {
  const pool = new SeriesProposalPool();
  pool.addEvent(allDayRow({ id: seriesId }));
  const repository = new CalendarRepository(pool);
  const cancelledKey = `${seriesId}:2026-11-09`;
  pool.exceptions.add(`${ownerId}\u0000${seriesId}\u0000${cancelledKey}`);

  const movedRequest = proposal({
    action: "update",
    targetEventId: seriesId,
    targetRevision: 1,
    event: {
      kind: "all-day",
      title: "Study group",
      startDate: "2026-11-04",
      endDate: "2026-11-05",
    },
  });

  await assert.rejects(
    repository.createSeriesDraft(ownerId, movedRequest, "move-cancelled-series-date"),
    (error) => error instanceof CalendarRouteError
      && error.code === "SERIES_CANCELLATION_NOT_PRESERVED"
      && error.status === 409,
  );
  assert.equal(pool.drafts.size, 0);
  assert.equal(pool.events.get(seriesId).start_date, "2026-11-02");
  assert.equal(pool.exceptions.has(`${ownerId}\u0000${seriesId}\u0000${cancelledKey}`), true);
});
