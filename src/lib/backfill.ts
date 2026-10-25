import type { DatabaseSync } from 'node:sqlite';
import { readMeta, transaction, writeMeta } from './meta';

/** Messages per backfill chunk. */
const CHUNK = 5000;
/** Re-read this many rows behind the cursor so streaming messages settle. */
const TAIL_RECHECK = 300;

type MessageRow = {
  rid: number;
  id: string;
  time_created: number;
  session_id: string;
  provider: string | null;
  model: string | null;
  variant: string | null;
  input: number | null;
  output: number | null;
  reasoning: number | null;
  cache_read: number | null;
  cache_write: number | null;
};

/**
 * Copy assistant messages with token counts out of the live database.
 * The rowid cursor makes repeats cheap; the tail window catches in-place
 * updates to messages that were still streaming when we last looked.
 */
export function backfillMessages(source: DatabaseSync, cache: DatabaseSync): void {
  const select = source.prepare(`
    select rowid as rid, id, time_created, session_id,
      json_extract(data, '$.model.providerID') as provider,
      json_extract(data, '$.model.id') as model,
      json_extract(data, '$.model.variant') as variant,
      json_extract(data, '$.tokens.input') as input,
      json_extract(data, '$.tokens.output') as output,
      json_extract(data, '$.tokens.reasoning') as reasoning,
      json_extract(data, '$.tokens.cache.read') as cache_read,
      json_extract(data, '$.tokens.cache.write') as cache_write
    from session_message
    where rowid > ? and type = 'assistant' and json_extract(data, '$.tokens') is not null
    order by rowid
    limit ${CHUNK}
  `);

  const insert = cache.prepare(`
    insert into msg (id, ts, session_id, provider, model, variant, input, output, reasoning, cache_read, cache_write, project)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      ts = excluded.ts,
      session_id = excluded.session_id,
      provider = excluded.provider,
      model = excluded.model,
      variant = excluded.variant,
      input = excluded.input,
      output = excluded.output,
      reasoning = excluded.reasoning,
      cache_read = excluded.cache_read,
      cache_write = excluded.cache_write,
      project = coalesce(excluded.project, project)
  `);

  const projectBySession = new Map<string, string>();
  const sessions = cache.prepare('select id, project from sess').all() as { id: string; project: string | null }[];
  for (const session of sessions) {
    if (session.project) projectBySession.set(session.id, session.project);
  }

  const stored = Number(readMeta(cache, 'last_msg_rowid') ?? 0);
  let cursor = Number.isFinite(stored) ? stored : 0;

  const tailFrom = Math.max(0, cursor - TAIL_RECHECK);
  const tail = source
    .prepare('select coalesce(max(time_updated), 0) as updated from session_message where rowid > ?')
    .get(tailFrom) as { updated: number };
  const tailStamp = Number(tail.updated);
  const previousTail = Number(readMeta(cache, 'tail_updated') ?? 0);
  const tailMoved = tailStamp > previousTail;
  let from = tailMoved ? tailFrom : cursor;

  for (;;) {
    const rows = select.all(from) as MessageRow[];
    if (rows.length === 0) break;

    const last = rows[rows.length - 1].rid;
    transaction(cache, () => {
      for (const row of rows) {
        const project = projectBySession.get(row.session_id) ?? null;
        insert.run(
          row.id,
          row.time_created,
          row.session_id,
          row.provider,
          row.model,
          row.variant,
          row.input ?? 0,
          row.output ?? 0,
          row.reasoning ?? 0,
          row.cache_read ?? 0,
          row.cache_write ?? 0,
          project,
        );
      }
      if (last > cursor) writeMeta(cache, 'last_msg_rowid', String(last));
    });

    if (last > cursor) cursor = last;
    if (rows.length < CHUNK) break;
    from = last;
  }

  if (tailMoved) writeMeta(cache, 'tail_updated', String(tailStamp));
}

/** Copy freshly attributed session projects onto their messages. */
export function applyProjects(cache: DatabaseSync): void {
  cache.exec(`
    update msg set project = (select s.project from sess s where s.id = msg.session_id)
    where project is null
      and exists (select 1 from sess s where s.id = msg.session_id and s.project is not null)
  `);
  cache.exec("update msg set project = 'root' where project is null");
}
