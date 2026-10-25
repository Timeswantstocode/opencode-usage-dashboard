'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/format';
import { contributionCells, HEAT_COLORS, type ShareSnapshot } from '@/lib/flexStats';
import { downloadInstagram, downloadPng } from '@/lib/sharePng';
import s from './ShareCard.module.css';

function fallbackCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand('copy');
  } finally {
    area.remove();
  }
}

function tryFallbackCopy(text: string): boolean {
  try {
    return fallbackCopy(text);
  } catch {
    return false;
  }
}

type Status = 'idle' | 'shared' | 'copied' | 'failed';

const STATUS_TEXT: Record<Exclude<Status, 'idle'>, string> = {
  shared: 'Shared',
  copied: 'Summary copied',
  failed: 'Share failed',
};

export function ShareCard({ share, text }: { share: ShareSnapshot; text: string }) {
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  async function copy(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else if (!tryFallbackCopy(text)) throw new Error('clipboard unavailable');
      setStatus('copied');
    } catch {
      setStatus(tryFallbackCopy(text) ? 'copied' : 'failed');
    }
  }

  async function shareStats(): Promise<void> {
    const payload = { title: `opencode — ${share.footer}`, text };
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        setStatus('shared');
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') return;
      }
    }
    await copy();
  }

  const cells = contributionCells(share.days);
  const weeks = Math.max(1, Math.ceil(cells.length / 7));
  const costLabel = share.card === 'metered' ? 'Metered cost' : 'Estimated cost';
  // The hero always shows the active card's computed total; a provider invoice
  // is never headlined here.
  const costValue = share.costLabel;
  const label = `Usage dashboard (${share.footer}): ${share.tokensLabel} tokens, ${costLabel.toLowerCase()} ${costValue}, ${formatNumber(share.sessions)} sessions`;

  return (
    <div className={s.wrap}>
      <section className={s.card} aria-label={label}>
        <div className={s.top}>
          <span className={s.wordmark}>
            opencode<span className={s.mark}>.</span>
          </span>
          <span className={s.kicker}>Usage dashboard / {share.year || '—'}</span>
        </div>

        <div className={s.heroes}>
          <div className={s.hero}>
            <span className={s.bigLabel}>Tokens</span>
            <span className={s.big}>{share.tokensLabel}</span>
          </div>
          <div className={s.hero}>
            <span className={s.bigLabel}>{costLabel}</span>
            <span className={s.big}>{costValue}</span>
          </div>
        </div>

        <div className={s.metrics}>
          {share.stats.map((stat) => (
            <div key={stat.id} className={s.metric}>
              <span className={s.metricLabel}>{stat.label}</span>
              <span className={s.metricValue}>{stat.value}</span>
            </div>
          ))}
        </div>

        <div className={s.stripBox}>
          <div
            className={s.strip}
            role="img"
            aria-label="Daily contribution strip: one cell per day over the last 365 days"
            style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
          >
            {cells.map((cell, index) => {
              // Only days that actually have usage recede. A level-0 day keeps its
              // full-strength --cell-empty tone: it is already a deliberate neutral
              // grey (never a heat step), so dimming it would erase the grid.
              const out = cell !== null && cell.level > 0 && (cell.date < share.rangeFrom || cell.date > share.rangeTo);
              return (
                <span
                  key={cell?.date ?? `pad-${index}`}
                  className={out ? `${s.cell} ${s.cellOut}` : s.cell}
                  style={cell && cell.level > 0 ? { background: `var(--h${cell.level}, ${HEAT_COLORS[cell.level]})` } : undefined}
                />
              );
            })}
          </div>
        </div>

        <div className={s.footer}>
          <span>{share.footer}</span>
        </div>
      </section>

      <div className={s.actions}>
        <button type="button" className={s.button} onClick={() => void shareStats()}>
          {status === 'idle' ? 'Share stats' : STATUS_TEXT[status]}
        </button>
        <button
          type="button"
          className={s.button}
          data-tip="1200 × 630 PNG · landscape share card"
          onClick={() => void downloadPng(share)}
        >
          <span className={s.icon} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </span>
          Share Card
        </button>
        <button
          type="button"
          className={s.button}
          data-tip="1080 × 1350 PNG · Instagram 4:5"
          onClick={() => void downloadInstagram(share)}
        >
          <span className={s.icon} aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </span>
          Post Card
        </button>
        <span className={s.status} role="status" aria-live="polite">
          {status === 'idle' ? '' : STATUS_TEXT[status]}
        </span>
      </div>
    </div>
  );
}
