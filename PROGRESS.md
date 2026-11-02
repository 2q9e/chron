# Progress

## Current milestone

F0 — foundation documentation, the scrubbed fresh history, and repository
security are on public GitHub `main`; hosted checks and branch protection remain
unverified. C1 — calendar — is active at the user's direction. Landing-page
work is paused. Calendar reliability fixes and the bounded-search type
contract are pushed to the single public `main` branch through `dfe1f07`.
Bounded title search is implemented and pushed as API commit `afbef0e` and UI
commit `4a092e8`. Full-series request validation is pushed as `521990b` and
`8cda070`; persisted series proposals and approvals remain unfinished. No code
or visual material was copied from another folder.

The latest calendar increment, `9e46615 update`, is on the single public
`main` branch (584 non-empty commits after this progress update). Event reads
now include validated finite recurrence rules, and ordinary single-event
edits/deletes reject series targets until the reviewed series workflow is
implemented. Calendar API (52), calendar time (28), typecheck, and lint pass.
These repository tests do not replace live PostgreSQL or authenticated browser
verification.

## Completed

- Created Chron as a separate project with its own Git history. No application
  code was copied in.
- Published the scrubbed fresh history to public GitHub `2q9e/chron`. The
  GitHub compare API confirms exactly 533 commits from root through `main`;
  no other local branches were published.
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

## Open work

- Continue making small reviewed commits on the single public `main` branch;
  inspect staged paths and scan outgoing history before each push.
- Configure a disposable PostgreSQL test database/account, apply the auth and
  calendar migrations, then verify real persistence, ownership isolation, and
  authenticated calendar interactions in a browser. Migration `0004` is not
  applied to a database in this environment.
- Continue C1 with recurrence, reminders, drag scheduling, and external
  calendar synchronization. Search code is integrated; PostgreSQL ownership
  and authenticated browser verification remain open.
- Deploy each verified iteration to `https://testing.uwu.markets` using only
  the user-authorized Chron-specific VPS and Cloudflare resources. DNS and the
  tunnel route are not configured yet; an HTTPS request could not resolve the
  hostname, and Cloudflare has no `testing.uwu.markets` DNS record. No remote
  change was made. Use HTTPS only for all staging checks and public access.
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
- Public GitHub `main` has 584 non-empty commits, with only `main` published.
  The calendar API, auth route, sign-in screen, calendar views, overlap review,
  idempotent event creation, bounded search, recurrence parsing, and series
  expiry worker are included. Never count empty or duplicate commits toward
  the requested total.
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
  now has 563 non-empty commits.
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
- Rendered the production build in Chrome at an available 1230×480 desktop
  viewport. Inspected opening, Week, Study, Research, and closing sections;
  tested chapter navigation, `#week` reload, and reverse navigation. The scene
  is visible beside copy in the chapter gradients. After the module split and
  lifecycle fix, Research was reloaded and visually inspected at the same
  viewport. No mobile/tablet, 320px, zoom, keyboard, reduced-motion, WebGL
  fallback, no-IntersectionObserver runtime, or performance test is claimed.
  See `docs/audits/landing-page.md`.
