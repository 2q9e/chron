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
- A whole-series update or deletion is explicit. An individual exception or
  “this and following” split is not offered until it has its own persisted,
  versioned proposal behavior.

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
the original scheduled local date-time or date. A moved exception must retain
its original key; exception storage is a later task. Expanding a date window
includes any event instance whose half-open interval overlaps that window.

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

At this stage, no recurrence UI or endpoint advertises unfinished behavior.
Occurrence exceptions, split edits, reminders, and Google sync remain separate
work.
