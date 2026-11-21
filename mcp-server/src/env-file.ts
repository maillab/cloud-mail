import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load `mcp-server/.env` into process.env WITHOUT overriding vars already set
// in the real environment. The path is resolved relative to this module (one
// level up from `dist/` or `src/`), so it works no matter what cwd the process
// was launched from — e.g. when an MCP host spawns `node dist/index.js`
// directly. A missing .env is fine (fall back to the real environment).
export function loadEnvFile(): void {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = dirname(moduleDir); // dist/ or src/ -> mcp-server/
  const envPath = join(serverRoot, '.env');

  let content: string;
  try {
    content = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
