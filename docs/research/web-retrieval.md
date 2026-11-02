# Public web source reader

The current Research screen is a direct URL reader. It retrieves one user-entered
public webpage, extracts readable text, and shows the original and final HTTPS
addresses with a retrieval time. It does not search the web, assess source quality,
produce citations, or send content to an AI model.

## Retrieval boundary

- Requests require a valid Chron session, the canonical same-origin HTTPS request,
  and an owner-scoped quota of five reads per 60-second window.
- URLs must use HTTPS on the standard secure port, have a public multi-label
  hostname, and contain no credentials. IP literals and local-network suffixes
  are rejected.
- Every DNS answer must be a public unicast address. The selected vetted address
  is pinned into the HTTPS connection while TLS verification and hostname SNI
  remain enabled. The reader does not use environment proxy settings.
- Redirects are manual, limited to four, and each destination is re-parsed,
  resolved, and pinned. An HTTP downgrade, private address, invalid hostname, or
  nonstandard port is rejected before another connection.
- The reader applies a 10-second overall timeout, 16 KB response-header cap,
  1 MB response-body cap, and 40,000-character extracted-text cap. Only HTML,
  XHTML, and plain text with an accepted text encoding are read; compressed
  responses and other media types are refused.
- HTML is parsed with `parse5`; scripts, styles, templates, embedded frames,
  forms, navigation, footers, `hidden` elements, `aria-hidden` elements, and SVG
  text are omitted. This is readable text extraction, not a browser layout engine.
  Text is rendered as React text and never inserted as HTML.
- The response is private and non-cacheable. Source content is not stored in the
  database or server logs. The rate-limit row contains only the account ID, window
  start, and request count, is protected by forced row-level security, and is
  deleted through the account foreign key cascade.

Retrieved page text is untrusted input. It can be inaccurate or contain
instructions; it grants no tool permission and is not an agent prompt. The screen
labels it accordingly and links to the final HTTPS source for human review.

## Database setup

Apply every numbered SQL file in `apps/web/db/migrations` in ascending order.
The runtime database role needs `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on
`research_web_rate_limits` in addition to the application's existing table
grants. It must remain non-superuser and must not have `BYPASSRLS`.

## Current limits

The direct reader is a foundation for later source discovery and evidence
workflows. It does not claim that a source is authoritative, current, independent,
or sufficient for an answer. The runtime skill catalog contains rules for those
future workflows, but there is not yet an AI agent route that applies those skills
to retrieved pages.
