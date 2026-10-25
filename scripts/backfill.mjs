#!/usr/bin/env node
/**
 * Backfill (or refresh) the sidecar usage cache without starting Next.
 *
 * It calls the same `ensureCache()` the API route uses, so the first run does
 * the full backfill and later runs only pull rows past the cursor.
 *
 *   pnpm backfill
 */
import { registerHooks } from 'node:module';
import { performance } from 'node:perf_hooks';

// Node can strip TypeScript, but it needs the extension on relative imports.
// This hook resolves `./projects` to `./projects.ts` for the lib files.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.')) {
      try {
        return nextResolve(specifier, context);
      } catch {
        return nextResolve(`${specifier}.ts`, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { ensureCache, cacheInfo, getCache } = await import('../src/lib/db.ts');
const { readProjectNames } = await import('../src/lib/projects.ts');

const started = performance.now();
await ensureCache();
const seconds = (performance.now() - started) / 1000;

const info = cacheInfo();
const names = readProjectNames(getCache());
const projects = getCache()
  .prepare(`
    select project as slug,
      sum(input + output + reasoning + cache_read + cache_write) as tokens,
      count(*) as messages
    from msg group by project order by tokens desc limit 8
  `)
  .all();

console.log(`backfill: ${seconds.toFixed(2)}s`);
console.log(`cache:    ${info.path} (${(info.bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`rows:     ${info.messages} messages, ${info.sessions} sessions`);
console.log('top projects by tokens:');
for (const project of projects) {
  console.log(
    `  ${String(names[project.slug] ?? project.slug).padEnd(18)} ${(project.tokens / 1e9).toFixed(2)}B  ${project.messages} msgs`,
  );
}
