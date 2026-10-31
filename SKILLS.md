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

### S027 — Type-safe event handlers

- **Skill ID:** S027
- **Name:** Type-safe event handlers
- **Purpose:** Preserve native event types through reusable interaction helpers
- **When to use:** When extracting keyboard, pointer, or form handlers
- **Implementation approach:** Use specific React event types and narrow target values before access
- **Recommended tools:** TypeScript, React types, ESLint
- **Security considerations:** Do not trust event payloads as validated server input
- **Verification method:** Run strict type checking and exercise the event with a realistic DOM target

### S028 — Feature module boundaries

- **Skill ID:** S028
- **Name:** Feature module boundaries
- **Purpose:** Keep UI, data access, and presentation ownership coherent
- **When to use:** When adding a new route or a feature shared by multiple pages
- **Implementation approach:** Group components and hooks by product capability; export narrow entry points
- **Recommended tools:** TypeScript path aliases, ESLint boundaries
- **Security considerations:** Prevent a client feature from importing server-only modules
- **Verification method:** Run dependency graph lint and verify forbidden imports fail

### S029 — CSS module scoping

- **Skill ID:** S029
- **Name:** CSS module scoping
- **Purpose:** Prevent feature styles from leaking into unrelated surfaces
- **When to use:** When a component has bespoke layout or state styling
- **Implementation approach:** Use local classes for structure and shared tokens for cross-feature values
- **Recommended tools:** CSS Modules, PostCSS, stylelint
- **Security considerations:** Do not rely on CSS hiding as the authorization boundary for data
- **Verification method:** Render two feature instances together and inspect computed style collisions

### S030 — Design token consumption

- **Skill ID:** S030
- **Name:** Design token consumption
- **Purpose:** Make product-wide visual changes without inconsistent local values
- **When to use:** When authoring colors, spacing, radii, or typography
- **Implementation approach:** Reference named CSS variables and document semantic token intent
- **Recommended tools:** CSS custom properties, Stylelint
- **Security considerations:** Avoid encoding trust or warning state with color alone
- **Verification method:** Search for raw values and verify light/dark token contrast at component states

### S031 — Container-query layouts

- **Skill ID:** S031
- **Name:** Container-query layouts
- **Purpose:** Adapt embedded panels to their actual available width
- **When to use:** When sidebars or resizable panes host responsive components
- **Implementation approach:** Set an inline-size container and author component-level breakpoints
- **Recommended tools:** CSS container queries, browser devtools
- **Security considerations:** Ensure zoomed text and long labels cannot clip inside constrained containers
- **Verification method:** Resize the host pane independently of viewport and inspect overflow

### S032 — Responsive image delivery

- **Skill ID:** S032
- **Name:** Responsive image delivery
- **Purpose:** Serve suitable image dimensions and formats for each viewport
- **When to use:** When product imagery is larger than an icon or small illustration
- **Implementation approach:** Use responsive sources, intrinsic dimensions, and crop rules per art direction
- **Recommended tools:** Next.js Image, srcset, AVIF/WebP
- **Security considerations:** Use trusted origins and avoid exposing private upload URLs in public markup
- **Verification method:** Throttle mobile network and verify selected source, layout stability, and alt text

### S033 — Web font loading strategy

- **Skill ID:** S033
- **Name:** Web font loading strategy
- **Purpose:** Keep typography stable while downloading intended font files
- **When to use:** When a custom family improves product identity or legibility
- **Implementation approach:** Subset needed weights, preload only critical faces, and choose a compatible fallback
- **Recommended tools:** Fontsource, CSS font-display, Lighthouse
- **Security considerations:** Use licensed font files and avoid third-party font requests that leak page visits
- **Verification method:** Throttle network and compare fallback shift and glyph coverage

### S034 — Semantic route landmarks

- **Skill ID:** S034
- **Name:** Semantic route landmarks
- **Purpose:** Give assistive technology a predictable page outline
- **When to use:** When a route introduces primary content, navigation, or complementary regions
- **Implementation approach:** Use one main landmark, ordered headings, and labelled navigation regions
- **Recommended tools:** HTML5, axe-core, React Testing Library
- **Security considerations:** Do not use hidden landmark content to expose private route names
- **Verification method:** Inspect accessibility tree and verify skip links reach the main region

### S035 — Inline error recovery

- **Skill ID:** S035
- **Name:** Inline error recovery
- **Purpose:** Show field and request errors next to a useful recovery action
- **When to use:** When validation or persistence fails in a form flow
- **Implementation approach:** Preserve safe user input and associate errors with the affected control
- **Recommended tools:** React, aria-describedby, server action results
- **Security considerations:** Do not echo database errors, SQL text, or submitted secrets
- **Verification method:** Force validation and server failures; confirm focus and error announcement

### S036 — Empty collection guidance

- **Skill ID:** S036
- **Name:** Empty collection guidance
- **Purpose:** Help a first-time user take a real next step from a genuinely empty collection
- **When to use:** When the authenticated user truly has no saved events, notebooks, or sources; pair copy with S102
- **Implementation approach:** Render the true zero-record state and one working create or authorized import action; never prepopulate or depict example records
- **Recommended tools:** React, product copy system
- **Security considerations:** Only user-provided or otherwise authorized content belongs in product views; synthetic fixtures are test-only and never bundled
- **Verification method:** Use an empty test account, confirm no records are fabricated, and activate the CTA to verify a real create/import flow

### S037 — Skeleton geometry

- **Skill ID:** S037
- **Name:** Skeleton geometry
- **Purpose:** Reserve space for delayed content without implying false data
- **When to use:** When a stable region has a predictable loading shape
- **Implementation approach:** Match skeleton blocks to final text and remove them when data settles
- **Recommended tools:** CSS animations, React Suspense
- **Security considerations:** Do not make a skeleton look like a completed private record
- **Verification method:** Capture loading and loaded states; check layout shift and reduced-motion mode

### S038 — Portal and overlay layering

- **Skill ID:** S038
- **Name:** Portal and overlay layering
- **Purpose:** Render overlays outside clipping ancestors while preserving ownership
- **When to use:** When dialogs or menus escape a scroll container
- **Implementation approach:** Use a centralized portal root and explicit stacking tokens
- **Recommended tools:** ReactDOM createPortal, Floating UI
- **Security considerations:** Lock background access for modal state and avoid leaking hidden dialog text
- **Verification method:** Test nested scroll containers, stacking, Escape, and screen reader isolation

### S039 — Focus trap lifecycle

- **Skill ID:** S039
- **Name:** Focus trap lifecycle
- **Purpose:** Contain and restore focus for modal dialogs
- **When to use:** When a dialog requires a modal interaction model
- **Implementation approach:** Capture opener, trap Tab cycling only while modal, handle Escape, then restore focus; see S464 for dialog entry/exit focus placement
- **Recommended tools:** React Aria Dialog, focus-trap library
- **Security considerations:** Do not trap focus for nonmodal notifications or block emergency escape
- **Verification method:** Test first/last Tab wrapping, Escape, and restoration after unmount; see S464 for initial focus and accessible dialog lifecycle

### S040 — Safe rich text rendering

- **Skill ID:** S040
- **Name:** Safe rich text rendering
- **Purpose:** Display formatted user or imported text without enabling script execution
- **When to use:** When rendering user text or authorized Meta model output under S236 as limited Markdown
- **Implementation approach:** Parse to an allowlisted AST and render known nodes as React elements
- **Recommended tools:** remark, rehype-sanitize, DOMPurify where needed
- **Security considerations:** Disallow raw HTML, dangerous URL schemes, and untrusted embeds
- **Verification method:** Fuzz links and markup payloads; assert scripts and event attributes never execute

## Backend engineering

### S041 — Request payload validation

- **Skill ID:** S041
- **Name:** Request payload validation
- **Purpose:** Reject malformed requests before business logic runs
- **When to use:** When an endpoint accepts JSON, query values, or form data
- **Implementation approach:** Parse with a runtime schema and return field-level safe errors
- **Recommended tools:** Zod, TypeScript, Fastify or framework validators
- **Security considerations:** Never rely on client-side constraints or coerce ambiguous identifiers
- **Verification method:** Fuzz missing, oversized, and wrong-type fields at the route boundary

### S042 — REST resource semantics

- **Skill ID:** S042
- **Name:** REST resource semantics
- **Purpose:** Make resource operations predictable across clients
- **When to use:** When designing create, read, update, or delete endpoints
- **Implementation approach:** Use consistent verbs, status codes, and ownership-scoped resource paths
- **Recommended tools:** Fastify, Hono, OpenAPI
- **Security considerations:** Do not expose internal database IDs without a product need
- **Verification method:** Contract-test status codes and response shapes for each method

### S043 — API version evolution

- **Skill ID:** S043
- **Name:** API version evolution
- **Purpose:** Change public contracts without surprising existing clients
- **When to use:** When response or request shapes must become incompatible
- **Implementation approach:** Prefer additive fields first; version only the breaking surface and publish sunset dates
- **Recommended tools:** OpenAPI, API gateway, schema diff tools
- **Security considerations:** Do not leave obsolete versions with weaker authorization
- **Verification method:** Run compatibility checks against stored client contract fixtures

### S044 — Error taxonomy

- **Skill ID:** S044
- **Name:** Error taxonomy
- **Purpose:** Translate failures into stable, actionable API responses
- **When to use:** When domain, validation, and dependency failures cross a service boundary
- **Implementation approach:** Map known error classes to codes; keep unexpected details server-side
- **Recommended tools:** RFC 9457 problem details, typed errors, Sentry
- **Security considerations:** Strip stack traces, SQL text, tokens, and upstream bodies from responses
- **Verification method:** Assert error shape and redaction for representative failure classes

### S045 — Idempotent mutation endpoints

- **Skill ID:** S045
- **Name:** Idempotent mutation endpoints
- **Purpose:** Make retries safe when a client cannot know whether a write completed
- **When to use:** When creating payments, events, or long-running plans can be retried
- **Implementation approach:** Store a scoped idempotency key and replay the original outcome atomically
- **Recommended tools:** PostgreSQL unique constraints, Redis where appropriate, HTTP headers
- **Security considerations:** Bind keys to user and operation; reject reuse with different payloads
- **Verification method:** Send concurrent duplicate requests and verify one durable effect

### S046 — Cursor pagination contracts

- **Skill ID:** S046
- **Name:** Cursor pagination contracts
- **Purpose:** Traverse large mutable collections without offset drift
- **When to use:** When event or notebook lists can change during navigation
- **Implementation approach:** Use opaque ordered cursors with stable tie-breakers and bounded page size
- **Recommended tools:** PostgreSQL keyset queries, Zod, OpenAPI
- **Security considerations:** Authorize each page and avoid embedding sensitive row values in cursors
- **Verification method:** Insert and delete records between page calls; verify no duplicates or skips

### S047 — Per-user API rate limits

- **Skill ID:** S047
- **Name:** Per-user API rate limits
- **Purpose:** Bound abusive or accidental request bursts fairly
- **When to use:** When endpoints consume CPU, provider quota, or expensive database work
- **Implementation approach:** Use user and route buckets with clear retry metadata and distributed counters
- **Recommended tools:** Redis token bucket, gateway limits, HTTP 429
- **Security considerations:** Do not key limits on spoofable forwarded IP headers alone
- **Verification method:** Drive bursts from multiple instances and confirm isolation by user

### S048 — Authentication middleware

- **Skill ID:** S048
- **Name:** Authentication middleware
- **Purpose:** Attach a verified session identity to each protected request
- **When to use:** When server routes need a common authentication gate
- **Implementation approach:** Verify signature, expiry, issuer, and revocation before creating request context
- **Recommended tools:** Auth.js or established OIDC middleware, jose
- **Security considerations:** Fail closed on invalid or missing sessions; never trust user IDs from body
- **Verification method:** Test expired, malformed, revoked, and valid sessions across routes

### S049 — Authorization policy checks

- **Skill ID:** S049
- **Name:** Authorization policy checks
- **Purpose:** Decide access from subject, resource, and action together
- **When to use:** When users read or mutate any persisted object
- **Implementation approach:** Call a centralized policy with the resource loaded under tenant scope
- **Recommended tools:** CASL or small typed policy module, repository layer
- **Security considerations:** Prevent IDOR by checking ownership on every server path
- **Verification method:** Attempt cross-user read and write using guessed valid identifiers

### S050 — Session lifecycle management

- **Skill ID:** S050
- **Name:** Session lifecycle management
- **Purpose:** Issue and invalidate browser sessions safely
- **When to use:** When implementing sign-in, logout, password change, or deletion
- **Implementation approach:** Rotate session IDs at authentication and revoke all relevant sessions on account events
- **Recommended tools:** Secure cookie sessions, Redis or database session store
- **Security considerations:** Use HttpOnly, Secure, SameSite cookies and defend against fixation
- **Verification method:** Verify cookie flags, rotation, logout, expiry, and revoked-session denial

### S051 — Route-bound CSRF enforcement

- **Skill ID:** S051
- **Name:** Route-bound CSRF enforcement
- **Purpose:** Apply CSRF defenses at each cookie-authenticated mutation route
- **When to use:** When cookies authenticate cross-site-capable browser requests
- **Implementation approach:** Use framework tokens or strict Origin/Fetch Metadata checks plus SameSite; use S170 for session-wide token lifecycle and cookie policy
- **Recommended tools:** Framework CSRF middleware, Origin and Fetch Metadata headers
- **Security considerations:** Do not accept state-changing GETs or wildcard credentialed CORS
- **Verification method:** Submit forged cross-origin forms/fetches against each mutation route; verify no write occurs

### S052 — Password storage

- **Skill ID:** S052
- **Name:** Password storage
- **Purpose:** Define safe password-record storage and lifecycle policy
- **When to use:** When account storage, rehashing, or password-field handling is designed; see S168 for hash algorithm and cost calibration
- **Implementation approach:** Persist only adaptive password hashes with per-password salt and versioned parameters; never retain plaintext or reversible password ciphertext
- **Recommended tools:** Argon2id library, bcrypt as supported fallback
- **Security considerations:** Never log or reversibly encrypt passwords; apply S168 hashing guidance and avoid exposing account existence through verification errors
- **Verification method:** Inspect storage schema for hash-only fields and verify parameter upgrades preserve login; use S168 for algorithm benchmarks

### S053 — Password reset tokens

- **Skill ID:** S053
- **Name:** Password reset tokens
- **Purpose:** Allow recovery without creating reusable account takeover links
- **When to use:** When a user requests credential recovery
- **Implementation approach:** Generate random one-time tokens, store only a hash, expire quickly, and consume atomically
- **Recommended tools:** Node crypto randomBytes, database uniqueness, mail adapter
- **Security considerations:** Avoid account enumeration and invalidate existing sessions after reset
- **Verification method:** Test expiry, reuse, wrong-account binding, and concurrent token consumption

### S054 — Email verification flow

- **Skill ID:** S054
- **Name:** Email verification flow
- **Purpose:** Confirm mailbox control before enabling gated account actions
- **When to use:** When product policy requires verified email ownership
- **Implementation approach:** Issue a short-lived one-use token and update verification state transactionally
- **Recommended tools:** Signed or random token flow, mail delivery service
- **Security considerations:** Email verification proves mailbox control only; it does not satisfy age, operator/legal, or Meta eligibility gates in S015/S236
- **Verification method:** Attempt replay, expired verification, and email-change edge cases

### S055 — Streaming upload ingestion

- **Skill ID:** S055
- **Name:** Streaming upload ingestion
- **Purpose:** Accept files without buffering unbounded payloads in process memory
- **When to use:** When a notebook imports PDFs or other course materials
- **Implementation approach:** Enforce byte limits while streaming to quarantined storage and record checksums
- **Recommended tools:** Busboy or framework stream parser, object storage SDK
- **Security considerations:** Reject path traversal names; keep uploads private until scanned
- **Verification method:** Upload boundary-size and interrupted-stream fixtures; observe memory stays bounded

### S056 — Malware scanning handoff

- **Skill ID:** S056
- **Name:** Malware scanning handoff
- **Purpose:** Prevent untrusted uploads from reaching parsers before inspection
- **When to use:** When accepting office files, PDFs, or archives
- **Implementation approach:** Store in quarantine, scan asynchronously, and expose only clean-state records
- **Recommended tools:** ClamAV service or managed scanning API, queue
- **Security considerations:** Do not execute macros or unpack archives without expansion limits
- **Verification method:** Use benign and test-signature samples; verify blocked files cannot be downloaded

### S057 — Background job queues

- **Skill ID:** S057
- **Name:** Background job queues
- **Purpose:** Move slow or retryable work outside request latency
- **When to use:** When parsing documents, syncing accounts, or building study artifacts
- **Implementation approach:** Persist job state, use bounded workers, and make user-visible status explicit
- **Recommended tools:** BullMQ, PostgreSQL queue, Cloud task service
- **Security considerations:** Scope job payloads to user IDs and avoid embedding credentials
- **Verification method:** Restart workers mid-job and verify retry, status, and ownership behavior

### S058 — Idempotent job handlers

- **Skill ID:** S058
- **Name:** Idempotent job handlers
- **Purpose:** Make queue redelivery safe after crashes or lease expiry
- **When to use:** When a worker may process a message more than once
- **Implementation approach:** Use a durable deduplication key and commit side effects with completion state
- **Recommended tools:** BullMQ job IDs, transaction table, unique constraints
- **Security considerations:** Bind dedupe records to tenant and operation type
- **Verification method:** Redeliver identical job payloads and assert one output record

### S059 — Webhook signature verification

- **Skill ID:** S059
- **Name:** Webhook signature verification
- **Purpose:** Authenticate callbacks before they can change internal state
- **When to use:** When an external provider posts events to the service
- **Implementation approach:** Verify raw-body HMAC, timestamp tolerance, and event identity before parsing actions
- **Recommended tools:** Provider SDK verifier, Node crypto timingSafeEqual
- **Security considerations:** Reject unsigned callbacks; never trust claimed event owner fields alone
- **Verification method:** Replay valid, altered, stale, and malformed webhook fixtures

### S060 — Bounded retry policies

- **Skill ID:** S060
- **Name:** Bounded retry policies
- **Purpose:** Set bounded retries for transient request/dependency failures
- **When to use:** When a dependency returns retryable timeouts or throttling
- **Implementation approach:** Use capped exponential backoff with jitter and explicit retryable status rules; retry writes only with idempotency (S045), while durable agent-step retries use S250
- **Recommended tools:** p-retry, queue retry settings, Retry-After parser
- **Security considerations:** Do not retry non-idempotent writes without a dedupe mechanism
- **Verification method:** Fault-inject repeated 429/5xx and verify attempts stop at the transport cap without duplicating a write

### S061 — Deadline propagation

- **Skill ID:** S061
- **Name:** Deadline propagation
- **Purpose:** Keep nested service calls inside the originating request budget
- **When to use:** When a handler calls multiple downstream systems
- **Implementation approach:** Pass deadlines/AbortSignals as cooperative stops for local or not-yet-dispatched work and reserve response time; distinguish request-budget expiry from user cancellation (S247). Track dispatched remote writes as pending/unknown until reconciled under S248/S281, with idempotency from S045
- **Recommended tools:** AbortController, framework request context
- **Security considerations:** An abort/deadline does not prove a dispatched remote write stopped or rolled back; preserve cleanup, operation state, and evidence-based outcomes
- **Verification method:** Test pre-dispatch expiry and a remote commit followed by a lost response; verify unknown status is reconciled without duplicate effects and no rollback is claimed without evidence

### S062 — HTTP response caching

- **Skill ID:** S062
- **Name:** HTTP response caching
- **Purpose:** Reuse only responses whose visibility and freshness are understood
- **When to use:** When public or user-scoped reads repeat frequently
- **Implementation approach:** Set explicit cache policy and include identity-sensitive variation safely
- **Recommended tools:** HTTP Cache-Control, CDN rules, ETag
- **Security considerations:** Use private/no-store for credential or personal-data responses
- **Verification method:** Inspect browser, proxy, and CDN behavior across two authenticated users

### S063 — Response DTO boundaries

- **Skill ID:** S063
- **Name:** Response DTO boundaries
- **Purpose:** Expose deliberate API shapes rather than database records
- **When to use:** When returning persisted entities to browser clients
- **Implementation approach:** Map domain objects to allowlisted response DTOs at the transport layer
- **Recommended tools:** TypeScript types, Zod response schemas
- **Security considerations:** Exclude password hashes, encrypted fields, provider tokens, and internal flags
- **Verification method:** Snapshot responses and assert forbidden properties are absent

### S064 — OpenAPI contract maintenance

- **Skill ID:** S064
- **Name:** OpenAPI contract maintenance
- **Purpose:** Keep endpoint documentation and generated clients aligned
- **When to use:** When several features consume the same API surface
- **Implementation approach:** Define request and response schemas once, then lint for breaking drift
- **Recommended tools:** OpenAPI 3.1, Redocly CLI, openapi-typescript
- **Security considerations:** Do not publish internal routes or schemas containing sensitive examples
- **Verification method:** Generate a client in CI and fail on unreviewed contract changes

### S065 — Structured application logging

- **Skill ID:** S065
- **Name:** Structured application logging
- **Purpose:** Make service behavior searchable without embedding whole request bodies
- **When to use:** When diagnosing production failures across routes and workers
- **Implementation approach:** Emit bounded JSON events with stable event names and correlation IDs
- **Recommended tools:** Pino, OpenTelemetry log bridge
- **Security considerations:** Whitelist fields and exclude credentials, prompt contents, and uploaded text
- **Verification method:** Run log-capture tests with seeded secrets and scan output for matches

### S066 — Distributed request tracing

- **Skill ID:** S066
- **Name:** Distributed request tracing
- **Purpose:** Follow a request across API, queue, and provider boundaries
- **When to use:** When latency or failures span multiple services
- **Implementation approach:** Propagate trace context and add spans around expensive boundary calls
- **Recommended tools:** OpenTelemetry, W3C Trace Context
- **Security considerations:** Do not attach user content or identifiers beyond approved pseudonymous tags
- **Verification method:** Trace a test request end-to-end and confirm spans link without sensitive attributes

### S067 — Log redaction policy

- **Skill ID:** S067
- **Name:** Log redaction policy
- **Purpose:** Redact fields before application logs leave the process
- **When to use:** When logs include exception objects or third-party SDK metadata
- **Implementation approach:** Centralize application-log serializers and redact nested values before emit; use S164 for telemetry/exporter and third-party SDK boundaries
- **Recommended tools:** Pino redact paths, custom error mapper
- **Security considerations:** Redact authorization, cookies, API keys, OAuth tokens, and document text
- **Verification method:** Inject sentinel secrets into app-log errors and inspect captured output; separately test telemetry sinks under S164

### S068 — Runtime configuration validation

- **Skill ID:** S068
- **Name:** Runtime configuration validation
- **Purpose:** Fail early when required deployment settings are missing or malformed
- **When to use:** When starting a service with environment-driven configuration
- **Implementation approach:** Parse variables once into a typed immutable config and reject unknown modes
- **Recommended tools:** Zod, envalid, dotenv only for local development
- **Security considerations:** Never print raw environment values in startup errors
- **Verification method:** Boot with missing, malformed, and valid synthetic configuration cases

### S069 — Liveness and readiness probes

- **Skill ID:** S069
- **Name:** Liveness and readiness probes
- **Purpose:** Let orchestration distinguish a live process from a ready service
- **When to use:** When deploying behind a load balancer or worker manager
- **Implementation approach:** Keep liveness dependency-light; readiness checks only required services
- **Recommended tools:** Kubernetes probes, health endpoint middleware
- **Security considerations:** Do not reveal dependency hostnames or configuration details publicly
- **Verification method:** Simulate dependency outage and confirm readiness drops while liveness stays true

### S070 — Graceful process shutdown

- **Skill ID:** S070
- **Name:** Graceful process shutdown
- **Purpose:** Finish or safely cancel active work during deployment restarts
- **When to use:** When a process handles HTTP requests or queued jobs
- **Implementation approach:** Stop accepting traffic, drain in-flight work, close clients, then exit on deadline
- **Recommended tools:** Node SIGTERM hooks, server close, queue drain APIs
- **Security considerations:** Bound drain time and avoid leaving partially committed sensitive operations
- **Verification method:** Send SIGTERM during requests and verify completion or safe retry semantics

### S071 — Dependency circuit breakers

- **Skill ID:** S071
- **Name:** Dependency circuit breakers
- **Purpose:** Stop repeated calls to an unhealthy downstream service
- **When to use:** When provider failures can consume threads or cascade across routes
- **Implementation approach:** Track failures per dependency and allow measured half-open probes
- **Recommended tools:** opossum, gateway circuit breaker, OpenTelemetry metrics
- **Security considerations:** Do not leak breaker diagnostics to untrusted callers
- **Verification method:** Fault-inject outage and recovery; verify open, half-open, and closed transitions

### S072 — Per-route concurrency bounds

- **Skill ID:** S072
- **Name:** Per-route concurrency bounds
- **Purpose:** Cap concurrent work entering an expensive API route
- **When to use:** When model calls or parsing jobs can saturate CPU or quotas
- **Implementation approach:** Use route-scoped admission semaphores or queue limits with predictable overload responses; use S283 for per-user/global agent-tool worker fairness
- **Recommended tools:** p-limit, queue concurrency settings, gateway limits
- **Security considerations:** Prevent one tenant from exhausting shared capacity
- **Verification method:** Burst synthetic requests at one route and confirm its cap; test cross-tool worker fairness separately under S283

### S073 — Request body size limits

- **Skill ID:** S073
- **Name:** Request body size limits
- **Purpose:** Reject oversized bodies before parsers allocate excessive memory
- **When to use:** When routes accept JSON, text, or multipart uploads
- **Implementation approach:** Set route-specific byte ceilings and stop reading once exceeded
- **Recommended tools:** Framework body limits, streaming parser
- **Security considerations:** Use lower limits for control endpoints and isolate file limits by type
- **Verification method:** Send boundary and oversized bodies; confirm early rejection and stable memory

### S074 — Content negotiation

- **Skill ID:** S074
- **Name:** Content negotiation
- **Purpose:** Return formats clients actually request without ambiguous fallbacks
- **When to use:** When an endpoint serves JSON, downloadable files, or text exports
- **Implementation approach:** Parse Accept explicitly and return 406 for unsupported representations
- **Recommended tools:** Framework negotiation middleware, MIME database
- **Security considerations:** Set safe content types and attachment disposition for downloads
- **Verification method:** Test supported, unsupported, and wildcard Accept headers

### S075 — Conditional request handling

- **Skill ID:** S075
- **Name:** Conditional request handling
- **Purpose:** Reduce repeat transfer while preserving correct update semantics
- **When to use:** When clients poll stable resources or download generated exports
- **Implementation approach:** Use ETag or Last-Modified with correct cache scope and weak validator rules
- **Recommended tools:** HTTP ETag, framework conditional helpers
- **Security considerations:** Do not allow validators to reveal cross-user equality for private content
- **Verification method:** Verify 304 responses and ensure changed records produce fresh validators

### S076 — Transactional outbox publishing

- **Skill ID:** S076
- **Name:** Transactional outbox publishing
- **Purpose:** Avoid losing domain events between database commit and queue publish
- **When to use:** When a committed write must trigger asynchronous work
- **Implementation approach:** Insert outbox row in the same transaction and publish with a deduplicating worker
- **Recommended tools:** PostgreSQL, transactional outbox worker
- **Security considerations:** Limit event payload to the minimum data required by the consumer
- **Verification method:** Crash between commit and publish, then verify eventual single processing

### S077 — Notification delivery pipeline

- **Skill ID:** S077
- **Name:** Notification delivery pipeline
- **Purpose:** Deliver reminders through retriable channels with user controls
- **When to use:** When an event or assignment requires email or in-app notification
- **Implementation approach:** Separate scheduling from delivery, persist attempts, and honor per-channel preferences
- **Recommended tools:** Queue workers, email provider SDK, notification table
- **Security considerations:** Do not send sensitive course content in subjects or push previews by default
- **Verification method:** Test opt-out, bounce, duplicate delivery, retry, and timezone schedule cases

### S078 — Security audit event recording

- **Skill ID:** S078
- **Name:** Security audit event recording
- **Purpose:** Record security-sensitive account lifecycle and permission transitions
- **When to use:** When credentials, permissions, exports, or deletion status change
- **Implementation approach:** Append actor/action/target metadata for credential, role, export, and deletion changes; use S197 for durable audit-table design, S268 for agent-run history, and S286 for tool-call records
- **Recommended tools:** Database append-only table, structured logger
- **Security considerations:** Avoid raw secrets and document contents in audit records; use only identifiers and scopes needed for the specific event
- **Verification method:** Assert key lifecycle actions create records with no sensitive values

### S079 — Meta API adapter boundary

- **Skill ID:** S079
- **Name:** Meta API adapter boundary
- **Purpose:** Isolate endpoint-specific Meta transport and provider DTO mapping behind a server adapter
- **When to use:** Only after written permission and verified official capability under the product-wide gate S236
- **Implementation approach:** Implement a documented endpoint/model/schema/timeout adapter after S236; keep the global permission gate in S236 and share no transport concerns with feature modules
- **Recommended tools:** Official Meta API documentation, server HTTP client, Zod
- **Security considerations:** Do not collect/store Meta keys or invoke any provider before written permission; never use another provider
- **Verification method:** Before S236 permission, verify all inference/key paths are disabled; after authorization, contract-test official host, schema, timeout, and redaction

### S080 — Server-sent event streaming

- **Skill ID:** S080
- **Name:** Server-sent event streaming
- **Purpose:** Deliver incremental server updates while preserving cancellation and ordering
- **When to use:** Only after S236 authorizes the model capability, when output/progress is streamed to the browser
- **Implementation approach:** Frame typed events, flush safely, support disconnect cancellation, and cap stream duration
- **Recommended tools:** Fetch ReadableStream, SSE, AbortController
- **Security considerations:** Authorize before opening; do not stream tool secrets or hidden reasoning
- **Verification method:** Test reconnect, disconnect, malformed frames, and concurrent user isolation

## UI/UX and visual design

### S081 — Product art direction brief

- **Skill ID:** S081
- **Name:** Product art direction brief
- **Purpose:** Give the product a recognizable visual premise before component styling starts
- **When to use:** When beginning a new route or major redesign
- **Implementation approach:** Define audience, mood, material references, type, palette, and one signature composition
- **Recommended tools:** Figma, moodboard, design tokens, browser screenshots
- **Security considerations:** Do not imply affiliation through another company’s distinctive visual identity
- **Verification method:** Review a one-page direction against product purpose and existing screens

### S082 — Editorial information hierarchy

- **Skill ID:** S082
- **Name:** Editorial information hierarchy
- **Purpose:** Make the next useful action obvious through scale and placement
- **When to use:** When a dense page has competing headings, data, and controls
- **Implementation approach:** Rank content by user decision importance, then vary size, weight, and spacing
- **Recommended tools:** Figma, type specimens, CSS variables
- **Security considerations:** Do not style consent or privacy choices to steer users unfairly
- **Verification method:** Ask first-time users to locate the primary task without explanation

### S083 — Typography pairing

- **Skill ID:** S083
- **Name:** Typography pairing
- **Purpose:** Give display and reading text complementary roles without sacrificing legibility
- **When to use:** When product identity depends on a distinct type voice
- **Implementation approach:** Choose one expressive face and one high-readability text face with tested glyph coverage
- **Recommended tools:** Fontsource, specimen pages, browser font tools
- **Security considerations:** Verify font licensing and avoid sending private browsing data to third-party font hosts
- **Verification method:** Compare long-form screens at real sizes and test fallback rendering

### S084 — Typographic scale

- **Skill ID:** S084
- **Name:** Typographic scale
- **Purpose:** Keep headings, labels, and body copy in a deliberate size rhythm
- **When to use:** When screens mix marketing copy, controls, and dense academic content
- **Implementation approach:** Define a small responsive scale with semantic names rather than one-off sizes
- **Recommended tools:** CSS clamp, design tokens, type-scale calculator
- **Security considerations:** Preserve zoom and user font-size settings; do not lock text to pixels
- **Verification method:** Inspect heading hierarchy at mobile, tablet, desktop, and 200% zoom

### S085 — Readable measure

- **Skill ID:** S085
- **Name:** Readable measure
- **Purpose:** Keep paragraphs and data labels within comfortable line lengths
- **When to use:** When prose spans wide screens or dense cards
- **Implementation approach:** Constrain text measure independently from surrounding layout width
- **Recommended tools:** CSS max-width in ch units, typography tokens
- **Security considerations:** Ensure zoomed and translated text can expand without clipping
- **Verification method:** Check longest localization and browser zoom for line wraps and overflow

### S086 — Spacing rhythm

- **Skill ID:** S086
- **Name:** Spacing rhythm
- **Purpose:** Make grouping and separation consistent through intentional whitespace
- **When to use:** When repeated sections feel noisy or visually disconnected
- **Implementation approach:** Use a base spacing scale and reserve larger gaps for hierarchy changes
- **Recommended tools:** CSS custom properties, Figma tokens
- **Security considerations:** Do not remove whitespace needed to distinguish destructive choices
- **Verification method:** Compare page rhythm at full scroll and inspect repeated component gaps

### S087 — Palette architecture

- **Skill ID:** S087
- **Name:** Palette architecture
- **Purpose:** Build a cohesive palette with roles rather than arbitrary swatches
- **When to use:** When adding a theme or a new feature surface
- **Implementation approach:** Define neutral, accent, surface, text, and feedback ramps with semantic aliases
- **Recommended tools:** Design tokens, OKLCH tooling, CSS variables
- **Security considerations:** Do not use color as the sole carrier of status or permission
- **Verification method:** Check palette on real components in every supported theme

### S088 — Semantic color mapping

- **Skill ID:** S088
- **Name:** Semantic color mapping
- **Purpose:** Make success, warning, error, and informational states consistently readable
- **When to use:** When components report task or integration status
- **Implementation approach:** Map named state tokens to foreground and background pairs with contrast checks
- **Recommended tools:** CSS variables, contrast checker, Storybook
- **Security considerations:** Avoid red/green-only distinctions and misleading success signals
- **Verification method:** Audit all state pairs and test grayscale comprehension

### S089 — Contrast planning

- **Skill ID:** S089
- **Name:** Contrast planning
- **Purpose:** Choose readable color pairs during palette and theme design
- **When to use:** When choosing colors for any interactive surface
- **Implementation approach:** Measure foreground/background pairs for text, controls, focus, disabled, and hover states; use S470 to verify rendered screens and theme variants
- **Recommended tools:** axe, WCAG contrast calculator, browser devtools
- **Security considerations:** Do not use low-contrast opacity as a proxy for disabled security
- **Verification method:** Automate design-token contrast checks and inspect screenshots; use S470 for runtime state coverage

### S090 — Radius and shadow hierarchy

- **Skill ID:** S090
- **Name:** Radius and shadow hierarchy
- **Purpose:** Use edge softness and elevation to clarify real grouping
- **When to use:** When panels and overlays need differentiated depth
- **Implementation approach:** Assign a few radii and shadow roles; reserve elevation for floating layers
- **Recommended tools:** CSS tokens, Figma effects
- **Security considerations:** Avoid shadows that obscure focus rings or imply false clickability
- **Verification method:** Compare layered surfaces on both light and dark backgrounds

### S091 — Surface material language

- **Skill ID:** S091
- **Name:** Surface material language
- **Purpose:** Make each surface treatment express function and depth
- **When to use:** When the interface mixes canvas, document, and overlay regions
- **Implementation approach:** Separate base, raised, and interactive surfaces through restrained material cues
- **Recommended tools:** CSS variables, Figma styles, browser rendering
- **Security considerations:** Never blur sensitive data as a substitute for access control
- **Verification method:** Inspect at low-end graphics settings and verify text contrast on overlays

### S092 — Liquid glass restraint

- **Skill ID:** S092
- **Name:** Liquid glass restraint
- **Purpose:** Use translucency as a material accent while keeping content readable
- **When to use:** When a requested glass theme includes layered panels
- **Implementation approach:** Limit backdrop blur to focal surfaces and provide opaque fallback tokens
- **Recommended tools:** CSS backdrop-filter, @supports, design tokens
- **Security considerations:** Keep critical controls legible when blur is unavailable or reduced
- **Verification method:** Compare contrast and scrolling on unsupported and low-power browsers

### S093 — Card pattern alternatives

- **Skill ID:** S093
- **Name:** Card pattern alternatives
- **Purpose:** Choose cards only when content forms a meaningful bounded unit
- **When to use:** When a page repeats bordered panels without clear grouping
- **Implementation approach:** Replace redundant boxes with lists, rules, spacing, or aligned columns where appropriate
- **Recommended tools:** Figma, CSS grid, semantic HTML
- **Security considerations:** Do not hide important content in hover-only card states
- **Verification method:** Count visual containers and validate that every boundary has a grouping purpose

### S094 — Page composition

- **Skill ID:** S094
- **Name:** Page composition
- **Purpose:** Arrange primary content, supporting context, and navigation with clear balance
- **When to use:** When a new screen lacks a natural reading path
- **Implementation approach:** Sketch dominant axis, focal point, negative space, and content progression before styling
- **Recommended tools:** Figma, paper wireframes, browser screenshot review
- **Security considerations:** Do not place destructive actions where accidental pointer travel triggers them
- **Verification method:** Run a five-second comprehension check on a static screen

### S095 — Asymmetric editorial grids

- **Skill ID:** S095
- **Name:** Asymmetric editorial grids
- **Purpose:** Create visual energy without losing scan order or responsive behavior
- **When to use:** When a landing page or research workspace needs a distinctive composition
- **Implementation approach:** Use a clear column rhythm with one intentional offset and collapse it deliberately on mobile
- **Recommended tools:** CSS Grid, container queries, Figma
- **Security considerations:** Avoid ordering content visually differently from its semantic reading order
- **Verification method:** Compare source order and visual order at narrow and wide widths

### S096 — Navigation information architecture

- **Skill ID:** S096
- **Name:** Navigation information architecture
- **Purpose:** Make route relationships and current location understandable
- **When to use:** When product areas grow beyond one screen
- **Implementation approach:** Group by user task, use stable labels, and surface active location consistently
- **Recommended tools:** Sitemap, card sorting, React Router or Next navigation
- **Security considerations:** Do not expose admin-only destinations through client-only hiding
- **Verification method:** Run a tree test for common academic tasks and inspect link destinations

### S097 — Interaction affordance design

- **Skill ID:** S097
- **Name:** Interaction affordance design
- **Purpose:** Signal what can be clicked, dragged, selected, or edited
- **When to use:** When controls look decorative or users miss available actions
- **Implementation approach:** Use consistent shape, labels, pointer cues, and keyboard affordances for each action class
- **Recommended tools:** Figma prototypes, CSS states, usability notes
- **Security considerations:** Do not imply a control is safe when it triggers a consequential change
- **Verification method:** Observe task completion without teaching; record misclicks and hesitation

### S098 — Action hierarchy

- **Skill ID:** S098
- **Name:** Action hierarchy
- **Purpose:** Separate primary, secondary, and destructive actions clearly
- **When to use:** When a dialog or toolbar offers several operations
- **Implementation approach:** Use one dominant action, quiet supporting actions, and explicit destructive styling
- **Recommended tools:** Button variants, design tokens, Figma
- **Security considerations:** Never make irreversible actions the largest or default focused control
- **Verification method:** Keyboard-test initial focus and ask users to identify the action outcome

### S099 — Form task framing

- **Skill ID:** S099
- **Name:** Form task framing
- **Purpose:** Help people understand what information is needed and why
- **When to use:** When building account, credential, or integration setup
- **Implementation approach:** Group fields by purpose, label required data, and explain validation timing
- **Recommended tools:** Form design checklist, React Hook Form, Figma
- **Security considerations:** Explain why sensitive fields are requested and who will receive them
- **Verification method:** Complete the form with keyboard only and measure correction steps

### S100 — Progressive disclosure

- **Skill ID:** S100
- **Name:** Progressive disclosure
- **Purpose:** Reveal advanced options when they become relevant
- **When to use:** When settings overwhelm first-time users
- **Implementation approach:** Keep common choices visible; expose expert controls behind labelled sections
- **Recommended tools:** HTML details, React disclosure pattern, usability testing
- **Security considerations:** Do not bury consent, deletion, or credential-removal controls
- **Verification method:** Test that users can find advanced controls and understand their defaults

### S101 — Onboarding sequence design

- **Skill ID:** S101
- **Name:** Onboarding sequence design
- **Purpose:** Teach first value through a short, task-based setup
- **When to use:** Only after the S015 signup/operator/legal/Meta eligibility gate passes, when an eligible adult learner begins setup
- **Implementation approach:** Ask for only what is necessary, save progress, and show a concrete next step
- **Recommended tools:** Figma flow, analytics event schema, form components
- **Security considerations:** Collect only setup fields needed for a working task; follow current 18+ eligibility and never target minors
- **Verification method:** Test gated entry, completion, abandonment, resume, and skip behavior with synthetic eligible accounts

### S102 — Empty-state content

- **Skill ID:** S102
- **Name:** Empty-state content
- **Purpose:** Explain what belongs in a genuinely empty area without fabricating content
- **When to use:** When writing empty-state copy for a truly empty collection; pair with S036, which defines the actual empty UI and working action
- **Implementation approach:** State why the collection is empty and offer a working create/import action; do not show examples, mock cards, seeded records, or placeholders in product UI
- **Recommended tools:** Content design, Figma, component library
- **Security considerations:** No examples, seeded records, fake previews, or placeholders in product UI; use only user-provided/authorized runtime content and test-only synthetic fixtures
- **Verification method:** Review copy against a clean test account, confirm no sample content is visible, and verify the S036 action reaches a real flow

### S103 — Error recovery language

- **Skill ID:** S103
- **Name:** Error recovery language
- **Purpose:** Explain what failed and how the user can continue
- **When to use:** When a request or integration fails visibly
- **Implementation approach:** Name the affected action, distinguish retryable failures, and preserve safe inputs
- **Recommended tools:** Content design, error taxonomy, support runbooks
- **Security considerations:** Avoid exposing provider internals or blaming users for system faults
- **Verification method:** Review copy against injected errors and confirm each message has a recovery path

### S104 — Loading-state choreography

- **Skill ID:** S104
- **Name:** Loading-state choreography
- **Purpose:** Communicate delay without implying progress the system cannot measure
- **When to use:** When a request takes long enough to interrupt user confidence
- **Implementation approach:** Use a spinner only for indeterminate waits; show stages only from real job state
- **Recommended tools:** Progress component, queue status endpoint, reduced-motion CSS
- **Security considerations:** Never fabricate percentages or label a request complete before confirmation
- **Verification method:** Throttle the network and compare the indicator with real backend state

### S105 — Confirmation copy

- **Skill ID:** S105
- **Name:** Confirmation copy
- **Purpose:** Make the consequence of an important action clear before commitment
- **When to use:** When deleting, sharing, sending, or bulk-editing records
- **Implementation approach:** Name scope, reversibility, and next step in plain language
- **Recommended tools:** Content design, confirmation dialog, action preview
- **Security considerations:** Do not use vague confirm labels for irreversible operations
- **Verification method:** Ask users to restate the consequence before approval in usability testing

### S106 — Interaction feedback timing

- **Skill ID:** S106
- **Name:** Interaction feedback timing
- **Purpose:** Return feedback close to the action that caused it
- **When to use:** When save, copy, selection, or drag operations need confirmation
- **Implementation approach:** Use local status near the control and remove transient feedback predictably
- **Recommended tools:** ARIA live region, toast system, CSS transitions
- **Security considerations:** Do not announce sensitive values in public or shared-screen notifications
- **Verification method:** Test fast and slow responses with keyboard and screen reader output

### S107 — Critique using evidence

- **Skill ID:** S107
- **Name:** Critique using evidence
- **Purpose:** Turn subjective visual feedback into observable corrections
- **When to use:** When a screen feels generic, cluttered, or unclear
- **Implementation approach:** Record one observed issue, affected task, evidence, and a testable change
- **Recommended tools:** Screenshot annotations, heuristic checklist, usability notes
- **Security considerations:** Separate verified findings from personal preference
- **Verification method:** Revisit the same task after changes and compare specific failure evidence

### S108 — Data visualization honesty

- **Skill ID:** S108
- **Name:** Data visualization honesty
- **Purpose:** Represent values without exaggerating trend, uncertainty, or completeness
- **When to use:** When displaying study progress or calendar load
- **Implementation approach:** Choose an encoding that matches data type and show units, range, and missingness
- **Recommended tools:** Observable Plot, D3, chart accessibility review
- **Security considerations:** Never invent product/demo metrics or calculate claims from incomplete records; synthetic chart fixtures belong only in tests
- **Verification method:** Recompute labels from fixture data and compare chart scale to underlying values

### S109 — Information density tuning

- **Skill ID:** S109
- **Name:** Information density tuning
- **Purpose:** Fit more useful content without turning each view into visual noise
- **When to use:** When a calendar or research page has competing detail levels
- **Implementation approach:** Set density modes with explicit row heights and preserve target sizes
- **Recommended tools:** CSS variables, responsive tables, user preference settings
- **Security considerations:** Do not compress privacy or approval copy to fit a preferred density
- **Verification method:** Test each density with realistic long titles and touch targets

### S110 — Calendar theme cohesion

- **Skill ID:** S110
- **Name:** Calendar theme cohesion
- **Purpose:** Make theme changes affect the whole calendar vocabulary consistently
- **When to use:** When adding or revising a calendar visual theme
- **Implementation approach:** Map event, grid, selection, focus, conflict, and time labels to theme tokens
- **Recommended tools:** CSS custom properties, Storybook, test-only theme fixture page
- **Security considerations:** Keep conflict and busy states recognizable without relying only on hue
- **Verification method:** Render every view and interaction state under each available theme

### S111 — Customization control design

- **Skill ID:** S111
- **Name:** Customization control design
- **Purpose:** Help users tailor appearance without confusing color with behavior
- **When to use:** When adding accent, density, or animation preferences
- **Implementation approach:** Group settings by previewable outcome and expose reset-to-default affordance
- **Recommended tools:** Settings panel, CSS variables, local preview state
- **Security considerations:** Persist preferences per account and do not store private content in theme metadata
- **Verification method:** Change each setting, reload, and verify only the intended appearance changes

### S112 — Dark theme adaptation

- **Skill ID:** S112
- **Name:** Dark theme adaptation
- **Purpose:** Retune surfaces and visual hierarchy for low-luminance environments
- **When to use:** When a dark theme is requested or system preference changes
- **Implementation approach:** Re-evaluate neutral ramps, borders, images, focus, and elevation rather than invert colors
- **Recommended tools:** CSS color-scheme, token sets, browser devtools
- **Security considerations:** Do not make focus or error states disappear in dim palettes
- **Verification method:** Inspect screenshots with simulated OLED contrast and measure text pairs

### S113 — High-contrast theme composition

- **Skill ID:** S113
- **Name:** High-contrast theme composition
- **Purpose:** Support readers who need clear boundaries and stronger text contrast
- **When to use:** When user preference or accessibility requires heightened separation
- **Implementation approach:** Increase edge definition and preserve semantic focus, selection, and status cues
- **Recommended tools:** CSS tokens, forced-colors media queries, axe
- **Security considerations:** Do not remove user agent forced-color behavior
- **Verification method:** Test forced colors and high-contrast mode with every core control

### S114 — Responsive art direction

- **Skill ID:** S114
- **Name:** Responsive art direction
- **Purpose:** Recompose hierarchy for each viewport instead of shrinking desktop
- **When to use:** When a screen depends on side-by-side content or a cinematic hero
- **Implementation approach:** Choose what moves, hides, or stacks at each breakpoint based on task priority
- **Recommended tools:** CSS Grid, container queries, Figma variants
- **Security considerations:** Keep all primary actions available without hover on touch devices
- **Verification method:** Inspect 320px, tablet, and wide viewport screenshots for task parity

### S115 — Touch target and gesture design

- **Skill ID:** S115
- **Name:** Touch target and gesture design
- **Purpose:** Make common interactions reliable on small touchscreens
- **When to use:** When calendar cells, menus, or draggable items are used on phones
- **Implementation approach:** Provide adequate hit areas and a non-drag alternative for precision actions
- **Recommended tools:** Pointer Events, CSS min-size tokens, mobile browser testing
- **Security considerations:** Do not require gesture-only access to event editing or cancellation
- **Verification method:** Use touch emulation and verify adjacent actions are not activated together

### S116 — Trust cues for AI actions

- **Skill ID:** S116
- **Name:** Trust cues for AI actions
- **Purpose:** Make provenance and user control legible around generated suggestions
- **When to use:** When presenting user-authored, deterministic, or—after S236 authorization—model-generated suggestions
- **Implementation approach:** Label provenance, link source context, and separate every suggestion from execution; keep model generation unavailable while S236 is closed
- **Recommended tools:** Design system labels, source chip, preview panel
- **Security considerations:** Never make model content appear verified or executed without evidence; do not imply Meta endorsement
- **Verification method:** Review proposal provenance after reload and verify the model route is blocked before S236

### S117 — Citation presentation

- **Skill ID:** S117
- **Name:** Citation presentation
- **Purpose:** Let readers inspect evidence without interrupting the answer flow
- **When to use:** When research answers contain source-linked claims
- **Implementation approach:** Attach compact numbered references and show title, domain, excerpt, and fetch time
- **Recommended tools:** Citation component, safe URL parser, disclosure panel
- **Security considerations:** Treat fetched titles and snippets as hostile text; neutralize active links
- **Verification method:** Verify each citation resolves to stored source evidence and opens safely

### S118 — Action preview composition

- **Skill ID:** S118
- **Name:** Action preview composition
- **Purpose:** Show exactly what a proposed multi-step agent action will change
- **When to use:** When an agent plans calendar edits, imports, or sharing
- **Implementation approach:** Show affected records, before/after values, count, external scope, and recovery path; keep calendar edits as drafts under S369 and bind explicit approval to the exact proposal under S193
- **Recommended tools:** Diff view, typed action proposal, dialog component
- **Security considerations:** Every consequential action requires explicit user approval regardless of reversibility or risk tier; the server rechecks identity, ownership, permission, and the exact reviewed payload
- **Verification method:** Change a reviewed field and verify approval is invalidated; cover a reversible consequential write, a calendar draft, and a denied approval

### S119 — Design-system consistency review

- **Skill ID:** S119
- **Name:** Design-system consistency review
- **Purpose:** Find drift across components before it becomes a second visual language
- **When to use:** When a feature adds new controls, colors, or spacing conventions
- **Implementation approach:** Compare against token and component inventory; document justified exceptions
- **Recommended tools:** Storybook, visual snapshots, token lint
- **Security considerations:** Do not create hidden variants that change permission or consent cues
- **Verification method:** Run visual comparison across shared states and theme variants

### S120 — Anti-slop interface audit

- **Skill ID:** S120
- **Name:** Anti-slop interface audit
- **Purpose:** Remove empty decoration and generic patterns that obscure real tasks
- **When to use:** After a major interface milestone or visual redesign
- **Implementation approach:** Identify each decorative element’s user purpose and remove unsupported claims
- **Recommended tools:** Screenshot audit, heuristic rubric, content inventory
- **Security considerations:** Flag fake metrics, testimonials, integrations, and product previews for correction
- **Verification method:** Score originality, hierarchy, function, responsiveness, and verify each fix

## 3D graphics and animation

### S121 — R3F scene shell

- **Skill ID:** S121
- **Name:** R3F scene shell
- **Purpose:** Compose a bounded three-dimensional world with React
- **When to use:** A landing chapter needs real scene depth
- **Implementation approach:** Keep Canvas local and split scene primitives into components
- **Recommended tools:** Three.js, @react-three/fiber
- **Security considerations:** Never place account data in public scene assets
- **Verification method:** Production-render a minimal scene and navigate away to check cleanup

### S122 — Canvas sizing

- **Skill ID:** S122
- **Name:** Canvas sizing
- **Purpose:** Fit rendering to its container without layout loops
- **When to use:** A canvas sits in a changing hero or panel
- **Implementation approach:** Use ResizeObserver and update camera aspect only on change
- **Recommended tools:** ResizeObserver, R3F useThree
- **Security considerations:** Avoid probing cross-origin embeds for dimensions
- **Verification method:** Resize viewport and check overflow and repeated updates

### S123 — Perspective camera calibration

- **Skill ID:** S123
- **Name:** Perspective camera calibration
- **Purpose:** Frame scene geometry without accidental lens distortion
- **When to use:** Objects feel too small, flat, or warped
- **Implementation approach:** Choose field of view from composition before scaling meshes
- **Recommended tools:** PerspectiveCamera, camera helpers
- **Security considerations:** Keep near/far planes tight to scene bounds
- **Verification method:** Capture desktop and mobile aspect ratios and inspect clipping

### S124 — Camera path authoring

- **Skill ID:** S124
- **Name:** Camera path authoring
- **Purpose:** Direct attention through scroll chapters
- **When to use:** A scene follows an editorial page journey
- **Implementation approach:** Define waypoints and interpolate camera position and target separately
- **Recommended tools:** GSAP, Three.js Vector3
- **Security considerations:** Keep core content accessible without camera motion
- **Verification method:** Scrub slowly through waypoints and check directional continuity

### S125 — Camera easing curves

- **Skill ID:** S125
- **Name:** Camera easing curves
- **Purpose:** Remove abrupt starts and stops from camera motion
- **When to use:** Linear scroll interpolation feels mechanical
- **Implementation approach:** Use one documented easing curve with smooth endpoint velocity
- **Recommended tools:** GSAP easing, MathUtils
- **Security considerations:** Reduced-motion mode should jump to static states
- **Verification method:** Compare velocity at chapter boundaries and test reduced motion

### S126 — Scroll progress mapping

- **Skill ID:** S126
- **Name:** Scroll progress mapping
- **Purpose:** Synchronize a scene with native document scroll
- **When to use:** Scroll position controls a world state
- **Implementation approach:** Map measured section offsets to clamped normalized progress
- **Recommended tools:** ScrollTrigger, IntersectionObserver
- **Security considerations:** Do not hijack wheel or keyboard scrolling
- **Verification method:** Test anchors, resize, back navigation, and mobile fallback

### S127 — Pinned chapter choreography

- **Skill ID:** S127
- **Name:** Pinned chapter choreography
- **Purpose:** Hold a scene while explanatory text changes
- **When to use:** One world supports multiple narrative beats
- **Implementation approach:** Pin only the narrative region and bind named states to actual progress
- **Recommended tools:** GSAP ScrollTrigger, CSS sticky
- **Security considerations:** Do not block controls or the page footer
- **Verification method:** Keyboard-scroll through pin bounds and verify mobile behavior

### S128 — Persistent world transitions

- **Skill ID:** S128
- **Name:** Persistent world transitions
- **Purpose:** Keep one world while scene chapters evolve
- **When to use:** Several chapters share the same environment
- **Implementation approach:** Animate authored transforms and uniforms instead of rebuilding the scene
- **Recommended tools:** R3F, GSAP timeline
- **Security considerations:** Dispose chapter-specific user data when leaving a state
- **Verification method:** Compare chapter endpoints for stray or duplicated objects

### S129 — GLTF asset loading

- **Skill ID:** S129
- **Name:** GLTF asset loading
- **Purpose:** Load custom models with visible failure handling
- **When to use:** A scene uses a designed 3D asset
- **Implementation approach:** Compress GLB, preload near use, and render a fallback on error
- **Recommended tools:** GLTFLoader, drei useGLTF
- **Security considerations:** Pin trusted asset origins and review redistribution licenses
- **Verification method:** Test cold cache, offline mode, and decoder failure

### S130 — GLTF mesh budget

- **Skill ID:** S130
- **Name:** GLTF mesh budget
- **Purpose:** Reduce model draw calls and transfer size
- **When to use:** An imported model stalls mid-range devices
- **Implementation approach:** Remove unseen meshes and merge static geometry where useful
- **Recommended tools:** gltf-transform, Meshopt
- **Security considerations:** Review third-party asset provenance and license
- **Verification method:** Measure draw calls and bytes before and after optimization

### S131 — Instanced geometry

- **Skill ID:** S131
- **Name:** Instanced geometry
- **Purpose:** Render repeated forms with fewer GPU submissions
- **When to use:** Many objects share one mesh and material
- **Implementation approach:** Use InstancedMesh and update transforms in typed buffers
- **Recommended tools:** Three.js InstancedMesh, BufferAttribute
- **Security considerations:** Do not encode private record counts visibly
- **Verification method:** Compare draw calls and inspect every instance boundary

### S132 — Shader material authoring

- **Skill ID:** S132
- **Name:** Shader material authoring
- **Purpose:** Create a focused procedural material effect
- **When to use:** A bespoke surface needs more than standard PBR
- **Implementation approach:** Start from standard lighting and add a minimal uniform-based shader change
- **Recommended tools:** ShaderMaterial, WebGL diagnostics
- **Security considerations:** Never execute shader text supplied by users
- **Verification method:** Compile across browsers and compare GPU frame time

### S133 — Scene lighting hierarchy

- **Skill ID:** S133
- **Name:** Scene lighting hierarchy
- **Purpose:** Give objects readable depth and visual priority
- **When to use:** Geometry appears flat or washed out
- **Implementation approach:** Establish key, fill, and rim roles before adding ambient light
- **Recommended tools:** Three.js lights, drei Environment
- **Security considerations:** Bound animation and avoid flashing
- **Verification method:** Inspect material separation at each chapter and quality tier

### S134 — Physically based materials

- **Skill ID:** S134
- **Name:** Physically based materials
- **Purpose:** Make metal, plastic, paper, and glass respond plausibly
- **When to use:** A surface reads as flat or artificial
- **Implementation approach:** Tune base color, roughness, and metalness against the actual environment
- **Recommended tools:** MeshStandardMaterial, MeshPhysicalMaterial
- **Security considerations:** Use original materials and respect asset branding rights
- **Verification method:** Render swatches in neutral and accent light; inspect highlights

### S135 — Shadow cost control

- **Skill ID:** S135
- **Name:** Shadow cost control
- **Purpose:** Use shadows only to clarify contact and overlap
- **When to use:** Objects appear to float without grounding
- **Implementation approach:** Bake static shadows or limit real-time casters to focal objects
- **Recommended tools:** Shadow maps, baked textures
- **Security considerations:** Avoid retaining user-derived textures in shared shadow caches
- **Verification method:** Profile GPU time with shadowing enabled and disabled

### S136 — Procedural geometry

- **Skill ID:** S136
- **Name:** Procedural geometry
- **Purpose:** Author brand-specific simple shapes in code
- **When to use:** A shape is easier to parameterize than model externally
- **Implementation approach:** Build indexed BufferGeometry and compute static normals once
- **Recommended tools:** BufferGeometry, typed arrays
- **Security considerations:** Clamp parameters to prevent unbounded buffer allocation
- **Verification method:** Test extreme dimensions and inspect indices and normals

### S137 — Postprocessing budget

- **Skill ID:** S137
- **Name:** Postprocessing budget
- **Purpose:** Apply render effects only when they improve clarity
- **When to use:** A scene needs restrained visual finishing
- **Implementation approach:** Keep the composer chain short and remove unmeasurable passes
- **Recommended tools:** postprocessing, WebGL timer queries
- **Security considerations:** Do not process private user images without consent
- **Verification method:** Benchmark each pass on representative hardware

### S138 — Bloom restraint

- **Skill ID:** S138
- **Name:** Bloom restraint
- **Purpose:** Keep emissive accents luminous without washing out text
- **When to use:** Small scene details need optical glow
- **Implementation approach:** Use a high threshold, restricted sources, and low-power mode
- **Recommended tools:** UnrealBloomPass, postprocessing Bloom
- **Security considerations:** Glow must not obscure focus or state indicators
- **Verification method:** Compare text legibility and highlight clipping with bloom off

### S139 — Depth haze

- **Skill ID:** S139
- **Name:** Depth haze
- **Purpose:** Separate distant forms while preserving target visibility
- **When to use:** A deep environment lacks atmospheric perspective
- **Implementation approach:** Tune fog range to camera bounds and the page palette
- **Recommended tools:** Three.js FogExp2, shader fog
- **Security considerations:** Do not let haze conceal interactive targets
- **Verification method:** Check far-target contrast at low brightness

### S140 — Purposeful particles

- **Skill ID:** S140
- **Name:** Purposeful particles
- **Purpose:** Use particle motion only to depict an actual process or material
- **When to use:** Dust, rain, or signal flow helps explain a scene
- **Implementation approach:** Seed motion, cap count, and expose reduced-density mode
- **Recommended tools:** InstancedBufferGeometry, seeded RNG
- **Security considerations:** Avoid alert-like flashing and distracting motion
- **Verification method:** Profile frame time and compare comprehension with particles removed

### S141 — Raycast target design

- **Skill ID:** S141
- **Name:** Raycast target design
- **Purpose:** Make scene hit regions predictable
- **When to use:** Three-dimensional objects link to chapters or actions
- **Implementation approach:** Use simplified hit meshes mapped to semantic DOM actions
- **Recommended tools:** Raycaster, R3F events
- **Security considerations:** Never make a canvas hit the sole path to an important feature
- **Verification method:** Test pointer bounds plus keyboard equivalent

### S142 — Pointer parallax

- **Skill ID:** S142
- **Name:** Pointer parallax
- **Purpose:** Add restrained desktop depth response
- **When to use:** Pointer orientation gives context to a hero
- **Implementation approach:** Normalize pointer and damp toward a small capped offset
- **Recommended tools:** R3F useFrame, pointer events
- **Security considerations:** Disable for reduced motion and coarse pointers
- **Verification method:** Test edge travel, focus state, and absence of layout shift

### S143 — Accessible scene bridge

- **Skill ID:** S143
- **Name:** Accessible scene bridge
- **Purpose:** Expose scene controls as ordinary labelled HTML controls
- **When to use:** WebGL objects navigate or toggle content
- **Implementation approach:** Mirror each action in a button or link outside Canvas
- **Recommended tools:** HTML buttons, R3F callbacks
- **Security considerations:** Do not convey labels or status only by color
- **Verification method:** Complete the flow with WebGL disabled and keyboard only

### S144 — DOM and canvas composition

- **Skill ID:** S144
- **Name:** DOM and canvas composition
- **Purpose:** Keep narrative text selectable and crisp beside 3D
- **When to use:** When copy overlays or accompanies a scene
- **Implementation approach:** Separate DOM and canvas layers with explicit pointer ownership
- **Recommended tools:** CSS stacking contexts, R3F Canvas
- **Security considerations:** Overlays must not mask navigation or focus rings
- **Verification method:** Test text selection, link clicks, and stacking at every chapter

### S145 — Frame loop discipline

- **Skill ID:** S145
- **Name:** Frame loop discipline
- **Purpose:** Avoid React updates on every rendered frame
- **When to use:** A scene has ongoing motion or scroll input
- **Implementation approach:** Mutate Three.js refs in useFrame and invalidate on demand
- **Recommended tools:** R3F useFrame, frameloop demand
- **Security considerations:** Stop animation loops when route is hidden or unmounted
- **Verification method:** Check idle CPU and render counts after motion ends

### S146 — Adaptive render quality

- **Skill ID:** S146
- **Name:** Adaptive render quality
- **Purpose:** Reduce GPU work on constrained devices
- **When to use:** Measured frame time misses the target
- **Implementation approach:** Adjust DPR, shadows, detail, and postprocessing from capability
- **Recommended tools:** R3F dpr, PerformanceMonitor
- **Security considerations:** Feature detection should not become device fingerprinting
- **Verification method:** Profile several device classes and toggle quality modes

### S147 — Reduced-motion scene

- **Skill ID:** S147
- **Name:** Reduced-motion scene
- **Purpose:** Offer stable chapter stills and remove camera movement in 3D when reduced motion is preferred
- **When to use:** User prefers reduced motion
- **Implementation approach:** Read media preference and render fixed scene compositions; use S473 for application-wide DOM/CSS transition and scroll behavior
- **Recommended tools:** prefers-reduced-motion, React media query
- **Security considerations:** Never override the operating-system preference
- **Verification method:** Emulate reduced motion and confirm the scene is static; verify broader route interactions under S473

### S148 — WebGL fallback

- **Skill ID:** S148
- **Name:** WebGL fallback
- **Purpose:** Keep story usable without graphics support
- **When to use:** Browser blocks or cannot create a context
- **Implementation approach:** Render a designed still/CSS scene with all copy and links
- **Recommended tools:** WebGL capability check, picture/source
- **Security considerations:** Serve fallback assets from a trusted origin
- **Verification method:** Force context failure and verify full narrative readability

### S149 — Context restoration

- **Skill ID:** S149
- **Name:** Context restoration
- **Purpose:** Recover after browser GPU context loss
- **When to use:** Mobile backgrounding or long pages evict context
- **Implementation approach:** Handle loss/restoration and rebuild disposable render resources
- **Recommended tools:** webglcontextlost events, Three.js
- **Security considerations:** Release stale render targets before rebuilding
- **Verification method:** Trigger context loss and confirm restore or static fallback

### S150 — Asset preload scheduling

- **Skill ID:** S150
- **Name:** Asset preload scheduling
- **Purpose:** Load scene assets shortly before they enter view
- **When to use:** Long pages have chapter-specific models
- **Implementation approach:** Preload by visibility threshold and cancel on route exit
- **Recommended tools:** useGLTF preload, IntersectionObserver
- **Security considerations:** Do not fetch private uploads before authorization
- **Verification method:** Record network waterfall and verify below-fold deferral

### S151 — GPU resource disposal

- **Skill ID:** S151
- **Name:** GPU resource disposal
- **Purpose:** Release textures, materials, and buffers on teardown
- **When to use:** Scene assets or themes are replaced
- **Implementation approach:** Track ownership and dispose unshared GPU resources
- **Recommended tools:** Three.js dispose, browser memory tools
- **Security considerations:** Remove user-derived textures when identity changes
- **Verification method:** Navigate repeatedly and check memory/object counts stabilize

### S152 — Texture compression

- **Skill ID:** S152
- **Name:** Texture compression
- **Purpose:** Reduce texture transfer and GPU memory costs
- **When to use:** Textures dominate GLB size or decoded memory
- **Implementation approach:** Choose resolution, mipmaps, and KTX2 by viewed scale
- **Recommended tools:** KTX2Loader, glTF Transform
- **Security considerations:** Strip metadata and verify asset provenance
- **Verification method:** Compare visual quality and decoded memory at camera distance

### S153 — 3D timeline ownership

- **Skill ID:** S153
- **Name:** 3D timeline ownership
- **Purpose:** Prevent scroll and hover animations competing
- **When to use:** Several controls animate the same transform
- **Implementation approach:** Separate authored chapter state from transient interaction state
- **Recommended tools:** GSAP context, R3F refs
- **Security considerations:** Cancel tweens on route or session changes
- **Verification method:** Rapidly enter/exit and scrub; check for stale writes

### S154 — Camera clipping bounds

- **Skill ID:** S154
- **Name:** Camera clipping bounds
- **Purpose:** Keep scene composition visible while maintaining appropriate depth precision and render cost
- **When to use:** When camera movement clips intended geometry or a loose frustum harms depth precision/performance
- **Implementation approach:** Calculate near/far planes from waypoint bounds and target extents; keep the far plane no wider than the scene requires
- **Recommended tools:** Three.js Box3, CameraHelper
- **Security considerations:** Clipping is a rendering/composition control, not authorization; private geometry/assets must never be sent to the client
- **Verification method:** Sweep path keyframes for clipping/depth artifacts and inspect client bundles/network payloads to confirm no private assets are delivered

### S155 — Scroll scene browser audit

- **Skill ID:** S155
- **Name:** Scroll scene browser audit
- **Purpose:** Manually inspect scroll-driven 3D behavior in a rendered browser
- **When to use:** After changing any scroll-driven 3D section
- **Implementation approach:** Review chapter transitions, motion continuity, and frame pacing in real desktop/mobile browsers; use S424 for repeatable responsive screenshot capture
- **Recommended tools:** Playwright, Chrome DevTools
- **Security considerations:** Use synthetic content and exclude private data from captures
- **Verification method:** Inspect rendered behavior and profile slow scroll/rapid fling; use S424 screenshots for deterministic viewport regression evidence

## Security engineering

### S156 — Threat modeling

- **Skill ID:** S156
- **Name:** Threat modeling
- **Purpose:** Prioritize controls against credible attacker paths
- **When to use:** Before exposing a feature
- **Implementation approach:** Map actors, assets, boundaries, abuse cases, owners
- **Recommended tools:** STRIDE, attack trees
- **Security considerations:** Include hostile documents and tenant crossing
- **Verification method:** Review mitigations against negative tests

### S157 — Trust-boundary mapping

- **Skill ID:** S157
- **Name:** Trust-boundary mapping
- **Purpose:** Track changes in input trust
- **When to use:** Across browser, model, storage, provider
- **Implementation approach:** Mark each boundary, retain provenance, and validate after decoding; use synthetic test records rather than product samples
- **Recommended tools:** Data-flow diagrams, typed contracts
- **Security considerations:** Never trust internal network or model output
- **Verification method:** Trace synthetic test data from ingress to display while identifying each trust transition

### S158 — Secret inventory

- **Skill ID:** S158
- **Name:** Secret inventory
- **Purpose:** Track credential owners and rotation path
- **When to use:** Before adding provider or OAuth secrets
- **Implementation approach:** Record credential class, owner, permitted purpose, approved storage, and rotation path; never inventory the value itself
- **Recommended tools:** Secret manager, repo scanner
- **Security considerations:** Meta credentials are excluded until written permission under S160/S236; no secret values in inventory or fixtures
- **Verification method:** Reconcile inventory with runtime configuration

### S159 — Secret scanning

- **Skill ID:** S159
- **Name:** Secret scanning
- **Purpose:** Block credentials before publication
- **When to use:** Every branch and public push
- **Implementation approach:** Scan staged diff and full repository
- **Recommended tools:** Gitleaks, GitHub scanning
- **Security considerations:** Rotate confirmed exposure immediately
- **Verification method:** Synthetic canary must fail CI

### S160 — Server-side key isolation

- **Skill ID:** S160
- **Name:** Server-side key isolation
- **Purpose:** Keep API keys out of browser code
- **When to use:** Only after written permission authorizes a user-key flow
- **Implementation approach:** Encrypt approved keys server-side; expose presence and validation status only
- **Recommended tools:** Secret manager, server-only modules, authenticated encryption library
- **Security considerations:** Until permission, collect and store no Meta keys; never return, bundle, log, or URL-encode them
- **Verification method:** Confirm intake is disabled before permission; inspect network, bundles, and logs after authorized implementation

### S161 — Envelope encryption

- **Skill ID:** S161
- **Name:** Envelope encryption
- **Purpose:** Protect credential rows with managed keys
- **When to use:** Only for credentials whose collection and storage are authorized; Meta credentials additionally require written permission under S160/S236
- **Implementation approach:** Wrap per-record data keys with KMS
- **Recommended tools:** Cloud KMS, libsodium
- **Security considerations:** Separate unwrap permission from database read; do not create or store Meta credential ciphertext before written permission
- **Verification method:** Use synthetic test-only credentials to decrypt and rewrap after rotation; verify Meta key intake remains disabled before authorization

### S162 — Key rotation

- **Skill ID:** S162
- **Name:** Key rotation
- **Purpose:** Replace signing and encryption keys safely
- **When to use:** At expiry or incident response
- **Implementation approach:** Version key IDs; use bounded dual-read window
- **Recommended tools:** KMS, JOSE key sets
- **Security considerations:** Never log key material
- **Verification method:** Test old/new reads and retired-key rejection

### S163 — Credential replacement

- **Skill ID:** S163
- **Name:** Credential replacement
- **Purpose:** Replace or remove a credential only after its collection and storage are authorized
- **When to use:** Only after written permission allows the relevant credential flow
- **Implementation approach:** Validate server-side; atomically swap or erase ciphertext
- **Recommended tools:** Credential endpoint, provider adapter, key manager
- **Security considerations:** Do not build Meta key intake before written permission under S160/S236; clear decrypted caches and revoke where supported
- **Verification method:** Verify intake stays disabled before permission; then test replacement and removal with synthetic test keys

### S164 — Log redaction

- **Skill ID:** S164
- **Name:** Log redaction
- **Purpose:** Redact telemetry, exporter, and SDK data at external observability boundaries
- **When to use:** When errors contain upstream data
- **Implementation approach:** Sanitize structured events before queues/exporters and review vendor SDK capture fields; use S067 for in-process application log serialization
- **Recommended tools:** Pino, OpenTelemetry
- **Security considerations:** Sanitize before event queues
- **Verification method:** Inject sentinels into telemetry envelopes and vendor errors; inspect emitted events, not just console logs

### S165 — Authentication assurance

- **Skill ID:** S165
- **Name:** Authentication assurance
- **Purpose:** Gate protected routes on verified identity
- **When to use:** Account and credential flows
- **Implementation approach:** Use maintained auth; reauthenticate sensitive changes
- **Recommended tools:** OIDC/session library
- **Security considerations:** Do not invent password or token schemes
- **Verification method:** Test missing, expired, revoked, stale sessions

### S166 — Cookie hardening

- **Skill ID:** S166
- **Name:** Cookie hardening
- **Purpose:** Protect browser session cookies
- **When to use:** When issuing web sessions
- **Implementation approach:** Set Secure, HttpOnly, SameSite, narrow scope
- **Recommended tools:** Framework cookie API
- **Security considerations:** Avoid broad domain scope without need
- **Verification method:** Assert attributes in browser and integration tests

### S167 — Session fixation defense

- **Skill ID:** S167
- **Name:** Session fixation defense
- **Purpose:** Prevent pre-login IDs becoming authenticated
- **When to use:** Login and privilege changes
- **Implementation approach:** Rotate identifiers; revoke previous value
- **Recommended tools:** Session middleware, Redis
- **Security considerations:** Invalidate old identifier server-side
- **Verification method:** Replay old cookie after login; expect denial

### S168 — Password hashing

- **Skill ID:** S168
- **Name:** Password hashing
- **Purpose:** Choose, calibrate, and verify the password hashing algorithm and work factor
- **When to use:** When storing local passwords
- **Implementation approach:** Use maintained Argon2id with calibrated memory/time/parallelism, per-password salt, and versioned rehash-on-login; use S052 for broader password-record lifecycle policy
- **Recommended tools:** argon2 library
- **Security considerations:** Never log or reversibly encrypt passwords; benchmark to resist offline guessing without exhausting online capacity
- **Verification method:** Inspect encoded hash parameters and benchmark verification under production-like limits; test upgrade and old-hash rehash paths

### S169 — MFA recovery

- **Skill ID:** S169
- **Name:** MFA recovery
- **Purpose:** Add second factor without recovery bypass
- **When to use:** When enabling TOTP or passkeys
- **Implementation approach:** Use established library and one-time hashed codes
- **Recommended tools:** WebAuthn, TOTP library
- **Security considerations:** Require step-up before factor removal
- **Verification method:** Test replay, drift, lost device, single use

### S170 — CSRF protection

- **Skill ID:** S170
- **Name:** CSRF protection
- **Purpose:** Define session-level CSRF token and origin defenses for cookie-based authentication
- **When to use:** When sessions are ambient credentials
- **Implementation approach:** Pair session tokens, SameSite cookies, and strict Origin/Fetch Metadata validation; use S051 to apply the policy at every mutation route
- **Recommended tools:** CSRF middleware, Fetch Metadata
- **Security considerations:** Keep GET side-effect free
- **Verification method:** Test token generation/rotation and cross-site form/fetch denial across representative session states

### S171 — CORS policy

- **Skill ID:** S171
- **Name:** CORS policy
- **Purpose:** Limit origins reading authenticated responses
- **When to use:** When browser API crosses origins
- **Implementation approach:** Allow exact origins, methods, and headers
- **Recommended tools:** CORS middleware, gateway config
- **Security considerations:** Never wildcard with credentials
- **Verification method:** Test hostile preflight and credentialed fetch

### S172 — Content Security Policy

- **Skill ID:** S172
- **Name:** Content Security Policy
- **Purpose:** Reduce script execution and exfiltration risk
- **When to use:** When deploying interactive pages
- **Implementation approach:** Use nonces/hashes and narrow source lists
- **Recommended tools:** CSP headers, violation reports
- **Security considerations:** Avoid unsafe-inline and broad wildcards
- **Verification method:** Enforce policy in browser; review violations

### S173 — Contextual output encoding

- **Skill ID:** S173
- **Name:** Contextual output encoding
- **Purpose:** Keep untrusted text from becoming executable
- **When to use:** When rendering notes and search results
- **Implementation approach:** Prefer text nodes; encode by output context
- **Recommended tools:** React escaping, OWASP Encoder
- **Security considerations:** Reject dangerous URL schemes
- **Verification method:** Test HTML, attribute, URL, script payloads

### S174 — Markdown sanitization

- **Skill ID:** S174
- **Name:** Markdown sanitization
- **Purpose:** Allow formatting without active markup
- **When to use:** When rendering user or model Markdown
- **Implementation approach:** Parse AST; allowlist nodes and link protocols
- **Recommended tools:** remark, rehype-sanitize
- **Security considerations:** Reject raw HTML, javascript, untrusted embeds
- **Verification method:** Fuzz markup; inspect DOM for active nodes

### S175 — SSRF-safe retrieval

- **Skill ID:** S175
- **Name:** SSRF-safe retrieval
- **Purpose:** Prevent URL fetches reaching private services
- **When to use:** When backend retrieves web sources
- **Implementation approach:** Allow HTTP(S), block private IPs, recheck redirects
- **Recommended tools:** WHATWG URL, egress proxy
- **Security considerations:** Reject loopback, link-local, private, metadata targets
- **Verification method:** Test redirect chains to private addresses

### S176 — DNS rebinding defense

- **Skill ID:** S176
- **Name:** DNS rebinding defense
- **Purpose:** Keep host checks valid at connect time
- **When to use:** When fetching attacker-controlled domains
- **Implementation approach:** Pin approved IP to socket; recheck redirects
- **Recommended tools:** Undici dispatcher, proxy
- **Security considerations:** Do not validate DNS only once
- **Verification method:** Test answer changes and inspect peer IP

### S177 — URL parser hardening

- **Skill ID:** S177
- **Name:** URL parser hardening
- **Purpose:** Reject ambiguous host and scheme forms
- **When to use:** When parsing imported URLs
- **Implementation approach:** Use standard parser; reject credentials and odd ports
- **Recommended tools:** WHATWG URL, allowlist
- **Security considerations:** No substring host authorization
- **Verification method:** Property-test Unicode and encoded variants

### S178 — SQL injection prevention

- **Skill ID:** S178
- **Name:** SQL injection prevention
- **Purpose:** Keep values from altering query structure
- **When to use:** When request values filter records
- **Implementation approach:** Bind parameters; allowlist identifiers
- **Recommended tools:** Parameterized SQL, DB driver
- **Security considerations:** Never concatenate raw sort/search fragments
- **Verification method:** Test quotes, comments, encoded payloads

### S179 — Safe dynamic queries

- **Skill ID:** S179
- **Name:** Safe dynamic queries
- **Purpose:** Support filters without raw SQL
- **When to use:** When users select columns or directions
- **Implementation approach:** Map public enums to fixed identifiers
- **Recommended tools:** Typed query builder, Zod
- **Security considerations:** Reject unknown fields
- **Verification method:** Fuzz options and inspect generated SQL

### S180 — IDOR prevention

- **Skill ID:** S180
- **Name:** IDOR prevention
- **Purpose:** Block access by changing a record ID
- **When to use:** Every route accepting identifiers
- **Implementation approach:** Fetch via authenticated-user scoped repository
- **Recommended tools:** Repository layer, policy tests
- **Security considerations:** Never accept owner ID from request body
- **Verification method:** Try cross-account read/write/delete/export

### S181 — Tenant isolation

- **Skill ID:** S181
- **Name:** Tenant isolation
- **Purpose:** Make ownership unavoidable in data access
- **When to use:** Per-user calendar and study records
- **Implementation approach:** Apply tenant predicates in repos and DB policies
- **Recommended tools:** PostgreSQL RLS, repositories
- **Security considerations:** UI filtering is not authorization
- **Verification method:** Run cross-tenant tests through service entry points

### S182 — Privilege escalation review

- **Skill ID:** S182
- **Name:** Privilege escalation review
- **Purpose:** Prevent self-granted roles or permissions
- **When to use:** When roles or tool scopes change
- **Implementation approach:** Centralize transitions; validate actor and target
- **Recommended tools:** Policy engine, permission matrix
- **Security considerations:** Ignore role claims from model output
- **Verification method:** Test self-promotion and delegation boundaries

### S183 — Abuse-resistant rate limits

- **Skill ID:** S183
- **Name:** Abuse-resistant rate limits
- **Purpose:** Bound brute force and expensive operations
- **When to use:** Auth, upload, generation endpoints
- **Implementation approach:** Use distributed per-user, risk-aware buckets
- **Recommended tools:** Redis, gateway limits
- **Security considerations:** Avoid attacker-triggered permanent lockout
- **Verification method:** Test bursts, proxy behavior, recovery

### S184 — Credential stuffing defense

- **Skill ID:** S184
- **Name:** Credential stuffing defense
- **Purpose:** Detect repeated leaked-password attempts
- **When to use:** Internet-facing sign-in
- **Implementation approach:** Add progressive delay and approved breach screening
- **Recommended tools:** Auth provider controls
- **Security considerations:** Equalize unknown-user and wrong-password errors
- **Verification method:** Test repeats and enumeration resistance

### S185 — File type verification

- **Skill ID:** S185
- **Name:** File type verification
- **Purpose:** Reject renamed or disguised uploads
- **When to use:** When importing study materials
- **Implementation approach:** Check magic bytes and parser success
- **Recommended tools:** file-type, MIME database
- **Security considerations:** Do not trust extension or browser MIME
- **Verification method:** Upload renamed executable and malformed file

### S186 — Archive expansion limits

- **Skill ID:** S186
- **Name:** Archive expansion limits
- **Purpose:** Stop zip bombs and traversal
- **When to use:** When parsing office containers
- **Implementation approach:** Cap entries, expanded bytes, depth, normalized paths
- **Recommended tools:** Archive limits, isolated worker
- **Security considerations:** Reject symlinks and root escape
- **Verification method:** Test high-ratio and traversal archives

### S187 — Malware quarantine

- **Skill ID:** S187
- **Name:** Malware quarantine
- **Purpose:** Keep files unavailable until scan completes
- **When to use:** Asynchronous upload inspection
- **Implementation approach:** Use quarantined, clean, rejected states with private ACLs
- **Recommended tools:** Storage ACLs, scan queue
- **Security considerations:** No public URL before clean status
- **Verification method:** Rejected file cannot be fetched or parsed

### S188 — MIME sniffing defense

- **Skill ID:** S188
- **Name:** MIME sniffing defense
- **Purpose:** Prevent browsers executing uploaded markup
- **When to use:** When serving files and exports
- **Implementation approach:** Set verified type, nosniff, attachment disposition
- **Recommended tools:** HTTP headers, file parser
- **Security considerations:** Isolate or force-download risky formats
- **Verification method:** Open hostile SVG/HTML and confirm inert behavior

### S189 — Prompt injection defense

- **Skill ID:** S189
- **Name:** Prompt injection defense
- **Purpose:** Isolate policy from untrusted retrieved text during context assembly
- **When to use:** When documents or web passages enter model context; use S265 for planner validation and server-enforced action checks
- **Implementation approach:** Keep policy and retrieved data in separate fields, retain source provenance, and label passages as untrusted defense in depth; this context boundary is not an execution control (see S265)
- **Recommended tools:** Prompt tests, source wrappers
- **Security considerations:** Labels only help preserve context trust; they neither constrain tools nor grant authority. Server-side identity, ownership, permission, bounds, and approval enforcement belong to S265 with S192/S193
- **Verification method:** Use test-only hostile-source cases to verify policy and passages stay distinct in assembled context; separately verify S265 rejects unauthorized proposed actions even when source labels are present

### S190 — Retrieval trust segmentation

- **Skill ID:** S190
- **Name:** Retrieval trust segmentation
- **Purpose:** Retain provenance on every passage
- **When to use:** When combining notes and web sources
- **Implementation approach:** Tag each chunk with owner, source, and trust; labels aid provenance, while server authorization must still run under S189/S265 for each action
- **Recommended tools:** Typed retrieval records, citation metadata
- **Security considerations:** Never merge content into privileged policy text
- **Verification method:** Inspect context built from malicious sources

### S191 — Model output validation

- **Skill ID:** S191
- **Name:** Model output validation
- **Purpose:** Prevent malformed generation reaching actions
- **When to use:** After S236 authorizes official Meta inference, when structured model output enters application logic
- **Implementation approach:** Parse strict schema, then validate domain rules
- **Recommended tools:** Zod, JSON Schema
- **Security considerations:** Treat all model output as untrusted data; schema validation is not authorization or approval
- **Verification method:** Fuzz missing, extra, oversized, wrong-type fields

### S192 — Tool authorization gate

- **Skill ID:** S192
- **Name:** Tool authorization gate
- **Purpose:** Restrict tools to current user permissions
- **When to use:** Before any agent tool call
- **Implementation approach:** Check identity, scope, ownership every call
- **Recommended tools:** Policy module, tool registry
- **Security considerations:** Model cannot grant itself authority
- **Verification method:** Attempt denied tools and cross-user IDs

### S193 — Approval binding

- **Skill ID:** S193
- **Name:** Approval binding
- **Purpose:** Authorize only the exact consequential action the user reviewed
- **When to use:** Before every consequential mutation, regardless of risk tier or reversibility
- **Implementation approach:** Persist approval bound to authenticated user, normalized action/payload hash, resource versions, approval scope, and expiry; require exact match at server execution
- **Recommended tools:** Typed preview, approval record
- **Security considerations:** Recheck identity, ownership, permissions, bounds, and approval server-side; any target, payload, version, or scope change invalidates approval; calendar edits remain drafts until approved under S369
- **Verification method:** Attempt replay, cross-user use, expired use, and one-field payload/version/scope change; every mismatch must be denied

### S194 — Egress allowlisting

- **Skill ID:** S194
- **Name:** Egress allowlisting
- **Purpose:** Limit outbound requests to approved services
- **When to use:** When backend fetches network URLs
- **Implementation approach:** Use proxy with explicit host and port rules
- **Recommended tools:** Firewall, egress proxy
- **Security considerations:** Block private ranges and metadata globally
- **Verification method:** Denied hosts open no socket

### S195 — Data minimization

- **Skill ID:** S195
- **Name:** Data minimization
- **Purpose:** Avoid collecting fields without product purpose
- **When to use:** New profile or telemetry fields
- **Implementation approach:** Document purpose and retention before schema change
- **Recommended tools:** Data inventory, event catalog
- **Security considerations:** Do not send study content to analytics by default
- **Verification method:** Compare fields with actual behavior

### S196 — Deletion propagation

- **Skill ID:** S196
- **Name:** Deletion propagation
- **Purpose:** Remove account data across dependent stores
- **When to use:** On account deletion request
- **Implementation approach:** Run idempotent cleanup and record status
- **Recommended tools:** Deletion state machine, revoke APIs
- **Security considerations:** Revoke sessions and keys before cleanup finishes
- **Verification method:** Verify every store reaches documented terminal state

### S197 — Security audit trail

- **Skill ID:** S197
- **Name:** Security audit trail
- **Purpose:** Define durable, append-only audit record structure for sensitive security events
- **When to use:** Credential, OAuth, role, export actions
- **Implementation approach:** Specify actor, action, target, time, request ID, retention, and DB write restrictions; use S078 for which account events to emit, S268 for run history, and S286 for tool-call records
- **Recommended tools:** Audit table, SIEM bridge
- **Security considerations:** Exclude secrets and content
- **Verification method:** Attempt unauthorized update/delete as app role and assert sanitized critical transitions remain queryable by permitted reviewers

### S198 — Backup confidentiality

- **Skill ID:** S198
- **Name:** Backup confidentiality
- **Purpose:** Protect snapshots and restore workflows
- **When to use:** When backups contain user data
- **Implementation approach:** Encrypt; restrict restore roles; document expiry
- **Recommended tools:** Cloud KMS, backup IAM
- **Security considerations:** Treat snapshots as production data
- **Verification method:** Restore in isolation; verify permission and expiry

### S199 — Dependency vulnerability response

- **Skill ID:** S199
- **Name:** Dependency vulnerability response
- **Purpose:** Reduce exposure to vulnerable packages
- **When to use:** When advisories affect deployed code
- **Implementation approach:** Assess reachability and patch supported version
- **Recommended tools:** Dependabot, OSV Scanner
- **Security considerations:** Do not run scripts from unreviewed packages
- **Verification method:** Rebuild lockfile and verify vulnerable path gone

### S200 — Security header baseline

- **Skill ID:** S200
- **Name:** Security header baseline
- **Purpose:** Apply browser policies across responses
- **When to use:** Pages, errors, redirects, downloads
- **Implementation approach:** Set HSTS, frame, nosniff, referrer, permissions
- **Recommended tools:** Helmet, reverse proxy
- **Security considerations:** Block framing by untrusted origins
- **Verification method:** Check headers on success, error, redirect, file

## Database engineering

### S201 — Relational domain modeling

- **Skill ID:** S201
- **Name:** Relational domain modeling
- **Purpose:** Represent users, calendars, notebooks, and sources without duplication
- **When to use:** When shaping a new feature schema
- **Implementation approach:** Separate entities by lifecycle; model many-to-many links explicitly
- **Recommended tools:** PostgreSQL, ERD, Prisma/Drizzle
- **Security considerations:** Do not put secrets or file contents in broad profile rows
- **Verification method:** Review cardinality and ownership paths against modeled workflows without seeding product records

### S202 — Migration sequencing

- **Skill ID:** S202
- **Name:** Migration sequencing
- **Purpose:** Evolve production schema with recoverable steps
- **When to use:** When changing persisted fields or indexes
- **Implementation approach:** Keep migrations ordered, reversible where practical, and data-aware
- **Recommended tools:** Prisma Migrate, Drizzle Kit, SQL migration tool
- **Security considerations:** Never put real user data into migration fixtures
- **Verification method:** Apply migrations from clean and previous-version schemas

### S203 — Expand-contract migrations

- **Skill ID:** S203
- **Name:** Expand-contract migrations
- **Purpose:** Deploy schema changes across overlapping app versions
- **When to use:** When renaming or splitting a live column
- **Implementation approach:** Add new shape, dual-write/read, backfill, then remove old field later
- **Recommended tools:** SQL migrations, background backfill job
- **Security considerations:** Keep authorization consistent during dual-read period
- **Verification method:** Test old and new app versions against each migration stage

### S204 — Primary-key strategy

- **Skill ID:** S204
- **Name:** Primary-key strategy
- **Purpose:** Choose stable identifiers for joins and external references
- **When to use:** When creating a durable entity
- **Implementation approach:** Use generated opaque IDs with suitable database index locality
- **Recommended tools:** UUIDv7, ULID, PostgreSQL identity
- **Security considerations:** Do not expose sequential IDs when enumeration creates risk
- **Verification method:** Load-test inserts and verify IDs are not client-controlled

### S205 — Foreign-key integrity

- **Skill ID:** S205
- **Name:** Foreign-key integrity
- **Purpose:** Prevent orphaned records when related objects change
- **When to use:** When records depend on accounts, notebooks, or events
- **Implementation approach:** Add explicit foreign keys and choose deletion behavior per relationship
- **Recommended tools:** PostgreSQL constraints, migration tooling
- **Security considerations:** Never cascade-delete shared or legal-hold records implicitly
- **Verification method:** Attempt orphan inserts and deletion edge cases in DB tests

### S206 — Check constraints

- **Skill ID:** S206
- **Name:** Check constraints
- **Purpose:** Enforce domain invariants below the application layer
- **When to use:** When a value must remain in an allowed range or state set
- **Implementation approach:** Encode stable bounds and enums as database checks
- **Recommended tools:** PostgreSQL CHECK constraints
- **Security considerations:** Do not store credentials in constraint error text
- **Verification method:** Insert invalid states directly and confirm database rejects them

### S207 — Composite uniqueness

- **Skill ID:** S207
- **Name:** Composite uniqueness
- **Purpose:** Prevent duplicate records within a natural owner scope
- **When to use:** When names, external IDs, or recurrence keys must be unique
- **Implementation approach:** Create unique indexes over tenant plus business key
- **Recommended tools:** PostgreSQL unique index
- **Security considerations:** Include tenant scope to avoid cross-user collisions
- **Verification method:** Race concurrent duplicate creates and verify one is rejected

### S208 — Index selection

- **Skill ID:** S208
- **Name:** Index selection
- **Purpose:** Speed high-value queries without over-indexing writes
- **When to use:** When query traces show slow filters or joins
- **Implementation approach:** Index actual predicates and ordering; measure write overhead
- **Recommended tools:** EXPLAIN ANALYZE, pg_stat_statements
- **Security considerations:** Restrict query-plan, database-log, and monitoring access; redact bound values where instrumentation captures them. Indexes themselves are not the usual value-disclosure surface
- **Verification method:** Benchmark representative reads/writes and inspect least-privilege plan/log access plus bind-value redaction in monitoring

### S209 — Partial indexes

- **Skill ID:** S209
- **Name:** Partial indexes
- **Purpose:** Index only rows that participate in frequent queries
- **When to use:** When active, unarchived, or pending subsets dominate access
- **Implementation approach:** Use WHERE predicates matching the stable query filter
- **Recommended tools:** PostgreSQL partial index
- **Security considerations:** Ensure excluded rows cannot bypass authorization logic
- **Verification method:** Compare plan and latency for active and archived fixtures

### S210 — Query-plan diagnosis

- **Skill ID:** S210
- **Name:** Query-plan diagnosis
- **Purpose:** Find the actual cause of slow database queries
- **When to use:** When endpoint timing points to database work
- **Implementation approach:** Inspect row estimates, scans, joins, and buffer usage
- **Recommended tools:** EXPLAIN ANALYZE, auto_explain
- **Security considerations:** Use synthetic or scrubbed data in shared query plans
- **Verification method:** Re-run with representative cardinality and verify planner choice

### S211 — Transaction boundary design

- **Skill ID:** S211
- **Name:** Transaction boundary design
- **Purpose:** Keep related writes atomic without holding locks too long
- **When to use:** When one user action updates multiple records
- **Implementation approach:** Place only consistency-critical operations in a transaction
- **Recommended tools:** PostgreSQL transactions, ORM transaction API
- **Security considerations:** Perform authorization reads inside the same consistency boundary where needed
- **Verification method:** Inject failure between writes and verify full rollback

### S212 — Isolation and retry policy

- **Skill ID:** S212
- **Name:** Isolation and retry policy
- **Purpose:** Handle concurrent transactions without corrupting state
- **When to use:** When scheduling or importing can race
- **Implementation approach:** Select isolation level intentionally and retry serialization errors safely
- **Recommended tools:** PostgreSQL isolation levels, retry helper
- **Security considerations:** Retries must not duplicate external side effects
- **Verification method:** Run concurrent conflicting transactions and verify deterministic result

### S213 — Optimistic concurrency control

- **Skill ID:** S213
- **Name:** Optimistic concurrency control
- **Purpose:** Prevent stale edits overwriting newer user changes
- **When to use:** When forms can remain open while records change
- **Implementation approach:** Use version column or ETag precondition and return conflict for stale writes
- **Recommended tools:** PostgreSQL version field, HTTP If-Match
- **Security considerations:** Do not let clients choose arbitrary version numbers to bypass checks
- **Verification method:** Submit two updates from same version and confirm one conflicts

### S214 — Row-level security

- **Skill ID:** S214
- **Name:** Row-level security
- **Purpose:** Enforce tenant scoping inside the database session
- **When to use:** When multiple services query shared tenant tables
- **Implementation approach:** Set authenticated tenant context transaction-locally and define policies
- **Recommended tools:** PostgreSQL RLS, session variables
- **Security considerations:** Never reuse a pooled connection with stale tenant context
- **Verification method:** Test queries under missing, valid, and switched tenant contexts

### S215 — Tenant-scoped repository API

- **Skill ID:** S215
- **Name:** Tenant-scoped repository API
- **Purpose:** Make ownership predicates automatic for application queries
- **When to use:** When many handlers access per-user rows
- **Implementation approach:** Expose repository methods that require a verified tenant argument
- **Recommended tools:** Typed repository, query builder
- **Security considerations:** Do not permit unscoped list/read methods in feature code
- **Verification method:** Static scan or tests reject queries lacking tenant scope

### S216 — Connection pool sizing

- **Skill ID:** S216
- **Name:** Connection pool sizing
- **Purpose:** Avoid saturating database connections under web concurrency
- **When to use:** When deploying multiple API and worker processes
- **Implementation approach:** Set pool limits from database capacity and process count
- **Recommended tools:** pg pool metrics, PgBouncer
- **Security considerations:** Do not share admin credentials with app pool
- **Verification method:** Load test connections and monitor wait time and saturation

### S217 — Serverless connection pooling

- **Skill ID:** S217
- **Name:** Serverless connection pooling
- **Purpose:** Prevent short-lived instances exhausting database connection limits
- **When to use:** When deploying autoscaled functions
- **Implementation approach:** Use a transaction pooler and avoid session state assumptions
- **Recommended tools:** PgBouncer, managed pooler
- **Security considerations:** Do not depend on connection-local tenant state across transactions
- **Verification method:** Burst cold starts and verify pool use remains bounded

### S218 — Statement timeout policy

- **Skill ID:** S218
- **Name:** Statement timeout policy
- **Purpose:** Bound runaway queries and release scarce connections
- **When to use:** For endpoints with user-controlled filters or search
- **Implementation approach:** Set role or transaction timeouts with route-specific budgets
- **Recommended tools:** PostgreSQL statement_timeout
- **Security considerations:** Do not allow untrusted users to override limits
- **Verification method:** Run intentionally slow query and verify cancellation plus clean retry

### S219 — Lock ordering discipline

- **Skill ID:** S219
- **Name:** Lock ordering discipline
- **Purpose:** Reduce deadlocks when operations update related tables
- **When to use:** When transactions touch several entity types
- **Implementation approach:** Acquire locks in one documented order and keep transactions short
- **Recommended tools:** PostgreSQL lock monitoring
- **Security considerations:** Avoid waiting for remote APIs while holding database locks
- **Verification method:** Run competing writes and inspect deadlock rate under load

### S220 — Soft-delete semantics

- **Skill ID:** S220
- **Name:** Soft-delete semantics
- **Purpose:** Retain recoverability only where product rules require it
- **When to use:** When removing events, notebooks, or integration links
- **Implementation approach:** Use explicit deleted_at state and filter it consistently
- **Recommended tools:** PostgreSQL partial indexes, repository methods
- **Security considerations:** Deleted data must not reappear in search, exports, or agent context
- **Verification method:** Test all query paths before and after soft deletion

### S221 — Retention purge jobs

- **Skill ID:** S221
- **Name:** Retention purge jobs
- **Purpose:** Remove expired records according to a documented schedule
- **When to use:** When legal or product retention requires cleanup
- **Implementation approach:** Select bounded batches, record outcomes, and make jobs idempotent
- **Recommended tools:** Scheduled worker, database cursor
- **Security considerations:** Protect deletion jobs from broad unauthenticated triggers
- **Verification method:** Seed expired and retained rows; verify only due data is removed

### S222 — Encrypted-column storage

- **Skill ID:** S222
- **Name:** Encrypted-column storage
- **Purpose:** Store API secrets as authenticated ciphertext rather than plaintext
- **When to use:** For authorized OAuth tokens; Meta credentials only after written permission under S160/S236
- **Implementation approach:** Keep ciphertext, nonce, key version, and rotation metadata separate
- **Recommended tools:** KMS, AEAD library
- **Security considerations:** Do not enable Meta-key intake or storage before written permission; restrict query exports/admin views from decryption by default
- **Verification method:** Inspect raw DB rows and test tamper detection

### S223 — Append-only audit tables

- **Skill ID:** S223
- **Name:** Append-only audit tables
- **Purpose:** Preserve consequential change history against ordinary mutation
- **When to use:** When storing security or account lifecycle events
- **Implementation approach:** Restrict app role to INSERT and read selected audit columns
- **Recommended tools:** PostgreSQL grants, immutable event table
- **Security considerations:** Avoid sensitive payloads and direct identifiers where unnecessary
- **Verification method:** Attempt update/delete as app role and confirm denial

### S224 — JSON column boundaries

- **Skill ID:** S224
- **Name:** JSON column boundaries
- **Purpose:** Use flexible JSON only for evolving bounded metadata
- **When to use:** When a feature has stable core fields plus sparse extensions
- **Implementation approach:** Keep query-critical values relational and validate JSON shape at ingress
- **Recommended tools:** PostgreSQL JSONB, Zod
- **Security considerations:** Do not use JSON as a bypass around ownership constraints
- **Verification method:** Test malformed documents and query index needs

### S225 — Full-text search indexing

- **Skill ID:** S225
- **Name:** Full-text search indexing
- **Purpose:** Search user-owned notes with language-aware tokenization
- **When to use:** When notebook lookup needs more than substring matching
- **Implementation approach:** Build tsvector with supported locale and scope queries by tenant
- **Recommended tools:** PostgreSQL text search, GIN index
- **Security considerations:** Never run broad search without authenticated owner filter
- **Verification method:** Test stemming, punctuation, and tenant isolation

### S226 — Embedding index lifecycle

- **Skill ID:** S226
- **Name:** Embedding index lifecycle
- **Purpose:** Keep semantic search data aligned with source-document lifecycle
- **When to use:** Only after verifying an officially documented and authorized embedding capability
- **Implementation approach:** Version model metadata and delete vectors with source records
- **Recommended tools:** pgvector, migration job, confirmed official API client
- **Security considerations:** Require written permission before Meta credentials or inference; never substitute another embedding provider
- **Verification method:** Check source deletion removes every vector and stale index reference

### S227 — Backup restore drills

- **Skill ID:** S227
- **Name:** Backup restore drills
- **Purpose:** Prove database backups restore into a usable, isolated environment
- **When to use:** When enabling scheduled backups
- **Implementation approach:** Automate scheduled backup restore into a separate project and verify schema, data integrity, and access; use S435 for application-level checkpoint and run-resume recovery
- **Recommended tools:** Managed backup tooling, restore script
- **Security considerations:** Restrict backup download and scrub isolated restore targets; never restore private backup material into shared developer worktrees
- **Verification method:** Run a database restore drill, record measured recovery point, and verify the isolated restore; exercise app checkpoints separately under S435

### S228 — Read-replica consistency

- **Skill ID:** S228
- **Name:** Read-replica consistency
- **Purpose:** Avoid showing stale records after a user's write
- **When to use:** When distributing read load across replicas
- **Implementation approach:** Route read-after-write paths to primary or use replication position tokens
- **Recommended tools:** PostgreSQL replicas, routing layer
- **Security considerations:** Replica routing must preserve tenant and session authorization
- **Verification method:** Write then immediately read; verify promised consistency behavior

### S229 — Partitioning strategy

- **Skill ID:** S229
- **Name:** Partitioning strategy
- **Purpose:** Keep very large time-based tables manageable
- **When to use:** When event or audit volume makes maintenance costly
- **Implementation approach:** Partition on stable time scope and automate future partition creation
- **Recommended tools:** PostgreSQL declarative partitioning
- **Security considerations:** Partition keys must not become a cross-tenant access shortcut
- **Verification method:** Test pruning, retention deletion, and query plans across partitions

### S230 — Migration fixture hygiene

- **Skill ID:** S230
- **Name:** Migration fixture hygiene
- **Purpose:** Build realistic database tests without copying private records
- **When to use:** When validating migrations and repository behavior
- **Implementation approach:** Generate deterministic synthetic users and edge-case rows
- **Recommended tools:** Faker, SQL fixtures, migration tests
- **Security considerations:** Never export production snapshots into developer worktrees
- **Verification method:** Scan fixtures for emails, tokens, and real document text

## Agent orchestration

### S231 — Agent run state machine

- **Skill ID:** S231
- **Name:** Agent run state machine
- **Purpose:** Make task lifecycle explicit and restartable
- **When to use:** For deterministic run-state handling immediately; execute model-dependent states only after the S236 Meta permission and capability gate
- **Implementation approach:** Define queued, planning, approval, running, verifying, terminal states
- **Recommended tools:** Typed unions, state table
- **Security considerations:** Validate transitions against run owner; do not enter inference states while S236 is closed
- **Verification method:** Test legal and illegal transitions

### S232 — Plan decomposition

- **Skill ID:** S232
- **Name:** Plan decomposition
- **Purpose:** Turn broad requests into checkable steps
- **When to use:** For deterministic or user-authored decomposition immediately; for model-generated plans only after the written-permission and capability gates in S236
- **Implementation approach:** Represent steps, dependencies, outputs, and risk in a validated DAG; keep deterministic/user-authored planning available while inference is disabled, and use only officially supported Meta inference after S236
- **Recommended tools:** Typed plan schema, Zod; documented Meta structured output only after S236 authorization
- **Security considerations:** A plan is never authority; no model inference or alternate provider while the S236 gate is closed
- **Verification method:** Reject cycles and missing dependencies; verify the model path is disabled before authorization and deterministic plans still validate

### S233 — Plan schema

- **Skill ID:** S233
- **Name:** Plan schema
- **Purpose:** Make orchestration data inspectable
- **When to use:** When planner output controls execution
- **Implementation approach:** Use typed IDs, tool names, arguments, completion criteria
- **Recommended tools:** JSON Schema, TypeScript
- **Security considerations:** Reject unknown tools and privilege fields
- **Verification method:** Fuzz missing and extra plan fields

### S234 — Incremental replanning

- **Skill ID:** S234
- **Name:** Incremental replanning
- **Purpose:** Adapt remaining tasks after new evidence
- **When to use:** When a step changes assumptions
- **Implementation approach:** Freeze completed work; regenerate unresolved dependencies only
- **Recommended tools:** Graph model, planner prompt
- **Security considerations:** Do not silently expand scope or approval
- **Verification method:** Compare revisions and preserve completed steps

### S235 — Bounded execution loop

- **Skill ID:** S235
- **Name:** Bounded execution loop
- **Purpose:** Prevent indefinite agent runs
- **When to use:** Every multi-step execution
- **Implementation approach:** Cap steps, time, tokens, and retries server-side
- **Recommended tools:** Worker queue, run budget
- **Security considerations:** Limits cannot depend on prompt instructions
- **Verification method:** Exhaust each budget and inspect stop state

### S236 — Meta inference adapter

- **Skill ID:** S236
- **Name:** Meta inference adapter
- **Purpose:** Enforce the product-wide gate for all end-user Meta inference
- **When to use:** Before enabling any model-generated answer, plan, tutoring, quiz, research, or study workflow
- **Implementation approach:** Keep inference disabled by default; enable only after written Meta permission, operator/legal approval, adult 18+ eligibility, and official capability/terms verification, then route every call through the documented Meta adapter
- **Recommended tools:** Official Meta documentation, server HTTP client
- **Security considerations:** No Meta key intake/storage before written permission; no targeting minors; no alternate provider or fallback; deterministic and user-authored features remain distinct from inference
- **Verification method:** Assert every generation route is blocked until all gates pass; after authorization, verify the official endpoint/capability, server-side credential handling, and redacted errors

### S237 — Structured plan generation

- **Skill ID:** S237
- **Name:** Structured plan generation
- **Purpose:** Produce plans that match runtime contracts
- **When to use:** Only after written permission and the S236 capability, eligibility, and operator/legal checks, when official Meta inference creates tool steps
- **Implementation approach:** Keep the feature disabled until S236 passes; request only an officially supported structure, then validate the returned plan locally
- **Recommended tools:** Officially documented Meta structured-output capability only after S236; JSON Schema
- **Security considerations:** No key intake or model call before written permission; no alternate provider; output remains untrusted
- **Verification method:** Assert requests are blocked before S236; afterward run valid, malformed, and adversarial test-only response fixtures

### S238 — Tool selection policy

- **Skill ID:** S238
- **Name:** Tool selection policy
- **Purpose:** Choose actions allowed for current user
- **When to use:** For deterministic policy filtering always; use model-selected tools only after S236 authorizes inference
- **Implementation approach:** Filter candidates by authenticated scopes, consent, and risk before exposing schemas; server authorization remains authoritative under S192
- **Recommended tools:** Tool registry, policy engine
- **Security considerations:** Hide unauthorized schemas, but never treat schema visibility as permission or approval
- **Verification method:** Probe forbidden names and scopes

### S239 — Ephemeral run context

- **Skill ID:** S239
- **Name:** Ephemeral run context
- **Purpose:** Keep task context temporary and bounded
- **When to use:** When assembling one execution request
- **Implementation approach:** Build immutable run-scoped context with expiry
- **Recommended tools:** Typed context object, scoped cache
- **Security considerations:** Clear on completion and account switch
- **Verification method:** Inspect context after cancellation
