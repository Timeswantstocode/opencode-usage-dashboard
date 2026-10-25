# About

## GitHub description

A read-only local dashboard for OpenCode usage: tokens, sessions, projects, and estimated cost from your own SQLite database.

## Longer description

OpenCode Usage Dashboard reads the OpenCode SQLite database on your machine and turns assistant-message token counts into live usage and cost views. It runs locally on Next.js, keeps a sidecar cache for fast queries, and never writes to the source database. Prices live in a local, editable table, so estimated cost is for comparison rather than accounting.

## Website line

A local, read-only dashboard for OpenCode usage: tokens, sessions, projects, and estimated cost from your own database.

## GitHub topics

`opencode, opencode-ai, usage, tokens, cost, dashboard, nextjs, sqlite, local-first, analytics`

## What it shows

- Lifetime and per-range totals for tokens, messages, sessions, and estimated cost, with daily trends and a 365-day activity calendar.
- Breakdowns by model, provider, and project, including token mix, message counts, and the rate used for each model.
- Session and trend views: top sessions, hour-of-week heatmap, comparisons, rollups, streaks, records, and anomaly flags.
- Tool-call counts, error rate, and the token volume of the messages that issued them.
- Two pricing views (estimated list rates and metered only) and local rate overrides.

## Privacy

Everything stays on your machine: the database is opened read-only, transcript text is not copied into the cache, and no request leaves the process.
