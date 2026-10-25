'use client';

import { useMemo, useState } from 'react';
import { formatNumber, formatPercent } from '@/lib/format';
import type { ModelStat, ProviderStat, StatsResponse } from '@/lib/types';
import { EmptyRow, formatCost, formatTokensShort } from '@/components/tables/DataTable';
import styles from './ModelsTab.module.css';

type SortKey = 'tokens' | 'cost' | 'share';
type SortDir = 'asc' | 'desc';
type SortState = { key: SortKey; dir: SortDir };
type GroupMode = 'model' | 'provider';

const COLUMN_COUNT = 11;
const PROVIDER_COLUMN_COUNT = 7;

type SortHeaderProps = {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className: string;
};

function SortHeader({ label, sortKey, sort, onSort, className }: SortHeaderProps) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      className={`${styles.sortable} ${className}`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className={styles.sortButton} onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        {active ? (
          <span className={styles.sortArrow} aria-hidden="true">
            {sort.dir === 'asc' ? '▲' : '▼'}
          </span>
        ) : null}
      </button>
    </th>
  );
}

/** Effective blended rate: cost divided by tokens, shown per million. */
function ratePerMillion(model: ModelStat): string {
  if (model.tokens.total <= 0 || model.cost <= 0) return '—';
  const rate = (model.cost / model.tokens.total) * 1e6;
  return rate > 0 ? `$${rate.toFixed(2)}` : '—';
}

function providerRate(provider: ProviderStat): string {
  if (provider.tokens.total <= 0 || provider.cost <= 0) return '—';
  const rate = (provider.cost / provider.tokens.total) * 1e6;
  return rate > 0 ? `$${rate.toFixed(2)}` : '—';
}

export function ModelsTab({ data }: { data: StatsResponse }) {
  const [sort, setSort] = useState<SortState>({ key: 'cost', dir: 'desc' });
  const [group, setGroup] = useState<GroupMode>('model');

  const handleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' },
    );
  };

  const sorted = useMemo(() => {
    const valueOf = (model: ModelStat): number =>
      sort.key === 'tokens' ? model.tokens.total : sort.key === 'cost' ? model.cost : model.share;
    return [...data.models].sort((a, b) => {
      const primary = sort.dir === 'asc' ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a);
      return primary !== 0 ? primary : a.model.localeCompare(b.model);
    });
  }, [data.models, sort]);

  const sortedProviders = useMemo(() => {
    const valueOf = (provider: ProviderStat): number =>
      sort.key === 'tokens' ? provider.tokens.total : sort.key === 'cost' ? provider.cost : provider.share;
    return [...(data.providers ?? [])].sort((a, b) => {
      const primary = sort.dir === 'asc' ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a);
      return primary !== 0 ? primary : a.provider.localeCompare(b.provider);
    });
  }, [data.providers, sort]);

  return (
    <section className={styles.tab} aria-label="Model usage">
      <header className={styles.header}>
        <div className={styles.headerRow}>
          <p className={styles.explainer}>
            {group === 'model'
              ? 'Provider, model and variant totals. Sort by tokens, share or cost.'
              : 'Provider totals for the current selection. Sort by tokens, share or cost.'}
          </p>
          <div className={styles.toggle} role="group" aria-label="Group by">
            <span className={styles.toggleLabel}>Group by</span>
            <button
              type="button"
              className={group === 'model' ? `${styles.tabButton} ${styles.tabOn}` : styles.tabButton}
              aria-pressed={group === 'model'}
              onClick={() => setGroup('model')}
            >
              Model
            </button>
            <button
              type="button"
              className={group === 'provider' ? `${styles.tabButton} ${styles.tabOn}` : styles.tabButton}
              aria-pressed={group === 'provider'}
              onClick={() => setGroup('provider')}
            >
              Provider
            </button>
          </div>
        </div>
      </header>

      {group === 'model' ? (
        <table className={styles.table}>
          <caption className="sr-only">
            Token and cost totals per provider, model and variant.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${styles.colProvider} ${styles.hideNarrow}`}>
                Provider
              </th>
              <th scope="col" className={styles.colModel}>
                Model
              </th>
              <th scope="col" className={`${styles.colVariant} ${styles.hideNarrow}`}>
                Variant
              </th>
              <th scope="col" className={`${styles.right} ${styles.colInput} ${styles.hideXs}`}>
                Input
              </th>
              <th scope="col" className={`${styles.right} ${styles.colOutput} ${styles.hideXs}`}>
                Output
              </th>
              <th scope="col" className={`${styles.right} ${styles.colReasoning} ${styles.hideMd}`}>
                Reasoning
              </th>
              <th scope="col" className={`${styles.right} ${styles.colCache} ${styles.hideXs}`}>
                Cache read
              </th>
              <SortHeader
                label="Tokens"
                sortKey="tokens"
                sort={sort}
                onSort={handleSort}
                className={`${styles.right} ${styles.colTokens}`}
              />
              <SortHeader
                label="Share"
                sortKey="share"
                sort={sort}
                onSort={handleSort}
                className={`${styles.right} ${styles.colShare}`}
              />
              <SortHeader
                label="Cost"
                sortKey="cost"
                sort={sort}
                onSort={handleSort}
                className={`${styles.right} ${styles.colCost}`}
              />
              <th scope="col" className={`${styles.right} ${styles.colRate}`}>
                $/M
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <EmptyRow colSpan={COLUMN_COUNT}>No model usage in this range.</EmptyRow>
            ) : (
              sorted.map((model) => (
                <tr
                  key={`${model.provider}/${model.model}/${model.variant}`}
                  className={styles.row}
                >
                  <td className={`${styles.provider} ${styles.hideNarrow}`}>{model.provider}</td>
                  <td className={styles.modelCell}>
                    <span className={styles.modelLine}>
                      {model.provider !== 'opencode' ? (
                        <span className={styles.meteredBar} aria-hidden="true" />
                      ) : null}
                      <span
                        className={styles.modelName}
                        data-tip={`${model.provider}/${model.model}`}
                      >
                        {model.model}
                      </span>
                    </span>
                  </td>
                  <td className={`${styles.variantCell} ${styles.hideNarrow}`}>
                    {model.variant ? (
                      <span className={styles.badge}>{model.variant}</span>
                    ) : (
                      <span className={styles.dash}>—</span>
                    )}
                  </td>
                  <td className={`${styles.num} ${styles.hideXs}`}>
                    {formatTokensShort(model.tokens.input)}
                  </td>
                  <td className={`${styles.num} ${styles.hideXs}`}>
                    {formatTokensShort(model.tokens.output)}
                  </td>
                  <td className={`${styles.num} ${styles.hideMd}`}>
                    {formatTokensShort(model.tokens.reasoning)}
                  </td>
                  <td className={`${styles.num} ${styles.hideXs}`}>
                    {formatTokensShort(model.tokens.cacheRead)}
                  </td>
                  <td
                    className={styles.num}
                    data-tip={`${formatNumber(model.tokens.total)} tokens`}
                  >
                    {formatTokensShort(model.tokens.total)}
                  </td>
                  <td className={styles.num}>{formatPercent(model.share)}</td>
                  <td className={styles.num}>{formatCost(model.cost)}</td>
                  <td className={styles.num}>{ratePerMillion(model)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : (
        <table className={styles.table}>
          <caption className="sr-only">Token, message and cost totals per provider.</caption>
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <SortHeader
                label="Tokens"
                sortKey="tokens"
                sort={sort}
                onSort={handleSort}
                className={styles.right}
              />
              <th scope="col" className={styles.right}>
                Messages
              </th>
              <th scope="col" className={styles.right}>
                Models
              </th>
              <SortHeader
                label="Share"
                sortKey="share"
                sort={sort}
                onSort={handleSort}
                className={styles.right}
              />
              <SortHeader
                label="Cost"
                sortKey="cost"
                sort={sort}
                onSort={handleSort}
                className={styles.right}
              />
              <th scope="col" className={styles.right}>
                $/M
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedProviders.length === 0 ? (
              <EmptyRow colSpan={PROVIDER_COLUMN_COUNT}>No provider usage in this range.</EmptyRow>
            ) : (
              sortedProviders.map((provider) => (
                <tr key={provider.provider} className={styles.row}>
                  <td className={styles.providerCell}>{provider.provider}</td>
                  <td className={styles.num} data-tip={`${formatNumber(provider.tokens.total)} tokens`}>
                    {formatTokensShort(provider.tokens.total)}
                  </td>
                  <td className={styles.num}>{formatNumber(provider.messages)}</td>
                  <td className={styles.num}>{formatNumber(provider.models)}</td>
                  <td className={styles.num}>{formatPercent(provider.share)}</td>
                  <td className={styles.num}>{formatCost(provider.cost)}</td>
                  <td className={styles.num}>{providerRate(provider)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
