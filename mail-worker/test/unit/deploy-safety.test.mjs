import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateDeployConfig } from '../../scripts/deploy-worker.mjs';

const configured = { name: 'cloud-mail', main: 'src/index.ts', d1_databases: [{ binding: 'db', database_id: 'original-db' }], kv_namespaces: [{ binding: 'kv', id: 'original-kv' }], assets: { binding: 'assets' }, keep_vars: true };
test('deployment retains existing resource identity and allows dashboard-managed variables', () => {
	assert.equal(validateDeployConfig(configured), configured);
});
test('deployment refuses missing bindings and unresolved action placeholders before publishing', () => {
	assert.throws(() => validateDeployConfig({ ...configured, d1_databases: [] }), /existing db D1/);
	assert.throws(() => validateDeployConfig({ ...configured, kv_namespaces: [{ binding: 'kv', id: '${KV_NAMESPACE_ID}' }] }), /kv namespace/);
	assert.throws(() => validateDeployConfig({ ...configured, name: '${NAME}' }), /concrete Worker/);
});
test('ordinary code publication never automatically runs the non-idempotent historical init chain', async () => {
	const workflow = await readFile(new URL('../../../.github/workflows/deploy-cloudflare.yml', import.meta.url), 'utf8');
	assert.match(workflow, /initialize_database:[\s\S]*?type: boolean\s+default: false/);
	assert.match(workflow, /Initialize database\s+if: github.event_name == 'workflow_dispatch' && inputs.initialize_database/);
});
