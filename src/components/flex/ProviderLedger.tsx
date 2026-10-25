import { formatNumber, formatPercent, formatTokens, formatUsd } from '@/lib/format';
import type { ProviderStat, StatsResponse } from '@/lib/types';
import s from './ProviderLedger.module.css';

type CostByCard = StatsResponse['totals']['costByCard'];

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

function spendShare(value: number, total: number): number | null {
  return total > 0 ? finite(value) / total : null;
}

function Ledger({ providers, costByCard }: { providers: ProviderStat[]; costByCard?: CostByCard }) {
  const rows = [...providers].sort(
    (a, b) => finite(b.tokens.total) - finite(a.tokens.total) || a.provider.localeCompare(b.provider),
  );
  const estimated = costByCard && Number.isFinite(costByCard.estimated)
    ? costByCard.estimated
    : rows.reduce((sum, row) => sum + finite(row.estimated), 0);
  const metered = costByCard && Number.isFinite(costByCard.metered)
    ? costByCard.metered
    : rows.reduce((sum, row) => sum + finite(row.metered), 0);
  const models = rows.reduce((sum, row) => sum + finite(row.models), 0);
  const tokens = rows.reduce((sum, row) => sum + finite(row.tokens.total), 0);
  const share = Math.min(1, rows.reduce((sum, row) => sum + finite(row.share), 0));
  const totalShare = estimated > 0 ? 1 : null;

  return (
    <div className={s.body}>
      <div className={s.scroll}>
        <table className={s.table}>
          <caption className={s.srOnly}>Estimated and computed spend per provider.</caption>
          <thead>
            <tr>
              <th scope="col" className={s.th}>Provider</th>
              <th scope="col" className={`${s.th} ${s.right}`}>Models</th>
              <th scope="col" className={`${s.th} ${s.right}`}>Tokens</th>
              <th scope="col" className={s.th}>Share</th>
              <th scope="col" className={`${s.th} ${s.right}`}>Estimated</th>
              <th scope="col" className={`${s.th} ${s.right}`}>Computed</th>
              <th scope="col" className={`${s.th} ${s.right}`}>Share of spend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const value = Math.min(1, Math.max(0, finite(row.share)));
              const spend = spendShare(row.estimated, estimated);
              return (
                <tr key={row.provider} className={s.row}>
                  <td className={`${s.td} ${s.provider}`}>{row.provider}</td>
                  <td className={`${s.td} ${s.num}`}>{formatNumber(finite(row.models))}</td>
                  <td
                    className={`${s.td} ${s.num}`}
                    data-tip={`${formatNumber(finite(row.tokens.total))} tokens`}
                  >
                    {formatTokens(finite(row.tokens.total))}
                  </td>
                  <td className={`${s.td} ${s.shareCell}`}>
                    <span className={s.shareWrap}>
                      <span className={s.bar} aria-hidden="true">
                        <span className={s.barFill} style={{ width: `${value * 100}%` }} />
                      </span>
                      <span className={s.shareNum}>{formatPercent(value, 1)}</span>
                    </span>
                  </td>
                  <td className={`${s.td} ${s.num}`}>{formatUsd(finite(row.estimated))}</td>
                  <td className={`${s.td} ${s.num}`}>{formatUsd(finite(row.metered))}</td>
                  <td className={`${s.td} ${s.num} ${s.spendShare}`}>
                    {spend === null ? '—' : formatPercent(spend, 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className={s.total}>
              <td className={`${s.td} ${s.totalLabel}`}>Total</td>
              <td className={`${s.td} ${s.num}`}>{formatNumber(models)}</td>
              <td className={`${s.td} ${s.num}`}>{formatTokens(tokens)}</td>
              <td className={`${s.td} ${s.num}`}>{formatPercent(share, 1)}</td>
              <td className={`${s.td} ${s.num}`}>{formatUsd(estimated)}</td>
              <td className={`${s.td} ${s.num}`}>{formatUsd(metered)}</td>
              <td className={`${s.td} ${s.num} ${s.spendShare}`}>
                {totalShare === null ? '—' : formatPercent(totalShare, 1)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function ProviderLedger({ data }: { data: StatsResponse }) {
  const providers = (data as { providers?: ProviderStat[] }).providers;
  const costByCard = (data.totals as { costByCard?: CostByCard }).costByCard;

  return (
    <section className={s.panel} aria-label="Providers">
      <header className={s.head}>
        <h2 className={s.title}>Providers</h2>
        <p className={s.subtitle}>Where the tokens actually went.</p>
      </header>
      {providers === undefined ? (
        <p className={s.empty}>Provider breakdown is not available yet.</p>
      ) : providers.length === 0 ? (
        <p className={s.empty}>No provider usage in this range.</p>
      ) : (
        <Ledger providers={providers} costByCard={costByCard} />
      )}
    </section>
  );
}
