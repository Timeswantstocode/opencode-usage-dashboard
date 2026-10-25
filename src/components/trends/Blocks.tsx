import { formatTokens, formatUsd } from '@/lib/format';
import { blockReport } from '@/lib/trends';
import type { StatsResponse } from '@/lib/types';
import s from './Blocks.module.css';

const dayFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

/** Sessions bucketed by the 5-hour window in which they started. */
export function Blocks({ data }: { data: StatsResponse }) {
  const report = blockReport(data.sessions);
  const peak = report.buckets.reduce((max, bucket) => Math.max(max, bucket.tokens), 0);
  const heaviest = report.heaviest;

  return (
    <section className={s.panel} aria-labelledby="trends-blocks-title">
      <header className={s.head}>
        <div>
          <p className={s.eyebrow}>06 · 5-hour blocks · approximate</p>
          <h2 className={s.title} id="trends-blocks-title">
            When the work happens
          </h2>
        </div>
        <p className={s.note}>all days · by start</p>
      </header>

      {data.sessions.length === 0 ? (
        <p className={s.empty}>No sessions in this range.</p>
      ) : (
        <>
          <ol className={s.chart} aria-label="Tokens by five-hour window start, local time">
            {report.buckets.map((bucket) => (
              <li className={s.col} key={bucket.start}>
                <span className="sr-only">
                  {bucket.span}: {formatTokens(bucket.tokens)} tokens
                </span>
                <span className={s.amount} aria-hidden="true">
                  {bucket.tokens > 0 ? formatTokens(bucket.tokens) : '—'}
                </span>
                <span className={s.barWrap} aria-hidden="true">
                  <span
                    className={s.bar}
                    style={{ height: `${bucket.tokens > 0 ? Math.max(1.5, (bucket.tokens / peak) * 100) : 0}%` }}
                  />
                </span>
                <span className={s.window} aria-hidden="true">
                  {bucket.label}
                </span>
              </li>
            ))}
          </ol>

          <div className={s.callout}>
            <p className={s.calloutLabel}>Heaviest block</p>
            {heaviest ? (
              <>
                <p className={s.calloutDate}>{dayFormat.format(parseDay(heaviest.date))}</p>
                <p className={s.calloutWindow}>{heaviest.span}</p>
                <p className={s.calloutNums}>
                  {formatTokens(heaviest.tokens)} tokens · {formatUsd(heaviest.cost)}
                </p>
              </>
            ) : (
              <p className={s.calloutNums}>No block recorded.</p>
            )}
          </div>
        </>
      )}

      <p className={s.footnote}>
        Approximate: a session is counted in the block in which it started, in local time. OpenCode has no billing
        windows.
      </p>
    </section>
  );
}
