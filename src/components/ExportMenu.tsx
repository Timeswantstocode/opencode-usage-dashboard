'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { download, toCsv } from '@/lib/export';
import type { CsvValue } from '@/lib/export';
import { localDayKey } from '@/lib/time';
import type { StatsResponse } from '@/lib/types';
import s from './ExportMenu.module.css';

type Kind = 'daily' | 'models' | 'sessions' | 'all';

const ITEMS: ReadonlyArray<{ kind: Kind; label: string }> = [
  { kind: 'daily', label: 'daily.csv' },
  { kind: 'models', label: 'models.csv' },
  { kind: 'sessions', label: 'sessions.csv' },
  { kind: 'all', label: 'all.json' },
];

/** The CSV columns, in the order the menu promises them. */
function csvRows(kind: Exclude<Kind, 'all'>, data: StatsResponse): CsvValue[][] {
  if (kind === 'daily') {
    return [
      ['date', 'input', 'output', 'reasoning', 'cacheRead', 'tokens', 'cost', 'sessions'],
      ...data.daily.map((point) => [
        point.date,
        point.input,
        point.output,
        point.reasoning,
        point.cacheRead,
        point.tokens,
        point.cost,
        point.sessions,
      ]),
    ];
  }

  if (kind === 'models') {
    return [
      [
        'provider',
        'model',
        'variant',
        'input',
        'output',
        'reasoning',
        'cacheRead',
        'tokens',
        'cost',
        'share',
        'rateInput',
        'rateOutput',
        'rateCacheRead',
      ],
      ...data.models.map((model) => [
        model.provider,
        model.model,
        model.variant,
        model.tokens.input,
        model.tokens.output,
        model.tokens.reasoning,
        model.tokens.cacheRead,
        model.tokens.total,
        model.cost,
        model.share,
        model.rate.input,
        model.rate.output,
        model.rate.cacheRead,
      ]),
    ];
  }

  return [
    [
      'id',
      'title',
      'project',
      'agent',
      'model',
      'startedAt',
      'durationMs',
      'messages',
      'tokens',
      'cost',
      'parentId',
    ],
    ...data.sessions.map((session) => [
      session.id,
      session.title,
      session.project,
      session.agent,
      session.model,
      session.startedAt,
      session.durationMs,
      session.messages,
      session.tokens,
      session.cost,
      session.parentId,
    ]),
  ];
}

/**
 * Header export control: a flat text button with a caret, opening a list of
 * file downloads. Exports the payload the Sessions tab is already showing.
 */
export function ExportMenu({ data }: { data: StatsResponse }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;

    itemsRef.current[0]?.focus();

    function onPointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const exportAs = (kind: Kind): void => {
    setOpen(false);
    triggerRef.current?.focus();

    const stamp = localDayKey(Date.now());
    if (kind === 'all') {
      download(`opencode-all-${stamp}.json`, `${JSON.stringify(data, null, 2)}\n`, 'application/json');
      return;
    }
    download(`opencode-${kind}-${stamp}.csv`, toCsv(csvRows(kind, data)), 'text/csv');
  };

  const onItemKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const next = (index + offset + ITEMS.length) % ITEMS.length;
    itemsRef.current[next]?.focus();
  };

  return (
    <div className={s.bar}>
      <div className={s.menu} ref={rootRef}>
        <button
          ref={triggerRef}
          type="button"
          className={s.trigger}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          Export
          <span className={s.caret} aria-hidden="true">
            ▾
          </span>
        </button>

        {open ? (
          <div className={s.list} role="menu" aria-label="Export usage data">
            {ITEMS.map((item, index) => (
              <button
                key={item.kind}
                ref={(element) => {
                  itemsRef.current[index] = element;
                }}
                type="button"
                role="menuitem"
                className={s.item}
                onClick={() => exportAs(item.kind)}
                onKeyDown={(event) => onItemKeyDown(event, index)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
