# Calendar reminder contract

## User behavior

- Reminders are opt-in; every new event starts with no reminder.
- Timed events support at start, 5, 10, 15, 30, or 60 minutes before, and one
  local calendar day before at the same wall-clock time. The event's IANA zone
  governs these reminders.
- All-day events support 9:00 AM on the first day or 9:00 AM on the previous
  day. The calendar IANA zone is saved with the reminder so later preference
  changes do not move it.
- A recurring series applies its reminder rule to each bounded occurrence.
  The reminder is scheduled only after the user approves the event or series.
- A reminder may be sent only to the account's verified email address. Email
  content contains the event time and zone but not the event title or details.

## Delivery contract

- Persist event choice and reminder outbox entries in the same owner-scoped
  PostgreSQL transaction as the event mutation.
- Unsent reminders are cancelled or replaced when an event is changed or
  deleted. A delivery already in flight may still reach the recipient; SMTP
  does not provide a general exactly-once guarantee.
- A worker leases bounded batches, sends outside the database transaction,
  records provider acceptance, and retries transient failures with a finite
  attempt count. Exhausted attempts become visible as failed delivery records;
  they are never reported as delivered.
- Reuse Chron's verified-TLS SMTP configuration. If required delivery settings
  are missing, retain the failed job and report the configuration failure
  without logging recipient addresses or event content.
- Production scheduling must invoke the worker through an app-specific
  scheduler. The scheduler must call Chron over HTTPS and may not require
  changes to unrelated VPS services.

## Dependency graph

```text
C1-rmd0 time and delivery contract
  └─ C1-rmd1 reminder values + transactional outbox schema and event writes
       ├─ C1-rmd2 bounded email delivery worker
       └─ C1-rmd3 event editor, review and delivery status
            └─ C1-rmd4 integrated tests and independent audits
                 └─ C1-rmd5 HTTPS staging and authenticated runtime verification
```

### C1-rmd0 — time and delivery contract

- **Assigned agent:** main integration owner; no worker agent is assigned
  because this runtime cannot technically restrict worker filesystem access.
- **Required model:** runtime model identity is not independently available;
  no model identity is claimed.
- **Dependencies:** current event time-zone, recurrence and email contracts.
- **Owned files:** this contract and the reminder domain module/tests.
- **Read-only files:** calendar recurrence/date helpers, event API contracts,
  auth email transport, `AGENTS.md`, and `SKILLS.md`.
- **Required skills:** S365, S077, S076, S045, S369, S110 and S469.
- **Security permissions:** source and tests only; no credentials, private
  account data, old reference material, network writes, or VPS changes.
- **Acceptance criteria:** choices are finite and explicit; local-day rules
  remain correct across DST; recurring occurrences are bounded; default is no
  reminder; ambiguous or nonexistent local reminder times follow a documented
  deterministic rule.
- **Tests:** timed elapsed-minute offsets, local-day offset across DST, all-day
  timezone behavior, DST ambiguity/gap policy, and recurrence occurrence keys.
- **Expected deliverables:** tested schedule calculation and this contract.
- **Status:** Complete for the pure scheduling unit. `reminders.ts` resolves
  every timed minute offset, the same-local-day rule, and both all-day choices;
  11 reminder-specific tests pass in the 39-test calendar time suite.
  Persistence and delivery are not part of this completed task.

### C1-rmd1 — event values and transactional outbox

- **Assigned agent:** main integration owner.
- **Required model:** runtime model identity is not independently available;
  no model identity is claimed.
- **Dependencies:** C1-rmd0.
- **Owned files:** calendar migrations, mutation validation, event repository,
  recurrence approval writes, and repository tests.
- **Read-only files:** recurrence engine, owner transaction helper, create
  recovery ledger, RLS policy conventions, and C1-rmd0.
- **Required skills:** S041, S042, S044, S045, S048, S049, S051, S076, S178,
  S201–S216, S346–S354 and S365.
- **Security permissions:** parameterized owner-scoped writes; event and
  outbox rows change atomically; no client-supplied owner ID; no credentials or
  production data.
- **Acceptance criteria:** create, update, deletion and approved series changes
  persist, replace, or cancel reminder jobs atomically; RLS and ownership match
  calendar events; uniqueness prevents duplicate jobs for an event revision
  and occurrence.
- **Tests:** one-off and recurring writes, no-reminder default, reschedule,
  outbox rollback, deletion cascade schema, and owner-scoped migration policy.
- **Expected deliverables:** migration, repository integration and tests.
- **Status:** Source implementation complete. Migration
  `apps/web/db/migrations/0007_calendar_reminders.sql` adds validated reminder
  choices, an owner/event composite foreign key, RLS, and unique revision and
  occurrence jobs. Typed validation and repository paths create the outbox in
  the same transaction as one-off writes and approved series changes; updates
  cancel stale jobs before inserting the current revision. Tests cover timed
  and all-day scheduling, finite recurring occurrences, and rollback when the
  outbox write fails. The calendar API suite passes 75 tests; the calendar
  time suite passes 39, layout suite 29, recovery suite 5, and auth config suite
  9. Typecheck and lint pass. A real PostgreSQL migration/application check is
  still unavailable.

### C1-rmd2 — bounded email delivery worker

- **Assigned agent:** main integration owner.
- **Required model:** runtime model identity is not independently available;
  no model identity is claimed.
- **Dependencies:** C1-rmd1.
- **Owned files:** SMTP reminder sender, worker, script, and worker tests.
- **Read-only files:** transactional outbox schema, auth email configuration,
  user verification schema, and worker timeout conventions.
- **Required skills:** S077, S076, S045, S041, S048, S049 and S051.
- **Security permissions:** verified recipients only, bounded leases and
  attempts, generic content, redacted logs, and no provider calls inside a
  database transaction; no secrets in source, tests or documentation.
- **Acceptance criteria:** jobs are claimed once per active lease, accepted
  sends are recorded, transient failures retry within a finite policy, expired
  leases recover, permanent failures stop retrying, and recipient/provider
  errors do not expose private data.
- **Tests:** concurrent claims, retries, lease expiry, missing SMTP config,
  unverified email, send acceptance, cancellation race and output redaction.
- **Expected deliverables:** runnable worker and accurately reported outcomes.
- **Status:** Implemented in source across the repository claim/outcome methods,
  bounded delivery worker, private bearer-protected route, and the separate
  Cloudflare Cron scheduler. Email links and the fixed scheduler endpoint use
  HTTPS; public HTTP origins fail closed. Calendar API/server (85), auth/email
  (13), and scheduler (2) tests pass with the calendar time/layout/recovery
  suites, lint, and typecheck. PostgreSQL migrations were not applied, SMTP was
  not contacted, and the scheduler was not deployed. `testing.uwu.markets` has
  no Cloudflare DNS record, so HTTPS staging cannot resolve. This is source
  complete only, not operationally verified.

### C1-rmd3 — editor, review and status

- **Assigned agent:** main integration owner.
- **Required model:** runtime model identity is not independently available;
  no model identity is claimed.
- **Dependencies:** C1-rmd1; the mutation contract and bounded delivery source
  are available, while database and scheduler runtime gates remain open.
- **Owned files:** calendar types, draft model, API adapter, editor/workspace,
  status presentation, styles and focused tests.
- **Read-only files:** migration/API contract, five theme tokens, recurrence
  review UI and current accessibility patterns.
- **Required skills:** S005–S015, S110, S365, S369, S421, S423, S426, S428,
  S469 and S470.
- **Security permissions:** native labeled controls, explicit review, same
  origin authenticated requests, no client claim of sent/delivered state, no
  secrets in browser storage or URLs.
- **Acceptance criteria:** reminder choice round-trips through edits; all-day
  zone is retained; recurrence scope is clear; exact scheduled local time is
  reviewed; status names match persisted server state; keyboard and narrow
  layouts remain usable across all themes.
- **Tests:** choices, edit round-trip, review invalidation, saved timezone,
  field-error association, status announcements and delivery failure.
- **Expected deliverables:** functional editor and truthful persisted status.

### C1-rmd4 — integrated tests and independent audits

- **Assigned agent:** main integration owner. Read-only reviewers are not
  spawned unless their project access can be technically constrained.
- **Required model:** no reviewer model identity is claimed unless execution is
  confirmed by the runtime.
- **Dependencies:** C1-rmd1 through C1-rmd3.
- **Owned files:** tests, audit findings, and progress/handoff evidence.
- **Read-only files:** all integrated reminder source and relevant security
  rules.
- **Required skills:** S365, S077, S076, S045, S110, S469 and C1 test/review
  guidance.
- **Security permissions:** synthetic records only; no production credentials,
  network writes, old reference materials, or non-main branch pushes.
- **Acceptance criteria:** severity-ranked findings are fixed and re-reviewed;
  schedules and send states are proven from behavior rather than source claims.
- **Tests:** targeted unit/API/worker tests, lint, typecheck, and database tests
  when a disposable PostgreSQL instance is available.
- **Expected deliverables:** verified feature and dated audit results.

### C1-rmd5 — HTTPS staging and authenticated runtime verification

- **Assigned agent:** main integration owner.
- **Required model:** runtime model identity is not independently available.
- **Dependencies:** C1-rmd4; working `https://testing.uwu.markets`, disposable
  account and verified SMTP delivery configuration.
- **Owned files:** evidence in progress and audit documentation.
- **Read-only files:** deployed feature and hosting configuration.
- **Required skills:** S421–S428, S077 and Cloudflare deployment guidance.
- **Security permissions:** staging account and synthetic events only; the
  exact HTTPS hostname is used, no downgrade to HTTP, and unrelated VPS
  services/configuration are untouched.
- **Acceptance criteria:** create, edit, recurring approval, opt-out, schedule,
  send and failure recovery are exercised through the real authenticated app.
- **Tests:** actual browser and database walkthrough over HTTPS, at desktop and
  mobile sizes.
- **Expected deliverables:** dated runtime evidence; open gates remain marked
  open if DNS, database, SMTP or account prerequisites are unavailable.
