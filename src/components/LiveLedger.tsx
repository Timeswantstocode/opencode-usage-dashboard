'use client';

import { useEffect, useState } from 'react';
import type { LiveStats } from '@/lib/types';
import { formatTokens, formatUsd } from '@/lib/format';
import s from './LiveLedger.module.css';

function elapsed(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, '0')}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Thin live strip: last turn, today, burn rate and month projection. */
export function LiveLedger({ live }: { live: LiveStats }) {
  const anchor = Date.parse(live.asOf);
  const [now, setNow] = useState(anchor);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live.asOf]);

  const reference = Math.max(now, anchor);
  const lastTurn = live.lastMessageAt ? elapsed(live.lastMessageAt, reference) : 'no turns yet';

  return (
    <section className={s.strip} aria-label="Live usage">
      <span className={s.live}>
        <span className={s.dot} aria-hidden="true" />
        Live
      </span>
      <span className={s.item}>
        <span className={s.label}>Last turn</span>
        <span className={s.value}>{lastTurn}</span>
      </span>
      <span className={s.item}>
        <span className={s.label}>Today</span>
        <span className={s.value}>
          {formatTokens(live.todayTokens)} tokens · {formatUsd(live.todayCost)}
        </span>
      </span>
      <span className={s.item}>
        <span className={s.label}>Burn</span>
        <span className={s.value}>{formatTokens(live.burnPerHour)} tok/hr</span>
      </span>
      <span className={s.item}>
        <span className={s.label}>Projected month</span>
        <span className={s.value}>{formatUsd(live.projectedMonth)}</span>
      </span>
    </section>
  );
}
