# Calendar interaction audit

## Scope and evidence

The source review covers the calendar implementation through bounded event
search and its return-focus fix. The first independent visual pass reviewed the
calendar views; follow-ups reviewed recovery, idempotent create, short-event
fixes, and search. A separate security pass inspected create retry, stale-edit,
event approval, and search ownership. Lint, type checking, the 39-test API
suite, 7-test time suite, 17-test layout/search suite, 5-test recovery suite,
and production build pass. The
authenticated calendar has not been exercised in a browser because this
runtime has no configured PostgreSQL database or disposable account. Scores
are source-review scores, not launch approval.

The follow-up entries review one-off movement source at `3b6028c` and timed
slot creation source at `833848a`. They do not change the earlier score table:
these interactions have not been rendered or tested with a real authenticated
account, and there was no independent reviewer with enforceable filesystem
isolation available.

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

## Bounded event-search audit (2026-10-31)

This review covers the new calendar title-search API and interface. The search
request is bounded to 120 Unicode code points and a 93-day inclusive date
window, uses a same-origin JSON POST, filters by the authenticated owner and
optional event kind, returns an explicit overflow error, and opens selected
results in the existing editor. It introduces no sample events, fake data,
emoji, decorative statistics, or ornamental animation.

| Category | Score | Evidence and limits |
| --- | ---: | --- |
| Visual originality | 8/10 | Search uses the existing Chron calendar tokens and theme states; authenticated rendering could not be inspected. |
| Typography | 8/10 | Search title, labels, hints, and results follow the existing hierarchy; browser rendering remains unverified. |
| Layout | 8/10 | Four desktop fields reflow to two columns at 46rem after a source review found and fixed tablet overflow; no browser `scrollWidth` measurement was available. |
| Color | 8/10 | Existing theme tokens and selected light/dark `color-scheme` apply to controls; rendered contrast has not been measured. |
| Animation | 9/10 | Search adds no decorative motion; reduced-motion behavior remains inherited from the calendar. |
| Content | 9/10 | Labels state title matching, inclusive dates, the 93-day limit, event type, and actionable failure states. |
| Interaction | 8/10 | Request aborts, stale-response guards, disabled-state clearing, and editor handoff are implemented; authenticated browser interaction is not verified. |
| Accessibility | 8/10 | Inputs have labels and descriptions, validation focus follows the rendered error, and result states are announced; screen-reader and keyboard browser checks remain open. |
| Functionality | 8/10 | The route and real SQL query are present, with 39 API and 17 UI/helper tests passing; PostgreSQL behavior is not exercised. |
| Code quality | 9/10 | Typed request validation, dedicated UI component, bounded SQL, and focused tests are in place. |
| Performance | 7/10 | Date, row-count, and 2-second query limits bound work; the leading-wildcard title query has not been profiled against real data. |
| Security | 7/10 | Session-derived ownership, transaction-local RLS context, parameterized SQL, same-origin checks, and `no-store` are present; actual two-account isolation is unverified. |
| Product identity | 8/10 | Specific calendar copy and existing theme language remain consistent; no new visual browser evidence was available. |

Scores below 9 reflect evidence that cannot be established from this runtime;
they are not assertions that the implementation is broken. The open database
and authenticated-browser checks are release verification work, not a reason to
invent successful results.

### C-10 — Preserve over-limit title text and explain the limit

- **Issue:** The initial search field silently truncated titles beyond the API limit.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/presentation/calendar-search.tsx`, `calendar-api.ts`
- **Why it is a problem:** Users could submit a different title from the one they typed without noticing.
- **Recommended correction:** Preserve input, show remaining code points, and validate with a field error on submit.
- **Assigned agent:** Calendar search UI engineer
- **Verification method:** UI request-builder tests cover 120/121 code points; source review confirms the input value is not sliced.
- **Status:** Fixed in source and verified by tests; browser entry behavior remains unverified.

### C-11 — Focus the rendered field error

- **Issue:** Validation previously focused the input before its description was committed to the DOM.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/presentation/calendar-search.tsx`
- **Why it is a problem:** Assistive technology may not announce the newly associated correction guidance.
- **Recommended correction:** Defer focus until the error element and `aria-describedby` reference are present.
- **Assigned agent:** Calendar search UI engineer
- **Verification method:** Source review confirms the post-commit focus guard; screen-reader runtime confirmation is still pending.
- **Status:** Fixed in source; assistive-technology verification remains open.

### C-12 — Reflow the search form at narrow tablet widths

- **Issue:** The initial four-column form could exceed the panel width around 701–723px.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/presentation/calendar.module.css`
- **Why it is a problem:** Horizontal overflow makes date and event-type controls harder to use.
- **Recommended correction:** Start the two-column layout at 46rem and make query, guidance, and actions span the form width.
- **Assigned agent:** Calendar search UI engineer
- **Verification method:** Source review confirms the updated breakpoint; real viewport overflow testing remains pending.
- **Status:** Fixed in source; browser width measurements remain open.

### C-13 — Match native controls to the selected theme

- **Issue:** Browser date and select popovers could follow the operating-system scheme instead of the calendar theme.
- **Severity:** P3
- **Affected files:** `apps/web/features/calendar/presentation/calendar.module.css`
- **Why it is a problem:** A light calendar on a dark OS, or the reverse, could produce inconsistent control surfaces.
- **Recommended correction:** Set `color-scheme` on the workspace for light and premium-dark themes.
- **Assigned agent:** Calendar search UI engineer
- **Verification method:** Source review confirms theme-specific `color-scheme`; cross-OS browser checks remain pending.
- **Status:** Fixed in source; native picker rendering remains unverified.

### C-14 — Keep network failures browser-independent

- **Issue:** The initial fetch handler could display a browser-specific exception message.
- **Severity:** P3
- **Affected files:** `apps/web/features/calendar/presentation/calendar-api.ts`
- **Why it is a problem:** Unhelpful or inconsistent diagnostics make recovery unclear and expose transport details.
- **Recommended correction:** Map ordinary fetch failures to stable user guidance while preserving abort behavior.
- **Assigned agent:** Calendar search UI engineer
- **Verification method:** Network rejection and abort unit tests pass; a real offline browser state remains untested.
- **Status:** Fixed in source and verified by tests.

### C-15 — Verify search isolation across real accounts

- **Issue:** The current cross-owner repository test filters mock rows itself, while the route test inspects source text.
- **Severity:** P2, verification gap
- **Affected files:** `apps/web/features/calendar/server/repository.test.mjs`, `calendar-api.test.mjs`, calendar migrations
- **Why it is a problem:** These checks do not execute the route with two authenticated users or demonstrate PostgreSQL RLS behavior.
- **Recommended correction:** Add a disposable-PostgreSQL integration test that searches as two accounts and proves each receives only its own matching events, including punctuation and overlap boundaries.
- **Assigned agent:** Main integration owner with independent security review
- **Verification method:** Requires a PostgreSQL service and disposable accounts; none is configured in this runtime.
- **Status:** Open. The reviewed query explicitly binds `user_id` and sets transaction-local RLS context, and no isolation bypass was found by source review. Runtime isolation remains unproven.

### C-16 — Return editor focus to the search context

- **Issue:** Selecting a result removed its button before editor close, so focus fell back to the unrelated New event control.
- **Severity:** P2
- **Affected files:** `apps/web/features/calendar/presentation/calendar-search.tsx`, `calendar-workspace.tsx`
- **Why it is a problem:** Keyboard users lose the search context they used to open the event.
- **Recommended correction:** Pass the persistent, programmatically focusable search heading as the editor return target.
- **Assigned agent:** Main integration owner
- **Verification method:** Independent source re-review, calendar-layout/search suite, lint, typecheck, and production build; authenticated keyboard return-path check is still pending.
- **Status:** Fixed in source; the stable search heading is saved as the editor return target and remains mounted when the result list clears. Browser focus behavior remains unverified.

### C-17 — Verify event movement in an authenticated browser

- **Issue:** The new one-off drag movement is verified by source tests only.
- **Severity:** P2, verification gap
- **Affected files:** `apps/web/features/calendar/presentation/calendar-event-control.tsx`,
  `calendar-move.ts`, `calendar-views.tsx`, `calendar-workspace.tsx`,
  `calendar-editor.tsx`, and `calendar.module.css`.
- **Why it is a problem:** Unit tests cannot establish pointer capture, touch
  behavior, visible drop feedback, keyboard editor access, conflict review, or
  persistence after a real authenticated save.
- **Recommended correction:** Run the move workflow against a disposable
  PostgreSQL account in a real desktop and mobile browser, including month and
  time-grid drops, conflict/no-conflict cases, keyboard use, timezone changes,
  and DST boundaries.
- **Assigned agent:** Main integration owner.
- **Verification method:** Real authenticated browser walkthrough plus
  database assertions; inspect desktop/mobile rendering and keyboard focus.
- **Status:** Open. Source suites, typecheck, and lint pass. No PostgreSQL
  service/account is configured in this runtime; no live browser verification
  or deployment is claimed.

### C-18 — Verify click-to-create from a time-grid slot

- **Issue:** Click-to-create now opens a correctly timed draft in source, but
  the rendered interaction has not been exercised in an authenticated browser.
- **Severity:** P2, verification gap
- **Affected files:** `apps/web/features/calendar/presentation/calendar-views.tsx`,
  `calendar-workspace.tsx`, `calendar-model.ts`, and `calendar.module.css`.
- **Why it is a problem:** Unit tests verify slot and DST conversion, but do not
  prove hit position, target filtering around event controls, focus restoration,
  editor display, conflict review, or persisted creation.
- **Recommended correction:** Test empty slots and existing event controls in
  day view on mobile and day/week views on desktop/tablet; verify the mobile
  week list's Add event path. Create, review, save, reload, and inspect dates,
  times, zones, and focus with a disposable account.
- **Assigned agent:** Main integration owner.
- **Verification method:** Authenticated browser interaction plus database
  assertions; include both DST fold choices and the spring-forward transition.
- **Status:** Open. The 46-test presentation suite, typecheck, and lint pass;
  no database-backed browser session is available.

## Timed-event duration resize review (2026-11-01)

This source-level visual and interaction review covers commits `590331f` and
`c1d7647`. Resize controls appear only on one-off timed segments that end on
the displayed date, occupy at least 75% of their lane, and are at least 5.5rem
tall. Pointer input chooses a 15-minute end slot; keyboard activation opens the
existing editor. The proposal uses the existing conflict check and explicit
save flow. No authenticated browser or database session was available, so
these scores do not establish rendered quality or persistence.

| Category | Score | Evidence and limits |
| --- | ---: | --- |
| Visual originality | 8/10 | The control uses Chron's event and theme tokens and adds no generic AI decoration; rendered theme parity is unverified. |
| Typography | 8/10 | Existing event type hierarchy remains and the editor names the proposed duration change; rendered sizing is unverified. |
| Layout | 7/10 | The end handle is gated by event height and lane width, with 44px targets; overlap and narrow-screen rendering need browser inspection. |
| Color | 8/10 | Surfaces and accents use existing theme variables; contrast was not measured in a browser. |
| Animation | 9/10 | No decorative animation was added; pointer feedback remains immediate. |
| Content | 9/10 | Labels distinguish moving from resizing and say the proposed end is not saved before review. |
| Interaction | 7/10 | The proposal reaches the shared editor and conflict flow; pointer capture, hit targets, and persistence remain untested live. |
| Accessibility | 8/10 | Buttons have explicit labels, keyboard activation opens the editor, and drag state is announced; assistive-technology checks remain open. |
| Functionality | 8/10 | The helper covers timezone conversion, DST folds, min/max duration, and recurring-event rejection; no database-backed save was tested. |
| Code quality | 9/10 | Resize calculation is a focused typed helper; presentation (51), API (89), time (39), typecheck, and lint pass. |
| Performance | 8/10 | The interaction adds no animation loop or external dependency; dense-calendar profiling was not run. |
| Security | 8/10 | Changes reuse authenticated event update and review paths without a direct write route; runtime ownership checks remain unverified. |
| Product identity | 8/10 | Control labels and visuals follow the calendar's existing language and use no emoji; browser consistency remains to be checked. |

### C-19 — Propose timed-event end changes from the time grid

- **Issue:** Users had to open the editor to adjust the duration of a timed
  event.
- **Severity:** P2
- **Affected files:** `calendar-event-control.tsx`, `calendar-move.ts`,
  `calendar-views.tsx`, `calendar-workspace.tsx`, `calendar-editor.tsx`, and
  `calendar.module.css`.
- **Why it is a problem:** Repeatedly opening the editor adds friction to
  schedule adjustments and hides the end-time affordance from the time grid.
- **Recommended correction:** Add a dedicated end handle for usable, one-off
  timed blocks and open the existing conflict-review editor with the proposed
  value.
- **Assigned agent:** Main integration owner.
- **Verification method:** DST-safe unit tests, API suite, typecheck, lint, and
  review of the existing conflict/save path; follow with an authenticated
  browser workflow.
- **Status:** Fixed in source and pushed as `590331f update` and
  `c1d7647 improve`. The 51-test presentation suite, 89-test API suite,
  39-test calendar-time suite, typecheck, and lint pass. Authenticated browser
  and persisted-save behavior remain unverified.

### C-20 — Verify timed-event resize in an authenticated browser

- **Issue:** The new handle, drag target feedback, editor review, and persisted
  save have source-level checks only.
- **Severity:** P2, verification gap
- **Affected files:** `calendar-event-control.tsx`, `calendar-views.tsx`,
  `calendar-workspace.tsx`, `calendar-editor.tsx`, and `calendar.module.css`.
- **Why it is a problem:** Unit tests cannot prove pointer capture, keyboard
  access, mobile layout, conflict presentation, or saved event duration.
- **Recommended correction:** Test a disposable account in day/week views on
  desktop and mobile; cover empty and occupied targets, conflict and clear
  cases, keyboard use, repeat-hour changes, save/reload, and event ownership.
- **Assigned agent:** Main integration owner.
- **Verification method:** Real authenticated browser walkthrough and
  database assertions; use HTTPS for staging and inspect only the Chron
  staging route.
- **Status:** Open. No PostgreSQL service/account is configured. An earlier
  staging check did not resolve; on 2026-11-02, HTTPS probes returned
  redirects from `/` to `/calendar` and from `/calendar` to `/sign-in`, with
  valid TLS and HSTS. No redirect was followed, so the served app version and
  authenticated browser behavior remain unverified. The production build
  passes with runtime credentials unset, as recorded in C-21. No HTTP staging
  fallback or unrelated VPS change was made.

### C-21 — Avoid loading runtime authentication secrets during route discovery

- **Issue:** The internal reminder route imported the authentication/database
  singleton at module load, so Next.js production-build route discovery failed
  when runtime credentials were absent.
- **Severity:** P2, build and secret-management risk
- **Affected files:** `apps/web/app/api/internal/calendar-reminders/route.ts`
  and `apps/web/features/calendar/server/calendar-reminder-route.test.mjs`.
- **Why it is a problem:** Build systems should not need production auth or
  database secrets merely to compile a protected endpoint. Requiring those
  values at build time also broadens access to sensitive credentials.
- **Recommended correction:** Load the authentication/database singleton only
  after the route has accepted its bearer authorization, and preserve the
  generic failure response for runtime configuration errors.
- **Assigned agent:** Main integration owner.
- **Verification method:** Import the route with auth/database settings unset,
  verify an unauthorized request returns 404 before database initialization,
  then run the production build without runtime credentials.
- **Status:** Fixed and pushed as `d122d05 update`. The new route tests pass;
  the production build, 91-test calendar API suite, 14-test auth suite,
  typecheck, and lint pass without auth/database settings. Staging and real
  authenticated database behavior remain unverified.

## Preference customization follow-up — 2026-11-02

Migration 0014 adds a validated per-account accent override. The calendar
previews it across the selected theme and adjusts low-contrast colors to meet
4.5:1 against the theme surface. Migration 0015 persists a per-account
reduced-motion choice; opting in removes calendar transitions, animations, and
smooth scrolling. The existing operating-system preference remains honored
when the saved choice is off.

The API, persistence, contrast, and client response checks pass in source and
CI. Scores above are unchanged because the authenticated controls were not
rendered in this session: HTTPS `/calendar` redirects to sign-in, and no test
account or deployment key is available. Desktop/mobile visual parity and the
saved-preference reload path remain open browser checks.
