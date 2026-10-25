import { computeFlex } from '@/lib/flexStats';
import type { PricingInfo, StatsResponse } from '@/lib/types';
import { Achievements } from '../flex/Achievements';
import { Distributions } from '../flex/Distributions';
import { FullLedger } from '../flex/FullLedger';
import { PricingEditor } from '../flex/PricingEditor';
import { ProviderLedger } from '../flex/ProviderLedger';
import { RecordsGrid } from '../flex/RecordsGrid';
import { ShareCard } from '../flex/ShareCard';
import s from './FlexTab.module.css';

function SectionHead({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <header className={s.head}>
      <span className={s.index}>{index}</span>
      <h2 className={s.heading}>{title}</h2>
      <span className={s.note}>{note}</span>
    </header>
  );
}

export function FlexTab({ data }: { data: StatsResponse }) {
  const flex = computeFlex(data);
  const pricing = (data as { pricing?: PricingInfo }).pricing;

  return (
    <div className={s.root}>
      <section className={s.section} aria-label="Share card">
        <SectionHead index="01" title="Share card" note="1200 × 630 · PNG" />
        <ShareCard share={flex.share} text={flex.shareText} />
      </section>

      <section className={s.section} aria-label="Records">
        <SectionHead
          index="02"
          title="Records"
          note={`${flex.records.length} records · ${flex.facts.length} facts`}
        />
        <RecordsGrid records={flex.records} facts={flex.facts} />
      </section>

      <section className={s.section} aria-label="Distributions">
        <SectionHead index="03" title="Distributions" note="4 views" />
        <Distributions distributions={flex.distributions} />
      </section>

      <section className={s.section} aria-label="Achievements">
        <SectionHead index="04" title="Achievements" note={`${flex.achievements.length} badges`} />
        <Achievements badges={flex.achievements} />
      </section>

      <ProviderLedger data={data} />

      <section className={s.section} aria-label="Full ledger">
        <SectionHead
          index="05"
          title="Full ledger"
          note={`${flex.ledger.length} metrics · deltas vs first half`}
        />
        <FullLedger rows={flex.ledger} />
      </section>

      <PricingEditor pricing={pricing} />
    </div>
  );
}
