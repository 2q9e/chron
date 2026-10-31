# Skill library audit

## Scope and status

The audit covers the complete `SKILLS.md` at its 500-entry baseline. Independent
Luna MAX and Terra HIGH reviews have finished. Their findings are consolidated
below; these are review findings, not application-test results.

Root structural validation: IDs S001–S500 are sequential; the 15 category
totals match `PLAN.md`; all eight fields occur once and are nonempty; names are
unique; no exact duplicate purpose/implementation/verification text was found.
The curator reports a separate similarity sweep. Luna MAX and Terra HIGH have
completed both a second review and a final read-only review of the integrated
file. All SL-01–SL-18 are resolved in the skill text. Statuses below describe
documentation review only, not application or runtime verification.

## Findings

### SL-01 — Parser isolation is described as a worker-thread sandbox

- **Severity:** High
- **Affected files:** `SKILLS.md`, S285
- **Why it is a problem:** Worker threads share process privileges and do not
  enforce filesystem, network, credential, or resource isolation. Calling them
  a sandbox can lead to unsafe handling of hostile documents.
- **Recommended correction:** Require an enforced process/container boundary
  with a dedicated identity, restricted mounts, no network or credentials, and
  CPU, memory, time, file-count, and output limits. Threads may run inside that
  boundary for concurrency but are not a security boundary.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Inspect the revised skill; test that hostile parser
  code cannot read unrelated files/secrets or reach the network and that
  resource caps terminate it.
- **Status:** Closed in text review; parser-boundary runtime tests remain a future implementation requirement.

### SL-02 — Example content can leak into product empty states

- **Severity:** High
- **Affected files:** `SKILLS.md`, S036, S102, S324
- **Why it is a problem:** The guidance permits labelled examples and suggests a
  sample bank, which conflicts with Chron's no-samples rule for product-facing
  surfaces and can make fabricated records appear to be real user content.
  This also conflicts with the project rule that synthetic fixtures are
  test-only and never bundled.
- **Recommended correction:** Product empty states show the true empty state
  and a working create/import action. Runtime content must be user-provided or
  otherwise authorized; synthetic fixtures are test-only.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Inspect revised guidance and the later production
  artifact/empty state; confirm no fixtures are bundled.
- **Status:** Closed in text review; production bundles and empty states remain future implementation checks.

### SL-09 — Signup is listed without the adult and operator gates

- **Severity:** High
- **Affected files:** `SKILLS.md`, S015; also S054, S101, S236, S494
- **Why it is a problem:** Signup appears as a normal use case even though
  Chron's current rules keep signup disabled until operator/legal details and
  Meta eligibility are verified. Meta's published terms require integrated
  product end users to be at least 18 and prohibit targeting minors.
- **Recommended correction:** State that public signup is unavailable until
  operator/legal facts and applicable eligibility gates are verified; enforce
  18+ eligibility and do not target minors while current terms apply. Cross-link
  this product gate from signup, onboarding, and launch-readiness guidance.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Check S015 and related skills for the explicit gate;
  test that disabled signup has no active control and that a later real signup
  flow enforces the configured eligibility policy.
- **Status:** Closed in text review; signup eligibility enforcement remains a future implementation check.

### SL-10 — Generic secret-storage advice can bypass Meta permission

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S161, S160, S163, S222
- **Why it is a problem:** Generic encryption advice for API and OAuth secrets
  could be read as approval to store Meta credentials before written
  permission, despite the restriction in S160 and Chron's operating rules.
- **Recommended correction:** Limit advice to secrets whose storage is
  authorized; state that Meta credentials may only be accepted/stored after
  written permission and cross-reference the explicit key gate.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Search all credential-storage guidance for the same
  written-permission gate and confirm no implementation flow accepts keys
  beforehand.
- **Status:** Closed in text review; Meta key intake remains disabled pending written permission.

### SL-11 — Google integration recipes omit an activation prerequisite

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S279, S289–S309
- **Why it is a problem:** Several integration recipes describe OAuth and API
  calls without consistently requiring official API and current-terms review
  before enablement.
- **Recommended correction:** Add a shared activation gate requiring a
  verified official API, current terms/eligibility review, minimum OAuth
  scopes, and working disconnect/revocation behavior. Cross-reference it from
  every Google recipe.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Inspect all integration entries and confirm each
  points to the shared gate before OAuth or API use.
- **Status:** Closed in text review; per-service activation evidence remains a future implementation requirement.

### SL-12 — Camera clipping is presented as a privacy control

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S154
- **Why it is a problem:** Camera far-plane clipping affects rendering, not
  authorization. It cannot protect private scene geometry or assets already
  delivered to a browser.
- **Recommended correction:** Keep private geometry/assets off the client;
  describe clipping only as a composition, depth-precision, or performance
  control.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Inspect revised guidance and later verify private
  assets are never included in client scene data or bundles.
- **Status:** Closed in text review; client-bundle inspection remains a future implementation check.

### SL-13 — Indexes are blamed for query-value disclosure

- **Severity:** Low
- **Affected files:** `SKILLS.md`, S208
- **Why it is a problem:** Indexes are not the usual disclosure surface for SQL
  literals; execution plans, query logs, and monitoring captures can expose
  bound values.
- **Recommended correction:** Restrict access to plans/logs and redact bind
  values in monitoring rather than attributing disclosure to indexes.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Confirm the revised advice names the correct
  telemetry surfaces and preserves least-privilege access.
- **Status:** Closed in text review; telemetry access/redaction controls remain a future implementation check.

### SL-14 — One skill description contains an unclear sentence

- **Severity:** Low
- **Affected files:** `SKILLS.md`, S144
- **Why it is a problem:** The phrase “Copy overlays or accompanies a scene” is
  grammatically unclear and weakens the implementation instruction.
- **Recommended correction:** Rewrite it as “When copy overlays or accompanies
  a scene,” preserving its intended content.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Read the full revised entry for grammar and meaning.
- **Status:** Closed in text review.

### SL-03 — Consequential actions are gated only by high-impact tier

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S118, S275, with S193 approval binding
- **Why it is a problem:** Chron requires approval for every consequential
  action, and all calendar edits remain drafts until approval. A high-impact
  threshold can incorrectly authorize a lower-tier consequential write.
- **Recommended correction:** Separate impact tiers from permission checks;
  require explicit approval for each consequential action, bind it to the
  exact user, payload, and version, and keep calendar changes in draft state
  until approved.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Verify the revised policy covers a reversible but
  consequential write, calendar edit, payload change, and denied approval.
- **Status:** Closed in text review; execution-level approval tests remain a future implementation requirement.

### SL-04 — Calendar storage mixes timed and all-day values

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S346, S349
- **Why it is a problem:** Storing wall time, zone, and UTC instant for every
  event type can convert a date-only all-day event across a date boundary.
- **Recommended correction:** Model timed events with local time, IANA zone,
  and resolved instant; model all-day/date-only items as date values with no
  midnight conversion. State how recurrence and timezone changes apply.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Validate date-only round trips across multiple
  zones and timed-event recurrence across daylight-saving transitions.
- **Status:** Closed in text review; calendar behavior tests remain a future implementation requirement.

### SL-05 — Some workflows imply unapproved Meta generation

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S232, S321–S326
- **Why it is a problem:** These skills describe planning, tutoring, maps, and
  quiz generation without consistently stating that model inference remains
  disabled until written permission and capability checks are satisfied.
- **Recommended correction:** Cross-reference S236–S237, use only the official
  Meta API after written permission, and distinguish user-authored or
  deterministic workflows from model-generated features. No alternate
  inference provider is permitted.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Inspect each revised entry and confirm permission
  gates appear before any inference-adapter setup or network call.
- **Status:** Closed in text review; generation-route enforcement remains a future implementation requirement.

### SL-06 — Prompt-injection defense relies on model-context labels

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S189, S265
- **Why it is a problem:** Untrusted-source labels and schema checks do not
  enforce authorization. A prompt-injected source can still request a valid
  looking call unless the server independently checks identity, ownership,
  permissions, bounds, and approval.
- **Recommended correction:** State that labels are defense-in-depth only;
  independently authorize every call server-side, validate arguments and
  outputs, bound execution, and bind approval to the exact proposed action.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Use hostile-source test cases to prove the server
  rejects unauthorized calls even when the model emits a valid tool schema.
- **Status:** Closed in text review; server-side enforcement remains a future implementation requirement.

### SL-07 — Cancellation is described as stopping remote side effects

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S061, S247, S248, S281, S410
- **Why it is a problem:** An abort signal or deadline may stop local waiting
  after a remote service has already committed a change. It cannot guarantee
  rollback or cancellation after dispatch.
- **Recommended correction:** Distinguish user cancellation from deadline
  enforcement and local/unstarted work from writes already dispatched remotely.
  Make writes idempotent, persist operation state, reconcile unknown outcomes,
  and never report rollback without evidence. Align S061 and S410 with S247,
  S248, and S281.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Test timeout after remote commit, duplicate retry,
  unknown outcome reporting, and eventual reconciliation.
- **Status:** Closed in text review; runtime cancellation/reconciliation tests remain a future implementation requirement.

### SL-08 — Related skills lack visible scope boundaries

- **Severity:** Low
- **Affected files:** `SKILLS.md`, S023/S465, S039/S464, S067/S164,
  S078/S197/S268/S286, S189/S265, S247/S281, S051/S170, S052/S168,
  S060/S250, S072/S283, S019/S388/S392, S036/S102, S089/S470, S147/S473,
  S155/S424, S334/S341, S079/S236, S227/S435, S307/S368
- **Why it is a problem:** Distinct names are present, but several pairs have
  overlapping purposes or verification guidance, making skill selection
  ambiguous. S189/S265 substantially repeat prompt-injection controls, and
  S307 describes S368 as one-way while S368 still describes two-way edits.
  S247/S281 have distinct scopes but would benefit from a direct cross-link.
- **Recommended correction:** Define S189 as policy/context isolation and
  S265 as planner/action enforcement, with reciprocal cross-references. Define
  S368 as inbound one-way import conflicts with local edits and align its
  trigger/verification with S307. Add a direct cancellation/deadline cross-link
  between S247 and S281. Preserve the other reviewed distinctions and exact
  category counts.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Recheck names and compare purpose, implementation,
  and verification fields after editing; confirm no pair is merely duplicated.
- **Status:** Closed in text review; these scope boundaries remain subject to future usability review.

### SL-15 — Conflict detection omits date-only and mixed events

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S346, S349, S363
- **Why it is a problem:** S363 compares canonical instants, but all-day events
  are date-only intervals with no instant. It does not define overlap for
  all-day/all-day or timed/all-day pairs.
- **Recommended correction:** Define date interval comparisons and an explicit
  calendar-zone policy for mixed comparisons without mutating stored date-only
  values. Keep end-exclusive bounds consistent with S346/S349.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Specify and test same-date overlap, adjacent dates,
  mixed timed/all-day overlap, multiple display zones, and daylight-saving
  transitions.
- **Status:** Closed in text review; calendar conflict behavior tests remain a future implementation requirement.

### SL-16 — Parser recipes can imply worker isolation is a security boundary

- **Severity:** Medium
- **Affected files:** `SKILLS.md`, S285, S313, S393, S398
- **Why it is a problem:** S285 correctly requires OS-level isolation, but the
  parser/offload recipes mention isolated or limited workers without making
  clear that a worker alone does not isolate hostile parsing from filesystem,
  network, credentials, or resource exhaustion.
- **Recommended correction:** Cross-reference S285 in S313/S393/S398. State
  that browser/server worker offload is for performance or concurrency only;
  hostile server-side parsing must use S285's enforced boundary.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Review all parser recipes for consistent boundary
  language; later verify the actual parser sandbox against file, network, and
  resource-exhaustion attacks.
- **Status:** Closed in text review; parser boundary enforcement tests remain a future implementation requirement.

### SL-17 — Google Tasks cursor support is assumed

- **Severity:** Low
- **Affected files:** `SKILLS.md`, S291, S305, S306
- **Why it is a problem:** S305 assumes an "incremental token" and S306 names
  `syncToken` alongside `pageToken`. The current official [Google Tasks
  `tasks.list` reference](https://developers.google.com/workspace/tasks/reference/rest/v1/tasks/list)
  (updated 2026-10-29, checked 2026-10-30) documents `pageToken`, response
  `nextPageToken`, and `updatedMin`, but not `syncToken`.
- **Recommended correction:** Require the exact sync mechanism to be verified
  against the service's current official API under S291. Do not imply universal
  `syncToken` support; define pagination/reconciliation fallback only where
  official capability supports it.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Verify S305/S306 use the documented Tasks
  `pageToken`/`nextPageToken` and `updatedMin` behavior without claiming
  unsupported `syncToken` semantics; retain per-service official evidence and
  test the selected pagination/change-filter behavior before activation.
- **Status:** Closed after official-source review and text re-audit; live Tasks integration behavior remains untested.

### SL-18 — Generated-content wording omits the inference gate

- **Severity:** Low
- **Affected files:** `SKILLS.md`, S016, S236
- **Why it is a problem:** S016 mentions "generated content" without naming
  S236's written-permission and capability gate. It does not activate
  generation, but the wording is ambiguous beside the product-wide restriction.
- **Recommended correction:** Qualify the phrase as authorized generated
  content under S236.
- **Assigned agent:** Skill curator, GPT-6 Luna MAX correction pass
- **Verification method:** Read S016 with S236 and confirm the required
  authorization gate is explicit before any generated-content feature.
- **Status:** Closed in text review; inference-route enforcement remains a future implementation requirement.

## Independent review reconciliation

| Reviewer | Applied skills | Result |
| --- | --- | --- |
| Terra HIGH | S120, S156, S157, S189, S192, S193, S265, S269, S419, S494 | Final read-only audit passed structure and verified all SL-01–SL-18 corrections |
| Luna MAX | S107, S119, S120, S156, S243, S494 | Final read-only audit passed structure and verified all SL-01–SL-18 corrections |

The curator's second task reached its usage limit after making edits, before
returning a validation summary. The main agent integrated the worktree file,
fixed one punctuation issue, and independently reran structural and duplicate
checks. Luna MAX and Terra HIGH then independently verified the integrated
result. No application, browser, parser runtime, or provider tests were
performed; those remain feature-level verification requirements.
