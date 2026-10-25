'use client';

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { HourlyPoint } from '@/lib/types';
import { formatNumber, formatTokens, formatUsd } from '@/lib/format';
import s from './HourHeatmap.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function quantile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Local-time week by hour, 7 rows x 24 columns. */
export function HourHeatmap({ hourly }: { hourly: HourlyPoint[] }) {
  const [active, setActive] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  const { rows, thresholds, hasData } = useMemo(() => {
    const grid = ROW_ORDER.map((dow) =>
      HOURS.map((hour) => ({ dow, hour, tokens: 0, cost: 0 })),
    );
    for (const point of hourly) {
      const row = ROW_ORDER.indexOf(point.dow);
      if (row >= 0 && point.hour >= 0 && point.hour < 24) {
        grid[row][point.hour] = point;
      }
    }
    const values = hourly
      .filter((point) => point.tokens > 0)
      .map((point) => point.tokens)
      .sort((a, b) => a - b);
    return {
      rows: grid,
      thresholds:
        values.length > 0
          ? ([quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75)] as const)
          : null,
      hasData: grid.some((row) => row.some((point) => point.tokens > 0 || point.cost > 0)),
    };
  }, [hourly]);

  function level(tokens: number): number {
    if (tokens <= 0 || !thresholds) return 0;
    if (tokens <= thresholds[0]) return 1;
    if (tokens <= thresholds[1]) return 2;
    if (tokens <= thresholds[2]) return 3;
    return 4;
  }

  function focusHour(index: number) {
    const next = Math.max(0, Math.min(167, index));
    setActive(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-hour="${next}"]`)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const row = Math.floor(active / 24);
    const hour = active % 24;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        next = row * 24 + ((hour + 1) % 24);
        break;
      case 'ArrowLeft':
        next = row * 24 + ((hour + 23) % 24);
        break;
      case 'ArrowDown':
        next = ((row + 1) % 7) * 24 + hour;
        break;
      case 'ArrowUp':
        next = ((row + 6) % 7) * 24 + hour;
        break;
      case 'Home':
        next = row * 24;
        break;
      case 'End':
        next = row * 24 + 23;
        break;
      default:
        return;
    }
    event.preventDefault();
    focusHour(next);
  }

  return (
    <section className={s.panel} aria-labelledby="hour-title">
      <header className={s.head}>
        <div>
          <h2 className={s.title} id="hour-title">
            By hour
          </h2>
          <p className={s.meta}>Local time · 168 hours</p>
        </div>
      </header>

      <div className={s.body}>
        {!hasData ? (
          <p className={s.empty}>No hourly activity.</p>
        ) : (
          <div className={s.frame}>
            <div className={s.hourAxis} aria-hidden="true">
              {HOURS.filter((hour) => hour % 3 === 0).map((hour) => (
                <span key={hour} style={{ gridColumn: hour + 1 }}>
                  {String(hour).padStart(2, '0')}
                </span>
              ))}
            </div>
            <div
              className={s.grid}
              ref={gridRef}
              role="group"
              aria-label="Activity by hour of week. Use the arrow keys to move between hours."
              onKeyDown={handleKeyDown}
            >
              {rows.map((row, rowIndex) => (
                <div className={s.row} key={ROW_ORDER[rowIndex]}>
                  <span className={s.dayLabel} aria-hidden="true">
                    {DAYS[ROW_ORDER[rowIndex]]}
                  </span>
                  <div className={s.cells}>
                    {row.map((point, hour) => {
                      const index = rowIndex * 24 + hour;
                      const alignment =
                        hour < 3 ? s.tipLeft : hour > 20 ? s.tipRight : '';
                      return (
                        <button
                          key={hour}
                          type="button"
                          data-hour={index}
                          tabIndex={index === active ? 0 : -1}
                          className={`${s.cell} ${rowIndex <= 1 ? s.below : ''}`}
                          style={{ background: `var(--h${level(point.tokens)})` }}
                          aria-label={`${DAYS[point.dow]} ${hourLabel(hour)}, ${formatNumber(
                            point.tokens,
                          )} tokens, ${formatUsd(point.cost)}`}
                          onFocus={() => setActive(index)}
                        >
                          <span className={`${s.tip} ${alignment}`} aria-hidden="true">
                            {DAYS[point.dow]} {hourLabel(hour)} · {formatTokens(point.tokens)} tokens ·{' '}
                            {formatUsd(point.cost)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
