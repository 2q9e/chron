# Development skill library

This index contains 500 practical development skills for Chron. Entries are grouped by the exact category allocations in `PLAN.md`; IDs run consecutively from S001 to S500. Select a relevant skill before significant work and apply its implementation and verification guidance. Security notes describe the risk specific to that skill.

## Index

| Category | Count | IDs |
| --- | ---: | --- |
| Frontend engineering | 40 | S001–S040 |
| Backend engineering | 40 | S041–S080 |
| UI/UX and visual design | 40 | S081–S120 |
| 3D graphics and animation | 35 | S121–S155 |
| Security engineering | 45 | S156–S200 |
| Database engineering | 30 | S201–S230 |
| Agent orchestration | 40 | S231–S270 |
| Tool systems and integrations | 40 | S271–S310 |
| Educational technology | 35 | S311–S345 |
| Calendar engineering | 25 | S346–S370 |
| Performance optimization | 30 | S371–S400 |
| Testing and reliability | 35 | S401–S435 |
| DevOps and GitHub | 25 | S436–S460 |
| Accessibility | 20 | S461–S480 |
| Architecture and maintainability | 20 | S481–S500 |

Each record includes Skill ID, Name, Purpose, When to use, Implementation approach, Recommended tools, Security considerations, and Verification method.

This is development guidance, not user-facing product content. Do not ship samples, placeholders, stubs, fake demos, or seeded product records. Synthetic fixtures are test-only and must never be bundled into the application.

## Frontend engineering

### S001 — Server/client component boundaries

- **Skill ID:** S001
- **Name:** Server/client component boundaries
- **Purpose:** Keep browser-only state out of server-rendered modules
- **When to use:** When a route mixes private data loading and interactive controls
- **Implementation approach:** Fetch protected data in server components; isolate event handlers in small client leaves
- **Recommended tools:** Next.js App Router, React, TypeScript
- **Security considerations:** Never serialize credentials or authorization decisions into client props
- **Verification method:** Build route fixtures and assert private fields are absent from rendered payloads

### S002 — Route segment loading states

- **Skill ID:** S002
- **Name:** Route segment loading states
- **Purpose:** Make slow route transitions communicate progress without layout jumps
- **When to use:** When a page streams data or waits on a nested segment
- **Implementation approach:** Place loading boundaries at the segment that owns the pending work; reserve final geometry
- **Recommended tools:** Next.js loading.tsx, React Suspense
- **Security considerations:** Do not reveal whether another user’s resource exists through loading text
- **Verification method:** Throttle requests in browser and compare fallback geometry with resolved content

### S003 — Route-level error boundaries

- **Skill ID:** S003
- **Name:** Route-level error boundaries
- **Purpose:** Contain recoverable rendering failures to the affected page area
- **When to use:** When a feature can fail independently of global navigation
- **Implementation approach:** Use an error boundary per route segment with a safe retry action and sanitized message
- **Recommended tools:** Next.js error.tsx, React Error Boundary
- **Security considerations:** Keep stack traces and server response bodies out of the UI
- **Verification method:** Force a segment exception and confirm navigation remains usable

### S004 — Streaming server rendering

- **Skill ID:** S004
- **Name:** Streaming server rendering
- **Purpose:** Send stable page regions before slower server data completes
- **When to use:** When above-the-fold content does not depend on secondary queries
- **Implementation approach:** Stream independent regions behind Suspense and keep response headers correct
- **Recommended tools:** React Suspense, Next.js, browser network panel
- **Security considerations:** Avoid streaming protected data before session authorization finishes
- **Verification method:** Test slow and rejected data sources; inspect first-byte and content ordering

### S005 — Server actions and mutations

- **Skill ID:** S005
- **Name:** Server actions and mutations
- **Purpose:** Connect form submissions to validated server mutations
- **When to use:** When a user action can persist application state
- **Implementation approach:** Parse input server-side, check session and ownership, then return typed outcomes
- **Recommended tools:** Next.js Server Actions, Zod, TypeScript
- **Security considerations:** Treat hidden action identifiers as public; reauthorize every request
- **Verification method:** Submit malformed and cross-user inputs and assert no mutation occurs

### S006 — URL-backed view state

- **Skill ID:** S006
- **Name:** URL-backed view state
- **Purpose:** Make filters and selected views shareable and browser-navigable
- **When to use:** When search, tabs, sort, or calendar mode should survive reload
- **Implementation approach:** Parse query params into a validated state model and update with history-aware navigation
- **Recommended tools:** URLSearchParams, Next.js navigation
- **Security considerations:** Do not put tokens, private notes, or sensitive search terms in URLs
- **Verification method:** Reload, copy link, and use back/forward while checking state fidelity

### S007 — Component-local state

- **Skill ID:** S007
- **Name:** Component-local state
- **Purpose:** Keep transient interaction state close to its owning component
- **When to use:** When a value has no cross-route persistence requirement
- **Implementation approach:** Use the narrowest React state owner and lift only for a real shared consumer
- **Recommended tools:** React useState, TypeScript
- **Security considerations:** Clear transient secrets and file previews when their owner unmounts
- **Verification method:** Exercise open/close and unmount paths; inspect for stale visible state

### S008 — Derived state discipline

- **Skill ID:** S008
- **Name:** Derived state discipline
- **Purpose:** Prevent duplicated state from drifting out of sync
- **When to use:** When a value can be calculated from props or stored records
- **Implementation approach:** Compute it during render or memoize only measured expensive derivations
- **Recommended tools:** React, React DevTools Profiler
- **Security considerations:** Avoid copying authorization status into client state as a trusted fact
- **Verification method:** Change each input source and verify the derived value updates immediately

### S009 — Reducer-based workflows

- **Skill ID:** S009
- **Name:** Reducer-based workflows
- **Purpose:** Model multi-step UI transitions as explicit state changes
- **When to use:** When interactions have guarded phases or rollback paths
- **Implementation approach:** Define discriminated actions and keep transitions in a pure reducer
- **Recommended tools:** React useReducer, TypeScript discriminated unions
- **Security considerations:** Reject impossible states before they reach privileged mutation controls
- **Verification method:** Unit-test every allowed transition and representative invalid action

### S010 — Context provider boundaries

- **Skill ID:** S010
- **Name:** Context provider boundaries
- **Purpose:** Share stable dependencies without rerendering unrelated subtrees
- **When to use:** When several descendants need the same theme, session view, or command bus
- **Implementation approach:** Split contexts by update frequency and memoize provider values
- **Recommended tools:** React Context, useMemo, Profiler
- **Security considerations:** Never use context as a shortcut for delivering raw API credentials
- **Verification method:** Profile a provider update and assert only intended consumers rerender

### S011 — Custom hook contracts

- **Skill ID:** S011
- **Name:** Custom hook contracts
- **Purpose:** Package reusable behavior with clear inputs, outputs, and lifecycle
- **When to use:** When the same stateful browser behavior appears in multiple features
- **Implementation approach:** Keep hooks deterministic, document returned actions, and clean up subscriptions
- **Recommended tools:** React Hooks, ESLint hooks plugin, TypeScript
- **Security considerations:** Do not let hooks bypass server authorization or expose secret-bearing responses
- **Verification method:** Use hook tests for setup, rerender, cleanup, and error transitions

### S012 — Effect lifecycle management

- **Skill ID:** S012
- **Name:** Effect lifecycle management
- **Purpose:** Synchronize with external systems without stale closures or leaks
- **When to use:** When a component subscribes to an API, timer, or browser event
- **Implementation approach:** Make effects idempotent, depend on actual inputs, and return complete cleanup
- **Recommended tools:** React useEffect, AbortController, ESLint
- **Security considerations:** Abort requests on account changes so prior-user responses cannot render
- **Verification method:** Unmount during an in-flight request and verify listener and request cleanup

### S013 — Ref-based imperative access

- **Skill ID:** S013
- **Name:** Ref-based imperative access
- **Purpose:** Use refs for DOM focus and imperative APIs without extra renders
- **When to use:** When a modal, input, or media element needs direct browser control
- **Implementation approach:** Expose a narrow imperative handle and preserve declarative state as the source of truth
- **Recommended tools:** React useRef, forwardRef, browser DOM APIs
- **Security considerations:** Do not store bearer tokens or long-lived personal data in DOM refs
- **Verification method:** Test focus restoration and ref nulling across mount/unmount

### S014 — Controlled form design

- **Skill ID:** S014
- **Name:** Controlled form design
- **Purpose:** Keep form values and validation feedback synchronized
- **When to use:** When fields need live validation or dependent controls
- **Implementation approach:** Use typed form state, touched tracking, and server-confirmed submission results
- **Recommended tools:** React, React Hook Form, Zod
- **Security considerations:** Avoid logging field contents; mask passwords and key inputs
- **Verification method:** Keyboard-submit valid, invalid, and corrected forms; assert error association

### S015 — Progressive form enhancement

- **Skill ID:** S015
- **Name:** Progressive form enhancement
- **Purpose:** Keep essential forms usable while enforcing verified account-eligibility gates
- **When to use:** For search/settings normally; public signup stays unavailable until operator/legal facts, Meta eligibility, and adult-use gates are verified under S236
- **Implementation approach:** Keep signup inactive until the server-side policy gate passes; then use semantic native forms and validate all submitted fields on the server
- **Recommended tools:** HTML forms, Next.js actions, React
- **Security considerations:** Apply 18+ eligibility while current Meta terms require it and do not target minors; client checks, email verification, or hidden controls never substitute for server eligibility
- **Verification method:** Assert both signup UI and endpoint deny while gates are unmet; after approval test the configured eligibility policy with synthetic accounts

### S016 — Async transition feedback

- **Skill ID:** S016
- **Name:** Async transition feedback
- **Purpose:** Keep UI responsive while a nonurgent state transition completes
- **When to use:** When filtering, navigation, or model-generated content authorized under S236 may take noticeable time; keep generation unavailable while that gate is closed
- **Implementation approach:** Mark nonurgent updates as transitions and retain the last stable view; a UI transition never authorizes starting inference
- **Recommended tools:** React useTransition, Suspense
- **Security considerations:** Require S236 before inference and discard stale results after user or query context changes
- **Verification method:** Race two slow transitions and confirm the newest intent wins

### S017 — Optimistic mutation rollback

- **Skill ID:** S017
- **Name:** Optimistic mutation rollback
- **Purpose:** Show quick feedback while preserving correctness if a write fails
- **When to use:** When reversible actions have a clear server-confirmed result
- **Implementation approach:** Apply an optimistic patch, retain a rollback snapshot, reconcile on response
- **Recommended tools:** TanStack Query, React, server action
- **Security considerations:** Do not optimistically claim destructive or permission-sensitive actions succeeded
- **Verification method:** Simulate conflict and network failure; verify rollback and retry affordance

### S018 — Race-safe data fetching

- **Skill ID:** S018
- **Name:** Race-safe data fetching
- **Purpose:** Prevent outdated requests from replacing newer search results
- **When to use:** When typeahead or filters can issue overlapping requests
- **Implementation approach:** Cancel obsolete requests and tag responses with the initiating query key
- **Recommended tools:** fetch, AbortController, TanStack Query
- **Security considerations:** Drop responses belonging to a signed-out or switched account session
- **Verification method:** Delay responses out of order and assert only the latest query is shown

### S019 — Query cache ownership

- **Skill ID:** S019
- **Name:** Query cache ownership
- **Purpose:** Keep cached server state fresh and isolated by user identity
- **When to use:** When several screens consume the same persisted resource
- **Implementation approach:** Use structured query keys, explicit invalidation, and session-scoped cache clearing
- **Recommended tools:** TanStack Query, React Query Devtools
- **Security considerations:** Clear user-scoped cache on logout and avoid secrets in cache keys
- **Verification method:** Switch mock accounts and verify no previous account data flashes

### S020 — Infinite list pagination

- **Skill ID:** S020
- **Name:** Infinite list pagination
- **Purpose:** Load large collections incrementally without duplicates or missing rows
- **When to use:** When a notebook, task list, or activity feed exceeds one viewport
- **Implementation approach:** Use cursor pagination, stable item keys, and a clear end-of-list state
- **Recommended tools:** TanStack Query, IntersectionObserver
- **Security considerations:** Authorize every cursor request and avoid leaking total counts across tenants
- **Verification method:** Insert records between pages and verify cursor traversal remains stable

### S021 — Virtualized long lists

- **Skill ID:** S021
- **Name:** Virtualized long lists
- **Purpose:** Render only visible rows when record counts exceed practical DOM size
- **When to use:** When profiling shows list rendering harms scrolling or input latency
- **Implementation approach:** Use fixed or measured row geometry and preserve focus when rows recycle
- **Recommended tools:** TanStack Virtual, React Profiler
- **Security considerations:** Keep offscreen sensitive content out of reused DOM nodes
- **Verification method:** Profile a large synthetic test fixture and keyboard-navigate recycled rows; keep fixtures out of the product bundle

### S022 — Accessible data tables

- **Skill ID:** S022
- **Name:** Accessible data tables
- **Purpose:** Implement sortable tables with native row/header semantics and stable data layout
- **When to use:** When users compare deadlines, study items, or audit history
- **Implementation approach:** Use native table structure and label active sort state; use S476 for screen-reader navigation checks
- **Recommended tools:** HTML table, aria-sort, TanStack Table
- **Security considerations:** Escape untrusted cell text; never render HTML from imported records
- **Verification method:** Test sort behavior, column alignment, and semantic headers; use S476 for assistive-technology navigation coverage

### S023 — Keyboard interaction model

- **Skill ID:** S023
- **Name:** Keyboard interaction model
- **Purpose:** Define the expected keyboard behavior for each custom widget pattern
- **When to use:** When a component implements menu, listbox, tabs, or grid behavior
- **Implementation approach:** Map standard keys to predictable movement and keep focus visible; use S465 for broader keyboard accessibility review
- **Recommended tools:** React, WAI-ARIA Authoring Practices, Testing Library
- **Security considerations:** Prevent keyboard shortcuts from firing inside sensitive text inputs
- **Verification method:** Run key-by-key tests including Escape, Tab, Home/End, and arrows; cover reusable widgets before S465 page-level checks

### S024 — Reusable component API design

- **Skill ID:** S024
- **Name:** Reusable component API design
- **Purpose:** Keep shared controls composable without hidden global assumptions
- **When to use:** When a pattern appears across multiple features
- **Implementation approach:** Use explicit props, semantic defaults, and composition slots over boolean overloads
- **Recommended tools:** React, TypeScript, Storybook
- **Security considerations:** Avoid APIs that expose internal authorization flags as user-controlled props
- **Verification method:** Type-check representative consumer compositions and render state stories

### S025 — Compound component coordination

- **Skill ID:** S025
- **Name:** Compound component coordination
- **Purpose:** Coordinate related controls while keeping markup ownership flexible
- **When to use:** When components such as tabs or menus share selection state
- **Implementation approach:** Use a scoped provider with stable IDs and controlled/uncontrolled modes
- **Recommended tools:** React Context, React Aria, TypeScript
- **Security considerations:** Validate referenced IDs and keep hidden panels from exposing private content
- **Verification method:** Test controlled and uncontrolled use plus nested instance isolation

### S026 — Polymorphic component typing

- **Skill ID:** S026
- **Name:** Polymorphic component typing
- **Purpose:** Support semantic element choice without losing prop safety
- **When to use:** When design primitives need links, buttons, or headings as their root
- **Implementation approach:** Use a constrained `as` API or separate semantic variants with inferred props
- **Recommended tools:** TypeScript, React, tsd
- **Security considerations:** Do not let a visual primitive turn a noninteractive element into a fake control
- **Verification method:** Compile positive and negative usage examples and inspect rendered semantics
