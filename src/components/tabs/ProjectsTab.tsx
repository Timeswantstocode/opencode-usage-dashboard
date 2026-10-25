'use client';

import { formatAgo, formatDay, formatNumber, formatPercent } from '@/lib/format';
import { formatLocal } from '@/lib/time';
import type { StatsResponse } from '@/lib/types';
import { EmptyRow, formatCost, formatTokensShort } from '@/components/tables/DataTable';
import styles from './ProjectsTab.module.css';

const COLUMN_COUNT = 8;

type ProjectsTabProps = {
  data: StatsResponse;
  activeProject: string;
  onSelectProject: (project: string) => void;
};

export function ProjectsTab({ data, activeProject, onSelectProject }: ProjectsTabProps) {
  // `generatedAt` keeps relative labels identical between server and client.
  const generatedAt = Date.parse(data.generatedAt);
  const clock = Number.isNaN(generatedAt) ? Date.now() : generatedAt;

  const ranked = data.projects.filter((project) => project.slug !== 'root');
  const root = data.projects.find((project) => project.slug === 'root') ?? null;
  const rows = root ? [...ranked, root] : ranked;
  const top = ranked[0] ?? null;
  const topThreeShare = ranked.slice(0, 3).reduce((sum, project) => sum + project.share, 0);

  // The page filters every payload by `activeProject`, so the panel renders the
  // single project row; `data.daily` and `data.models` arrive already clipped to
  // that project. An empty daily or model list means nothing happened in range.
  const showDetail = activeProject !== 'all';
  const selected = showDetail
    ? data.projects.find((project) => project.slug === activeProject) ?? null
    : null;
  const detailName = selected?.name ?? activeProject;
  const daily = data.daily.slice(-30);
  const topModels = data.models.slice(0, 3);
  const hasActivity = daily.length > 0 && topModels.length > 0;
  const detailTokens = hasActivity ? selected?.tokens ?? data.totals.tokens.total : 0;
  const detailCost = hasActivity ? selected?.cost ?? data.totals.cost : 0;
  const detailShare = hasActivity ? selected?.share ?? 0 : 0;
  const detailSessions = hasActivity ? selected?.sessions ?? data.totals.sessions : 0;
  const detailMessages = hasActivity ? selected?.messages ?? data.totals.messages : 0;
  const dailyMax = daily.reduce((max, point) => Math.max(max, point.tokens), 0);

  const selectProject = (slug: string): void => {
    onSelectProject(slug === activeProject ? 'all' : slug);
  };

  return (
    <section className={styles.tab} aria-label="Project token usage">
      <header className={styles.header}>
        <p className={styles.explainer}>Attributed from file paths in tool calls.</p>
      </header>

      <dl className={styles.strip}>
        <div className={styles.stripItem}>
          <dt className={styles.stripLabel}>Projects</dt>
          <dd className={styles.stripValue}>{ranked.length}</dd>
        </div>
        <div className={styles.stripItem}>
          <dt className={styles.stripLabel}>Top project</dt>
          <dd className={styles.stripValue}>
            {top ? (
              <>
                <span className={styles.stripName}>{top.name}</span>
                <span className={styles.stripShare}>{formatPercent(top.share)}</span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className={styles.stripItem}>
          <dt className={styles.stripLabel}>Top 3 share</dt>
          <dd className={styles.stripValue}>
            {ranked.length > 0 ? formatPercent(topThreeShare) : '—'}
          </dd>
        </div>
      </dl>

      {showDetail ? (
        <section className={styles.detail} aria-label={`${detailName} project detail`}>
          <div className={styles.detailHead}>
            <div className={styles.detailTitle}>
              <p className={styles.detailEyebrow}>Project</p>
              <h2 className={styles.detailName}>{detailName}</h2>
            </div>
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => onSelectProject('all')}
            >
              Clear filter
            </button>
          </div>

          <dl className={styles.detailStats}>
            <div className={styles.statCell}>
              <dt className={styles.statLabel}>Tokens</dt>
              <dd
                className={styles.statValue}
                data-tip={`${formatNumber(detailTokens)} tokens`}
              >
                {formatTokensShort(detailTokens)}
              </dd>
            </div>
            <div className={styles.statCell}>
              <dt className={styles.statLabel}>Estimated cost</dt>
              <dd className={styles.statValue}>{formatCost(detailCost)}</dd>
            </div>
            <div className={styles.statCell}>
              <dt className={styles.statLabel}>Share of all tokens</dt>
              <dd className={styles.statValue}>{formatPercent(detailShare)}</dd>
            </div>
            <div className={styles.statCell}>
              <dt className={styles.statLabel}>Sessions</dt>
              <dd className={styles.statValue}>{formatNumber(detailSessions)}</dd>
            </div>
            <div className={styles.statCell}>
              <dt className={styles.statLabel}>Messages</dt>
              <dd className={styles.statValue}>{formatNumber(detailMessages)}</dd>
            </div>
          </dl>

          {hasActivity ? (
            <div className={styles.detailBody}>
              <div className={styles.stripBox}>
                <p className={styles.boxLabel}>Daily tokens</p>
                <div
                  className={styles.stripChart}
                  role="img"
                  aria-label={`Daily tokens for ${detailName} over the last ${daily.length} days.`}
                >
                  {daily.map((point) => {
                    const height =
                      point.tokens > 0 && dailyMax > 0
                        ? Math.max(2, Math.round((point.tokens / dailyMax) * 48))
                        : 1;
                    return (
                      <span
                        key={point.date}
                        className={
                          point.tokens > 0 ? styles.stripBar : `${styles.stripBar} ${styles.stripBarEmpty}`
                        }
                        style={{ height: `${height}px` }}
                        data-tip={`${formatDay(point.date)} · ${formatNumber(point.tokens)} tokens`}
                      />
                    );
                  })}
                </div>
                <div className={styles.stripDates}>
                  <span>{formatDay(daily[0].date)}</span>
                  <span>{formatDay(daily[daily.length - 1].date)}</span>
                </div>
              </div>

              <div className={styles.modelsBox}>
                <p className={styles.boxLabel}>Top models</p>
                <ol className={styles.modelList}>
                  {topModels.map((model) => (
                    <li
                      key={`${model.provider}/${model.model}/${model.variant}`}
                      className={styles.modelRow}
                    >
                      <span
                        className={styles.modelName}
                        data-tip={`${model.provider}/${model.model}`}
                      >
                        {model.model}
                      </span>
                      <span className={styles.modelShare}>{formatPercent(model.share)}</span>
                      <span className={styles.modelCost}>{formatCost(model.cost)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : (
            <p className={styles.emptyNote}>No activity in this range.</p>
          )}

          <p className={styles.detailHint}>
            Showing this project only. Pick another row or clear the filter.
          </p>
        </section>
      ) : null}

      <table className={styles.table}>
        <caption className="sr-only">
          Project token usage ranked by tokens, with unattributed GitHub root sessions last.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={`${styles.right} ${styles.rankCol}`} aria-label="Rank">
              #
            </th>
            <th scope="col" className={styles.colProject}>
              Project
            </th>
            <th scope="col" className={`${styles.right} ${styles.colTokens}`}>
              Tokens
            </th>
            <th scope="col" className={`${styles.right} ${styles.colCost}`}>
              Cost
            </th>
            <th scope="col" className={`${styles.right} ${styles.hideSm} ${styles.colSessions}`}>
              Sessions
            </th>
            <th scope="col" className={`${styles.right} ${styles.hideMd} ${styles.colMessages}`}>
              Messages
            </th>
            <th scope="col" className={`${styles.right} ${styles.colShare}`}>
              Share
            </th>
            <th scope="col" className={`${styles.right} ${styles.hideSm} ${styles.colLastUsed}`}>
              Last used
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <EmptyRow colSpan={COLUMN_COUNT}>No project activity in this range.</EmptyRow>
          ) : (
            rows.map((project, index) => {
              const isRoot = project.slug === 'root';
              const isActive = project.slug === activeProject;
              const rowClass = [styles.row, isRoot && styles.root, isActive && styles.active]
                .filter(Boolean)
                .join(' ');

              return (
                <tr
                  key={project.slug}
                  className={rowClass}
                  onClick={() => selectProject(project.slug)}
                >
                  <td className={styles.rank}>{isRoot ? '—' : index + 1}</td>
                  <td className={styles.projectCell}>
                    <button
                      type="button"
                      className={styles.projectButton}
                      aria-pressed={isActive}
                      onClick={(event) => {
                        event.stopPropagation();
                        selectProject(project.slug);
                      }}
                    >
                      <span className={styles.projectName}>{project.name}</span>
                      <span className={styles.bar} aria-hidden="true">
                        <span
                          className={styles.barFill}
                          style={{ width: `${project.share * 100}%` }}
                        />
                      </span>
                    </button>
                  </td>
                  <td className={styles.num} data-tip={`${formatNumber(project.tokens)} tokens`}>
                    {formatTokensShort(project.tokens)}
                  </td>
                  <td className={styles.num}>{formatCost(project.cost)}</td>
                  <td className={`${styles.num} ${styles.hideSm}`}>
                    {formatNumber(project.sessions)}
                  </td>
                  <td className={`${styles.num} ${styles.hideMd}`}>
                    {formatNumber(project.messages)}
                  </td>
                  <td className={styles.num}>{formatPercent(project.share)}</td>
                  <td
                    className={`${styles.num} ${styles.hideSm}`}
                    data-tip={formatLocal(Date.parse(project.lastUsed))}
                  >
                    {formatAgo(project.lastUsed, clock)}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
