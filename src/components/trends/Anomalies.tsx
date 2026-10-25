import { formatDay, formatTokens, formatUsd } from '@/lib/format';
import { anomalyReport, liveDaily } from '@/lib/trends';
import type { StatsResponse } from '@/lib/types';
import s from './Anomalies.module.css';

/** Days more than 2σ from the mean daily cost. */
export function Anomalies({ data }: { data: StatsResponse }) {
  const report = anomalyReport(liveDaily(data));

  return (
    <section className={s.panel} aria-labelledby="trends-anomalies-title">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>03 · anomalies</p>
          <h2 className={s.title} id="trends-anomalies-title">
            Days outside the band
          </h2>
        </div>
        <p className={s.note}>{report.activeDays} active days</p>
      </header>

      {!report.ready ? (
        <p className={s.empty}>
          Not enough history. Anomalies need at least eight days; this range has {report.days}.
        </p>
      ) : (
        <div className={s.body}>
          <dl className={s.summary}>
            <div className={s.stat}>
              <dt>Mean / day</dt>
              <dd>{formatUsd(report.mean)}</dd>
            </div>
            <div className={s.stat}>
              <dt>Median / day</dt>
              <dd>{formatUsd(report.median)}</dd>
            </div>
            <div className={s.stat}>
              <dt>σ</dt>
              <dd>{formatUsd(report.sigma)}</dd>
            </div>
          </dl>

          {report.items.length === 0 ? (
            <p className={s.quiet}>No day crossed the 2σ band in this range.</p>
          ) : (
            <table className={s.table}>
              <caption className="sr-only">Days with cost more than two standard deviations from the mean.</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Signal</th>
                  <th scope="col" className={s.right}>Cost</th>
                  <th scope="col" className={s.right}>Z</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => (
                  <tr key={item.date}>
                    <th scope="row">{formatDay(item.date)}</th>
                    <td>
                      <span className={item.kind === 'high' ? `${s.signal} ${s.high}` : `${s.signal} ${s.low}`}>
                        {item.kind === 'high' ? 'cost anomaly' : 'quiet day'}
                      </span>
                      <span className={s.tokens}>{formatTokens(item.tokens)} tok</span>
                    </td>
                    <td className={s.right}>{formatUsd(item.cost)}</td>
                    <td className={`${s.right} ${s.z}`}>
                      {item.z > 0 ? '+' : '−'}
                      {Math.abs(item.z).toFixed(1)}σ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className={s.footnote}>Mean and σ use days with cost above zero. Population σ.</p>
        </div>
      )}
    </section>
  );
}
