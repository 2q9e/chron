# Project plan

## Product direction

Product name: **Chron**. Build an education and productivity workspace for
adult learners that combines academic time planning, study materials,
source-grounded research, and interactive learning. The app remains
independent of Meta and must use only the official Meta Model API for any
end-user inference. User-key intake and Meta attribution are gated on written
Meta clarification or permission; no other inference provider is allowed.

## Milestones and dependencies

| ID | Objective | Dependencies | Acceptance evidence |
| --- | --- | --- | --- |
| F0 | Clean repository, operating rules, 500-skill library, repository security and handoff | None | Fresh Git history; secret scan; 500 complete entries in the agreed categories; final independent skill audit; functional CI as soon as app code exists |
| R0 | Build the in-product agent skill catalog and source-selection policy | F0 | Distinct, versioned skill contracts with explicit triggers, exclusions, source strategy, freshness, citation, uncertainty, and stop rules; deterministic policy tests; no fabricated retrieval or inference |
| F0-c | Independently audit the skill library | F0-a | Luna MAX and Terra HIGH reviews; findings corrected, structurally validated, and re-audited |
| L1 | Premium responsive landing page and design tokens | F0 | Scroll narrative, reduced-motion/static fallback, real browser screenshots at desktop/mobile |
| L2 | Sign-in and signup surfaces connected to real auth | F0, L1 | Server-backed flow, policy/version gates, no fake account state |
| S1 | Authentication, sessions, database isolation, credential encryption | F0 | Integration/security tests for sessions, ownership, deletion and key handling |
| M1 | Meta BYOK and official Model API client | S1, F0-b legal/policy gate | Written Meta permission for key flow, approved attribution, 18+ audience, server-only credential use, real API validation, Meta-only checks |
| C1 | Calendar views, events, recurrence, reminders, themes | S1 | Persisted day/week/month/agenda flows and time-zone/DST coverage |
| A1 | Permissioned agent plan/tool/verify loop | M1, C1 | Typed tools, approval previews, cancellation, bounds, audit history |
| E1 | Notebooks, uploads, citations, quizzes and spaced repetition | M1, S1 | Source-linked interactions, persisted progress, upload safety tests |
| R1 | Web/document research and source comparison | M1, A1 | Safe retrieval, SSRF controls, cited evidence and uncertainty handling |
| G1 | Official Google integrations, prioritized by academic value | S1, A1 | Minimal-scope OAuth, disconnect/revoke, real import and approval flows |
| Q1 | Independent audits and full user journey | L2, S1, M1, C1, A1, E1, R1, G1 | Security, visual, accessibility, performance, browser and data deletion evidence |

The user has reprioritized C1 ahead of L1. Landing-page work is paused. The
first calendar increment now includes a persisted event and preference API,
protected sign-in/route, day/week/month/agenda views, editable events, themes,
and a server-side conflict check before approval. Bounded event-title search is
implemented in source with a date and event-kind filter. Finite recurrence and
the reminder delivery contract plus DST-aware time calculation are implemented
in source. Reminder choices and owner-scoped outbox writes now persist
atomically for one-off events and approved series. A bounded delivery worker,
protected internal endpoint, and HTTPS scheduler are also implemented in
source. The editor now offers type-specific reminder choices and shows the
calculated local delivery time before saving. A private, authenticated status
read and editor panel now show persisted job counts and safe failure categories.
Database-backed behavior, SMTP delivery, and staging remain unverified. Public
staging and email URLs must use HTTPS; the testing hostname currently has no
DNS record. Drag scheduling, external sync, and a real database/browser
walkthrough remain open until integrated and verified. See
`docs/architecture/calendar-reminders.md` for the reminder dependency graph
and acceptance criteria.

## Skill library category allocation

`SKILLS.md` is the development team's 500-entry engineering reference. It is
not the product agent's runtime skill set. Runtime competencies live with the
agent feature and contain executable routing metadata and user-task
instructions; source names alone are not a substitute for deciding whether,
when, and how to retrieve evidence.

The suggested allocation in the brief totals 520. To satisfy the required
exact total of 500, use this adjusted distribution:

| Category | Count |
| --- | ---: |
| Frontend engineering | 40 |
| Backend engineering | 40 |
| UI/UX and visual design | 40 |
| 3D graphics and animation | 35 |
| Security engineering | 45 |
| Database engineering | 30 |
| Agent orchestration | 40 |
| Tool systems and integrations | 40 |
| Educational technology | 35 |
| Calendar engineering | 25 |
| Performance optimization | 30 |
| Testing and reliability | 35 |
| DevOps and GitHub | 25 |
| Accessibility | 20 |
| Architecture and maintainability | 20 |
| **Total** | **500** |

## Current execution graph

See [the detailed task contracts](docs/architecture/task-graph.md) for model,
reasoning, ownership, access boundaries, acceptance criteria, tests, and
deliverables.

| Task | Objective | Agent/model | Dependencies | Owned files | Read-only files | Skills | Operations and verification |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F0-a | Author the 500-entry skill library | Skill curator, GPT-6 Luna MAX | Bootstrap files | `SKILLS.md` | `AGENTS.md`, `PLAN.md` | Skill taxonomy, security review, documentation quality | Coordination worktree only; validator checks IDs, fields, counts, and duplicate guidance |
| F0-b | Verify official Meta API constraints and record the current integration boundary | Research reviewer, GPT-6.1 Terra HIGH | Bootstrap files | `docs/research/meta-api.md` | `AGENTS.md`, `PLAN.md` | Meta API integration, credential protection, policy review | Official Meta docs only; cite URLs and distinguish verified facts from inference; main agent verifies source relevance before integration |
| F0-b2 | Review current AUP and incorporated processor/security terms | Research reviewer, GPT-6.1 Terra HIGH | F0-b | `docs/research/meta-api.md` | `AGENTS.md`, `PLAN.md` | Official-source verification, policy review, privacy/security | Review official sources only; identify inaccessible material and retain it as an explicit launch gate |
| F0-c | Independently audit all skill entries | GPT-6 Luna MAX; GPT-6.1 Terra HIGH second opinion | F0-a | Review findings | `AGENTS.md`, `PLAN.md`, `SKILLS.md` | Skill quality, deduplication, technical/security review | Both reviews complete; findings recorded in `docs/audits/skill-library.md` |
| F0-c1 | Remediate all accepted skill findings | Skill curator, GPT-6 Luna MAX | F0-c | `SKILLS.md` | `AGENTS.md`, `PLAN.md`, audit findings | Security, quality, category, and technical correctness skills | Correct high/medium issues; disposition low issues; rerun all structural checks |
| F0-c2 | Re-audit the corrected library | GPT-6 Luna MAX and GPT-6.1 Terra HIGH | F0-c1 | Review findings | `AGENTS.md`, `PLAN.md`, `SKILLS.md`, audit findings | Same audit skills as F0-c | Two read-only verification reports; no finding closes without evidence |
| F0-c3 | Correct residual skill findings | Skill curator, GPT-6 Luna MAX | F0-c2 | `SKILLS.md` | `AGENTS.md`, `PLAN.md`, audit findings | Cancellation, calendar dates, parser boundaries, provider API verification, injection policy | Correct SL-07/08 and SL-15–18; preserve 500 entries and rerun all structural checks |
| F0-c4 | Final independent skill re-audit | GPT-6 Luna MAX and GPT-6.1 Terra HIGH | F0-c3 | Review findings | `AGENTS.md`, `PLAN.md`, `SKILLS.md`, audit findings | Same relevant skills as F0-c2 | Both reviewers confirm structure and close all text findings before L1 |
| F0-d | Protect public repository and configure CI | Main agent, fixed runtime model disclosed | Reviewed file list, initial clean push | `.gitignore`, `.github/**`, GitHub settings | All project docs and source | Secret scanning, dependency security, branch protection | GitHub secret scanning/push protection, Dependabot alerts/updates, private reporting are enabled; add real checks with the application manifest |
| L1-a | Implement the landing page and design system | Frontend engineer, GPT-6 Luna MAX | F0 | `apps/web/**` | `AGENTS.md`, `SKILLS.md`, `PLAN.md` | Landing-page art direction, React, Three.js, scroll, accessibility, performance | Separate worktree; build and run browser visual checks before handoff |

No task may own overlapping files in the same milestone. Agents do not receive
credentials or user data. Worktree separation is not an OS security sandbox.

## Current external gates

- Meta's current Terms require API users and integrated-product end users to
  be 18 or older, bar products targeted at minors, restrict API-key sharing
  outside an issuing team, and grant no trademark license. The exact
  server-side BYOK flow and requested Meta attribution need written
  clarification or permission. Keep both out of the product until resolved.
- The current Acceptable Use Policy was reviewed on 2026-10-30. It adds
  education-specific limits, provenance duties, and human-review requirements
  for some decisions and agent actions. The linked processor and data-security
  terms redirect to a blocked login and remain unverified. Account-level model
  availability, billing, and model behavior cannot be verified without an
  authorized test account.
- Non-AI features can proceed while these gates remain open.
