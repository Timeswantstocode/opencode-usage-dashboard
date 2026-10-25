Paste the prompt below into an OpenCode session opened at the root of this repository; the agent will set the dashboard up, price your models, and stop for your answers before it writes any rate.

Run this from the repository you just cloned: https://github.com/Timeswantstocode/opencode-usage-dashboard

```text
You are setting up the OpenCode Usage Dashboard in this repository. Work on
this machine only and follow the steps in order. Ask a question and wait
whenever a step says to ask. Never guess a value.

0. Get the project. If the current directory is not already the dashboard,
   clone it and enter it:
     git clone https://github.com/Timeswantstocode/opencode-usage-dashboard.git
     cd opencode-usage-dashboard
   If you are already inside a checkout, stay there. Confirm `package.json`
   has `"name": "opencode-usage-dashboard"` before continuing.

1. Check the toolchain. Confirm `node -v` is 24 or newer (`node:sqlite` is
   required), then confirm `pnpm -v`. Install dependencies with `pnpm install`;
   if pnpm is unavailable, use `npm install` and `npm run` for every script
   below. Stop and explain if either check fails.

2. Find the OpenCode SQLite database.
   - macOS/Linux: `~/.local/share/opencode/opencode.db`
   - Windows: `%USERPROFILE%\.local\share\opencode\opencode.db`, or
     `%LOCALAPPDATA%\opencode\opencode.db` when the first path does not exist.
   If neither file exists, stop and ask the user where OpenCode stores its
   database. Do not create, migrate, or repair a database.

3. Detect this machine's UTC offset in whole minutes (for example,
   `node -e "console.log(-new Date().getTimezoneOffset())"`) and a short zone
   label (for example `EST` or `CET`). Create `.env.local` with
   `TZ_OFFSET_MINUTES=<minutes>` and `TZ_LABEL=<label>`. Add
   `OPENCODE_DB=<absolute path>` only when the database is not in a location
   the app resolves by itself. If `.env.local` already exists, show the exact
   diff first and wait for approval before overwriting it.

4. Verify the app. Run `pnpm typecheck`, then `pnpm build`, then `pnpm dev`.
   Open <http://localhost:4321> and load
   <http://localhost:4321/api/stats?range=all>. Confirm `totals.tokens.total`
   and `totals.messages` are greater than zero. If either is zero, stop and ask
   before continuing. Fix nothing else.

5. List the real usage. From the same `/api/stats?range=all` response, read
   `models` (provider, model, variant, tokens, messages) and `providers`.
   Build a table of every model with its input, output, cache-read, and total
   token counts. Do not skip a model you do not recognise.

6. Research prices for exactly those models from public sources: models.dev
   first, then the provider's own pricing page. For each model record the
   input, output, and cached-read price per 1M tokens in USD, the source URL,
   and the date checked. Note the currency and unit on the page before
   converting anything. If no public price exists, mark the model unpriced.

7. Ask the user, then wait for answers:
   a. Do you pay for any of these providers, or are they free or part of a
      subscription?
   b. For each `*-free` model, which paid model should it be priced as in
      Estimated mode?
   c. Is your provider's pricing peak/off-peak or tiered by volume?

8. Write `pricing.local.json` in the repository root, using only rates the
   user confirmed. Follow the shape in `pricing.local.example.json`: a
   `fallback` object plus a `models` map keyed by provider/model, each entry
   with `input`, `output`, and `cacheRead`. Never invent a number. Leave
   unconfirmed models out and list them as unpriced, then ask.

9. Stop and restart the dev server so every request reads the current
   `.env.local` and price file. Open the Records tab, then Pricing. Report the
   Estimated total, the Metered total, and every unpriced model. Ask the user
   to compare both totals with their provider dashboard.

10. Report a short summary: the database path, the timezone, models priced,
    models still unpriced, both totals, and what the user should check next.

Hard rules:
- The OpenCode database is read-only. Never run INSERT, UPDATE, DELETE, or a
  schema change against it.
- Never upload, paste, or print transcript text, prompts, or tool output.
  Model ids, token counts, and totals are enough.
- Do not commit `.env*`, `pricing.local.json`, `.data/`, or `.shots/`. Check
  `git status` before you finish.
- Every price you record needs a URL and a date checked. No source, no rate.
- Ask before guessing. When unsure, stop and leave the value unset.
```
