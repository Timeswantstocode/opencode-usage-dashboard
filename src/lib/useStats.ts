'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardId, RangeKey, StatsResponse } from './types';

export type StatsParams = {
  range: RangeKey;
  /** Custom window start, local `YYYY-MM-DD`; pair it with `to`. */
  from?: string;
  /** Custom window end, local `YYYY-MM-DD`, inclusive. */
  to?: string;
  card: CardId;
  /** Project slug, or `all`. */
  project: string;
  /** Lowercase provider id, or `all`. */
  provider: string;
};

export type StatsStatus = 'loading' | 'ready' | 'error';

export type UseStatsResult = {
  data: StatsResponse | null;
  status: StatsStatus;
  /** Client clock of the last successful response, ms. */
  updatedAt: number | null;
  refresh: () => void;
};

const POLL_MS = 2000;
/** Retry schedule after a failed poll; the last value caps every later wait. */
const BACKOFF_MS = [2000, 4000, 8000, 10000] as const;

/**
 * Live stats hook: fetches immediately, then every 2s while the page is
 * visible. Requests are serialized with an AbortController plus a sequence
 * number so a slow response can never overwrite a newer one. Errors keep the
 * last good payload and retry with capped exponential backoff.
 */
export function useStats({ range, from, to, card, project, provider }: StatsParams): UseStatsResult {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [status, setStatus] = useState<StatsStatus>('loading');
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const seqRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const failuresRef = useRef(0);
  const retryAfterRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    // A paired from/to is a custom window and wins over the preset range.
    const bounds =
      from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `range=${encodeURIComponent(range)}`;
    const query = `${bounds}&card=${encodeURIComponent(card)}&project=${encodeURIComponent(project)}&provider=${encodeURIComponent(provider)}`;

    const seq = seqRef.current + 1;
    seqRef.current = seq;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch(`/api/stats?${query}`, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`stats request failed: ${response.status}`);
      const next = (await response.json()) as StatsResponse;
      if (!mountedRef.current || seq !== seqRef.current) return;

      failuresRef.current = 0;
      retryAfterRef.current = 0;
      setData(next);
      setStatus('ready');
      setUpdatedAt(Date.now());
    } catch {
      if (controller.signal.aborted || seq !== seqRef.current || !mountedRef.current) return;

      const wait = BACKOFF_MS[Math.min(failuresRef.current, BACKOFF_MS.length - 1)];
      failuresRef.current += 1;
      retryAfterRef.current = Date.now() + wait;
      setStatus('error');
    }
  }, [range, from, to, card, project, provider]);

  // Fetch on mount and immediately on any filter change.
  useEffect(() => {
    mountedRef.current = true;
    failuresRef.current = 0;
    retryAfterRef.current = 0;
    void load();
    return () => {
      mountedRef.current = false;
      seqRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [load]);

  // Poll every 2s, pause while the tab is hidden, and respect the backoff
  // deadline after failures.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = (): void => {
      if (document.hidden || Date.now() < retryAfterRef.current) return;
      void load();
    };

    const start = (): void => {
      if (timer !== null) return;
      timer = setInterval(tick, POLL_MS);
    };

    const stop = (): void => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = (): void => {
      if (document.hidden) {
        stop();
        return;
      }
      start();
      tick();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const refresh = useCallback((): void => {
    failuresRef.current = 0;
    retryAfterRef.current = 0;
    void load();
  }, [load]);

  return { data, status, updatedAt, refresh };
}
