import type { LedgerRow } from '@/lib/flexStats';
import s from './FullLedger.module.css';

function changeOf(delta: number): { arrow: string; label: string; tone: 'up' | 'down' | 'flat' } {
  const percent = Math.abs(delta * 100);
  const label = percent >= 1000 ? `${(percent / 1000).toFixed(1)}k%` : `${percent.toFixed(1)}%`;
  if (delta > 0) return { arrow: '▲', label, tone: 'up' };
  if (delta < 0) return { arrow: '▼', label, tone: 'down' };
  return { arrow: '', label, tone: 'flat' };
}

export function FullLedger({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className={s.wrap}>
      <dl className={s.grid}>
        {rows.map((row) => {
          const change = row.delta === undefined ? null : changeOf(row.delta);
          return (
            <div key={row.id} className={s.row}>
              <dt className={s.label}>{row.label}</dt>
              <dd className={s.value}>
                {row.value}
                {row.note ? (
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 9,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.note}
                  </span>
                ) : null}
              </dd>
              <dd className={s.deltaCell}>
                {change ? (
                  <span
                    className={`${s.delta} ${change.tone === 'up' ? s.up : change.tone === 'down' ? s.down : s.flat}`}
                    tabIndex={0}
                    data-tip="Versus the first half of the selected range"
                  >
                    {change.arrow ? `${change.arrow} ` : ''}
                    {change.label}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className={s.note}>
        Cache savings = cacheRead × (input rate − cache rate) on the active card. Hours active merges overlapping
        session intervals with an 8h idle cap; session durations are raw and idle-inclusive. Local time Asia/Kathmandu.
        Deltas compare the last half of the selected range with the first half; session deltas sum daily distinct
        sessions.
      </p>
    </div>
  );
}
