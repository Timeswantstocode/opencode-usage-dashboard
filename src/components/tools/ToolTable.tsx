'use client';

import { useMemo, useState, type ReactElement } from 'react';
import { formatNumber, formatPercent } from '@/lib/format';
import type { ExtrasResponse } from '@/lib/extras';
import s from './ToolTable.module.css';

type SortKey = 'calls' | 'errors' | 'errorRate' | 'p50';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

/** `0.4 ms`, `83 ms`, `2.1 s`; null when the call carried no timestamps. */
function formatMs(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return '0 ms';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function sortValue(row: ExtrasResponse['tools']['items'][number], key: SortKey): number {
  if (key === 'p50') return row.p50Ms ?? 0;
  return row[key];
}

type ToolTableProps = {
  tools: ExtrasResponse['tools'];
  shell: ExtrasResponse['shell'];
};

/** Sortable, searchable tool leaderboard with an inline error-rate bar. */
export function ToolTable({ tools, shell }: ToolTableProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>({ key: 'calls', dir: 'desc' });

  const search = query.trim().toLowerCase();

  const rows = useMemo(() => {
    const filtered =
      search.length > 0
        ? tools.items.filter((row) => row.name.toLowerCase().includes(search))
        : tools.items;

    return [...filtered].sort((a, b) => {
      // Tools without timestamps stay at the bottom whatever the direction.
      if (sort.key === 'p50') {
        if (a.p50Ms === null && b.p50Ms === null) return a.name.localeCompare(b.name);
        if (a.p50Ms === null) return 1;
        if (b.p50Ms === null) return -1;
      }
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === bv) return a.name.localeCompare(b.name);
      return sort.dir === 'asc' ? av - bv : bv - av;
    });
  }, [tools.items, search, sort]);

  const toggle = (key: SortKey): void => {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    );
  };

  const header = (key: SortKey, label: string, className = ''): ReactElement => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        className={`${s.right} ${className}`}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button type="button" className={s.sortButton} onClick={() => toggle(key)}>
          {label}
          <span className={s.caret} aria-hidden="true">
            {active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
          </span>
        </button>
      </th>
    );
  };

  return (
    <section className={s.panel} aria-label="Tool reliability">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>
            Tool reliability
            <span className={s.tag}>Lifetime</span>
          </p>
          <p className={s.note}>
            {formatNumber(tools.total)} calls · {formatNumber(tools.errors)} errors ·{' '}
            {formatPercent(tools.errorRate, 2)} error rate
          </p>
        </div>
        <label className={s.search}>
          <span className="sr-only">Filter tools by name</span>
          <input
            type="search"
            className={s.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tools"
            spellCheck={false}
          />
        </label>
      </header>

      <div className={s.scroll}>
        <table className={s.table}>
          <caption className="sr-only">
            The 30 most-called tools, with call counts, errors, error rate, median duration and
            share of all calls.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={s.colTool}>
                Tool
              </th>
              {header('calls', 'Calls')}
              {header('errors', 'Errors')}
              {header('errorRate', 'Error rate', s.colRate)}
              {header('p50', 'p50', s.colP50)}
              <th scope="col" className={`${s.right} ${s.colShare}`}>
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className={s.empty} colSpan={6}>
                  {tools.items.length === 0 ? 'No tool calls recorded.' : 'No tools match this filter.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const hot = row.errorRate > 0.02;
                const barWidth = Math.min(100, (row.errorRate / 0.05) * 100);
                return (
                  <tr key={row.name} className={s.row}>
                    <td className={s.toolCell}>
                      <span className={s.toolName} data-tip={row.name}>
                        {row.name}
                      </span>
                    </td>
                    <td className={s.num}>{formatNumber(row.calls)}</td>
                    <td className={s.num}>{formatNumber(row.errors)}</td>
                    <td className={s.rateCell}>
                      <span className={hot ? `${s.rate} ${s.rateHot}` : s.rate}>
                        {formatPercent(row.errorRate, 2)}
                      </span>
                      <span className={s.bar} aria-hidden="true">
                        <span
                          className={hot ? `${s.barFill} ${s.barFillHot}` : s.barFill}
                          style={{ width: `${barWidth}%` }}
                        />
                      </span>
                    </td>
                    <td className={`${s.num} ${s.colP50}`}>{formatMs(row.p50Ms)}</td>
                    <td className={`${s.num} ${s.colShare}`}>{formatPercent(row.share, 1)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className={s.totalRow}>
              <td className={s.toolCell}>Total</td>
              <td className={s.num}>{formatNumber(tools.total)}</td>
              <td className={s.num}>{formatNumber(tools.errors)}</td>
              <td className={s.rateCell}>{formatPercent(tools.errorRate, 2)}</td>
              <td className={`${s.num} ${s.colP50}`} />
              <td className={`${s.num} ${s.colShare}`}>100%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className={s.footer}>
        <span>
          {rows.length} of {tools.items.length} tools
        </span>
        <span className={s.footerShell}>
          shell (bash + shell) · {formatNumber(shell.calls)} calls · {formatNumber(shell.errors)}{' '}
          errors · {formatPercent(shell.errorRate, 2)}
        </span>
      </footer>
    </section>
  );
}
