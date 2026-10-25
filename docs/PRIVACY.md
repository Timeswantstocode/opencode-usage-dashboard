# Privacy

The dashboard reads the local OpenCode data on the machine it runs on. It is
a single-user tool: no account, no upload, no telemetry.

## What the app reads

- The user's own OpenCode SQLite database, read-only. Nothing is ever written
  back to it.

## What is cached

- `.data/usage.db`, a sidecar SQLite cache derived from that database. It
  holds token counts and session metadata (project, model, timestamps, cost)
  so pages load without touching the source database on every request.

## What stays local and is ignored by git

- `.env*` (except `.env.example`)
- `pricing.local.json` — local price overrides for the user's own models
- `.data/` — the usage cache
- `.shots/` — local screenshots
- `*.log`, `dev.log`, `logs/`
- `*.tsbuildinfo` — build information

## What is never collected

- Prompts, code, or message bodies
- Provider API keys or any other credential
- Invoices or billing documents

The cache stores counts and identifiers, never conversation text.

## What is safe to commit

- Source code and `docs/`
- `.env.example`
- `pricing.local.example.json`

## Running the guard

```
pnpm check:privacy
node scripts/check-personal.mjs --staged
```

The first command checks every tracked file. The second checks only what is
staged, for a pre-commit hook. On failure both exit non-zero and print every
offending path, with the line number when the finding is inside a file.
