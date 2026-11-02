# Progress

## Current checkpoint — 2026-11-02

`C1-category1` is pushed to the only GitHub branch, `main`, in four small
commits (`5808b3a`, `c74fb87`, `4161ee5`, and `2ab3047`), all authored by
`2q9e`. It adds six academic event categories with an additive nullable
migration. Existing
records are left unchanged. The client distinguishes an explicitly empty
category from a field omitted by an older API, omits unedited categories on
create/update, and retains “Leave category unchanged” while editing an older
event. Categories are displayed in the event editor, timeline, search results,
and series review. The feature is pushed but not deployed; staging remains on
release `6ddcaf1`.

Calendar domain (66), presentation (68), and server (115) tests pass, as do
typecheck, lint, and `git diff --check`. The authenticated capability route
keeps category entry unavailable against older releases and mutations
recheck support before category-bearing writes. The PostgreSQL integration
test was not run locally because `CHRON_TEST_DATABASE_URL` is unset. A
production build has not been run locally because the workspace volume has 93
MB free. GitHub Actions run `41436641635` passed the production build,
PostgreSQL tenant isolation and migration checks, test suites, lint, typecheck,
and dependency audit. Independent review drove fixes for mixed-version
category clearing, unchanged-field submissions, the legacy select’s revert
option, and the study-planner category preselection.
The independent read-only re-review found no remaining category blocker under
the documented single-service rollout and rollback constraints.

External, Git, and staging endpoints stay on HTTPS. Plain HTTP literals found
in the source scan are confined to loopback or negative security-test inputs;
no product fetch target or deployment URL uses HTTP. Staging remains on
release `6ddcaf1`. The documented SSH login was rejected in the read-only
preflight; no deployment command or VPS/Cloudflare configuration change ran.

## Latest checkpoint — 2026-11-02

`C1-study1` is implemented and pushed to the single GitHub `main` branch in
`097756e update`, `6213718 refine`, `fe970f9 fix`, and `c4f8bc4 fix`, all
authored as `2q9e`. Planner defaults persist in each account's existing
preferences row. The signed-in same-origin API validates the exact shape and
allowed ranges, and PostgreSQL constraints enforce those bounds. The planner
loads the defaults and saves them through a narrow update that cannot replace
newer calendar preferences from another tab. Empty numeric inputs remain
invalid; untouched local settings rebase onto the latest saved values while
intentional edits are preserved. Proposed events still require review and
approval.

Local calendar domain (65), presentation (63), and server (113) suites pass,
along with typecheck, lint, and `git diff --check`. The PostgreSQL integration
test skipped because `CHRON_TEST_DATABASE_URL` is unset. GitHub Actions run
41432287345 passed on `c4f8bc4`, including the full calendar suites, lint,
typecheck, dependency audit, and production build. The HTTPS staging probe to
`https://testing.uwu.markets/calendar` returned a sign-in redirect and HSTS;
the runtime/deployment URL scan found no plain-HTTP URL. Staging still serves
release 6ddcaf1; no new VPS deployment or unrelated VPS change was made. The
signed-in save flow has not been browser-verified without an authorized test
account.

`C1-study0` is implemented and pushed to the single GitHub `main` branch in
`d1b123f update`, `1b88ebb update`, `7315413 refine`, and `b11a677 improve`,
all authored by `2q9e`. The planner reads owner-scoped events over the same-
origin authenticated API, respects all-day events and padded timed events,
spreads sessions across the deadline, prevents past-time proposals, caps the
result at 120 sessions, reports unplaced time, and opens each proposal in the
existing conflict-review and explicit-save flow. Topic changes produce
distinct session identities. No AI call or direct database write occurs. The
calendar remains the active priority; the landing page stays paused.

Local verification: focused study-planner tests (10), calendar domain tests
(61), calendar presentation/API-client tests (61), full web lint, typecheck, and
`git diff --check` pass. GitHub run 41428623423 passed on commit b11a677. The
HTTPS sign-in route returns 200 with HSTS and renders the existing public
sign-in boundary, but staging still runs 6ddcaf1. The documented VPS login was
rejected during read-only access checks; no deployment command ran and no VPS
changes were made. Resume deployment after authorized VPS access is restored,
changing only Chron's release and service. No authorized test account is
available, so signed-in planner behavior and event persistence are not browser
verified.

## Current verified state — 2026-11-02

C1 — calendar — remains active and the landing page remains paused. The first
R1 source-reader slice is implemented on the single `main` branch through
6ddcaf1. Commits 2019687 and 054f060 added the bounded HTTPS reader, session-
protected same-origin API, owner-scoped quota, and migration 0016. Commit
b71d104 added the Research route and calendar entry; 7217f34 added retrieval
documentation and the dedicated CI step. This is direct URL reading only, not
web search, source quality evaluation, citation synthesis, AI analysis, or a
complete research agent.

GitHub Actions run 41422411142 passed on b71d104, including migration 0016
PostgreSQL integration checks, lint, typecheck, dependency audit, and build.
Run 41423159092 for 7217f34 passed, including the dedicated 21-test Research
step; run 41423649691 also passed on 6ddcaf1. Locally, the 21 Research tests,
typecheck, and lint pass. Local production compilation listed `/research` and
`/api/research/web/read` but emitted a Turbopack cache-write warning during
shutdown. The VPS release passed all 21 Research tests, a production dependency
audit with zero vulnerabilities, and a clean production build. Local PostgreSQL
integration skips because `CHRON_TEST_DATABASE_URL` is unset.

The active staging release is 6ddcaf1 at `/opt/chron/releases/6ddcaf1`.
Migration 0016 and the four table grants were applied atomically on the live
Chron database over verified PostgreSQL TLS. The migration and runtime roles
are separate, non-superuser, and lack `BYPASSRLS`; forced RLS, owner policy,
and account-deletion cascade were verified. HTTPS `/sign-in` returns 200 with
valid TLS and HSTS, `/research` redirects signed-out users to `/sign-in`, and
an unauthenticated API POST returns 401. The in-app browser rendered the
sign-in page and Research redirect. No authenticated test account is available,
so source retrieval and signed-in Research behavior remain unverified. Only
the Chron release directory, database migration/grants, release symlink, and
`chron-web.service` changed; no environment file, unrelated VPS service, or
Cloudflare resource was changed.

The Codex Security diff review examined all 20 changed files from e6f43d4 to
b71d104 and found no reportable candidates. It ran sequentially because the
runtime does not enforce filesystem isolation for delegated agents. Runtime DB
role attributes were verified during deployment; proxy/firewall configuration
and network egress remain unverified.

External services, Git remotes, and staging or production hosts use HTTPS.
HTTP appears only in loopback development and negative rejection tests. The
public tree has no AGENTS.md; local instructions remain untracked. No reference
folder was inspected or used. Commits continue on `main` only, with author
2q9e.

Occurrence movement and split-series behavior are implemented, pushed, and
verified by CI. Visible-range iCalendar export now includes RFC 5545 UTC timed
events, date-only all-day bounds, distinct occurrence UIDs, escaped text, and
UTF-8 line folding. Recurring instances export as the currently returned
occurrences; authenticated browser download testing remains open.
SMTP delivery, scheduler deployment, external calendar synchronization,
authenticated calendar browser verification, and end-to-end export verification
remain open.

The previously pushed cancellation slice binds the occurrence's original key
and series revision; approval persists an owner-scoped exception, cancels
pending or leased reminders, stales competing proposals, and hides the date
from listing and conflict checks. The current restore slice keeps exact-key
review and approval, compares only the selected occurrence against active
events and siblings, and refuses to queue a reminder if any revision already
attempted it. Migration 0010 and its PostgreSQL integration coverage passed in
CI. Release `e6f43d4` was active at that historical checkpoint; the previous
`b01cbfe` deployment history
is retained in later checkpoints.

## Prior implementation checkpoints

F0 — foundation documentation, the scrubbed fresh history, and repository
security are on public GitHub `main`; hosted checks and branch protection remain
unverified. C1 — calendar — is active at the user's direction. Landing-page
work is paused. Calendar reliability fixes and the bounded-search type
contract are pushed to the single public `main` branch through `dfe1f07`.
Bounded title search is implemented and pushed as API commit `afbef0e` and UI
commit `4a092e8`. Full-series request validation is pushed as `521990b` and
`8cda070`. No code or visual material was copied from another folder.

The latest recurrence increment is pushed to the single public `main` branch
through `f66e449 update`. It includes finite recurring-series creation,
whole-series update/delete proposals, conflict previews, explicit approval,
response validation, and user-scoped recovery after uncertain approvals.
Calendar layout/API/time suites (29/66/28), typecheck, and lint pass. These
repository checks do not replace live PostgreSQL or authenticated browser
verification.

C1 reminder policy and task dependencies are committed in `f75155f`; the tested
DST-aware schedule
calculator is committed through `a906351`. Event reminder choices and
transactional outbox persistence were pushed as `be722e9`. The current source
increment adds bounded delivery, verified-email checks, generic reminder
content, a protected internal route, and a Cloudflare Cron scheduler that calls
the fixed HTTPS staging endpoint. Commits `0aad4d9` and `aa5c9dc` add
type-specific editor choices, saved all-day time-zone preservation, and a
calculated local delivery-time preview. Commits `162f358`, `e50477b`,
`4b6eb42`, and `b0395ec` add an authenticated owner-scoped status read,
bounded sanitized delivery summaries, and editor status, retry, failure,
empty, and offline states. Status source is implemented; database-backed
delivery, SMTP, and staging remain unverified. Commit `42f789b` now enforces
HTTPS for non-loopback authentication origins in every environment; loopback
HTTP is accepted only for local development. Its 14 auth-configuration/email
tests, typecheck, and lint pass. Commit `3b6028c improve` adds one-off event
drag movement to month/day/week views, with a review editor, conflict preview,
15-minute time-grid snapping, preserved duration and timezone, and DST-aware
handling. Calendar layout/time/API suites (42/39/89), typecheck, and lint pass.
Commit `833848a improve` makes an empty day/week time-grid click open a timed
event draft at the selected 15-minute slot. The default duration is one elapsed
hour, with explicit choice of repeated DST times. Calendar presentation tests
(46), typecheck, and lint pass. Commits `590331f update` and `c1d7647 improve`
add a 15-minute end handle for longer, wide, one-off timed blocks in day/week
views. Resizing preserves the start and timezone, honors DST folds and the
366-day server limit, and opens the existing conflict-review editor for explicit
approval. Calendar presentation (51), API (89), and time (39) suites, typecheck,
lint, and `git diff --check` pass. Commit `d122d05 update` defers protected
reminder-route authentication/database initialization until after the bearer
check. The API suite now passes 91 tests, auth configuration passes 14, and
the production build succeeds without runtime authentication or database
settings. The authenticated browser interaction remained unverified at this earlier
checkpoint. See the current HTTPS staging and PostgreSQL verification state
above.
The source commits are on the single public `main` branch. Root `AGENTS.md`
remains local-only and is ignored; it was removed from the current public tree.
Public history had 631 non-merge commits immediately before this documentation
checkpoint; this checkpoint brings it to 632.

The focused Codex Security diff review covered all ten changed files from
`c7d9771` through `b0395ec` and found no source candidates. It was a sequential
parent review because isolated delegation was unavailable; authenticated
database, browser, SMTP, and staging checks remain open.

## Completed

- Created Chron as a separate project with its own Git history. No application
  code was copied in.
- Published the scrubbed fresh history to public GitHub `2q9e/chron`. The
  initial public publication contained exactly 533 commits from root through
  `main`; subsequent small pushes grew history past 600. No other local
  branches were published.
- Enabled GitHub secret scanning and push protection, Dependabot alerts and
  security updates, and private vulnerability reporting. Verified these settings
  through the repository API; branch protection remains to be checked after CI
  reports a hosted check name.
- Added .github/workflows/quality.yml with read-only permissions and
  SHA-pinned official checkout/setup-node actions. It runs install, lint,
  typecheck, calendar checks including a disposable PostgreSQL 16 tenant
  isolation integration test, production dependency audit, and build on pushes
  and pull requests. Run 41392185432 passed on 1785c06.
- Added `AGENTS.md`, the view-only source license, project roadmap, and initial
  continuation records.
- Integrated the 500-entry `SKILLS.md`. Independent root validation and final
  Luna MAX/Terra HIGH re-audits confirm sequential IDs, exact category totals,
  all eight fields in every entry, unique names, and no exact duplicate
  guidance. All SL-01–SL-18 findings are closed in text review; runtime and
  feature-specific checks remain future implementation requirements. The
  correction task reached its usage limit after editing, so the main agent
  integrated the result and reran the structural checks.
- Confirmed from current official Meta docs that the Model API exists at
  `https://api.meta.ai/v1`, uses bearer-key auth, and documents Responses,
  tool calling, search grounding, file inputs, and streaming.
- Completed an official-source Meta policy report in `docs/research/meta-api.md`
  and independently confirmed its central account/key/age/mark restrictions
  against the current Terms, key-sharing FAQ, age FAQ, and API reference. The
  current AUP and data commitments were also reviewed. The incorporated
  processor and security terms redirect to a blocked login, so their exact
  obligations remain unverified and are a launch gate.
- Recorded the landing-page art direction and copy constraints in
  `docs/design/landing-brief.md`; selected one recurring time instrument as the
  original 3D motif. No sample content or application references are used.
- Added the first Next.js route, self-hosted typeface, shared design tokens,
  responsive editorial story, and native-scroll progress bridge. The page
  contains no signup, Meta-key form, fake product demo, sample data, or
  nonfunctional controls.
- Integrated a lazy-loaded, demand-rendered Three.js/R3F calendar instrument
  that follows story scroll progress, pauses when hidden, and provides static
  fallback behavior. Geometry/motion, fallback, and lifecycle orchestration are
  split into focused modules. Chapter gradients reveal the same scene while
  keeping copy readable; competing static diagrams were removed.
- Independently reviewed the landing source and recorded scores, findings,
  fixes, and remaining verification in `docs/audits/landing-page.md`. LP-01,
  LP-02, and LP-06 are fixed in source. Motion/accessibility, narrow viewport,
  and forced no-IntersectionObserver runtime checks remain open, so L1 is not
  complete.
- Added the bridge's request/reply progress handshake, invalid-marker `null`
  state, reachable scroll-end mapping, and scoped structural observation.
- Ran `npm run lint --workspace @chron/web`, `npm run typecheck --workspace
  @chron/web`, and `npm run build --workspace @chron/web` after integrating the
  scene and latest layout changes; all passed. Next.js generated
  `apps/web/AGENTS.md` and updates `next-env.d.ts` during build/dev runs.
- Initial publication reached 533 non-empty, distinct commits after the full
  `main` history was rewritten to remove the two user-local path mentions.
  Reachable-history scans at publication reported zero remaining path matches
  and zero private-key, AWS-key, GitHub-token, or quoted credential assignment
  patterns. These regex checks are useful but not comprehensive.
- Implemented the first persisted calendar increment: owner-scoped event and
  preference APIs, Better Auth protected access, day/week/month/agenda views,
  event create/edit/delete, and saved display preferences. Event approval now
  includes a server-computed overlap review. Create/update recheck the reviewed
  overlap IDs and revisions under a per-owner PostgreSQL transaction lock and
  reject stale time-zone or conflict state. No real database or test account is
  configured, so persisted authenticated behavior is not yet runtime verified.
- Fixed timezone-aware Today, localized operation errors, loading notice
  priority, multi-day timed-event labels, and adjacent short-event collisions.
  Calendar create now uses owner-scoped idempotency and payload-free recovery
  keys. Save retries are locked to the reviewed payload, sign-out and settings
  cannot race an uncertain operation, focus waits for reload or uses a stable
  fallback, and one-minute events near midnight get full-size targets.
- Calendar API (39), time (7), layout/search (17), and create recovery (5) tests pass,
  as do lint, typecheck, and the production build. These are source-level
  checks; authenticated persistence remains unverified.
- Added owner-scoped event-title search with literal matching, date/type
  filters, a 93-day range bound, a 1,000-result limit, query timeout handling,
  an accessible result list, and event-editor handoff. API commit `afbef0e` and
  UI commit `4a092e8` are pushed to the single public `main` branch.
- Added strict create/update/delete full-series request parsing with finite
  recurrence rules, target revisions, duration bounds, full-series expansion
  validation, and rejection of unexpected fields. Commits `521990b` and
  `8cda070` are on the single public `main` branch. The production build, lint,
  typecheck, and calendar API suite (42 tests) pass.
- Implemented the reminder delivery worker in source. It leases bounded
  owner-scoped outbox batches, sends only to a currently verified address,
  records accepted/retry/permanent outcomes, and avoids logging recipient or
  provider data. The internal route requires a long bearer secret; the
  Cloudflare Cron worker targets only `https://testing.uwu.markets` with
  redirects disabled. Public email links reject HTTP origins. Runtime delivery,
  migration execution, and end-to-end delivery remain unverified. The editor
  offers type-specific choices, calculated local-time review, and a private
  owner-scoped status panel. Status exposes counts and sanitized failure
  categories, never recipient addresses, event content, or raw SMTP errors.

## Open work

- Continue making small reviewed commits on the single public main branch;
  inspect staged paths and scan outgoing history before each push.
- Verify recurrence exception and split-series interactions in an authenticated
  browser when a test account and authorized deployment access are available.
  PostgreSQL CI confirms migration 0013 and split behavior; preserve exact owner
  scope, target revision, conflict recheck, time-zone behavior, and approval.
- Verify authenticated calendar interactions in a real browser when a
  disposable account is available. Signup remains intentionally closed.
- Complete the separately gated delivery work: live SMTP acceptance,
  scheduler deployment, and external calendar synchronization.
- Deploy app-source iterations only to https://testing.uwu.markets using the
  user-authorized Chron-specific VPS and Cloudflare resources. Use HTTPS for
  every public and staging request; leave unrelated VPS services alone.
- Do not add signup or Meta-key controls until related policy and operator
  gates are cleared and the flows are real.
- Obtain qualified review of the integrated Meta report; inspect the
  incorporated processor/security terms through an authorized source before
  launch.
- Landing work remains paused at the user's direction. Resume its narrow,
  tablet, zoom, keyboard, reduced-motion, WebGL fallback, and performance review
  only when reprioritized.

## Known constraints

- This runtime cannot enforce per-agent filesystem or network sandboxes; task
  worktrees are coordination boundaries only. Remote GitHub currently exposes
  only `main`; do not publish task worktree branches.
- The active root session model is fixed by the runtime. Spawnable development
  agents can use the requested Luna MAX and Terra HIGH settings.
- Meta's current terms require integrated-product end users to be 18+, prohibit
  sharing API keys outside the issuing team without permission, and grant no
  trademark licenses. Written clarification/permission is outstanding for
  Chron's user-key flow and requested attribution. Do not accept user keys or
  publish Meta-branded attribution until resolved.
- The Meta report is integrated. Current first-party Terms, key-sharing and age
  help pages, API documentation, AUP, and public data commitments were reviewed.
  The incorporated processor/security terms could not be inspected because
  their links redirected to a blocked login. Their exact obligations remain
  unverified.
- Operator legal identity, deployment, retention, pricing, and data-protection
  obligations are not established. Public registration remains disabled.
- Public GitHub has only `main` published and more than 500 non-empty commits.
  The calendar API, auth route, sign-in screen, calendar views, overlap review,
  idempotent event creation, bounded search, recurrence parsing and approval
  flow, and series expiry worker are included. Never count empty or duplicate
  commits toward the requested total.
- The 3D scene is integrated. L1 remains incomplete because narrow viewport,
  reduced motion, keyboard, fallback, and performance review remain.

## Verification performed

- Reviewed the direction-tool script before running it, confined its state to
  ignored `.taste-skill/`, and generated the local direction sheet with a fixed
  seed. This is design planning, not application testing.
- Checked Meta policy claims against current first-party pages. The report
  identifies remaining legal and account-level verification work, including
  linked incorporated terms not available without an authenticated source.
- Landing lint, TypeScript, and production-build checks passed after the scene
  module split and visibility-fallback fix.
- For the current calendar increment, calendar API passed all 39 tests, time
  all 7, layout/search all 17, recovery all 5, auth-config all 9, and
  agent-skills all 10. Lint, typecheck, and the production build passed.
- Added and typechecked the shared calendar search request/response contract at
  `dfe1f07`; integrated and pushed the API and UI in `afbef0e` and `4a092e8`.
- Search verification passed: API (39), time (7), layout/search (17), and
  recovery (5) tests, typecheck, lint, production webpack build, and diff check.
  Independent review found no concrete query/UI defect. The reviewer identified
  that the in-memory owner test does not prove real PostgreSQL/RLS isolation;
  this remains open because no PostgreSQL client, service, database URL, or
  account is available. Authenticated calendar search has not been browser-tested.
- A final accessibility review found that editor close focus would leave the
  search context. The integrated change now stores and restores focus to the
  persistent search heading; the source re-review confirmed the correction.
  The 17-test layout/search suite, lint, typecheck, and production build pass
  after that change. Webpack emitted cache `ENOSPC` warnings but completed the
  build. Authenticated keyboard behavior is not runtime verified.
- Reviewed the outgoing diff from `origin/main`, checked `git diff --check`,
  scanned staged and outgoing content for common secret patterns, and pushed to
  `origin/main`. The remote exposes only `main`; the latest calendar changes
  were pushed as ordinary commits by the configured `2q9e` author. The remote
  continues to have more than 500 non-empty commits.
- Inspected the real sign-in route in the browser at desktop and 390px mobile
  widths. The form remained usable with no horizontal overflow. With only a
  synthetic local auth configuration and an unreachable local PostgreSQL
  endpoint, `/calendar` rendered its account-service-unavailable state without
  loading calendar data. No sign-in submission or authenticated persistence is
  claimed.
- The latest production build also rendered `/sign-in` in Chrome and showed
  the account-store-unconfigured state. The calendar route continues to fail
  closed without loading private events.
- `npm audit --omit=dev --audit-level=moderate` — passed with zero runtime
  dependency vulnerabilities.
- The GitHub Actions workflow YAML parsed successfully at this earlier checkpoint. The later hosted run 41392185432 passed on 1785c06.
- After `f66e449`, typecheck and lint passed; calendar layout/API/time suites
  passed (29/66/28), including terminal proposal replay and approval-recovery
  coverage. The production build and authenticated recurring-series workflow
  were not run because disk space and database/auth configuration are
  unavailable.
- After `a906351`, `npm run test:calendar-time --workspace @chron/web` passed
  with 39 tests, including all timed minute offsets, DST local-day behavior,
  all-day timezone choices, and invalid choice/time combinations.
  `npm run typecheck --workspace @chron/web` and `npm run lint --workspace
  @chron/web` passed. No production build, database, authenticated browser, or
  reminder delivery has been verified.
- At that earlier reminder checkpoint, calendar API/server tests (89), auth
  config/email tests (14), scheduler tests (2), calendar time (39), layout (34),
  and recovery (5) passed. The HTTPS staging DNS check and PostgreSQL runtime
  check were later completed as described in the current verified state above.
  SMTP delivery and authenticated browser behavior remain open.
- Rendered the production build in Chrome at an available 1230×480 desktop
  viewport. Inspected opening, Week, Study, Research, and closing sections;
  tested chapter navigation, `#week` reload, and reverse navigation. The scene
  is visible beside copy in the chapter gradients. After the module split and
  lifecycle fix, Research was reloaded and visually inspected at the same
  viewport. No mobile/tablet, 320px, zoom, keyboard, reduced-motion, WebGL
  fallback, no-IntersectionObserver runtime, or performance test is claimed.
  See `docs/audits/landing-page.md`.
- Commit `09c6b56 adjust` changes the agent's safe-retrieval contract and S175
  to require public HTTPS sources. The citation validator rejects plain-HTTP
  links, and the agent-skill suite passes all 11 tests. This instruction-level
  change does not add or claim a live web retrieval implementation.
