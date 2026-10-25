'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAgo, formatDay, formatNumber, formatTokens } from '@/lib/format';
import type { ExtrasResponse } from '@/lib/extras';
import type { RangeKey } from '@/lib/types';
import { CodeStats } from '@/components/tools/CodeStats';
import { ToolTable } from '@/components/tools/ToolTable';
import s from './ToolsTab.module.css';

const POLL_MS = 5000;

type Status = 'loading' | 'ready' | 'error';

type Cell = { label: string; value: string; sub: string; note?: string };

/** `2h 14m`, `15d 1h` — long wall-clock sessions read better in days. */
function formatSpan(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

/**
 * Tools and code output. This is the one tab that fetches its own endpoint:
 * the figures come from the live database, not the range/card stats payload.
 * Only the code figures follow the range (a preset, or a custom `from`/`to`
 * pair); tool reliability is lifetime.
 */
export function ToolsTab({
  range,
  from,
  to,
}: {
  range: RangeKey | 'custom';
  /** Custom range start, local `YYYY-MM-DD`; both bounds are required. */
  from?: string;
  /** Custom range end, local `YYYY-MM-DD`, inclusive. */
  to?: string;
}) {
  const [data, setData] = useState<ExtrasResponse | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const mountedRef = useRef(true);
  const seqRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    // A complete custom pair wins over the preset, matching /api/extras.
    const query =
      from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `range=${encodeURIComponent(range)}`;

    try {
      const response = await fetch(`/api/extras?${query}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`extras request failed: ${response.status}`);
      const next = (await response.json()) as ExtrasResponse;
      if (!mountedRef.current || seq !== seqRef.current) return;
      setData(next);
      setStatus('ready');
    } catch {
      if (controller.signal.aborted || seq !== seqRef.current || !mountedRef.current) return;
      // Keep the last good payload: a single failed poll should not blank the tab.
      setStatus('error');
    }
  }, [range, from, to]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      seqRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    const tick = (): void => {
      if (!document.hidden) void load();
    };

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = (): void => {
      if (timer === null) timer = setInterval(tick, POLL_MS);
    };
    const stop = (): void => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = (): void => {
      if (document.hidden) {
        stop();
      } else {
        start();
        tick();
      }
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const clock = data ? Date.parse(data.generatedAt) : Number.NaN;
  // The payload says which window its code figures cover; the props are the
  // fallback for a response that predates the range field.
  const codeRange: RangeKey | 'custom' = data?.code?.range ?? range;

  const cells: Cell[] = data
    ? [
        {
          label: 'Assistant turns',
          value: formatNumber(data.turns.total),
          sub: `${formatTokens(data.turns.avgTokens)} tokens on average`,
        },
        {
          label: 'Avg tokens / turn',
          value: formatTokens(data.turns.avgTokens),
          sub: `p50 ${formatTokens(data.turns.p50Tokens)}`,
        },
        {
          label: 'p95 turn',
          value: formatTokens(data.turns.p95Tokens),
          sub: data.turns.maxTurn
            ? `max ${formatTokens(data.turns.maxTurn.tokens)} · ${data.turns.maxTurn.model}`
            : 'no turns recorded',
        },
        {
          label: 'Peak concurrent',
          value: formatNumber(data.concurrency.peak),
          sub: data.concurrency.date ? formatDay(data.concurrency.date) : 'no sessions',
        },
        {
          label: 'Tokens / active hour',
          value: formatTokens(data.throughput.tokensPerActiveHour),
          sub: `${formatTokens(data.turns.avgTokens * data.turns.total)} tokens total`,
        },
        {
          label: 'Longest session',
          value: formatSpan(data.throughput.longestSessionMs),
          sub: data.throughput.longestSessionTitle || 'no sessions',
          note:
            data.throughput.longestSessionMs > 8 * 3_600_000
              ? 'wall-clock · idle-inclusive'
              : undefined,
        },
      ]
    : [];

  if (data === null) {
    return (
      <div className={s.stack}>
        {status === 'error' ? (
          <section className="error" role="alert">
            <p className="eyebrow">extras unavailable</p>
            <p>The tool and code analytics endpoint did not answer. The tab keeps retrying.</p>
            <p>
              <button type="button" className="button" onClick={() => void load()}>
                Retry now
              </button>
            </p>
          </section>
        ) : (
          <div className="skeleton-grid" aria-busy="true" aria-label="Loading tool analytics">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={index === 0 ? 'skeleton-block skeleton-wide' : 'skeleton-block'} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={s.stack}>
      <section className={s.panel} aria-label="Tool and turn summary">
        <header className={s.head}>
          <div className={s.headText}>
            <h2 className={s.title}>Tools &amp; output</h2>
            <p className={s.explainer}>
              Every assistant turn and tool call in the local OpenCode database.
            </p>
          </div>
          <div className={s.status}>
            {data.stale ? <span className={s.stale}>stale</span> : null}
            {status === 'error' ? <span className={s.offline}>reconnecting</span> : null}
            <span className={s.clock}>
              {Number.isNaN(clock) ? '—' : formatAgo(data.generatedAt)}
            </span>
          </div>
        </header>

        <dl className={s.stats}>
          {cells.map((cell) => (
            <div className={s.stat} key={cell.label}>
              <dt className={s.statLabel}>{cell.label}</dt>
              <dd className={s.statValue}>{cell.value}</dd>
              <dd className={s.statSub} tabIndex={0} data-tip={cell.sub}>
                {cell.sub}
              </dd>
              {cell.note ? <dd className={s.statNote}>{cell.note}</dd> : null}
            </div>
          ))}
        </dl>
      </section>

      <CodeStats code={data.code} range={codeRange} rangeWindow={data.range} />
      <ToolTable tools={data.tools} shell={data.shell} />
    </div>
  );
}
