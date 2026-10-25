'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatAgo, formatNumber } from '@/lib/format';
import { formatLocal } from '@/lib/time';
import type { SessionStat, StatsResponse } from '@/lib/types';
import { ExportMenu } from '@/components/ExportMenu';
import { SessionDrawer } from '@/components/SessionDrawer';
import { EmptyRow, formatCost, formatTokensShort } from '@/components/tables/DataTable';
import styles from './SessionsTab.module.css';

const COLUMN_COUNT = 9;

type SortKey = 'title' | 'startedAt' | 'durationMs' | 'messages' | 'tokens' | 'cost';
type SortDirection = 'asc' | 'desc';

const SORTERS: Record<SortKey, (a: SessionStat, b: SessionStat) => number> = {
  title: (a, b) =>
    (a.title || 'Untitled').localeCompare(b.title || 'Untitled', 'en', { sensitivity: 'base' }),
  startedAt: (a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0),
  durationMs: (a, b) => a.durationMs - b.durationMs,
  messages: (a, b) => a.messages - b.messages,
  tokens: (a, b) => a.tokens - b.tokens,
  cost: (a, b) => a.cost - b.cost,
};

/** Tie-break every sort by id ascending, whatever the direction. */
function byId(a: SessionStat, b: SessionStat): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** `m:ss` under an hour, `h:mm` above it. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function SortHeader({
  column,
  label,
  className,
  sortKey,
  direction,
  onSort,
}: {
  column: SortKey;
  label: string;
  className?: string;
  sortKey: SortKey;
  direction: SortDirection;
  onSort: (column: SortKey) => void;
}) {
  const active = column === sortKey;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={`${styles.sortButton} ${active ? styles.sortButtonActive : ''}`}
        data-tip={`Sort by ${label.toLowerCase()}`}
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (
          <span className={styles.sortMark} aria-hidden="true">
            {direction === 'asc' ? '▲' : '▼'}
          </span>
        ) : null}
      </button>
    </th>
  );
}

export function SessionsTab({ data }: { data: StatsResponse }) {
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('tokens');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selected, setSelected] = useState<SessionStat | null>(null);

  // `generatedAt` keeps relative labels identical between server and client.
  const generatedAt = Date.parse(data.generatedAt);
  const clock = Number.isNaN(generatedAt) ? Date.now() : generatedAt;

  const projectNames = useMemo(
    () => new Map(data.projects.map((entry) => [entry.slug, entry.name])),
    [data.projects],
  );

  // A range change can retire the selected project; fall back to all projects.
  useEffect(() => {
    if (project !== 'all' && !projectNames.has(project)) setProject('all');
  }, [project, projectNames]);

  const search = query.trim().toLowerCase();
  const filtered = search.length > 0 || project !== 'all';

  const rows = useMemo(() => {
    const factor = sortDirection === 'asc' ? 1 : -1;
    return data.sessions
      .filter((session) => {
        if (project !== 'all' && session.project !== project) return false;
        if (!search) return true;
        const projectName = projectNames.get(session.project) ?? session.project;
        return (
          session.title.toLowerCase().includes(search) ||
          session.project.toLowerCase().includes(search) ||
          projectName.toLowerCase().includes(search) ||
          session.model.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => {
        const compared = SORTERS[sortKey](a, b);
        return compared === 0 ? byId(a, b) : compared * factor;
      });
  }, [data.sessions, project, projectNames, search, sortDirection, sortKey]);

  const maxTokens = rows.reduce((max, session) => Math.max(max, session.tokens), 0);

  function toggleSort(column: SortKey): void {
    if (column === sortKey) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(column);
      setSortDirection('desc');
    }
  }

  return (
    <section className={styles.tab} aria-label="Session usage">
      <header className={styles.header}>
        <p className={styles.explainer}>The 300 heaviest sessions in the selected range.</p>
        <ExportMenu data={data} />
      </header>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search</span>
          <input
            type="search"
            className={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, project or model"
            spellCheck={false}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Project</span>
          <span className={styles.selectWrap}>
            <select
              className={styles.select}
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="all">All projects</option>
              {data.projects.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </select>
            <span className={styles.chevron} aria-hidden="true">
              ▾
            </span>
          </span>
        </label>
      </div>

      <table className={styles.table}>
        <caption className="sr-only">
          The 300 heaviest sessions in the range, with subagent sessions indented.
        </caption>
        <thead>
          <tr>
            <SortHeader
              column="title"
              label="Session"
              className={styles.colTitle}
              sortKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <th scope="col" className={`${styles.colProject} ${styles.hideNarrow}`}>
              Project
            </th>
            <th scope="col" className={`${styles.colAgent} ${styles.hideMd}`}>
              Agent
            </th>
            <th scope="col" className={`${styles.colModel} ${styles.hideNarrow}`}>
              Model
            </th>
            <SortHeader
              column="startedAt"
              label="Started"
              className={`${styles.right} ${styles.hideSm} ${styles.colStarted}`}
              sortKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortHeader
              column="durationMs"
              label="Duration"
              className={`${styles.right} ${styles.hideSm} ${styles.colDuration}`}
              sortKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortHeader
              column="messages"
              label="Messages"
              className={`${styles.right} ${styles.hideMd} ${styles.colMessages}`}
              sortKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortHeader
              column="tokens"
              label="Tokens"
              className={`${styles.right} ${styles.colTokens}`}
              sortKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
            <SortHeader
              column="cost"
              label="Cost"
              className={`${styles.right} ${styles.colCost}`}
              sortKey={sortKey}
              direction={sortDirection}
              onSort={toggleSort}
            />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={COLUMN_COUNT}>
              {data.sessions.length === 0
                ? 'No sessions in this range.'
                : 'No sessions match these filters.'}
            </EmptyRow>
          ) : (
            rows.map((session) => {
              const isSubagent = session.parentId !== null;
              const rowClass = [styles.row, isSubagent ? styles.subagent : '']
                .filter(Boolean)
                .join(' ');

              return (
                <tr
                  key={session.id}
                  className={rowClass}
                  tabIndex={0}
                  aria-haspopup="dialog"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(session)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    setSelected(session);
                  }}
                >
                  <td className={styles.titleCell}>
                    <span className={styles.titleLine}>
                      {isSubagent ? (
                        <>
                          <span className={styles.subArrow} aria-hidden="true">
                            ↳
                          </span>
                          <span className="sr-only">Subagent session: </span>
                        </>
                      ) : null}
                      <span className={styles.sessionTitle} data-tip={session.title}>
                        {session.title || 'Untitled'}
                      </span>
                    </span>
                  </td>
                  <td className={`${styles.projectCell} ${styles.hideNarrow}`} data-tip={session.project}>
                    <span className={styles.projectName}>
                      {projectNames.get(session.project) ?? session.project}
                    </span>
                  </td>
                  <td className={`${styles.agentCell} ${styles.hideMd}`}>
                    <span className={styles.badge}>{session.agent}</span>
                  </td>
                  <td className={`${styles.modelCell} ${styles.hideNarrow}`}>
                    <span className={styles.modelName} data-tip={session.model}>
                      {session.model}
                    </span>
                  </td>
                  <td className={`${styles.num} ${styles.hideSm}`}>
                    <time dateTime={session.startedAt} data-tip={formatLocal(Date.parse(session.startedAt))}>
                      {formatAgo(session.startedAt, clock)}
                    </time>
                  </td>
                  <td className={`${styles.num} ${styles.hideSm}`}>
                    {formatDuration(session.durationMs)}
                  </td>
                  <td className={`${styles.num} ${styles.hideMd}`}>
                    {formatNumber(session.messages)}
                  </td>
                  <td className={`${styles.num} ${styles.tokenCell}`} data-tip={`${formatNumber(session.tokens)} tokens`}>
                    <span className={styles.tokenValue}>{formatTokensShort(session.tokens)}</span>
                    <span className={styles.tokenBar} aria-hidden="true">
                      <span
                        className={styles.tokenBarFill}
                        style={{ width: `${maxTokens > 0 ? (session.tokens / maxTokens) * 100 : 0}%` }}
                      />
                    </span>
                  </td>
                  <td className={styles.num}>{formatCost(session.cost)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <footer className={styles.footer}>
        <span aria-live="polite">
          {rows.length} of {formatNumber(data.totals.sessions)} sessions
        </span>
        {filtered ? <span className={styles.footerTag}>Filtered</span> : null}
      </footer>

      {selected ? (
        <SessionDrawer
          key={selected.id}
          session={selected}
          card={data.card}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </section>
  );
}
