/**
 * Formatting helpers shared by every tab.
 * All date formatting is pinned to UTC so server and client markup agree.
 */

const compact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** 1234 -> "1.23k", 9_929_475_039 -> "9.93B". */
export function formatTokens(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${compact.format(value / 1e9)}B`;
  if (abs >= 1e6) return `${compact.format(value / 1e6)}M`;
  if (abs >= 1e3) return `${compact.format(value / 1e3)}k`;
  return integer.format(value);
}

/** Full precision with thousands separators. */
export function formatNumber(value: number): string {
  return integer.format(Math.round(value));
}

/** Small costs keep their precision: $0.000042, $0.0123, $1.23, $123.45. */
export function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (Math.abs(value) < 0.01) return `$${value.toFixed(4)}`;
  if (Math.abs(value) < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/** Exact card amount, 6 decimals. */
export function formatUsdExact(value: number): string {
  return `$${value.toFixed(6)}`;
}

/** 0.4213 -> "42.1%". */
export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** "2026-06-27" -> "Jun 27". */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    Date.UTC(year, month - 1, date),
  );
}

/** ISO timestamp -> "Jun 27, 14:03 UTC". */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** Milliseconds -> "2h 14m", "14m 03s", "42s". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(rest).padStart(2, '0')}s`;
  return `${rest}s`;
}

/** "3m ago", "2h ago", "4d ago". */
export function formatAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
