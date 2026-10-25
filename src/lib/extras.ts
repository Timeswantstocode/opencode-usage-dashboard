/**
 * Server-only analytics for code output and tool reliability.
 *
 * Reads the live OpenCode SQLite database read-only and keeps its own small
 * cache in `.data/extras.json`. The expensive tables are scanned once; every
 * later request only re-reads rows past the stored cursor plus a short tail
 * window, so in-flight messages still settle. Session-level figures
 * (concurrency, throughput and the summary-diff fallback) come from
 * `session_v2`, which is small enough to aggregate on every request.
 *
 * Code output is kept as timestamped per-message edit events, so every range
 * (today/7d/30d/90d/all) is answered from the same cache without another scan.
 * An edit event is only rewritten when its message changes, which keeps the
 * figures fresh without re-reading the multi-hundred-megabyte message table.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveSourceDb } from './paths';
import {
  DAY_MS,
  TZ_OFFSET_MS,
  localDayIndex,
  localDayKey,
  localDayKeyFromIndex,
  localDayStartUtcMs,
} from './time';
import type { RangeKey, StatsRange, StatsRangeKey } from './types';

/** The live OpenCode database. Never written to. */
const SOURCE_DB = resolveSourceDb();
const CACHE_DIR = path.join(process.cwd(), '.data');
const CACHE_FILE = path.join(CACHE_DIR, 'extras.json');
/** Bump when the cache shape changes; older files are rebuilt from scratch. */
const CACHE_VERSION = 3;

/**
 * The newest messages are re-read on every refresh: OpenCode updates a message
 * in place while a turn streams, so its rowid never moves.
 */
const TAIL_ROWS = 80;

/** Same idea for edit events, with a wider tail for long streaming turns. */
const CODE_TAIL_ROWS = 120;
/**
 * A message can be updated long after its row landed (an edit finishes late).
 * `time_updated` has no index, so sweep it occasionally instead of on every
 * poll; the overlap covers rows written while the previous scan was running.
 */
const CODE_SWEEP_MS = 15_000;
const CODE_SWEEP_SLACK_MS = 60_000;

/** A session reopened days later was not days of continuous work. */
const MAX_ACTIVE_SPAN_MS = 8 * 60 * 60 * 1000;

const RANGE_DAYS: Record<Exclude<RangeKey, 'all'>, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Thrown when a `from`/`to` pair is incomplete, malformed, or reversed. */
export class InvalidRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRangeError';
  }
}

/** Local midnight of a `YYYY-MM-DD` key, or null when it is not a real day. */
function parseLocalDay(value: string): number | null {
  if (!DAY_KEY.test(value)) return null;
  const start = localDayStartUtcMs(value);
  // `Date.parse` normalises impossible dates (`2026-02-30`), so round-trip.
  return Number.isFinite(start) && localDayKey(start) === value ? start : null;
}

/** A validated custom window, as local-day starts. */
type CustomBounds = { from: number; to: number };

/** Parse a custom pair; null when neither bound was supplied, throw when only one was. */
function parseBounds(from: string | null, to: string | null): CustomBounds | null {
  if (from === null && to === null) return null;
  if (from === null || to === null) throw new InvalidRangeError('from and to must be YYYY-MM-DD');
  const fromStart = parseLocalDay(from);
  const toStart = parseLocalDay(to);
  if (fromStart === null || toStart === null) throw new InvalidRangeError('from and to must be YYYY-MM-DD');
  if (fromStart > toStart) throw new InvalidRangeError('from must be on or before to');
  return { from: fromStart, to: toStart };
}

/** Fixed log buckets keep percentile state bounded and mergeable. */
const TOKEN_RATIO = 1.02;
const DURATION_RATIO = 1.05;

export type ExtrasToolRow = {
  name: string;
  calls: number;
  errors: number;
  errorRate: number;
  /** Median call duration in ms; null when no call carried timestamps. */
  p50Ms: number | null;
  /** Share of all tool calls, 0-1. */
  share: number;
};

export type ExtrasResponse = {
  generatedAt: string;
  stale: boolean;
  /** Window the code figures were computed for. */
  range: StatsRange;
  code: {
    range: StatsRangeKey;
    additions: number;
    deletions: number;
    net: number;
    files: number;
    sessionsWithDiff: number;
    largest: { title: string; additions: number; deletions: number } | null;
  };
  turns: {
    total: number;
    avgTokens: number;
    p50Tokens: number;
    p95Tokens: number;
    maxTurn: { tokens: number; model: string; at: string } | null;
    avgInput: number;
    avgCacheRead: number;
  };
  tools: {
    total: number;
    errors: number;
    errorRate: number;
    items: ExtrasToolRow[];
  };
  shell: { calls: number; errors: number; errorRate: number };
  concurrency: { peak: number; date: string | null };
  throughput: {
    tokensPerActiveHour: number;
    longestSessionMs: number;
    longestSessionTitle: string;
  };
};

type MaxTurn = { tokens: number; model: string; at: number };

type TurnAgg = {
  count: number;
  tokens: number;
  input: number;
  cacheRead: number;
  /** bucket index -> turns in that bucket. */
  buckets: Record<string, number>;
  max: MaxTurn | null;
};

type ToolAgg = {
  calls: number;
  errors: number;
  /** Calls that carried a start and end timestamp. */
  timed: number;
  /** bucket index -> calls in that bucket. */
  buckets: Record<string, number>;
};

/** One file touched by an `edit` call, with that call's line counts. */
type CodeFile = {
  path: string;
  additions: number;
  deletions: number;
};

/**
 * The edit calls found in one message. Keyed by `session_message.rowid`, so a
 * re-read replaces the message's previous contribution instead of adding it
 * twice. `ts` is the message timestamp, the only stable per-edit time.
 */
type CodeEdit = {
  ts: number;
  sessionId: string;
  files: CodeFile[];
};

type CodeEdits = Record<string, CodeEdit>;

type Agg = {
  turns: TurnAgg;
  tools: Record<string, ToolAgg>;
};

type CacheState = {
  /** session_message rowid folded into `base`; everything newer is re-read. */
  baseCursor: number;
  /** Highest `part` rowid already considered. */
  partCursor: number;
  base: Agg;
  /** Edit events, per message rowid. */
  edits: CodeEdits;
  /** Highest message rowid already parsed for edits. */
  editCursor: number;
  /** Messages updated after this instant still need re-reading. */
  editWatermark: number;
};

type CacheFile = {
  version: number;
  /** Highest session_message rowid represented by the cached state. */
  lastRowid: number;
  generatedAt: string;
  /** Newest payload per range, for the stale fallback. */
  payloads: Partial<Record<RangeKey, ExtrasResponse>>;
  state: CacheState;
};

type SessionRow = {
  id: string;
  title: string | null;
  created: number;
  updated: number;
  additions: number;
  deletions: number;
  files: number;
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
};

const globals = globalThis as typeof globalThis & {
  __extrasStore?: DatabaseSync;
  __extrasInflight?: Map<string, Promise<ExtrasResponse>>;
  /** Wall-clock of the last `time_updated` sweep, in this process. */
  __extrasLastEditSweep?: number;
};

const TURN_SQL = `
  select m.rowid as rowid,
    json_extract(m.data, '$.tokens.input') as input,
    json_extract(m.data, '$.tokens.output') as output,
    json_extract(m.data, '$.tokens.reasoning') as reasoning,
    json_extract(m.data, '$.tokens.cache.read') as cacheRead,
    json_extract(m.data, '$.tokens.cache.write') as cacheWrite,
    json_extract(m.data, '$.model.providerID') as provider,
    json_extract(m.data, '$.model.id') as model,
    coalesce(json_extract(m.data, '$.time.completed'), m.time_created) as at
  from session_message m
  where m.type = 'assistant'
    and json_type(m.data, '$.tokens') = 'object'
    and m.rowid > ?`;

const MESSAGE_TOOL_SQL = `
  select m.rowid as rowid,
    coalesce(json_extract(j.value, '$.name'), json_extract(j.value, '$.tool')) as name,
    json_extract(j.value, '$.state.status') as status,
    json_extract(j.value, '$.time.created') as started,
    json_extract(j.value, '$.time.completed') as ended
  from session_message m, json_each(m.data, '$.content') j
  where m.type = 'assistant'
    and json_extract(j.value, '$.type') = 'tool'
    and m.rowid > ?`;

/**
 * Legacy `part` rows. Their messages were mirrored into `session_message`
 * (whose content array carries the same calls), so only rows whose message is
 * absent from `session_message` are counted — otherwise every call from the
 * old storage would be counted twice.
 */
const PART_TOOL_SQL = `
  select p.session_id as sessionId,
    coalesce(json_extract(p.data, '$.name'), json_extract(p.data, '$.tool')) as name,
    json_extract(p.data, '$.state.status') as status,
    json_extract(p.data, '$.state.time.start') as started,
    json_extract(p.data, '$.state.time.end') as ended
  from part p
  where json_extract(p.data, '$.type') = 'tool'
    and p.rowid > ?
    and not exists (select 1 from session_message m where m.id = p.message_id)`;

/**
 * `edit` calls with their per-file line counts. Older builds write a single
 * `filediff` object, newer ones a `files` array; a call never carries both, but
 * the array wins if it ever does. The path filter is appended by the caller
 * (`rowid` for the append-only scan, `time_updated` for the late-edit sweep).
 */
const EDIT_SQL = (filter: string): string => `
  select m.rowid as rowid,
    m.session_id as sessionId,
    m.time_created as ts,
    case when json_type(j.value, '$.state.metadata.files') = 'array'
      then json_extract(f.value, '$.file')
      else json_extract(j.value, '$.state.metadata.filediff.file') end as file,
    case when json_type(j.value, '$.state.metadata.files') = 'array'
      then json_extract(f.value, '$.additions')
      else json_extract(j.value, '$.state.metadata.filediff.additions') end as added,
    case when json_type(j.value, '$.state.metadata.files') = 'array'
      then json_extract(f.value, '$.deletions')
      else json_extract(j.value, '$.state.metadata.filediff.deletions') end as removed
  from session_message m, json_each(m.data, '$.content') j
  left join json_each(
    case when json_type(j.value, '$.state.metadata.files') = 'array' then j.value end,
    '$.state.metadata.files'
  ) f
  where m.type = 'assistant'
    and ${filter}
    and json_extract(j.value, '$.type') = 'tool'
    and (json_extract(j.value, '$.name') = 'edit' or json_extract(j.value, '$.tool') = 'edit')
    and (json_type(j.value, '$.state.metadata.files') = 'array'
      or json_type(j.value, '$.state.metadata.filediff') = 'object')`;

const EDIT_BY_ROWID_SQL = EDIT_SQL('m.rowid > ?');
const EDIT_BY_UPDATED_SQL = EDIT_SQL('m.time_updated > ?');

const SESSION_SQL = `
  select id, title, time_created as created, time_updated as updated,
    coalesce(summary_additions, 0) as additions,
    coalesce(summary_deletions, 0) as deletions,
    coalesce(summary_files, 0) as files,
    coalesce(tokens_input, 0) as input,
    coalesce(tokens_output, 0) as output,
    coalesce(tokens_reasoning, 0) as reasoning,
    coalesce(tokens_cache_read, 0) as cacheRead,
    coalesce(tokens_cache_write, 0) as cacheWrite
  from session_v2`;

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function emptyAgg(): Agg {
  return {
    turns: { count: 0, tokens: 0, input: 0, cacheRead: 0, buckets: {}, max: null },
    tools: {},
  };
}

function bucketIndex(value: number, ratio: number): number {
  return Math.floor(Math.log(Math.max(1, value)) / Math.log(ratio));
}

function bucketCeil(index: number, ratio: number): number {
  return Math.ceil(ratio ** (index + 1));
}

function bump(buckets: Record<string, number>, index: number): void {
  const key = String(index);
  buckets[key] = (buckets[key] ?? 0) + 1;
}

function mergeBuckets(into: Record<string, number>, from: Record<string, number>): void {
  for (const [key, count] of Object.entries(from)) {
    into[key] = (into[key] ?? 0) + count;
  }
}

/** Nearest-rank percentile from a fixed log-bucket histogram (about ±2%). */
function percentile(buckets: Record<string, number>, total: number, quantile: number): number {
  if (total <= 0) return 0;
  const keys = Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b);
  const target = total * quantile;
  let seen = 0;
  for (const key of keys) {
    seen += buckets[String(key)] ?? 0;
    if (seen >= target) return bucketCeil(key, TOKEN_RATIO);
  }
  return keys.length > 0 ? bucketCeil(keys[keys.length - 1], TOKEN_RATIO) : 0;
}

function durationPercentile(buckets: Record<string, number>, total: number): number | null {
  if (total <= 0) return null;
  const keys = Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b);
  const target = total * 0.5;
  let seen = 0;
  for (const key of keys) {
    seen += buckets[String(key)] ?? 0;
    if (seen >= target) return bucketCeil(key, DURATION_RATIO);
  }
  return bucketCeil(keys[keys.length - 1], DURATION_RATIO);
}

function addTurn(agg: Agg, row: Record<string, unknown>): void {
  const input = numberValue(row.input);
  const output = numberValue(row.output);
  const reasoning = numberValue(row.reasoning);
  const cacheRead = numberValue(row.cacheRead);
  const cacheWrite = numberValue(row.cacheWrite);
  const tokens = input + output + reasoning + cacheRead + cacheWrite;

  const turns = agg.turns;
  turns.count += 1;
  turns.tokens += tokens;
  turns.input += input;
  turns.cacheRead += cacheRead;
  bump(turns.buckets, bucketIndex(tokens, TOKEN_RATIO));

  if (turns.max === null || tokens > turns.max.tokens) {
    const provider = stringValue(row.provider);
    const model = stringValue(row.model);
    turns.max = {
      tokens,
      model: provider && model ? `${provider}/${model}` : model || provider || 'unknown',
      at: numberValue(row.at),
    };
  }
}

function addTool(agg: Agg, row: Record<string, unknown>): void {
  const name = stringValue(row.name).trim() || '(unknown)';
  const tool = agg.tools[name] ?? { calls: 0, errors: 0, timed: 0, buckets: {} };
  tool.calls += 1;
  if (row.status === 'error') tool.errors += 1;

  const started = numberValue(row.started);
  const ended = numberValue(row.ended);
  if (started > 0 && ended >= started) {
    tool.timed += 1;
    bump(tool.buckets, bucketIndex(ended - started, DURATION_RATIO));
  }

  agg.tools[name] = tool;
}

function mergeAgg(base: Agg, extra: Agg): Agg {
  const merged: Agg = {
    turns: {
      count: base.turns.count,
      tokens: base.turns.tokens,
      input: base.turns.input,
      cacheRead: base.turns.cacheRead,
      buckets: { ...base.turns.buckets },
      max: base.turns.max,
    },
    tools: {},
  };

  mergeBuckets(merged.turns.buckets, extra.turns.buckets);
  merged.turns.count += extra.turns.count;
  merged.turns.tokens += extra.turns.tokens;
  merged.turns.input += extra.turns.input;
  merged.turns.cacheRead += extra.turns.cacheRead;
  if (extra.turns.max && (merged.turns.max === null || extra.turns.max.tokens > merged.turns.max.tokens)) {
    merged.turns.max = extra.turns.max;
  }

  for (const [name, tool] of Object.entries(base.tools)) {
    merged.tools[name] = { ...tool, buckets: { ...tool.buckets } };
  }
  for (const [name, tool] of Object.entries(extra.tools)) {
    const target = merged.tools[name] ?? { calls: 0, errors: 0, timed: 0, buckets: {} };
    target.calls += tool.calls;
    target.errors += tool.errors;
    target.timed += tool.timed;
    mergeBuckets(target.buckets, tool.buckets);
    merged.tools[name] = target;
  }

  return merged;
}

/** Parse `edit` calls into per-message events, replacing nothing yet. */
function collectEdits(db: DatabaseSync, sql: string, from: number): CodeEdits {
  const edits: CodeEdits = {};
  for (const row of db.prepare(sql).iterate(from)) {
    const file = stringValue(row.file);
    if (!file) continue;
    const key = String(numberValue(row.rowid));
    const edit = edits[key] ?? {
      ts: numberValue(row.ts),
      sessionId: stringValue(row.sessionId),
      files: [],
    };
    edit.files.push({
      path: file,
      additions: numberValue(row.added),
      deletions: numberValue(row.removed),
    });
    edits[key] = edit;
  }
  return edits;
}

/**
 * Bring the cached edit events up to date.
 *
 * New rows are read past the cursor; the newest rows are re-read on every
 * request because a message can gain its `edit` metadata while it streams. A
 * message updated after its row left the tail is caught by the periodic
 * `time_updated` sweep. Returns true when the cache should be written.
 */
function updateEdits(db: DatabaseSync, state: CacheState, head: number): boolean {
  const now = Date.now();
  let touched = false;

  if (head > 0) {
    // Re-read the tail (and every new row above it) in one pass.
    const from = Math.min(state.editCursor, Math.max(0, head - CODE_TAIL_ROWS));
    const parsed = collectEdits(db, EDIT_BY_ROWID_SQL, from);
    for (const key of Object.keys(state.edits)) {
      if (Number(key) >= from) delete state.edits[key];
    }
    Object.assign(state.edits, parsed);
    if (state.editCursor < head) touched = true;
    state.editCursor = head;
  }

  if (state.editWatermark === 0) {
    // A full scan just read every row; start watching updates from here.
    state.editWatermark = now - CODE_SWEEP_SLACK_MS;
    globals.__extrasLastEditSweep = now;
  } else if (now - (globals.__extrasLastEditSweep ?? 0) >= CODE_SWEEP_MS) {
    const swept = collectEdits(db, EDIT_BY_UPDATED_SQL, state.editWatermark);
    Object.assign(state.edits, swept);
    state.editWatermark = now - CODE_SWEEP_SLACK_MS;
    globals.__extrasLastEditSweep = now;
    if (Object.keys(swept).length > 0) touched = true;
  }

  return touched;
}

function openSource(): DatabaseSync {
  if (globals.__extrasStore) return globals.__extrasStore;
  const db = new DatabaseSync(SOURCE_DB, { readOnly: true, timeout: 5000 });
  try {
    db.exec('pragma query_only = 1');
  } catch {
    /* read-only already enforces it */
  }
  globals.__extrasStore = db;
  return db;
}

function readCache(): CacheFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as CacheFile;
    if (
      parsed &&
      parsed.version === CACHE_VERSION &&
      typeof parsed.lastRowid === 'number' &&
      typeof parsed.generatedAt === 'string' &&
      parsed.payloads &&
      parsed.state &&
      parsed.state.base &&
      parsed.state.edits &&
      typeof parsed.state.editCursor === 'number' &&
      typeof parsed.state.editWatermark === 'number'
    ) {
      return parsed;
    }
  } catch {
    /* missing or corrupt: rebuild */
  }
  return null;
}

function writeCache(entry: CacheFile): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${CACHE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entry));
    fs.renameSync(tmp, CACHE_FILE);
  } catch (error) {
    // A failed cache write must never break the response.
    console.error('[extras] cache write failed', error);
  }
}

function peakConcurrency(sessions: SessionRow[]): { peak: number; date: string | null } {
  // Per local day: +1 when a session enters the day, -1 the instant after it
  // leaves. Clipping at midnight makes one sweep work for every day at once.
  const byDay = new Map<number, Array<{ ts: number; delta: number }>>();

  for (const session of sessions) {
    const start = session.created;
    const end = Math.max(session.created, session.updated);
    const firstDay = localDayIndex(start);
    const lastDay = localDayIndex(end);

    for (let day = firstDay; day <= lastDay; day += 1) {
      const dayStart = day * DAY_MS - TZ_OFFSET_MS;
      const dayEnd = dayStart + DAY_MS;
      const from = Math.max(start, dayStart);
      const to = Math.min(end, dayEnd);
      let events = byDay.get(day);
      if (!events) {
        events = [];
        byDay.set(day, events);
      }
      events.push({ ts: from, delta: 1 });
      events.push({ ts: to + 1, delta: -1 });
    }
  }

  let peak = 0;
  let peakDay: number | null = null;

  for (const [day, events] of byDay) {
    events.sort((a, b) => a.ts - b.ts || a.delta - b.delta);
    let live = 0;
    let dayPeak = 0;
    for (const event of events) {
      live += event.delta;
      if (live > dayPeak) dayPeak = live;
    }
    if (dayPeak > peak) {
      peak = dayPeak;
      peakDay = day;
    }
  }

  return { peak, date: peakDay === null ? null : localDayKeyFromIndex(peakDay) };
}

/** The resolved local-day window the code figures cover. */
type CodeWindow = {
  key: StatsRangeKey;
  /** Inclusive start, UTC ms. */
  from: number;
  /** Inclusive end, UTC ms. */
  to: number;
  days: number;
};

/**
 * Resolve the window for a request: a custom `from`/`to` pair (clamped to the
 * recorded history and to now) or one of the presets.
 */
function resolveWindow(
  sessions: SessionRow[],
  range: RangeKey,
  bounds: CustomBounds | null,
  now: number,
): CodeWindow {
  const todayStart = localDayStartUtcMs(localDayKey(now));
  const first = sessions.reduce((min, session) => Math.min(min, session.created), todayStart);
  const historyStart = localDayStartUtcMs(localDayKey(first));

  if (bounds !== null) {
    // `rangeEnd` is the last ms of the window (clamped to now), so a past `to`
    // never picks up newer edits. The start clamps to the first recorded day.
    const rangeEnd = Math.min(now, bounds.to + DAY_MS - 1);
    const lastEndDayStart = localDayStartUtcMs(localDayKey(rangeEnd));
    const from = Math.min(Math.max(bounds.from, historyStart), lastEndDayStart);
    return {
      key: 'custom',
      from,
      to: rangeEnd,
      days: Math.max(1, Math.round((lastEndDayStart - from) / DAY_MS) + 1),
    };
  }

  if (range === 'all') {
    return {
      key: range,
      from: historyStart,
      to: now,
      days: Math.max(1, Math.round((todayStart - historyStart) / DAY_MS) + 1),
    };
  }

  const days = RANGE_DAYS[range];
  return { key: range, from: todayStart - (days - 1) * DAY_MS, to: now, days };
}

/**
 * Code figures for one window.
 *
 * `session_v2`'s summary columns are lifetime totals with no per-day split, so
 * they can answer `all` (when a build wrote them) but never a window. The
 * timestamped edit events collected in `updateEdits` answer every range and
 * include the newest edit as soon as its message exists.
 */
function buildCode(
  edits: CodeEdits,
  sessions: SessionRow[],
  titles: Map<string, string>,
  window: CodeWindow,
): { code: ExtrasResponse['code']; range: StatsRange } {
  const { key, from, to } = window;

  let summaryAdditions = 0;
  let summaryDeletions = 0;
  let summaryFiles = 0;
  let summarySessions = 0;
  let summaryLargest: ExtrasResponse['code']['largest'] = null;
  let summaryLargestSize = 0;
  for (const session of sessions) {
    summaryAdditions += session.additions;
    summaryDeletions += session.deletions;
    summaryFiles += session.files;
    const diff = session.additions + session.deletions;
    if (diff > 0) {
      summarySessions += 1;
      if (diff > summaryLargestSize) {
        summaryLargestSize = diff;
        summaryLargest = {
          title: session.title || 'Untitled',
          additions: session.additions,
          deletions: session.deletions,
        };
      }
    }
  }

  // Distinct paths across every session, not the sum of per-session counts.
  const files = new Set<string>();
  const bySession = new Map<string, { additions: number; deletions: number }>();
  for (const edit of Object.values(edits)) {
    if (edit.ts < from || edit.ts > to) continue;
    for (const file of edit.files) {
      files.add(file.path);
      const target = bySession.get(edit.sessionId) ?? { additions: 0, deletions: 0 };
      target.additions += file.additions;
      target.deletions += file.deletions;
      bySession.set(edit.sessionId, target);
    }
  }

  let additions = 0;
  let deletions = 0;
  let largest: ExtrasResponse['code']['largest'] = null;
  let largestSize = 0;
  for (const [sessionId, value] of bySession) {
    additions += value.additions;
    deletions += value.deletions;
    const total = value.additions + value.deletions;
    if (total > largestSize) {
      largestSize = total;
      largest = {
        title: titles.get(sessionId) ?? 'Untitled',
        additions: value.additions,
        deletions: value.deletions,
      };
    }
  }

  const useSummary = key === 'all' && summaryAdditions + summaryDeletions + summaryFiles > 0;
  return {
    code: useSummary
      ? {
          range: key,
          additions: summaryAdditions,
          deletions: summaryDeletions,
          net: summaryAdditions - summaryDeletions,
          files: summaryFiles,
          sessionsWithDiff: summarySessions,
          largest: summaryLargest,
        }
      : {
          range: key,
          additions,
          deletions,
          net: additions - deletions,
          files: files.size,
          sessionsWithDiff: bySession.size,
          largest,
        },
    range: {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      days: window.days,
    },
  };
}

function buildPayload(
  agg: Agg,
  sessions: SessionRow[],
  edits: CodeEdits,
  range: RangeKey,
  bounds: CustomBounds | null,
  generatedAt: string,
): ExtrasResponse {
  const now = Date.parse(generatedAt);
  const titles = new Map<string, string>();

  let activeMs = 0;
  let longestSessionMs = 0;
  let longestSessionTitle = '';
  let totalTokens = 0;

  for (const session of sessions) {
    titles.set(session.id, session.title || 'Untitled');

    const span = Math.max(0, session.updated - session.created);
    activeMs += Math.min(span, MAX_ACTIVE_SPAN_MS);
    if (span > longestSessionMs) {
      longestSessionMs = span;
      longestSessionTitle = session.title || 'Untitled';
    }
    totalTokens +=
      session.input + session.output + session.reasoning + session.cacheRead + session.cacheWrite;
  }

  const window = resolveWindow(sessions, range, bounds, now);
  const { code, range: codeRange } = buildCode(edits, sessions, titles, window);

  const turns = agg.turns;
  const toolTotals = Object.entries(agg.tools).reduce(
    (sum, [, tool]) => ({ calls: sum.calls + tool.calls, errors: sum.errors + tool.errors }),
    { calls: 0, errors: 0 },
  );

  const items: ExtrasToolRow[] = Object.entries(agg.tools)
    .map(([name, tool]) => ({
      name,
      calls: tool.calls,
      errors: tool.errors,
      errorRate: tool.calls > 0 ? tool.errors / tool.calls : 0,
      p50Ms: durationPercentile(tool.buckets, tool.timed),
      share: toolTotals.calls > 0 ? tool.calls / toolTotals.calls : 0,
    }))
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))
    .slice(0, 30);

  const shellCalls = (agg.tools.bash?.calls ?? 0) + (agg.tools.shell?.calls ?? 0);
  const shellErrors = (agg.tools.bash?.errors ?? 0) + (agg.tools.shell?.errors ?? 0);

  const activeHours = activeMs / 3_600_000;

  return {
    generatedAt,
    stale: false,
    range: codeRange,
    code,
    turns: {
      total: turns.count,
      avgTokens: turns.count > 0 ? turns.tokens / turns.count : 0,
      p50Tokens: percentile(turns.buckets, turns.count, 0.5),
      p95Tokens: percentile(turns.buckets, turns.count, 0.95),
      maxTurn:
        turns.max === null
          ? null
          : {
              tokens: turns.max.tokens,
              model: turns.max.model,
              at: new Date(turns.max.at).toISOString(),
            },
      avgInput: turns.count > 0 ? turns.input / turns.count : 0,
      avgCacheRead: turns.count > 0 ? turns.cacheRead / turns.count : 0,
    },
    tools: {
      total: toolTotals.calls,
      errors: toolTotals.errors,
      errorRate: toolTotals.calls > 0 ? toolTotals.errors / toolTotals.calls : 0,
      items,
    },
    shell: {
      calls: shellCalls,
      errors: shellErrors,
      errorRate: shellCalls > 0 ? shellErrors / shellCalls : 0,
    },
    concurrency: peakConcurrency(sessions),
    throughput: {
      tokensPerActiveHour: activeHours > 0 ? totalTokens / activeHours : 0,
      longestSessionMs,
      longestSessionTitle,
    },
  };
}

function refresh(range: RangeKey, bounds: CustomBounds | null): ExtrasResponse {
  const db = openSource();
  const cached = readCache();
  const state: CacheState = cached?.state ?? {
    baseCursor: 0,
    partCursor: 0,
    base: emptyAgg(),
    edits: {},
    editCursor: 0,
    editWatermark: 0,
  };

  const headRow = db.prepare('select coalesce(max(rowid), 0) as head from session_message').get();
  const head = numberValue(headRow?.head);
  // Leave the newest rows in the tail so an in-place message update is picked
  // up again; only settled rows are folded into the persisted base.
  const foldTo = Math.max(state.baseCursor, head - TAIL_ROWS);
  const tail = emptyAgg();

  for (const row of db.prepare(TURN_SQL).iterate(state.baseCursor)) {
    addTurn(numberValue(row.rowid) <= foldTo ? state.base : tail, row);
  }

  for (const row of db.prepare(MESSAGE_TOOL_SQL).iterate(state.baseCursor)) {
    addTool(numberValue(row.rowid) <= foldTo ? state.base : tail, row);
  }

  const partHeadRow = db.prepare('select coalesce(max(rowid), 0) as head from part').get();
  const partHead = numberValue(partHeadRow?.head);
  const partIsNew = partHead > state.partCursor;
  if (partIsNew) {
    for (const row of db.prepare(PART_TOOL_SQL).iterate(state.partCursor)) {
      addTool(state.base, row);
    }
    state.partCursor = partHead;
  }

  state.baseCursor = foldTo;

  const sessions = db
    .prepare(SESSION_SQL)
    .all()
    .map(
      (row): SessionRow => ({
        id: stringValue(row.id),
        title: typeof row.title === 'string' ? row.title : null,
        created: numberValue(row.created),
        updated: numberValue(row.updated),
        additions: numberValue(row.additions),
        deletions: numberValue(row.deletions),
        files: numberValue(row.files),
        input: numberValue(row.input),
        output: numberValue(row.output),
        reasoning: numberValue(row.reasoning),
        cacheRead: numberValue(row.cacheRead),
        cacheWrite: numberValue(row.cacheWrite),
      }),
    );

  const editsTouched = updateEdits(db, state, head);

  const merged = mergeAgg(state.base, tail);
  const generatedAt = new Date().toISOString();
  const payload = buildPayload(merged, sessions, state.edits, range, bounds, generatedAt);

  // Rewriting a six-figure cache file on every 5s poll would be wasteful;
  // only persist when the database actually moved. Re-reading the edit tail
  // does not qualify: the next request re-reads it anyway, so a missed write
  // costs nothing but the work. Custom windows are not kept as stale fallbacks
  // (they would each need their own key); only the shared state is persisted.
  if (cached === null || head !== cached.lastRowid || partIsNew || editsTouched) {
    const payloads: Partial<Record<RangeKey, ExtrasResponse>> = { ...(cached?.payloads ?? {}) };
    if (bounds === null) payloads[range] = payload;
    writeCache({
      version: CACHE_VERSION,
      lastRowid: head,
      generatedAt,
      payloads,
      state,
    });
  }

  return payload;
}

/**
 * Latest code-output and tool-reliability figures for `range`, or for a custom
 * `from`/`to` pair (local `YYYY-MM-DD`, inclusive) that replaces it. Concurrent
 * callers for the same window share a single refresh. When the database is
 * locked or a query fails, the newest cached payload is returned with
 * `stale: true`.
 */
export function getExtras(
  range: RangeKey = 'all',
  from?: string | null,
  to?: string | null,
): Promise<ExtrasResponse> {
  // A half-supplied or malformed pair throws before any cache work, so the
  // route can answer 400 rather than a stale payload.
  const bounds = parseBounds(from ?? null, to ?? null);
  const key = bounds === null ? range : `custom:${bounds.from}:${bounds.to}`;
  const inflight = (globals.__extrasInflight ??= new Map());
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(() => refresh(range, bounds))
    .catch((error: unknown) => {
      const cached = readCache();
      const payload = cached?.payloads[range] ?? cached?.payloads.all;
      if (payload) {
        console.error('[extras] serving stale payload', error);
        return { ...payload, stale: true };
      }
      throw error;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
