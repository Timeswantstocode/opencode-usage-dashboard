import type { DatabaseSync } from 'node:sqlite';
import { readMeta, transaction, writeMeta } from './meta';

/**
 * Project attribution.
 *
 * The project is the most frequent folder under the session's own workspace
 * path that appears in its tool calls; the most frequent original casing
 * becomes the display name. Folders that are really paths inside a repo
 * (`src`, `node_modules`, `dist`, …) never vote. Sessions with no usable match
 * are `root` (the workspace root).
 *
 * Older sessions keep their tool calls in `part`; newer ones embed the same
 * payload in `session_message.data`. Both are scanned, part first, because a
 * part match is always the better signal.
 */

/**
 * Bump when the attribution rules change. `attributeProjects` wipes the stored
 * assignments and re-scans once when the persisted value is older than this.
 */
export const PROJECT_ALGO_VERSION = 3;
const PROJECT_ALGO_KEY = 'project_algo_version';

const PATH_RE = /Documents[\\/]+GitHub([\\/]+)([A-Za-z0-9._@+-]+)/g;

/**
 * Common folder names inside a repository. A path like
 * `Documents/GitHub/foo/src/...` is still the `foo` project, and a session that
 * only ever mentions one of these has no project of its own (`root`).
 */
const NON_PROJECT_FOLDERS = new Set([
  'src',
  'node_modules',
  'dist',
  'build',
  '.next',
  'public',
  'assets',
  'components',
  'lib',
  'app',
  'test',
  'tests',
  'docs',
  'coverage',
  'bin',
  'tmp',
  'temp',
  // A hallucinated path that is not a repository of its own.
  'opencode-src',
]);

type FolderCounts = Map<string, { total: number; casings: Map<string, number> }>;

type PayloadRow = { data: string };

function tallyFolder(counts: FolderCounts, name: string, key: string): void {
  const entry = counts.get(key) ?? { total: 0, casings: new Map<string, number>() };
  entry.total += 1;
  entry.casings.set(name, (entry.casings.get(name) ?? 0) + 1);
  counts.set(key, entry);
}

function collectFolders(data: string, counts: FolderCounts): void {
  PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PATH_RE.exec(data)) !== null) {
    const separator = match[1];
    // Inside JSON text a real Windows separator is `\\`; a lone `\` is an
    // escape sequence, e.g. `GitHub\n` from a trailing newline.
    if (separator === '\\') continue;
    let name = match[2];
    if (name.startsWith('.')) continue;
    if (/\.[a-z0-9]{1,5}$/.test(name)) continue;
    name = name.replace(/\.+$/, '');
    if (!name) continue;
    // CLI flags (`--version`, `-p`) and fragments that ran into prose are not
    // folders, a `…-src` folder is a source snapshot rather than a project, and
    // a denylisted folder is not a project.
    if (name.startsWith('-') || /\s/.test(name)) continue;
    if (/-src$/i.test(name)) continue;
    const key = name.toLowerCase();
    if (NON_PROJECT_FOLDERS.has(key)) continue;
    tallyFolder(counts, name, key);
  }
}

function bestSlug(counts: FolderCounts): string {
  let slug = 'root';
  let best = 0;
  for (const [key, entry] of counts) {
    if (entry.total > best) {
      best = entry.total;
      slug = key;
    }
  }
  return slug;
}

function bestCasing(entry: Record<string, number>, fallback: string): string {
  let name = fallback;
  let best = -1;
  for (const [casing, count] of Object.entries(entry)) {
    if (count > best) {
      best = count;
      name = casing;
    }
  }
  return name;
}

/** Display name per project slug, persisted in `meta`. */
export function readProjectNames(cache: DatabaseSync): Record<string, string> {
  const raw = readMeta(cache, 'project_names');
  if (!raw) return { root: 'GitHub root' };
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return { root: 'GitHub root', ...parsed };
  } catch {
    return { root: 'GitHub root' };
  }
}

/**
 * Attribute every session that has messages but no project yet.
 * Returns the number of sessions attributed (0 = nothing to do, no scan).
 *
 * A missing or outdated `project_algo_version` drops every stored assignment
 * first, so a rule change re-attributes every session exactly once — the same
 * pass then rebuilds the display names from the surviving folders.
 */
export function attributeProjects(source: DatabaseSync, cache: DatabaseSync): number {
  const storedVersion = Number(readMeta(cache, PROJECT_ALGO_KEY) ?? 0);
  const stale = !Number.isFinite(storedVersion) || storedVersion < PROJECT_ALGO_VERSION;
  if (stale) {
    // `applyProjects` only fills nulls, so the messages have to be reset too.
    transaction(cache, () => {
      cache.exec('update sess set project = null');
      cache.exec('update msg set project = null');
      writeMeta(cache, 'project_casings', '{}');
    });
  }

  const pendingRows = cache
    .prepare(`
      select s.id from sess s
      where s.project is null
        and exists (select 1 from msg m where m.session_id = s.id)
    `)
    .all() as { id: string }[];
  if (pendingRows.length === 0) {
    if (stale) writeMeta(cache, PROJECT_ALGO_KEY, String(PROJECT_ALGO_VERSION));
    return 0;
  }

  const pending = new Set(pendingRows.map((row) => row.id));
  const perSession = new Map<string, FolderCounts>();
  // Both tables are indexed on session_id, so this reads one session at a time.
  const partRows = source.prepare("select data from part where session_id = ? and data like '%GitHub%'");
  const messageRows = source.prepare(
    "select data from session_message where session_id = ? and data like '%GitHub%'",
  );

  for (const id of pending) {
    const counts: FolderCounts = new Map();
    for (const row of partRows.all(id) as PayloadRow[]) collectFolders(row.data, counts);
    if (counts.size === 0) {
      for (const row of messageRows.all(id) as PayloadRow[]) collectFolders(row.data, counts);
    }
    perSession.set(id, counts);
  }

  let casings: Record<string, Record<string, number>> = {};
  const rawCasings = readMeta(cache, 'project_casings');
  if (rawCasings) {
    try {
      casings = JSON.parse(rawCasings) as Record<string, Record<string, number>>;
    } catch {
      casings = {};
    }
  }

  const assignments = new Map<string, string>();
  for (const [id, counts] of perSession) {
    assignments.set(id, bestSlug(counts));
    for (const [slug, entry] of counts) {
      const target = casings[slug] ?? {};
      for (const [casing, count] of entry.casings) {
        target[casing] = (target[casing] ?? 0) + count;
      }
      casings[slug] = target;
    }
  }

  const names: Record<string, string> = { root: 'GitHub root' };
  for (const [slug, entry] of Object.entries(casings)) {
    names[slug] = bestCasing(entry, slug);
  }

  transaction(cache, () => {
    const update = cache.prepare('update sess set project = ? where id = ?');
    for (const id of pending) update.run(assignments.get(id) ?? 'root', id);
    writeMeta(cache, 'project_casings', JSON.stringify(casings));
    writeMeta(cache, 'project_names', JSON.stringify(names));
    writeMeta(cache, PROJECT_ALGO_KEY, String(PROJECT_ALGO_VERSION));
  });

  return pending.size;
}
