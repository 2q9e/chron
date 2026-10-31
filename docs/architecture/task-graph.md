# Foundation and landing-page task graph

This is the active dependency graph. Independent work stays in separate
worktrees with a named owner per file. The runtime does not technically
sandbox those worktrees; agents receive no credentials or personal data.

## Dependency graph

```text
F0-a 500-skill authoring ── F0-c independent skill audits ─ F0-c1 corrections ─ F0-c2 re-audit ─ F0-c3 corrections ─ F0-c4 final re-audit ─┐
F0-b Meta policy research ── F0-b2 AUP/terms review ─────┼─ F0 gate ─┬─ L1-a design system and page shell
F0-d CI and repository safety ────────────────────────────┘           └─ L1-b persistent 3D scroll world
L1-a, L1-b ── L1-c independent integration review ── L1-d remediation ── L1-e browser verification
```

L1-a and L1-b may start together after the architecture boundary is agreed and
F0 is complete. Their owned files do not overlap. The main agent owns shared
package manifests, lockfiles, routing integration, and final merges.

The first independent implementation review found integration issues in the
progress handshake, fail-closed behavior, reduced-motion initialization, and
layer order. L1-d addresses bridge and scene lifecycle behavior in their
separate owned files. L1-e depends on those fixes and on the main agent's route
and layer integration; it includes browser checks at desktop and mobile sizes.

## Task contracts

### F0-a — author the skill library

- **Assigned agent:** `/root/skills_curator`
- **Required model:** GPT-6 Luna, MAX reasoning (requested at spawn; actual runtime identity is not independently exposed)
- **Dependencies:** Bootstrap `AGENTS.md` and `PLAN.md`
- **Owned files:** `SKILLS.md` only
- **Read-only files:** `AGENTS.md`, `PLAN.md`
- **Required skills:** the project's security, engineering, and documentation
  skill definitions, selected after the complete library is authored
- **Security permissions:** the assigned task worktree is a coordination
  convention, not a filesystem sandbox. No credentials, personal data, other
  project folders, or reference material are provided; no network is needed;
  no commit or push
- **Acceptance criteria:** exactly 500 distinct entries; exact category counts
  from `PLAN.md`; every entry contains all eight required fields; useful,
  technically actionable content without duplicates or filler
- **Verification:** deterministic ID/count/category/field validation, duplicate
  and quality review, independent audit before integration
- **Expected deliverable:** complete `SKILLS.md` and a validation summary

### F0-b — research official Meta API and policy boundaries

- **Assigned agent:** `/root/meta_api_research` (completed report; main-agent
  source review remains in progress)
- **Required model:** GPT-6.1 Terra, HIGH reasoning (requested at spawn; actual runtime identity is not independently exposed)
- **Dependencies:** bootstrap project policy
- **Owned files:** `docs/research/meta-api.md`
- **Read-only files:** `AGENTS.md`, `SKILLS.md`, `PLAN.md`
- **Required skills:** provider-policy verification and credential security
- **Security permissions:** official Meta domains only; no credentials, account
  access, live inference, personal data, or unrelated directories; no commit or
  push. The runtime cannot technically enforce filesystem or network isolation.
- **Acceptance criteria:** dated first-party source links, verified facts
  separated from inference, no unsupported assurance, launch gates listed
- **Verification:** main-agent review against the current official Terms,
  account/key/age help pages, and API reference; remaining policy pages must be
  checked before launch
- **Expected deliverable:** `docs/research/meta-api.md`

### F0-b2 — review the Meta AUP and incorporated terms

- **Assigned agent:** `/root/meta_api_research`, GPT-6.1 Terra HIGH (runtime
  confirmed)
- **Dependencies:** F0-b draft and authoritative Chron rules
- **Owned files:** `docs/research/meta-api.md` in the task worktree
- **Read-only files:** Chron `AGENTS.md`, `PLAN.md`, and the report
- **Required skills:** official-source verification, policy review, and data
  retention/security review
- **Security permissions:** public Meta sources only; no account/API calls,
  credentials, user data, or reference materials; no commit or push. This
  runtime does not enforce per-agent filesystem/network boundaries.
- **Acceptance criteria:** education, research, provenance, agent-action and
  sensitive-data restrictions are recorded; incorporated terms are inspected
  where accessible; unavailable terms are explicitly marked unverified
- **Verification:** main-agent review of URLs, dates, and the distinction
  between source-confirmed facts and product decisions
- **Expected deliverable:** revised report and source URLs

### F0-c — independent skill-library audits

- **Assigned agents:** GPT-6 Luna MAX (primary) and GPT-6.1 Terra HIGH
  (independent second opinion); both completed
- **Dependencies:** F0-a complete
- **Owned files:** review findings only, outside the project tree
- **Read-only files:** `AGENTS.md`, `PLAN.md`, and all of `SKILLS.md`
- **Required skills applied:** S107, S119, S120, S156, S157, S189, S193, S243,
  S265, S269, S419, S494
- **Security permissions:** read-only review; no credentials, network, personal
  data, or reference files. The runtime does not enforce filesystem isolation.
- **Acceptance criteria:** count/field checks plus substantive review of
  usefulness, safety, taxonomy, duplicates, permission gates, and technical
  accuracy
- **Verification:** findings are recorded in `docs/audits/skill-library.md`;
  fixes and a second read-only audit follow
- **Expected deliverable:** independent findings (received from both agents)

### F0-c1 — remediate skill-library findings

- **Assigned agent:** `/root/skills_curator`, GPT-6 Luna MAX (requested setting; actual runtime identity is not independently exposed)
- **Dependencies:** F0-c primary and second-opinion reports
- **Owned files:** `SKILLS.md` only
- **Read-only files:** `AGENTS.md`, `PLAN.md`, `docs/audits/skill-library.md`
- **Required skills applied:** S107, S119, S120, S156, S157, S189, S193, S243,
  S265, S269, S419, S494, plus any skill definitions relevant to changed entries
- **Security permissions:** task worktree is a coordination convention, not a
  sandbox; no credentials, user data, network, or reference material
- **Acceptance criteria:** all high/medium findings fixed; low findings either
  fixed or explicitly dispositioned; exactly 500 useful entries, unique names,
  all required fields and category counts preserved; no product samples,
  placeholders, stubs, or ungated Meta assumptions
- **Tests:** deterministic ID/category/field/name checks, duplicate guidance
  review, and `git diff --check`
- **Expected deliverable:** corrected `SKILLS.md` and validation summary
- **Status:** First correction pass complete; remaining independent-review issues
  are tracked in the next pass.

### F0-c2 — re-audit corrected skill library

- **Assigned agents:** GPT-6 Luna MAX and GPT-6.1 Terra HIGH, requested settings
- **Dependencies:** F0-c1 complete
- **Owned files:** findings only; read-only
- **Read-only files:** `AGENTS.md`, `PLAN.md`, `SKILLS.md`, and
  `docs/audits/skill-library.md`
- **Required skills applied:** S107, S119, S120, S156, S157, S189, S193, S243,
  S265, S269, S419, S494
- **Security permissions:** no credentials, network, personal data, or reference
  files; runtime worktree restrictions are not enforceable
- **Acceptance criteria:** verify each issue status against the corrected file,
  repeat structural validation, and report remaining findings without editing
- **Verification:** both reviewers confirmed 500 sequential entries, unique
  names, eight ordered/nonempty fields, and exact category totals; they
  identified residual cancellation, overlap, temporal, parser, Google cursor,
  and inference-wording issues. Findings are in `docs/audits/skill-library.md`.
- **Expected deliverable:** two read-only re-verification reports
- **Status:** Complete; residuals require F0-c3 and F0-c4.

### F0-c3 — remediate residual skill findings

- **Assigned agent:** `/root/skills_curator`, GPT-6 Luna MAX (requested setting;
  actual runtime identity is not independently exposed)
- **Dependencies:** F0-c2 reports from both reviewers
- **Owned files:** `SKILLS.md` only
- **Read-only files:** authoritative Chron `AGENTS.md`, `PLAN.md`,
  `docs/audits/skill-library.md`; full target `SKILLS.md`
- **Required skills:** S061, S107, S119, S120, S156, S189, S193, S236, S247,
  S248, S265, S281, S285, S291, S313, S346, S349, S363, S368, S393, S398,
  S410, S494 and related entries identified in the audit
- **Security permissions:** edit only the assigned SKILLS file in its task
  worktree; no credentials, network, user data, or reference materials. This
  runtime does not technically enforce filesystem isolation.
- **Acceptance criteria:** resolve SL-07/08 and SL-15–18; preserve exactly 500
  distinct useful entries, category counts, eight required fields, no
  product-facing samples/placeholders/stubs, and all Meta/Google gates
- **Tests:** deterministic structural and duplicate checks, targeted overlap
  review, `git diff --check`
- **Expected deliverable:** corrected `SKILLS.md` and evidence summary; no
  commit or push
- **Status:** Edits were made in the curator worktree; the agent reached its
  usage limit before returning the verification summary. The main agent
  integrated the file, corrected punctuation, and reran structural and
  duplicate checks.

### F0-c4 — final independent skill-library audit

- **Assigned agents:** GPT-6 Luna MAX and GPT-6.1 Terra HIGH, requested settings
- **Dependencies:** F0-c3 complete
- **Owned files:** review findings only
- **Read-only files:** authoritative Chron `AGENTS.md`, `PLAN.md`,
  `docs/audits/skill-library.md`, and full corrected `SKILLS.md`
- **Required skills:** S107, S119, S120, S156, S157, S189, S193, S243, S265,
  S269, S419, S494 and relevant skills for all prior findings
- **Security permissions:** read-only; no credentials, network, user data, or
  reference files; the runtime does not technically enforce isolation
- **Acceptance criteria:** independently validate all prior findings and the
  full 500-entry structure; identify residual technical or safety problems
- **Verification:** close issues only with both text evidence and structural
  validation; runtime-specific concerns remain future feature acceptance
- **Expected deliverable:** two read-only reports and an updated audit record
- **Status:** Complete. Both requested reviewers passed the integrated
  500-entry file and all SL-01–SL-18 text corrections. Runtime and feature
  checks remain future implementation work.

### F0-d — repository and CI safety

- **Assigned agent:** main agent
- **Required model:** active root model is runtime-fixed and is not claimed to
  match the restricted development-agent configurations
- **Dependencies:** clean project history and reviewed file list
- **Owned files:** `.gitignore`, `.github/workflows/**`, repository settings
- **Read-only files:** all project source and policy documents
- **Required skills:** secret scanning, dependency auditing, protected branch
  and CI configuration
- **Security permissions:** no production secrets or user data; public-repo
  creation and repository setting changes are explicitly authorized, but no
  deployment, paid service, or unrelated external write
- **Acceptance criteria:** GitHub secret scanning, push protection, Dependabot
  alerts/security updates, and private vulnerability reporting are enabled;
  public history contains only reviewed Chron files. CI must run actual lint,
  type, test, build, dependency, and secret checks once app code and its package
  scripts exist; do not add no-op placeholder workflows before then.
- **Verification:** inspect staged paths and public history, query the actual
  repository settings, and require passing workflows before app changes merge
- **Expected deliverable:** verified repository security settings and a clean
  public history; functional CI checks are added with the first app manifest
  and test/build commands
- **Status:** Repository security settings are enabled; the remote remains
  empty pending a fresh public history and first reviewed push.

### L1-a — design system and semantic landing-page shell

- **Assigned agent:** frontend specialist, GPT-6 Luna, MAX reasoning
  (requested setting; actual runtime identity is not independently exposed)
- **Dependencies:** Fresh local history, audited skill library, installed
  package baseline, and `docs/design/scroll-world-contract.md`
- **Owned files:** `apps/web/app/**`, `apps/web/styles/**`, and
  `apps/web/features/landing/presentation/**`
- **Read-only files:** `AGENTS.md`, `SKILLS.md`, `PLAN.md`,
  `docs/design/landing-brief.md`, `docs/design/scroll-world-contract.md`, and
  the shared package manifests
- **Required skills:** S001, S006, S023, S029, S030, S033, S034, S081, S082,
  S087, S089, S094–S098, S461–S463, S466, S470, S472, S473, S479
- **Security permissions:** dedicated worktree for coordination only; no
  credentials, user data, or network asset downloads; no manifest edits,
  commit, or push. Worktree separation is not an OS security boundary.
- **Acceptance criteria:** authored responsive DOM follows the brief; five
  real section anchors emit normalized progress via the agreed event; no fake
  signup, login, demo, data, or nonfunctional controls; 320px reflow, keyboard
  focus, and reduced-motion behavior are covered.
- **Tests:** lint and typecheck its owned files; main agent performs integrated
  build and desktop/mobile browser verification after the world is connected.
- **Expected deliverable:** semantic landing route, design tokens, and
  lifecycle-safe native-scroll progress bridge
- **Status:** Integrated into `main`. Lint, typecheck, and production build
  pass. Desktop browser inspection is partial; narrow, tablet, zoom,
  accessibility, and fallback checks remain under L1-e.

### L1-b — persistent 3D scroll world

- **Assigned agent:** 3D specialist, GPT-6 Luna, MAX reasoning (requested
  setting; actual runtime identity is not independently exposed)
- **Dependencies:** Fresh local history, audited skill library, installed
  R3F/Three.js packages, landing brief, and agreed scroll-world contract
- **Owned files:** `apps/web/features/landing/world/**` only
- **Read-only files:** `AGENTS.md`, `SKILLS.md`, `PLAN.md`,
  `docs/design/landing-brief.md`, `docs/design/scroll-world-contract.md`, and
  the shared package manifests
- **Required skills:** S121, S126, S128, S143–S149, S151, S155, S463, S470,
  S472, S473, S478
- **Security permissions:** dedicated worktree for coordination only; no
  credentials, user data, or production API access; no network asset downloads,
  manifest edits, commit, or push. Worktree separation is not an OS boundary.
- **Acceptance criteria:** one persistent renderer; normalized progress maps to
  five authored instrument states; no user data, UI labels, external assets, or
  input interception; reduced-motion still, WebGL/context-loss CSS fallback,
  bounded rendering, and deterministic cleanup.
- **Tests:** typecheck and lint owned files; integrated forward/reverse/fast
  scroll, resized/mobile viewports, reduced motion, fallback, and profiling are
  verified by the main agent in a real browser.
- **Expected deliverable:** persistent `WorldLayer` orchestration,
  `CalendarInstrument` geometry and scroll motion, and an owned CSS fallback
- **Status:** Integrated into `main`. Lint, typecheck, and production build
  pass. Browser fallback, reduced-motion, and responsive checks remain under
  L1-e.

### L1-c — independent landing integration review

- **Assigned agent:** independent reviewer, GPT-6.1 Terra, HIGH reasoning
  (requested setting; runtime identity is not independently exposed)
- **Dependencies:** L1-a and L1-b source implementations
- **Owned files:** findings only
- **Read-only files:** landing route, progress bridge, world component and CSS,
  design brief, scroll-world contract, `AGENTS.md`, and `SKILLS.md`
- **Required skills:** S034, S095, S114, S120, S126, S143, S147, S148, S155,
  S463, S473, and S478
- **Security permissions:** source-only review in assigned Chron worktree; no
  network, credentials, personal data, or reference folders; no edits, commit,
  or push
- **Acceptance criteria:** report actionable scene integration, lifecycle,
  accessibility, motion, and layout issues with severity and verification
- **Tests:** independent source review; explicitly mark browser behavior as
  unverified
- **Expected deliverable:** findings for root remediation
- **Status:** Source review and refactor follow-up are recorded in
  `docs/audits/landing-page.md`. LP-01, LP-02, and LP-06 are fixed in source;
  LP-03 and LP-04 remain open, and LP-05 remains partly open. LP-06's browser
  fallback runtime is still untested. Configured reviewer model identity was
  not independently confirmed, and the reviewer did not inspect the browser.

### L1-d1 — repair progress bridge lifecycle

- **Assigned agent:** `/root/landing_dom`, GPT-6 Luna MAX setting requested at
  spawn; actual runtime identity is not independently exposed
- **Dependencies:** L1-c findings and agreed `number | null` progress contract
- **Owned files:** `apps/web/features/landing/presentation/story-progress-bridge.tsx`
  only
- **Read-only files:** `AGENTS.md`, `SKILLS.md`, `docs/design/scroll-world-contract.md`,
  and the L1-c review
- **Required skills:** S120, S126, S145, S147, and S155
- **Security permissions:** Chron worktree is a coordination boundary only; no
  credentials, user data, network, other project directories, reference files,
  or commit/push
- **Acceptance criteria:** late subscribers can request current progress;
  malformed marker sets emit `null`; final progress 1 is reachable at max
  scroll; observer fallbacks and cleanup are safe; no body-wide mutation work
- **Tests:** source-level protocol and cleanup review; root runs type, lint,
  build, and browser validation
- **Expected deliverable:** bridge-only remediation and review summary
- **Status:** Bridge remediation is integrated and covered by the passing
  lint/typecheck/build checks. Browser behavior remains part of L1-e.

### L1-d2 — repair world progress and motion lifecycle

- **Assigned agent:** `/root/landing_world`, GPT-6 Luna MAX setting requested at
  spawn; actual runtime identity is not independently exposed
- **Dependencies:** L1-c findings and agreed `number | null` progress contract
- **Owned files:** `apps/web/features/landing/world/WorldLayer.tsx`,
  `CalendarInstrument.tsx`, `WorldFallback.tsx`, and `world.css`
- **Read-only files:** `AGENTS.md`, `SKILLS.md`, `docs/design/scroll-world-contract.md`,
  and the L1-c review
- **Required skills:** S121, S126, S145, S147–S149, S151, S155, S473, and S478
- **Security permissions:** Chron worktree is a coordination boundary only; no
  credentials, user data, network, other project directories, reference files,
  or commit/push
- **Acceptance criteria:** request/reply supplies current progress after lazy
  mount; `null` freezes a defined static composition; reduced-motion is
  established before Canvas visibility; fallback, context recovery, and
  cleanup remain functional
- **Tests:** source-level lifecycle and event-contract review; root runs type,
  lint, build, and browser validation
- **Expected deliverable:** world-only remediation and review summary
- **Status:** World remediation is integrated and covered by the passing
  lint/typecheck/build checks. Browser behavior remains part of L1-e.

### L1-e — integrate and verify landing world

- **Assigned agent:** main agent (runtime model identity not confirmed)
- **Dependencies:** L1-d1 and L1-d2 reviewed patches
- **Owned files:** `apps/web/app/page.tsx`, landing presentation CSS, and any
  narrowly scoped integration files explicitly agreed with the other owners
- **Read-only files:** all landing source, design brief, and world contract
- **Required skills:** S030, S095, S120, S126, S144, S147, S155, S472, S473,
  and S478
- **Security permissions:** local Chron project only; no secrets, reference
  material, external APIs, deployment, or unreviewed push
- **Acceptance criteria:** one world layer is mounted behind semantic content;
  duplicate decorative stills are removed; the world remains visible only in
  composed areas, text/nav maintain contrast, and mobile framing avoids copy
- **Tests:** lint, typecheck, production build, direct browser inspection at
  desktop and mobile, deep-link/reload progress, reverse/fast scrolling,
  reduced-motion, WebGL fallback, and visibility handling without
  IntersectionObserver
- **Expected deliverable:** reviewed integrated landing experience and
  verification findings in progress documentation
- **Status:** Integration is complete. Production browser inspection covered
  the chapter sequence and anchors at 1230×480 desktop. The task remains in
  progress until narrow/tablet/zoom, keyboard, reduced-motion, WebGL fallback,
  no-IntersectionObserver visibility behavior, reverse/fast scroll, and
  performance checks are recorded.

## Integration gates

Every task is reviewed for correctness, security, responsiveness, and its
acceptance evidence before merge. Shared files remain under one owner. No
feature is described as complete until its actual behavior has been tested.

## Calendar milestone C1

Landing implementation is paused at the user's direction. Calendar tasks use
separate local worktrees and only publish reviewed, purposeful commits to the
single remote `main` branch. The runtime cannot enforce agent filesystem or
network isolation; task scopes are coordination boundaries, and no worker
receives credentials or user data.

### Shared calendar contract

- The authenticated collection is `/api/calendar/events`.
- `GET` takes `from` and `to` as canonical `YYYY-MM-DD` date bounds, with
  `to` exclusive, plus an IANA `timeZone` for projecting timed bounds. It
  returns `{ "events": CalendarEvent[] }` and includes only the signed-in
  owner's events overlapping the requested range.
- `POST` accepts `{ event, calendarTimeZone, reviewedConflicts }`, resolves
  timed wall times in the submitted zone, and returns
  `{ "event": CalendarEvent }` with status 201 and an ETag containing the
  event revision. `PUT /api/calendar/events/{id}` accepts the same body and
  requires `If-Match` for the revision the user reviewed. `DELETE` requires the
  same precondition. A changed conflict snapshot returns 409; a stale event
  revision returns 412; an absent precondition returns 428; an unknown or
  foreign event returns 404.
- `POST /api/calendar/events/conflicts` accepts a validated event proposal,
  the configured calendar time zone, and an optional event ID to exclude when
  editing. It returns only the overlapping event title and time/date fields
  owned by the signed-in user. Timed and all-day bounds use half-open interval
  rules; mixed comparisons use the configured calendar zone.
- `GET` and `PUT /api/calendar/preferences` read or update the signed-in
  owner's theme, density, week start, and IANA display time zone.
- Responses use `Cache-Control: private, no-store`. Errors use
  `{ "error": { "code": string, "message": string } }`, without SQL, stack,
  or provider details.
- Timed events preserve local wall time, IANA zone, resolved instant, and
  explicit earlier/later choice for an ambiguous fall-back time. Nonexistent
  spring-forward times are rejected. All-day events use date-only,
  end-exclusive bounds and never pass through UTC midnight.
- The form checks for overlaps before showing a preview. Its explicit save
  submits the reviewed overlap IDs and revisions. Create/update serialize
  through an owner-scoped PostgreSQL transaction lock, compare the conflict
  snapshot again inside the write transaction, and reject a changed time zone
  or overlap set with 409. A changed overlap set requires a fresh review.
  Calendar delete and preference writes use the same lock. This guarantee
  assumes all future calendar writers use this repository path. Agent-produced
  or bulk changes remain a later, persisted draft-and-approval feature under
  S369.

### C1-a — persisted calendar service and API

- **Task ID:** C1-a
- **Objective:** Add owner-isolated PostgreSQL event and preference storage,
  authenticated collection/item handlers, optimistic concurrency, and safe
  validation using the shared contract above.
- **Assigned agent:** backend engineer, GPT-6 Luna, MAX reasoning
- **Dependencies:** committed `features/calendar/domain/types.ts`,
  `features/calendar/domain/time.ts`, and server-only access to the existing
  Better Auth PostgreSQL pool
- **Owned files:** `apps/web/db/migrations/0002_calendar.sql`,
  `apps/web/features/calendar/server/**`,
  `apps/web/app/api/calendar/**`
- **Read-only files:** `AGENTS.md`, `apps/web/AGENTS.md`, `SKILLS.md`,
  `PLAN.md`, this task graph, calendar domain types/time helpers,
  Better Auth server configuration, the existing auth migration, and installed
  Next.js Route Handler/headers documentation
- **Required skills:** S041, S042, S044, S048, S049, S051, S063, S178,
  S201–S216, S346–S349, S363, and S369
- **Security permissions:** own-worktree edits only; no auth configuration,
  package manifest, production credentials, personal data, external API calls,
  other project folders, reference material, or push to GitHub. Worktree
  separation is not a technical sandbox.
- **Acceptance criteria:** auth comes from a verified Better Auth session;
  owner scope is enforced in parameterized SQL and PostgreSQL RLS with
  transaction-local user context; writes reject cross-origin requests and
  require current revision; malformed, oversized, or unsupported fields are
  rejected; only deliberate DTO fields are returned; reads are bounded and
  no-store; deletion cascades from the account.
- **Tests:** unit-test boundary parsing, schema validation, error mapping,
  ownership paths, origin checks, and revision conflicts. Apply and inspect
  migration in a clean disposable PostgreSQL-compatible test database if
  available; report plainly if the runtime has no test database.
- **Expected deliverables:** migration, scoped repository, route handlers,
  tests, and a concise review summary; commit locally under the configured
  `2q9e` author, but do not push or create a remote branch.
- **Current status:** implemented in the integration worktree. All 17 focused
  calendar API tests pass; migration application and authenticated PostgreSQL
  behavior remain unverified because no disposable test database is available.
  The integrated source was pushed to the single public `main` branch at
  `bdf89fd`.

### C1-b — calendar views and interactions

- **Task ID:** C1-b
- **Objective:** Build a responsive, accessible calendar for persisted user
  events with day, week, month, and agenda views; date navigation; create,
  edit, and delete forms; and real persisted theme/density/week/time-zone
  preferences.
- **Assigned agent:** frontend engineer, GPT-6 Luna, MAX reasoning
- **Dependencies:** shared contract above; reads/writes use C1-a endpoints
- **Owned files:** `apps/web/features/calendar/presentation/**` only
- **Read-only files:** `AGENTS.md`, `apps/web/AGENTS.md`, `SKILLS.md`,
  `PLAN.md`, this task graph, calendar domain types/time helpers, root design
  tokens, calendar API contract, and installed Next.js server/client boundary
  documentation
- **Required skills:** S005–S012, S020–S021, S037, S356–S358, S360–S361,
  S370, S421, and S423
- **Security permissions:** own-worktree edits only; no database, auth,
  package, route, external API, credentials, personal data, other project
  folders, reference material, or push to GitHub. No samples, placeholder
  records, or fake endpoints; display an honest empty state for an empty
  account. Worktree separation is not a technical sandbox.
- **Acceptance criteria:** every control performs its stated action; saved
  events reload through the API; event details are never seeded; all-day dates
  stay date-only; DST ambiguity is explained and resolved explicitly; focus,
  keyboard operation, reduced motion, mobile reflow, loading, error, empty, and
  conflict states are complete; the five themes alter coherent tokens.
- **Tests:** test date-grid boundaries, event overlap layout, form validation,
  API error recovery, and keyboard dialogs. Main agent inspects the rendered
  desktop and mobile calendar in a real browser after route integration.
- **Expected deliverables:** calendar presentation components/CSS, focused
  tests, and review summary; commit locally under the configured `2q9e`
  author, but do not push or create a remote branch.
- **Current status:** four views and event/preference controls are integrated.
  The sign-in shell has been inspected at desktop and mobile widths, but the
  authenticated calendar screen cannot yet be browser-tested without a real
  test database and account.

### C1-c — protected route and end-to-end integration

- **Task ID:** C1-c
- **Objective:** Make the application open to the calendar, protect it with the
  existing auth provider, provide a working sign-in form for existing verified
  accounts, connect C1-a and C1-b, and conduct the real-browser walkthrough.
- **Assigned agent:** main integration owner
- **Dependencies:** reviewed C1-a and C1-b commits
- **Owned files:** `apps/web/app/**`, sign-in presentation, project memory,
  CI wiring, and narrow integration fixes approved by the main owner
- **Read-only files:** all C1 API and presentation work before review
- **Required skills:** S048, S049, S051, S012, S013, S015, S055, S421,
  S423, and applicable accessibility/design audit skills
- **Security permissions:** local Chron repository and configured GitHub
  `main`; no reference material, production credentials, deployment, paid
  service, or other project. Push only reviewed, staged source changes to the
  existing single remote branch.
- **Acceptance criteria:** root leads to `/calendar`; unauthenticated visitors
  reach sign-in; sign-in uses Better Auth and never fakes session state; a
  verified account can create, edit, list, delete, and reload events with
  user-isolated data; one-user mutations cannot affect another; five calendar
  themes and preferences persist server-side; rendered desktop and mobile
  behavior is reviewed.
- **Tests:** run the relevant unit/security suites, lint, typecheck, dependency
  audit, build, and browser checks. Full authenticated persistence is only
  claimed if a disposable test account and database are actually configured.
- **Expected deliverables:** integrated calendar route, auth UI, updated
  progress/handoff, audit findings and fixes, and reviewed commits on `main`.
- **Current status:** root redirects to `/calendar`; the protected route and
  Better Auth sign-in page compile and the sign-in layout was inspected in a
  real browser. With an isolated synthetic auth configuration and no database,
  `/calendar` correctly displayed the account-service-unavailable state. No
  sign-in submission or authenticated persistence is claimed.

## Calendar interaction remediation graph

```text
C1-r1 durable create idempotency ──┬─ C1-r2 retry-safe editor and reload focus ─┐
C1-r3 short-event fallback ────────┴────────────────────────────────────────────┤
                                                                                ├─ C1-r4 independent re-audit
                                                                                ├─ C1-r5 authenticated browser verification (database gated)
                                                                                └─ C1-a bounded title search
```

### C1-r1 — durable event-create idempotency

- **Task ID:** C1-r1
- **Objective:** Make retried event-creation requests return the original
  result for one authenticated owner and exact normalized approval payload;
  reject key reuse with a changed payload or another owner.
- **Assigned agent:** `/root/calendar_idempotency_api`, GPT-6 Luna MAX,
  MAX reasoning (requested setting; runtime model identity is not independently
  exposed)
- **Dependencies:** C1-a owner-scoped event repository and current C1 API
- **Owned files:** `apps/web/db/migrations/0004_calendar_create_requests.sql`,
  `apps/web/features/calendar/domain/types.ts`,
  `apps/web/features/calendar/server/validation.ts`,
  `apps/web/features/calendar/server/repository.ts`,
  `apps/web/app/api/calendar/events/route.ts`,
  `apps/web/features/calendar/server/calendar-api.test.mjs`
- **Read-only files:** `AGENTS.md`, `apps/web/AGENTS.md`, `SKILLS.md`,
  `PLAN.md`, this task graph, existing calendar migration, client API, and
  `calendar-editor.tsx`
- **Required skills:** S045, S193, S357, S369, S411, S494, plus relevant
  PostgreSQL ownership/RLS and HTTP validation skills
- **Security permissions:** Dedicated local worktree for coordination only;
  no credentials, personal data, reference material, external network, commit,
  or push. The runtime does not enforce filesystem isolation.
- **Acceptance criteria:** `Idempotency-Key` is validated; the durable key is
  scoped by owner and transactionally stored with creation; an identical retry
  returns the same event without another insert; changed payload and cross-user
  replay are rejected; event deletion and account deletion have explicit,
  tested retention behavior; no key, event data, or secret is logged.
- **Tests:** First create, concurrent or sequential replay, changed payload,
  cross-owner replay, event deletion, transaction failure, and exact response
  stability. Run the focused calendar API suite and inspect migration SQL.
- **Expected deliverables:** migration, route/repository validation, focused
  regression tests, and an evidence summary; no commit or push.
- **Status:** In progress.

### C1-r2 — retry-safe create editor and reload focus

- **Task ID:** C1-r2
- **Objective:** Keep one stable operation key for the approved create payload;
  lock that payload after an uncertain response and permit only exact replay.
  Restore focus only after reload completes, falling back to New event when a
  deleted or rerendered opener is gone.
- **Assigned agent:** main integration owner
- **Dependencies:** C1-r1 HTTP header contract is fixed as `Idempotency-Key`;
  current event editor and focus restoration
- **Owned files:** `apps/web/features/calendar/presentation/calendar-api.ts`,
  `calendar-workspace.tsx`, and `calendar-editor.tsx`
- **Read-only files:** `AGENTS.md`, `apps/web/AGENTS.md`, `SKILLS.md`,
  `PLAN.md`, this task graph, calendar domain types, and C1-r1 server contract
- **Required skills:** S013, S045, S193, S369, S411, S421, S423
- **Security permissions:** Main local checkout and existing GitHub `main`;
  no reference material, production credentials, deployment, or unrelated
  repository. Do not commit root `AGENTS.md`; push reviewed changes to `main`
  only.
- **Acceptance criteria:** one key follows one editor create attempt; editing
  before dispatch creates a new key; after an uncertain dispatched write, the
  reviewed payload cannot change and the retry reuses the same key and exact
  payload; stale edits cannot be approved; save/delete/discard focus waits for
  load and busy completion, with a stable connected fallback.
- **Tests:** API replay suite plus browser keyboard checks for close, save,
  delete, discard, and uncertain create retry when an authenticated disposable
  account is available; lint, typecheck, and build.
- **Expected deliverables:** retry-only editor state, stable API request key,
  reliable focus restoration, and updated audit/progress records.
- **Status:** In progress.

### C1-r3 — accessible target for short timed events

- **Task ID:** C1-r3
- **Objective:** Keep events whose day-clipped visual interval is below the
  minimum hit target accessible without drawing over the following day.
- **Assigned agent:** `/root/calendar_short_event_accessibility`, GPT-6 Luna
  MAX, MAX reasoning (requested setting; runtime model identity is not
  independently exposed)
- **Dependencies:** C1-r2 implementation contract is independent; the current
  elapsed-time layout in `calendar-model.ts` is the base
- **Owned files:** `apps/web/features/calendar/presentation/calendar-views.tsx`
  and `calendar.module.css`
- **Read-only files:** `AGENTS.md`, `apps/web/AGENTS.md`, `SKILLS.md`,
  `PLAN.md`, this graph, calendar model, domain event types, and current views
- **Required skills:** S357, S421, S423, S424, S494
- **Security permissions:** Dedicated local worktree for coordination only;
  no credentials, personal data, reference material, external network, commit,
  or push. Worktrees are not a technical sandbox.
- **Acceptance criteria:** short event segments are not left as tiny controls;
  a visible, full-size keyboard target exposes them without covering the next
  date; multi-day and midnight labels stay accurate; mobile week does not show
  duplicate alternatives.
- **Tests:** add regression coverage for a one-minute event ending at midnight
  and verify all-day, normal, and continued events remain reachable. Run lint,
  typecheck, layout tests, and `git diff --check`.
- **Expected deliverables:** accessible full-size fallback and focused test;
  no commit or push.
- **Status:** In progress.

### C1-r4 — independent calendar remediation review

- **Task ID:** C1-r4
- **Objective:** Independently verify C-01 through C-07 remediation and report
  residual accessibility, interaction, data-integrity, or security findings.
- **Assigned agent:** visual auditor GPT-6.1 Terra HIGH and security auditor
  GPT-6 Luna MAX (requested settings; runtime identities are not independently
  attested)
- **Dependencies:** C1-r1, C1-r2, and C1-r3 integrated and locally verified
- **Owned files:** findings only; read-only
- **Read-only files:** AGENTS.md, SKILLS.md, audit report, current patch, and
  relevant calendar files
- **Required skills:** S013, S045, S193, S357, S369, S411, S421, S423, S494
- **Security permissions:** Read-only local source; no credentials, user data,
  reference material, external network, or modifications.
- **Acceptance criteria:** every finding is tied to current code evidence;
  no issue is closed solely because its implementation agent reports success.
- **Tests:** review reported test outputs; do not claim browser verification
  unless an authenticated calendar is rendered.
- **Expected deliverables:** independent findings and closure recommendation.
- **Status:** Waiting on C1-r1 through C1-r3.

### C1-r5 — authenticated calendar browser verification

- **Task ID:** C1-r5
- **Objective:** Verify persisted create, replay, edit, delete, themes, keyboard
  focus, and responsive states in a real browser using a disposable account.
- **Assigned agent:** main integration owner
- **Dependencies:** C1-r1 through C1-r3; a disposable PostgreSQL database and
  test account
- **Owned files:** audit evidence only, `docs/audits/calendar-page.md`,
  `PROGRESS.md`, and `HANDOFF.md`
- **Read-only files:** integrated application and migrations
- **Required skills:** S421, S423, S424 and applicable accessibility skills
- **Security permissions:** Synthetic local configuration only; no production
  credentials or personal data and no real calendar writes.
- **Acceptance criteria:** browser renders authenticated desktop and mobile
  calendars; create/replay produces one saved event; keyboard focus returns to
  a live control after close/save/delete; short events remain accessible.
- **Tests:** actual browser walkthrough and disposable database assertions.
- **Expected deliverables:** dated evidence, screenshots when supported, and
  updated audit statuses; no fabricated user or sample event in the product.
- **Status:** Blocked by the missing disposable PostgreSQL service/account;
  source work continues without claiming this verification.

### C1-a follow-on — bounded title search

After C1-r4, implement the read-only owner-scoped date-window search proposed
by the roadmap reviewer. Use `POST /api/calendar/events/search` to keep search
terms out of URLs; defer course and occurrence-aware search until those data
models exist. Add exact validation, literal matching, half-open date bounds,
owner isolation, bounded results, and keyboard-usable empty/loading/error
states before accepting this slice.
