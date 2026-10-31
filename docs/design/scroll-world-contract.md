# Landing scroll-world contract

This document defines the integration boundary for L1-a (semantic page and
scroll bridge) and L1-b (Three.js scene). It describes an implementation
contract, not a product feature claim.

## Story DOM and progress signal

- The landing route owns one `main` region and five ordered narrative
  sections. Each section uses `data-world-stop`; order is threshold, week,
  study, research, close. Section IDs support ordinary in-page links.
- A client-side bridge measures the five section positions against native
  document scroll, clamps progress to `[0, 1]`, and coalesces scroll and resize
  updates through `requestAnimationFrame`.
- The bridge emits `window` event `chron:story-progress` as
  `CustomEvent<number>`; `detail` is the normalized progress value. It also
  recomputes after history navigation and layout changes, and removes all
  listeners when unmounted.
- The bridge never prevents or replaces wheel, keyboard, touch, anchor, or
  browser history scrolling. Missing markers fail closed to a static scene.

## Scene boundary

- `apps/web/features/landing/world/WorldLayer.tsx` exports `WorldLayer`.
  The route loads it through a client-only boundary; the component owns one
  persistent React Three Fiber `Canvas` and listens for the progress event.
- The scene remains decorative and `aria-hidden`. All meaning, headings,
  navigation, and actions live in semantic HTML. The Canvas does not intercept
  pointer or keyboard input.
- Progress changes the same authored instrument through the five chapter
  states. The world contains no interface text, user records, sample
  schedules, generated statistics, or externally downloaded assets.
- A stable reduced-motion composition ignores chapter motion. WebGL failure or
  context loss falls back to a CSS still while leaving the full DOM story
  usable. No controls depend on the canvas.
- Use demand rendering where possible, cap pixel ratio, stop work while
  offscreen, and dispose owned GPU resources on teardown. Scene transitions
  are reversible and use native scroll as their source of truth.

## Verification

Verify normal, reduced-motion, and unavailable-WebGL behavior at 1440, 768,
390, and 320 CSS pixels. Check keyboard navigation and focus, anchor jumps,
back/forward, resize, rapid forward/reverse scrolling, touch flings, and
context-loss recovery. Capture a real browser rendering before making any
visual-quality or performance claim.
