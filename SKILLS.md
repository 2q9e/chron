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
