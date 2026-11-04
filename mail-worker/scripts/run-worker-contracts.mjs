import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseline = process.argv.includes('--baseline');
const bundle = resolve(workerRoot, baseline ? '.wrangler/migration-baseline/index.js' : '.wrangler/ts-build/index.js');
await access(bundle); // Fail if the explicit artifact is absent; never silently fall back to another build.
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'test/contracts/**/*.test.mjs'], {
	cwd: workerRoot, stdio: 'inherit', env: { ...process.env, WORKER_CONTRACT_BUNDLE: bundle,
		...(baseline ? { WORKER_CONTRACT_ORIGINAL_CALLBACKS: '1' } : {}) },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
