import { formatPercent, formatTokens } from '@/lib/format';
import type { CompositionSlice, Distributions } from '@/lib/flexStats';
import s from './Distributions.module.css';

const COLORS: Record<CompositionSlice['id'], string> = {
  input: 'var(--blue, #6ba1e6)',
  output: 'var(--accent, #ec5b2b)',
  reasoning: 'var(--yellow, #e5c07b)',
  cacheRead: 'var(--cyan, #56b6c2)',
};

function weekdaySummary(weekday: Distributions['weekday']): string {
  const total = weekday.reduce((sum, day) => sum + day.tokens, 0);
  const peak = weekday.reduce((best, day) => (day.tokens > best.tokens ? day : best), weekday[0]);
  return peak && total > 0
    ? `Tokens by weekday. ${peak.label} is busiest with ${formatPercent(peak.tokens / total, 1)} of the week.`
    : 'Tokens by weekday. No activity in range.';
}

export function Distributions({ distributions }: { distributions: Distributions }) {
  const { composition, weekday, hours, models } = distributions;
  const weekdayTotal = weekday.reduce((sum, day) => sum + day.tokens, 0);
  const weekdayMax = Math.max(1, ...weekday.map((day) => day.tokens));
  const hourTotal = hours.reduce((sum, hour) => sum + hour.tokens, 0);
  const hourMax = Math.max(1, ...hours.map((hour) => hour.tokens));
  const peakHour = hours.find((hour) => hour.peak);
  const modelMax = Math.max(1, ...models.map((model) => model.tokens));
  const topModel = models.find((model) => !model.other);
  const modelSummary = models.map((model) => `${model.label} ${formatPercent(model.share, 1)}`).join(', ');

  return (
    <div className={s.grid}>
      <section className={s.panel} aria-label="Token composition">
        <h3 className={s.title}>Token composition</h3>
        <div
          className={s.stack}
          role="img"
          aria-label={`Token composition: ${composition.slices
            .map((slice) => `${slice.label} ${formatPercent(slice.share, 1)}`)
            .join(', ')}`}
        >
          {composition.total > 0 ? (
            composition.slices.map((slice) => (
              <span
                key={slice.id}
                className={s.segment}
                style={{ width: `${slice.share * 100}%`, background: COLORS[slice.id] }}
                tabIndex={0}
                data-tip={`${slice.label}: ${formatTokens(slice.tokens)} tokens (${formatPercent(slice.share, 1)})`}
              />
            ))
          ) : (
            <span className={s.emptyTrack} />
          )}
        </div>
        <ul className={s.legend}>
          {composition.slices.map((slice) => (
            <li key={slice.id} className={s.legendItem}>
              <span className={s.swatch} style={{ background: COLORS[slice.id] }} aria-hidden="true" />
              <span className={s.legendLabel}>{slice.label}</span>
              <span className={s.legendValue}>{formatPercent(slice.share, 1)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.panel} aria-label="Tokens by weekday">
        <h3 className={s.title}>Weekday</h3>
        <div className={s.week} role="img" aria-label={weekdaySummary(weekday)}>
          {weekday.map((day) => (
            <div key={day.dow} className={s.weekCol}>
              <div className={s.weekTrack}>
                <div
                  className={s.weekBar}
                  style={{ height: day.tokens > 0 ? `${Math.max(3, (day.tokens / weekdayMax) * 100)}%` : 0 }}
                  tabIndex={0}
                  data-tip={`${day.label}: ${formatTokens(day.tokens)} tokens (${formatPercent(weekdayTotal > 0 ? day.tokens / weekdayTotal : 0, 1)})`}
                />
              </div>
              <span className={s.axis}>{day.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={s.panel} aria-label="Tokens by hour of day">
        <h3 className={s.title}>Hour of day</h3>
        <div
          className={s.hours}
          role="img"
          aria-label={
            peakHour && hourTotal > 0
              ? `Tokens by hour of day. Peak ${String(peakHour.hour).padStart(2, '0')}:00 with ${formatPercent(peakHour.tokens / hourTotal, 1)} of tokens.`
              : 'Tokens by hour of day. No activity in range.'
          }
        >
          {hours.map((hour) => (
            <span
              key={hour.hour}
              className={hour.peak ? s.hourPeak : s.hourBar}
              style={{ height: hour.tokens > 0 ? `${Math.max(3, (hour.tokens / hourMax) * 100)}%` : 0 }}
              tabIndex={0}
              data-tip={`${String(hour.hour).padStart(2, '0')}:00: ${formatTokens(hour.tokens)} tokens`}
            />
          ))}
        </div>
        <div className={s.hoursAxis} aria-hidden="true">
          <span>00</span>
          <span>06</span>
          <span>12</span>
          <span>18</span>
          <span>23</span>
        </div>
      </section>

      <section className={s.panel} aria-label="Model share">
        <h3 className={s.title}>Model share</h3>
        {models.length === 0 ? (
          <p className={s.empty}>No model activity in this range.</p>
        ) : (
          <div
            className={s.models}
            role="img"
            aria-label={
              topModel
                ? `Model share. ${topModel.label} leads with ${formatPercent(topModel.share, 1)} of tokens. ${modelSummary}.`
                : 'Model share.'
            }
          >
            {models.map((model) => (
              <div key={model.key} className={s.modelRow}>
                <span className={s.modelName} tabIndex={0} data-tip={model.label}>
                  {model.label}
                </span>
                <span className={s.modelTrack}>
                  <span
                    className={model.other ? s.modelOther : s.modelFill}
                    style={{ width: `${Math.max(1, (model.tokens / modelMax) * 100)}%` }}
                  />
                </span>
                <span className={s.modelValue}>{formatPercent(model.share, 1)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
