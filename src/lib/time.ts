/**
 * Local time helpers.
 *
 * Every timestamp in the cache is UTC epoch milliseconds; these helpers only
 * decide which local bucket a timestamp lands in, never rewrite the timestamp
 * itself.
 *
 * The zone is a fixed UTC offset: `TZ_OFFSET_MINUTES` when set (integer minutes
 * east of UTC), otherwise the machine's current offset. A fixed offset is
 * cheap on the aggregation hot path, but it ignores daylight-saving changes —
 * a zone that shifts during the year can be an hour off for part of it. Set
 * the variable explicitly when an exact zone matters.
 *
 * `TZ_LABEL` names the zone in display strings (e.g. `CET`); it defaults to
 * `LOCAL`.
 */

function detectOffsetMinutes(): number {
  const raw = process.env.TZ_OFFSET_MINUTES?.trim();
  if (raw) {
    const configured = Number(raw);
    if (Number.isInteger(configured)) return configured;
  }
  return -new Date().getTimezoneOffset();
}

export const TZ_OFFSET_MINUTES = detectOffsetMinutes();
export const TZ_OFFSET_MS = TZ_OFFSET_MINUTES * 60_000;
export const TZ_LABEL = process.env.TZ_LABEL?.trim() || 'LOCAL';
export const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of the local calendar day that contains `ms`. */
export function localDayKey(ms: number): string {
  return new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** Local day index: `floor((ms + offset) / DAY)`. Buckets are keyed by this. */
export function localDayIndex(ms: number): number {
  return Math.floor((ms + TZ_OFFSET_MS) / DAY_MS);
}

/** Local day index -> `YYYY-MM-DD`, for rollup labels. */
export function localDayKeyFromIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

/** UTC epoch ms of local midnight for a `YYYY-MM-DD` key. */
export function localDayStartUtcMs(dayKey: string): number {
  return Date.parse(`${dayKey}T00:00:00.000Z`) - TZ_OFFSET_MS;
}

/** Local hour of day, 0-23. */
export function localHour(ms: number): number {
  return new Date(ms + TZ_OFFSET_MS).getUTCHours();
}

/** Local day of week, 0 = Sunday … 6 = Saturday. */
export function localDow(ms: number): number {
  return new Date(ms + TZ_OFFSET_MS).getUTCDay();
}

/** `2026-10-24 14:03 LOCAL` — unambiguous local display. */
export function formatLocal(ms: number): string {
  const shifted = new Date(ms + TZ_OFFSET_MS).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)} ${TZ_LABEL}`;
}
