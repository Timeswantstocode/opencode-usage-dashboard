'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCost } from '@/components/tables/DataTable';
import { formatDuration, formatNumber, formatTokens, formatUsdExact } from '@/lib/format';
import type { SessionDetail } from '@/lib/sessionDetail';
import { formatLocal } from '@/lib/time';
import type { CardId, SessionStat } from '@/lib/types';
import styles from './SessionDrawer.module.css';

type Status = 'loading' | 'ready' | 'error';

type SessionDrawerProps = {
  session: SessionStat;
  /** Rate card for the per-model and per-subagent costs. */
  card: CardId;
  onClose: () => void;
};

/** `0.4 ms`, `83 ms`, `2.1 s`; null when the calls carried no timestamps. */
function formatMs(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) return '0 ms';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function tokenCells(detail: SessionDetail) {
  return [
    { label: 'Input', value: detail.tokens.input },
    { label: 'Output', value: detail.tokens.output },
    { label: 'Reasoning', value: detail.tokens.reasoning },
    { label: 'Cache read', value: detail.tokens.cacheRead },
    { label: 'Cache write', value: detail.tokens.cacheWrite },
    { label: 'Total', value: detail.tokens.total },
  ];
}

/**
 * Right-side session drill-down. Portalled to the body so the Sessions tab's
 * inline-size container cannot trap the fixed overlay. The header renders the
 * row's own summary immediately; detail sections fill in once the API answers.
 */
export function SessionDrawer({ session, card, onClose }: SessionDrawerProps) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // Capture the opener, move focus inside, and stop the page scrolling behind.
  useEffect(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      const restore = restoreRef.current;
      if (restore?.isConnected) restore.focus();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setDetail(null);

    const load = async (): Promise<void> => {
      try {
        const query = `?card=${encodeURIComponent(card)}`;
        const response = await fetch(`/api/session/${encodeURIComponent(session.id)}${query}`, {
          cache: 'no-store',
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`session request failed: ${response.status}`);
        const next = (await response.json()) as SessionDetail;
        if (controller.signal.aborted) return;
        setDetail(next);
        setStatus('ready');
      } catch {
        if (controller.signal.aborted) return;
        setStatus('error');
      }
    };

    void load();
    return () => controller.abort();
  }, [session.id, card]);

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const meta = detail ?? session;
  const peak = detail ? detail.timeline.reduce((max, point) => Math.max(max, point.tokens), 0) : 0;
  const peakHour = detail?.timeline.find((point) => point.tokens === peak)?.hour ?? '00';

  return createPortal(
    <div className={styles.root}>
      <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />

      <section
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className={styles.head}>
          <div className={styles.headMain}>
            <p className={styles.eyebrow}>
              {meta.project} · {meta.agent} · {meta.model}
            </p>
            <h2 className={styles.title} id={titleId}>
              {meta.title || 'Untitled'}
            </h2>
            <p className={styles.meta}>
              <span>{formatDuration(meta.durationMs)}</span>
              <span aria-hidden="true"> · </span>
              <span>{formatLocal(Date.parse(meta.startedAt))}</span>
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close session detail"
          >
            ✕
          </button>
        </header>

        <div className={styles.body}>
          {status === 'loading' ? (
            <div className={styles.skeleton} aria-busy="true" aria-label="Loading session detail">
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLine} />
            </div>
          ) : null}

          {status === 'error' ? (
            <p className={styles.error} role="status">
              Session detail unavailable. The API did not answer for this id.
            </p>
          ) : null}

          {status === 'ready' && detail ? (
            <>
              <section className={styles.section} aria-label="Token totals">
                <div className={styles.cells}>
                  {tokenCells(detail).map((cell) => (
                    <div className={styles.cell} key={cell.label}>
                      <span className={styles.cellLabel}>{cell.label}</span>
                      <span className={styles.cellValue} tabIndex={0} data-tip={`${formatNumber(cell.value)} tokens`}>
                        {formatTokens(cell.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={styles.section} aria-label="Tokens by local hour">
                <h3 className={styles.sectionTitle}>Local hours</h3>
                <div
                  className={styles.timeline}
                  role="img"
                  aria-label={`Tokens by local hour; peak ${formatNumber(peak)} at ${peakHour}:00`}
                >
                  {detail.timeline.map((point) => {
                    const height = peak > 0 ? Math.max(3, Math.round((point.tokens / peak) * 100)) : 0;
                    return (
                      <span
                        key={point.hour}
                        className={point.tokens > 0 ? styles.bar : styles.barEmpty}
                        style={point.tokens > 0 ? { height: `${height}%` } : undefined}
                        data-tip={`${point.hour}:00 · ${formatNumber(point.tokens)} tokens`}
                        aria-hidden="true"
                      />
                    );
                  })}
                </div>
                <div className={styles.axis} aria-hidden="true">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>23</span>
                </div>
              </section>

              <section className={styles.section} aria-label="Models used">
                <h3 className={styles.sectionTitle}>Models</h3>
                {detail.models.length === 0 ? (
                  <p className={styles.empty}>No model usage recorded.</p>
                ) : (
                  <div className={styles.scroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Model</th>
                          <th scope="col" className={styles.num}>
                            Tokens
                          </th>
                          <th scope="col" className={styles.num}>
                            Cost
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.models.map((model) => (
                          <tr key={`${model.provider}\u0000${model.model}\u0000${model.variant}`}>
                            <td>
                              <span className={styles.modelName} data-tip={model.model}>
                                {model.model}
                              </span>
                              <span className={styles.modelMeta}>
                                {model.provider}
                                {model.variant ? ` · ${model.variant}` : ''}
                              </span>
                            </td>
                            <td className={styles.num} data-tip={`${formatNumber(model.tokens.total)} tokens`}>
                              {formatTokens(model.tokens.total)}
                            </td>
                            <td className={styles.num} data-tip={formatUsdExact(model.cost)}>
                              {formatCost(model.cost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className={styles.section} aria-label="Tool calls">
                <h3 className={styles.sectionTitle}>Tools</h3>
                {detail.tools.length === 0 ? (
                  <p className={styles.empty}>No tool calls recorded for this session.</p>
                ) : (
                  <div className={styles.scroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Tool</th>
                          <th scope="col" className={styles.num}>
                            Calls
                          </th>
                          <th scope="col" className={styles.num}>
                            Errors
                          </th>
                          <th scope="col" className={styles.num}>
                            p50
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.tools.map((tool) => (
                          <tr key={tool.name}>
                            <td className={styles.toolName} data-tip={tool.name}>
                              {tool.name}
                            </td>
                            <td className={styles.num}>{formatNumber(tool.calls)}</td>
                            <td className={styles.num}>{formatNumber(tool.errors)}</td>
                            <td className={styles.num}>{formatMs(tool.p50Ms)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className={styles.section} aria-label="Subagent sessions">
                <h3 className={styles.sectionTitle}>Subagents</h3>
                {detail.subagents.length === 0 ? (
                  <p className={styles.empty}>No subagent sessions.</p>
                ) : (
                  <ul className={styles.subagents}>
                    {detail.subagents.map((child) => (
                      <li className={styles.subagent} key={child.id}>
                        <span className={styles.arrow} aria-hidden="true">
                          ↳
                        </span>
                        <span className={styles.subagentTitle} tabIndex={0} data-tip={child.title}>
                          {child.title}
                        </span>
                        <span
                          className={styles.subagentNum}
                          tabIndex={0}
                          data-tip={`${formatNumber(child.tokens)} tokens`}
                        >
                          {formatTokens(child.tokens)}
                        </span>
                        <span className={styles.subagentCost} tabIndex={0} data-tip={formatUsdExact(child.cost)}>
                          {formatCost(child.cost)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
}
