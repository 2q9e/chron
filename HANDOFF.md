# Handoff

## Current checkpoint — 2026-11-02

The official Meta Model API review now records the first-party service at
`https://api.meta.ai/v1` and the current documented tool/structured-output
constraints. This confirms the API exists; it does not authorize Chron to
receive and store individual user keys. BYOK intake and inference remain
disabled pending written Meta clarification or permission for the exact flow
and qualified legal review. 18+ eligibility, geographic restrictions, and
attribution approval also remain launch gates. The documentation notes
conflicting Meta statements about reasoning replay and file expiry. No account
or key was used and no API request was made.

Commit `81838e5 update` is pushed to the single GitHub `main` branch over
HTTPS as `2q9e`. The production auth configuration requires an HTTPS public
origin; the app server requires certificate/key files and binds to loopback. The
calendar staging route was checked with HTTPS and returned a sign-in redirect
plus HSTS. No deployment or VPS/Cloudflare change was made. Browser testing is
unavailable in this session.

Next: continue calendar-first work on `main`, keep the landing page paused,
and use HTTPS for Git and staging.

## Current checkpoint — 2026-11-02

Visible-range `.ics` exports now preserve each known explicit event category:
class, assignment, exam, study, personal, and other. Missing, null, and
unrecognized legacy values are omitted. Tests cover all category mappings,
all-day events, and recurring timed events.

Task/review notes were pushed in `e5f7013 update`; serializer and tests were
pushed in `8946d55 improve`. Both are on the sole published `main` branch,
authored as `2q9e`, with the Git remote set to HTTPS. The 67-test calendar
domain suite, typecheck, lint, and diff check pass locally. Independent
read-only review found no actionable issue. GitHub Actions run `41472151344`
passed. The staging calendar responds over HTTPS with
a sign-in redirect and HSTS; this source change has not been deployed, and
signed-in export behavior was not browser verified. No VPS files or services
were changed.

Next: continue the calendar-first roadmap on `main`, keep the landing page
paused, and browser-verify export with an authorized test account when
available. Use HTTPS for GitHub and `https://testing.uwu.markets`; do not edit
unrelated VPS files or services.

## Current checkpoint — 2026-11-02

Calendar visible-range `.ics` export now shares a cancellable single-flight
runner. The workspace aborts it on sign-out, navigation, view/time-zone change,
editor entry, and component cleanup. The runner ignores stale successes and
errors and cannot clear a newer attempt from an older `finally` block. Retry
clears the previous notice; pending work is exposed in the button and polite
status region. Four deferred-response tests use the production runner.

Source and tests were pushed as commit `90166ed` (`fix`) to the one published
branch, `main`, over HTTPS under author and committer `2q9e`. The calendar
presentation suite (82), typecheck, lint, and diff check pass locally; GitHub
Actions runs `41465392379` and `41466345621` passed. The independent reviewer
found and the implementation fixed an unannounced pending state and tests that
imitated the guard instead of exercising shared orchestration. Its final
source-only recheck found no implementation defect and identified a race-test
ordering gap, fixed in `f45e365`. Browser use is disabled, so no rendered
download or assistive-technology walkthrough was performed. Staging remains
unchanged because the required authorized VPS key is unavailable. Do not edit
unrelated VPS files/services; use only `https://testing.uwu.markets` when
authorized access is restored.

Next: continue calendar work on `main`, keep the landing page paused, and
verify `.ics` export in a real browser with an authorized test account once
the browser and staging access are available.

## Current checkpoint — 2026-11-02

Calendar event creation now passes the initiating button to the existing
editor focus-restoration flow from month dates, day/week headers, agenda
headers, the main toolbar, and the empty state. The time-grid click already
used a stable button target. Calendar presentation tests (77), typecheck,
lint, and `git diff --check` pass. Browser use is disabled in this session, so
real-browser focus behavior remains unverified. Use HTTPS for GitHub and
`https://testing.uwu.markets`; do not switch public/staging links to HTTP.

The repository is on the single published `main` branch and has more than 500
non-empty commits. Keep commits small and authored as `2q9e`. Staging is not
updated by this source-only change; prior VPS access failed because the
authorized SSH key was unavailable. Do not change unrelated VPS files or
services.

## Current checkpoint — 2026-11-02

The manual study workspace is pushed on the single public GitHub `main`
branch. It supports owner-scoped decks and cards plus FSRS-based due review;
it creates no sample data and does not claim AI-generated or source-grounded
study functionality. Four commits (`b5d206d`, `1446fe8`, `7ec5496`, and
`84741e2`) were pushed over HTTPS as `2q9e`.

GitHub Actions run `41460769609` passed the production build, dependency audit,
lint, typecheck, PostgreSQL tenant-isolation/account-cleanup integration, and
all configured test suites. Locally, the 11 study tests and 124 calendar API
tests pass; typecheck, lint, and diff checks pass. PostgreSQL integration
skips locally because `CHRON_TEST_DATABASE_URL` is unset. Independent UI
review was source-only, not a browser rendering. `https://testing.uwu.markets/study`
returns 404 with HSTS, confirming the new route is not deployed. The previous
read-only SSH login check failed because the required key is unavailable in
this session. No VPS or Cloudflare changes were made. The public Git remote and
staging URL use HTTPS.

Next actions:

1. Restore authorized VPS access before deployment. Then deploy only the Chron
   release, migration/grants for study tables, release symlink, and
   `chron-web.service`; verify the deployed route over HTTPS. Do not edit other
   VPS resources.
2. Use only an authorized test account for signed-in browser verification.
3. Continue calendar-first work; keep the landing page paused. This manual
   study slice is partial progress toward E1, not a completed study system.

## Current checkpoint — 2026-11-02

Calendar search now returns individual recurring occurrences, applies moved
and cancelled exceptions, and labels timed results in the configured calendar
timezone. Search work is bounded across candidate rows, exception rows,
recurrence expansion, output count, and SQL execution time.

Commit `2383aea` (`fix`) is pushed by `2q9e` to the single GitHub `main` branch
over HTTPS. Calendar server tests (124), domain tests (66), presentation tests
(77), typecheck, lint, diff checks, and a staged secret-pattern check pass. The
focused Codex Security diff review completed with zero findings. It reviewed
the 10 changed files and relevant auth, validation, RLS, and response-contract
dependencies; it did not verify deployed RLS or signed-in browser behavior.
The application source contains no `http://` URLs; remaining occurrences are
test fixtures and insecure-URL rejection cases. The Git remote and staging
address use HTTPS. Staging remains on release `6ddcaf1`; the documented SSH
preflight was rejected earlier, so no VPS or Cloudflare change was made. The
production build was not run with about 97 MB free.

Next actions:

1. Continue calendar implementation on `main`; keep the landing page paused.
2. Deploy only after authorized VPS access succeeds; use HTTPS and change only
   Chron's release and service.
3. Verify signed-in calendar flows in a browser only with an authorized test
   account.

## Current checkpoint — 2026-11-02

Runtime research policy now distinguishes discovery from reading validated
user-provided HTTPS URLs. Automatic external research requires both
`research.web.read` and `research.web.discover`; a reader-only grant returns
`capability-unavailable` when additional sources are requested. Source scope
uses an opaque in-process token. The helper validates the mode, but does not
authenticate the user or prove intent provenance. Reader-only scope requires
an immutable snapshot of a parsed public HTTPS URL; forged or invalid scope
returns clarification. The discovery skill requires both capabilities. All
built-in skills carry a contract version, preserved with selected skill IDs in
prepared turns. Individual source quality and corroboration are separate
report fields. Fifteen focused agent-skill tests pass.

This policy is not wired to an application route. No source-discovery service
or server capability grant exists, and the signed-in Research screen remains
a direct known-URL reader. Do not present this change as a functioning search
agent, citation workflow, or model-backed feature. Meta inference remains
gated, and no search or inference request was made. A future executor must
authenticate the user, derive scope from an explicit choice, and bind the
submitted URL to the exact approved snapshot before revalidating its fetch
target. That execution path does not exist yet. HTTPS is required for all
public, Git, and staging endpoints. Continue calendar work after recording
this internal policy checkpoint; keep the landing page paused and the single
GitHub `main` branch.

Verification and publication: agent-skill tests (15), research tests (21),
typecheck, lint, diff checks, and staged secret-pattern checks passed. The
non-test source scan found no insecure URL schemes; HTTP test cases exist only
to verify rejection. The focused Codex Security diff scan completed with zero
findings across its nine-file source/test scope (scan
`06f96306-3c7e-45de-b465-d4a5271e4cce`). Commit `6683f02` (`improve`) was
pushed to `main` over HTTPS under author and committer `2q9e`; GitHub currently
exposes only the `main` branch. No VPS or Cloudflare deployment changes were
made.

Next actions:

1. Keep deployment unchanged until authorized VPS access is available; if it
   is restored, change only the Chron release and service and verify via
   `https://testing.uwu.markets`.
2. Continue calendar behavior work; do not claim source discovery or agent
   workflows are implemented until a real route and authorized capability
   exist.

## Current checkpoint — 2026-11-02

`C1-category1` adds class, assignment, exam, study, personal, and other event
categories. The additive migration is
`apps/web/db/migrations/0018_calendar_event_categories.sql`; it leaves old
events `NULL` and does not guess. The UI keeps known categories, explicit
Uncategorized, and a field omitted by a legacy API distinct. Untouched
categories are omitted from create/update requests. A legacy event retains an
available “Leave category unchanged” option even after a tentative selection,
so the user can revert before review. Categories flow through single-event
updates, recurring series proposals, split inheritance, search, and event
controls.

Verification on the working tree: calendar domain 66, presentation 68, server
115, typecheck, lint, and `git diff --check` pass. The authenticated
`/api/calendar/capabilities` route gates the category control; older releases
return no capability and category-bearing writes recheck support before
submission. The local PostgreSQL suite was skipped because
`CHRON_TEST_DATABASE_URL` is unset. The local production build was not run with
only 93 MB available on the workspace volume. GitHub Actions run `41436641635`
passed lint, typecheck, calendar suites, PostgreSQL tenant isolation and
migration checks, dependency audit, and the production build. Migration
0018 must precede starting the matching Chron release. Stop and drain the
single `chron-web.service` before replacing the app process. Do not use a
rolling multi-version deployment behind the same origin; if staging adds
multiple app instances, upgrade them all before exposing category capability
or route requests by release version. Do not roll back to pre-0018 handlers
while category-bearing series drafts remain pending; resolve or expire those
drafts on a compatible release first.

All external, Git, and staging URLs remain HTTPS-only. Plain-HTTP inputs remain
only in loopback and negative security tests; product fetches and deployment
targets use HTTPS. No VPS files or services have changed. The current
staging release remains `6ddcaf1`; authenticated browser verification still
requires an authorized test account. Source is pushed to the only HTTPS remote
branch, `main`, in commits `5808b3a`, `c74fb87`, `4161ee5`, and `2ab3047`, all
authored by `2q9e`. An HTTPS request to `https://testing.uwu.markets/calendar`
redirected to sign-in and returned HSTS. The independent read-only category
review found no remaining code blocker under the single-service rollout and
pending-draft rollback rules.
The read-only SSH preflight using the documented login was rejected, so no
deployment command ran and no VPS or Cloudflare configuration changed.

Next actions:

1. Deploy the pushed Chron release only after valid VPS login is available.
   Stop the single `chron-web.service`, apply migration 0018, switch only
   Chron's release, then start that service and verify via
   `https://testing.uwu.markets`; do not change unrelated VPS files or services.
2. If authorized access still fails, leave staging unchanged; do not guess
   credentials or alter Cloudflare/VPS configuration.
3. Verify signed-in calendar category flows only with an authorized test
   account.

## Latest checkpoint — 2026-11-02

Current source is pushed to HTTPS GitHub `main` through `c4f8bc4 fix`, in the
four latest small commits (`097756e`, `6213718`, `fe970f9`, and `c4f8bc4`), all
authored by `2q9e`. Bounded study-planning defaults persist per account and
load/save through the signed-in calendar. The save route is same-origin and
authenticated, updates only planner fields in an existing preference row, and
rebases untouched local settings onto the latest server values. Empty numeric
inputs fail validation. Generated study sessions still open in the existing
review flow; saving defaults does not create events. The `C1-study0` solver
proposes up to 120 time-zone-aware sessions around timed/all-day events,
buffers, breaks, and weekly availability, rejecting past dates and preserving
explicit approval.

Local domain (65), presentation (63), and server (113) suites pass, along with
web lint, typecheck, and `git diff --check`. The PostgreSQL integration test
skipped because `CHRON_TEST_DATABASE_URL` is unset. GitHub Actions run
41432287345 passed on `c4f8bc4`, including lint, typecheck, calendar suites,
dependency audit, and production build. The HTTPS probe to
`https://testing.uwu.markets/calendar` returned a sign-in redirect with HSTS;
the runtime/deployment URL scan found no plain-HTTP URL.

Staging still runs release 6ddcaf1; neither new planner commit is deployed.
Read-only SSH authentication using the documented VPS access failed earlier,
so no deployment command ran and no VPS changes were made. Do not retry guessed
credentials. Deploy only Chron's release, migration 0017, release symlink, and
`chron-web.service` after authorized access is restored. Use only
`https://testing.uwu.markets`; do not edit other VPS files or services. No
authorized account is available, so signed-in planner persistence has not been
browser-verified.

Next actions:

1. Check completion of GitHub Actions for the latest `main` head; fix any
   migration, build, test, or dependency failures before continuing.
2. Once authorized VPS access is restored, fetch `main` over HTTPS and deploy
   only Chron's release, migration 0017, release symlink, and service. Verify
   the live HTTPS health check without touching unrelated VPS services.
3. Open `https://testing.uwu.markets` in the actual browser. Verify the
   signed-in planner only with an authorized test account; do not claim it is
   deployed or visually verified before then.
4. Update this handoff with the actual release ID and checks; keep C1 active
   and landing-page work paused.

## Current state

Chron is a standalone public repository on GitHub. The only branch is `main`,
and 2q9e pushes short commits over HTTPS. The branch includes the calendar's
recurrence exceptions, split-series editing, preferences, reminders, and
iCalendar export, plus a direct HTTPS source reader. The public tree contains
no AGENTS.md; local instructions remain untracked. No old calendar reference
folder was inspected or used.

Commits 2019687, 054f060, and b71d104 add public HTTPS retrieval, the signed-in
Research page, and a navigation entry. Commit 7217f34 adds source-reader
documentation and the dedicated CI test step. This feature reads a URL the user
provides; it does not search the web, assess source quality, synthesize
citations, use AI, or act as a complete research agent.

GitHub Actions run 41422411142 passed on b71d104, including migration 0016
PostgreSQL checks, lint, typecheck, dependency audit, and build. Run 41423159092
for 7217f34 also passed, including the dedicated Research suite (21 tests).
Those tests pass locally; typecheck and lint pass. Local production
compilation listed both new routes but emitted a Turbopack cache-write warning
during shutdown; hosted build passed. Local PostgreSQL integration skips
because `CHRON_TEST_DATABASE_URL` is unset.

GitHub Actions run 41423649691 passed on 6ddcaf1. The release fetched from
`https://github.com/2q9e/chron.git` passed the 21 Research tests, production
dependency audit (zero vulnerabilities), and production build on the VPS.

Staging now runs 6ddcaf1 at `/opt/chron/releases/6ddcaf1`. Migration 0016 and
the four table grants were applied atomically on the live Chron database over
verified PostgreSQL TLS, using the separate restricted migration role. Forced
RLS, the owner policy, and account-deletion cascade were verified. The deploy
changed only the Chron release directory, database migration/grant, release
symlink, and `chron-web.service`; no environment file, other VPS service, or
Cloudflare resource was changed. HTTPS `/sign-in` returns 200 with valid TLS
and HSTS; `/research` redirects to `/sign-in`; an unauthenticated same-origin
API POST returns 401. The actual HTTPS sign-in page and signed-out Research
redirect rendered in the in-app browser. No test account is available for
authenticated Research or source-fetch verification.

The Codex Security scan reviewed all 20 changed files from e6f43d4 to b71d104
and found zero reportable candidates. Review was sequential because this
runtime cannot enforce filesystem isolation for delegated agents. The live
runtime and migration roles were verified as separate, non-superuser, and
without `BYPASSRLS`; authenticated UI verification still needs an authorized
test account.

## Current milestone

C1 — calendar — and the first R1 retrieval slice are active. Landing-page work
remains paused. The calendar has
owner-scoped persisted events and preferences, including a validated custom
accent color with contrast correction and a reduced-motion preference, four
views, create/edit/delete, search, conflict review, finite recurrence with
full-series proposals and
approval, time-zone-aware reminders, and source-level drag/create/resize
interactions. Single-occurrence cancellation, reviewed restoration, and
reviewed per-occurrence movement are pushed on main. Migration 0012 gives
recurring segments a stable lineage root. This-and-following edits are pushed
and passed PostgreSQL CI validation for migration 0013.

The calendar now offers a real iCalendar download for the displayed date range.
It fetches fresh owner-scoped entries without caching and emits RFC 5545
content; recurring entries are exported as visible occurrences. Serializer
tests pass, but authenticated browser download verification remains open.

The reminder schema, migrations, repositories, and route contracts were
executed by CI; live mail delivery, scheduler deployment, and inbox receipt
remain unverified. Public signup remains closed, so do not simulate an account
or claim an authenticated user journey. External calendar synchronization is
not implemented.

The Research page is protected by Better Auth and offers URL entry, safe
retrieval metadata, an explicit untrusted-source notice, and escaped extracted
text. Its URL policy requires HTTPS, validates and pins public DNS answers,
revalidates redirects, and limits time and response size. Per-account quota is
persisted with forced RLS and account-deletion cascade. Details are in
docs/research/web-retrieval.md. No source text is saved or sent to AI.

## Product and security gates

- Read the local-only AGENTS.md if present, PLAN.md, PROGRESS.md, SKILLS.md,
  and the installed Next.js guidance before web changes. The generated
  apps/web/AGENTS.md is local-only and is excluded from public Git.
- Use only documented official Meta Model API inference if and when provider,
  legal, and operator gates permit it. Do not substitute another provider.
- Keep public signup and Meta key submission disabled. Written clarification
  or permission is required for Chron's BYOK flow and requested attribution.
  The processor/security terms remain unavailable behind an authenticated
  source; see docs/research/meta-api.md.
- No sample content, placeholders, stubs, fake demos, emoji, or nonfunctional
  controls belong in the product.
- The source-available license permits viewing but prohibits reuse. No
  prohibited reference folder was inspected or copied.
- GitHub quality run 41400318323 passed, including PostgreSQL 16 integration
  for migration 0010 and a clean production build.
  The workflow uses pinned actions and read-only repository permissions.
- Runtime tooling does not enforce per-agent filesystem/network isolation.
  Never provide secrets or private data to an agent; do not claim model
  identity unless the runtime confirms it.
- The staging host must always be accessed through
  https://testing.uwu.markets. Do not edit unrelated VPS services.

## Implementation checkpoint

- Calendar APIs: apps/web/app/api/calendar/; owner-scoped storage and
  recurrence/reminder behavior: apps/web/features/calendar/server/.
- Calendar UI: apps/web/features/calendar/presentation/; protected route and
  sign-in: apps/web/app/calendar/ and apps/web/app/sign-in/.
- Database migrations are in apps/web/db/migrations/. The CI integration
  script is apps/web/scripts/calendar-postgres.integration.test.mjs.
- PostgreSQL migrations and RLS behavior passed on an ephemeral CI database.
  Migration 0009 was also applied and catalog-verified on the Chron staging
  database. Do not simulate a session or claim authenticated persistence.
- Research source reader: `apps/web/app/api/research/web/read/`,
  `apps/web/features/research/server/`, `apps/web/app/research/`, and
  `apps/web/features/research/presentation/`; migration 0016 persists the
  owner-scoped quota. See `docs/research/web-retrieval.md`.
- Run 41423649691 passed on 6ddcaf1. The VPS release passed the 21 Research
  tests, zero-vulnerability production dependency audit, and production build.
- The `6ddcaf1` release is active. Migration 0016 and the minimal runtime
  grants were applied and catalog-verified on the live Chron database. HTTPS
  sign-in returns 200 with valid TLS/HSTS, `/research` redirects to sign-in,
  and the unauthenticated API returns 401. The real sign-in page rendered in a
  browser. Authenticated Research and live source-fetch verification remain
  open because no test account is available.
- Occurrence movement and following-series splitting are pushed on `main`;
  calendar source at `23606fc` passed run 41412546906, including PostgreSQL
  16 integration and the production build.
- Authenticated browser walkthrough, SMTP delivery, scheduler deployment, and
  Google calendar sync remain open.

## Prior landing checkpoint

- Landing source: `apps/web/features/landing/presentation/landing-story.tsx`;
  `/` currently redirects to `/calendar` while C1 is active.
- Story and anchors: `apps/web/features/landing/presentation/landing-story.tsx`.
- Story layout: `apps/web/features/landing/presentation/landing-story.module.css`.
- Scroll progress: `apps/web/features/landing/presentation/story-progress-bridge.tsx`.
- Lazy scene loader and scene: `apps/web/features/landing/world/WorldSceneLoader.tsx`,
  `WorldLayer.tsx`, `CalendarInstrument.tsx`, `WorldFallback.tsx`, and
  `world.css`.
- Shared visual tokens: `apps/web/styles/tokens.css` and
  `apps/web/styles/globals.css`.
- Audit findings and scores: `docs/audits/landing-page.md`.
- Meta policy report: `docs/research/meta-api.md`.

The scene provides the recurring calendar instrument, CSS fallback, reduced
motion behavior, demand rendering, visibility pausing, and WebGL failure
handling. LP-01 and LP-02 are fixed. A source review also found a broken
visibility-listener path when IntersectionObserver is missing; LP-06 is fixed
in source and independently re-reviewed, but that exact browser fallback is
not runtime tested. LP-03 and LP-04 remain open; LP-05 is partly addressed but
awaits narrow and zoom browser checks.

## Verification performed

- `npm run lint --workspace @chron/web` — passed.
- `npm run typecheck --workspace @chron/web` — passed.
- `npm run test:calendar-api --workspace @chron/web` — all 39 tests passed.
- `npm run test:calendar-time --workspace @chron/web` — all 7 tests passed.
- `npm run test:calendar-layout --workspace @chron/web` — all 17 tests passed
  for event layout, midnight clipping, spring-forward layout, search request
  validation, network failure, and cancellation.
- `npm run test:calendar-recovery --workspace @chron/web` — all 5 tests passed,
  including partial reconciliation failure and retry.
- `npm run test:auth-config --workspace @chron/web` — all 9 tests passed.
- `npm run test:agent-skills --workspace @chron/web` — all 11 tests passed.
- The HTTPS-only retrieval change tests the prepared research instructions and
  rejects HTTP citation URLs. Only the documentation, skill contract, and
  tests changed; no live web retrieval tool or staging deployment was added.
- `npm run build --workspace @chron/web -- --webpack` — passed with the search
  route, conflict route, protected calendar, and sign-in route included.
- The final build after the return-focus fix completed successfully; webpack
  reported cache-write `ENOSPC` warnings, so build-cache health is not verified.
- `npm run typecheck --workspace @chron/web` and `npm run lint --workspace
  @chron/web` — passed after search integration.
- Production route inspected in Chrome at 1230×480. Opening, Week, Study,
  Research, and closing chapters were viewed; in-page navigation, `#week`
  reload, and reverse navigation were tried. The scene was visible through
  the chapter gradients beside the copy. After the module split, the production
  Research view was reloaded and rechecked.
- No browser verification is claimed at mobile/tablet widths or 320px, 400%
  zoom, reduced motion, keyboard-only input, WebGL loss, or performance metrics.
  The independent landing audit was source-only; its configured model identity
  could not be independently confirmed.
- The sign-in UI was rendered at 1280px desktop and 390px mobile; mobile had no
  horizontal overflow and the form remained scroll-reachable. `/calendar` was
  opened with a synthetic local auth configuration and unreachable PostgreSQL;
  it displayed the account-service-unavailable state and did not load events.
  No login attempt, real session, or authenticated calendar behavior was tested.
- The latest production build was opened in Chrome at `/sign-in`; it showed the
  clear unconfigured PostgreSQL account-store state.
- `npm audit --omit=dev --audit-level=moderate` — passed with zero runtime
  dependency vulnerabilities. The full dependency audit has 11 moderate
  development-only `minimatch` denial-of-service advisories and no high or
  critical findings; avoid forced upgrades.
- After commit `9e46615`, calendar API tests passed (52), calendar time tests
  passed (28), and typecheck and lint passed. The recurrence repository check
  uses the existing in-memory database fixture; no PostgreSQL service or
  authenticated session was available.
- After `f66e449`, `npm run typecheck --workspace @chron/web` and
  `npm run lint --workspace @chron/web` passed. Calendar layout/API/time suites
  passed with 29/66/28 tests. The production build was not run because the
  workspace volume has only 58 MB free; authenticated recurrence behavior is
  still unverified without configured PostgreSQL/auth services.
- After `a906351`, calendar domain/time tests passed (39), typecheck passed, and
  lint passed. The current reminder increment passes calendar API/server (89),
  auth-config/email (14), scheduler (2), calendar time (39), layout (34), and
  recovery (5) tests, plus typecheck and lint. No production build was run
  because free disk space is low. No configured database, authenticated browser,
  migration execution, or SMTP delivery was verified.
- After `3b6028c`, calendar layout (42), time (39), and API (89) suites passed;
  typecheck and lint passed. The new movement interaction has source-level
  coverage only. The production build was skipped with 56 MB free, and no
  configured PostgreSQL/database account permits authenticated browser checks.
- After `833848a`, the calendar presentation suite passed 46 tests; typecheck,
  lint, and `git diff --check` passed. Time-slot creation is covered for normal,
  spring-forward, repeated-hour, and invalid inputs. No authenticated browser
  or database verification was available.
- After `590331f` and `c1d7647`, calendar presentation (51), API (89), and time
  (39) suites passed; typecheck, lint, and `git diff --check` passed. Resize
  tests cover timezone conversion, DST fold selection, the exact duration cap,
  and invalid targets. A production build and authenticated browser/database
  verification were unavailable.
- After `d122d05`, the calendar API/server suite passed 91 tests and the
  auth-configuration suite passed 14; typecheck, lint, and the production build
  passed. The build ran without `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, or
  `DATABASE_URL`. Build output was placed temporarily in `/tmp`, then the
  previous `.next` directory was restored and the temporary artifacts removed.
- At the 2026-11-01 checkpoint, the HTTPS staging DNS lookup failed. The current 2026-11-02 HTTPS route and TLS verification passed as recorded in Current state. Keep using HTTPS and do not edit unrelated VPS configuration.
- For the occurrence-cancellation increment, calendar API (97) and
  layout (53) tests, typecheck, lint, `git diff --check`, and the production
  build passed. The build used Webpack and a temporary `/tmp` output directory
  because the workspace volume was low on space. PostgreSQL CI run
  41396381582 passed; migration 0009 was applied to the Chron database. At
  that historical checkpoint, the staged release had not been switched active.
  HTTPS endpoints, TLS, and HSTS were verified publicly.

## Next actions

1. Keep AGENTS.md excluded and preserve the one-branch public history on `main`.
2. Complete authenticated calendar and iCalendar download browser verification
   when a test account is available; do not simulate an account.
3. Continue email delivery and scheduler work only when the authorized
   SMTP/Cloudflare configuration can be tested safely.
4. Before every push, inspect staged paths, scan the outgoing changes, and
   preserve the one-branch public history. Keep AGENTS.md out of Git.
