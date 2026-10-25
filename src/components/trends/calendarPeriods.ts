/**
 * Calendar rollups for the Trends "calendar periods" table.
 * Days, Monday-start weeks and calendar months overlap the selected range, so
 * even a one-day range gets a row. Every delta reads the full daily series, so
 * the first displayed period still compares against the period before it.
 */

import { formatDay } from '@/lib/format';
import type { DailyPoint } from '@/lib/types';

export type CalendarMode = 'day' | 'week' | 'month';

export type PeriodRow = {
  key: string;
  /** First and last local day the range covers in this period. */
  start: string;
  end: string;
  label: string;
  tokens: number;
  cost: number;
  sessions: number;
  days: number;
  activeDays: number;
  avgTokens: number;
  /** Token change against the same-shaped previous period; null when it is missing. */
  change: { current: number; previous: number; ratio: number } | null;
};

const DAY_MS = 86_400_000;
const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Days for a fortnight, weeks up to four months, months beyond that. */
export function defaultMode(days: number): CalendarMode {
  if (!Number.isFinite(days) || days <= 14) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

const dayMs = (day: string): number => Date.parse(`${day}T00:00:00.000Z`);
const dayFromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function addDays(day: string, count: number): string {
  return dayFromMs(dayMs(day) + count * DAY_MS);
}

/** Shift a day by whole calendar months, clamped to the shorter month. */
function addMonths(day: string, count: number): string {
  const date = new Date(dayMs(day));
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)),
  )
    .toISOString()
    .slice(0, 10);
}

function monthEnd(month: string): string {
  const first = new Date(dayMs(`${month}-01`));
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

function mondayOf(day: string): string {
  const ms = dayMs(day);
  return dayFromMs(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS);
}

/** The same-shaped window one day, week or month earlier. */
function previousWindow(start: string, end: string, mode: CalendarMode): { start: string; end: string } {
  if (mode === 'day') return { start: addDays(start, -1), end: addDays(end, -1) };
  if (mode === 'week') return { start: addDays(start, -7), end: addDays(end, -7) };
  return { start: addMonths(start, -1), end: addMonths(end, -1) };
}

/** Tokens over `[start, end]`; null when the series does not cover the whole window. */
function sumWindow(index: ReadonlyMap<string, DailyPoint>, start: string, end: string): number | null {
  let total = 0;
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const point = index.get(day);
    if (!point) return null;
    total += point.tokens;
  }
  return total;
}

/** A whole month keeps its name; partial periods name the days they cover. */
function labelFor(key: string, start: string, end: string, mode: CalendarMode): string {
  if (mode === 'month' && start === `${key}-01` && end === monthEnd(key)) {
    return MONTH_FORMAT.format(new Date(`${key}-01T00:00:00.000Z`));
  }
  return start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;
}

/**
 * Roll `days` (the selected range) into one row per day, Monday-start week or
 * calendar month. Periods overlapping a range edge keep only the covered days
 * and compare against the same-shaped window in `history`.
 */
export function calendarRows(
  days: readonly DailyPoint[],
  mode: CalendarMode,
  history: readonly DailyPoint[],
): PeriodRow[] {
  const index = new Map(history.map((day) => [day.date, day]));
  const groups = new Map<string, DailyPoint[]>();
  for (const day of days) {
    const key = mode === 'day' ? day.date : mode === 'week' ? mondayOf(day.date) : day.date.slice(0, 7);
    const list = groups.get(key);
    if (list) list.push(day);
    else groups.set(key, [day]);
  }

  const rows: PeriodRow[] = [];
  for (const [key, list] of groups) {
    const start = list[0]?.date ?? key;
    const end = list.at(-1)?.date ?? start;
    let tokens = 0;
    let cost = 0;
    let sessions = 0;
    let activeDays = 0;
    for (const day of list) {
      tokens += day.tokens;
      cost += day.cost;
      sessions += day.sessions;
      if (day.tokens > 0) activeDays += 1;
    }

    const prior = previousWindow(start, end, mode);
    const previous = sumWindow(index, prior.start, prior.end);
    rows.push({
      key,
      start,
      end,
      label: labelFor(key, start, end, mode),
      tokens,
      cost,
      sessions,
      days: list.length,
      activeDays,
      avgTokens: list.length > 0 ? tokens / list.length : 0,
      change:
        previous !== null && previous > 0
          ? { current: tokens, previous, ratio: (tokens - previous) / previous }
          : null,
    });
  }
  return rows;
}
