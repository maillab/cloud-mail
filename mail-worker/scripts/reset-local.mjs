import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const workerDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const persistDir = path.resolve(workerDir, '.wrangler', 'local');
const expectedDir = path.join(workerDir, '.wrangler', 'local');

if (persistDir !== expectedDir || persistDir === workerDir) {
	throw new Error('Refusing to remove an unexpected local persistence path.');
}

await rm(persistDir, { recursive: true, force: true });
console.log('Removed only mail-worker/.wrangler/local. Stop the Worker before resetting.');
