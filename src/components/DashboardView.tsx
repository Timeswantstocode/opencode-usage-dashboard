'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveBadge } from '@/components/LiveBadge';
import { ProviderSelect } from '@/components/ProviderSelect';
import { RangeTabs } from '@/components/RangeTabs';
import { RateCardSelect } from '@/components/RateCardSelect';
import { SectionSkeleton } from '@/components/SectionSkeleton';
import { SECTIONS, Shell } from '@/components/Shell';
import type { SectionId, Theme } from '@/components/Shell';
import { FlexTab } from '@/components/tabs/FlexTab';
import { ModelsTab } from '@/components/tabs/ModelsTab';
import { OverviewTab } from '@/components/tabs/OverviewTab';
import { ProjectsTab } from '@/components/tabs/ProjectsTab';
import { SessionsTab } from '@/components/tabs/SessionsTab';
import { ToolsTab } from '@/components/tabs/ToolsTab';
import { TrendsTab } from '@/components/tabs/TrendsTab';
import { isCardId } from '@/lib/pricing';
import type { CardId, RangeKey, StatsResponse } from '@/lib/types';
import { useStats } from '@/lib/useStats';

const PAGE_META: Record<SectionId, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Every local session' },
  trends: { title: 'Trends', subtitle: 'Pace, outliers and period deltas' },
  projects: { title: 'Projects', subtitle: 'Token attribution' },
  models: { title: 'Models', subtitle: 'Providers and rate cards' },
  sessions: { title: 'Sessions', subtitle: 'Most expensive conversations' },
  tools: { title: 'Tools', subtitle: 'Tool calls and code output' },
  records: { title: 'Records', subtitle: 'Records, distributions and dashboard' },
};

/**
 * Filters survive section navigation and reloads. The URL never carries them:
 * every route reads this key on mount and writes the whole set on change.
 */
const FILTERS_KEY = 'ocd:filters:v1';

const RANGE_KEYS: ReadonlyArray<RangeKey> = ['today', '7d', '30d', '90d', 'all'];

type Filters = {
  range: RangeKey;
  custom: { from: string; to: string } | null;
  card: CardId;
  provider: string;
  project: string;
};

function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === 'string' && RANGE_KEYS.some((key) => key === value);
}

/** A real `YYYY-MM-DD` calendar day, so a hand-edited `2026-02-31` is rejected. */
function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** The saved filter set, or `null` when storage is empty, unreadable or invalid. */
function readFilters(): Filters | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(FILTERS_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const { range, custom, card, provider, project } = value as Record<string, unknown>;
  if (!isRangeKey(range)) return null;
  if (typeof card !== 'string' || !isCardId(card)) return null;
  if (typeof provider !== 'string' || provider === '') return null;
  if (typeof project !== 'string' || project === '') return null;

  let nextCustom: Filters['custom'] = null;
  if (custom !== null) {
    if (typeof custom !== 'object') return null;
    const { from, to } = custom as Record<string, unknown>;
    if (!isDayKey(from) || !isDayKey(to) || from > to) return null;
    nextCustom = { from, to };
  }

  return { range, custom: nextCustom, card, provider, project };
}

function saveFilters(filters: Filters): void {
  try {
    window.localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // Storage can be unavailable (private mode, file URL); filters still work.
  }
}

/** Browser-local `YYYY-MM-DD`: the custom picker's bounds are calendar days. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

type TabBodyProps = {
  section: SectionId;
  data: StatsResponse;
  project: string;
  range: RangeKey;
  custom: { from: string; to: string } | null;
  onSelectProject: (project: string) => void;
};

function TabBody({ section, data, project, range, custom, onSelectProject }: TabBodyProps) {
  switch (section) {
    case 'overview':
      return <OverviewTab data={data} />;
    case 'trends':
      return <TrendsTab data={data} />;
    case 'projects':
      return <ProjectsTab data={data} activeProject={project} onSelectProject={onSelectProject} />;
    case 'models':
      return <ModelsTab data={data} />;
    case 'sessions':
      return <SessionsTab data={data} />;
    case 'tools':
      return <ToolsTab range={range} from={custom?.from} to={custom?.to} />;
    case 'records':
      return <FlexTab data={data} />;
    default:
      return null;
  }
}

/** One dashboard section. The route picks the section; everything else is local state. */
export function DashboardView({ section }: { section: SectionId }) {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>('all');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [card, setCard] = useState<CardId>('estimated');
  const [project, setProject] = useState('all');
  const [provider, setProvider] = useState('all');
  // The inline script in layout.tsx has already applied the real theme; this
  // state only drives the toggle's aria-pressed once React hydrates.
  const [theme, setTheme] = useState<Theme>('stone');
  // The first render always uses the defaults so SSR and hydration agree; the
  // saved filters are applied from an effect right after mount.
  const restored = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // Persist on every change, but only once the saved set is in state: until
  // `hydrated` flips, the write would carry the defaults and overwrite storage.
  useEffect(() => {
    if (!hydrated) return;
    saveFilters({ range, custom, card, provider, project });
  }, [hydrated, range, custom, card, provider, project]);

  useEffect(() => {
    // StrictMode runs mount effects twice; a second read could only race the
    // write that already ran with the restored values.
    if (restored.current) return;
    const saved = readFilters();
    if (saved) {
      setRange(saved.range);
      setCustom(saved.custom);
      setCard(saved.card);
      setProvider(saved.provider);
      setProject(saved.project);
    }
    restored.current = true;
    setHydrated(true);
  }, []);

  const { data, status, refresh } = useStats({
    range,
    from: custom?.from,
    to: custom?.to,
    card,
    project,
    provider,
  });

  const maxDate = dayKey(new Date());
  const fallbackFrom = new Date();
  fallbackFrom.setDate(fallbackFrom.getDate() - 365);
  const minDate = data?.series.daily[0]?.date ?? dayKey(fallbackFrom);

  useEffect(() => {
    const applied = document.documentElement.getAttribute('data-theme');
    setTheme(applied === 'paper' ? 'paper' : 'stone');
  }, []);

  const selectTheme = useCallback((next: Theme) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem('ocd-theme', next);
    } catch {
      // Storage can be unavailable (private mode, file URL); the theme still applies.
    }
  }, []);

  const selectRange = useCallback((next: RangeKey) => {
    setRange(next);
    setCustom(null);
  }, []);

  const applyCustom = useCallback((from: string, to: string) => {
    setCustom({ from, to });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= SECTIONS.length) {
        router.push(SECTIONS[index - 1].href);
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        refresh();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [refresh, router]);

  const heading = PAGE_META[section];
  const projectName = data?.projects.find((item) => item.slug === project)?.name ?? project;

  return (
    <Shell
      section={section}
      theme={theme}
      onSelectTheme={selectTheme}
      title={heading.title}
      subtitle={heading.subtitle}
      controls={
        <>
          <RangeTabs
            value={custom ? 'custom' : range}
            onChange={selectRange}
            onCustom={applyCustom}
            customFrom={custom?.from}
            customTo={custom?.to}
            minDate={minDate}
            maxDate={maxDate}
          />
          <RateCardSelect value={card} onChange={setCard} cards={data?.rateCards} />
          <ProviderSelect
            value={provider}
            onChange={setProvider}
            providers={data?.providers?.map((item) => item.provider) ?? []}
          />
          <LiveBadge live={data?.live ?? null} status={status} />
        </>
      }
    >
      {project !== 'all' || provider !== 'all' ? (
        <div className="filter-row row">
          {project !== 'all' ? (
            <button
              type="button"
              className="filter-chip"
              onClick={() => setProject('all')}
              aria-label={`Remove project filter ${projectName}`}
            >
              Project: {projectName} <span aria-hidden="true">✕</span>
            </button>
          ) : null}
          {provider !== 'all' ? (
            <button
              type="button"
              className="filter-chip"
              onClick={() => setProvider('all')}
              aria-label={`Remove provider filter ${provider}`}
            >
              Provider: {provider} <span aria-hidden="true">✕</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {data === null ? (
        status === 'error' ? (
          <section className="error" role="alert">
            <p className="eyebrow">data unavailable</p>
            <p>
              The stats API did not answer. The dashboard keeps retrying in the background; you can also retry now.
            </p>
            <p>
              <button type="button" className="button" onClick={refresh}>
                Retry now
              </button>
            </p>
          </section>
        ) : (
          <SectionSkeleton section={section} />
        )
      ) : (
        <TabBody
          section={section}
          data={data}
          project={project}
          range={range}
          custom={custom}
          onSelectProject={setProject}
        />
      )}
    </Shell>
  );
}
