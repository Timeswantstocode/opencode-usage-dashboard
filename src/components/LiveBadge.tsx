'use client';

import { useEffect, useState } from 'react';
import type { LiveStats } from '@/lib/types';
import type { StatsStatus } from '@/lib/useStats';

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Poll health indicator: a 6px accent square while messages are recent, a
 * yellow "idle" state after 60s without one, and red "reconnecting" when the
 * API is failing (the hook keeps retrying with backoff).
 */
export function LiveBadge({ live, status }: { live: LiveStats | null; status: StatsStatus }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const asOf = live ? Date.parse(live.asOf) : Number.NaN;
  const age = Number.isFinite(asOf) ? Math.max(0, Math.floor((now - asOf) / 1000)) : null;
  const idle = live !== null && (live.lagSeconds === null || live.lagSeconds > 60);

  const tone = status === 'error' ? 'error' : live === null ? 'muted' : idle ? 'idle' : 'live';
  const label =
    status === 'error' ? 'reconnecting' : live === null ? 'connecting' : idle ? 'idle' : 'Live';
  const lag = status === 'error' || live === null || idle ? null : '2s';
  const spoken = status === 'error' ? 'Reconnecting' : live === null ? 'Connecting' : idle ? 'Idle' : 'Live';
  const tip = live && live.lagSeconds !== null ? `Last message ${ago(live.lagSeconds)}` : null;

  return (
    <div className={`live-badge is-${tone}`} data-tip={tip ?? undefined} tabIndex={tip ? 0 : undefined}>
      <span className={`live-dot is-${tone}`} aria-hidden="true" />
      <span className="live-label">
        {label}
        {lag ? <span className="live-lag"> · {lag}</span> : null}
      </span>
      {age !== null ? <span className="live-age">updated {ago(age)}</span> : null}
      <span className="sr-only" aria-live="polite">
        {spoken}
      </span>
    </div>
  );
}
