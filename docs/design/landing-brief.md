# Chron landing page brief

## Product reading

Chron is an academic workspace organized around a student's real calendar,
study material, and research. The landing page explains that product intent;
it does not present unfinished features as available or imitate an application
screen.

## Truth and content constraints

- No sample accounts, fabricated deadlines, example notes, demo records,
  generated statistics, invented testimonials, or screenshots of an unfinished
  product.
- No placeholder links, controls, signup flows, or claims that are not backed
  by a working feature.
- Keep account creation and Meta inference unavailable until the operator has
  verified Meta's end-user eligibility, key-handling permission, and brand-use
  terms. The current official terms create unresolved questions for the planned
  BYOK flow and attribution. See `docs/research/meta-api.md` when integrated.
- The landing page's only primary action is an in-page link to a real section.
  A signup action can replace it only after signup is functional and allowed.
- The product visual is an original abstract sculpture, not a screenshot or a
  claim about a running feature.

## Design direction

Selected direction: **One motif**, drawn with seed `4202030` by the local
`design-taste-frontend` direction tool. The seed and resulting sheet are kept
under ignored `.taste-skill/` state; they are not public project assets.

Idea sentence: **On this page, Chron's cycle of academic time becomes one
spatial calendar instrument that changes as the visitor moves through the
story.** The scroll itself is the live interaction: native page scroll drives
one persistent 3D scene through reversible, authored chapters.

Keep the direction's single recurring circular motif, typographic restraint,
and contrasting color fields. Re-author its flat motif as a modeled, layered
calendar instrument to meet the requested 3D story. Do not use its people-photo
set, inline photo slots, fake interface fragments, sample itinerary, or
invented contact details. Drop the contact block because the operator has not
provided public contact details. These are explicit redraws required by the
no-samples rule and the 3D product brief; no prior application implementation
is used.

## Visual system

- Ground: graphite `#201E22`.
- Paper: mist `#E7E4E7`.
- Primary ink: near-black `#181619` on paper, mist on graphite.
- Accent: muted rose `#B95C76`, used on the physical time instrument and
  active story state, never as a gradient or glow.
- Supporting material: satin graphite, cut paper, and ceramic-like rose
  enamel. Avoid glass panels and decorative particles.
- Typeface: Hanken Grotesk, self-hosted from a licensed font package if the
  chosen license and package provenance check out. Use one family with a small
  number of deliberate weights.
- Layout: strong left-aligned editorial type; one focal object; unequal but
  balanced text and scene widths. Each section uses a distinct composition
  without becoming a repeated feature-card grid.
- The 3D world stays visual and abstract. Geometry may use real calendar
  structure (a seven-position weekly ring, repeated time marks, paper layers),
  but never fabricated personal records. The study transition should expose
  layered paper as the object turns; the research transition should resolve
  one continuous, restrained source path through those layers. Neither
  transition uses arbitrary rotation, interface labels, or mock records as
  explanation.

## Scroll-world ledger

One renderer, scene, and time instrument persist through the page. Native
document scroll is the source of truth. A normalized progress value determines
the exact authored chapter; smoothing is visual only and is disabled for
reduced motion.

| Chapter | User meaning | Spatial change | DOM content |
| --- | --- | --- | --- |
| Threshold | Chron is organized around academic time | A single circular calendar instrument comes into view | Product name, purpose, and in-page action |
| Week | Academic work has a weekly rhythm | The instrument opens into seven structural positions | Why calendar planning belongs at the center |
| Study | Learning needs room within the week | The same object turns to reveal layered study surfaces | Study material and focused work, described as product intent |
| Research | Answers depend on their sources | The layers resolve into a connected source path | Research and source context, described as product intent |
| Close | The story resolves to one workspace | The instrument returns to a clear whole-object view | Chron name and only working in-page navigation |

The transitions are spatial and reversible; chapter changes never replace the
world or teleport visible objects. No pointer interaction is required to
understand the story. Any 3D interaction must also have a semantic DOM control.

## Copy deck

**Hero heading:** Make room for learning.

**Hero support:** Chron is being built as an academic workspace for planning,
study materials, and research.

**Primary action:** Explore Chron. It moves to the page's real explanation
section.

**Week section:** Start with the week.

**Week text:** Classes, deadlines, and focused study all depend on the same
limited hours. Chron is designed around that shared calendar.

**Study section:** Keep study connected to its source.

**Study text:** Notes, questions, and review are part of one learning process.
Chron is being built to keep that work organized around the material a learner
brings.

**Research section:** Follow the evidence.

**Research text:** Research belongs beside the sources and documents that
support it. Chron's product direction keeps that context visible.

No feature is described as live unless its implementation is complete and
verified. Update this copy as actual capability ships.

## Responsive and accessibility contract

- Desktop, tablet, and phone receive authored scene compositions, not one
  desktop camera crop.
- Hide WebGL without hiding any text, action, or navigation. Provide a static
  CSS composition when WebGL is unavailable.
- Keep all story content in semantic HTML above the canvas.
- Support keyboard navigation, visible focus, zoom, WCAG AA contrast, and
  `prefers-reduced-motion` with a composed static state.
- Test the narrow layout at 320px as well as 390px, including the static
  composition and keyboard focus states.
- Avoid scroll hijacking. Test forward, reverse, rapid, and touch scrolling.

## Verification evidence

The page is not ready until the production build has been rendered in a real
browser at 1440px, 768px, and 390px widths; every scroll chapter and fallback
has been inspected; controls work with keyboard and touch; the reduced-motion
state has been captured; and the code and visual audit findings are recorded.
