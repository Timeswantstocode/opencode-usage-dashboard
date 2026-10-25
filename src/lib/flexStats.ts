/** Derivation layer for the Records tab: pure, payload-only, finite, empty-safe. */
import { formatDuration, formatNumber, formatPercent, formatTokens, formatUsd } from './format';
import { formatWindow } from './range';
import { localDayKey } from './time';
import type { CalendarDay, CardId, DailyPoint, HourlyPoint, ModelStat, ProjectStat, Rate, SessionStat, StatsResponse } from './types';
export const HEAT_COLORS = ['#1A1A1A', '#3A1F14', '#6B2A12', '#A33D18', '#EC5B2B'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export interface FlexModel { key: string; provider: string; model: string; variant: string; tokens: number; share: number; cost: number; rate: Rate }
export interface RecordCell { id: string; label: string; value: string; sublabel: string; note?: string }
export interface Fact { id: string; label: string; value: string }
export interface CompositionSlice { id: 'input' | 'output' | 'reasoning' | 'cacheRead'; label: string; tokens: number; share: number }
export interface WeekdayBar { dow: number; label: string; tokens: number }
export interface HourBar { hour: number; tokens: number; peak: boolean }
export interface ModelShareBar { key: string; label: string; tokens: number; share: number; other: boolean }
export interface Distributions { composition: { slices: CompositionSlice[]; total: number }; weekday: WeekdayBar[]; hours: HourBar[]; models: ModelShareBar[] }
export interface Badge { id: string; name: string; detail: string; earned: boolean }
export interface LedgerRow { id: string; label: string; value: string; delta?: number; note?: string }
export interface ShareStat { id: string; label: string; value: string }
/** The share card's window: its stat set and footer follow the range selector. */
export type ShareWindow = 'today' | 'week' | 'month' | 'quarter' | 'all';
export interface ShareSnapshot {
  year: number; tokenTotal: number; tokensLabel: string; costLabel: string; cardLabel: string; card: CardId;
  sessions: number; activeDays: number; longestStreak: number; topModel: string; topModelShare: number;
  topProject: string; topProjectShare: number; cacheRead: number; cacheReadLabel: string; cacheHitRate: number;
  /** Range-scoped merged, idle-capped hours from `totals.activeHours`; the session merge only back-fills an absent/zero total. */
  hoursActive: number;
  /** Highest single-day token count in the range, 0 when there is no activity. */
  peakDayTokens: number;
  /** The range date behind `peakDayTokens`, `YYYY-MM-DD`; empty when there is none. */
  peakDayKey: string;
  tokensPerActiveDay: number;
  costPerActiveDay: number;
  /** Metered-card spend computed from the database (the hero uses the active card). */
  computedCost: number;
  prompts: number | null; messages: number;
  /** The 365-day contribution strip; it is the year-in-review element, not a range stat. */
  days: CalendarDay[];
  /** The selected range's local day bounds; cells outside them are dimmed. */
  rangeFrom: string;
  rangeTo: string;
  /** The range window this card describes. */
  window: ShareWindow;
  /** Local days the range covers; drives both the stat set and the 24h merge. */
  rangeDays: number;
  /** Eight adaptive stat cells, identical in the DOM card and the PNG. */
  stats: ShareStat[];
  /** Range footer, e.g. `TODAY · OCT 24`, `LAST 7 DAYS · OCT 18 – OCT 24`, `CUSTOM · OCT 1 – OCT 10`. */
  footer: string;
  /** The PNG band's top project and model; `null` when the range has none. */
  topProjectEntry: { name: string; share: number } | null;
  topModelEntry: { name: string; share: number } | null;
  /** Distinct providers in the range, 0 when there are none. */
  providerCount: number;
}
export interface FlexResult { records: RecordCell[]; facts: Fact[]; distributions: Distributions; achievements: Badge[]; ledger: LedgerRow[]; shareText: string; share: ShareSnapshot }

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const safeDivide = (a: number, b: number): number => (b > 0 ? finite(a / b) : 0);
const sum = (values: number[]): number => values.reduce((total, value) => total + finite(value), 0);
const clamp01 = (value: number): number => Math.min(1, Math.max(0, finite(value)));
const isoDay = (iso: string): string => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };
const truncate = (text: string, limit: number): string => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);
const daysLabel = (days: number): string => `${formatNumber(days)} ${days === 1 ? 'day' : 'days'}`;
const hourRange = (hour: number): string => `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`;
const modelName = (model: FlexModel): string => model.model.replace(/-(contributor-)?free$/, '');
function fmtDay(key: string, withYear = false): string {
  const [year, month, date] = key.split('-').map(Number);
  if (!year || !month || !date || month < 1 || month > 12) return key || '—';
  return `${MONTHS[month - 1]} ${date}${withYear ? `, ${year}` : ''}`;
}

function argmax(values: number[]): number {
  let index = -1; let best = 0;
  for (let i = 0; i < values.length; i += 1) if (finite(values[i]) > best) { best = finite(values[i]); index = i; }
  return index;
}

function maxBy<T>(items: T[], pick: (item: T) => number): T | null {
  let best: T | null = null; let bestValue = 0;
  for (const item of items) { const value = finite(pick(item)); if (value > bestValue) { bestValue = value; best = item; } }
  return best;
}

type DayTokens = { date: string; tokens: number };

function runs(days: DayTokens[]): { end: string; length: number }[] {
  const out: { end: string; length: number }[] = [];
  let start = -1;
  for (let i = 0; i <= days.length; i += 1) {
    const active = i < days.length && days[i].tokens > 0;
    if (active && start < 0) start = i;
    if (!active && start >= 0) { out.push({ end: days[i - 1].date, length: i - start }); start = -1; }
  }
  return out;
}

const longestRun = (days: DayTokens[]) => runs(days).reduce((best, run) => (run.length > best.length ? run : best), { end: '', length: 0 });
/** Trailing run, allowing it to have ended yesterday (matches totals.streak). */
function currentRun(days: DayTokens[]): { end: string; length: number } {
  let cursor = days.length - 1;
  if (cursor >= 0 && days[cursor].tokens === 0) cursor -= 1;
  if (cursor < 0 || days[cursor].tokens === 0) return { end: '', length: 0 };
  const end = days[cursor].date; let length = 0;
  while (cursor >= 0 && days[cursor].tokens > 0) { length += 1; cursor -= 1; }
  return { end, length };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Nearest-rank percentile; empty input yields 0. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(clamp01(p) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

const optionalNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** Tokens per active hour, e.g. `71.2M/h`; an hourless range shows a dash. */
const burnLabel = (tokens: number, hours: number): string => (hours > 0 ? `${formatTokens(safeDivide(tokens, hours))}/h` : '—');

function mergedHours(intervals: { start: number; end: number }[]): number {
  const blocks = intervals
    .filter((interval) => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let current: { start: number; end: number } | null = null;
  for (const block of blocks) {
    if (current === null) { current = { ...block }; continue; }
    if (block.start <= current.end) { current.end = Math.max(current.end, block.end); continue; }
    total += current.end - current.start;
    current = { ...block };
  }
  if (current !== null) total += current.end - current.start;
  return total / 3_600_000;
}

/** Fallback for `totals.activeHours`: raw intervals capped at 8h, then unioned. */
function sessionHours(sessions: SessionStat[]): number {
  const cap = 8 * 3_600_000;
  return mergedHours(sessions.map((session) => {
    const start = Date.parse(session.startedAt);
    return { start, end: start + Math.min(cap, Math.max(0, finite(session.durationMs))) };
  }));
}

type SessionMsFields = { avg?: unknown; median?: unknown; p95?: unknown; longest?: unknown };

type Half = { tokens: number; input: number; output: number; reasoning: number; cacheRead: number; cost: number; sessions: number; activeDays: number };
function halfOf(days: DailyPoint[]): Half {
  const half: Half = { tokens: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cost: 0, sessions: 0, activeDays: 0 };
  for (const day of days) {
    half.tokens += finite(day.tokens); half.input += finite(day.input); half.output += finite(day.output);
    half.reasoning += finite(day.reasoning); half.cacheRead += finite(day.cacheRead);
    half.cost += finite(day.cost); half.sessions += finite(day.sessions);
    if (day.tokens > 0) half.activeDays += 1;
  }
  return half;
}
function optionalPrompts(data: StatsResponse): number | null {
  const value = (data.totals as { prompts?: unknown }).prompts;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
/**
 * The 365-day strip as complete Monday-started weeks. The window is
 * Monday-aligned by trimming its first partial week, and the tail is padded
 * only enough to complete the last week — never with a further empty column.
 */
export function contributionCells(days: CalendarDay[]): (CalendarDay | null)[] {
  const source = days.slice(-365);
  if (source.length === 0) return Array.from({ length: 364 }, () => null);
  const start = new Date(`${source[0].date}T00:00:00.000Z`);
  // `lead` is how far the first day sits past Monday; the rest of that partial
  // week is dropped so cell 0 is a real Monday.
  const lead = Number.isFinite(start.getTime()) ? (start.getUTCDay() + 6) % 7 : 0;
  const aligned = source.slice(lead === 0 ? 0 : 7 - lead);
  const cells: (CalendarDay | null)[] = [...aligned];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

const SHARE_WINDOW_LABEL: Record<Exclude<ShareWindow, 'today'>, string> = {
  week: 'LAST 7 DAYS',
  month: 'LAST 30 DAYS',
  quarter: 'LAST 90 DAYS',
  all: 'ALL TIME',
};

/**
 * The card's stat set follows the range width only. A custom window wide
 * enough for the all-time cells keeps them, but its footer stays
 * `CUSTOM · …`, so the card is never labelled ALL TIME for a hand-picked
 * window.
 */
function shareWindowOf(rangeDays: number): ShareWindow {
  if (rangeDays <= 1) return 'today';
  if (rangeDays <= 7) return 'week';
  if (rangeDays <= 30) return 'month';
  if (rangeDays <= 90) return 'quarter';
  return 'all';
}

type ShareStatInput = {
  window: ShareWindow; tokens: number; cost: number; sessions: number; messages: number;
  activeDays: number; longestStreak: number; hoursActive: number; cacheHitRate: number;
  peakHour: string; peakDayKey: string; peakDayTokens: number; topModel: string; topModelShare: number;
};

/**
 * Eight cells, 4×2, drawn from range-scoped figures only. `activeDays` and the
 * daily averages divide by the range's own active days, never the lifetime
 * count, so a Today view can never surface a lifetime number. `sharePng.ts`
 * renders this same array.
 */
function shareStatSet(input: ShareStatInput): ShareStat[] {
  const activeDays = Math.max(1, input.activeDays);
  const sessions = Math.max(1, input.sessions);
  const cells = {
    sessions: { id: 'sessions', label: 'SESSIONS', value: formatNumber(input.sessions) },
    activeDays: { id: 'active-days', label: 'ACTIVE DAYS', value: formatNumber(input.activeDays) },
    hoursActive: { id: 'hours-active', label: 'HOURS ACTIVE', value: input.hoursActive.toFixed(1) },
    tokensPerDay: { id: 'tokens-per-day', label: 'TOKENS / DAY', value: formatTokens(safeDivide(input.tokens, activeDays)) },
    costPerDay: { id: 'cost-per-day', label: 'COST / DAY', value: formatUsd(safeDivide(input.cost, activeDays)) },
    peakHour: { id: 'peak-hour', label: 'PEAK HOUR', value: input.peakHour },
    topModel: {
      id: 'top-model',
      label: 'TOP MODEL',
      value: input.topModelShare > 0 ? formatPercent(input.topModelShare, 1) : '—',
    },
    cacheHit: { id: 'cache-hit', label: 'CACHE HIT', value: formatPercent(input.cacheHitRate, 1) },
  };
  if (input.window === 'today') {
    return [
      cells.sessions,
      { id: 'messages', label: 'MESSAGES', value: formatNumber(input.messages) },
      cells.hoursActive,
      cells.peakHour,
      cells.topModel,
      cells.cacheHit,
      { id: 'tokens-per-session', label: 'TOKENS / SESSION', value: formatTokens(safeDivide(input.tokens, sessions)) },
      { id: 'burn-per-hour', label: 'BURN / HOUR', value: burnLabel(input.tokens, input.hoursActive) },
    ];
  }
  if (input.window === 'all') {
    return [
      cells.activeDays,
      { id: 'longest-streak', label: 'LONGEST STREAK', value: `${formatNumber(input.longestStreak)}d` },
      cells.sessions,
      cells.hoursActive,
      {
        id: 'peak-day',
        label: input.peakDayKey ? `PEAK DAY · ${fmtDay(input.peakDayKey).toUpperCase()}` : 'PEAK DAY',
        value: input.peakDayTokens > 0 ? formatTokens(input.peakDayTokens) : '—',
      },
      cells.tokensPerDay,
      cells.costPerDay,
      cells.cacheHit,
    ];
  }
  return [cells.sessions, cells.activeDays, cells.hoursActive, cells.tokensPerDay, cells.costPerDay, cells.peakHour, cells.topModel, cells.cacheHit];
}

export function computeFlex(data: StatsResponse): FlexResult {
  const totals = data.totals;
  const tokens = totals.tokens;
  const daily = data.daily ?? [];
  const hourly = data.hourly ?? [];
  const calendar = data.calendar ?? [];
  const sessions = data.sessions ?? [];
  const cardLabel = (data.rateCards ?? []).find((card) => card.id === data.card)?.label ?? String(data.card);
  const models: FlexModel[] = [...(data.models ?? [])].sort((a, b) => finite(b.tokens.total) - finite(a.tokens.total))
    .map((model: ModelStat) => ({
      key: `${model.provider}/${model.model}/${model.variant}`, provider: model.provider, model: model.model, variant: model.variant,
      tokens: finite(model.tokens.total), share: clamp01(model.share), cost: finite(model.cost), rate: model.rate,
    }));
  const projects: ProjectStat[] = [...(data.projects ?? [])].sort((a, b) => finite(b.share) - finite(a.share));
  const activeDays = finite(totals.activeDays), sessionCount = finite(totals.sessions);
  const messages = finite(totals.messages), totalTokens = finite(tokens.total), cost = finite(totals.cost);
  const meteredCost = finite(totals.costByCard?.metered);
  const cacheHitRate = clamp01(totals.cacheHitRate);
  const reasoningShare = clamp01(safeDivide(tokens.reasoning, tokens.output + tokens.reasoning));
  const per = (value: number, divisor: number) => safeDivide(value, divisor);
  const costPer1M = per(cost, totalTokens) * 1e6;
  const cacheSavings = (data.models ?? []).reduce((saved, model) => {
    const discount = Math.max(0, finite(model.rate.input) - finite(model.rate.cacheRead));
    return saved + (finite(model.tokens.cacheRead) * discount) / 1e6;
  }, 0);
  const hourTokens = Array.from({ length: 24 }, () => 0), dowTokens = Array.from({ length: 7 }, () => 0);
  for (const point of hourly as HourlyPoint[]) {
    const value = finite(point.tokens);
    if (point.hour >= 0 && point.hour < 24) hourTokens[point.hour] += value;
    if (point.dow >= 0 && point.dow < 7) dowTokens[point.dow] += value;
  }
  const hourlyTotal = sum(hourTokens);
  const peakHour = argmax(hourTokens);
  const peakDow = argmax(dowTokens);
  const nightShare = clamp01(per(sum(hourTokens.slice(22)) + sum(hourTokens.slice(0, 6)), hourlyTotal));
  const weekendShare = clamp01(per(dowTokens[0] + dowTokens[6], sum(dowTokens)));
  const composition: CompositionSlice[] = [
    { id: 'input', label: 'Input', tokens: finite(tokens.input), share: 0 },
    { id: 'output', label: 'Output', tokens: finite(tokens.output), share: 0 },
    { id: 'reasoning', label: 'Reasoning', tokens: finite(tokens.reasoning), share: 0 },
    { id: 'cacheRead', label: 'Cache read', tokens: finite(tokens.cacheRead), share: 0 },
  ];
  const compositionTotal = sum(composition.map((slice) => slice.tokens));
  composition.forEach((slice) => { slice.share = clamp01(per(slice.tokens, compositionTotal)); });
  const grouped = new Map<string, number>();
  for (const model of models) grouped.set(modelName(model), (grouped.get(modelName(model)) ?? 0) + model.tokens);
  const groupedModels = [...grouped.entries()].map(([label, tokens]) => ({ label, tokens, share: clamp01(per(tokens, totalTokens)) })).sort((a, b) => b.tokens - a.tokens);
  const modelBars: ModelShareBar[] = groupedModels.slice(0, 6).map((model) => ({ key: model.label, ...model, other: false }));
  if (groupedModels.length > 6) {
    const restTokens = sum(groupedModels.slice(6).map((model) => model.tokens));
    modelBars.push({ key: 'other', label: 'other', tokens: restTokens, share: clamp01(per(restTokens, totalTokens)), other: true });
  }
  const distributions: Distributions = {
    composition: { slices: composition, total: compositionTotal },
    weekday: WEEK_ORDER.map((dow, index) => ({ dow, label: WEEK_SHORT[index], tokens: finite(dowTokens[dow]) })),
    hours: hourTokens.map((value, hour) => ({ hour, tokens: value, peak: hour === peakHour })),
    models: modelBars,
  };
  const runDays: CalendarDay[] = calendar.length > 0 ? calendar : daily.map((day) => ({ date: day.date, tokens: day.tokens, cost: day.cost, level: 0 as const }));
  const longest = longestRun(runDays);
  const current = currentRun(runDays);
  const longestStreak = runDays.length > 0 ? longest.length : finite(totals.streak);
  const currentStreak = runDays.length > 0 ? current.length : finite(totals.streak);
  const busiestDay = maxBy(daily, (day) => day.tokens), activeDaily = daily.filter((day) => day.tokens > 0);
  const priciestDay = maxBy(activeDaily, (day) => day.cost) ?? activeDaily[0] ?? null;
  const biggestSession = maxBy(sessions, (session: SessionStat) => session.tokens);
  const longestSession = maxBy(sessions, (session: SessionStat) => session.durationMs);
  const topModel = models[0] ?? null;
  const topProject = projects[0] ?? null;
  const topModelName = topModel ? modelName(topModel) : '';
  const topProjectName = topProject?.name ?? '';
  const records: RecordCell[] = [
    { id: 'total-tokens', label: 'Total tokens', value: formatTokens(totalTokens), sublabel: formatNumber(totalTokens) },
    { id: 'total-cost', label: 'Total cost', value: formatUsd(cost), sublabel: `${cardLabel.toLowerCase()} rates` },
    { id: 'longest-streak', label: 'Longest streak', value: daysLabel(longestStreak), sublabel: longest.end ? `ended ${fmtDay(longest.end)}` : 'no active days' },
    { id: 'current-streak', label: 'Current streak', value: daysLabel(currentStreak), sublabel: current.end ? `through ${fmtDay(current.end)}` : 'no active days' },
    { id: 'busiest-day', label: 'Busiest day', value: busiestDay ? formatTokens(busiestDay.tokens) : '—', sublabel: busiestDay ? fmtDay(busiestDay.date) : 'no activity in range' },
    { id: 'priciest-day', label: 'Most expensive day', value: priciestDay ? formatUsd(priciestDay.cost) : '—', sublabel: priciestDay ? fmtDay(priciestDay.date) : 'no activity in range' },
    { id: 'biggest-session', label: 'Biggest session', value: biggestSession ? formatTokens(biggestSession.tokens) : '—', sublabel: biggestSession ? truncate(biggestSession.title, 40) : 'no sessions in range' },
    { id: 'longest-session', label: 'Longest session', value: longestSession ? formatDuration(longestSession.durationMs) : '—', sublabel: longestSession ? truncate(longestSession.title, 40) : 'no sessions in range', note: longestSession && longestSession.durationMs > 8 * 3_600_000 ? 'wall-clock · idle-inclusive' : undefined },
    { id: 'peak-hour', label: 'Peak hour', value: peakHour >= 0 ? hourRange(peakHour) : '—', sublabel: peakHour >= 0 ? `${formatPercent(per(hourTokens[peakHour], hourlyTotal), 1)} of tokens` : 'no activity in range' },
    { id: 'busiest-weekday', label: 'Busiest weekday', value: peakDow >= 0 ? WEEKDAYS[peakDow] : '—', sublabel: peakDow >= 0 ? `${formatPercent(per(dowTokens[peakDow], sum(dowTokens)), 1)} of tokens` : 'no activity in range' },
    { id: 'top-model', label: 'Top model', value: topModel ? formatPercent(topModel.share, 1) : '—', sublabel: topModel ? truncate(topModelName, 40) : 'no models in range' },
    { id: 'top-project', label: 'Top project', value: topProject ? formatPercent(topProject.share, 1) : '—', sublabel: topProject ? truncate(topProjectName, 40) : 'no projects in range' },
  ];
  const firstActivity = daily.find((day) => day.tokens > 0)?.date ?? '';
  const lastActivity = [...daily].reverse().find((day) => day.tokens > 0)?.date ?? '';
  const daysSpanned = Math.max(1, finite(data.range.days) || daily.length || 1);
  const facts: Fact[] = [
    { id: 'first', label: 'First activity', value: firstActivity ? fmtDay(firstActivity, true) : '—' },
    { id: 'last', label: 'Last activity', value: lastActivity ? fmtDay(lastActivity, true) : '—' },
    { id: 'spanned', label: 'Days spanned', value: formatNumber(daysSpanned) },
    { id: 'average', label: 'Avg / active day', value: formatTokens(per(totalTokens, activeDays)) },
  ];
  const durations = sessions.map((session) => finite(session.durationMs));
  const avgSession = per(sum(durations), durations.length);
  const medianSession = median(durations);
  const longestSessionMs = durations.reduce((best, value) => Math.max(best, value), 0);
  const sessionMs = (totals as { sessionMs?: SessionMsFields }).sessionMs;
  const avgSessionMs = optionalNumber(sessionMs?.avg) ?? avgSession;
  const medianSessionMs = optionalNumber(sessionMs?.median) ?? medianSession;
  const p95SessionMs = optionalNumber(sessionMs?.p95) ?? percentile(durations, 0.95);
  const longestSessionRaw = optionalNumber(sessionMs?.longest) ?? longestSessionMs;
  // `totals.activeHours` is range-scoped and covers every session; the top-300
  // `data.sessions` merge is only a fallback for an absent or zero field.
  const activeHoursTotal = optionalNumber((totals as { activeHours?: unknown }).activeHours) ?? 0;
  const hoursActive = activeHoursTotal > 0 ? activeHoursTotal : sessionHours(sessions);
  const providerCount = new Set(models.map((model) => model.provider)).size;
  const modelShares = models.map((model) => model.share);
  const top3Models = sum([...modelShares].sort((a, b) => b - a).slice(0, 3));
  const diversity = clamp01(1 - sum(modelShares.map((share) => share * share)));
  const top3Projects = sum([...projects.map((project) => clamp01(project.share))].sort((a, b) => b - a).slice(0, 3));
  const prompts = optionalPrompts(data);
  const badges: Badge[] = [
    { id: 'billion', name: 'Billion Token Club', detail: `${formatTokens(totalTokens)} / 1B`, earned: totalTokens >= 1e9 },
    { id: 'ten-billion', name: 'Ten Billion Club', detail: `${formatTokens(totalTokens)} / 10B`, earned: totalTokens >= 1e10 },
    { id: 'cache-whisperer', name: 'Cache Whisperer', detail: `${formatPercent(cacheHitRate, 1)} / 90%`, earned: cacheHitRate >= 0.9 },
    { id: 'marathoner', name: 'Marathoner', detail: `${formatDuration(longestSessionRaw)} / 4h`, earned: longestSessionRaw >= 4 * 3_600_000 },
    { id: 'night-owl', name: 'Night Owl', detail: `${formatPercent(nightShare, 0)} / 30%`, earned: nightShare >= 0.3 },
    { id: 'weekend-warrior', name: 'Weekend Warrior', detail: `${formatPercent(weekendShare, 0)} / 25%`, earned: weekendShare >= 0.25 },
    { id: 'polyglot', name: 'Polyglot', detail: `${formatNumber(models.length)} / 10 models`, earned: models.length >= 10 },
    { id: 'project-hopper', name: 'Project Hopper', detail: `${formatNumber(projects.length)} / 20 projects`, earned: projects.length >= 20 },
    { id: 'streak-keeper', name: 'Streak Keeper', detail: `${formatNumber(longestStreak)} / 14 days`, earned: longestStreak >= 14 },
    { id: 'century', name: 'Century Club', detail: `${formatNumber(activeDays)} / 100 days`, earned: activeDays >= 100 },
    { id: 'deep-diver', name: 'Deep Diver', detail: `${formatDuration(avgSessionMs)} / 30m`, earned: avgSessionMs >= 30 * 60_000 },
    { id: 'reasoner', name: 'Reasoner', detail: `${formatPercent(reasoningShare, 0)} / 25%`, earned: reasoningShare >= 0.25 },
  ];
  const midpoint = Math.floor(daily.length / 2);
  const before = midpoint > 0 ? halfOf(daily.slice(0, midpoint)) : null;
  const after = midpoint > 0 ? halfOf(daily.slice(midpoint)) : null;
  const delta = (pick: (half: Half) => number): number | undefined => {
    if (!before || !after) return undefined;
    const prior = finite(pick(before));
    return prior === 0 ? undefined : finite((finite(pick(after)) - prior) / Math.abs(prior));
  };
  const perActive = (half: Half) => per(half.tokens, half.activeDays);
  const perSession = (half: Half) => per(half.cost, half.sessions);
  const tokensPerSession = (half: Half) => per(half.tokens, half.sessions);
  const costPerMillion = (half: Half) => per(half.cost, half.tokens) * 1e6;
  const reasoningHalf = (half: Half) => per(half.reasoning, half.output + half.reasoning);
  type Spec = [string, string, string, number?, string?];
  const specs: Spec[] = [
    ['tokens', 'Total tokens', formatNumber(totalTokens), delta((half) => half.tokens)],
    ['input', 'Input', formatNumber(tokens.input), delta((half) => half.input)],
    ['output', 'Output', formatNumber(tokens.output), delta((half) => half.output)],
    ['reasoning', 'Reasoning', formatNumber(tokens.reasoning), delta((half) => half.reasoning)],
    ['cache-read', 'Cache read', formatNumber(tokens.cacheRead), delta((half) => half.cacheRead)],
    ['cache-write', 'Cache write', formatNumber(tokens.cacheWrite)],
    ['cache-hit', 'Cache hit %', formatPercent(cacheHitRate, 1), delta((half) => per(half.cacheRead, half.input + half.cacheRead))],
    ['reasoning-share', 'Reasoning share', formatPercent(reasoningShare, 1), delta(reasoningHalf)],
    ['cache-savings', 'Cache savings', formatUsd(cacheSavings)],
    ['cost', 'Cost', formatUsd(cost), delta((half) => half.cost)],
    ['cost-per-m', 'Cost / 1M tokens', formatUsd(costPer1M), delta(costPerMillion)],
    ['cost-per-session', 'Cost / session', formatUsd(per(cost, sessionCount)), delta(perSession)],
    ['cost-per-day', 'Cost / active day', formatUsd(per(cost, activeDays)), delta((half) => per(half.cost, half.activeDays))],
    ['cost-per-message', 'Cost / message', formatUsd(per(cost, messages))],
    ['tokens-per-session', 'Tokens / session', formatTokens(per(totalTokens, sessionCount)), delta(tokensPerSession)],
    ['tokens-per-message', 'Tokens / message', formatTokens(per(totalTokens, messages))],
    ['tokens-per-day', 'Tokens / active day', formatTokens(per(totalTokens, activeDays)), delta(perActive)],
    ['messages', 'Messages', formatNumber(messages)],
    ['sessions', 'Sessions', formatNumber(sessionCount), delta((half) => half.sessions)],
    ['subagents', 'Subagents', formatNumber(totals.subagents)],
    ['subagent-ratio', 'Subagent ratio', formatPercent(per(totals.subagents, sessionCount), 1)],
    ['active-days', 'Active days', formatNumber(activeDays), delta((half) => half.activeDays)],
    ['days-spanned', 'Days spanned', formatNumber(daysSpanned)],
    ['hours-active', 'Hours active', `${hoursActive.toFixed(1)} h`],
    ['sessions-per-day', 'Sessions / active day', per(sessionCount, activeDays).toFixed(1), delta((half) => per(half.sessions, half.activeDays))],
    ['avg-session', 'Average session', formatDuration(avgSessionMs)],
    ['median-session', 'Median session', formatDuration(medianSessionMs)],
    ['p95-session', 'P95 session', formatDuration(p95SessionMs)],
    ['longest-session', 'Longest session', formatDuration(longestSessionRaw)],
    ['models', 'Distinct models', formatNumber(models.length)],
    ['providers', 'Distinct providers', formatNumber(providerCount)],
    ['top3-models', 'Top-3 model share', formatPercent(top3Models, 1)],
    ['diversity', 'Model diversity', formatPercent(diversity, 1)],
    ['projects', 'Projects', formatNumber(projects.length)],
    ['top3-projects', 'Top-3 project share', formatPercent(top3Projects, 1)],
    ['peak-hour', 'Peak hour', peakHour >= 0 ? hourRange(peakHour) : '—'],
    ['peak-weekday', 'Peak weekday', peakDow >= 0 ? WEEKDAYS[peakDow] : '—'],
    ['night-share', 'Night share', formatPercent(nightShare, 1)],
    ['weekend-share', 'Weekend share', formatPercent(weekendShare, 1)],
    ['activity-span', 'First / last activity', `${firstActivity ? fmtDay(firstActivity) : '—'} → ${lastActivity ? fmtDay(lastActivity) : '—'}`],
  ];
  const ledger: LedgerRow[] = specs.map(([id, label, value, rowDelta, note]) => ({ id, label, value, delta: rowDelta, note }));
  const rangeFrom = daily[0]?.date ?? isoDay(data.range.from);
  const rangeTo = daily[daily.length - 1]?.date ?? isoDay(data.range.to);
  // The strip dims the days outside the range, exactly like the Activity
  // calendar, so the bounds are the same local `YYYY-MM-DD` pair it compares
  // against; an unparseable timestamp falls back to the daily-derived keys.
  const fromMs = Date.parse(data.range.from);
  const toMs = Date.parse(data.range.to);
  const shareFrom = Number.isFinite(fromMs) ? localDayKey(fromMs) : rangeFrom;
  const shareTo = Number.isFinite(toMs) ? localDayKey(toMs) : rangeTo;
  const rangeDays = Math.max(1, finite(data.range.days) || daily.length || 1);
  const window = shareWindowOf(rangeDays);
  const year = Number(rangeTo.slice(0, 4)) || Number(isoDay(data.generatedAt).slice(0, 4));
  // The strip is the year-in-review element and stays the full 365-day
  // calendar even while the stats above it are range-scoped.
  const seriesCalendar = (data as { series?: { calendar?: CalendarDay[] } }).series?.calendar;
  const stripCalendar = seriesCalendar && seriesCalendar.length > 0 ? seriesCalendar : calendar;
  // Every share figure below is range-scoped: `data.daily` is the selected
  // range, zero-filled, and `data.hourly` only holds range buckets.
  const rangeActiveDays = daily.reduce((count, day) => count + (finite(day.tokens) > 0 ? 1 : 0), 0);
  const rangeLongestStreak = longestRun(daily).length;
  const rangePeak = maxBy(daily, (day) => day.tokens);
  const sharePeakKey = rangePeak?.date ?? '';
  const sharePeakTokens = finite(rangePeak ? rangePeak.tokens : 0);
  const shareModel = maxBy(models, (model) => model.share);
  const shareModelName = shareModel ? modelName(shareModel) : '';
  const shareModelShort = truncate((shareModelName.split('/').pop() || shareModelName).toUpperCase(), 18);
  const monthDay = (key: string): string => (key ? fmtDay(key).toUpperCase() : '—');
  const footer = data.range.key === 'custom'
    ? `CUSTOM · ${formatWindow(data.range.from, data.range.to)}`
    : window === 'today'
      ? `TODAY · ${monthDay(rangeTo)}`
      : `${SHARE_WINDOW_LABEL[window]} · ${monthDay(rangeFrom)} – ${monthDay(rangeTo)}`;
  const share: ShareSnapshot = {
    year, tokenTotal: totalTokens,
    tokensLabel: formatTokens(totalTokens), costLabel: formatUsd(cost), cardLabel: cardLabel.toLowerCase(), card: data.card,
    sessions: sessionCount, activeDays: rangeActiveDays, longestStreak: rangeLongestStreak, topModel: shareModelName,
    topModelShare: shareModel ? clamp01(shareModel.share) : 0, topProject: topProjectName,
    topProjectShare: topProject ? clamp01(topProject.share) : 0, cacheRead: finite(tokens.cacheRead),
    cacheReadLabel: formatTokens(finite(tokens.cacheRead)), cacheHitRate, prompts, messages,
    hoursActive, peakDayTokens: sharePeakTokens, peakDayKey: sharePeakKey,
    tokensPerActiveDay: safeDivide(totalTokens, Math.max(1, rangeActiveDays)),
    costPerActiveDay: safeDivide(cost, Math.max(1, rangeActiveDays)),
    computedCost: meteredCost,
    days: stripCalendar, rangeFrom: shareFrom, rangeTo: shareTo, window, rangeDays, footer,
    stats: shareStatSet({
      window, tokens: totalTokens, cost, sessions: sessionCount, messages,
      activeDays: rangeActiveDays, longestStreak: rangeLongestStreak, hoursActive,
      cacheHitRate, peakHour: peakHour >= 0 ? hourRange(peakHour) : '—',
      peakDayKey: sharePeakKey, peakDayTokens: sharePeakTokens,
      topModel: shareModelShort, topModelShare: shareModel ? clamp01(shareModel.share) : 0,
    }),
    topProjectEntry: topProject ? { name: topProjectName, share: clamp01(topProject.share) } : null,
    topModelEntry: topModel ? { name: topModelName, share: clamp01(topModel.share) } : null,
    providerCount: (data.providers ?? []).length,
  };
  const shareText = [
    `opencode — ${share.footer}`,
    `${share.tokensLabel} tokens · ${share.costLabel} (${share.cardLabel})`,
    `${formatNumber(sessionCount)} sessions · ${formatNumber(messages)} messages · ${hoursActive.toFixed(1)}h active${window === 'today' ? ` · ${burnLabel(totalTokens, hoursActive)} burn` : ''}`,
    `top model: ${share.topModel || '—'} (${formatPercent(share.topModelShare, 1)}) · cache hit ${formatPercent(cacheHitRate, 1)}`,
    `top project: ${share.topProject || '—'} (${formatPercent(share.topProjectShare, 1)})`,
  ].join('\n');
  return { records, facts, distributions, achievements: badges, ledger, shareText, share };
}
