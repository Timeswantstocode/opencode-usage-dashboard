import { resolveRate } from './pricing';
import type { RateCard } from './pricing';
import { buildCalendar, buildDaily, buildHourly, buildModels, buildProjects, buildProviders, buildSessions } from './rollup';
import { DAY_MS, localDayIndex, localDayKeyFromIndex, localDow, localHour } from './time';
import type {
  CalendarDay,
  DailyPoint,
  HourlyPoint,
  LifetimeStats,
  LiveStats,
  ModelStat,
  ProjectStat,
  ProviderStat,
  Rate,
  SessionStat,
  StatsSeries,
  StatsTotals,
  Tokens,
} from './types';

export type RawRow = {
  ts: number;
  session_id: string;
  project: string;
  provider: string | null;
  model: string | null;
  variant: string | null;
  input: number;
  output: number;
  reasoning: number;
  cache_read: number;
  cache_write: number;
};

export type SessionMeta = {
  title: string | null;
  project: string | null;
  agent: string | null;
  model: string | null;
  parentId: string | null;
};

/** One `sess` row, reduced to the wall-clock interval time stats need. */
export type SessionInterval = {
  /** `sess.created`, epoch ms. */
  created: number;
  /** `sess.updated`, epoch ms. */
  updated: number;
};

export type DayAgg = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  tokens: number;
  cost: number;
  sessions: Set<string>;
};

export type ProjectAgg = {
  tokens: number;
  cost: number;
  messages: number;
  sessions: Set<string>;
  lastUsed: number;
};

export type ModelAgg = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  tokens: number;
  cost: number;
  messages: number;
};

export type ProviderAgg = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  tokens: number;
  messages: number;
  models: Set<string>;
  cost: number;
  estimated: number;
  metered: number;
};

export type SessionAgg = {
  tokens: number;
  cost: number;
  messages: number;
  startedAt: number;
  endedAt: number;
};

export type AggregateInput = {
  rows: RawRow[];
  card: RateCard;
  /** Card used for `providers[].estimated`, whatever the active card is. */
  estimatedCard: RateCard;
  /** Card used for `providers[].metered`, whatever the active card is. */
  meteredCard: RateCard;
  /** Lowercase provider id, or null for every provider. */
  provider: string | null;
  /** First ms of the selected range (local midnight). */
  rangeStart: number;
  /** True for `range=all`: the range time stats reuse the lifetime ones exactly. */
  rangeAll: boolean;
  /** First ms of the full history (local midnight of the oldest message). */
  historyStart: number;
  /** Local midnight today, ms. */
  todayStart: number;
  /** First ms of the 365-day calendar window. */
  calendarStart: number;
  now: number;
  projectNames: Record<string, string>;
  sessionMeta: Map<string, SessionMeta>;
  /** Every session in scope, unfiltered by range: feeds both time-stat scopes. */
  sessionIntervals: SessionInterval[];
  /**
   * Denominator for `projects[].share`: tokens of every project in scope.
   * With a project filter this is the unfiltered range total, which is larger
   * than the filtered `tokens.total`; defaults to `tokens.total`.
   */
  projectShareBase?: number;
};

export type Aggregate = {
  totals: StatsTotals;
  /** Range-independent lifetime summary. */
  lifetime: LifetimeStats;
  /** One row per provider in the range and project, ignoring the provider filter. */
  providers: ProviderStat[];
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  calendar: CalendarDay[];
  /** Range-independent chart series, filtered only by project and provider. */
  series: StatsSeries;
  projects: ProjectStat[];
  models: ModelStat[];
  sessions: SessionStat[];
  live: LiveStats;
};

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
const iso = (ms: number): string => new Date(ms).toISOString();

function tokensOf(row: {
  input?: number | null;
  output?: number | null;
  reasoning?: number | null;
  cacheRead?: number | null;
  cacheWrite?: number | null;
}): Tokens {
  const input = Math.round(row.input ?? 0);
  const output = Math.round(row.output ?? 0);
  const reasoning = Math.round(row.reasoning ?? 0);
  const cacheRead = Math.round(row.cacheRead ?? 0);
  const cacheWrite = Math.round(row.cacheWrite ?? 0);
  return { input, output, reasoning, cacheRead, cacheWrite, total: input + output + reasoning + cacheRead + cacheWrite };
}

function streakOf(active: Set<number>, todayIndex: number): number {
  let cursor = todayIndex;
  if (!active.has(cursor)) cursor -= 1;
  let streak = 0;
  while (active.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

/** Longest run of consecutive indices in an ascending list, and where it ends. */
function longestRun(days: number[]): { length: number; end: number | null } {
  let length = 0;
  let end: number | null = null;
  let current = 0;
  let previous: number | null = null;
  for (const index of days) {
    current = previous !== null && index === previous + 1 ? current + 1 : 1;
    if (current > length) {
      length = current;
      end = index;
    }
    previous = index;
  }
  return { length, end };
}

const HOUR_MS = 3_600_000;
/** A session left open for days is not days of work: no interval counts for more than 8 hours. */
const IDLE_CAP_MS = 8 * HOUR_MS;
const round1 = (value: number): number => Math.round(value * 10) / 10;

type TimeStats = Pick<StatsTotals, 'activeHours' | 'activeHoursCapped' | 'sessionMs'>;

/**
 * Time stats for one scope.
 *
 * With a `clip` window, every `[created, updated]` interval is trimmed to it
 * first and dropped when nothing remains, so a Today view cannot report
 * lifetime time. The trimmed interval is then clamped to 8 hours and
 * overlapping or touching intervals are unioned, so sessions running side by
 * side (a parent and its subagents) count once. `sessionMs` keeps the raw
 * individual durations of those trimmed intervals, because they describe one
 * conversation. `activeHoursCapped` re-clamps each merged block, a floor for a
 * chain of sessions that never pauses; it is omitted when it would repeat
 * `activeHours`.
 */
function timeStats(intervals: SessionInterval[], clip?: { start: number; end: number }): TimeStats {
  const durations: number[] = [];
  const blocks: Array<{ start: number; end: number }> = [];
  let longest = 0;
  let longestCapped = 0;

  for (const interval of intervals) {
    const start = clip ? Math.max(interval.created, clip.start) : interval.created;
    const end = clip ? Math.min(interval.updated, clip.end) : interval.updated;
    const raw = end - start;
    if (!(raw > 0)) continue; // updated at or before created: no work to count
    const capped = Math.min(raw, IDLE_CAP_MS);
    durations.push(raw);
    if (raw > longest) longest = raw;
    if (capped > longestCapped) longestCapped = capped;
    blocks.push({ start, end: start + capped });
  }

  if (durations.length === 0) {
    return { activeHours: 0, sessionMs: { avg: 0, median: 0, p95: 0, longest: 0, longestCapped: 0 } };
  }

  durations.sort((a, b) => a - b);
  const count = durations.length;
  const middle = Math.floor(count / 2);
  const median =
    count % 2 === 1 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2;

  blocks.sort((a, b) => a.start - b.start);
  let mergedMs = 0;
  let blockCappedMs = 0;
  let start = blocks[0].start;
  let end = blocks[0].end;
  const flush = (): void => {
    const span = end - start;
    mergedMs += span;
    blockCappedMs += Math.min(span, IDLE_CAP_MS);
  };
  for (let index = 1; index < blocks.length; index += 1) {
    const next = blocks[index];
    if (next.start <= end) {
      if (next.end > end) end = next.end;
      continue;
    }
    flush();
    start = next.start;
    end = next.end;
  }
  flush();

  const activeHours = round1(mergedMs / HOUR_MS);
  const activeHoursCapped = round1(blockCappedMs / HOUR_MS);
  return {
    activeHours,
    // Only when the stricter clamp actually changes the headline number.
    ...(activeHoursCapped !== activeHours ? { activeHoursCapped } : {}),
    sessionMs: {
      avg: Math.round(durations.reduce((sum, value) => sum + value, 0) / count),
      median: Math.round(median),
      p95: durations[Math.ceil(0.95 * count) - 1],
      longest,
      longestCapped,
    },
  };
}

export function aggregate(input: AggregateInput): Aggregate {
  const {
    rows,
    card,
    estimatedCard,
    meteredCard,
    provider,
    rangeStart,
    rangeAll,
    historyStart,
    todayStart,
    calendarStart,
    now,
    projectNames,
    sessionMeta,
    sessionIntervals,
    projectShareBase,
  } = input;

  const rateCache = (source: RateCard): ((model: string) => Rate) => {
    const rates = new Map<string, Rate>();
    return (model) => {
      let rate = rates.get(model);
      if (!rate) {
        rate = resolveRate(source, model);
        rates.set(model, rate);
      }
      return rate;
    };
  };
  const rateFor = rateCache(card);
  const estimatedRateFor = rateCache(estimatedCard);
  const meteredRateFor = rateCache(meteredCard);

  const messageCost = (row: RawRow, rate: Rate): number =>
    (row.input * rate.input + (row.output + row.reasoning) * rate.output + row.cache_read * rate.cacheRead) / 1e6;

  const dayAgg = new Map<number, DayAgg>();
  // A short range still charts the whole history, so its hourly buckets need a
  // second map. When the range already starts at the first message
  // (`range=all`) the range map *is* the history map: do not pay twice.
  const historyHourAgg = rangeStart > historyStart ? new Map<number, { tokens: number; cost: number }>() : null;
  const hourAgg = new Map<number, { tokens: number; cost: number }>();
  const projectAgg = new Map<string, ProjectAgg>();
  const modelAgg = new Map<string, ModelAgg>();
  const providerAgg = new Map<string, ProviderAgg>();
  const sessionAgg = new Map<string, SessionAgg>();
  const allSessions = new Set<string>();
  // Lifetime counts the day buckets cannot answer. Filled in the same scan,
  // below the provider filter, so `range` never touches them.
  const lifetimeSessions = new Set<string>();
  let lifetimeMessages = 0;
  const totals = {
    messages: 0,
    input: 0,
    output: 0,
    reasoning: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    estimated: 0,
    metered: 0,
  };
  const last24Start = now - DAY_MS;
  let last24Tokens = 0;
  let lastMessageAt = 0;

  for (const row of rows) {
    const tokens = row.input + row.output + row.reasoning + row.cache_read + row.cache_write;
    const model = row.model ?? 'unknown';
    const rate = rateFor(model);
    const cost = messageCost(row, rate);
    const providerKey = (row.provider ?? 'unknown').toLowerCase();

    // Provider totals ignore the provider filter: they always cover the whole
    // range and project, so the selector can list every provider.
    let estimatedCost = 0;
    let meteredCost = 0;
    if (row.ts >= rangeStart) {
      estimatedCost = messageCost(row, estimatedRateFor(model));
      meteredCost = messageCost(row, meteredRateFor(model));

      let entry = providerAgg.get(providerKey);
      if (!entry) {
        entry = {
          input: 0,
          output: 0,
          reasoning: 0,
          cacheRead: 0,
          cacheWrite: 0,
          tokens: 0,
          messages: 0,
          models: new Set<string>(),
          cost: 0,
          estimated: 0,
          metered: 0,
        };
        providerAgg.set(providerKey, entry);
      }
      entry.input += row.input;
      entry.output += row.output;
      entry.reasoning += row.reasoning;
      entry.cacheRead += row.cache_read;
      entry.cacheWrite += row.cache_write;
      entry.tokens += tokens;
      entry.messages += 1;
      entry.models.add(model);
      entry.cost += cost;
      entry.estimated += estimatedCost;
      entry.metered += meteredCost;
    }

    if (provider && providerKey !== provider) continue;

    lifetimeMessages += 1;
    lifetimeSessions.add(row.session_id);

    const hourKey = localDow(row.ts) * 24 + localHour(row.ts);
    if (historyHourAgg) {
      const historyHour = historyHourAgg.get(hourKey) ?? { tokens: 0, cost: 0 };
      historyHour.tokens += tokens;
      historyHour.cost += cost;
      historyHourAgg.set(hourKey, historyHour);
    }

    const index = localDayIndex(row.ts);
    let day = dayAgg.get(index);
    if (!day) {
      day = { input: 0, output: 0, reasoning: 0, cacheRead: 0, tokens: 0, cost: 0, sessions: new Set() };
      dayAgg.set(index, day);
    }
    day.input += row.input;
    day.output += row.output;
    day.reasoning += row.reasoning;
    day.cacheRead += row.cache_read;
    day.tokens += tokens;
    day.cost += cost;
    day.sessions.add(row.session_id);

    if (row.ts > lastMessageAt) lastMessageAt = row.ts;
    if (row.ts >= last24Start) last24Tokens += tokens;

    if (row.ts < rangeStart) continue;

    totals.messages += 1;
    totals.input += row.input;
    totals.output += row.output;
    totals.reasoning += row.reasoning;
    totals.cacheRead += row.cache_read;
    totals.cacheWrite += row.cache_write;
    totals.cost += cost;
    totals.estimated += estimatedCost;
    totals.metered += meteredCost;
    allSessions.add(row.session_id);

    const hour = hourAgg.get(hourKey) ?? { tokens: 0, cost: 0 };
    hour.tokens += tokens;
    hour.cost += cost;
    hourAgg.set(hourKey, hour);

    const project = projectAgg.get(row.project) ?? {
      tokens: 0,
      cost: 0,
      messages: 0,
      sessions: new Set<string>(),
      lastUsed: 0,
    };
    project.tokens += tokens;
    project.cost += cost;
    project.messages += 1;
    project.sessions.add(row.session_id);
    project.lastUsed = Math.max(project.lastUsed, row.ts);
    projectAgg.set(row.project, project);

    const modelKey = `${row.provider ?? 'unknown'}\u0000${row.model ?? 'unknown'}\u0000${row.variant ?? ''}`;
    const modelEntry = modelAgg.get(modelKey) ?? {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
      tokens: 0,
      cost: 0,
      messages: 0,
    };
    modelEntry.input += row.input;
    modelEntry.output += row.output;
    modelEntry.reasoning += row.reasoning;
    modelEntry.cacheRead += row.cache_read;
    modelEntry.cacheWrite += row.cache_write;
    modelEntry.tokens += tokens;
    modelEntry.cost += cost;
    modelEntry.messages += 1;
    modelAgg.set(modelKey, modelEntry);

    const session = sessionAgg.get(row.session_id) ?? {
      tokens: 0,
      cost: 0,
      messages: 0,
      startedAt: row.ts,
      endedAt: row.ts,
    };
    session.tokens += tokens;
    session.cost += cost;
    session.messages += 1;
    session.startedAt = Math.min(session.startedAt, row.ts);
    session.endedAt = Math.max(session.endedAt, row.ts);
    sessionAgg.set(row.session_id, session);
  }

  const todayIndex = localDayIndex(todayStart);
  const rangeIndex = localDayIndex(rangeStart);
  // First local day with a message under the active filters: `series.daily`
  // starts here, whatever the selected range is.
  let historyIndex = todayIndex;
  for (const index of dayAgg.keys()) if (index < historyIndex) historyIndex = index;
  const tokens = tokensOf(totals);

  const activeDays = new Set<number>();
  const streakDays = new Set<number>();
  for (const [index, day] of dayAgg) {
    if (day.tokens === 0) continue;
    streakDays.add(index);
    if (index >= rangeIndex) activeDays.add(index);
  }

  // Lifetime summary. It reads the all-history `dayAgg` buckets that
  // `series.daily` is built from — never a second row scan — and the fetch
  // always starts at the oldest message day, so `range` cannot shrink it.
  let lifetimeInput = 0;
  let lifetimeOutput = 0;
  let lifetimeReasoning = 0;
  let lifetimeCacheRead = 0;
  let lifetimeTotal = 0;
  let lifetimeCost = 0;
  for (const day of dayAgg.values()) {
    lifetimeInput += day.input;
    lifetimeOutput += day.output;
    lifetimeReasoning += day.reasoning;
    lifetimeCacheRead += day.cacheRead;
    lifetimeTotal += day.tokens;
    lifetimeCost += day.cost;
  }
  // `DayAgg` keeps the four priced fields plus the total, so the cache-write
  // remainder is exact: every token in `day.tokens` is one of the five fields.
  const lifetimeCacheWrite =
    lifetimeTotal - (lifetimeInput + lifetimeOutput + lifetimeReasoning + lifetimeCacheRead);
  const lifetimeDays = [...streakDays].sort((a, b) => a - b);
  const lifetimeRun = longestRun(lifetimeDays);
  const lifetimeCacheBase = lifetimeInput + lifetimeCacheRead + lifetimeCacheWrite;
  // Time stats share the `sess` scan above. `range=all` reuses the lifetime
  // pass, which also guarantees the two time figures agree exactly.
  const lifetimeTime = timeStats(sessionIntervals);
  const rangeTime = rangeAll ? lifetimeTime : timeStats(sessionIntervals, { start: rangeStart, end: now });
  const lifetime: LifetimeStats = {
    tokens: tokensOf({
      input: lifetimeInput,
      output: lifetimeOutput,
      reasoning: lifetimeReasoning,
      cacheRead: lifetimeCacheRead,
      cacheWrite: lifetimeCacheWrite,
    }),
    cost: round6(lifetimeCost),
    sessions: lifetimeSessions.size,
    messages: lifetimeMessages,
    activeDays: lifetimeDays.length,
    longestStreak: lifetimeRun.length,
    longestStreakEnd: lifetimeRun.end === null ? null : localDayKeyFromIndex(lifetimeRun.end),
    cacheHitRate: lifetimeCacheBase > 0 ? round6(lifetimeCacheRead / lifetimeCacheBase) : 0,
    firstDay: localDayKeyFromIndex(lifetimeDays[0] ?? historyIndex),
    lastDay: localDayKeyFromIndex(lifetimeDays[lifetimeDays.length - 1] ?? todayIndex),
    activeHours: lifetimeTime.activeHours,
    sessionMs: lifetimeTime.sessionMs,
  };

  let subagents = 0;
  for (const id of allSessions) if (sessionMeta.get(id)?.parentId) subagents += 1;

  const today = dayAgg.get(todayIndex);
  const hoursElapsed = Math.max(1, (now - todayStart) / 3_600_000);
  const cacheBase = tokens.input + tokens.cacheRead + tokens.cacheWrite;
  const lagSeconds = lastMessageAt ? Math.max(0, Math.round((now - lastMessageAt) / 1000)) : null;
  let providerTokens = 0;
  for (const entry of providerAgg.values()) providerTokens += entry.tokens;
  const calendar = buildCalendar(dayAgg, calendarStart, todayIndex);

  const providers = buildProviders(providerAgg, providerTokens);

  return {
    totals: {
      messages: totals.messages,
      sessions: allSessions.size,
      subagents,
      activeDays: activeDays.size,
      streak: streakOf(streakDays, todayIndex),
      tokens,
      cost: round6(totals.cost),
      costByCard: {
        estimated: round6(totals.estimated),
        metered: round6(totals.metered),
      },
      cacheHitRate: cacheBase > 0 ? round6(tokens.cacheRead / cacheBase) : 0,
      ...rangeTime,
    },
    lifetime,
    providers,
    daily: buildDaily(dayAgg, rangeIndex, todayIndex),
    hourly: buildHourly(hourAgg),
    calendar,
    series: {
      // Same buckets as `daily`, but always from the first message day.
      daily: buildDaily(dayAgg, historyIndex, todayIndex),
      hourly: buildHourly(historyHourAgg ?? hourAgg),
      // The heatmap is already range-independent: same 365-day window, same card.
      calendar,
    },
    projects: buildProjects(projectAgg, projectNames, projectShareBase ?? tokens.total),
    models: buildModels(modelAgg, card, tokens.total),
    sessions: buildSessions(sessionAgg, sessionMeta),
    live: {
      asOf: iso(now),
      lagSeconds,
      lastMessageAt: lastMessageAt ? iso(lastMessageAt) : null,
      todayTokens: Math.round(today?.tokens ?? 0),
      todayCost: round6(today?.cost ?? 0),
      burnPerHour: Math.round(last24Tokens / 24),
      projectedMonth: round6(((today?.cost ?? 0) / hoursElapsed) * 24 * 30),
    },
  };
}
