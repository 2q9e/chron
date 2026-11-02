# Progress

## Current milestone

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
delivery, SMTP, and staging remain unverified. All work remains on the same
`main` branch; this documentation checkpoint brings public history to 615
non-merge commits.

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
- Added `.github/workflows/quality.yml` with read-only permissions and
  SHA-pinned official checkout/setup-node actions. It runs install, lint,
  typecheck, production dependency audit, and build on pushes and pull requests.
  The YAML parses locally. GitHub currently reports no workflow runs, so hosted
  CI remains unverified.
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

- Continue making small reviewed commits on the single public `main` branch;
  inspect staged paths and scan outgoing history before each push.
- Configure a disposable PostgreSQL test database/account, apply the auth and
  calendar migrations, then verify real persistence, ownership isolation, and
  authenticated calendar interactions in a browser. Migration `0004` is not
  applied to a database in this environment.
- Continue C1 at C1-rmd4: independently review reminder behavior and close
  remaining source-level issues. Reminder choices, schedule preview, persisted
  status read and UI, outbox, delivery worker, internal route, and HTTPS
  scheduler are implemented in source and locally tested. Live PostgreSQL
  execution, SMTP delivery, and rendered browser behavior remain unverified.
  Drag scheduling and external calendar synchronization remain later work.
  PostgreSQL ownership and authenticated browser verification remain open.
- Deploy each verified iteration to `https://testing.uwu.markets` using only
  the user-authorized Chron-specific VPS and Cloudflare resources. Rechecked
  over HTTPS on 2026-11-01: DNS resolution still fails and Cloudflare has no
  `testing.uwu.markets` DNS record. No remote change was made. Continue to use
  HTTPS only for staging checks and public access; do not fall back to HTTP.
- Keep each reviewed change small, commit it, and push it to public `main` only
  after reviewing the staged paths and history scan.
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
- The GitHub Actions workflow YAML parses successfully. GitHub currently shows
  no Actions run, so the hosted `quality / verify` result is pending.
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
- Current reminder source verification: calendar API/server tests (89), auth
  config/email tests (13), scheduler tests (2), calendar time (39), layout (34),
  and recovery (5) pass. Typecheck and lint pass. The HTTPS probe to the staging
  hostname cannot resolve because its DNS record is absent. No database,
  scheduler deployment, SMTP send, or browser reminder flow was exercised.
- Rendered the production build in Chrome at an available 1230×480 desktop
  viewport. Inspected opening, Week, Study, Research, and closing sections;
  tested chapter navigation, `#week` reload, and reverse navigation. The scene
  is visible beside copy in the chapter gradients. After the module split and
  lifecycle fix, Research was reloaded and visually inspected at the same
  viewport. No mobile/tablet, 320px, zoom, keyboard, reduced-motion, WebGL
  fallback, no-IntersectionObserver runtime, or performance test is claimed.
  See `docs/audits/landing-page.md`.
