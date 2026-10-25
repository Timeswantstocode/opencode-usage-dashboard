'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDay } from '@/lib/format';
import type { RangeKey } from '@/lib/types';

const RANGES: ReadonlyArray<{ key: RangeKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'all', label: 'All' },
];

/** Browser-local `YYYY-MM-DD`; the picker's bounds are calendar days, not UTC. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Shift a `YYYY-MM-DD` day by whole local days. */
function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return dayKey(new Date(year, month - 1, date + delta));
}

function CalendarIcon() {
  return (
    <svg
      className="range-tab-icon"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.5" />
      <path d="M2.25 6.25h11.5M5.25 1.75v3M10.75 1.75v3" />
    </svg>
  );
}

type RangeTabsProps = {
  value: RangeKey | 'custom';
  onChange: (range: RangeKey) => void;
  onCustom: (from: string, to: string) => void;
  customFrom?: string;
  customTo?: string;
  minDate: string;
  maxDate: string;
};

export function RangeTabs({
  value,
  onChange,
  onCustom,
  customFrom,
  customTo,
  minDate,
  maxDate,
}: RangeTabsProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const customActive = value === 'custom';
  const customLabel =
    customFrom && customTo ? `${formatDay(customFrom)} – ${formatDay(customTo)}` : 'Custom';
  const canApply =
    draftFrom !== '' &&
    draftTo !== '' &&
    draftFrom >= minDate &&
    draftTo <= maxDate &&
    draftFrom <= draftTo;

  function openPicker(): void {
    if (open) {
      setOpen(false);
      return;
    }
    const nextTo = customTo ?? maxDate;
    const nextFrom = customFrom ?? shiftDay(maxDate, -7);
    setDraftFrom(nextFrom < minDate ? minDate : nextFrom);
    setDraftTo(nextTo > maxDate ? maxDate : nextTo);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }

    function onPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function apply(): void {
    if (!canApply) return;
    onCustom(draftFrom, draftTo);
    setOpen(false);
  }

  return (
    <div className="range-tabs" role="group" aria-label="Time range" ref={rootRef}>
      {RANGES.map((range) => {
        const active = range.key === value;
        return (
          <button
            key={range.key}
            type="button"
            className={active ? 'range-tab is-active' : 'range-tab'}
            aria-pressed={active}
            onClick={() => {
              setOpen(false);
              onChange(range.key);
            }}
          >
            {range.label}
          </button>
        );
      })}

      <button
        type="button"
        className={customActive ? 'range-tab range-tab-custom is-active' : 'range-tab range-tab-custom'}
        aria-pressed={customActive}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="range-custom-popover"
        onClick={openPicker}
      >
        <CalendarIcon />
        {customActive ? customLabel : 'Custom'}
      </button>

      {open ? (
        <div className="range-popover" id="range-custom-popover" role="dialog" aria-label="Custom date range">
          <div className="range-popover-fields">
            <label className="range-popover-field">
              <span>From</span>
              <input
                type="date"
                value={draftFrom}
                min={minDate}
                max={maxDate}
                onChange={(event) => setDraftFrom(event.target.value)}
              />
            </label>
            <label className="range-popover-field">
              <span>To</span>
              <input
                type="date"
                value={draftTo}
                min={minDate}
                max={maxDate}
                onChange={(event) => setDraftTo(event.target.value)}
              />
            </label>
          </div>
          <div className="range-popover-actions">
            <button type="button" className="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="button is-active" onClick={apply} disabled={!canApply}>
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
