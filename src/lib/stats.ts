import { aggregate } from './aggregate';
import type { RawRow, SessionInterval, SessionMeta } from './aggregate';
import { ensureCache, getCache } from './db';
import { applyPricing, getRateCard, isCardId, rateCardMeta } from './pricing';
import { loadPricing } from './pricingFile';
import { readProjectNames } from './projects';
import { DAY_MS, localDayKey, localDayStartUtcMs } from './time';
import type { RangeKey, StatsRangeKey, StatsResponse } from './types';

const RANGE_DAYS: Record<Exclude<RangeKey, 'all'>, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Thrown when a `from`/`to` pair is incomplete, malformed, or reversed. */
export class InvalidRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRangeError';
  }
}

/** Local midnight of a `YYYY-MM-DD` key, or null when it is not a real day. */
function parseLocalDay(value: string): number | null {
  if (!DAY_KEY.test(value)) return null;
  const start = localDayStartUtcMs(value);
  // `Date.parse` normalises impossible dates (`2026-02-30`), so round-trip.
  return Number.isFinite(start) && localDayKey(start) === value ? start : null;
}

export type StatsOptions = {
  range: RangeKey;
  /** Custom range start, local `YYYY-MM-DD`; requires `to`. */
  from?: string | null;
  /** Custom range end, local `YYYY-MM-DD`, inclusive; requires `from`. */
  to?: string | null;
  card: string;
  /** Project slug, or `all`. */
  project: string;
  /** Lowercase provider id, or `all`. */
  provider: string;
};

export async function buildStats(options: StatsOptions): Promise<StatsResponse> {
  // Runs on every request (the shared promise only coalesces concurrent
  // requests while one sync is in flight). Warm cost is a couple of indexed
  // queries, so live polling stays current to the second.
  await ensureCache();
  const db = getCache();

  const now = Date.now();
  const todayStart = localDayStartUtcMs(localDayKey(now));
  const calendarStart = todayStart - 364 * DAY_MS;
  const project = options.project && options.project !== 'all' ? options.project.toLowerCase() : null;
  const provider = options.provider && options.provider !== 'all' ? options.provider.toLowerCase() : null;
  const pricing = loadPricing();
  const cardId = isCardId(options.card) ? options.card : 'estimated';
  const card = applyPricing(getRateCard(cardId), pricing);
  const estimatedCard = applyPricing(getRateCard('estimated'), pricing);
  const meteredCard = applyPricing(getRateCard('metered'), pricing);

  const first = db.prepare('select min(ts) as ts from msg').get() as { ts: number | null };
  const firstTs = Math.min(first.ts ?? todayStart, todayStart);
  const historyStart = localDayStartUtcMs(localDayKey(firstTs));

  // A `from`/`to` pair is a custom local-day window and replaces the preset;
  // the pair is validated before any range maths. `rangeEnd` is the last ms of
  // the window (clamped to now), so a past `to` never picks up newer messages.
  const from = options.from ?? null;
  const to = options.to ?? null;
  let rangeKey: StatsRangeKey = options.range;
  let rangeStart: number;
  let rangeEnd = now;
  let days: number;
  let rangeAll = options.range === 'all';

  if (from !== null || to !== null) {
    if (from === null || to === null) throw new InvalidRangeError('from and to must be YYYY-MM-DD');
    const fromStart = parseLocalDay(from);
    const toStart = parseLocalDay(to);
    if (fromStart === null || toStart === null) throw new InvalidRangeError('from and to must be YYYY-MM-DD');
    if (fromStart > toStart) throw new InvalidRangeError('from must be on or before to');

    rangeEnd = Math.min(now, toStart + DAY_MS - 1);
    const lastEndDayStart = localDayStartUtcMs(localDayKey(rangeEnd));
    // A window starting before the first message begins at that first day; a
    // window wholly before history (or in the future) collapses to its edge.
    rangeStart = Math.min(Math.max(fromStart, historyStart), lastEndDayStart);
    days = Math.max(1, Math.round((lastEndDayStart - rangeStart) / DAY_MS) + 1);
    rangeKey = 'custom';
    rangeAll = false;
  } else if (options.range === 'all') {
    rangeStart = historyStart;
    days = Math.max(1, Math.round((todayStart - rangeStart) / DAY_MS) + 1);
  } else {
    days = RANGE_DAYS[options.range];
    rangeStart = todayStart - (days - 1) * DAY_MS;
  }

  // One scan feeds every panel. Fetching from the oldest of the range start,
  // the calendar start, and the first message day keeps the 365-day heatmap
  // and the range-independent `series` correct on a short range. The provider
  // filter is applied in memory so `providers[]` can cover them all.
  const fetchFrom = Math.min(rangeStart, calendarStart, historyStart);
  const sql = `select ts, session_id, project, provider, model, variant, input, output, reasoning, cache_read, cache_write
    from msg where ts >= ? and ts <= ?${project ? ' and project = ?' : ''}`;
  const rows = (project ? db.prepare(sql).all(fetchFrom, now, project) : db.prepare(sql).all(fetchFrom, now)) as RawRow[];

  // `projects[].share` is a share of every project in scope, so a project
  // filter needs a denominator of its own: one aggregate over the same range
  // with the provider filter, but never the project filter.
  let projectShareBase: number | undefined;
  if (project) {
    const shareSql = `select coalesce(sum(input + output + reasoning + cache_read + cache_write), 0) as tokens
      from msg where ts >= ? and ts <= ?${provider ? ' and lower(provider) = ?' : ''}`;
    const shareRow = (
      provider ? db.prepare(shareSql).get(rangeStart, rangeEnd, provider) : db.prepare(shareSql).get(rangeStart, rangeEnd)
    ) as { tokens: number };
    projectShareBase = shareRow.tokens;
  }

  const sessionMeta = new Map<string, SessionMeta>();
  const metaRows = db
    .prepare('select id, title, project, agent, model, parent_id, created, updated from sess')
    .all() as {
    id: string;
    title: string | null;
    project: string | null;
    agent: string | null;
    model: string | null;
    parent_id: string | null;
    created: number | null;
    updated: number | null;
  }[];

  // The provider filter keeps every session that used that provider at least
  // once, over its whole life — not only the sessions with a message inside the
  // selected range. One distinct query, only when the filter is set.
  const providerSessions = provider
    ? new Set(
        (
          db.prepare('select distinct session_id from msg where lower(provider) = ?').all(provider) as {
            session_id: string;
          }[]
        ).map((row) => row.session_id),
      )
    : null;

  // Time stats share this one `sess` scan. The intervals stay unfiltered by
  // range: `aggregate` clips them to `[rangeStart, rangeEnd]` for `totals` and
  // keeps the raw ones for `lifetime`. The project and provider filters apply.
  const sessionIntervals: SessionInterval[] = [];
  for (const row of metaRows) {
    sessionMeta.set(row.id, {
      title: row.title,
      project: row.project,
      agent: row.agent,
      model: row.model,
      parentId: row.parent_id,
    });
    if (project && (row.project ?? '').toLowerCase() !== project) continue;
    if (providerSessions && !providerSessions.has(row.id)) continue;
    sessionIntervals.push({ created: row.created ?? 0, updated: row.updated ?? 0 });
  }

  // The range panels never look past `rangeEnd`. A window ending before now is
  // the only case where that differs from the scan above, so it gets a filtered
  // copy; presets and a `to` of today reuse the full array.
  const windowRows = rangeEnd < now ? rows.filter((row) => row.ts <= rangeEnd) : rows;

  const stats = aggregate({
    rows: windowRows,
    card,
    estimatedCard,
    meteredCard,
    provider,
    rangeStart,
    rangeAll,
    historyStart,
    todayStart,
    calendarStart,
    now: rangeEnd,
    projectNames: readProjectNames(db),
    sessionMeta,
    sessionIntervals,
    projectShareBase,
  });

  if (rangeEnd < now) {
    // The range-independent panels keep the full-history scan: the lifetime
    // summary, the charts' `series`, the heatmap, the live numbers, and the
    // whole-history streak. `totals`, `daily`, `hourly`, `projects`, `models`
    // and `sessions` stay on the custom window.
    const full = aggregate({
      rows,
      card,
      estimatedCard,
      meteredCard,
      provider,
      rangeStart: historyStart,
      rangeAll: true,
      historyStart,
      todayStart,
      calendarStart,
      now,
      projectNames: readProjectNames(db),
      sessionMeta,
      sessionIntervals,
      projectShareBase,
    });
    stats.lifetime = full.lifetime;
    stats.series = full.series;
    stats.calendar = full.calendar;
    stats.live = full.live;
    stats.totals.streak = full.totals.streak;
  }

  if (rangeKey === 'custom') {
    // `days` is the authoritative window width; never trail the daily series
    // past a custom `to` that sits before today.
    stats.daily = stats.daily.slice(0, days);
  }

  return {
    generatedAt: new Date(now).toISOString(),
    range: {
      key: rangeKey,
      from: new Date(rangeStart).toISOString(),
      to: new Date(rangeEnd).toISOString(),
      days,
    },
    card: cardId,
    ...stats,
    rateCards: rateCardMeta,
    pricing: {
      fallbackLabel: pricing.fallbackLabel,
      fallback: pricing.fallback,
      overrides: Object.keys(pricing.models).length,
      path: pricing.path,
    },
  };
}
