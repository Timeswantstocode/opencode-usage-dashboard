'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { formatTokens, formatUsd } from '@/lib/format';
import { cumulativeSeries, liveDaily } from '@/lib/trends';
import type { StatsResponse } from '@/lib/types';
import s from './CumulativeChart.module.css';

const HEIGHT = 300;
const PAD = { top: 16, right: 58, bottom: 30, left: 54 };

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

function usdTick(value: number): string {
  if (value === 0) return '$0';
  if (value >= 10) return `$${value.toFixed(0)}`;
  if (value >= 1) return `$${value.toFixed(1)}`;
  return `$${value.toFixed(2)}`;
}

/** "1 day" / "N days", for the panel subtitle and chart label. */
function dayCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`;
}

/** Cumulative tokens (area, left axis) and cost (line, right axis). */
export function CumulativeChart({ data }: { data: StatsResponse }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const measure = (): void => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const series = cumulativeSeries(liveDaily(data));
  const count = series.length;
  const singleDay = data.daily.length <= 1 ? series.at(-1) : undefined;
  const last = series.at(-1);
  const totalTokens = last?.tokens ?? 0;
  const totalCost = last?.cost ?? 0;
  const hasData = count >= 2 && (totalTokens > 0 || totalCost > 0);
  const maxTokens = niceMax(totalTokens);
  const maxCost = niceMax(totalCost);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const baseY = PAD.top + innerH;
  const xOf = (index: number): number => PAD.left + (count <= 1 ? 0 : (index / (count - 1)) * innerW);
  const yToken = (value: number): number => baseY - (value / maxTokens) * innerH;
  const yCost = (value: number): number => baseY - (value / maxCost) * innerH;

  const tokenLine = hasData
    ? series.map((point, index) => `${index === 0 ? 'M' : 'L'}${xOf(index).toFixed(2)},${yToken(point.tokens).toFixed(2)}`).join(' ')
    : '';
  const area = hasData ? `${tokenLine} L${xOf(count - 1).toFixed(2)},${baseY} L${PAD.left},${baseY} Z` : '';
  const costLine = hasData
    ? series.map((point, index) => `${index === 0 ? 'M' : 'L'}${xOf(index).toFixed(2)},${yCost(point.cost).toFixed(2)}`).join(' ')
    : '';

  const monthTicks: { key: string; x: number; label: string }[] = [];
  if (count > 0) {
    let lastKey = '';
    let lastX = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < count; index += 1) {
      const point = series[index];
      if (!point) continue;
      const key = point.date.slice(0, 7);
      if (key === lastKey) continue;
      lastKey = key;
      const x = xOf(index);
      // Skip a partial leading month when its next boundary would crowd the label.
      if (monthTicks.length === 0 && point.date.slice(8, 10) !== '01') {
        let next = index;
        while (next < count && series[next]?.date.slice(0, 7) === key) next += 1;
        if (next < count && xOf(next) - x < 54) continue;
      }
      if (x - lastX < 54) continue;
      const month = monthFormat.format(parseDay(point.date)).toUpperCase();
      const label = monthTicks.length === 0 || key.endsWith('-01') ? `${month} ’${point.date.slice(2, 4)}` : month;
      monthTicks.push({ key, x, label });
      lastX = x;
    }
  }
  const shownMonths =
    monthTicks.length > 9 ? monthTicks.filter((_, index) => index % 2 === 0 || index === monthTicks.length - 1) : monthTicks;

  const activePoint = active !== null ? series[active] : undefined;
  const activeX = active !== null ? xOf(active) : 0;
  const tipLeft = Math.min(Math.max(activeX + 14, 8), Math.max(8, width - 212));

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>): void {
    if (count === 0) return;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = (active ?? count) - 1;
    else if (event.key === 'ArrowRight') next = (active ?? -1) + 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = count - 1;
    else if (event.key === 'Escape') {
      setActive(null);
      return;
    } else return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(count - 1, next)));
  }

  return (
    <section className={s.panel} aria-labelledby="trends-cumulative-title">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>02 · cumulative</p>
          <h2 className={s.title} id="trends-cumulative-title">
            The running total
          </h2>
          <p className={s.meta}>{dayCountLabel(count)} · tokens left · cost right</p>
        </div>
        {singleDay ? null : (
          <ul className={s.legend}>
            <li className={s.legendItem}>
              <i className={s.tokenSwatch} aria-hidden="true" />
              Tokens
            </li>
            <li className={s.legendItem}>
              <i className={s.costSwatch} aria-hidden="true" />
              Cost
            </li>
          </ul>
        )}
      </header>

      <div className={s.canvas}>
        <div className={s.plot} ref={plotRef}>
          {count < 2 ? (
            singleDay ? (
              <div className={s.single}>
                <div className={s.singleTop}>
                  <p className={s.singleDate}>{dayFormat.format(parseDay(singleDay.date))}</p>
                  <p className={s.singleState}>day complete</p>
                </div>

                <div className={s.singleFigures}>
                  <div className={s.singleFigure}>
                    <span className={s.singleLabel}>tokens</span>
                    <span className={s.singleTokens}>{formatTokens(singleDay.tokens)}</span>
                  </div>
                  <div className={`${s.singleFigure} ${s.singleFigureCost}`}>
                    <span className={s.singleLabel}>cost</span>
                    <span className={s.singleCost}>{formatUsd(singleDay.cost)}</span>
                  </div>
                </div>

                <div
                  className={s.progress}
                  role="img"
                  aria-label={`Day complete: 100% of ${formatTokens(singleDay.tokens)} tokens and ${formatUsd(singleDay.cost)}.`}
                >
                  <span className={s.progressTrack} aria-hidden="true">
                    <span className={s.progressFill} />
                  </span>
                  <span className={s.progressScale} aria-hidden="true">
                    <span>0%</span>
                    <span>100%</span>
                  </span>
                </div>

                <p className={s.singleNote}>
                  A cumulative curve needs at least two days. Showing today’s total instead.
                </p>
              </div>
            ) : (
              <p className={s.empty}>A cumulative curve needs at least two days of history.</p>
            )
          ) : !hasData ? (
            <p className={s.empty}>No token or cost activity in this range.</p>
          ) : width > 0 ? (
            <>
              <svg
                className={s.chart}
                width={width}
                height={HEIGHT}
                viewBox={`0 0 ${width} ${HEIGHT}`}
                role="img"
                tabIndex={0}
                aria-label={`Cumulative ${formatTokens(totalTokens)} tokens and ${formatUsd(totalCost)} over ${dayCountLabel(count)}. Use the arrow keys to inspect a day.`}
                onPointerMove={(event) => {
                  if (innerW <= 0) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratio = (event.clientX - rect.left - PAD.left) / innerW;
                  const next = Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
                  setActive((previous) => (previous === next ? previous : next));
                }}
                onPointerLeave={() => setActive(null)}
                onKeyDown={handleKeyDown}
              >
                {[0, 1, 2, 3, 4].map((tick) => {
                  const y = PAD.top + (innerH * tick) / 4;
                  return (
                    <g key={tick}>
                      <line x1={PAD.left} x2={PAD.left + innerW} y1={y} y2={y} className={s.gridLine} />
                      <text x={PAD.left - 10} y={y + 3} textAnchor="end" className={s.axis}>
                        {formatTokens(maxTokens * (1 - tick / 4))}
                      </text>
                      <text x={PAD.left + innerW + 10} y={y + 3} textAnchor="start" className={s.axis}>
                        {usdTick(maxCost * (1 - tick / 4))}
                      </text>
                    </g>
                  );
                })}

                <path d={area} className={s.area} />
                <path d={tokenLine} className={s.tokenLine} fill="none" />
                <path d={costLine} className={s.costLine} fill="none" />
                <line x1={PAD.left} x2={PAD.left + innerW} y1={baseY} y2={baseY} className={s.baseline} />

                {shownMonths.map((tick) => (
                  <text key={tick.key} x={tick.x} y={HEIGHT - 8} textAnchor="middle" className={s.axis}>
                    {tick.label}
                  </text>
                ))}

                {activePoint ? (
                  <g pointerEvents="none">
                    <line x1={activeX} x2={activeX} y1={PAD.top} y2={baseY} className={s.hoverRule} />
                    <circle cx={activeX} cy={yToken(activePoint.tokens)} r={3} className={s.tokenDot} />
                    <circle cx={activeX} cy={yCost(activePoint.cost)} r={3} className={s.costDot} />
                  </g>
                ) : null}
              </svg>

              {activePoint ? (
                <div className={s.tip} style={{ left: tipLeft }}>
                  <div className={s.tipDate}>{dayFormat.format(parseDay(activePoint.date))}</div>
                  <dl className={s.tipRows}>
                    <div className={s.tipRow}>
                      <dt>Cumulative tokens</dt>
                      <dd>{formatTokens(activePoint.tokens)}</dd>
                    </div>
                    <div className={s.tipRow}>
                      <dt>Cumulative cost</dt>
                      <dd>{formatUsd(activePoint.cost)}</dd>
                    </div>
                    <div className={`${s.tipRow} ${s.tipRowStrong}`}>
                      <dt>Day tokens</dt>
                      <dd>{formatTokens(activePoint.dayTokens)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
