# Handoff

## Current state

Chron is a standalone repository with 533 non-empty, distinct commits on public
GitHub `main`; the local and remote branch heads match. Secret scanning, push
protection, Dependabot alerts and security updates, and private vulnerability
reporting are enabled. Continue reviewing staged paths and scans before every
push.

## Current milestone

F0 — project foundation and repository security — is published. Hosted CI and
branch protection remain to be verified. L1 — landing page and design system —
is in progress. The scroll-linked Three.js/R3F world is integrated and visually
reviewed at one desktop viewport. Do not mark L1 complete until the remaining
viewport, motion, accessibility, fallback, and performance checks are done.

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
  no workflow run, so hosted CI is unverified. No unit or integration suite
  exists yet.
- Do not add samples, placeholders, stubs, fake demos, or nonfunctional
  controls to the product.
- This runtime does not enforce per-agent filesystem or network sandboxes.
  Worktrees are coordination boundaries only; never provide secrets or private
  data to agents. Requested agent model settings were assigned, but this
  runtime does not independently attest model identity.

## Implementation checkpoint

- Landing route: `apps/web/app/page.tsx`.
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
- `npm run build --workspace @chron/web` — passed after the latest landing
  module split and visibility-fallback fix.
- Production route inspected in Chrome at 1230×480. Opening, Week, Study,
  Research, and closing chapters were viewed; in-page navigation, `#week`
  reload, and reverse navigation were tried. The scene was visible through
  the chapter gradients beside the copy. After the module split, the production
  Research view was reloaded and rechecked.
- No browser verification is claimed at mobile/tablet widths or 320px, 400%
  zoom, reduced motion, keyboard-only input, WebGL loss, or performance metrics.
  The independent landing audit was source-only; its configured model identity
  could not be independently confirmed.
- `npm audit --omit=dev --audit-level=moderate` — passed with zero runtime
  dependency vulnerabilities. The full dependency audit has 11 moderate
  development-only `minimatch` denial-of-service advisories and no high or
  critical findings; avoid forced upgrades.

## Next actions

1. Verify 320px, 390px, tablet, and 400% zoom layout in a real browser; resolve
   any clipping, overlap, or horizontal overflow.
2. Inspect forward, reverse, and fast scroll; keyboard navigation and focus;
   reduced motion; and WebGL fallback/context loss. Record evidence in the
   landing audit and close findings only after verification.
3. Measure animation and page performance on representative conditions.
4. Re-run lint, typecheck, and production build after any implementation fix.
5. Continue with backend security only after the L1 acceptance work is
   sufficiently verified; keep signup and credential intake gated.
6. Check why the hosted Actions run has not appeared; after a check exists,
   configure and verify safe `main` branch rules.
7. Before every push, inspect staged paths and rescan staged content and the
   commit history for secrets and excluded material.
