import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { configurationSnapshot, createWorkerHarness, localSecret, registeredRoutes, schemaSnapshot, sourceFiles, sourcePath, workerRoot } from '../test/helpers/worker-harness.mjs';

// Deliberately explicit: this writes local fixtures, never deploys or contacts Cloudflare APIs.
assert.ok(process.argv.includes('--freeze-original-js'), 'Pass --freeze-original-js only before migrating production sources');
assert.ok((await sourcePath('src/index')).endsWith('.js'), 'The original JS baseline cannot be silently regenerated from migrated sources');
const names = ['routes.json', 'schema.json', 'public-config-keys.json', 'configuration.json'];
for (const name of names) {
	try { await access(resolve(workerRoot, 'test/fixtures', name)); throw new Error(`Refusing to overwrite frozen baseline: ${name}`); }
	catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const h = await createWorkerHarness();
try {
	const routes = await registeredRoutes(); assert.equal(routes.length, 65);
	const schema = await schemaSnapshot(h.db);
	const config = await h.api('/setting/websiteConfig'); assert.equal(config.body.code, 200);
	const values = [routes, schema, Object.keys(config.body.data).sort(), await configurationSnapshot()];
	for (let index = 0; index < names.length; index++) await writeFile(resolve(workerRoot, 'test/fixtures', names[index]), `${JSON.stringify(values[index], null, 2)}\n`);
	const files = await sourceFiles();
	const directory = resolve(workerRoot, '.wrangler/migration-baseline'); await mkdir(directory, { recursive: true });
	await writeFile(resolve(directory, 'source-hashes.json'), `${JSON.stringify(await Promise.all(files.map(async path => ({ path: relative(workerRoot, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(path)).digest('hex') }))), null, 2)}\n`);
	await writeFile(resolve(directory, 'contract-baseline.json'), `${JSON.stringify({ capturedAt: new Date().toISOString(), routes: routes.length, tables: schema.filter(row => row.type === 'table').length, localOnly: true, jwtSecretIsFixture: localSecret.startsWith('contract-local'), bundle: process.env.WORKER_CONTRACT_BUNDLE ?? 'source-build' }, null, 2)}\n`);
	console.log(`Frozen ${routes.length} actual Hono routes, ${schema.filter(row => row.type === 'table').length} D1 tables and public/config field contracts.`);
} finally { await h.close(); }
