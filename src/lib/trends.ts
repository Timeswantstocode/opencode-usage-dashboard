/** Pure derivations behind the Trends tab. Every divisor is guarded. */

import { formatDay, formatPercent, formatTokens, formatUsd } from './format';
import { rangeLabel as sharedRangeLabel } from './range';
import { localDayKey, localHour } from './time';
import type { DailyPoint, SessionStat, StatsResponse } from './types';

export type Totals = { tokens: number; cost: number; sessions: number; days: number };
export type Delta = { current: number; previous: number; ratio: number | null };

type PeriodRow = { key: string; start: string; end: string; label: string; tokens: number; cost: number; sessions: number; days: number; activeDays: number; avgTokens: number; change: Delta | null };
export type CompareReport = {
  /** "Today", "Last 7 days", "Last 30 days", "Last 90 days", "Custom range", "Best week", or "All time". */
  label: string;
  /** The exact window, e.g. "Last 7 days · Oct 19 – Oct 25" or "CUSTOM · OCT 1 – OCT 10". */
  rangeLabel: string;
  /** Explicit comparison line, e.g. "Today vs yesterday" or "Best week vs the typical week". */
  title: string;
  /** One sentence explaining the current, delta and previous figures. */
  description: string;
  /** "vs prior 7 days · Oct 12 – Oct 18", "vs the typical week", or "no prior period". */
  comparisonLabel: string;
  /** Prefix before the previous value: "previous" normally, "typical" for the all-time comparison. */
  previousPrefix: 'previous' | 'typical';
  /** Per-metric text when there is no prior value to show. */
  previousLabel: string;
  current: Totals;
  previous: Totals;
  hasPrevious: boolean;
  tokens: Delta;
  cost: Delta;
  sessions: Delta;
};
type Anomaly = { date: string; cost: number; tokens: number; z: number; kind: 'high' | 'low' };
type AnomalyReport = { mean: number; median: number; sigma: number; days: number; activeDays: number; items: Anomaly[]; ready: boolean };
type DurationReport = { buckets: { label: string; count: number; share: number }[]; total: number; medianMs: number; p95Ms: number; longestMs: number };
type BlockBucket = { start: number; label: string; span: string; tokens: number; cost: number; sessions: number };
type BlockReport = { buckets: BlockBucket[]; heaviest: (BlockBucket & { date: string }) | null; totalTokens: number };
type CumulativePoint = { date: string; tokens: number; cost: number; dayTokens: number; dayCost: number };
type Insight = { label: string; text: string };

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DURATION_BUCKETS = [
  { label: '<5m', min: 0, max: 5 * 60_000 }, { label: '5–15m', min: 5 * 60_000, max: 15 * 60_000 },
  { label: '15–30m', min: 15 * 60_000, max: 30 * 60_000 }, { label: '30–60m', min: 30 * 60_000, max: 60 * 60_000 },
  { label: '1–2h', min: 60 * 60_000, max: 120 * 60_000 }, { label: '2–4h', min: 120 * 60_000, max: 240 * 60_000 },
  { label: '4h+', min: 240 * 60_000, max: Number.POSITIVE_INFINITY },
] as const;
const BLOCK_STARTS = [0, 5, 10, 15, 20] as const;

const pad = (value: number): string => String(value).padStart(2, '0');
const windowLabel = (start: number, long = false): string =>
  long ? `${pad(start)}:00–${pad((start + 5) % 24)}:00` : `${pad(start)}–${pad((start + 5) % 24)}`;

/** Clone `daily` with the newest day refreshed from the live counters. */
export function liveDaily(data: StatsResponse): DailyPoint[] {
  const last = data.daily.at(-1);
  if (!last) return [];
  return [...data.daily.slice(0, -1), { ...last, tokens: data.live.todayTokens, cost: data.live.todayCost }];
}

export function totalsOf(days: readonly DailyPoint[]): Totals {
  let tokens = 0;
  let cost = 0;
  let sessions = 0;
  for (const day of days) {
    tokens += day.tokens;
    cost += day.cost;
    sessions += day.sessions;
  }
  return { tokens, cost, sessions, days: days.length };
}

export function deltaOf(current: number, previous: number): Delta {
  return { current, previous, ratio: previous > 0 ? (current - previous) / previous : null };
}

export function deltaTone(value: Delta): 'up' | 'down' | 'flat' | 'new' {
  if (value.ratio === null) return value.current > 0 ? 'new' : 'flat';
  if (Math.abs(value.ratio) < 0.0005) return 'flat';
  return value.ratio > 0 ? 'up' : 'down';
}

/** "▲ 12.4%", "▼ 3.1%", "new", or "—". */
export function deltaText(value: Delta): string {
  const tone = deltaTone(value);
  if (tone === 'new') return 'new';
  if (tone === 'flat') return value.ratio === null ? '—' : '0.0%';
  return `${tone === 'up' ? '▲' : '▼'} ${(Math.abs(value.ratio ?? 0) * 100).toFixed(1)}%`;
}

function windowText(start: string, end: string): string {
  if (!start) return '';
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

type RollingWeek = { start: string; end: string; totals: Totals };

/** Every contiguous seven-day stretch in `days`, oldest first. */
function rollingWeeks(days: readonly DailyPoint[]): RollingWeek[] {
  const weeks: RollingWeek[] = [];
  for (let index = 0; index + 7 <= days.length; index += 1) {
    const slice = days.slice(index, index + 7);
    weeks.push({ start: slice[0]?.date ?? '', end: slice[6]?.date ?? '', totals: totalsOf(slice) });
  }
  return weeks;
}

/** The window at the median token total: the typical week. */
function medianWeek(weeks: readonly RollingWeek[]): RollingWeek | null {
  if (weeks.length === 0) return null;
  const sorted = [...weeks].sort((a, b) => a.totals.tokens - b.totals.tokens);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/**
 * The selected range against the window immediately before it. A custom range
 * compares against the same number of days ending just before `from`, clamped
 * to history, so a wide hand-picked window is never treated as all time.
 * An all-time range has no earlier period, so it compares the best rolling
 * seven-day window against the median one instead; with less than two weeks of
 * history it reports lifetime totals with no comparison.
 */
export function periodCompare(data: StatsResponse): CompareReport {
  const currentDays = data.daily;
  const history = data.series?.daily ?? currentDays;
  const days = Math.max(1, data.range?.days || currentDays.length || 1);
  const allTime = data.range.key === 'all';
  const weeks = allTime && history.length >= 14 ? rollingWeeks(history) : [];
  const bestWeek = weeks.reduce<RollingWeek | null>(
    (best, week) => (!best || week.totals.tokens > best.totals.tokens ? week : best),
    null,
  );
  const typicalWeek = bestWeek ? medianWeek(weeks) : null;
  const weekCompare = bestWeek !== null && typicalWeek !== null;

  const windowStart = currentDays[0]?.date ?? history[0]?.date ?? '';
  const windowEnd = currentDays.at(-1)?.date ?? history.at(-1)?.date ?? '';
  const window = windowText(windowStart, windowEnd);

  let previousDays: DailyPoint[] = [];
  let label: string;
  let rangeName: string;
  let title: string;
  let description: string;
  let comparisonLabel: string;
  let previousPrefix: 'previous' | 'typical' = 'previous';

  if (weekCompare) {
    label = 'Best week';
    rangeName = 'All time';
    previousPrefix = 'typical';
    title = 'Best week vs the typical week';
    description = 'The strongest 7-day stretch in your history compared with the median week.';
  } else if (allTime) {
    label = 'All time';
    rangeName = label;
    title = 'All time';
    description = 'All-time totals; there is not yet a second full week to compare against.';
  } else {
    const startIndex = history.findIndex((day) => day.date === windowStart);
    const endIndex = startIndex >= 0 ? startIndex : Math.max(0, history.length - currentDays.length);
    previousDays = history.slice(Math.max(0, endIndex - days), endIndex);
    label = data.range.key === 'custom' ? 'Custom range' : days === 1 ? 'Today' : `Last ${days} days`;
    rangeName = label;

    const priorDays = previousDays.length;
    if (data.range.key === 'custom') {
      title = priorDays > 0
        ? `Custom range vs the prior ${priorDays} ${priorDays === 1 ? 'day' : 'days'}`
        : 'Custom range';
    } else if (days === 1) {
      title = priorDays > 0 ? 'Today vs yesterday' : 'Today';
    } else {
      title = priorDays > 0
        ? `Last ${days} days vs the prior ${priorDays} ${priorDays === 1 ? 'day' : 'days'}`
        : `Last ${days} days`;
    }
    description = 'Each metric shows the selected range, the change from the previous period of the same length, and the previous value.';
  }

  const current: Totals = weekCompare && bestWeek
    ? bestWeek.totals
    : {
        tokens: data.totals.tokens.total,
        cost: data.totals.cost,
        sessions: data.totals.sessions,
        days: allTime ? history.length : currentDays.length || days,
      };
  const previous: Totals = weekCompare && typicalWeek
    ? typicalWeek.totals
    : allTime
      ? { tokens: 0, cost: 0, sessions: 0, days: 0 }
      : totalsOf(previousDays);
  const hasPrevious = previous.days > 0;
  const previousWindow = windowText(previousDays[0]?.date ?? '', previousDays.at(-1)?.date ?? '');

  if (weekCompare) {
    comparisonLabel = 'vs the typical week';
  } else if (allTime) {
    comparisonLabel = 'all-time totals · no earlier period to compare';
  } else if (!hasPrevious) {
    comparisonLabel = 'no prior period';
  } else {
    comparisonLabel = `vs prior ${previous.days} ${previous.days === 1 ? 'day' : 'days'} · ${previousWindow}`;
  }

  return {
    label,
    rangeLabel: data.range.key === 'custom' ? sharedRangeLabel(data) : window ? `${rangeName} · ${window}` : rangeName,
    title,
    description,
    comparisonLabel,
    previousPrefix,
    previousLabel: allTime && !weekCompare ? 'no prior period' : '—',
    current,
    previous,
    hasPrevious,
    tokens: deltaOf(current.tokens, previous.tokens),
    cost: deltaOf(current.cost, previous.cost),
    sessions: deltaOf(current.sessions, previous.sessions),
  };
}

function mondayOf(day: string): string {
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS).toISOString().slice(0, 10);
}

function groupRows(days: readonly DailyPoint[], keyOf: (day: string) => string, labelOf: (key: string, start: string, end: string) => string): PeriodRow[] {
  const groups = new Map<string, DailyPoint[]>();
  for (const day of days) {
    const key = keyOf(day.date);
    const list = groups.get(key);
    if (list) list.push(day);
    else groups.set(key, [day]);
  }

  const rows: PeriodRow[] = [];
  for (const [key, list] of groups) {
    const total = totalsOf(list);
    const start = list[0]?.date ?? key;
    const end = list.at(-1)?.date ?? start;
    const previous = rows.at(-1);
    rows.push({
      key, start, end, label: labelOf(key, start, end), ...total,
      activeDays: list.filter((day) => day.tokens > 0).length,
      avgTokens: total.days > 0 ? total.tokens / total.days : 0,
      change: previous ? deltaOf(total.tokens, previous.tokens) : null,
    });
  }
  return rows;
}

/** ISO weeks, Monday start, oldest to newest. */
export function weeklyRows(days: readonly DailyPoint[]): PeriodRow[] {
  return groupRows(days, mondayOf, (_key, start, end) => (start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`));
}

/** Calendar months, oldest to newest. */
export function monthlyRows(days: readonly DailyPoint[]): PeriodRow[] {
  return groupRows(days, (day) => day.slice(0, 7), (key) => MONTH_FORMAT.format(new Date(`${key}-01T00:00:00.000Z`)));
}

export function cumulativeSeries(days: readonly DailyPoint[]): CumulativePoint[] {
  let tokens = 0;
  let cost = 0;
  return days.map((day) => {
    tokens += day.tokens;
    cost += day.cost;
    return { date: day.date, tokens, cost, dayTokens: day.tokens, dayCost: day.cost };
  });
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Mean and population σ over days with cost > 0; flags |z| > 2. */
export function anomalyReport(days: readonly DailyPoint[]): AnomalyReport {
  const active = days.filter((day) => day.cost > 0);
  const mean = active.length > 0 ? active.reduce((sum, day) => sum + day.cost, 0) / active.length : 0;
  const variance = active.length > 0 ? active.reduce((sum, day) => sum + (day.cost - mean) ** 2, 0) / active.length : 0;
  const sigma = Math.sqrt(variance);
  const items: Anomaly[] = sigma > 0
    ? active
        .map<Anomaly>((day) => ({ date: day.date, cost: day.cost, tokens: day.tokens, z: (day.cost - mean) / sigma, kind: day.cost > mean ? 'high' : 'low' }))
        .filter((item) => Math.abs(item.z) > 2)
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
        .slice(0, 5)
    : [];

  return { mean, median: median(active.map((day) => day.cost)), sigma, days: days.length, activeDays: active.length, items, ready: days.length >= 8 };
}

export function durationReport(sessions: readonly SessionStat[]): DurationReport {
  const durations = sessions.map((session) => Math.max(0, session.durationMs)).sort((a, b) => a - b);
  const total = durations.length;
  const nearestRank = (fraction: number): number =>
    total === 0 ? 0 : durations[Math.min(total - 1, Math.max(0, Math.ceil(total * fraction) - 1))] ?? 0;

  return {
    buckets: DURATION_BUCKETS.map((bucket) => {
      const count = durations.filter((ms) => ms >= bucket.min && ms < bucket.max).length;
      return { label: bucket.label, count, share: total > 0 ? count / total : 0 };
    }),
    total,
    medianMs: median(durations),
    p95Ms: nearestRank(0.95),
    longestMs: total > 0 ? durations[total - 1] ?? 0 : 0,
  };
}

/** Five-hour windows keyed by local start hour; the 20:00 window wraps to 01:00. */
export function blockReport(sessions: readonly SessionStat[]): BlockReport {
  const buckets: BlockBucket[] = BLOCK_STARTS.map((start) => ({
    start, label: windowLabel(start), span: windowLabel(start, true), tokens: 0, cost: 0, sessions: 0,
  }));
  const instances = new Map<string, { date: string; start: number; tokens: number; cost: number; sessions: number }>();

  for (const session of sessions) {
    const ms = Date.parse(session.startedAt);
    if (!Number.isFinite(ms)) continue;
    const date = localDayKey(ms);
    const start = Math.min(20, Math.floor(localHour(ms) / 5) * 5);
    const key = `${date}:${start}`;
    const instance = instances.get(key) ?? { date, start, tokens: 0, cost: 0, sessions: 0 };
    instance.tokens += session.tokens;
    instance.cost += session.cost;
    instance.sessions += 1;
    instances.set(key, instance);

    const bucket = buckets[start / 5];
    if (bucket) {
      bucket.tokens += session.tokens;
      bucket.cost += session.cost;
      bucket.sessions += 1;
    }
  }

  let heaviest = null;
  for (const instance of instances.values()) {
    if (!heaviest || instance.tokens > heaviest.tokens) {
      heaviest = { ...instance, label: windowLabel(instance.start), span: windowLabel(instance.start, true) };
    }
  }

  return { buckets, heaviest, totalTokens: buckets.reduce((sum, bucket) => sum + bucket.tokens, 0) };
}

function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00.000Z`).getUTCDay();
}

/** Four to six claims the numbers actually support; may return fewer on thin ranges. */
export function buildInsights(data: StatsResponse): Insight[] {
  const days = liveDaily(data);
  const out: Insight[] = [];
  if (days.length === 0) return out;
  const all = totalsOf(days);
  const add = (label: string, text: string): void => { out.push({ label, text }); };

  const weeks = weeklyRows(days);
  const weekMedian = median(weeks.map((week) => week.tokens));
  const peakWeek = weeks.reduce<PeriodRow | null>((best, week) => (!best || week.tokens > best.tokens ? week : best), null);
  if (weeks.length >= 3 && peakWeek && weekMedian > 0 && peakWeek.tokens / weekMedian >= 1.15) {
    add('peak week', `Your heaviest week was ${peakWeek.start} with ${formatTokens(peakWeek.tokens)} tokens (${(peakWeek.tokens / weekMedian).toFixed(1)}× your median week).`);
  }

  const recent = days.slice(-30);
  const half = Math.floor(recent.length / 2);
  const before = totalsOf(recent.slice(0, half));
  const after = totalsOf(recent.slice(half));
  if (recent.length >= 14 && before.sessions > 0 && after.sessions > 0) {
    const from = before.cost / before.sessions;
    const to = after.cost / after.sessions;
    if (from > 0 && Math.abs(to - from) / from >= 0.08) {
      add('cost per session', `Cost per session is ${to < from ? 'falling' : 'rising'}: ${formatUsd(from)} → ${formatUsd(to)} over the last ${recent.length} days.`);
    }
  }

  let weekend = 0;
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const day of days) {
    const dow = dayOfWeek(day.date);
    byWeekday[dow] = (byWeekday[dow] ?? 0) + day.tokens;
    if (dow === 0 || dow === 6) weekend += day.tokens;
  }
  if (days.length >= 7 && all.tokens > 0 && weekend > 0) {
    add('weekend share', `Weekends carry ${formatPercent(weekend / all.tokens, 0)} of your tokens.`);
  }

  const topDay = byWeekday.indexOf(Math.max(...byWeekday));
  const topShare = all.tokens > 0 ? (byWeekday[topDay] ?? 0) / all.tokens : 0;
  if (days.length >= 14 && topShare >= 0.16 && topDay !== 0 && topDay !== 6) {
    add('busiest day', `${WEEKDAYS[topDay]}s carry the most tokens (${formatPercent(topShare, 0)} of the total).`);
  }

  const blocks = blockReport(data.sessions);
  const peakBlock = blocks.buckets.reduce<BlockBucket | null>((best, bucket) => (!best || bucket.tokens > best.tokens ? bucket : best), null);
  const windowShare = peakBlock && blocks.totalTokens > 0 ? peakBlock.tokens / blocks.totalTokens : 0;
  if (peakBlock && windowShare >= 0.22) add('peak window', `Your peak 5-hour window is ${peakBlock.span}, with ${formatPercent(windowShare, 0)} of session tokens.`);

  const project = data.projects[0];
  if (project && data.projects.length >= 2 && project.share >= 0.25) {
    add('project mix', `${project.name} accounts for ${formatPercent(project.share, 0)} of tokens across ${data.projects.length} projects.`);
  }

  if (all.tokens > 0 && data.totals.cacheHitRate > 0) add('cache', `${formatPercent(data.totals.cacheHitRate, 0)} of prompt tokens came from the cache.`);

  const activeDays = days.filter((day) => day.tokens > 0).length;
  if (all.tokens > 0) add('volume', `You moved ${formatTokens(all.tokens)} tokens across ${activeDays} active ${activeDays === 1 ? 'day' : 'days'} for ${formatUsd(all.cost)}.`);

  return out.slice(0, 6);
}
