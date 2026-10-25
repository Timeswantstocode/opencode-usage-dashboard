'use client';

import { useState } from 'react';
import { formatNumber, formatTokens, formatUsd } from '@/lib/format';
import { deltaText, deltaTone, liveDaily } from '@/lib/trends';
import type { StatsResponse } from '@/lib/types';
import { calendarRows, defaultMode } from './calendarPeriods';
import type { CalendarMode } from './calendarPeriods';
import s from './WeeklyMonthlyTable.module.css';

const MODES: ReadonlyArray<{ mode: CalendarMode; label: string }> = [
  { mode: 'day', label: 'Day' },
  { mode: 'week', label: 'Week' },
  { mode: 'month', label: 'Month' },
];

const UNIT: Record<CalendarMode, string> = { day: 'day', week: 'week', month: 'month' };

const CAPTION: Record<CalendarMode, string> = {
  day: 'calendar day',
  week: 'Monday-start week',
  month: 'calendar month',
};

/** Day / week / month rollups, with deltas against the previous period. */
export function WeeklyMonthlyTable({ data }: { data: StatsResponse }) {
  const rangeKey =
    data.range.key === 'custom'
      ? `custom:${data.range.from}:${data.range.to}`
      : `${data.range.key ?? 'preset'}:${data.range.days}`;
  // The range picks the mode; a manual pick lasts until the range changes.
  const [picked, setPicked] = useState<{ range: string; mode: CalendarMode } | null>(null);
  const mode: CalendarMode = picked?.range === rangeKey ? picked.mode : defaultMode(data.range.days);

  const days = liveDaily(data);
  const rows = calendarRows(days, mode, data.series?.daily ?? days);
  const total = rows.reduce(
    (sum, row) => ({
      tokens: sum.tokens + row.tokens,
      cost: sum.cost + row.cost,
      sessions: sum.sessions + row.sessions,
      activeDays: sum.activeDays + row.activeDays,
      days: sum.days + row.days,
    }),
    { tokens: 0, cost: 0, sessions: 0, activeDays: 0, days: 0 },
  );
  const avg = total.days > 0 ? total.tokens / total.days : 0;

  return (
    <section className={s.panel} aria-labelledby="trends-rollup-title">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>04 · calendar periods</p>
          <h2 className={s.title} id="trends-rollup-title">
            Days, weeks and months
          </h2>
          <p className={s.note}>Δ compares tokens with the previous {UNIT[mode]}.</p>
        </div>
        <div className={s.toggle} role="group" aria-label="Rollup period">
          {MODES.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={mode === option.mode ? `${s.tab} ${s.tabOn}` : s.tab}
              aria-pressed={mode === option.mode}
              onClick={() => setPicked({ range: rangeKey, mode: option.mode })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className={s.empty}>No daily history in this range.</p>
      ) : (
        <div className={s.scroll}>
          <table className={s.table}>
            <caption className="sr-only">Tokens, cost and sessions by {CAPTION[mode]}.</caption>
            <thead>
              <tr>
                <th scope="col">{mode === 'day' ? 'Date' : 'Period'}</th>
                <th scope="col" className={s.right}>Tokens</th>
                <th scope="col" className={s.right}>Cost</th>
                <th scope="col" className={s.right}>Sessions</th>
                {mode === 'day' ? null : <th scope="col" className={s.right}>Active days</th>}
                <th scope="col" className={s.right}>Avg tokens/day</th>
                <th scope="col" className={s.right}>Δ vs prev</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className={s.period}>
                    {row.label}
                  </th>
                  <td className={s.right}>{formatTokens(row.tokens)}</td>
                  <td className={s.right}>{formatUsd(row.cost)}</td>
                  <td className={s.right}>{formatNumber(row.sessions)}</td>
                  {mode === 'day' ? null : (
                    <td className={s.right}>{formatNumber(row.activeDays)}</td>
                  )}
                  <td className={s.right}>{formatTokens(row.avgTokens)}</td>
                  <td className={s.right}>
                    {row.change ? (
                      <span className={`${s.change} ${s[deltaTone(row.change)]}`}>
                        {deltaText(row.change)}
                      </span>
                    ) : (
                      <span className={s.dim}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className={s.period}>
                  Total · {rows.length} {UNIT[mode]}
                  {rows.length === 1 ? '' : 's'}
                </th>
                <td className={s.right}>{formatTokens(total.tokens)}</td>
                <td className={s.right}>{formatUsd(total.cost)}</td>
                <td className={s.right}>{formatNumber(total.sessions)}</td>
                {mode === 'day' ? null : (
                  <td className={s.right}>{formatNumber(total.activeDays)}</td>
                )}
                <td className={s.right}>{formatTokens(avg)}</td>
                <td className={s.right}>
                  <span className={s.dim}>—</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
