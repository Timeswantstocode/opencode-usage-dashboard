import { formatDay, formatNumber } from '@/lib/format';
import { formatWindow } from '@/lib/range';
import { localDayKey } from '@/lib/time';
import type { ExtrasResponse } from '@/lib/extras';
import type { RangeKey, StatsRange } from '@/lib/types';
import s from './CodeStats.module.css';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'TODAY',
  '7d': 'LAST 7 DAYS',
  '30d': 'LAST 30 DAYS',
  '90d': 'LAST 90 DAYS',
  all: 'ALL TIME',
};

const decimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function signed(value: number): string {
  return value < 0 ? `-${formatNumber(Math.abs(value))}` : `+${formatNumber(value)}`;
}

type CodeStatsProps = {
  code: ExtrasResponse['code'];
  /** Window the figures were computed for; `custom` names its own days. */
  range: RangeKey | 'custom';
  /** The same window as timestamps, shown on the label's tooltip. */
  rangeWindow?: StatsRange;
};

/** Code output: four figures in the display serif, then the derived ratios. */
export function CodeStats({ code, range, rangeWindow }: CodeStatsProps) {
  const lines = code.additions + code.deletions;
  const perSession = lines / Math.max(1, code.sessionsWithDiff);
  const avgNet = code.sessionsWithDiff > 0 ? code.net / code.sessionsWithDiff : null;
  const windowTip = rangeWindow
    ? `${formatDay(localDayKey(Date.parse(rangeWindow.from)))} – ${formatDay(
        localDayKey(Date.parse(rangeWindow.to)),
      )} · ${formatNumber(rangeWindow.days)} days`
    : undefined;
  const rangeLabel =
    range === 'custom'
      ? rangeWindow
        ? `CUSTOM · ${formatWindow(rangeWindow.from, rangeWindow.to)}`
        : 'CUSTOM'
      : RANGE_LABELS[range];

  const cells = [
    {
      label: 'Lines added',
      value: `+${formatNumber(code.additions)}`,
      tone: s.added,
      tip: 'Lines added\nDiff lines inserted across the recorded sessions',
    },
    {
      label: 'Lines removed',
      value: `-${formatNumber(code.deletions)}`,
      tone: s.removed,
      tip: 'Lines removed\nDiff lines deleted across the recorded sessions',
    },
    {
      label: 'Net lines',
      value: signed(code.net),
      tone: s.plain,
      tip: 'Net lines\nLines added minus lines removed',
    },
    {
      label: 'Files touched',
      value: formatNumber(code.files),
      tone: s.plain,
      tip: 'Files touched\nDistinct files with a recorded diff',
    },
  ];

  return (
    <section className={s.panel} aria-label="Code output">
      <header className={s.head}>
        <div className={s.headText}>
          <p className={s.eyebrow}>Code output</p>
          <p
            className={s.subtitle}
            tabIndex={windowTip ? 0 : undefined}
            data-tip-title={windowTip ? 'Range window' : undefined}
            data-tip={windowTip}
          >
            Lines changed · {rangeLabel}
          </p>
        </div>
        <p className={s.note}>
          {formatNumber(lines)} changed lines across {formatNumber(code.sessionsWithDiff)} sessions
          with changes
        </p>
      </header>

      <dl className={s.grid}>
        {cells.map((cell) => (
          <div className={s.cell} key={cell.label}>
            <dt className={s.label}>{cell.label}</dt>
            <dd className={`${s.value} ${cell.tone}`} tabIndex={0} data-tip={cell.tip}>
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>

      <footer className={s.footer}>
        {code.sessionsWithDiff === 0 ? (
          <p className={s.empty}>no diff summary recorded</p>
        ) : (
          <>
            <p className={s.ratio}>
              <span className={s.footerLabel}>lines per session</span>
              <span className={s.ratioValue}>{decimal.format(perSession)}</span>
            </p>
            <p className={s.ratio}>
              <span className={s.footerLabel}>avg net per session</span>
              <span className={s.ratioValue}>{avgNet === null ? '—' : signed(avgNet)}</span>
            </p>
            {code.largest ? (
              <p className={s.largest}>
                <span className={s.footerLabel}>largest session</span>
                <span className={s.largestTitle} tabIndex={0} data-tip={code.largest.title}>
                  {code.largest.title}
                </span>
                <span className={s.largestDiff}>
                  <span className={s.added}>+{formatNumber(code.largest.additions)}</span>
                  {' / '}
                  <span className={s.removed}>-{formatNumber(code.largest.deletions)}</span>
                </span>
              </p>
            ) : null}
          </>
        )}
      </footer>
    </section>
  );
}
