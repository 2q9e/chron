# Handoff

## Current state

Chron is a standalone public repository on GitHub. The only remote branch is
main, and changes are pushed by 2q9e with short commit titles. The latest
source change is 1785c06, adding a real PostgreSQL tenant-isolation workflow.
The current public tree contains no AGENTS.md; local operating instructions
remain ignored. No old calendar reference folder was inspected or used.

GitHub Actions run
https://github.com/2q9e/chron/actions/runs/41392185432 passed. CI applied the
ordered migrations to an ephemeral PostgreSQL 16 service and verified forced
RLS, owner-separated repository results, transaction-local context reset,
cross-owner read/write rejection, and deletion cascades. This confirms the
migration and isolation behavior in CI only; it is not a configured staging or
production database.

The app's latest staged release is 52d8efd at
https://testing.uwu.markets. HTTPS sign-in returned 200; the protected
calendar route redirected to sign-in. TLS verification and HSTS passed. No
test account is available, so authenticated calendar interactions are not
verified. The CI-only change made no VPS or Cloudflare edits.

## Current milestone

C1 — calendar — is active. Landing-page work remains paused. The calendar has
owner-scoped persisted events and preferences, four views, create/edit/delete,
search, conflict review, finite recurrence with full-series proposals and
approval, time-zone-aware reminders, and source-level drag/create/resize
interactions. The next calendar increment is recurrence exceptions and
split-series edits.

The reminder schema, migrations, repositories, and route contracts were
executed by CI; live mail delivery, scheduler deployment, and inbox receipt
remain unverified. Public signup remains closed, so do not simulate an account
or claim an authenticated user journey. External calendar synchronization is
not implemented.

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
- GitHub quality run 41392185432 passed, including PostgreSQL 16 integration.
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
  There is no staging database or authenticated test account. Do not simulate
  a session or claim authenticated persistence in the running app.
- The current staging release is 52d8efd. HTTPS sign-in and the protected
  route redirect were checked with certificate validation; no VPS resource was
  changed during the latest CI-only iteration.
- Recurrence exceptions/split edits, authenticated browser walkthrough,
  SMTP delivery, scheduler deployment, and Google calendar sync remain open.

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

## Next actions

1. Implement recurrence exception and split-series operations through the
   existing owner-scoped proposal, conflict-review, and explicit approval
   pipeline. Add deterministic domain, API, and PostgreSQL coverage.
2. Run CI on the single main branch and review the real migration behavior.
   Keep the authenticated browser walkthrough open until a disposable account
   can be configured without exposing private credentials.
3. Continue email delivery and scheduler work only when the authorized
   SMTP/Cloudflare configuration can be tested safely.
4. Deploy each verified app-source increment to
   https://testing.uwu.markets over HTTPS, using only Chron-specific VPS
   resources. Do not alter unrelated services.
5. Before every push, inspect staged paths, scan the outgoing changes, and
   preserve the one-branch public history. Keep AGENTS.md out of Git.
