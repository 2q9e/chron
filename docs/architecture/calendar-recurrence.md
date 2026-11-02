# Calendar recurrence contract

This document records the first bounded Chron recurrence subset. A recurrence
control stays hidden until persisted series, owner-scoped occurrence reads,
recurrence-aware conflict checking, and exact approval drafts are connected.

## Rule shape

- Frequencies: daily or weekly.
- Weekly rules repeat on the weekday of the first occurrence.
- Interval: one through four days or weeks.
- End condition: required finite occurrence count, from 2 through 366.
- No unbounded rules, `UNTIL`, arbitrary `BY*`, `RDATE`, or imported RRULE text.
- The first through last occurrence must fit within 366 calendar dates,
  including skipped generated gap times.
- A recurring instance may last no longer than seven days.
- A whole-series update or deletion is explicit. Cancelling one occurrence is
  available through its own persisted, versioned proposal and approval. Moving
  one occurrence and splitting “this and following” are not implemented.
  Restoring one cancelled occurrence is available through its own reviewed
  proposal and approval.

## Date and time behavior

All-day events advance `Temporal.PlainDate` by the rule interval and preserve
their exclusive end date and day count. They are never converted through UTC
midnight.

Timed events retain their original local start time and IANA time zone. Their
end duration follows the existing DTSTART/DTEND model: each occurrence keeps
the initial exact elapsed duration. A generated local start in a daylight
saving gap is skipped and does not increment the emitted occurrence count. A
generated ambiguous start uses the selected fold preference from the initial
event; if the initial time was unambiguous, the earlier fold is used. Chron
rejects a nonexistent DTSTART. This fold preference is an explicit Chron
choice for user intent; RFC 5545's default for ambiguous local date-times is
the first occurrence.

The initial DTSTART and each emitted occurrence have stable keys derived from
the original scheduled local date-time or date. A cancellation exception is
stored against that original key, so it cannot cancel a different generated
date after a series edit. A moved exception must retain its original key;
moving occurrences is not implemented. Expanding a date window includes any
event instance whose half-open interval overlaps that window.

## Expansion and write bounds

- At most 366 emitted instances per series.
- At most 366 candidate calendar dates are examined.
- At most 366 calendar dates from the first candidate through the last.
- The caller supplies a bounded date window; only overlapping results leave
  the domain engine.
- Any invalid or exceeded bound returns an explicit error. The engine never
  returns a partial series that could look complete.
- Repository expansion occurs only after owner filtering and under the
  authenticated user's transaction-local RLS context.
- Create/edit review reports the occurrence count and full-series scope.
  Approval rechecks the exact normalized payload, target revision, and
  recurrence-aware conflict snapshot inside the owner-serialized transaction.
- Cancelling one occurrence requires a separate exact-key review and explicit
  approval. The exception is owner-scoped under forced RLS; its insertion,
  reminder cancellation, and staling of competing pending proposals happen in
  the approval transaction. Pending or leased reminders are cancelled; a
  delivery already in progress may still complete. Series edits that would
  move or remove a cancelled occurrence are rejected so the date cannot
  silently reappear.
- Restoration is also a separate exact-key proposal. Its bounded discovery
  read is owner-scoped and date-range limited. The review compares only the
  restored occurrence against active events, including active occurrences in
  its own series. Approval binds the series revision, cancellation identity,
  saved calendar time zone, and conflict snapshot, then removes exactly that
  exception inside the owner transaction. Migration 0010 adds the action to the
  existing proposal constraints without rewriting the deployed migration 0009.
- Restoring an occurrence may queue only a future reminder that has never been
  attempted for that occurrence, across every series revision. A cancelled
  current-revision job can be reactivated only with zero attempts; a missing
  job can be inserted only when no revision has an attempt. Past, sent,
  failed, leased, or attempted jobs are not replayed because a prior delivery
  may have an ambiguous outcome.
- Pending series proposals are cleared by the recurring expiry worker in
  bounded owner transactions. It takes one PostgreSQL advisory lock to prevent
  overlapping runs, scans only account IDs from the auth table, then calls the
  owner-scoped repository cleanup with a finite per-owner row limit. Failed
  owners are counted without logging account IDs or database error details and
  are retried after the round-robin cursor wraps. The cursor intentionally has
  no user foreign key, so deleting its last visited account cannot restart
  processing at the beginning. The worker checks its run budget between owner
  operations; each cleanup transaction also applies lock, statement, and idle
  transaction timeouts. The state table's custom-GUC policy is an application
  guard, not an isolation boundary against another connection using the same
  trusted database role. Run it with
  `npm run calendar:expire-series --workspace @chron/web`; production must
  invoke this command on a recurring host scheduler.

## Standards and scope

The supported fields are a restricted application subset, not a parser for
arbitrary iCalendar data. RFC 5545 governs the chosen RRULE count and
nonexistent generated-time behavior. Chron's explicit repeated-time preference
is a product decision documented above. Sources:

- [RFC 5545, Section 3.3.5: Date-Time](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.5)
- [RFC 5545, Section 3.3.10: Recurrence Rule](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.10)
- [RFC 5545, Section 3.8.5.3: Recurrence Rule](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.8.5.3)

The recurring calendar currently supports create, whole-series update/delete,
single-occurrence cancellation, and single-occurrence restoration. It does not
support moving an occurrence, this-and-following splits, or Google sync.
Reminder delivery remains a separate worker and a delivery cannot be retracted
once it has started.
