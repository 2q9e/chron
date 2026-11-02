# Handoff

## Current state

Chron is a standalone repository on one published branch, public GitHub
`main`. Remote and local `main` matched at the last checked code push; public
`main` has 584 purposeful commits after this handoff update.
The calendar API, protected route, sign-in, views, preferences, and conflict
review are pushed. Idempotent event creation, safe recovery, reload-safe focus,
and accessible short-event targets were pushed as `f304c19` and `ec93688`;
the calendar search contract was pushed as `dfe1f07`; search API and UI were
pushed as `afbef0e` and `4a092e8`. The latest recurrence parser changes were
pushed as `521990b` and `8cda070`.
Secret scanning, push protection, Dependabot alerts and
security updates, and private vulnerability reporting are enabled. Continue
reviewing staged paths and scans before every push. Do not commit root
`AGENTS.md` or any old reference material.

## Current milestone

C1 — calendar — is active; landing-page work is paused at the user's direction.
The current increment includes owner-scoped event and preference persistence,
existing-account sign-in, protected routing, four calendar views, event
create/edit/delete, theme and display preferences, and a server-side overlap
check shown before manual approval. The latest increment makes create
retries idempotent, saves only user-scoped opaque recovery keys in browser
storage, preserves uncertain requests for reconciliation, and restores focus
after reload. Bounded title search is implemented. Finite recurring-series
creation, review, update, delete, explicit approval, and uncertain-approval
recovery are implemented and pushed through `f66e449` on the single public
`main` branch. Reminders, drag scheduling, external sync, database-backed
runtime verification, and a real authenticated browser walkthrough remain open.
C-01 through C-14 have
source-level fixes recorded in the audit; C-15 tracks unverified PostgreSQL
owner isolation and C-16 records the source-fixed return-focus issue. Rendered
and database-backed verification remains pending.

## Product and security gates

- Read `AGENTS.md`, `apps/web/AGENTS.md`, `PLAN.md`, `PROGRESS.md`, and
  `SKILLS.md` before continuing web work. The installed Next.js package is
  hoisted to root `node_modules/next`; this install does not include
  `dist/docs/`. For version-specific Next APIs, consult official current docs
  and inspect the installed package rather than relying on assumptions.
- Use only documented official Meta Model API inference if and when the
  provider, legal, and operator gates permit it. Do not substitute another
  inference provider.
- Keep public signup and Meta key submission disabled. Written clarification
  or permission is needed for Chron's BYOK flow and requested attribution.
  Current Meta terms impose age, jurisdiction, data, and agent-oversight rules;
  see `docs/research/meta-api.md`. The linked processor/security terms remain
  unverified behind an authenticated source.
- The repo’s source-available license permits viewing and prohibits copying.
  No prohibited local calendar reference was inspected or copied. The user
  supplied Pear and Shore pages for visual review; no site assets, copy, or
  layouts were copied.
- `.github/workflows/quality.yml` defines read-only CI for lint, typecheck,
  production dependency audit, and build. It uses full-SHA pins for official
  checkout/setup-node actions. The YAML parses locally; GitHub currently reports
  no workflow run, so hosted CI is unverified. Calendar time and API suites now
  exist and pass locally; live PostgreSQL integration remains unverified.
- Do not add samples, placeholders, stubs, fake demos, or nonfunctional
  controls to the product.
- `docs/audits/calendar-page.md` records independent visual and security
  reviews, scores, source-level fixes, and verification limits. No authenticated
  database session is available for rendered calendar verification.
- This runtime does not enforce per-agent filesystem or network sandboxes.
  Worktrees are coordination boundaries only; never provide secrets or private
  data to agents. Requested agent model settings were assigned, but this
  runtime does not independently attest model identity.

## Implementation checkpoint

- Calendar API: `apps/web/app/api/calendar/`, including the conflict check at
  `apps/web/app/api/calendar/events/conflicts/route.ts`.
- Calendar database schema: `apps/web/db/migrations/0002_calendar.sql`.
- Create recovery ledger: `apps/web/db/migrations/0004_calendar_create_requests.sql`.
- Calendar server validation and storage: `apps/web/features/calendar/server/`.
- Calendar interface: `apps/web/features/calendar/presentation/`.
- Authenticated calendar route and existing-account sign-in:
  `apps/web/app/calendar/`, `apps/web/app/sign-in/`.
- The runtime has no configured PostgreSQL/auth environment and no test
  account. Do not simulate a session or claim authenticated persistence is
  verified.
- The recurrence request parser validates exact full-series create, update,
  and delete scopes, finite bounded rules, dates, durations, and revisions.
  Event reads round-trip validated finite recurrence rules. The signed-in
  editor creates user-scoped, idempotent proposals; review presents the current
  and proposed occurrences with conflict evidence; approval is a separate
  explicit action. Normal one-off event edits/deletes continue to reject series
  targets. Approval recovery stores only opaque draft IDs scoped to the signed-
  in user and retries the same idempotent approval after an uncertain result.
  Source tests pass, but the database-backed and authenticated browser path is
  not verified in this environment.
- The user requested staging at `https://testing.uwu.markets` through the
  supplied VPS and Cloudflare setup, without changing other VPS services.
  An HTTPS-only request could not resolve the hostname, and Cloudflare shows no
  `testing.uwu.markets` DNS record. The tunnel route is also absent. No DNS,
  tunnel, VPS, or service changes were made. Do not use HTTP; retry after the
  staging route is configured and reachable over HTTPS.
- Event create/update require an explicit user review. The server recalculates
  overlaps and compares the submitted `(id, revision)` snapshot inside the same
  owner-serialized transaction as the write. The configured time zone is also
  checked inside that transaction. Conflict-set or time-zone changes return 409
  for a fresh review. Every calendar writer must continue through this
  repository path. Agent/bulk writes do not exist; persisted draft approval is
  required before they are added.

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
- `npm run test:agent-skills --workspace @chron/web` — all 10 tests passed.
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
- Staging was checked with HTTPS only. DNS lookup failed; the Cloudflare zone
  is active but has no `testing.uwu.markets` DNS record. No hosting changes
  were made.

## Next actions

1. Configure a disposable PostgreSQL test database/account, apply the auth and
   calendar migrations, and verify two-account search isolation plus the full
   authenticated calendar in desktop/mobile browsers.
2. Verify recurring-series create/update/delete against a disposable PostgreSQL
   database and authenticated browser session; retain the current explicit
   proposal and approval boundary.
3. Continue C1 with reminders, drag scheduling, and external calendar sync
   while keeping landing work paused.
4. Resume remaining landing browser checks only when the user reprioritizes it.
5. Before every push, inspect staged paths and rescan staged content and commit
   history for secrets and excluded material.
