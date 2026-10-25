import type { Fact, RecordCell } from '@/lib/flexStats';
import s from './RecordsGrid.module.css';

export function RecordsGrid({ records, facts }: { records: RecordCell[]; facts: Fact[] }) {
  return (
    <div className={s.wrap}>
      <dl className={s.grid}>
        {records.map((record) => (
          <div key={record.id} className={s.cell}>
            <dt className={s.label}>{record.label}</dt>
            <dd className={s.value}>{record.value}</dd>
            <dd className={s.sublabel} tabIndex={0} data-tip={record.sublabel}>
              {record.sublabel}
            </dd>
            {record.note ? <dd className={s.note}>{record.note}</dd> : null}
          </div>
        ))}
      </dl>
      <dl className={s.facts}>
        {facts.map((fact) => (
          <div key={fact.id} className={s.fact}>
            <dt className={s.factLabel}>{fact.label}</dt>
            <dd className={s.factValue}>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
