import { formatNumber, formatTokens, formatUsd } from '@/lib/format';
import { deltaText, deltaTone, periodCompare } from '@/lib/trends';
import type { Delta } from '@/lib/trends';
import type { StatsResponse } from '@/lib/types';
import s from './PeriodCompare.module.css';

function Metric({ label, value, previous, delta, hasPrevious, previousPrefix, previousLabel }: {
  label: string;
  value: string;
  previous: string;
  delta: Delta;
  hasPrevious: boolean;
  previousPrefix: 'previous' | 'typical';
  previousLabel: string;
}) {
  return (
    <div className={s.metric}>
      <span className={s.metricLabel}>{label}</span>
      <div className={s.compare}>
        <div className={s.current}>
          <span className={s.value}>{value}</span>
          <span className={`${s.delta} ${s[hasPrevious ? deltaTone(delta) : 'flat']}`}>
            {hasPrevious ? deltaText(delta) : '—'}
          </span>
        </div>
        {hasPrevious && <span className={s.vsMark} aria-hidden="true">vs</span>}
        <span className={s.previous}>{hasPrevious ? `${previousPrefix} ${previous}` : previousLabel}</span>
      </div>
    </div>
  );
}

/** The selected range against the window immediately before it. */
export function PeriodCompare({ data }: { data: StatsResponse }) {
  const report = periodCompare(data);
  const badge = data.range.key === 'all' ? 'All time' : report.rangeLabel;

  return (
    <section className={s.panel} aria-labelledby="trends-compare-title">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>01 · period compare</p>
          <h2 className={s.title} id="trends-compare-title">
            Now against before
          </h2>
        </div>
        <span className={s.rangeBadge}>{badge}</span>
      </header>

      <div className={s.intro}>
        <h3 className={s.compareTitle}>{report.title}</h3>
        <p className={s.compareDescription}>{report.description}</p>
      </div>

      <div className={s.row}>
        <div className={s.metrics}>
          <Metric
            label="tokens"
            value={formatTokens(report.current.tokens)}
            previous={formatTokens(report.previous.tokens)}
            delta={report.tokens}
            hasPrevious={report.hasPrevious}
            previousPrefix={report.previousPrefix}
            previousLabel={report.previousLabel}
          />
          <Metric
            label="cost"
            value={formatUsd(report.current.cost)}
            previous={formatUsd(report.previous.cost)}
            delta={report.cost}
            hasPrevious={report.hasPrevious}
            previousPrefix={report.previousPrefix}
            previousLabel={report.previousLabel}
          />
          <Metric
            label="sessions"
            value={formatNumber(report.current.sessions)}
            previous={formatNumber(report.previous.sessions)}
            delta={report.sessions}
            hasPrevious={report.hasPrevious}
            previousPrefix={report.previousPrefix}
            previousLabel={report.previousLabel}
          />
        </div>
      </div>
    </section>
  );
}
