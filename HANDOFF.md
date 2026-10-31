# Handoff

## Current state

Fresh project folder: `Chron project root`.
It is an independent Git repository on `main` with local foundation and
Next.js dependency-setup commits. No credentials, private data, or reference
materials are in the repository. The public repository `2q9e/chron` is still
empty. Secret scanning, push protection, Dependabot alerts/security updates,
and private vulnerability reporting are enabled; no code or history has been
pushed yet.

## Current milestone

F0 — foundation, with fresh public-history assembly pending; L1 — premium
landing page and design system — is next.

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
- Create at least 501 non-empty, reviewed commits in fresh public `main`; the
  actual count must come from useful, distinct changes rather than empty or
  duplicate commits. The current remote history count is zero.
- Spawnable agents must use GPT-6 Luna MAX or GPT-6.1 Terra HIGH. This runtime
  does not provide enforceable per-agent filesystem/network isolation.
- Do not claim browser verification until the app has been rendered and
  inspected at desktop and mobile sizes.

## Next actions

1. Assemble the fresh public history. The 500-entry skill library passed the
   final text audits; skill entries and other useful changes should be
   committed in small, distinct increments.
2. Build the landing shell and persistent 3D scroll world in separate task
   worktrees. The independent direction review's copy, accessibility,
   no-WebGL, and performance findings are acceptance checks.
3. Add real lint, type, build, security, and browser checks when the app source
   and their commands exist. Inspect desktop, tablet, mobile, and reduced-motion
   rendering before calling the UI milestone complete.
4. Obtain qualified review of the integrated Meta report and inspect the
   incorporated processor/security terms through an authorized source before
   launch.
5. Do not add fake signup, user-key intake, Meta attribution, demos, or
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
  recorded in `docs/design/landing-brief.md`; no rendered UI was reviewed.
- The runtime provides no hard per-agent filesystem or network isolation.
