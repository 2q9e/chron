# Chron

Chron is an education and productivity workspace for adult learners, organized
around academic calendars, study materials, and source-based research. If the
planned Meta integration is permitted, end-user inference will use only Meta's
official Model API. Chron will not route inference to another provider.

## Current status

This repository is at the foundation milestone. No application features are
currently implemented. Roadmap items are plans, not working features. Public
registration and Meta API-key handling are disabled. Meta's published terms
require integrated-product end users to be at least 18, restrict sharing API
keys, and grant no trademark license. Chron must receive clarification or
written permission for its planned user-key flow and attribution before either
is exposed. See [current Meta research](docs/research/meta-api.md).

## Project records

- [Operating rules](AGENTS.md)
- [Roadmap](PLAN.md)
- [Landing-page direction](docs/design/landing-brief.md)
- [Meta API research](docs/research/meta-api.md)
- [Foundation task graph](docs/architecture/task-graph.md)
- [Progress](PROGRESS.md)
- [Continuation handoff](HANDOFF.md)
- [Skill library](SKILLS.md)

## Development

Chron uses the Next.js App Router, React, strict TypeScript, and a modular
feature structure. The package foundation exists; the first landing route is
still being implemented, so this repository is not yet a usable application.
Do not put credentials or personal data in this repository. Review the
[project rules](AGENTS.md) before contributing.

## Source availability

The source may be inspected under the view-only terms in [LICENSE](LICENSE).
Those terms do not permit reuse, copying, or derivative products.
