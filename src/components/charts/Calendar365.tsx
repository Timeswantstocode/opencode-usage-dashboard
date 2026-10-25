'use client';

import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CalendarDay, DailyPoint } from '@/lib/types';
import { formatNumber, formatTokens, formatUsd } from '@/lib/format';
import { localDayKey } from '@/lib/time';
import s from './Calendar365.module.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

type Cell = { day: CalendarDay | null; index: number };

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function quantile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

/** GitHub-style 53 x 7 activity calendar, recolorable by tokens or cost. */
export function Calendar365({
  days,
  daily,
  range,
}: {
  days: CalendarDay[];
  daily: DailyPoint[];
  /** Selected window as ISO timestamps; days outside it with usage are dimmed. */
  range?: { from: string; to: string };
}) {
  const [metric, setMetric] = useState<'tokens' | 'cost'>('tokens');
  const [active, setActive] = useState(Math.max(0, days.length - 1));
  const gridRef = useRef<HTMLDivElement>(null);

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of daily) map.set(day.date, day.sessions);
    return map;
  }, [daily]);

  const thresholds = useMemo(() => {
    if (metric !== 'cost') return null;
    const costs = days
      .filter((day) => day.cost > 0)
      .map((day) => day.cost)
      .sort((a, b) => a - b);
    if (costs.length === 0) return null;
    return [quantile(costs, 0.25), quantile(costs, 0.5), quantile(costs, 0.75)] as const;
  }, [days, metric]);

  const weeks = useMemo(() => {
    if (days.length === 0) return [];
    const lead = parseDay(days[0].date).getUTCDay();
    const flat: Cell[] = [];
    for (let index = 0; index < lead; index += 1) flat.push({ day: null, index: -1 });
    days.forEach((day, index) => flat.push({ day, index }));
    while (flat.length % 7 !== 0) flat.push({ day: null, index: -1 });
    const grid: Cell[][] = [];
    for (let index = 0; index < flat.length; index += 7) {
      grid.push(flat.slice(index, index + 7));
    }
    return grid;
  }, [days]);

  const monthTicks = useMemo(() => {
    const ticks: { week: number; label: string; key: string; span: number }[] = [];
    let previous = '';
    weeks.forEach((week, weekIndex) => {
      const first = week.find((cell) => cell.day !== null)?.day;
      if (!first) return;
      const key = first.date.slice(0, 7);
      if (key === previous) return;
      previous = key;
      ticks.push({ week: weekIndex, label: MONTHS[Number(key.slice(5, 7)) - 1], key, span: 1 });
    });
    // Each label owns the weeks between it and the next month change, so it
    // starts on its first week's column and stays on that track at any width.
    ticks.forEach((tick, index) => {
      const next = ticks[index + 1];
      tick.span = (next ? next.week : weeks.length) - tick.week;
    });
    return ticks;
  }, [weeks]);

  const activity = useMemo(() => {
    let activeDays = 0;
    let run = 0;
    let best = 0;
    let busiest: CalendarDay | null = null;
    for (const day of days) {
      if (day.tokens > 0 || day.cost > 0) {
        activeDays += 1;
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
      if (!busiest || day.tokens > busiest.tokens) busiest = day;
    }
    return { activeDays, best, busiest };
  }, [days]);

  const hasData = activity.activeDays > 0;

  // The grid's `date` keys and these bounds are both local `YYYY-MM-DD`, so a
  // plain string compare decides whether a day sits inside the selected
  // window. The calendar keeps all 365 cells either way.
  const fromDay = range ? localDayKey(Date.parse(range.from)) : '';
  const toDay = range ? localDayKey(Date.parse(range.to)) : '';

  function level(day: CalendarDay): number {
    if (metric === 'tokens') return day.level;
    if (day.cost <= 0 || !thresholds) return 0;
    if (day.cost <= thresholds[0]) return 1;
    if (day.cost <= thresholds[1]) return 2;
    if (day.cost <= thresholds[2]) return 3;
    return 4;
  }

  function focusDay(index: number) {
    const next = Math.max(0, Math.min(days.length - 1, index));
    setActive(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (days.length === 0) return;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
        next = active + 7;
        break;
      case 'ArrowLeft':
        next = active - 7;
        break;
      case 'ArrowDown':
        next = active + 1;
        break;
      case 'ArrowUp':
        next = active - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = days.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    focusDay(next);
  }

  return (
    <section className={s.panel} aria-labelledby="calendar-title">
      <header className={s.head}>
        <div>
          <h2 className={s.title} id="calendar-title">
            Activity
          </h2>
          <p className={s.meta}>
            365 days · year view · {formatNumber(activity.activeDays)} active
          </p>
        </div>
        {hasData ? (
          <div className={s.toggle} role="group" aria-label="Color the calendar by">
            <button
              type="button"
              aria-pressed={metric === 'tokens'}
              onClick={() => setMetric('tokens')}
            >
              Tokens
            </button>
            <button
              type="button"
              aria-pressed={metric === 'cost'}
              onClick={() => setMetric('cost')}
            >
              Cost
            </button>
          </div>
        ) : null}
      </header>

      <div className={s.body}>
        {!hasData ? (
          <p className={s.empty}>No activity recorded yet.</p>
        ) : (
          <>
            <div className={s.frame}>
              <div className={s.dayLabels} aria-hidden="true">
                {DAY_LABELS.map((label, index) => (
                  <span key={index}>{label}</span>
                ))}
              </div>
              <div className={s.main}>
                <div className={s.months} aria-hidden="true">
                  {monthTicks.map((tick) => (
                    <span
                      key={tick.key}
                      style={{ gridColumn: `${tick.week + 1} / span ${tick.span}` }}
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>
                <div
                  className={s.grid}
                  ref={gridRef}
                  role="group"
                  aria-label="Daily activity calendar. Use the arrow keys to move between days."
                  onKeyDown={handleKeyDown}
                >
                  {weeks.map((week, weekIndex) => (
                    <div className={s.week} key={weekIndex}>
                      {week.map((cell, dayIndex) => {
                        if (!cell.day) {
                          return (
                            <span
                              className={s.blank}
                              key={`blank-${weekIndex}-${dayIndex}`}
                              aria-hidden="true"
                            />
                          );
                        }
                        const day = cell.day;
                        const sessions = sessionsByDay.get(day.date);
                        const inRange = !range || (day.date >= fromDay && day.date <= toDay);
                        // Only days that actually have usage recede: a level-0
                        // cell is only a couple of RGB points from the panel,
                        // so dimming it would erase the grid. Usage comes from
                        // the raw day, not the colour level, because the Cost
                        // metric maps a used day with no cost to level 0.
                        const hasUsage = day.tokens > 0 || day.cost > 0;
                        const dimmed = !inRange && hasUsage;
                        return (
                          <button
                            key={day.date}
                            type="button"
                            data-day={cell.index}
                            tabIndex={cell.index === active ? 0 : -1}
                            className={`${s.cell} ${dayIndex <= 1 ? s.below : ''} ${
                              dimmed ? s.outOfRange : ''
                            }`}
                            style={{
                              background:
                                level(day) > 0 ? `var(--h${level(day)})` : 'var(--cell-empty)',
                            }}
                            aria-label={`${dayFormat.format(parseDay(day.date))}: ${formatNumber(
                              day.tokens,
                            )} tokens, ${formatUsd(day.cost)}`}
                            onFocus={() => setActive(cell.index)}
                          >
                            <span
                              className={`${s.tip} ${
                                weekIndex < 2
                                  ? s.tipLeft
                                  : weekIndex >= weeks.length - 2
                                    ? s.tipRight
                                    : ''
                              }`}
                              aria-hidden="true"
                            >
                              <span className={s.tipDate}>{dateFormat.format(parseDay(day.date))}</span>
                              <span className={s.tipValue}>{formatTokens(day.tokens)} tokens</span>
                              <span className={s.tipValue}>{formatUsd(day.cost)}</span>
                              {sessions !== undefined ? (
                                <span className={s.tipMeta}>
                                  {formatNumber(sessions)} session{sessions === 1 ? '' : 's'}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={s.legend} aria-hidden="true">
              <span>{metric === 'cost' ? 'Fewer $' : 'Fewer tokens'}</span>
              {[0, 1, 2, 3, 4].map((step) => (
                <i
                  key={step}
                  className={s.legendCell}
                  style={{ background: step === 0 ? 'var(--cell-empty)' : `var(--h${step})` }}
                />
              ))}
              <span>{metric === 'cost' ? 'More $' : 'More tokens'}</span>
            </div>

            <p className={s.summary}>
              {formatNumber(activity.activeDays)} active · {activity.best}-day best streak · busiest{' '}
              <span className={s.summaryDate}>
                {activity.busiest ? dateFormat.format(parseDay(activity.busiest.date)) : ''}
              </span>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
