# Calendar interaction audit

## Scope and evidence

The source review covered the calendar implementation through the current
reliability patch. The first independent visual pass reviewed the calendar
views; follow-ups reviewed recovery, idempotent create, and short-event fixes.
A separate security pass inspected create retry, stale-edit, and event
approval paths. Lint, type checking, the 30-test API suite, 7-test time suite,
10-test layout suite, 5-test recovery suite, and production build pass. The
authenticated calendar has not been exercised in a browser because this
runtime has no configured PostgreSQL database or disposable account. Scores
are source-review scores, not launch approval.

## Scores

| Category | Score | Evidence and limits |
| --- | ---: | --- |
| Visual originality | 7/10 | Five coherent calendar themes exist; rendered theme comparisons are not yet verified. |
| Typography | 7/10 | Calendar headings and labels have a defined hierarchy; no authenticated browser review was possible. |
| Layout | 8/10 | Day, week, month, and agenda layouts are implemented; rendered theme comparison remains pending. |
| Color | 8/10 | Theme tokens cover light, dark, pastel, pink, and high-contrast states; browser contrast checks remain open. |
| Animation | 7/10 | Calendar motion is restrained and reduced-motion rules exist; interaction feel has not been reviewed in an authenticated session. |
| Content | 8/10 | Event labels and operation errors are specific; saved, missing, and deleted recovery outcomes have distinct messages. |
| Interaction | 7/10 | Source implements event, preference, and create reconciliation paths; live persistence and reload behavior are not runtime verified. |
| Accessibility | 7/10 | Reload-safe focus and full-size short-event alternatives are implemented in source; keyboard walkthrough remains open. |
| Functionality | 7/10 | API, time, layout, and recovery tests pass; no configured database or account permits a real calendar workflow. |
| Code quality | 8/10 | Typed domain, owner-scoped repository, and focused test suites are present; pending database integration limits confidence. |
| Performance | 6/10 | Rendering is bounded by the visible period; Core Web Vitals and dense-calendar profiling have not been measured. |
| Security | 8/10 | Auth, owner scoping, RLS, conflict rechecks, and owner-scoped create idempotency exist; PostgreSQL concurrency and RLS runtime behavior remain unverified. |

## Findings

### C-01 — Keep event and preference errors beside the active form

- **Issue:** Mutation failures displaced the calendar and offered an unrelated reload action.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/presentation/calendar-workspace.tsx`, `calendar-editor.tsx`, `calendar-preferences.tsx`
- **Why it is a problem:** Recovery should remain next to the action that can retry or correct the request.
- **Recommended correction:** Keep calendar loading errors global; show event failures in the event editor and preference failures in the preference form.
- **Assigned agent:** Main integration owner
- **Verification method:** Independent source re-review; lint, typecheck, and production build.
- **Status:** Closed in source at `eab4d46`; authenticated error recovery has not been browser-tested.

### C-02 — Calculate Today in the configured calendar zone

- **Issue:** Initial date and Today used the device timezone instead of the saved calendar timezone.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/domain/time.ts`, `time.test.mjs`, `apps/web/features/calendar/presentation/calendar-workspace.tsx`
- **Why it is a problem:** Near midnight the device and calendar can be on different dates.
- **Recommended correction:** Convert the current instant through the configured IANA timezone.
- **Assigned agent:** Main integration owner
- **Verification method:** Fixed-instant tests assert different dates for Montreal and London; calendar-time suite passes.
- **Status:** Closed at `eab4d46`.

### C-03 — Restore focus after reload and removal

- **Issue:** Save, delete, and discard restored focus before reloading; the calendar then unmounted its opener.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/presentation/calendar-workspace.tsx`, `calendar-editor.tsx`
- **Why it is a problem:** Keyboard users can lose their place after a successful operation or when the event is removed.
- **Recommended correction:** Defer focus restoration until reload and busy state finish; return to the opener if it remains connected, otherwise focus a stable control such as New event.
- **Assigned agent:** Main integration owner
- **Verification method:** Browser keyboard checks for close, save, delete, and discard after a disposable database is available.
- **Status:** Fixed in source; after reload and busy completion the opener regains focus if still usable, otherwise focus goes to New event or the stable calendar heading. Authenticated keyboard verification remains pending.

### C-04 — Show accurate labels for multi-day timed events

- **Issue:** Every date segment displayed the original start time.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/presentation/calendar-views.tsx`
- **Why it is a problem:** Later days appeared to start the event again and obscured continuation or end information.
- **Recommended correction:** Label each segment with its actual start, continuation, or end time, including midnight.
- **Assigned agent:** `/root/calendar_continuation_fix`
- **Verification method:** Independent source re-review and integrated typecheck, lint, and production build.
- **Status:** Closed in source at `58d75cb`; browser verification remains open.

### C-05 — Keep short events discoverable near midnight

- **Issue:** Minimum event height is clipped at the end of the day, leaving an event near midnight with a very small pointer target.
- **Severity:** P1
- **Affected files:** `apps/web/features/calendar/presentation/calendar-model.ts`, `calendar-views.tsx`, `calendar.module.css`
- **Why it is a problem:** The event can be hard to click or focus without obscuring the next day.
- **Recommended correction:** Move segments below a usable rendered-height threshold into a full-size, keyboard-accessible list below the time track.
- **Assigned agent:** Calendar short-event specialist
- **Verification method:** Add a 23:59 boundary case; inspect pointer and keyboard access at desktop and mobile widths when a browser-backed calendar session is available.
- **Status:** Fixed in source; clipped event segments below the usable height threshold are exposed as full-size controls outside the time track. Desktop and mobile authenticated rendering remain unverified.

### C-06 — Give loading state priority over stale notices

- **Issue:** A previous save message could replace the loading state during calendar navigation.
- **Severity:** P3
- **Affected files:** `apps/web/features/calendar/presentation/calendar-workspace.tsx`
- **Why it is a problem:** Users may mistake a stale success message for a loaded calendar.
- **Recommended correction:** Show loading first and clear notices when navigation starts.
- **Assigned agent:** Main integration owner
- **Verification method:** Independent source re-review; lint, typecheck, and production build.
- **Status:** Closed in source at `eab4d46`; delayed-request behavior remains untested in a live calendar browser session.

### C-07 — Make event creation retries idempotent

- **Issue:** A committed create with a lost response could be retried as a second event.
- **Severity:** P2, data integrity
- **Affected files:** `apps/web/app/api/calendar/events/route.ts`, calendar validation and repository, database migrations, `apps/web/features/calendar/presentation/calendar-api.ts`, `calendar-workspace.tsx`
- **Why it is a problem:** Repeated POSTs without a durable operation key could generate multiple event IDs.
- **Recommended correction:** Require a client operation key, bind it to the authenticated owner and normalized approved payload, persist its hash and event pointer in the same transaction as creation, and reload the current owner-scoped event for a matching retry. Reject key reuse with changed payload and keep an uncertain UI outcome locked to the same approved request until replay resolves it.
- **Assigned agents:** Backend idempotency specialist and main integration owner
- **Verification method:** In-memory repository/API tests cover replay, key reuse, owner isolation, deletion tombstones, reconciliation, and rollback. PostgreSQL concurrency/RLS and real response-loss browser tests still require a disposable database/account.
- **Status:** Fixed in source and independently reviewed; migration and live behavior remain unverified until a database is configured.

### C-08 — Prevent sign-out from racing an uncertain calendar operation

- **Issue:** Sign-out or settings actions could interrupt a save or verification flow.
- **Severity:** P2, data integrity
- **Affected files:** `apps/web/features/calendar/presentation/calendar-workspace.tsx`
- **Why it is a problem:** Ending a session while a mutation is in flight can leave the user unsure whether it succeeded.
- **Recommended correction:** Lock background controls during saves, sign-out, and recovery; reject sign-out while the event editor is open.
- **Assigned agent:** Main integration owner
- **Verification method:** Source review and lint, typecheck, build; authenticated race testing remains pending.
- **Status:** Fixed in source; independently reviewed.

### C-09 — Preserve all pending operation keys on partial recovery failure

- **Issue:** A failed later reconciliation could discard local keys for earlier completed outcomes before they were reported.
- **Severity:** P2, data integrity
- **Affected files:** `calendar-workspace.tsx`, `calendar-create-recovery.ts`, and recovery tests
- **Why it is a problem:** The next retry could not explain or verify every approved save outcome.
- **Recommended correction:** Keep all batch keys until every reconciliation succeeds, report completed outcomes on partial failure, and reload if any saved or deleted event was found.
- **Assigned agent:** Main integration owner
- **Verification method:** Focused recovery test covers a successful first result, failed second result, retained keys, and full successful retry; an independent source review confirmed the fix.
- **Status:** Fixed in source; authenticated recovery remains pending.
