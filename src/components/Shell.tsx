'use client';

import Link from 'next/link';
import type * as React from 'react';

export type SectionId = 'overview' | 'trends' | 'projects' | 'models' | 'sessions' | 'tools' | 'records';

export type Theme = 'stone' | 'paper';

/** Nav order doubles as the 1–7 keyboard shortcut order. */
export const SECTIONS: ReadonlyArray<{ id: SectionId; label: string; href: string }> = [
  { id: 'overview', label: 'Overview', href: '/' },
  { id: 'trends', label: 'Trends', href: '/trends' },
  { id: 'projects', label: 'Projects', href: '/projects' },
  { id: 'models', label: 'Models', href: '/models' },
  { id: 'sessions', label: 'Sessions', href: '/sessions' },
  { id: 'tools', label: 'Tools', href: '/tools' },
  { id: 'records', label: 'Records', href: '/records' },
];

type ShellProps = {
  section: SectionId;
  theme: Theme;
  onSelectTheme: (theme: Theme) => void;
  title: string;
  subtitle: string;
  /** Range tabs, rate card select and live badge. */
  controls: React.ReactNode;
  children: React.ReactNode;
};

/** Fixed sidebar + sticky top bar chrome. Presentational; state lives in DashboardView. */
export function Shell({
  section,
  theme,
  onSelectTheme,
  title,
  subtitle,
  controls,
  children,
}: ShellProps) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">
            <span className="brand-mark" aria-hidden="true" />
            opencode.
          </div>
          <p className="brand-sub">Usage Dashboard</p>
        </div>

        <nav className="nav" aria-label="Sections">
          {SECTIONS.map((item) => {
            const active = item.id === section;
            return (
              <Link
                key={item.id}
                className={active ? 'nav-item is-active' : 'nav-item'}
                href={item.href}
                prefetch={false}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-tools">
            <div className="theme-switch" role="group" aria-label="Theme">
              <button
                type="button"
                className="theme-opt theme-opt-stone"
                aria-pressed={theme === 'stone'}
                onClick={() => onSelectTheme('stone')}
              >
                Stone
              </button>
              <button
                type="button"
                className="theme-opt theme-opt-paper"
                aria-pressed={theme === 'paper'}
                onClick={() => onSelectTheme('paper')}
              >
                Paper
              </button>
            </div>
          </div>
          <a
            className="made-by"
            href="https://github.com/Timeswantstocode"
            target="_blank"
            rel="noreferrer noopener"
          >
            Made by @Timeswantstocode
          </a>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <h1 className="page-title">{title}</h1>
            <p className="page-sub">{subtitle}</p>
          </div>
          <div className="topbar-controls">{controls}</div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
