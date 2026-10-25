'use client';

import { useEffect, useRef, useState } from 'react';
import { formatNumber, formatTokens } from '@/lib/format';
import type { PricingInfo, Rate } from '@/lib/types';
import s from './PricingEditor.module.css';

type UnknownModel = { provider: string; model: string; tokens: number; messages: number };

type PricingResponse = {
  fallback?: Rate;
  fallbackLabel?: string;
  models?: Record<string, Rate>;
  unknown?: UnknownModel[];
  path?: string;
};

type Draft = { input: string; output: string; cacheRead: string };
type FallbackDraft = Draft & { label: string };
type Status = 'loading' | 'ready' | 'error';

const EMPTY_DRAFT: Draft = { input: '', output: '', cacheRead: '' };

const finite = (value: number): number => (Number.isFinite(value) ? value : 0);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function rateText(rate: Rate | undefined, key: keyof Rate): string {
  const value = rate?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

function isRateValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0;
}

/** All three fields must be non-negative finite numbers before a save is allowed. */
function parseRate(draft: Draft): Rate | null {
  if (!isRateValue(draft.input) || !isRateValue(draft.output) || !isRateValue(draft.cacheRead)) return null;
  return {
    input: Number(draft.input),
    output: Number(draft.output),
    cacheRead: Number(draft.cacheRead),
  };
}

function RateInput({
  value,
  label,
  invalid,
  onChange,
}: {
  value: string;
  label?: string;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <input
      className={invalid ? `${s.input} ${s.invalid}` : s.input}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      aria-invalid={invalid || undefined}
    />
  );
}

export function PricingEditor({ pricing }: { pricing?: PricingInfo }) {
  const [status, setStatus] = useState<Status>('loading');
  const [fallback, setFallback] = useState<FallbackDraft | null>(null);
  const [rows, setRows] = useState<UnknownModel[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loadedPath, setLoadedPath] = useState('');
  const [loadedOverrides, setLoadedOverrides] = useState<number | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [reloading, setReloading] = useState(false);
  const initialLabel = useRef('');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/pricing', {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`pricing request failed: ${response.status}`);
        const payload = (await response.json()) as PricingResponse;
        if (controller.signal.aborted) return;
        const next: FallbackDraft = {
          label: typeof payload.fallbackLabel === 'string' ? payload.fallbackLabel : '',
          input: rateText(payload.fallback, 'input'),
          output: rateText(payload.fallback, 'output'),
          cacheRead: rateText(payload.fallback, 'cacheRead'),
        };
        // Without a fallback rate the pricing file is unusable for this editor.
        if (next.input === '' || next.output === '' || next.cacheRead === '') {
          throw new Error('fallback rate missing');
        }
        const unknown = Array.isArray(payload.unknown) ? payload.unknown : [];
        const seeded: Record<string, Draft> = {};
        for (const row of unknown) {
          seeded[row.model] = { input: next.input, output: next.output, cacheRead: next.cacheRead };
        }
        initialLabel.current = next.label;
        setFallback(next);
        setRows(unknown);
        setDrafts(seeded);
        setLoadedPath(typeof payload.path === 'string' ? payload.path : '');
        setLoadedOverrides(payload.models && typeof payload.models === 'object'
          ? Object.keys(payload.models).length
          : null);
        setStatus('ready');
      } catch {
        if (controller.signal.aborted) return;
        setStatus('error');
      }
    })();
    return () => controller.abort();
  }, []);

  const later = (fn: () => void, ms: number): void => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const finishSave = (key: string): void => {
    setSaving(null);
    setSaved(key);
    setReloading(true);
    later(() => setSaved(null), 2000);
    later(() => window.location.reload(), 600);
  };

  const send = async (body: unknown): Promise<boolean> => {
    setError('');
    try {
      const response = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        let message = `save failed (${response.status})`;
        try {
          const payload = (await response.json()) as { error?: unknown; message?: unknown };
          if (typeof payload.message === 'string' && payload.message.trim() !== '') message = payload.message;
          else if (typeof payload.error === 'string' && payload.error.trim() !== '') message = payload.error;
        } catch {
          // The body may be empty or HTML; the status is enough.
        }
        setError(message);
        return false;
      }
      return true;
    } catch {
      setError('save failed — /api/pricing did not answer.');
      return false;
    }
  };

  const saveFallback = async (): Promise<void> => {
    if (!fallback) return;
    const rate = parseRate(fallback);
    if (!rate) return;
    const label = fallback.label.trim();
    // The label rides inside the fallback object and only when it actually changed.
    const body = {
      fallback: label !== '' && label !== initialLabel.current ? { ...rate, label } : rate,
    };
    setSaving('fallback');
    if (await send(body)) finishSave('fallback');
    else setSaving(null);
  };

  const saveRow = async (model: string): Promise<void> => {
    const rate = parseRate(drafts[model] ?? EMPTY_DRAFT);
    if (!rate) return;
    setSaving(model);
    if (await send({ models: { [model]: rate } })) finishSave(model);
    else setSaving(null);
  };

  const setDraft = (model: string, next: Draft): void => {
    setDrafts((current) => ({ ...current, [model]: next }));
  };

  const busy = saving !== null || reloading;
  const fallbackRate = fallback ? parseRate(fallback) : null;
  const path = pricing?.path ? pricing.path : loadedPath;
  const overrides = isNumber(pricing?.overrides) ? pricing.overrides : loadedOverrides;

  return (
    <section className={s.panel} aria-label="Pricing">
      <header className={s.head}>
        <h2 className={s.title}>Pricing</h2>
        <p className={s.subtitle}>Unknown models are priced at the fallback until you set a rate.</p>
      </header>

      {status === 'loading' ? (
        <p className={s.line}>Loading pricing…</p>
      ) : status === 'error' || fallback === null ? (
        <p className={s.line}>Pricing is unavailable — /api/pricing did not answer.</p>
      ) : (
        <>
          <div className={s.block}>
            <div className={s.blockHead}>
              <h3 className={s.blockTitle}>Fallback</h3>
              <span className={s.blockNote}>USD per 1M tokens</span>
            </div>
            <div className={s.fields}>
              <label className={`${s.field} ${s.labelField}`}>
                <span className={s.fieldLabel}>Label</span>
                <RateInput
                  value={fallback.label}
                  invalid={false}
                  onChange={(value) => setFallback({ ...fallback, label: value })}
                />
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>Input</span>
                <RateInput
                  value={fallback.input}
                  invalid={fallback.input.trim() !== '' && !isRateValue(fallback.input)}
                  onChange={(value) => setFallback({ ...fallback, input: value })}
                />
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>Output</span>
                <RateInput
                  value={fallback.output}
                  invalid={fallback.output.trim() !== '' && !isRateValue(fallback.output)}
                  onChange={(value) => setFallback({ ...fallback, output: value })}
                />
              </label>
              <label className={s.field}>
                <span className={s.fieldLabel}>Cached</span>
                <RateInput
                  value={fallback.cacheRead}
                  invalid={fallback.cacheRead.trim() !== '' && !isRateValue(fallback.cacheRead)}
                  onChange={(value) => setFallback({ ...fallback, cacheRead: value })}
                />
              </label>
            </div>
            <div className={s.actions}>
              <button
                type="button"
                className={s.button}
                onClick={() => void saveFallback()}
                disabled={busy || fallbackRate === null}
              >
                Save fallback
              </button>
              {saved === 'fallback' ? (
                <span className={s.saved}>saved{reloading ? ' · reloading…' : ''}</span>
              ) : null}
            </div>
          </div>

          <div className={s.block}>
            <div className={s.blockHead}>
              <h3 className={s.blockTitle}>Unknown models</h3>
              <span className={s.blockNote}>
                {rows.length === 0 ? 'None' : `${formatNumber(rows.length)} awaiting a rate`}
              </span>
            </div>
            {rows.length === 0 ? (
              <p className={s.lineInline}>No unknown models — every model has a rate.</p>
            ) : (
              <div className={s.scroll}>
                <table className={s.table}>
                  <caption className={s.srOnly}>
                    Models without a rate. Each is priced at the fallback until a rate is saved.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className={s.th}>Provider</th>
                      <th scope="col" className={s.th}>Model</th>
                      <th scope="col" className={`${s.th} ${s.right}`}>Tokens</th>
                      <th scope="col" className={`${s.th} ${s.right}`}>Messages</th>
                      <th scope="col" className={`${s.th} ${s.right}`}>Input</th>
                      <th scope="col" className={`${s.th} ${s.right}`}>Output</th>
                      <th scope="col" className={`${s.th} ${s.right}`}>Cached</th>
                      <th scope="col" className={s.th}>
                        <span className={s.srOnly}>Save</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const draft = drafts[row.model] ?? EMPTY_DRAFT;
                      const valid = parseRate(draft) !== null;
                      return (
                        <tr key={`${row.provider}/${row.model}`} className={s.row}>
                          <td className={`${s.td} ${s.provider}`}>{row.provider}</td>
                          <td className={`${s.td} ${s.modelCell}`}>{row.model}</td>
                          <td
                            className={`${s.td} ${s.num}`}
                            data-tip={`${formatNumber(finite(row.tokens))} tokens`}
                          >
                            {formatTokens(finite(row.tokens))}
                          </td>
                          <td className={`${s.td} ${s.num}`}>{formatNumber(finite(row.messages))}</td>
                          <td className={`${s.td} ${s.rateCell}`}>
                            <RateInput
                              value={draft.input}
                              label={`${row.model} input, USD per 1M tokens`}
                              invalid={!isRateValue(draft.input)}
                              onChange={(value) => setDraft(row.model, { ...draft, input: value })}
                            />
                          </td>
                          <td className={`${s.td} ${s.rateCell}`}>
                            <RateInput
                              value={draft.output}
                              label={`${row.model} output, USD per 1M tokens`}
                              invalid={!isRateValue(draft.output)}
                              onChange={(value) => setDraft(row.model, { ...draft, output: value })}
                            />
                          </td>
                          <td className={`${s.td} ${s.rateCell}`}>
                            <RateInput
                              value={draft.cacheRead}
                              label={`${row.model} cached, USD per 1M tokens`}
                              invalid={!isRateValue(draft.cacheRead)}
                              onChange={(value) => setDraft(row.model, { ...draft, cacheRead: value })}
                            />
                          </td>
                          <td className={`${s.td} ${s.actionCell}`}>
                            <button
                              type="button"
                              className={s.button}
                              onClick={() => void saveRow(row.model)}
                              disabled={!valid || busy}
                            >
                              {saving === row.model ? 'Saving…' : 'Save'}
                            </button>
                            {saved === row.model ? (
                              <span className={s.saved}>saved{reloading ? ' · reloading…' : ''}</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error ? (
            <p className={s.error} role="alert">
              {error}
            </p>
          ) : null}

          {path || overrides !== null ? (
            <footer className={s.footer}>
              {path ? <span className={s.path}>{path}</span> : null}
              {overrides !== null ? (
                <span className={s.overrides}>{formatNumber(overrides)} overrides</span>
              ) : null}
            </footer>
          ) : null}
        </>
      )}
    </section>
  );
}
