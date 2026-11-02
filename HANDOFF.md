# Handoff

## Current state

Chron is a standalone public repository on GitHub. The only remote branch is
`main`, and commits are pushed by 2q9e with short titles over HTTPS. The branch
contains occurrence cancellation, restoration, and reviewed movement of one
timed or all-day recurrence instance. Migration 0012 persists a stable series
root and backfills existing recurring events. Following-series splitting is
implemented and pushed with migration 0013.
The public tree contains no AGENTS.md; local operating instructions remain
untracked. No old calendar reference folder was inspected or used.

GitHub Actions run
https://github.com/2q9e/chron/actions/runs/41414536143 passed on commit
`dc031a3`, including PostgreSQL 16 migration and tenant-isolation checks, lint,
typecheck, calendar policy/auth/time/API/layout/recovery checks, HTTPS reminder
checks, dependency audit, and production build. Local calendar API (111),
layout/API client (60), and time/domain (48) suites pass; typecheck and lint
pass. PostgreSQL integration skips locally because `CHRON_TEST_DATABASE_URL`
is unset.

The testing site at https://testing.uwu.markets/sign-in was checked over HTTPS;
it returned 200 with valid TLS and HSTS in the earlier check. On 2026-11-02,
the HTTPS `/calendar` route redirected to `/sign-in`, and the sign-in interface
rendered in a real browser. The accent preference flow could not be tested
without an authenticated account. The `dc031a3` change is not deployed because
the private key path in the local login notes is unavailable in this
environment. No VPS or Cloudflare resources were changed.

## Current milestone

C1 — calendar — is active. Landing-page work remains paused. The calendar has
owner-scoped persisted events and preferences, including a validated custom
accent color with contrast correction, four views, create/edit/delete,
search, conflict review, finite recurrence with full-series proposals and
approval, time-zone-aware reminders, and source-level drag/create/resize
interactions. Single-occurrence cancellation, reviewed restoration, and
reviewed per-occurrence movement are pushed on main. Migration 0012 gives
recurring segments a stable lineage root. This-and-following edits are pushed
and passed PostgreSQL CI validation for migration 0013.

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
- The b01cbfe release is the version recorded as built and staged; activation
  of the current split change remains pending because the referenced SSH key
  is unavailable. HTTPS `/sign-in` returned 200 with HSTS in an earlier check;
  no other VPS service was changed.
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
  41396381582 passed; migration 0009 was applied to the Chron database. The
  staged release has not been switched active because SSH authentication is
  unavailable. HTTPS endpoints, TLS, and HSTS were verified publicly.

## Next actions

1. Make the SSH key referenced by the local deployment notes available to the
   local SSH agent. Then activate only the Chron release and restart only
   `chron-web.service`; do not alter unrelated VPS services.
2. Verify the active release and test
   https://testing.uwu.markets/sign-in and `/calendar` over HTTPS with valid
   TLS and HSTS. Keep authenticated browser verification open until a test
   account is available.
3. Keep AGENTS.md excluded and preserve the one-branch public history on `main`.
4. Keep the authenticated browser walkthrough open until a disposable account
   can be configured without exposing private credentials.
5. Continue email delivery and scheduler work only when the authorized
   SMTP/Cloudflare configuration can be tested safely.
6. Before every push, inspect staged paths, scan the outgoing changes, and
   preserve the one-branch public history. Keep AGENTS.md out of Git.
