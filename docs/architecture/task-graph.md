# Foundation and landing-page task graph

This is the active dependency graph. Independent work stays in separate
worktrees with a named owner per file. The runtime does not technically
sandbox those worktrees; agents receive no credentials or personal data.

## Dependency graph

```text
F0-a 500-skill authoring ── F0-c independent skill audits ─ F0-c1 corrections ─ F0-c2 re-audit ─ F0-c3 corrections ─ F0-c4 final re-audit ─┐
F0-b Meta policy research ── F0-b2 AUP/terms review ─────┼─ F0 gate ─┬─ L1-a design system and page shell
F0-d CI and repository safety ────────────────────────────┘           └─ L1-b persistent 3D scroll world
```

L1-a and L1-b may start together after the architecture boundary is agreed and
F0 is complete. Their owned files do not overlap. The main agent owns shared
package manifests, lockfiles, routing integration, and final merges.

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
- **Status:** Ready to begin in an isolated coordination worktree.

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
- **Expected deliverable:** `WorldLayer` with the five-state instrument and
  an owned CSS fallback, ready for main-agent integration
- **Status:** Ready to begin in an isolated coordination worktree.

## Integration gates

Every task is reviewed for correctness, security, responsiveness, and its
acceptance evidence before merge. Shared files remain under one owner. No
feature is described as complete until its actual behavior has been tested.
