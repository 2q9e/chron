# Architecture decisions

## ADR 001 — start as a modular Next.js application

**Status:** accepted as the implementation baseline; review after the first
working vertical slice.

### Decision

Use one TypeScript Next.js App Router application. Keep route handlers and
server-only modules in `apps/web`; organize product code under feature folders.
Create a separate package only when a real shared boundary exists. Use
PostgreSQL for durable application data, Drizzle for typed schemas and
versioned migrations, and Better Auth for established account/session flows.
Use real email delivery for verification and password reset; public signup
must fail closed unless the required service is configured and policy gates
are satisfied.

Next.js pages and layouts stay server-rendered by default. Keep interactive
browser code narrow, especially the dynamically loaded Three.js scene. Server
secrets and database modules must not cross into client bundles; use the
framework's `server-only` boundary and inspect build output.

### Security and privacy boundaries

- Derive the account owner from the validated server session for every read and
  write. Never authorize with a browser-supplied user ID.
- Put SQL in a small data-access layer that requires an authenticated owner
  context. Add database ownership constraints and tests for cross-account
  access before adding personal data features.
- Apply schema changes with checked-in SQL migrations. Never use production
  schema push as an unreviewed deployment step.
- Store secrets outside the repository. If Meta later authorizes the planned
  user-key flow, use authenticated field encryption with a key held outside
  Postgres, version the ciphertext format, rotate keys deliberately, and keep
  credentials server-side. Until then, Chron must not accept Meta keys.
- Use server-side rate limits and strict request schemas at all public API
  boundaries. External documents, URLs, model outputs, and OAuth responses are
  untrusted input.
- Keep provider selection fixed to the official Meta Model API if inference is
  permitted. No alternate model vendor or silent fallback is allowed.

### Why this shape

The product needs server rendering, secure authenticated mutations, relational
ownership, and browser-only 3D. A modular monolith gives those boundaries
without inventing separate services before any workload requires them.
PostgreSQL matches recurring calendar and study relationships; tracked SQL
migrations make changes reviewable. Better Auth avoids custom password/session
cryptography, while email verification and reset remain real flows backed by a
configured mail transport.

### Alternatives considered

- **Client-only SPA with third-party auth:** rejected because private data and
  tool authorization need an application server, and no external auth service
  has been selected or authorized.
- **Microservices from the outset:** rejected because no independent scaling,
  deployment, or ownership need has been measured.
- **SQLite in production:** rejected because multi-user deployment and managed
  backup/retention behavior have not been established for it.

### Evidence and limits

Next.js documents Server Components as the default and recommends keeping
interactive state in narrow Client Components. Better Auth documents Next.js
route handlers and PostgreSQL/Drizzle adapters. Drizzle documents versioned
SQL migrations. These official docs establish framework capabilities, not a
complete security guarantee. Account and database code still requires threat
modeling and tests.

- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql)
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations)

### Verification required during implementation

1. Pin current compatible package versions and run dependency/license audits.
2. Prove production builds do not bundle server secrets or database modules.
3. Exercise signup, login, email verification, session expiry, password reset,
   logout, and account deletion against a disposable PostgreSQL database and a
   local email sink.
4. Test cross-account reads and writes at both the data-access and database
   boundary.
5. Test the production build in a real browser before enabling any public
   registration.

## ADR 002 — landing-page scene uses one persistent 3D world

**Status:** accepted for the first UI milestone.

Use a single Three.js scene and renderer, with native document scroll as the
source of truth for a normalized, reversible chapter state. DOM content carries
all meaning and controls. The world is an original abstract calendar-time
instrument; it contains no generated schedule, fabricated event, screenshot,
or sample user record. Reduced motion, mobile, and WebGL failure receive
composed static alternatives.

See [the landing-page brief](../design/landing-brief.md) for the story ledger,
palette, copy, and visual verification criteria.
