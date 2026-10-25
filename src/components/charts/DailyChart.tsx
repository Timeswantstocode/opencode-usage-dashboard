'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { DailyPoint } from '@/lib/types';
import { formatNumber, formatTokens } from '@/lib/format';
import s from './DailyChart.module.css';

const HEIGHT = 300;
const PAD = { top: 16, right: 58, bottom: 28, left: 54 };
const TIP_W = 216;
const STACK = [
  { key: 'cacheRead', label: 'Cache read', color: 'var(--line-strong)' },
  { key: 'input', label: 'Input', color: 'var(--blue)' },
  { key: 'output', label: 'Output', color: 'var(--accent-2)' },
  { key: 'reasoning', label: 'Reasoning', color: 'var(--yellow)' },
] as const;
const LEGEND = [
  ...STACK.map((series) => ({ label: series.label, color: series.color, line: false })),
  { label: 'Total tokens', color: 'var(--ivory)', line: true },
  { label: 'Cost', color: 'var(--accent)', line: true },
];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function niceMax(value: number): number {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

function usdTick(value: number): string {
  if (value >= 10) return `$${Math.round(value)}`;
  if (value >= 1) return `$${value.toFixed(1).replace(/\.0$/, '')}`;
  return value === 0 ? '$0' : `$${value.toFixed(2)}`;
}

/** Stacked daily tokens, a total-tokens line and a cost line on the right axis. */
export function DailyChart({ daily }: { daily: DailyPoint[] }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // `data.daily`: zero-filled and already clipped by the global range selector.
  const stats = useMemo(() => {
    let tokens = 0, cost = 0, stack = 0, total = 0, peakCost = 0;
    for (const day of daily) {
      tokens += day.tokens;
      cost += day.cost;
      stack = Math.max(stack, day.input + day.output + day.reasoning + day.cacheRead);
      total = Math.max(total, day.tokens);
      peakCost = Math.max(peakCost, day.cost);
    }
    return { tokens, cost, stack, total, peakCost };
  }, [daily]);

  const count = daily.length;
  const hasData = stats.total > 0 || stats.peakCost > 0;
  const yMax = niceMax(Math.max(stats.stack, stats.total));
  const cMax = niceMax(stats.peakCost);

  const geo = useMemo(() => {
    const innerW = Math.max(0, width - PAD.left - PAD.right);
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const step = count > 0 ? innerW / count : 0;
    // One day fills the plot: Today renders a single full-width bar.
    const barW = count === 1 ? innerW : Math.max(1, Math.min(48, step * 0.72));
    return { innerW, innerH, step, barW, baseY: PAD.top + innerH };
  }, [count, width]);

  const bars = useMemo(() => {
    if (!hasData || geo.step <= 0) return null;
    return daily.map((day, index) => {
      const x = PAD.left + index * geo.step + (geo.step - geo.barW) / 2;
      let y = geo.baseY;
      return (
        <g key={day.date}>
          {STACK.map((series) => {
            const value = day[series.key];
            if (value <= 0) return null;
            const height = Math.max(0.5, (value / yMax) * geo.innerH);
            y -= height;
            return <rect key={series.key} x={x} y={y} width={geo.barW} height={height} fill={series.color} />;
          })}
        </g>
      );
    });
  }, [geo, hasData, daily, yMax]);

  const lines = useMemo(() => {
    if (!hasData || geo.step <= 0) return null;
    const x = (index: number) => PAD.left + (index + 0.5) * geo.step;
    const total = daily.map((day, i) => [x(i), geo.baseY - (day.tokens / yMax) * geo.innerH] as const);
    const cost = cMax > 0
      ? daily.map((day, i) => [x(i), geo.baseY - (day.cost / cMax) * geo.innerH] as const)
      : null;
    return {
      total: total.map(([px, py]) => `${px},${py}`).join(' '),
      cost: cost ? cost.map(([px, py]) => `${px},${py}`).join(' ') : null,
      totalPoint: total[0] ?? null,
      costPoint: cost?.[0] ?? null,
    };
  }, [cMax, geo, hasData, daily, yMax]);

  const months = useMemo(() => {
    if (geo.step <= 0) return [];
    const ticks: { x: number; label: string; key: string }[] = [];
    let lastKey = '';
    let lastX = -100;
    for (let index = 0; index < daily.length; index += 1) {
      const day = daily[index];
      const key = day.date.slice(0, 7);
      if (key === lastKey) continue;
      lastKey = key;
      const x = PAD.left + (index + 0.5) * geo.step;
      if (x - lastX < 48) continue;
      const month = monthFormat.format(parseDay(day.date)).toUpperCase();
      ticks.push({ x, key, label: ticks.length === 0 || key.endsWith('-01') ? `${month} ${day.date.slice(2, 4)}` : month });
      lastX = x;
    }
    return ticks;
  }, [geo.step, daily]);

  const activeDay = active !== null ? (daily[active] ?? null) : null;
  const activeX = active !== null ? PAD.left + (active + 0.5) * geo.step : 0;
  const activeTotalY = activeDay ? geo.baseY - (activeDay.tokens / yMax) * geo.innerH : 0;
  const activeCostY = activeDay && cMax > 0 ? geo.baseY - (activeDay.cost / cMax) * geo.innerH : 0;
  const tipLeft = Math.min(Math.max(activeX + 14, 8), Math.max(8, width - TIP_W - 8));
  const tipRows = activeDay
    ? [
        { label: 'Total tokens', value: formatNumber(activeDay.tokens), strong: true },
        { label: 'Input', value: formatNumber(activeDay.input) },
        { label: 'Output', value: formatNumber(activeDay.output) },
        { label: 'Reasoning', value: formatNumber(activeDay.reasoning) },
        { label: 'Cache read', value: formatNumber(activeDay.cacheRead) },
        { label: 'Cost', value: usd.format(activeDay.cost), strong: true },
      ]
    : [];

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
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
    <section className={s.panel} aria-labelledby="daily-title">
      <header className={s.head}>
        <div className={s.headTop}>
          <div>
            <h2 className={s.title} id="daily-title">Daily usage</h2>
            <p className={s.summary}>
              {formatNumber(count)} {count === 1 ? 'day' : 'days'} · {formatTokens(stats.tokens)} tokens · {usd.format(stats.cost)}
            </p>
            <p className={s.meta}>Bars = tokens · line = cost</p>
          </div>
        </div>
        {hasData ? (
          <ul className={s.legend}>
            {LEGEND.map((item) => (
              <li className={s.legendItem} key={item.label}>
                <i className={item.line ? s.lineSwatch : s.swatch} style={{ background: item.color }} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className={s.canvas}>
        <div className={s.plot} ref={plotRef}>
          {!hasData ? (
            <p className={s.empty}>No usage in this window.</p>
          ) : width > 0 ? (
            <>
              <svg
                className={s.chart}
                width={width}
                height={HEIGHT}
                viewBox={`0 0 ${width} ${HEIGHT}`}
                role="img"
                tabIndex={0}
                aria-label={`Daily token usage across ${count} ${count === 1 ? 'day' : 'days'}. Bars are tokens, the ivory line is total tokens, the accent line is cost. Use the arrow keys to inspect a day.`}
                onPointerMove={(event) => {
                  if (geo.step <= 0) return;
                  const x = event.clientX - event.currentTarget.getBoundingClientRect().left - PAD.left;
                  const next = Math.max(0, Math.min(count - 1, Math.floor(x / geo.step)));
                  setActive((previous) => (previous === next ? previous : next));
                }}
                onPointerLeave={() => setActive(null)}
                onKeyDown={handleKeyDown}
              >
                {[0, 1, 2, 3, 4].map((tick) => {
                  const y = PAD.top + (geo.innerH * tick) / 4;
                  return (
                    <g key={tick}>
                      <line x1={PAD.left} x2={PAD.left + geo.innerW} y1={y} y2={y} className={s.gridLine} />
                      <text x={PAD.left - 10} y={y + 3} textAnchor="end" className={s.axis}>
                        {formatTokens(yMax * (1 - tick / 4))}
                      </text>
                      {cMax > 0 && tick % 2 === 0 ? (
                        <text x={PAD.left + geo.innerW + 10} y={y + 3} textAnchor="start" className={s.axis}>
                          {usdTick(cMax * (1 - tick / 4))}
                        </text>
                      ) : null}
                    </g>
                  );
                })}

                {bars}
                <line x1={PAD.left} x2={PAD.left + geo.innerW} y1={geo.baseY} y2={geo.baseY} className={s.baseline} />

                {lines ? (
                  count === 1 ? (
                    <g pointerEvents="none">
                      {lines.totalPoint ? (
                        <circle cx={lines.totalPoint[0]} cy={lines.totalPoint[1]} r={3} fill="var(--ivory)" stroke="var(--panel)" strokeWidth={2} />
                      ) : null}
                      {lines.costPoint ? (
                        <circle cx={lines.costPoint[0]} cy={lines.costPoint[1]} r={3.5} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
                      ) : null}
                    </g>
                  ) : (
                    <>
                      {lines.total ? (
                        <polyline points={lines.total} fill="none" stroke="var(--ivory)" strokeWidth={1}
                          strokeLinejoin="round" strokeLinecap="round" />
                      ) : null}
                      {lines.cost ? (
                        <polyline points={lines.cost} fill="none" stroke="var(--accent)" strokeWidth={1.5}
                          strokeLinejoin="round" strokeLinecap="round" />
                      ) : null}
                    </>
                  )
                ) : null}

                {count === 1 ? (
                  <text x={PAD.left + geo.innerW / 2} y={HEIGHT - 8} textAnchor="middle" className={s.axis}>
                    {dayFormat.format(parseDay(daily[0].date))}
                  </text>
                ) : (
                  months.map((tick) => (
                    <text key={tick.key} x={tick.x} y={HEIGHT - 8} textAnchor="middle" className={s.axis}>
                      {tick.label}
                    </text>
                  ))
                )}

                {activeDay ? (
                  <g pointerEvents="none">
                    <line x1={activeX} x2={activeX} y1={PAD.top} y2={geo.baseY} className={s.hoverRule} />
                    <circle cx={activeX} cy={activeTotalY} r={2.5} fill="var(--ivory)" stroke="var(--panel)" strokeWidth={2} />
                    {cMax > 0 ? (
                      <circle cx={activeX} cy={activeCostY} r={3} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
                    ) : null}
                  </g>
                ) : null}
              </svg>

              {activeDay ? (
                <div className={s.tip} style={{ left: tipLeft }}>
                  <div className={s.tipDate}>{dayFormat.format(parseDay(activeDay.date))}</div>
                  <dl className={s.tipRows}>
                    {tipRows.map((row) => (
                      <div className={`${s.tipRow} ${row.strong ? s.tipRowStrong : ''}`} key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
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
