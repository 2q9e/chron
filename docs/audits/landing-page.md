# Landing page review

## Scope and evidence

The independent review was a source-only review of the integrated landing
page. A Terra HIGH configuration was requested for that reviewer, but the
runtime model identity could not be independently confirmed. The reviewer did
not inspect a browser. The scores below are therefore critique scores, not
release certification. They record the first review snapshot before the
component split and LP-06 remediation; no refreshed numeric scores are claimed.

The main agent separately inspected the production build in Chrome at the
available 1230×480 desktop viewport. It visited the opening, Week, Study,
Research, and closing chapters, followed in-page navigation, reloaded a
`#week` deep link, and navigated in reverse. The continuous Three.js scene was
visible through the chapter surfaces. This inspection did not cover a narrow
viewport, tablet, 400% zoom, reduced-motion emulation, WebGL failure, keyboard
only navigation, or performance metrics. No screenshot artifact was retained.

## Source review scores

| Category | Score | Evidence and limit |
| --- | ---: | --- |
| Visual originality | 7/10 | One recurring calendar instrument replaces a generic product-card layout; only source was reviewed. |
| Typography | 7/10 | Editorial hierarchy is present; narrow and zoomed layouts remain unchecked. |
| Layout | 7/10 | Chapter layouts and a continuous scene are defined; small viewport clipping remains unverified. |
| Color | 7/10 | A restrained rose, paper, and graphite palette is used; browser contrast measurements were not performed. |
| Animation | 6/10 | Scroll progress animates ring, paper, and path; forward/reverse easing and reduced-motion output need direct review. |
| Copy | 7/10 | Copy describes the current direction and avoids unsupported feature claims; further product validation remains. |
| Interaction | 7/10 | In-page anchors and deep links work in the inspected desktop browser; other input modes were not tested. |
| Accessibility | 6/10 | Semantic sections and reduced-motion handling are implemented; keyboard, screen-reader, contrast, and mobile checks remain. |
| Functionality honesty | 8/10 | No signup, fake integrations, sample content, or simulated feature demos are present. |
| Maintainability | 6/10 | The implementation has feature boundaries; the source review did not assess broader application integration. |
| Performance | 6/10 | Demand rendering and lazy loading are implemented; no measured frame rate or Core Web Vitals are available. |
| Security | 7/10 | No credential collection or external tool execution exists in this milestone; this is not a security audit of the whole product. |
| Product identity | 7/10 | A persistent calendar instrument provides a distinct visual motif; additional user research is needed. |

The milestone does not meet the requested 9/10 target across categories and
remains in progress.

## Findings and remediation

### LP-01 — The continuous scene was hidden by opaque chapters

- **Severity:** High
- **Affected files:** `apps/web/features/landing/presentation/landing-story.module.css`
- **Problem:** Opaque chapter backgrounds concealed the persistent 3D scene,
  breaking the central landing-page visual sequence.
- **Correction:** Use chapter-specific desktop gradients that hold a readable
  surface under text and fade to the scene; use a vertical gradient on narrow
  layouts.
- **Assigned agent:** Main integration
- **Verification:** Production Chrome inspection at 1230×480 showed the scene
  visible beside copy in Week, Study, and Research.
- **Status:** Fixed in source and visually verified at the inspected desktop size.

### LP-02 — Chapter-specific decorative diagrams competed with the scene

- **Severity:** Medium
- **Affected files:** `apps/web/features/landing/presentation/landing-story.tsx`,
  `apps/web/features/landing/presentation/landing-story.module.css`
- **Problem:** Static chapter diagrams repeated the visual role of the
  persistent instrument and weakened the single-scene narrative.
- **Correction:** Remove those chapter diagrams and their unused styles. Keep
  the static instrument only as the scene's actual rendering fallback.
- **Assigned agent:** Main integration
- **Verification:** Source inspection and production browser inspection show
  one recurring world scene rather than competing chapter illustrations.
- **Status:** Fixed.

### LP-03 — The motion narrative needs forward, reverse, and reduced-motion review

- **Severity:** Medium
- **Affected files:** `apps/web/features/landing/world/CalendarInstrument.tsx`,
  `apps/web/features/landing/presentation/story-progress-bridge.tsx`
- **Problem:** The source maps scroll to ring rotation, paper separation, and
  source-path visibility, but the full progression and alternative motion
  state have not been reviewed in a browser.
- **Recommended correction:** Inspect a slow and fast forward pass, reverse
  pass, and reduced-motion mode. Adjust the motion only where those observations
  identify an orientation or readability problem.
- **Assigned agent:** Main integration
- **Verification:** Real-browser review with normal and reduced motion, forward
  and reverse.
- **Status:** Open.

### LP-04 — Anchor movement needs keyboard and repeated-navigation review

- **Severity:** Low
- **Affected files:** `apps/web/styles/globals.css`,
  `apps/web/features/landing/presentation/landing-story.tsx`
- **Problem:** Desktop anchor destinations and deep links worked, but keyboard
  focus behavior and repeated or rapid chapter navigation have not been
  inspected. Reduced-motion CSS exists but has not been exercised.
- **Recommended correction:** Verify focus remains understandable, every anchor
  remains reachable, and reduced motion skips smooth scrolling. Correct any
  observed failure.
- **Assigned agent:** Main integration
- **Verification:** Browser keyboard walkthrough, repeated navigation, and
  reduced-motion setting.
- **Status:** Open.

### LP-05 — Narrow viewport and zoom clipping remain unverified

- **Severity:** Low
- **Affected files:** `apps/web/features/landing/presentation/landing-story.module.css`,
  `apps/web/features/landing/world/world.css`, `apps/web/styles/globals.css`
- **Problem:** Removing the 320px minimum width allows the document to reflow,
  but it does not prove that the instrument, headings, or clipped page frame
  remain usable at 320 CSS pixels or 400% zoom.
- **Correction:** Test at 320px, 390px, tablet width, and 400% zoom; make
  evidence-led layout corrections if clipping or overlap appears.
- **Assigned agent:** Main integration
- **Verification:** Inspect those rendered sizes and check horizontal overflow,
  readable copy, reachable anchors, and visible focus.
- **Status:** Partially addressed in source; browser verification remains open.

### LP-06 — Visibility fallback could remain inactive without IntersectionObserver

- **Severity:** Low
- **Affected files:** `apps/web/features/landing/world/WorldLayer.tsx`
- **Problem:** The visibility listener reused intersection-based activity
  detection. When IntersectionObserver was unavailable, the intersection set
  stayed empty, so changing tabs could leave the scene inactive after return.
- **Correction:** Use a visibility-only activity handler in the no-observer
  branch and request a render when the document becomes visible.
- **Assigned agent:** Main integration
- **Verification:** Source control-flow review and passing lint, typecheck, and
  production build. The browser environment was not forced to omit
  IntersectionObserver, so runtime fallback behavior remains unverified.
- **Status:** Fixed in source; dedicated runtime verification remains open.

## Review status

This is an interim audit. LP-01, LP-02, and LP-06 are fixed in source; the
independent source reviewer rechecked LP-06 and found its visibility handling
and cleanup correct. LP-03 and LP-04 remain open, LP-05 remains partially
addressed, and LP-06 still lacks a forced no-IntersectionObserver runtime test.
The landing milestone is not marked complete. The production browser review
was limited to the available desktop viewport; no mobile or accessibility
certification is claimed.

## Refactor follow-up review

After the first review, the scene was split into `CalendarInstrument.tsx`,
`WorldFallback.tsx`, and the orchestration-only `WorldLayer.tsx`. A configured
Terra HIGH reviewer performed read-only source checks; runtime model identity
could not be independently confirmed. The reviewer found LP-06, which was
fixed and re-reviewed, and corrected LP-03's affected-file path. No further
actionable source issue was reported. The reviewer did not run app checks or
force a browser without IntersectionObserver. Applied project skills:
S012, S121, S147, S148, S151, S155, and S491.
