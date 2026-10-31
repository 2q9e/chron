# Handoff

## Current state

Chron is a standalone repository on one published branch, public GitHub
`main`. Remote and local `main` match and contain more than 500 purposeful
commits.
The calendar API, protected route, sign-in, views, preferences, and conflict
review are pushed. Secret scanning, push protection, Dependabot alerts and
security updates, and private vulnerability reporting are enabled. Continue
reviewing staged paths and scans before every push. Do not commit root
`AGENTS.md` or any old reference material.

## Current milestone

C1 — calendar — is active; landing-page work is paused at the user's direction.
The current increment includes owner-scoped event and preference persistence,
existing-account sign-in, protected routing, four calendar views, event
create/edit/delete, theme and display preferences, and a server-side overlap
check shown before manual approval. Recurrence, reminders, drag scheduling,
search, external sync, database-backed runtime verification, and real
authenticated browser walkthrough remain open. The current calendar audit also
tracks three open issues: idempotent create retry, focus after reload, and a
full-size target for short events near midnight.

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
- `docs/audits/calendar-page.md` records the independent visual and security
  reviews, scores, evidence, closed findings, and the current three open
  findings. Source review confirmed timezone-aware Today, localized errors,
  loading priority, and multi-day labels; it found a possible duplicate after
  an uncertain create response plus two remaining accessibility issues.
- This runtime does not enforce per-agent filesystem or network sandboxes.
  Worktrees are coordination boundaries only; never provide secrets or private
  data to agents. Requested agent model settings were assigned, but this
  runtime does not independently attest model identity.

## Implementation checkpoint

- Calendar API: `apps/web/app/api/calendar/`, including the conflict check at
  `apps/web/app/api/calendar/events/conflicts/route.ts`.
- Calendar database schema: `apps/web/db/migrations/0002_calendar.sql`.
- Calendar server validation and storage: `apps/web/features/calendar/server/`.
- Calendar interface: `apps/web/features/calendar/presentation/`.
- Authenticated calendar route and existing-account sign-in:
  `apps/web/app/calendar/`, `apps/web/app/sign-in/`.
- The runtime has no configured PostgreSQL/auth environment and no test
  account. Do not simulate a session or claim authenticated persistence is
  verified.
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
- `npm run test:calendar-api --workspace @chron/web` — all 17 tests passed.
- `npm run test:calendar-time --workspace @chron/web` — all 7 tests passed.
- `npm run test:calendar-layout --workspace @chron/web` — all 3 tests passed
  for adjacent short events, midnight clipping, and spring-forward layout.
- `npm run test:auth-config --workspace @chron/web` — all 9 tests passed.
- `npm run test:agent-skills --workspace @chron/web` — all 10 tests passed.
- `npm run build --workspace @chron/web` — passed with the calendar API,
  conflict route, protected route, and sign-in route included.
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
- `npm audit --omit=dev --audit-level=moderate` — passed with zero runtime
  dependency vulnerabilities. The full dependency audit has 11 moderate
  development-only `minimatch` denial-of-service advisories and no high or
  critical findings; avoid forced upgrades.

## Next actions

1. Configure a disposable PostgreSQL test database/account, apply both
   migrations, and run authenticated persistence, isolation, and browser
   walkthroughs.
2. Fix the three open calendar findings; create retries must replay one exact
   approved payload without duplicating rows.
3. Continue C1 with bounded title search, recurrence, reminders, and drag
   scheduling while keeping landing work paused.
4. Retain persisted, payload-bound draft approval before agent or bulk
   integration can write calendar records.
5. Resume remaining landing browser checks only when the user reprioritizes it.
6. Before every push, inspect staged paths and rescan staged content and commit
   history for secrets and excluded material.
