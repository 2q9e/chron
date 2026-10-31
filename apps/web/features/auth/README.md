# Authentication service

Chron uses Better Auth 1.7.14 with PostgreSQL-backed accounts, sessions, verification tokens, and rate limits. The API route is `app/api/auth/[...all]/route.ts`.

## Database

Apply `apps/web/db/migrations/0001_better_auth.sql` to a new PostgreSQL database before starting the service. The application does not run DDL at request time. Give the runtime database role only the table permissions required by Better Auth; apply schema changes with a separate migration role.

## Required settings

Set these values through the deployment platform's secret and environment configuration:

- `BETTER_AUTH_SECRET`: at least 32 bytes of high-entropy secret material.
- `BETTER_AUTH_URL`: the canonical application origin, with no path or query.
- `DATABASE_URL`: a PostgreSQL connection URL. Keep TLS options out of its query string; Chron configures verified TLS for remote databases.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_TLS_MODE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`: verified SMTP delivery settings. Use port 465 with `implicit` TLS, or another port with required STARTTLS.
- `AUTH_TRUSTED_PROXY_CIDRS`: in production, the narrow CIDRs of the reverse proxies that overwrite forwarded-IP headers.
- `DATABASE_TLS_CA`: optional PEM CA certificate for a private database CA.

Production requires HTTPS, a remote PostgreSQL connection with certificate verification, and explicit trusted proxy ranges. Restrict direct access to the application so clients cannot bypass the trusted edge.

The endpoint returns a generic, non-cacheable `503` when required authentication configuration is unavailable. It does not expose configuration values or provider errors to clients.

## Account creation status

Email/password sign-in, email verification, and password reset use Better Auth routes. Public registration is intentionally disabled until Chron has a reviewed signup experience and records the required legal-policy consent. Do not enable registration by changing the server option alone.
