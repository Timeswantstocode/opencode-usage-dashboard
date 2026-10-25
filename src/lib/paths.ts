import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** OpenCode's SQLite store, resolved per machine. */
export function resolveSourceDb(): string {
  const explicit = process.env.OPENCODE_DB?.trim();
  if (explicit) return explicit;
  const xdg = path.join(homedir(), '.local', 'share', 'opencode', 'opencode.db');
  if (existsSync(xdg)) return xdg;
  const local = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'opencode', 'opencode.db')
    : '';
  if (local && existsSync(local)) return local;
  return xdg;
}
