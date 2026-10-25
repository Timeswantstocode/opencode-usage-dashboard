import type { StatsResponse } from '@/lib/types';
import { LiveLedger } from '@/components/LiveLedger';
import { OverviewStats } from '@/components/OverviewStats';
import { Calendar365 } from '@/components/charts/Calendar365';
import { DailyChart } from '@/components/charts/DailyChart';
import { HourOfDay } from '@/components/charts/HourOfDay';
import { WeekdayChart } from '@/components/charts/WeekdayChart';
import { rangeLabel } from '@/lib/range';
import s from './OverviewTab.module.css';

/** Overview: live strip, the twelve key figures, daily bars, calendar and when the work happens. */
export function OverviewTab({ data }: { data: StatsResponse }) {
  // Only the year calendar reads the range-independent block now; the rest follow the range.
  const series = data.series ?? { daily: data.daily, hourly: data.hourly, calendar: data.calendar };
  const label = rangeLabel(data);

  return (
    <div className={s.root}>
      <div className={s.top}>
        <LiveLedger live={data.live} />
        <OverviewStats data={data} />
      </div>
      <DailyChart daily={data.daily} />
      <section className={s.when} aria-label="When usage happens">
        <div className={s.duo}>
          <HourOfDay hourly={data.hourly} label={label} />
          <WeekdayChart hourly={data.hourly} label={label} />
        </div>
        <p className={s.note}>
          Each cell was one weekday-hour combination before; these bars split that same data into hour of day
          and day of week so the pattern is readable.
        </p>
      </section>
      <Calendar365 days={series.calendar} daily={series.daily} range={data.range} />
    </div>
  );
}
