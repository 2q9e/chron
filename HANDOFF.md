# Handoff

## Current state

Fresh project folder: `Chron project root`.
It is an independent Git repository on `main` with 525 non-empty local commits.
No credentials, private data, or reference materials are in Git. The public
repository `2q9e/chron` is still empty; no code or history has been pushed.
Secret scanning, push protection, Dependabot alerts/security updates, and
private vulnerability reporting are enabled.

## Current milestone

F0 — foundation is complete locally; the first reviewed public push remains
pending. L1 — premium landing page and design system — is in progress.

## Important constraints

- Read `AGENTS.md`, `PLAN.md`, `PROGRESS.md`, and `SKILLS.md` before work.
- Meta Model API is the only allowed inference service.
- Keep public signup and Meta key submission disabled. The current Meta terms
  require end users to be 18+, prohibit key sharing outside the issuing team
  without permission, and grant no trademark license. Written clarification or
  permission is required before the planned BYOK flow or “Powered by Meta AI”
  attribution can ship.
- The current AUP adds education, sensitive-data, provenance, and agent-human
  oversight constraints. The linked Global Processor Terms and Data Security
  Terms redirect to a blocked login; their exact duties are unverified and must
  be reviewed before launch. See `docs/research/meta-api.md`.
- New Git history must be independent and must exclude private/reference
  material.
- Local `main` has 525 non-empty, reviewed commits; no changes have been pushed
  yet. Continue to count only useful, distinct commits, never empty or
  duplicate churn.
- Spawnable agents must use GPT-6 Luna MAX or GPT-6.1 Terra HIGH. This runtime
  does not provide enforceable per-agent filesystem/network isolation.
- Do not claim browser verification until the app has been rendered and
  inspected at desktop and mobile sizes.

## Next actions

1. Review and integrate the persistent 3D scene patch from its task worktree.
   Mount it behind the semantic story, use one fallback graphic, and preserve
   the correct current scroll position after initial load or lazy mount.
2. Lazy-load the 3D bundle and establish the layer order so the scene appears
   through authored sections while copy and navigation stay legible.
3. Run lint, typecheck, and production build after integration. Inspect
   production rendering at 1440×900, 768×1024, 390×844, and 320px; test anchor
   navigation, deep-link reload, reverse/fast scroll, reduced motion, and WebGL
   fallback. Record findings before closing L1.
4. Review staged files and every public-history path before pushing the fresh
   `main` history; do not push `local-only/prior-main`.
5. Obtain qualified review of the integrated Meta report and inspect the
   incorporated processor/security terms through an authorized source before
   launch.
6. Do not add fake signup, user-key intake, Meta attribution, demos, or
   nonfunctional controls while their policy gates and implementations remain
   unresolved.

## Active agent work

- Skill curator: GPT-6 Luna MAX setting requested; initial authoring and
  correction work are integrated. The task reached its usage limit before
  returning a final summary. Root validation and both final reviews confirm
  500 sequential IDs, exact category totals, all fields, unique names, and no
  exact duplicate guidance. All SL-01–SL-18 text findings are closed in
  `docs/audits/skill-library.md`; runtime checks remain future work.
- Meta policy researcher: GPT-6.1 Terra HIGH, report integrated at
  `docs/research/meta-api.md`; the public AUP and data commitments were checked.
  The incorporated processor/security terms remain unverified because the
  public links require an authenticated source.
- Independent landing direction critique: GPT-6.1 Terra HIGH setting
  requested; no blocker in the written direction. Its release requirements are
  recorded in `docs/design/landing-brief.md`; a separate source audit found
  issues now tracked in `docs/architecture/task-graph.md`.
- The runtime provides no hard per-agent filesystem or network isolation.

## Current implementation checkpoint

- Landing route and story: `apps/web/app/page.tsx` and
  `apps/web/features/landing/presentation/landing-story.tsx`.
- Story layout and shared tokens: `apps/web/features/landing/presentation/landing-story.module.css`,
  `apps/web/styles/tokens.css`, and `apps/web/styles/globals.css`.
- Native scroll bridge: `apps/web/features/landing/presentation/story-progress-bridge.tsx`;
  it emits `number | null`, handles late subscriber requests, and maps the final
  story stop to reachable scroll end.
- The world implementation remains in `/tmp/chron-worktrees/landing-world`
  pending root review and integration; it is not in the main commit yet. The
  main route currently has no 3D Canvas.
- `npm run lint`, `npm run typecheck`, and `npm run build` passed on the shell.
  The page rendered in a real browser at the default desktop viewport and
  390×844. These checks do not verify the unintegrated scene or the full L1
  acceptance matrix.
- Latest implementation commit: `9d2c06d update`; task-graph review checkpoint:
  `cbc7e28 update`.
