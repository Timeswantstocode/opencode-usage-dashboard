import { formatDay } from './format';
import { localDayKey } from './time';
import type { StatsResponse } from './types';

/** `OCT 1 – OCT 10` from a window's ISO bounds: local days, uppercase like the labels. */
export function formatWindow(from: string, to: string): string {
  const start = formatDay(localDayKey(Date.parse(from))).toUpperCase();
  const end = formatDay(localDayKey(Date.parse(to))).toUpperCase();
  return start === end ? start : `${start} – ${end}`;
}

/**
 * Human label for the selected range. A request-supplied `from`/`to` pair is
 * `custom` and is named by its own local days; otherwise the length of
 * `range.days` picks the bucket, and a range that starts on the first charted
 * day is all-time however many days that happens to be.
 */
export function rangeLabel(data: StatsResponse): string {
  const { range } = data;
  if (range.key === 'custom') return `CUSTOM · ${formatWindow(range.from, range.to)}`;
  if (range.days <= 1) return 'TODAY';
  const firstDay = data.series?.daily?.[0]?.date;
  if (firstDay && localDayKey(Date.parse(range.from)) === firstDay) return 'ALL TIME';
  if (range.days <= 7) return 'LAST 7 DAYS';
  if (range.days <= 30) return 'LAST 30 DAYS';
  if (range.days <= 90) return 'LAST 90 DAYS';
  return 'ALL TIME';
}
