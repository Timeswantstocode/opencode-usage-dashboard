/**
 * Server-only: one session's detail for the drill-down drawer.
 *
 * Session metadata and token totals come from the sidecar cache
 * (`.data/usage.db`); tool calls are not cached, so they are read from the
 * live OpenCode database read-only. Every query is scoped to a single session
 * and served by an index, so a request never scans the whole message table.
 */

import { DatabaseSync } from 'node:sqlite';
import { ensureCache, getCache } from './db';
import { applyPricing, costSql, getRateCard, isCardId } from './pricing';
import { resolveSourceDb } from './paths';
import { loadPricing } from './pricingFile';
import { TZ_OFFSET_MS } from './time';
import type { CardId, Tokens } from './types';

/** The live OpenCode database. Never written to. */
const SOURCE_DB = resolveSourceDb();

export type SessionModelRow = {
  provider: string;
  model: string;
  variant: string;
  tokens: Tokens;
  cost: number;
};

export type SessionToolRow = {
  name: string;
  calls: number;
  errors: number;
  /** Median call duration in ms; null when no call carried timestamps. */
  p50Ms: number | null;
};

export type SessionTimelinePoint = {
  /** Local hour of day, `00`–`23`. */
  hour: string;
  tokens: number;
};

export type SessionSubagentRow = {
  id: string;
  title: string;
  tokens: number;
  cost: number;
};

export type SessionDetail = {
  id: string;
  title: string;
  project: string;
  agent: string;
  model: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  tokens: Tokens;
  /** Cost under both cards, whatever `?card=` asked for. */
  cost: { estimated: number; metered: number };
  /** Assistant messages in the session. */
  turns: number;
  models: SessionModelRow[];
  tools: SessionToolRow[];
  /** 24 entries, local midnight to 23:00, zero-filled. */
  timeline: SessionTimelinePoint[];
  subagents: SessionSubagentRow[];
};

type SessionMetaRow = {
  id: string;
  title: string | null;
  project: string | null;
  agent: string | null;
  model: string | null;
  created: number;
  updated: number;
};

type MessageAggRow = {
  turns: number;
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  total: number | null;
  estimated: number | null;
  metered: number | null;
  started: number | null;
  ended: number | null;
};

type ModelAggRow = {
  provider: string | null;
  model: string | null;
  variant: string | null;
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  total: number | null;
  cost: number | null;
};

type SubagentAggRow = {
  id: string;
  title: string | null;
  tokens: number | null;
  cost: number | null;
};

type ToolAggRow = {
  name: string | null;
  calls: number;
  errors: number | null;
  durations: string;
};

const globals = globalThis as typeof globalThis & {
  __sessionSource?: DatabaseSync | null;
};

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;
const iso = (ms: number): string => new Date(ms).toISOString();
const sum = (value: number | null | undefined): number => Math.round(value ?? 0);

/**
 * The tool-call query. Current OpenCode builds keep tool parts inside the
 * assistant message's `content` array; the legacy `part` table is only counted
 * for messages that were never mirrored into `session_message` (the same rule
 * `extras.ts` applies) so one call is never counted twice.
 */
const TOOL_SQL = `
  select name,
    count(*) as calls,
    sum(case when status = 'error' then 1 else 0 end) as errors,
    json_group_array(duration) as durations
  from (
    select coalesce(json_extract(j.value, '$.name'), json_extract(j.value, '$.tool')) as name,
      json_extract(j.value, '$.state.status') as status,
      case
        when json_extract(j.value, '$.time.completed') >= json_extract(j.value, '$.time.created')
        then json_extract(j.value, '$.time.completed') - json_extract(j.value, '$.time.created')
      end as duration
    from session_message m, json_each(m.data, '$.content') j
    where m.session_id = ?
      and m.type = 'assistant'
      and json_extract(j.value, '$.type') = 'tool'

    union all

    select coalesce(json_extract(p.data, '$.name'), json_extract(p.data, '$.tool')) as name,
      json_extract(p.data, '$.state.status') as status,
      case
        when json_extract(p.data, '$.state.time.end') >= json_extract(p.data, '$.state.time.start')
        then json_extract(p.data, '$.state.time.end') - json_extract(p.data, '$.state.time.start')
      end as duration
    from part p
    where p.session_id = ?
      and json_extract(p.data, '$.type') = 'tool'
      and not exists (select 1 from session_message sm where sm.id = p.message_id)
  )
  group by name
  order by calls desc, name`;

function openSource(): DatabaseSync | null {
  if (globals.__sessionSource !== undefined) return globals.__sessionSource;
  try {
    const db = new DatabaseSync(SOURCE_DB, { readOnly: true, timeout: 5000 });
    // Belt and braces: the connection is read-only and query_only rejects writes.
    try {
      db.exec('pragma query_only = 1');
    } catch {
      /* read-only already enforces it */
    }
    globals.__sessionSource = db;
    return db;
  } catch (error) {
    // Tool rows are optional; a missing source database must not fail the page.
    console.error('[sessionDetail] source database unavailable', error);
    globals.__sessionSource = null;
    return null;
  }
}

function readMeta(id: string): SessionMetaRow | null {
  const row = getCache()
    .prepare('select id, title, project, agent, model, created, updated from sess where id = ?')
    .get(id) as SessionMetaRow | undefined;
  return row ?? null;
}

/** Exact median of the timestamped calls; null when none carried timestamps. */
function medianMs(raw: string): number | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const values = parsed.filter((value): value is number => typeof value === 'number' && value >= 0);
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return Math.round(median);
}

function readTools(sessionId: string): SessionToolRow[] {
  const db = openSource();
  if (!db) return [];
  try {
    const rows = db.prepare(TOOL_SQL).all(sessionId, sessionId) as ToolAggRow[];
    return rows.map((row) => ({
      name: row.name ?? '(unknown)',
      calls: sum(row.calls),
      errors: sum(row.errors),
      p50Ms: medianMs(row.durations),
    }));
  } catch (error) {
    // An older database may lack `part`/`session_message`; the drawer still
    // renders every section it can.
    console.error('[sessionDetail] tool query failed', error);
    return [];
  }
}

/**
 * One session's detail, or null when the id is unknown. Reads the cache first;
 * only a cold cache triggers a sync, so warm requests stay a handful of
 * indexed queries.
 */
export async function getSessionDetail(id: string, card: string = 'estimated'): Promise<SessionDetail | null> {
  if (!id) return null;

  let meta = readMeta(id);
  if (!meta) {
    await ensureCache();
    meta = readMeta(id);
  }
  if (!meta) return null;

  const db = getCache();
  const pricing = loadPricing();
  const cardId: CardId = isCardId(card) ? card : 'estimated';
  const rateCard = applyPricing(getRateCard(cardId), pricing);
  const estimatedCard = applyPricing(getRateCard('estimated'), pricing);
  const meteredCard = applyPricing(getRateCard('metered'), pricing);

  const messageAgg = db
    .prepare(
      `select count(*) as turns,
        sum(input) as input,
        sum(output) as output,
        sum(reasoning) as reasoning,
        sum(cache_read) as cacheRead,
        sum(cache_write) as cacheWrite,
        sum(input + output + reasoning + cache_read + cache_write) as total,
        sum(${costSql(estimatedCard)}) as estimated,
        sum(${costSql(meteredCard)}) as metered,
        min(ts) as started,
        max(ts) as ended
      from msg where session_id = ?`,
    )
    .get(id) as MessageAggRow;

  const modelRows = db
    .prepare(
      `select provider, model, variant,
        sum(input) as input,
        sum(output) as output,
        sum(reasoning) as reasoning,
        sum(cache_read) as cacheRead,
        sum(cache_write) as cacheWrite,
        sum(input + output + reasoning + cache_read + cache_write) as total,
        sum(${costSql(rateCard)}) as cost
      from msg where session_id = ?
      group by provider, model, variant
      order by total desc`,
    )
    .all(id) as ModelAggRow[];

  const hourRows = db
    .prepare(
      `select ((ts + ${TZ_OFFSET_MS}) / 3600000) % 24 as hour,
        sum(input + output + reasoning + cache_read + cache_write) as tokens
      from msg where session_id = ?
      group by hour`,
    )
    .all(id) as { hour: number; tokens: number | null }[];

  const subagentRows = db
    .prepare(
      `select s.id, s.title,
        coalesce(sum(m.input + m.output + m.reasoning + m.cache_read + m.cache_write), 0) as tokens,
        coalesce(sum(${costSql(rateCard, 'm.')}), 0) as cost
      from sess s
      left join msg m on m.session_id = s.id
      where s.parent_id = ?
      group by s.id
      order by tokens desc`,
    )
    .all(id) as SubagentAggRow[];

  const tokens: Tokens = {
    input: sum(messageAgg.input),
    output: sum(messageAgg.output),
    reasoning: sum(messageAgg.reasoning),
    cacheRead: sum(messageAgg.cacheRead),
    cacheWrite: sum(messageAgg.cacheWrite),
    total: sum(messageAgg.total),
  };

  const models: SessionModelRow[] = modelRows.map((row) => ({
    provider: row.provider ?? 'unknown',
    model: row.model ?? 'unknown',
    variant: row.variant ?? '',
    tokens: {
      input: sum(row.input),
      output: sum(row.output),
      reasoning: sum(row.reasoning),
      cacheRead: sum(row.cacheRead),
      cacheWrite: sum(row.cacheWrite),
      total: sum(row.total),
    },
    cost: round6(row.cost ?? 0),
  }));

  // Local hours, zero-filled so the sparkline always has 24 buckets.
  const hourly = new Map<number, number>();
  for (const row of hourRows) {
    if (typeof row.hour === 'number') hourly.set(row.hour, sum(row.tokens));
  }
  const timeline: SessionTimelinePoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour: String(hour).padStart(2, '0'),
    tokens: hourly.get(hour) ?? 0,
  }));

  // The session row is authoritative for the window when messages exist;
  // otherwise fall back to the session's own created/updated stamps.
  const started = messageAgg.started ?? meta.created;
  const ended = messageAgg.ended ?? Math.max(meta.created, meta.updated);

  return {
    id: meta.id,
    title: meta.title || 'Untitled',
    project: meta.project || 'root',
    agent: meta.agent || 'unknown',
    model: meta.model || models[0]?.model || 'unknown',
    startedAt: iso(started),
    endedAt: iso(ended),
    durationMs: Math.max(0, ended - started),
    tokens,
    cost: {
      estimated: round6(messageAgg.estimated ?? 0),
      metered: round6(messageAgg.metered ?? 0),
    },
    turns: sum(messageAgg.turns),
    models,
    tools: readTools(id),
    timeline,
    subagents: subagentRows.map((row) => ({
      id: row.id,
      title: row.title || 'Untitled',
      tokens: sum(row.tokens),
      cost: round6(row.cost ?? 0),
    })),
  };
}
