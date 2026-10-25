/** Shared shapes for the dashboard API and the UI tabs that consume it. */

/** Token counts. Every field is an integer; `total` is the sum of all five. */
export type Tokens = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
};

export type RangeKey = 'all' | 'today' | '7d' | '30d' | '90d';

/** A preset range key, or `custom` when the request supplied `from`/`to`. */
export type StatsRangeKey = RangeKey | 'custom';

export type CardId = 'estimated' | 'metered';

/** USD per 1M tokens. */
export type Rate = {
  input: number;
  output: number;
  cacheRead: number;
};

export type RateCardMeta = {
  id: CardId;
  label: string;
  description: string;
};

export type StatsRange = {
  /**
   * Which range produced this window. Optional on the shared shape because the
   * extras payload builds its code window from a preset key alone; the stats
   * response always sets it.
   */
  key?: StatsRangeKey;
  /** ISO timestamp, inclusive. */
  from: string;
  /** ISO timestamp, inclusive. */
  to: string;
  /** Number of local days covered; always equals `daily.length`. */
  days: number;
};

export type DailyPoint = {
  /** Local day, `YYYY-MM-DD`. */
  date: string;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  tokens: number;
  cost: number;
  sessions: number;
};

export type HourlyPoint = {
  /** 0 = Sunday … 6 = Saturday (local time). */
  dow: number;
  hour: number;
  tokens: number;
  cost: number;
};

export type CalendarDay = {
  /** Local day, `YYYY-MM-DD`. */
  date: string;
  tokens: number;
  cost: number;
  /** 0 = no activity; 1-4 = quartile of the non-zero days. */
  level: 0 | 1 | 2 | 3 | 4;
};

export type ProjectStat = {
  /** Lowercased folder name, unique per project. */
  slug: string;
  /** Display name, most frequent original casing. */
  name: string;
  tokens: number;
  cost: number;
  sessions: number;
  messages: number;
  /** ISO timestamp of the newest message in the selection. */
  lastUsed: string;
  /** 0-1 share of the selection's tokens. */
  share: number;
};

export type ModelStat = {
  provider: string;
  model: string;
  variant: string;
  tokens: Tokens;
  cost: number;
  messages: number;
  /** 0-1 share of the selection's tokens. */
  share: number;
  /** Active card's rate for this model, after `pricing.local.json` overrides. */
  rate: Rate;
};

export type ProviderStat = {
  /** Lowercased `msg.provider` value. */
  provider: string;
  tokens: Tokens;
  messages: number;
  /** Distinct model ids used under this provider. */
  models: number;
  /** 0-1 share of the range's tokens across every provider. */
  share: number;
  /** Cost under the active card. */
  cost: number;
  /** Cost under the estimated card, whatever the active card is. */
  estimated: number;
  /** Cost under the metered card, whatever the active card is. */
  metered: number;
};

export type PricingInfo = {
  fallbackLabel: string;
  fallback: Rate;
  /** Number of per-model overrides loaded from `pricing.local.json`. */
  overrides: number;
  /** Absolute path of the pricing file, whether or not it exists. */
  path: string;
};

export type SessionStat = {
  id: string;
  title: string;
  /** Project slug. */
  project: string;
  agent: string;
  model: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  messages: number;
  tokens: number;
  cost: number;
  /** Parent session id when this session is a subagent. */
  parentId: string | null;
};

/** Session wall-clock durations, in milliseconds. */
export type SessionDurationStats = {
  /** Mean duration over every session in scope. */
  avg: number;
  /** Median duration (mean of the two middle values for an even count). */
  median: number;
  /** p95, nearest rank. */
  p95: number;
  /** Longest duration; days when a session was left open. */
  longest: number;
  /** Longest duration after the 8-hour idle cap. */
  longestCapped: number;
};

export type StatsTotals = {
  messages: number;
  sessions: number;
  /** Sessions with a parent, counted within the selection. */
  subagents: number;
  /** Distinct local days with messages in the selection. */
  activeDays: number;
  /** Consecutive active local days ending today or yesterday (whole history). */
  streak: number;
  tokens: Tokens;
  cost: number;
  /** Cost under both cards, whatever the active card is. */
  costByCard: { estimated: number; metered: number };
  /** cacheRead / (input + cacheRead + cacheWrite), 0-1. */
  cacheHitRate: number;
  /**
   * Merged, idle-capped hours inside the selected range. Every
   * `[sess.created, sess.updated]` interval is first clipped to `[range.from,
   * range.to]` and dropped when nothing is left; the clipped interval is then
   * clamped to 8 hours and overlapping or touching intervals are unioned.
   * A Today view therefore stays near a day, never the lifetime total. The
   * lifetime figure is `lifetime.activeHours`.
   */
  activeHours: number;
  /**
   * Conservative variant of `activeHours` over the same clipped intervals: the
   * 8-hour-capped intervals are unioned, then every merged block is clamped to
   * 8 hours. Present only when it differs.
   */
  activeHoursCapped?: number;
  /** Raw, uncapped durations of the range-clipped intervals, per session. */
  sessionMs: SessionDurationStats;
};

/**
 * Exact all-history summary for artifacts that must not move with the range
 * selector (the share card). Every figure ignores `range` completely: a Today
 * view and an All view report the same values. The `project` and `provider`
 * filters still apply, and `cost` uses the active card.
 */
export type LifetimeStats = {
  /** All history, under the active filters. */
  tokens: Tokens;
  /** All history under the active card, USD. */
  cost: number;
  /** Distinct sessions with at least one message, all history. */
  sessions: number;
  /** `msg` rows over all history. */
  messages: number;
  /** Distinct local days with at least one token-bearing message. */
  activeDays: number;
  /** Longest run of consecutive active local days over the full history. */
  longestStreak: number;
  /** `YYYY-MM-DD` of the last day of that run; null when nothing is active. */
  longestStreakEnd: string | null;
  /** Lifetime cacheRead / (input + cacheRead + cacheWrite), 0-1. */
  cacheHitRate: number;
  /** First active local day, `YYYY-MM-DD`; today when nothing is active. */
  firstDay: string;
  /** Last active local day, `YYYY-MM-DD`; today when nothing is active. */
  lastDay: string;
  /** Lifetime merged, idle-capped hours: same formula as `totals.activeHours`, never clipped by the range. */
  activeHours: number;
  /** Lifetime raw session durations: same fields as `totals.sessionMs`, never clipped by the range. */
  sessionMs: SessionDurationStats;
};

export type LiveStats = {
  /** Server clock at response build time, ISO. */
  asOf: string;
  /** Seconds since the newest message, or null when the selection has none. */
  lagSeconds: number | null;
  lastMessageAt: string | null;
  todayTokens: number;
  todayCost: number;
  /** Tokens per hour over the last 24 hours. */
  burnPerHour: number;
  /** Today's cost extrapolated to a 30-day month (USD). */
  projectedMonth: number;
};

/**
 * Chart series. They never look at `range`: a Today or 7d view still draws the
 * whole history, so the charts keep their shape. The project and provider
 * filters do apply. Costs use the active card.
 */
export type StatsSeries = {
  /** Every local day with history up to today, zero-filled, oldest to newest. */
  daily: DailyPoint[];
  /** 168 entries over all history, dow 0 = Sunday, ascending. */
  hourly: HourlyPoint[];
  /** Last 365 days over all history, oldest to newest. Same shape as `calendar`. */
  calendar: CalendarDay[];
};

export type StatsResponse = {
  generatedAt: string;
  range: StatsRange & { key: StatsRangeKey };
  card: CardId;
  totals: StatsTotals;
  /**
   * Range-independent lifetime summary, for the share card: it keeps the same
   * tokens, cost, sessions, days and streak whatever the selector says.
   */
  lifetime: LifetimeStats;
  /** One row per provider over the range and project, ignoring the provider filter. */
  providers: ProviderStat[];
  pricing: PricingInfo;
  /** Continuous, zero-filled, oldest to newest. */
  daily: DailyPoint[];
  /** 168 entries, dow 0 = Sunday. */
  hourly: HourlyPoint[];
  /** Last 365 days, oldest to newest, range-independent. */
  calendar: CalendarDay[];
  /** Charts read these instead of `daily` / `hourly` / `calendar`. */
  series: StatsSeries;
  projects: ProjectStat[];
  models: ModelStat[];
  /** Top 300 sessions by tokens in the selection. */
  sessions: SessionStat[];
  rateCards: RateCardMeta[];
  live: LiveStats;
};
