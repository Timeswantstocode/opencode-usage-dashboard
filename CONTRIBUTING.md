# Contributing

Thanks for taking the time to improve the dashboard. It is a local tool, so
the most useful contributions are correctness fixes, new metrics, and clearer
visualizations.

## Setup

1. Install Node.js 24 or newer (the app depends on `node:sqlite`).
2. Install dependencies with `pnpm install` (or `npm install`).
3. Start the dev server with `pnpm dev` and open <http://localhost:4321>.

Copy `.env.example` to `.env.local` if you need a non-default database path or
timezone. The dashboard only reads OpenCode's database; it never writes to it.

## Before opening a pull request

Run both checks:

```bash
pnpm typecheck
pnpm build
```

There is no automated test suite yet. If you change a formula or an
aggregation, describe the expected numbers in the pull request and verify them
against a small, anonymized database.

## Code style

- TypeScript strict mode. Avoid `any`; if it is unavoidable, explain why in a
  comment.
- Keep server-only code server-only. No secrets, database paths, or raw prompts
  in client bundles or logs.
- No new runtime dependencies without an issue or discussion first. The
  dashboard deliberately ships with only Next.js and React.
- Match the existing structure and naming. Small, focused diffs are easier to
  review than broad refactors.
- Keep calculations server-side and share types through `src/lib/types.ts`.

## Adding a rate override

There are two ways to change pricing:

- **Local, uncommitted:** edit `pricing.local.json` (create it from
  `pricing.local.example.json`). Use `models` for per-model rates and
  `fallback` for unmatched models. This file is git-ignored; never commit it.
- **Built-in:** add a rule in `src/lib/pricing.ts` using `exact()` for a full
  model id or a prefix rule for a family. All rates are USD per 1M tokens for
  `input`, `output`, and `cacheRead`; reasoning tokens use the output rate.

When adding a built-in rate, include the source of the price and the date you
read it in the pull request. Do not guess. If a price is account-specific, it
belongs in `pricing.local.json`, not in the source.

## Pull request expectations

- Explain what changed, why, and which tab or metric is affected.
- Include before/after values or a short description of the verification.
- Do not commit `.data/`, `.next/`, `.shots/`, `*.tsbuildinfo`, logs, or
  `pricing.local.json`.
- Do not include personal data in commits, issues, or screenshots: no names,
  machine paths, API keys, session titles, prompts, or real spend figures.
  Redact or regenerate anything captured from a real database.
- Keep pull requests focused. Open an issue first for large behavioral changes
  or new dependencies.

## License

By contributing, you agree that your contribution is licensed under the MIT
License in [LICENSE](LICENSE).
