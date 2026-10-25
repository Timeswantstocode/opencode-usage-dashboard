import { formatDuration, formatNumber, formatPercent } from '@/lib/format';
import { durationReport } from '@/lib/trends';
import type { StatsResponse } from '@/lib/types';
import s from './SessionHistogram.module.css';

const maxShare = (buckets: { share: number }[]): number =>
  buckets.reduce((max, bucket) => Math.max(max, bucket.share), 0);

/** Session duration distribution across seven buckets. */
export function SessionHistogram({ data }: { data: StatsResponse }) {
  const report = durationReport(data.sessions);
  const peak = maxShare(report.buckets);

  return (
    <section className={s.panel} aria-labelledby="trends-duration-title">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>05 · session length</p>
          <h2 className={s.title} id="trends-duration-title">
            How long sessions run
          </h2>
        </div>
        <p className={s.note}>top {formatNumber(report.total)} sessions</p>
      </header>

      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>Median</span>
          <span className={s.statValue}>{formatDuration(report.medianMs)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>P95</span>
          <span className={s.statValue}>{formatDuration(report.p95Ms)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Longest</span>
          <span className={s.statValue}>{formatDuration(report.longestMs)}</span>
        </div>
      </div>

      {report.total === 0 ? (
        <p className={s.empty}>No sessions in this range.</p>
      ) : (
        <ul className={s.list}>
          {report.buckets.map((bucket) => {
            const width = peak > 0 && bucket.count > 0 ? Math.max(2, (bucket.share / peak) * 100) : 0;
            return (
              <li className={s.item} key={bucket.label}>
                <span className={s.bucket}>{bucket.label}</span>
                <span className={s.track}>
                  <span className={s.fill} style={{ width: `${width}%` }} />
                </span>
                <span className={s.count}>{formatNumber(bucket.count)}</span>
                <span className={s.share}>{formatPercent(bucket.share, 1)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <p className={s.footnote}>Top 300 sessions by tokens · durations run first message to last.</p>
    </section>
  );
}
