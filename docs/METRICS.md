# Metric dictionary

Definitions for every number the dashboard shows. All figures are computed
from the sidecar cache (`.data/usage.db`) unless a row names a source table.
Costs are estimates computed from token counts and rate cards, not invoices.

## Conventions

| Symbol | Meaning |
| --- | --- |
| `i`, `o`, `r`, `cr`, `cw` | `msg.input`, `msg.output`, `msg.reasoning`, `msg.cache_read`, `msg.cache_write` |
| `T` | `i + o + r + cr + cw` |
| `N` | Number of `msg` rows in the selection |
| `ri`, `ro`, `rcr` | Card rates for input, output, and cache read, in USD per 1M tokens |
| `C` | Estimated cost of one message in USD |

- A **selection** is every `msg` row with `ts` in the selected range and, when
  a project or provider filter is active, a matching `msg.project` slug or
  lowercased `msg.provider`. Provider totals are the exception: they always
  cover the whole range and project, whatever the provider filter says.
- A **message** is one assistant message that carried a `tokens` object. User
  messages and assistant messages without token data are not counted.
- **Local time** is the configured fixed UTC offset (`TZ_OFFSET_MINUTES`, the
  machine offset by default) with no daylight saving.
- **Rates** are USD per 1M tokens, so every cost expression divides by
  `1e6`. Token counts are integers; costs are rounded to six decimals.
- Percentages are computed from unrounded values and displayed to one decimal.
- Rows marked **Approx.** are heuristics, not exact measurements.

## Totals

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Messages | `N` | `msg` rows in the selection | Excludes user messages and assistant messages without a `tokens` object. |
| Sessions | `count(distinct msg.session_id)` | `msg.session_id` | A session counts once even if it spans several local days. |
| Subagent sessions | Count of selected sessions where `sess.parent_id` is not null | `sess.parent_id` | Only sessions represented in the selection are counted. |
| Active days | `count(distinct localDay(msg.ts))` | `msg.ts` | A day with one message counts the same as a day with thousands. |
| Streak | See Activity | `msg.ts` | Computed outside the range filter: full history under `all`, otherwise at least the last 365 days. The project filter still applies. |
| Total tokens | `Σ T` | `msg` token fields | Includes cache read and cache write tokens, so it is larger than billable tokens. |
| Total cost | `Σ C` | `msg` token fields and the selected card | Depends entirely on the card. The estimated card prices every model; the metered card prices only billed providers. |
| Prompts | Count of user prompts, when the API exposes it | `totals.prompts` | Reserved and currently null; the Records ledger shows an em dash. |
| Cache hit rate | See Efficiency | `msg` token fields | A ratio of token volumes, not of requests. |
| Models represented | `count(distinct (provider, model, variant))` | `msg` fields | The variant is part of the key; the same model under two variants counts twice. |
| Projects represented | `count(distinct msg.project)` | `msg.project` | Includes `root` when any session is unattributed. |

## Cost

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Message cost | `C = (i × ri + (o + r) × ro + cr × rcr) / 1e6` | `msg.input`, `msg.output`, `msg.reasoning`, `msg.cache_read`; rates from `src/lib/pricing.ts` | Reasoning tokens are billed at the output rate. Cache writes have no rate and cost $0. |
| Total cost | `Σ C` over the selection | Same as above | Rounded to six decimals at the response boundary. |
| Cost by card | `Σ C` computed separately for the `estimated` and `metered` cards | `msg` token fields; rates from `src/lib/pricing.ts` | `totals.costByCard`; independent of the selected card. |
| Unpriced tokens | `Σ T` for models with no built-in rule and no local override | `msg.model` | The estimated card prices them at the configured fallback rate, so they are not free. `GET /api/pricing` lists them under `unknown`. |
| Input cost | `Σ (i × ri) / 1e6` | `msg.input` | Uses the rate resolved for each message's model. |
| Output cost | `Σ ((o + r) × ro) / 1e6` | `msg.output`, `msg.reasoning` | Includes reasoning. |
| Cache read cost | `Σ (cr × rcr) / 1e6` | `msg.cache_read` | Cache reads are usually the smallest line. |
| Billable output | `o + r` | `msg.output`, `msg.reasoning` | Reasoning is billed as output but is not shown to the user as text. |
| Cache savings | `Σ (cr × (ri − rcr)) / 1e6` | `msg.cache_read`; rates from the card | Assumes cached tokens would otherwise have been charged at the full input rate. Ignores cache write cost because cards define no write rate. |
| Cost per 1M tokens | `Σ C / Σ T × 1e6` | Selection totals | A blended effective rate, not a list price. Cache writes dilute it. |
| Projected month | `(C_today / h) × 24 × 30`, where `h = max(1, (now − localMidnight) / 3,600,000)` | Today's `msg` rows | Approx. A run-rate extrapolation from elapsed local hours. The common shorthand `today's cost × 30` is exact only once the day is complete. |

## Tokens

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Input tokens | `Σ i` | `msg.input` | Prompt tokens sent fresh, excluding cached reads and writes. |
| Output tokens | `Σ o` | `msg.output` | Visible generated tokens, excluding reasoning. |
| Reasoning tokens | `Σ r` | `msg.reasoning` | Billed at the output rate. Not comparable across providers that report it differently. |
| Cache read tokens | `Σ cr` | `msg.cache_read` | Tokens served from the provider's prompt cache. |
| Cache write tokens | `Σ cw` | `msg.cache_write` | Tokens written to the cache. Counted in totals but not priced by any current card. |
| Total tokens | `Σ T` | All five token fields | Includes cache tokens, so it is not "tokens billed". |
| Prompt-side tokens | `Σ (i + cr + cw)` | `msg` fields | Everything sent to the model, however it was served. |
| Billable output | `Σ (o + r)` | `msg.output`, `msg.reasoning` | The output side that providers charge for. |
| Token mix | Each of the five fields divided by `Σ T` | `msg` fields | Shares sum to 1. Cache-heavy usage is not cheap usage if cache rates are high. |
| Composition slices | Input, output, reasoning, and cache-read tokens divided by their four-field sum | Records distribution | The chart omits cache-write tokens, so these shares sum to 1 without `cw`. |
| Tokens per message | `Σ T / N` | `msg` fields | One very large message can dominate the mean; use the median for a typical case. |

## Efficiency

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Cache hit rate | `Σ cr / Σ (i + cr + cw)` | `msg` token fields | 0 to 1. The denominator excludes output and reasoning because they are not prompt tokens. Cache writes lower the rate. |
| Cache savings | `Σ (cr × (ri − rcr)) / 1e6` | `msg.cache_read`; card rates | Approx. by nature of a counterfactual: assumes the cached tokens would otherwise have been input tokens at `ri`. |
| Effective rate | `Σ C / Σ T × 1e6` | Selection totals | Blended across models, cache reads, and reasoning. Not a price list. |
| Tokens per message | `Σ T / N` | `msg` fields | Mean, not median. |
| Tokens per session | `Σ T / count(distinct session_id)` | `msg` fields | Includes subagent sessions as separate sessions. |
| Cost per message | `Σ C / N` | Selection totals | Card-dependent. |
| Cost per active day | `Σ C / activeDays` | Selection totals | Calendar days with no messages are excluded from the divisor. |
| Sessions per active day | `sessions / activeDays` | Selection totals | Uses distinct sessions, not daily session counts. |
| Subagent ratio | `subagents / sessions` | `sess.parent_id` | A session with a parent counts as a subagent even if its parent is outside the selection. |
| Output ratio | `Σ (o + r) / Σ T` | `msg` fields | Low values mean most tokens are prompt or cache traffic. |
| Reasoning share | `Σ r / Σ (o + r)` | `msg.output`, `msg.reasoning` | Undefined when both are zero. Providers report reasoning inconsistently. |
| Cache read share | `Σ cr / Σ T` | `msg.cache_read` | Different from cache hit rate, which excludes output. |
| Cache write share | `Σ cw / Σ (i + cr + cw)` | `msg.cache_write` | Not priced by the current cards. |
| Unpriced token share | `Σ T_m` for models with no built-in rule and no override, divided by `Σ T` | `msg.model` | Not free under the estimated card: those tokens use the fallback rate. |

## Activity

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Active days | `count(distinct localDay(ts))` in the selection | `msg.ts` | Any message makes the day active. |
| Streak | Start at today's local day; if it has no messages, start at yesterday. Count consecutive active local days walking backwards. | `msg.ts` | A day with one message keeps the streak alive. Computed outside the range filter, but the project filter applies. |
| Calendar level | `0` for zero tokens; otherwise quartile of non-zero days in the 365-day window | `msg.ts` | Relative, not absolute: the same day can change level as history grows. Always the last 365 days, unaffected by the range; the project filter applies. Quartile cut points are `values[floor(q × (n − 1))]` for `q = 0.25, 0.5, 0.75`. |
| Hour-of-week bucket | `localDow(ts) × 24 + localHour(ts)` | `msg.ts` | 168 buckets, Sunday = 0, local time. Aggregated across the selected range. |
| Peak bucket | Bucket with the largest `Σ T` in the 168-bucket heatmap | `msg.ts` | A range-wide average pattern, not a single clock hour. |
| Peak hour | Local hour (0-23) with the largest `Σ T` after summing across days | `msg.ts` | Aggregates every selected day into one clock hour. Not the same as the 168-bucket peak when weekdays differ. |
| Busiest weekday | Local weekday (0-6) with the largest `Σ T` after summing across dates | `msg.ts` | Sunday = 0. Aggregated across the selected range. |
| Burn per hour | `Σ T` over the last 24 hours / 24 | `msg.ts` | Trailing 24 hours from the server clock, independent of the selected range. Includes cache tokens. |
| Today's tokens | `Σ T` for today's local day | `msg.ts` | Partial until local midnight. Independent of the selected range. |
| Today's cost | `Σ C` for today's local day | `msg` fields and card | Partial and card-dependent. Independent of the selected range. |
| Data lag | `max(0, (now − max(msg.ts)) / 1000)` seconds | `msg.ts` | Null when the fetched window has no messages for the selected project. Measures message arrival, not API latency. |
| Last message | `max(msg.ts)` | `msg.ts` | Formatted as local time. |
| Concurrency | Maximum number of session intervals that overlap, where a session interval is `[min(ts), max(ts)]` for that session | `msg.ts` | **Approx.** A session idle for hours still looks active across its span. No per-request overlap data exists. |
| Five-hour blocks | `Σ T` and `Σ C` for sessions whose first message falls in each five-hour bucket, with starts at 00, 05, 10, 15, and 20 local; the 20:00 window wraps to 01:00 | Session start from `msg.ts` | **Approx. display grouping only.** A session is assigned whole to its start block; tokens are not split at a boundary. Not a provider billing window, quota, rate-limit window, or reset boundary. |
| Range days | `daily.length`, one entry per local day | `msg.ts` | `today` = 1, `7d` = 7, `30d` = 30, `90d` = 90. `all` starts at the local day of the oldest message. |
| Days spanned | `range.days` | Selected range | With a project filter this is still the range length, not the project's first-to-last span. |
| First / last activity | First and last `daily` day with tokens > 0 | `msg.ts` | Selection-limited. A project filter, or a range that starts after the first message, moves the first value forward. |
| Tokens per active day | `Σ T / activeDays` | `msg` fields | Active days, not calendar days. |
| Night share | Tokens in local hours 22, 23, and 00-05 / `Σ T` | `msg.ts` | Night is an arbitrary eight-hour band, not a billing period. |
| Weekend share | Tokens on Sunday and Saturday / `Σ T` | `msg.ts` | Local weekday. |

## Sessions

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Session count | `count(distinct session_id)` | `msg.session_id` | Matches the Totals figure. |
| Session span | `max(ts) − min(ts)` for that session | `msg.ts` | **Approx.** Wall-clock span between the first and last message, including idle gaps. |
| Messages per session | `count(*)` for that session | `msg.session_id` | Assistant messages with token data only. |
| Session tokens | `Σ T` for that session | `msg` fields | Includes subagent traffic in the subagent's own session. |
| Session cost | `Σ C` for that session | `msg` fields and card | Card-dependent. |
| Top sessions | The 300 sessions with the largest `Σ T` | `msg.session_id` | Everything below the top 300 is omitted from the session list and from percentile calculations. |
| Median session tokens | Middle of the ascending top-300 token list: `x[n/2]` for odd `n`, the mean of `x[n/2 − 1]` and `x[n/2]` for even `n` | `msg` fields | **Approx.** Censored: the 300-session cap drops the long tail, so the median is really the median of the largest sessions. |
| p95 session tokens | Nearest rank: `x[ceil(0.95 × n) − 1]` on the ascending top-300 token list | `msg` fields | **Approx.** Same censoring. A true p95 needs every session. |
| Median / p95 session cost | Same median and nearest-rank definitions on session cost | `msg` fields and card | **Approx.** Card-dependent and censored at 300 sessions. |
| Average session duration | Mean of the top-300 session spans | `msg.ts` | **Approx.** A session idle for hours counts its whole span. |
| Median session duration | Middle of the ascending top-300 span list, averaging the two middle values for even `n` | `msg.ts` | **Approx.** Censored at 300 sessions. |
| p95 session duration | `x[ceil(0.95 × n) − 1]` on the ascending top-300 span list | `msg.ts` | **Approx.** Censored and span-based, so idle gaps count. |
| Longest session | `max(durationMs)` in the top 300 | `msg.ts` | **Approx.** One long pause can make a short working session look long. |
| Session-duration buckets | Counts in `<5m`, `5–15m`, `15–30m`, `30–60m`, `1–2h`, `2–4h`, and `4h+` | `msg.ts` | **Approx.** Fixed buckets; spans include idle time. |
| Subagent marker | `sess.parent_id` is not null | `sess.parent_id` | A parent may itself be a subagent. |

The session table's durations are message spans capped at the 300 largest
sessions. The wall-clock figures below use the `sess` table instead and cover
every session.

## Time

Wall-clock time from the cache `sess` table (copied from the source
`session_v2` rows), not from `msg.ts`. Durations are milliseconds unless the
row says hours. The same `sess` scan produces two scopes:

- **Range-scoped** — `totals.activeHours`, `totals.activeHoursCapped`, and
  `totals.sessionMs`. Each `[created, updated]` interval is clipped to the
  selected `range` before anything is counted, so a Today view covers at most
  today.
- **Lifetime** — `lifetime.activeHours` and `lifetime.sessionMs`. No clip:
  `range` never filters them, so a Today view and an All view report the same
  values. `range=all` clips nothing, so both scopes report identical figures.

The `project` filter matches `sess.project`. The `provider` filter keeps the
sessions with at least one `msg` row from that provider, over their whole life.
Parent and subagent sessions both count — they are separate `sess` rows — and
the merge removes their overlap. The `sess` set can be larger than
`totals.sessions`, which only counts sessions with a token-bearing message in
the selected range; a session with no messages still contributes its interval
here.

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Session interval | `[sess.created, sess.updated]` | `sess.created`, `sess.updated` | Rows with `updated <= created` are ignored. The interval includes idle time because it is stamped by the agent loop, not by messages. |
| Range clip | `[max(created, range.from), min(updated, range.to)]` | Same, plus the selected range | Range-scoped figures only. The interval is dropped when `end <= start`, so nothing outside the range is counted. `range.to` is the server clock, so an open session stops at `now`. |
| Idle cap | `min(clipped duration, 8h)` | Same | A session left open for days is not days of work. 8 hours is the same cap the extras view uses. |
| Merged duration | Union of the capped intervals: sort by start, then extend the current block while the next start is `<=` its end. Touching intervals merge too. | Same | Sessions running side by side (a parent and its subagents) count once. |
| Active hours | `mergedDurationMs / 3,600,000`, one decimal | Same | `totals.activeHours`, range-scoped. Hours at the desk, not billable hours. `lifetime.activeHours` is the same formula without the range clip. |
| Active hours capped | Union of the 8-hour-capped clipped intervals, then every merged block clamped to 8 hours, one decimal | Same | `totals.activeHoursCapped`, range-scoped; present only when it differs from `activeHours`. A floor for a chain of sessions that never pauses. |
| Average session duration | `Σ d / n` over the raw durations of every clipped interval in scope | Same | `totals.sessionMs.avg` (range-scoped) and `lifetime.sessionMs.avg` (unclipped). Skewed by long-open sessions; prefer the median. Not the top-300 mean of the Sessions table. |
| Median session duration | Middle of the ascending raw durations: `x[n/2]` for odd `n`, the mean of `x[n/2 − 1]` and `x[n/2]` for even `n` | Same | `totals.sessionMs.median` (range-scoped) and `lifetime.sessionMs.median`. |
| p95 session duration | Nearest rank `x[ceil(0.95 × n) − 1]` | Same | `totals.sessionMs.p95` (range-scoped) and `lifetime.sessionMs.p95`. Raw, so days-long sessions set the tail. |
| Longest session | `max(d)` over the raw durations | Same | `totals.sessionMs.longest` is clipped, so it cannot exceed the range's elapsed time; `lifetime.sessionMs.longest` can be days. |
| Longest capped session | `max(min(d, 8h))` | Same | `totals.sessionMs.longestCapped` (range-scoped) and `lifetime.sessionMs.longestCapped`. Never above 8 hours. |

## Models

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Model row | Group by `(provider, model, variant)` | `msg` fields | The same model under two variants is two rows. Unknown values are labelled `unknown`. |
| Model tokens | `Σ T` per row | `msg` fields | Includes cache tokens. |
| Model cost | `Σ C` per row | `msg` fields and card | Depends on the selected card. |
| Model messages | `count(*)` per row | `msg` | Assistant messages only. |
| Model share | `T_model / Σ T` | `msg` fields | Token-weighted, not request-weighted. |
| Models used | `count(distinct (provider, model, variant))` | `msg` fields | Variants inflate the count. |
| Model diversity | `1 − Σ s_m²`, where `s_m` is each model's token share | `msg` fields | 0 when one model has all tokens; approaches 1 as usage spreads out. Token-weighted, so one huge context can dominate. |
| Top model share | `max(s_m)` | `msg` fields | A single number for concentration. |
| Top-3 model share | Sum of the three largest model shares | `msg` fields | Requires at least three models; otherwise it is the total of those present. |
| Rate resolution | Per-model override, then first exact or prefix built-in rule, then the card fallback (`$0` for metered, the configured fallback for estimated) | `src/lib/pricing.ts`, `pricing.local.json` | Overrides match case-insensitively. Rule order matters. |
| Effective model rate | `cost / T_model × 1e6` | `msg` fields | Blended across cache and output tokens for that model. |

## Providers

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Provider row | Group by `lower(msg.provider)` for the range and project | `msg.provider` | Ignores the provider filter, so the selector always lists every provider. Missing values become `unknown`. |
| Provider tokens | `Σ T` per provider | `msg` fields | Includes cache tokens. |
| Provider messages | `count(*)` per provider | `msg` | Assistant messages only. |
| Provider models | `count(distinct msg.model)` per provider | `msg.model` | Variants are not counted separately. |
| Provider share | `T_provider / Σ T` across all providers in the range and project | `msg` fields | Shares sum to 1 and do not change with the provider filter. |
| Provider cost | `Σ C` per provider under the active card | `msg` fields and card | Card-dependent. Per-provider costs add up to `totals.cost` for the unfiltered selection. |
| Provider estimated / metered | `Σ C` per provider computed with each card | `msg` fields; `src/lib/pricing.ts` | Always both are present, whatever the active card is. |
| Provider filter | `provider` query parameter: `all` or a lowercased provider id | `msg.provider` | Filters totals, daily, hourly, calendar, models, projects, sessions, and costs; never `providers[]`. |

## Projects

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Project slug | Most frequent `Documents/GitHub/<folder>` path in a session's tool-call payloads, lowercased; `root` if none | `part.data` first, then `session_message.data` | **Approx.** A heuristic. A session that touches two projects is assigned to the more frequent one. |
| Project name | Most frequent original casing for that slug | Same payloads, accumulated in `meta.project_names` | Display only; the slug is the key. |
| Project tokens | `Σ T` per `msg.project` | `msg.project` | Depends on attribution. |
| Project cost | `Σ C` per project | `msg` fields and card | Card-dependent. |
| Project share | `T_project / Σ T` | `msg` fields | Shares sum to 1 when rounded. |
| Project sessions | `count(distinct session_id)` per project | `msg.session_id` | A session belongs to exactly one project. |
| Project messages | `count(*)` per project | `msg` | Assistant messages only. |
| Last used | `max(msg.ts)` per project | `msg.ts` | Latest token-bearing message, not the latest file edit. |
| GitHub root share | `T_root / Σ T` | `msg.project` | **Approx.** High values mean paths were relative, outside `Documents/GitHub`, or in a session with no parseable path. |
| Top-3 project share | Sum of the three largest project shares | `msg.project` | Requires at least three projects. |
| Path filter | Folder names starting with `.` or matching `/\.[a-z0-9]{1,5}$/` are ignored | `src/lib/projects.ts` | Prevents file names and dot-folders becoming projects. |

## Code output

These figures are **Approx.** They are derived from tool-call payloads, not
from a git diff. Message content is not copied into the sidecar cache.

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Output tokens | `Σ o` | `msg.output` | An exact token count, but not a count of code. |
| Billable output | `Σ (o + r)` | `msg.output`, `msg.reasoning` | Includes reasoning, which is not visible code. |
| Code-writing messages | Count of assistant messages containing an `edit`, `write`, or `patch` tool call | `part.data`, `session_message.data` | Tool names vary by agent and plugin. A message may contain several calls. |
| Lines added | `+` lines in `edit`/`patch` diffs, plus every line of a `write` payload | Tool-call payloads | Whole-file writes count all lines as added, even unchanged ones. |
| Lines removed | `−` lines in `edit`/`patch` diffs | Tool-call payloads | A `write` that replaces a file may not expose the old content, so removals can be undercounted. |
| Files touched | `count(distinct path)` across code-writing calls | Tool-call `path`/`filePath` arguments | Renames and generated files count as touched. |
| Churn per session | `(lines added + lines removed) / count(distinct session_id)` | Tool-call payloads | **Approx.** Sensitive to whole-file writes. |
| Lines per 1k output tokens | `(lines added + lines removed) / (Σ o / 1000)` | Tool calls and `msg.output` | **Approx.** A productivity ratio, not a quality measure. |

## Tools

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Tool calls | Count of tool parts in the selection | `part.data`, `session_message.data` | Tool payloads live in the source database; only counts and metadata reach the cache. |
| Calls by tool | Group by tool name | Same payloads | Names are whatever the agent recorded (`bash`, `read`, `edit`, `write`, `glob`, `grep`, `task`, and so on). |
| Tool share | `calls_for_tool / total_calls` | Same payloads | Counts calls, not tokens. |
| Tool error rate | `error calls / total calls` | Tool part state (`error` versus completed) | **Approx.** Older `part` rows and newer embedded payloads may shape the state differently. |
| Messages with tools | Count of assistant messages containing at least one tool part | Same payloads | One message can contain many calls. |
| Calls per session | `total_calls / count(distinct session_id)` | Same payloads and `msg` | Depends on how often the agent batches calls. |
| Tokens per tool call | `Σ T / total_calls` | `msg` and tool payloads | **Approx.** Token counts attach to messages, not individual calls, so this is an average attribution, not per-call accounting. |
| Top tools | Tools sorted by call count | Same payloads | A large `read`/`grep` count usually reflects exploration, not output. |

## Records

Most records use the current selection; streaks use the 365-day calendar.
Ties are broken arbitrarily; do not read meaning into which of two equal values
wins.

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Longest streak | Longest run of consecutive active local days in the 365-day calendar | `msg.ts` via the calendar | Not the selected range. Capped at 365 days; the project filter applies. |
| Current streak | Trailing active run in the calendar, allowing it to end yesterday | `msg.ts` via the calendar | Same cap and filter as the longest streak. |
| Busiest day | `argmax Σ T` per local day | `msg.ts` | Token-based. Selection-limited. |
| Most expensive day | `argmax Σ C` per local day | `msg.ts` and card | Card-dependent. Selection-limited. |
| Biggest session | `argmax Σ T` per session | Top 300 sessions | A session below the token cap cannot be the biggest one anyway. |
| Longest session | `argmax durationMs` | Top 300 sessions | **Approx.** Includes idle gaps between messages. |
| Peak hour | Local hour with the largest `Σ T` after summing across dates | `hourly` (from `msg.ts`) | Aggregates every selected day into one clock hour. |
| Busiest weekday | Local weekday with the largest `Σ T` after summing across dates | `hourly` (from `msg.ts`) | Sunday = 0. Selection-limited. |
| Top model | Model with the largest token share | `models` | Token-weighted; variants count separately. |
| Top project | Project with the largest token share | `projects` | **Approx.** Depends on path attribution. |

## Series

Charts read `series.daily`, `series.hourly`, and `series.calendar`, which
**ignore `range`**: charts use the unfiltered series; range applies to KPIs and
tables only (`totals`, `projects`, `models`, `sessions`, and the range-scoped
`daily`, `hourly`, and `calendar`). A chart therefore keeps its shape on the
Today and 7d ranges instead of collapsing to one bar or a handful of buckets.
The `project` and `provider` filters still apply, so a filtered dashboard shows
that project's or provider's pattern, and costs use the active card.
`series.daily` runs from the first message day to today, zero-filled;
`series.hourly` is always the 168 ascending `(dow, hour)` buckets over all
history; `series.calendar` is the 365-day heatmap.

## Lifetime

`lifetime` is the exact all-history summary meant for artifacts that must not
move with the range selector: the share card, its copy summary, and its PNG.
It ignores `range` completely — `range=today` and `range=all` return the same
`lifetime` object — so an artifact built from it cannot pair a range-scoped
figure (today's tokens) with a lifetime one (active days across all history). The
`project` and `provider` filters still apply, and `cost` uses the active card.
Every token, cost, and day figure is read from the same all-history day
buckets that `series.daily` is built from; sessions and messages are counted
in that same pass, so no extra query runs. `activeHours` and `sessionMs` read
the same lifetime `sess` intervals as `totals`, with no range clip.

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| `tokens` | `Σ T` over all history | `msg` token fields | Same shape as `totals.tokens`, including cache read and write. Never range-scoped: only `project` and `provider` move it. |
| `cost` | `Σ C` over all history | `msg` fields and the active card | Card-dependent, not range-dependent. Rounded to six decimals. |
| `sessions` | `count(distinct msg.session_id)` over all history | `msg.session_id` | A session counts once even if it spans several local days. |
| `messages` | `N` over all history | `msg` rows | Assistant messages with token data only. |
| `activeDays` | `count(distinct localDay(msg.ts))` over all history | `msg.ts` | A day needs at least one token-bearing message; a day with only zero-token messages does not count, matching the heatmap and `totals.streak`. |
| `longestStreak` | Longest run of consecutive active local days | `msg.ts` | Not the 365-day calendar behind `records.longest-streak`: this one covers the full history, so it can be longer. |
| `longestStreakEnd` | `YYYY-MM-DD` of the last day of that run | `msg.ts` | `null` when there is no active day. Ties go to the earliest run. |
| `cacheHitRate` | `Σ cr / Σ (i + cr + cw)` over all history | `msg` token fields | 0-1, 0 when the denominator is 0. The denominator excludes output and reasoning. |
| `firstDay` / `lastDay` | First and last active local day, `YYYY-MM-DD` | `msg.ts` | The history's activity span, not the selected range's bounds. Both fall back to today when the filters leave nothing active. |
| `activeHours` | `mergedDurationMs / 3,600,000` over every raw session interval, one decimal | `sess.created`, `sess.updated` | Lifetime, never clipped by `range`; same formula as `totals.activeHours`. |
| `sessionMs` | `{ avg, median, p95, longest, longestCapped }` over the raw session durations | Same | Lifetime, never clipped. `totals.sessionMs` uses the same fields after clipping each interval to the range. |

## Trends

| Metric | Formula | Source | Caveat |
| --- | --- | --- | --- |
| Daily series | One point per local day from range start to today, zero-filled | `msg.ts` | Days with no messages are present with zero tokens. The Trends view replaces today's point with the live today counters. |
| Period comparison | Today vs yesterday, last 7 days vs prior 7, last 30 days vs prior 30; ratio `(current − previous) / previous` | Daily series | Undefined when the previous window is zero. Today and the current windows are incomplete. Sessions are sums of daily session counts, so a session spanning days is counted more than once. |
| Weekly rollup | Daily points grouped by ISO week, Monday start; sums tokens, cost, sessions, active days, and average tokens per day | Daily series | The partial current week is shown as-is. Change compares tokens with the previous week. |
| Monthly rollup | Daily points grouped by calendar month; same sums | Daily series | The partial current month is shown as-is. Change compares tokens with the previous month. |
| Cumulative tokens | Running `Σ T` over the daily series | Daily series | Resets with the selected range. |
| Cumulative cost | Running `Σ C` over the daily series | Daily series and card | Resets with the selected range and card. |
| Anomaly | `z = (dayCost − μ) / σ` over days with cost > 0; `μ` is the mean and `σ` the population standard deviation; flag `abs(z) > 2` | Daily series | **Approx.** Needs at least 8 days before it is shown. Only the five largest absolute z-scores are listed. A zero σ disables the report. |
| Session-duration distribution | Counts in `<5m`, `5–15m`, `15–30m`, `30–60m`, `1–2h`, `2–4h`, and `4h+` over the top 300 sessions | `msg.ts` | **Approx.** Fixed buckets; spans include idle time and the 300-session cap applies. |
| Five-hour blocks | `Σ T` and `Σ C` for sessions whose first message falls in each five-hour bucket, with starts at 00, 05, 10, 15, and 20 local; the 20:00 window wraps to 01:00 | Session start from `msg.ts` | **Approx. display grouping.** A session is assigned whole to its start block; tokens are not split at a boundary. Not a billing window, quota, rate-limit window, or reset boundary. |
| Concurrency | Maximum number of session intervals that overlap, where an interval is `[min(ts), max(ts)]` | `msg.ts` | **Approx.** Derived from session spans, so idle sessions inflate it. |
| Burn per hour | Tokens in the last 24 hours / 24 | `msg.ts` | Trailing 24 hours. Includes cache tokens. See Activity. |
| Projected month | `(C_today / hoursElapsed) × 24 × 30` | Today's `msg` rows | **Approx.** Run-rate, not a forecast. See Cost. |
| Median / p95 session tokens | Median and nearest rank on the top 300 sessions by tokens | `msg` fields | **Approx.** Censored at 300 sessions; the long tail is excluded. |
| Partial-period warning | Today, the current week, and the current month are incomplete | — | Never compare a partial period with a complete one without normalising by elapsed time. |

## Rate-card semantics

| Card | Pricing rule | Scope |
| --- | --- | --- |
| `estimated` | Exact rules for the known models; an unmatched model uses the configured fallback rate | Every model; the default card |
| `metered` | Only the model ids the metered card knows are priced (see `src/lib/pricing.ts`); all other models are $0 | What providers actually bill |

`pricing.local.json` may override any of this: `fallback` replaces the
estimated card's fallback rate and label (metered keeps its $0 fallback), and
`models` maps a model id (case-insensitive) to `{ input, output, cacheRead }`
that wins over the built-in rules. The file is re-read whenever its `mtimeMs`
changes, so edits apply on the next request without a restart. Invalid entries
are ignored and listed in `warnings`. `GET` and `POST /api/pricing` read and
update it; a POST merges `fallback` and `models` into the file and writes it
atomically.

## Known approximations

1. **Median and p95** in the Sessions table use only the top 300 sessions by
   tokens or duration; the `lifetime.sessionMs` figures cover every session.
2. **Concurrency** is inferred from session spans, not request timestamps.
3. **Five-hour blocks** are a display grouping; each session is assigned whole
   to the block where it started, not split at the boundary.
4. **Code lines and files** come from tool-call payloads, not a diff.
5. **Project attribution** is a vote over path strings in tool calls.
6. **Tokens per tool call** is an average, not per-call accounting.
7. **Projected month** is a run-rate extrapolation.
8. **Unpriced models** use the fallback rate on the estimated card, not zero,
   so the total is an estimate rather than an invoice.
9. **Anomaly flags** use a population standard deviation over active days and
   need at least eight days; they describe the selected range, not a forecast.
10. **Session durations** in the Sessions table are first-to-last message spans
    and include idle gaps.
11. **Active hours** cap every `sess` interval at 8 hours and merge touching
    intervals, so they measure time at the desk, not wall-clock time since a
    session was opened. A session whose agent loop keeps updating for days
    still counts at most 8 hours. Range-scoped hours clip the interval to the
    range first (see Time), so a Today view cannot inherit lifetime hours.
