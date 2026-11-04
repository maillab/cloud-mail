import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { access, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Log, LogLevel, Miniflare, Response as WorkerResponse } from 'miniflare';

export const workerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const localSecret = 'contract-local-jwt-secret';
export const localHeaders = { 'cf-connecting-ip': '127.0.0.1', 'user-agent': 'contract-node', 'accept-language': 'en' };
let bundlePromise;

export async function sourcePath(stem) {
	for (const extension of ['.ts', '.js']) {
		const path = resolve(workerRoot, `${stem}${extension}`);
		try { await access(path); return path; } catch { /* Gradual JS/TS migration. */ }
	}
	throw new Error(`Worker source does not exist: ${stem}`);
}

export async function buildWorker() {
	if (process.env.WORKER_CONTRACT_BUNDLE) return resolve(workerRoot, process.env.WORKER_CONTRACT_BUNDLE);
	bundlePromise ??= (async () => {
		const directory = resolve(workerRoot, '.wrangler/contracts-current');
		await mkdir(directory, { recursive: true });
		const output = resolve(directory, `worker-${process.pid}.mjs`);
		await build({ entryPoints: [await sourcePath('src/index')], outfile: output, bundle: true, format: 'esm', platform: 'browser',
			target: 'es2022', conditions: ['workerd', 'worker', 'browser'], sourcemap: 'linked', logLevel: 'silent', external: ['cloudflare:*', 'node:*'] });
		return output;
	})();
	return bundlePromise;
}

/** Strict local egress fixture: unexpected requests fail even when business code catches fetch errors. */
export function outboundFixture() {
	const calls = [];
	const unexpected = [];
	const failures = [];
	const handlers = [];
	return {
		calls, unexpected,
		on(url, handler) { handlers.push({ url, handler }); return this; },
		async dispatch(request) {
			const buffer = await request.arrayBuffer();
			const call = { url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body: new TextDecoder().decode(buffer), bytes: [...new Uint8Array(buffer)] };
			calls.push(call);
			const match = handlers.find(entry => typeof entry.url === 'string' ? entry.url === call.url : entry.url.test(call.url));
			if (!match) { unexpected.push(call); throw new Error(`Unconfigured external request: ${call.method} ${call.url}`); }
			let reply;
			try { reply = await match.handler(call, calls.length); }
			catch (error) { failures.push(error.stack ?? String(error)); throw error; }
			return new WorkerResponse(reply.body === undefined ? '' : typeof reply.body === 'string' || reply.body instanceof Uint8Array || reply.body instanceof ArrayBuffer ? reply.body : JSON.stringify(reply.body),
				{ status: reply.status ?? 200, headers: reply.headers ?? { 'content-type': 'application/json' } });
		},
		assertExpected() {
			assert.deepEqual(unexpected, [], 'Every outbound request must have an explicit local fixture');
			assert.deepEqual(failures, [], 'External DTO fixture assertions must not be swallowed by business catch blocks');
		},
	};
}

/** Fresh ephemeral workerd/D1/KV/R2 only. This helper never loads Wrangler resource IDs or credentials. */
export async function createWorkerHarness(options = {}) {
	const outbound = options.outbound ?? outboundFixture();
	const logs = [];
	const primary = {
		name: 'mail-contract-worker', modules: true, scriptPath: await buildWorker(),
		compatibilityDate: '2025-06-04', d1Databases: ['db'], kvNamespaces: ['kv'],
		...(options.r2 ? { r2Buckets: ['r2'] } : {}),
		bindings: { domain: ['example.test'], admin: 'admin@example.test', jwt_secret: localSecret, analysis_cache: false, orm_log: false, ...options.bindings },
		serviceBindings: { assets: request => new WorkerResponse(`local-assets:${new URL(request.url).pathname}`, { headers: { 'content-type': 'text/plain' } }) },
		outboundService: request => outbound.dispatch(request),
		...(options.nativeEmail ? { email: { send_email: [{ name: 'email', allowed_sender_addresses: ['admin@example.test'],
			allowed_destination_addresses: ['allowed@example.net', 'recipient@example.test', 'recipient+tag@example.test'] }] } } : {}),
	};
	const workers = [primary];
	if (options.ai !== undefined) {
		primary.serviceBindings.ai = 'contract-ai-fixture';
		workers.push({ name: 'contract-ai-fixture', modules: true, compatibilityDate: '2025-06-04',
			script: `import { WorkerEntrypoint } from 'cloudflare:workers'; export default class extends WorkerEntrypoint {
				async run(model, input) { console.log('CONTRACT_AI_CALL:' + JSON.stringify({ model, input }));
					if (this.env.reject) throw new Error('fixture AI failure'); return JSON.parse(this.env.response); }
			}`, bindings: { reject: options.ai.reject ?? false, response: JSON.stringify(options.ai.response ?? { response: '{"code":"123456"}' }) } });
	}
	const mf = new Miniflare({ workers, unsafeTriggerHandlers: true, log: new Log(LogLevel.NONE), handleRuntimeStdio(stdout, stderr) {
		stdout.on('data', data => logs.push(String(data))); stderr.on('data', data => logs.push(String(data)));
	} });
	try {
		const db = await mf.getD1Database('db');
		const kv = await mf.getKVNamespace('kv');
		const r2 = options.r2 ? await mf.getR2Bucket('r2') : undefined;
		const harness = {
			mf, db, kv, r2, logs, outbound,
			async fetch(path, init = {}) {
				return mf.dispatchFetch(`http://contract.test${path}`, { ...init, headers: { ...localHeaders, ...init.headers } });
			},
			async api(path, { method = 'GET', token, body, headers } = {}) {
				const response = await this.fetch(`/api${path}`, { method, headers: { ...(token ? { Authorization: token } : {}),
					...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
				return { status: response.status, headers: response.headers, body: await response.json() };
			},
			async initialize() {
				const response = await this.fetch(`/api/init/${localSecret}`);
				assert.equal(response.status, 200);
				assert.equal(await response.text(), 'success');
			},
			async settings(patch = {}) {
				const current = await kv.get('setting:', 'json');
				assert.ok(current, 'initialize the isolated local fixture before changing settings');
				const updated = { ...current, ...patch };
				await kv.put('setting:', JSON.stringify(updated));
				return updated;
			},
			async receive(raw, to = 'recipient@example.test', from = 'sender@external.test') {
				// Pinned Miniflare experimental trigger. setReject response codes are not SMTP contracts.
				return this.fetch(`/cdn-cgi/handler/email?${new URLSearchParams({ from, to })}`, { method: 'POST', body: raw });
			},
			async scheduled(cron = '0 * * * *') {
				return (await mf.getWorker()).scheduled({ cron, scheduledTime: Date.now() });
			},
			async close() { try { await mf.dispose(); } finally { outbound.assertExpected(); } },
		};
		if (options.initialize !== false) {
			await harness.initialize();
			await harness.settings({ receive: 0, send: 0, noRecipient: 0, registerVerify: 1, addEmailVerify: 1, regKey: 1,
				aiCode: 1, tgBotStatus: 1, forwardStatus: 1, webhookStatus: 1, emailPrefixFilter: '', autoCleanDays: 0 });
		}
		return harness;
	} catch (error) { await mf.dispose(); throw error; }
}

export function signToken(payload, secret = localSecret) {
	const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
	const encoded = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000), ...payload })).toString('base64url');
	return `${header}.${encoded}.${createHmac('sha256', secret).update(`${header}.${encoded}`).digest('base64url')}`;
}

export function decodeToken(token) { return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); }

export async function seedUser(harness, email = 'admin@example.test', options = {}) {
	const role = await harness.db.prepare('SELECT role_id FROM role WHERE is_default=1 LIMIT 1').first();
	const salt = 'contract-local-salt';
	const password = options.password ?? 'local-password';
	const hash = createHash('sha256').update(salt + password).digest('base64');
	await harness.db.prepare('INSERT INTO user(email,password,salt,type) VALUES (?,?,?,?)').bind(email, hash, salt, role.role_id).run();
	const user = await harness.db.prepare('SELECT * FROM user WHERE email=?').bind(email).first();
	await harness.db.prepare('INSERT INTO account(user_id,email,name) VALUES (?,?,?)').bind(user.user_id, email, email.split('@')[0]).run();
	const account = await harness.db.prepare('SELECT * FROM account WHERE email=?').bind(email).first();
	const session = `contract-session-${user.user_id}`;
	await harness.kv.put(`auth-uid:${user.user_id}`, JSON.stringify({ user: { userId: user.user_id, email }, tokens: [session], refreshTime: new Date().toISOString() }));
	return { userId: user.user_id, accountId: account.account_id, email, password, token: signToken({ userId: user.user_id, token: session }) };
}

export async function seedMail(harness, owner, patch = {}) {
	const fields = { user_id: owner.userId, account_id: owner.accountId, send_email: 'sender@external.test', to_email: owner.email,
		subject: 'Contract fixture', content: '<p>Fixture content</p>', text: 'Fixture text', type: 0, status: 0, recipient: '[]', ...patch };
	const names = Object.keys(fields);
	const result = await harness.db.prepare(`INSERT INTO email(${names.join(',')}) VALUES(${names.map(() => '?').join(',')}) RETURNING *`).bind(...Object.values(fields)).first();
	return result;
}

export function sendBody(owner, patch = {}) {
	return { accountId: owner.accountId, name: 'Contract sender', receiveEmail: ['allowed@example.net'], content: '<p>Contract body</p>',
		text: 'Contract body', subject: 'Contract sent mail', attachments: [], ...patch };
}

export async function schemaSnapshot(db) {
	const rows = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE '_mf_%' ORDER BY type,name").all()).results;
	return rows.map(row => ({ ...row, sql: row.sql?.replace(/\s+/g, ' ').trim() ?? null }));
}

/** Examine real Hono registrations, not a regex inventory of unmounted source files. */
export async function registeredRoutes() {
	const entry = await sourcePath('src/hono/webs');
	const output = resolve(workerRoot, '.wrangler/contracts-current', `routes-${process.pid}.mjs`);
	await mkdir(dirname(output), { recursive: true });
	await build({ stdin: { contents: `import * as module from ${JSON.stringify(entry)};
		const app = typeof module.default === 'function' ? module.default() : module.default;
		export default app.routes.filter(route => route.method !== 'ALL').map(({ method, path }) => ({ method, path: '/api' + path }));`, resolveDir: workerRoot },
		outfile: output, bundle: true, format: 'esm', platform: 'browser', conditions: ['workerd', 'worker', 'browser'], logLevel: 'silent', external: ['cloudflare:*', 'node:*'] });
	return (await import(pathToFileURL(output).href)).default.sort((left, right) => `${left.path}:${left.method}`.localeCompare(`${right.path}:${right.method}`));
}

/** Compile the current production module for callback contracts the emulator cannot expose faithfully. */
export async function actualModule(stem) {
	if (stem === 'src/email/email' && process.env.WORKER_CONTRACT_ORIGINAL_CALLBACKS === '1') {
		const worker = (await import(pathToFileURL(resolve(workerRoot, process.env.WORKER_CONTRACT_BUNDLE)).href)).default;
		return { email: worker.email };
	}
	const entry = await sourcePath(stem);
	const output = resolve(workerRoot, '.wrangler/contracts-current', `module-${stem.replaceAll('/', '-')}-${process.pid}.mjs`);
	await mkdir(dirname(output), { recursive: true });
	await build({ entryPoints: [entry], outfile: output, bundle: true, format: 'esm', platform: 'browser',
		conditions: ['workerd', 'worker', 'browser'], logLevel: 'silent', external: ['cloudflare:*', 'node:*'] });
	return import(pathToFileURL(output).href);
}

export async function sourceFiles(directory = resolve(workerRoot, 'src')) {
	const entries = await readdir(directory, { withFileTypes: true });
	return (await Promise.all(entries.map(entry => entry.isDirectory() ? sourceFiles(resolve(directory, entry.name)) : /\.[jt]s$/.test(entry.name) ? resolve(directory, entry.name) : []))).flat().sort();
}

export async function fixtureJson(name) { return JSON.parse(await readFile(resolve(workerRoot, 'test/fixtures', name), 'utf8')); }

export async function configurationSnapshot() {
	const files = ['wrangler.toml', 'wrangler-dev.toml', 'wrangler-test.toml', 'wrangler-action.toml'];
	const snapshots = {};
	for (const file of files) {
		const text = await readFile(resolve(workerRoot, file), 'utf8');
		// Record declarations including optional commented bindings; never copy configured credentials or resource IDs.
		const bindings = [...text.matchAll(/^\s*#?\s*binding\s*=\s*"([^"]+)"/gm)].map(match => match[1]).sort();
		const varsSection = text.split(/^\[vars\]\s*$/m)[1]?.split(/^\[/m)[0] ?? '';
		const environmentKeys = [...varsSection.matchAll(/^\s*#?\s*([a-zA-Z_][\w]*)\s*=/gm)].map(match => match[1]).sort();
		const emailBinding = /\[\[send_email\]\]/.test(text) ? text.match(/\[\[send_email\]\][\s\S]*?name\s*=\s*"([^"]+)"/)?.[1] : undefined;
		snapshots[file] = { bindings, environmentKeys, ...(emailBinding ? { emailBinding } : {}),
			compatibilityDate: text.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1],
			main: text.match(/^main\s*=\s*"([^"]+)"/m)?.[1]?.replace(/\.(js|ts)$/, ''),
			assetsDirectory: text.match(/^directory\s*=\s*"([^"]+)"/m)?.[1],
			crons: text.match(/^crons\s*=\s*(\[[^\]]*\])/m)?.[1] ?? null };
	}
	return snapshots;
}
