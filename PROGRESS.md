# Progress

## Current milestone

F0 — foundation documentation, the scrubbed fresh history, and repository
security are on public GitHub `main`; hosted checks and branch protection remain
unverified. L1 — landing page and design system — is in progress. No code or
visual material was copied from another folder.

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
- The local and remote `main` heads match at 533 non-empty, distinct commits.
  Before publication, the full `main` history was rewritten to remove the two
  user-local path mentions. Reachable-history scans report zero remaining path
  matches and zero private-key, AWS-key, GitHub-token, or quoted credential
  assignment patterns. These regex checks are useful but not comprehensive.

## In progress

- Complete the landing visual review at narrow, tablet, and zoomed viewports;
  test reduced motion, keyboard-only navigation, fast/reverse scroll, and
  WebGL context loss/fallback. The available desktop browser review was at
  1230×480 only.
- Keep each reviewed change small, commit it, and push it to public `main` only
  after reviewing the staged paths and history scan.
- Do not add signup or Meta-key controls until related policy and operator
  gates are cleared and the flows are real.
- Obtain qualified review of the integrated Meta report; inspect the
  incorporated processor/security terms through an authorized source before
  launch.

## Known constraints

- This runtime cannot enforce per-agent filesystem or network sandboxes; task
  worktrees are coordination boundaries only.
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
- Public GitHub `main` has 533 non-empty, purposeful commits, exceeding the
  requested 500. Never count empty or duplicate commits toward the target.
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
