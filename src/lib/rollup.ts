import type { RateCard } from './pricing';
import { resolveRate } from './pricing';
import { localDayIndex, localDayKeyFromIndex } from './time';
import type { CalendarDay, DailyPoint, HourlyPoint, ModelStat, ProjectStat, ProviderStat, SessionStat, Tokens } from './types';
import type { DayAgg, ModelAgg, ProjectAgg, ProviderAgg, SessionAgg, SessionMeta } from './aggregate';

const SESSION_LIMIT = 300;

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
const iso = (ms: number): string => new Date(ms).toISOString();

/** Local day index -> `YYYY-MM-DD`. */
const dayLabel = (index: number): string => localDayKeyFromIndex(index);

/** 0 = no activity, 1-4 = quartile of the non-zero days. */
function levelsFor(days: CalendarDay[]): void {
  const values = days
    .filter((day) => day.tokens > 0)
    .map((day) => day.tokens)
    .sort((a, b) => a - b);
  if (values.length === 0) return;
  const at = (q: number): number => values[Math.min(values.length - 1, Math.floor(q * (values.length - 1)))];
  const [q1, q2, q3] = [at(0.25), at(0.5), at(0.75)];
  for (const day of days) {
    if (day.tokens === 0) day.level = 0;
    else if (day.tokens <= q1) day.level = 1;
    else if (day.tokens <= q2) day.level = 2;
    else if (day.tokens <= q3) day.level = 3;
    else day.level = 4;
  }
}

export function buildDaily(dayAgg: Map<number, DayAgg>, rangeIndex: number, todayIndex: number): DailyPoint[] {
  const daily: DailyPoint[] = [];
  for (let index = rangeIndex; index <= todayIndex; index += 1) {
    const day = dayAgg.get(index);
    daily.push({
      date: dayLabel(index),
      input: Math.round(day?.input ?? 0),
      output: Math.round(day?.output ?? 0),
      reasoning: Math.round(day?.reasoning ?? 0),
      cacheRead: Math.round(day?.cacheRead ?? 0),
      tokens: Math.round(day?.tokens ?? 0),
      cost: round6(day?.cost ?? 0),
      sessions: day?.sessions.size ?? 0,
    });
  }
  return daily;
}

export function buildHourly(hourAgg: Map<number, { tokens: number; cost: number }>): HourlyPoint[] {
  const hourly: HourlyPoint[] = [];
  for (let dow = 0; dow < 7; dow += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const entry = hourAgg.get(dow * 24 + hour);
      hourly.push({ dow, hour, tokens: Math.round(entry?.tokens ?? 0), cost: round6(entry?.cost ?? 0) });
    }
  }
  return hourly;
}

export function buildCalendar(
  dayAgg: Map<number, DayAgg>,
  calendarStart: number,
  todayIndex: number,
): CalendarDay[] {
  const calendar: CalendarDay[] = [];
  for (let index = localDayIndex(calendarStart); index <= todayIndex; index += 1) {
    const day = dayAgg.get(index);
    calendar.push({
      date: dayLabel(index),
      tokens: Math.round(day?.tokens ?? 0),
      cost: round6(day?.cost ?? 0),
      level: 0,
    });
  }
  levelsFor(calendar);
  return calendar;
}

/**
 * One row per project. `shareBase` is the token total of every project in
 * scope — not the filtered total — so a single-project view still reports the
 * project's true share. Zero (or no data) yields a share of 0.
 */
export function buildProjects(
  projectAgg: Map<string, ProjectAgg>,
  projectNames: Record<string, string>,
  shareBase: number,
): ProjectStat[] {
  return [...projectAgg.entries()]
    .map(([slug, value]) => ({
      slug,
      name: projectNames[slug] ?? slug,
      tokens: Math.round(value.tokens),
      cost: round6(value.cost),
      sessions: value.sessions.size,
      messages: value.messages,
      lastUsed: iso(value.lastUsed),
      share: shareBase > 0 ? round6(value.tokens / shareBase) : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

export function buildModels(modelAgg: Map<string, ModelAgg>, card: RateCard, totalTokens: number): ModelStat[] {
  return [...modelAgg.entries()]
    .map(([key, value]) => {
      const [provider, model, variant] = key.split('\u0000');
      return {
        provider,
        model,
        variant,
        tokens: {
          input: Math.round(value.input),
          output: Math.round(value.output),
          reasoning: Math.round(value.reasoning),
          cacheRead: Math.round(value.cacheRead),
          cacheWrite: Math.round(value.cacheWrite),
          total: Math.round(value.tokens),
        },
        cost: round6(value.cost),
        messages: value.messages,
        share: totalTokens > 0 ? round6(value.tokens / totalTokens) : 0,
        rate: resolveRate(card, model),
      };
    })
    .sort((a, b) => b.tokens.total - a.tokens.total);
}

export function buildProviders(providerAgg: Map<string, ProviderAgg>, totalTokens: number): ProviderStat[] {
  return [...providerAgg.entries()]
    .map(([provider, value]) => {
      const tokens: Tokens = {
        input: Math.round(value.input),
        output: Math.round(value.output),
        reasoning: Math.round(value.reasoning),
        cacheRead: Math.round(value.cacheRead),
        cacheWrite: Math.round(value.cacheWrite),
        total: Math.round(value.tokens),
      };
      return {
        provider,
        tokens,
        messages: value.messages,
        models: value.models.size,
        share: totalTokens > 0 ? round6(value.tokens / totalTokens) : 0,
        // Unrounded: the per-provider costs must add up to the totals exactly.
        cost: value.cost,
        estimated: value.estimated,
        metered: value.metered,
      };
    })
    .sort((a, b) => b.tokens.total - a.tokens.total);
}

export function buildSessions(
  sessionAgg: Map<string, SessionAgg>,
  sessionMeta: Map<string, SessionMeta>,
): SessionStat[] {
  return [...sessionAgg.entries()]
    .sort((a, b) => b[1].tokens - a[1].tokens)
    .slice(0, SESSION_LIMIT)
    .map(([id, value]) => {
      const info = sessionMeta.get(id);
      return {
        id,
        title: info?.title ?? 'Untitled',
        project: info?.project ?? 'root',
        agent: info?.agent ?? 'unknown',
        model: info?.model ?? 'unknown',
        startedAt: iso(value.startedAt),
        endedAt: iso(value.endedAt),
        durationMs: value.endedAt - value.startedAt,
        messages: value.messages,
        tokens: Math.round(value.tokens),
        cost: round6(value.cost),
        parentId: info?.parentId ?? null,
      };
    });
}
