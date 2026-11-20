# Chron

Chron is an academic planning workspace for adult learners. The application brings calendar events, study tools, and source-oriented research together behind a signed-in Next.js workspace.

## What’s in the repository

- **Calendar** for event planning, recurring series, reminders, event search, conflict checks, and iCalendar export.
- **Study** workspace with flashcards and planning preferences connected to the calendar.
- **Research** workspace for organizing source-based work. See the [Meta API research notes](docs/research/meta-api.md) for the proposed integration and its open questions.
- **Reminder scheduler** in [`apps/reminder-scheduler/`](apps/reminder-scheduler), separate from the web application.

## Local development

Use Node.js 22.13 or newer in the 22.x line, or Node.js 24 or newer.

```sh
npm ci
npm run dev
```

The signed-in routes require a PostgreSQL database with the [application migrations](apps/web/db/migrations) and [authentication environment settings](apps/web/features/auth/server/environment.ts). Use the current deployment and verification notes in [HANDOFF.md](HANDOFF.md) and [PROGRESS.md](PROGRESS.md). Run `npm run lint`, `npm run typecheck`, and `npm run build` from the repository root.

## Project notes

- [Roadmap](PLAN.md) tracks planned work and open decisions.
- [Calendar recurrence](docs/architecture/calendar-recurrence.md) and [reminders](docs/architecture/calendar-reminders.md) describe the corresponding implementation.
- [SKILLS.md](SKILLS.md) records the project’s skill library.

See [LICENSE](LICENSE) for source-access terms.
