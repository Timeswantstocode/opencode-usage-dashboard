'use client';

import { useMemo } from 'react';
import type { HourlyPoint } from '@/lib/types';
import { formatNumber, formatPercent, formatTokens } from '@/lib/format';
import s from './WeekdayChart.module.css';

/** 0 = Sunday, matching `HourlyPoint.dow`. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 7 bars: tokens by local day of week for the selected range, summed over every hour. */
export function WeekdayChart({ hourly, label }: { hourly: HourlyPoint[]; label: string }) {
  const { sums, total, busiest, busiestShare } = useMemo(() => {
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    for (const point of hourly) {
      if (point.dow >= 0 && point.dow < 7) byDay[point.dow] += point.tokens;
    }
    const sum = byDay.reduce((acc, value) => acc + value, 0);
    let top = ORDER[0];
    for (const dow of ORDER) if (byDay[dow] > byDay[top]) top = dow;
    return { sums: byDay, total: sum, busiest: top, busiestShare: sum > 0 ? byDay[top] / sum : 0 };
  }, [hourly]);

  const hasData = total > 0;
  const max = sums[busiest];

  return (
    <section className={s.panel} aria-labelledby="weekday-title">
      <header className={s.head}>
        <h2 className={s.title} id="weekday-title">By weekday</h2>
        <p className={s.meta}>Local time · {label}</p>
        {hasData ? (
          <p className={s.summary}>Busiest {FULL[busiest]} · {formatPercent(busiestShare)}</p>
        ) : null}
      </header>

      <div className={s.body}>
        {!hasData ? (
          <p className={s.empty}>No weekday activity.</p>
        ) : (
          <div
            className={s.rows}
            role="img"
            aria-label={`Tokens by weekday. Busiest ${FULL[busiest]} with ${formatNumber(
              sums[busiest],
            )} tokens, ${formatPercent(busiestShare)} of all tokens.`}
          >
            {ORDER.map((dow) => (
              <div
                className={s.row}
                key={dow}
                tabIndex={0}
                data-tip={`${FULL[dow]}\n${formatNumber(sums[dow])} tokens · ${formatPercent(
                  total > 0 ? sums[dow] / total : 0,
                )} of total`}
              >
                <span className={s.day}>{SHORT[dow]}</span>
                <span className={s.track}>
                  {sums[dow] > 0 ? (
                    <span
                      className={dow === busiest ? `${s.bar} ${s.peak}` : s.bar}
                      style={{ width: `${(sums[dow] / max) * 100}%` }}
                    />
                  ) : null}
                </span>
                <span className={s.value} aria-hidden="true">{formatTokens(sums[dow])}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
