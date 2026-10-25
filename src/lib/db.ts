import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyProjects, backfillMessages } from './backfill';
import { readMeta, transaction, writeMeta } from './meta';
import { resolveSourceDb } from './paths';
import { attributeProjects } from './projects';

/** The live OpenCode database. Never written to. */
const SOURCE_DB = resolveSourceDb();
const CACHE_DIR = path.join(process.cwd(), '.data');
const CACHE_DB = path.join(CACHE_DIR, 'usage.db');

const SCHEMA = `
create table if not exists meta (key text primary key, value text);
create table if not exists sess (
  id text primary key,
  title text,
  directory text,
  parent_id text,
  agent text,
  model text,
  created integer,
  updated integer,
  project text
);
create table if not exists msg (
  id text primary key,
  ts integer,
  session_id text,
  provider text,
  model text,
  variant text,
  input integer,
  output integer,
  reasoning integer,
  cache_read integer,
  cache_write integer,
  project text
);
create index if not exists idx_msg_ts on msg(ts);
create index if not exists idx_msg_session on msg(session_id);
create index if not exists idx_msg_project on msg(project);
`;

type Store = { source: DatabaseSync; cache: DatabaseSync };

const globals = globalThis as typeof globalThis & {
  __opencodeUsageStore?: Store;
  __opencodeUsageSync?: Promise<void> | null;
};

type SessionRow = {
  id: string;
  title: string | null;
  directory: string | null;
  parent_id: string | null;
  agent: string | null;
  model: string | null;
  time_created: number;
  time_updated: number;
};

function openStore(): Store {
  if (globals.__opencodeUsageStore) return globals.__opencodeUsageStore;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cache = new DatabaseSync(CACHE_DB);
  cache.exec('pragma journal_mode = wal');
  cache.exec('pragma synchronous = normal');
  cache.exec('pragma busy_timeout = 5000');
  cache.exec(SCHEMA);

  const source = new DatabaseSync(SOURCE_DB, { readOnly: true, timeout: 5000 });
  // Belt and braces: the connection is read-only and query_only rejects writes.
  try {
    source.exec('pragma query_only = 1');
  } catch {
    /* read-only already enforces it */
  }

  const store = { source, cache };
  globals.__opencodeUsageStore = store;
  return store;
}

export function getCache(): DatabaseSync {
  return openStore().cache;
}

function parseSessionModel(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { id?: unknown; modelID?: unknown };
    if (typeof parsed.id === 'string') return parsed.id;
    if (typeof parsed.modelID === 'string') return parsed.modelID;
  } catch {
    /* plain string in older rows */
  }
  return raw;
}

function syncSessions(source: DatabaseSync, cache: DatabaseSync): void {
  const stats = source
    .prepare('select count(*) as count, coalesce(max(time_updated), 0) as updated from session_v2')
    .get() as { count: number; updated: number };
  const signature = `${stats.count}:${stats.updated}`;
  if (readMeta(cache, 'sessions_signature') === signature) return;

  const rows = source
    .prepare(
      `select id, title, directory, parent_id, agent, model, time_created, time_updated
       from session_v2`,
    )
    .all() as SessionRow[];

  const upsert = cache.prepare(`
    insert into sess (id, title, directory, parent_id, agent, model, created, updated, project)
    values (?, ?, ?, ?, ?, ?, ?, ?, null)
    on conflict(id) do update set
      title = excluded.title,
      directory = excluded.directory,
      parent_id = excluded.parent_id,
      agent = excluded.agent,
      model = excluded.model,
      created = excluded.created,
      updated = excluded.updated
  `);

  transaction(cache, () => {
    for (const row of rows) {
      upsert.run(
        row.id,
        row.title ?? 'Untitled',
        row.directory,
        row.parent_id,
        row.agent,
        parseSessionModel(row.model),
        row.time_created,
        row.time_updated,
      );
    }
    writeMeta(cache, 'sessions_signature', signature);
  });
}

function sync(): void {
  const { source, cache } = openStore();
  syncSessions(source, cache);
  backfillMessages(source, cache);
  if (attributeProjects(source, cache) > 0) applyProjects(cache);
}

/**
 * Bring the sidecar cache up to date: schema, sessions, new messages, projects.
 * Cheap after the first backfill — it only touches rows past the cursor plus a
 * small tail window so messages that were still streaming settle.
 */
export function ensureCache(): Promise<void> {
  if (!globals.__opencodeUsageSync) {
    globals.__opencodeUsageSync = Promise.resolve()
      .then(sync)
      .finally(() => {
        globals.__opencodeUsageSync = null;
      });
  }
  return globals.__opencodeUsageSync;
}

export type CacheInfo = {
  path: string;
  bytes: number;
  messages: number;
  sessions: number;
};

export function cacheInfo(): CacheInfo {
  const cache = getCache();
  const messages = cache.prepare('select count(*) as c from msg').get() as { c: number };
  const sessions = cache.prepare('select count(*) as c from sess').get() as { c: number };
  let bytes = 0;
  try {
    bytes = fs.statSync(CACHE_DB).size;
  } catch {
    /* not created yet */
  }
  return { path: CACHE_DB, bytes, messages: messages.c, sessions: sessions.c };
}
