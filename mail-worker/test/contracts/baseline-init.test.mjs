import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { configurationSnapshot, createWorkerHarness, fixtureJson, registeredRoutes, schemaSnapshot, seedMail, seedUser, sourcePath } from '../helpers/worker-harness.mjs';

test('65 actual Hono registrations keep URL and HTTP method through gradual migration', async () => {
	const routes = await registeredRoutes(); assert.equal(routes.length, 65);
	assert.deepEqual(routes, await fixtureJson('routes.json'));
});

test('Wrangler binding/env names, compatibility date, cron and asset directory retain deployment contracts', async () => {
	assert.deepEqual(await configurationSnapshot(), await fixtureJson('configuration.json'));
	const constants = await readFile(await sourcePath('src/const/kv-const'), 'utf8');
	for (const key of ['auth-uid:', 'setting:', 'send_day_count:', 'analysis_echarts:', 'public_key:']) assert.ok(constants.includes(key), key);
	const fileConstants = await readFile(await sourcePath('src/const/constant'), 'utf8');
	assert.ok(fileConstants.includes('attachments/')); assert.ok(fileConstants.includes('static/background/'));
});

test('fresh init is local-only, secret-gated and matches the original 12-table DDL/index snapshot', async t => {
	const h = await createWorkerHarness({ initialize: false }); t.after(() => h.close());
	const wrong = await h.fetch('/api/init/wrong-secret'); assert.equal(wrong.status, 200); assert.equal(await wrong.text(), '❌ JWT secret mismatch');
	assert.deepEqual(await schemaSnapshot(h.db), []);
	const uninitialized = await h.api('/setting/websiteConfig'); assert.equal(uninitialized.body.code, 501);
	await h.initialize();
	const schema = await schemaSnapshot(h.db); assert.equal(schema.filter(row => row.type === 'table').length, 12);
	assert.deepEqual(schema, await fixtureJson('schema.json'));
	assert.ok(await h.kv.get('setting:', 'json'));
});

test('repeat init preserves existing D1 rows, settings and schema', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h); const mail = await seedMail(h, owner);
	await h.db.prepare('UPDATE setting SET title=?').bind('Existing database title').run();
	await h.initialize();
	assert.deepEqual(await schemaSnapshot(h.db), await fixtureJson('schema.json'));
	assert.equal((await h.db.prepare('SELECT subject FROM email WHERE email_id=?').bind(mail.email_id).first()).subject, 'Contract fixture');
	assert.equal((await h.kv.get('setting:', 'json')).title, 'Existing database title');
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 1);
});

test('local historical v3.2 fixture upgrades all v3.3 fields without losing users or mail', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h); const mail = await seedMail(h, owner);
	for (const column of ['auto_clean_days', 'auto_clean_exclude', 'webhook_url', 'webhook_status', 'webhook_retry', 'webhook_secret']) await h.db.prepare(`ALTER TABLE setting DROP COLUMN ${column}`).run();
	await h.db.prepare('DROP INDEX idx_email_create_time').run();
	await h.initialize();
	// SQLite rebuilds CREATE TABLE text when dropping columns. Compare column metadata and indexes, not formatting.
	const schema = await schemaSnapshot(h.db); const original = await fixtureJson('schema.json');
	assert.deepEqual(schema.map(({ type, name, tbl_name }) => ({ type, name, tbl_name })), original.map(({ type, name, tbl_name }) => ({ type, name, tbl_name })));
	const columns = (await h.db.prepare('PRAGMA table_info(setting)').all()).results.map(column => column.name);
	for (const column of ['auto_clean_days', 'auto_clean_exclude', 'webhook_url', 'webhook_status', 'webhook_retry', 'webhook_secret']) assert.ok(columns.includes(column));
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 1);
	assert.equal((await h.db.prepare('SELECT subject FROM email WHERE email_id=?').bind(mail.email_id).first()).subject, 'Contract fixture');
});
