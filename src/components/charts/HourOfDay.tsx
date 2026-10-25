'use client';

import { useMemo } from 'react';
import type { HourlyPoint } from '@/lib/types';
import { formatNumber, formatPercent, formatTokens } from '@/lib/format';
import s from './HourOfDay.module.css';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function hourRange(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
}

/** 24 bars: tokens by local hour of day for the selected range, summed over every weekday. */
export function HourOfDay({ hourly, label }: { hourly: HourlyPoint[]; label: string }) {
  const { sums, total, peak, peakShare } = useMemo(() => {
    const byHour = HOURS.map(() => 0);
    for (const point of hourly) {
      if (point.hour >= 0 && point.hour < 24) byHour[point.hour] += point.tokens;
    }
    const sum = byHour.reduce((acc, value) => acc + value, 0);
    let busiest = 0;
    for (const hour of HOURS) if (byHour[hour] > byHour[busiest]) busiest = hour;
    return { sums: byHour, total: sum, peak: busiest, peakShare: sum > 0 ? byHour[busiest] / sum : 0 };
  }, [hourly]);

  const hasData = total > 0;
  const max = sums[peak];

  return (
    <section className={s.panel} aria-labelledby="hour-of-day-title">
      <header className={s.head}>
        <h2 className={s.title} id="hour-of-day-title">By hour of day</h2>
        <p className={s.meta}>Local time · {label}</p>
        {hasData ? (
          <p className={s.summary}>Peak {hourLabel(peak)} · {formatPercent(peakShare)} of tokens</p>
        ) : null}
      </header>

      <div className={s.body}>
        {!hasData ? (
          <p className={s.empty}>No hourly activity.</p>
        ) : (
          <>
            <div
              className={s.chart}
              role="img"
              aria-label={`Tokens by hour of day. Peak ${hourLabel(peak)} with ${formatNumber(
                sums[peak],
              )} tokens, ${formatPercent(peakShare)} of all tokens.`}
            >
              {HOURS.map((hour) => {
                const isPeak = hour === peak;
                // The single label is wider than one column; at the first and
                // last hours it would clip on the panel edge, so it hangs
                // inward from the column instead of centring on it.
                const edge = !isPeak ? '' : peak < 3 ? s.peakStart : peak >= 21 ? s.peakEnd : '';
                return (
                  <div
                    className={edge ? `${s.col} ${edge}` : s.col}
                    key={hour}
                    tabIndex={0}
                    data-tip={`${hourRange(hour)}\n${formatNumber(sums[hour])} tokens · ${formatPercent(
                      total > 0 ? sums[hour] / total : 0,
                    )} of total`}
                  >
                    <span
                      className={isPeak ? `${s.value} ${s.valuePeak}` : s.value}
                      aria-hidden="true"
                    >
                      {isPeak ? formatTokens(sums[hour]) : ''}
                    </span>
                    <span className={s.track}>
                      {sums[hour] > 0 ? (
                        <span
                          className={isPeak ? `${s.bar} ${s.peak}` : s.bar}
                          style={{ height: `${(sums[hour] / max) * 100}%` }}
                        />
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className={s.axis} aria-hidden="true">
              {HOURS.filter((hour) => hour % 3 === 0).map((hour) => (
                <span key={hour} style={{ gridColumn: hour + 1 }}>
                  {String(hour).padStart(2, '0')}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
