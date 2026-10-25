#!/usr/bin/env node
/**
 * Privacy guard.
 *
 * Fails when a file that has to stay on this machine would be committed, or
 * when a file that would be committed contains an absolute home directory, a
 * private key or a secret-looking assignment.
 *
 *   pnpm check:privacy                        # every tracked file
 *   node scripts/check-personal.mjs --staged  # only the staged files
 *
 * The script is dependency-free on purpose and stays generic: it names no
 * person, project or amount, because it ships with the repository.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STAGED = process.argv.slice(2).includes('--staged');
const HAS_GIT = existsSync(join(ROOT, '.git'));

// Output directories. A tree walk skips them because without a git index the
// cache, screenshots and compiler output on a dev machine would look like a
// leak. The git modes skip nothing: a tracked cache file is still a violation.
const WALK_SKIP = new Set([
  'node_modules',
  '.next',
  '.git',
  '.data',
  '.shots',
  'logs',
  'coverage',
  'dist',
  'out',
]);

const LOCKFILES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lockb',
]);

const BINARY = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.bmp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.zip',
  '.gz',
  '.br',
  '.wasm',
  '.mp3',
  '.wav',
  '.mp4',
  '.webm',
  '.db',
  '.db-wal',
  '.db-shm',
  '.sqlite',
  '.dll',
  '.dylib',
  '.so',
  '.node',
  '.exe',
  '.class',
  '.jar',
]);

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const SNIFF_BYTES = 8192;

const PATH_RULES = [
  { kind: 'local pricing file', match: (path) => basename(path) === 'pricing.local.json' },
  {
    kind: 'environment file',
    match: (path) => basename(path).startsWith('.env') && basename(path) !== '.env.example',
  },
  { kind: 'local usage cache', match: (path) => path === '.data' || path.startsWith('.data/') },
  { kind: 'local screenshots', match: (path) => path === '.shots' || path.startsWith('.shots/') },
  { kind: 'log file', match: (path) => path.toLowerCase().endsWith('.log') },
  { kind: 'build info', match: (path) => path.endsWith('.tsbuildinfo') },
];

const CONTENT_RULES = [
  { kind: 'absolute Windows user path', match: /[A-Za-z]:\\Users\\[^\\\s]+/ },
  { kind: 'POSIX home path', match: /\/(home|Users)\/[^/\s]+\// },
  { kind: 'private key', match: /BEGIN (RSA|OPENSSH|EC) PRIVATE KEY/ },
  {
    kind: 'secret assignment',
    match: /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}/i,
  },
];

function gitList(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
}

function walk(dir, files) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!WALK_SKIP.has(entry.name)) walk(path, files);
    } else if (entry.isFile()) {
      // tsc writes this next to the sources; it is ignored, so the walk skips
      // it. When it is tracked, the git modes below still report it.
      if (!path.endsWith('.tsbuildinfo')) files.push(path);
    }
    // symlinks are not followed: they may point outside the tree
  }
}

function list() {
  if (HAS_GIT) {
    try {
      return STAGED
        ? gitList(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
        : gitList(['ls-files', '-z']);
    } catch (error) {
      console.warn(`privacy: git failed (${error.code ?? error.message}), walking the tree`);
    }
  } else if (STAGED) {
    console.warn('privacy: no .git in this directory, --staged falls back to a full scan');
  }
  const files = [];
  walk('', files);
  return files;
}

function readText(path) {
  if (LOCKFILES.has(basename(path))) return null;
  if (BINARY.has(extname(path).toLowerCase())) return null;
  const absolute = join(ROOT, path);
  let stats;
  try {
    stats = statSync(absolute);
  } catch {
    return null; // deleted between the listing and the read
  }
  if (!stats.isFile() || stats.size > MAX_TEXT_BYTES) return null;
  let bytes;
  try {
    bytes = readFileSync(absolute);
  } catch {
    return null;
  }
  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) return null; // binary
  return bytes.toString('utf8');
}

const files = list();
const violations = [];

for (const path of files) {
  const matched = PATH_RULES.filter((rule) => rule.match(path));
  if (matched.length > 0) {
    for (const rule of matched) violations.push({ path, line: 0, kind: rule.kind });
    continue;
  }
  const text = readText(path);
  if (text === null) continue;
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    for (const rule of CONTENT_RULES) {
      if (rule.match.test(lines[index])) {
        violations.push({ path, line: index + 1, kind: rule.kind });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`privacy: ${files.length} tracked files checked, 0 violations`);
  process.exit(0);
}

console.error(`privacy: ${violations.length} violation${violations.length === 1 ? '' : 's'}`);
for (const violation of violations) {
  const where = violation.line ? `${violation.path}:${violation.line}` : violation.path;
  console.error(`  ${where}  ${violation.kind}`);
}
console.error('privacy: keep these files local (see docs/PRIVACY.md).');
process.exit(1);
