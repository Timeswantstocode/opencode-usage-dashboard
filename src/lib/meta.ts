import type { DatabaseSync } from 'node:sqlite';

/** Small helpers shared by the cache writer, the backfill and attribution. */

export function readMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('select value from meta where key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function writeMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('insert into meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value').run(
    key,
    value,
  );
}

export function transaction(db: DatabaseSync, fn: () => void): void {
  db.exec('begin');
  try {
    fn();
    db.exec('commit');
  } catch (error) {
    db.exec('rollback');
    throw error;
  }
}
