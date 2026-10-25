import type { StatsResponse } from '@/lib/types';
import { buildInsights } from '@/lib/trends';
import { Anomalies } from '@/components/trends/Anomalies';
import { Blocks } from '@/components/trends/Blocks';
import { CumulativeChart } from '@/components/trends/CumulativeChart';
import { PeriodCompare } from '@/components/trends/PeriodCompare';
import { SessionHistogram } from '@/components/trends/SessionHistogram';
import { WeeklyMonthlyTable } from '@/components/trends/WeeklyMonthlyTable';
import s from './TrendsTab.module.css';

/** Trends: period deltas, cumulative pace, rollups, outliers and block timing. */
export function TrendsTab({ data }: { data: StatsResponse }) {
  const notes = buildInsights(data);

  return (
    <div className={s.root}>
      <PeriodCompare data={data} />

      <div className={`${s.split} ${s.splitWide}`}>
        <CumulativeChart data={data} />
        <Anomalies data={data} />
      </div>

      <WeeklyMonthlyTable data={data} />

      <div className={`${s.split} ${s.splitEven}`}>
        <SessionHistogram data={data} />
        <Blocks data={data} />
      </div>

      <section className={s.panel} aria-labelledby="trends-insights-title">
        <header className={s.head}>
          <div>
            <p className={s.eyebrow}>07 · insights</p>
            <h2 className={s.title} id="trends-insights-title">
              What the ledger says
            </h2>
          </div>
          <p className={s.note}>auto-written from this range</p>
        </header>

        {notes.length === 0 ? (
          <p className={s.empty}>Not enough history for a supported claim yet.</p>
        ) : (
          <ul className={s.list}>
            {notes.map((note) => (
              <li className={s.item} key={note.label}>
                <span className={s.label}>{note.label}</span>
                <p className={s.text}>{note.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
