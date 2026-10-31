# Progress

## Current milestone

F0 — foundation documentation and repository security are complete locally;
the first reviewed push is pending. L1 — landing page and design system — is
in progress. No code or visual material was copied from any other folder.

## Completed

- Created `Chron project root` as a separate project
  with its own Git history. No application code was copied in.
- Created the empty public GitHub repository `2q9e/chron`. No files or commit
  history have been pushed; first push is pending staged-path and history review.
- Enabled GitHub secret scanning and push protection, Dependabot alerts and
  security updates, and private vulnerability reporting. Verified these settings
  through the repository API; branch protection waits for the first clean push.
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
- Added the bridge's request/reply progress handshake, invalid-marker `null`
  state, reachable scroll-end mapping, and scoped structural observation.
- Ran `npm run lint`, `npm run typecheck`, and `npm run build`; all passed on
  the landing shell. Next.js generated `next-env.d.ts` and applied required
  TypeScript settings during the build.
- Created 526 distinct local commits on the fresh `main` history. The latest
  landing commits are `cbc7e28` and `9d2c06d`; none has been pushed yet.

## In progress

- Integrate the persistent Three.js/R3F scroll world behind the story copy;
  finish request lifecycle and layer order, then lazy-load it and inspect
  fallback behavior.
- Run the integrated landing route in a real browser at desktop and mobile
  sizes, including anchor reload, reverse/fast scroll, reduced motion, and
  WebGL fallback.
- Keep each reviewed change small and commit it; inspect staged files and
  history before the first push to the public repository.
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
- The public GitHub repository is still empty; local `main` has 526 non-empty,
  reviewed commits. Never count empty or duplicate commits toward the requested
  target.
- The 3D scene is not yet integrated; only the landing shell has partial
  browser inspection.

## Verification performed

- Reviewed the direction-tool script before running it, confined its state to
  ignored `.taste-skill/`, and generated the local direction sheet with a fixed
  seed. This is design planning, not application testing.
- Checked Meta policy claims against current first-party pages. The report
  identifies remaining legal and account-level verification work, including
  linked incorporated terms not available without an authenticated source.
- Landing-shell lint, TypeScript, and production-build checks passed. No
  integrated 3D-browser walkthrough has been performed.
- Rendered and inspected the landing shell in a real browser at the default
  desktop viewport and at 390×844. The semantic copy, primary in-page link,
  navigation, and mobile reflow appeared as authored. This is partial browser
  review only; the scene is not integrated, and 320px, tablet, scrolling,
  reduced-motion, and WebGL fallback checks remain.
