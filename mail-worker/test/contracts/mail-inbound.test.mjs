import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actualModule, createWorkerHarness, outboundFixture, seedUser } from '../helpers/worker-harness.mjs';
import { plainMail } from '../fixtures/inbound.mjs';

test('inbound handler persists after plus fallback and notification 503 retries never lose received mail', async t => {
	const outbound = outboundFixture().on('https://local-hook.invalid/', call => {
		assert.equal(call.method, 'POST'); assert.equal(call.headers.authorization, 'local-webhook-secret');
		const body = JSON.parse(call.body);
		assert.equal(body.subject, 'Inbound plus'); assert.equal(body.toEmail, 'recipient+tag@example.test');
		assert.deepEqual(Object.keys(body).sort(), ['code', 'content', 'createTime', 'emailId', 'sendEmail', 'sendName', 'subject', 'text', 'toEmail', 'toName']);
		return { status: 503, body: 'fixture unavailable' };
	});
	const h = await createWorkerHarness({ outbound }); t.after(() => h.close());
	const recipient = await seedUser(h, 'recipient@example.test');
	await h.settings({ webhookStatus: 0, webhookUrl: 'https://local-hook.invalid', webhookSecret: 'local-webhook-secret', webhookRetry: 1 });
	const response = await h.receive(plainMail('Inbound plus', 'recipient+tag@example.test'), 'recipient+tag@example.test'); assert.equal(response.status, 200);
	const email = await h.db.prepare('SELECT * FROM email WHERE subject=?').bind('Inbound plus').first();
	assert.equal(email.user_id, recipient.userId); assert.equal(email.account_id, recipient.accountId);
	assert.equal(email.status, 0); assert.equal(email.is_del, 0); assert.equal(email.to_email, 'recipient+tag@example.test');
	assert.equal(email.message_id, '<Inbound-plus@external.test>'); assert.equal(outbound.calls.length, 2);
});

test('inbound exact plus account takes priority over base account and unknown recipient uses NOONE', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const recipient = await seedUser(h, 'recipient@example.test');
	await h.db.prepare('INSERT INTO account(user_id,email,name) VALUES (?,?,?)').bind(recipient.userId, 'recipient+tag@example.test', 'Tag').run();
	const plus = await h.db.prepare('SELECT account_id FROM account WHERE email=?').bind('recipient+tag@example.test').first();
	await h.receive(plainMail('Exact plus', 'recipient+tag@example.test'), 'recipient+tag@example.test');
	assert.equal((await h.db.prepare('SELECT account_id FROM email WHERE subject=?').bind('Exact plus').first()).account_id, plus.account_id);
	await h.receive(plainMail('Unknown recipient', 'nobody@example.test'), 'nobody@example.test');
	const nobody = await h.db.prepare('SELECT user_id,account_id,status,is_del FROM email WHERE subject=?').bind('Unknown recipient').first();
	assert.deepEqual(nobody, { user_id: 0, account_id: 0, status: 7, is_del: 0 });
});

test('closed receive, subject blacklist and no-recipient policy prevent local persistence', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const modes = [{ receive: 1 }, { receive: 0, blackSubject: 'Blocked' }, { blackSubject: '', noRecipient: 1 }];
	for (const patch of modes) {
		await h.settings(patch);
		await h.receive(plainMail('Blocked fixture', 'absent@example.test'), 'absent@example.test');
		assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 0);
	}
	// Miniflare's email trigger may return HTTP 200 after setReject; only persistence is asserted here.
	assert.equal(h.outbound.calls.length, 0);
});

test('actual production email module calls setReject with the original rejection reasons', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const { email } = await actualModule('src/email/email');
	const env = { kv: h.kv, db: h.db, domain: ['example.test'], admin: 'admin@example.test' };
	for (const [patch, reason] of [[{ receive: 1 }, 'Service suspended'], [{ receive: 0, blackSubject: 'Blocked' }, 'Message rejected'], [{ blackSubject: '', noRecipient: 1 }, 'Recipient not found']]) {
		await h.settings(patch); const rejected = [];
		const message = { from: 'sender@external.test', to: 'absent@example.test', raw: new Blob([plainMail('Blocked fixture', 'absent@example.test')]).stream(),
			setReject(value) { rejected.push(value); }, async forward() { assert.fail('Rejected mail must not be forwarded'); } };
		await email(message, env, {}); assert.deepEqual(rejected, [reason]);
	}
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 0);
});

test('actual production inbound settings failures are logged and rethrown before raw mail or side effects', async t => {
	const { email } = await actualModule('src/email/email');
	for (const mode of ['missing settings', 'KV failure']) {
		await t.test(mode, async child => {
			const sentinel = new Error('fixture KV unavailable');
			const reads = [], sideEffects = [], logs = [];
			const unexpected = name => () => {
				sideEffects.push(name);
				assert.fail(`Settings failure must precede ${name}`);
			};
			child.mock.method(console, 'error', (...args) => { logs.push(args); });
			const env = {
				kv: {
					async get(key, options) {
						reads.push([key, options]);
						if (mode === 'KV failure') throw sentinel;
						return null;
					},
					put: unexpected('KV put'),
				},
				db: new Proxy({}, { get: (_target, key) => unexpected(`D1 ${String(key)}`)() }),
				domain: ['example.test'], admin: 'admin@example.test',
			};
			const message = {
				from: 'sender@external.test', to: 'recipient@example.test',
				raw: { getReader: unexpected('raw.getReader') },
				setReject: unexpected('setReject'), forward: unexpected('forward'),
			};
			let receivedError;
			await assert.rejects(email(message, env, {}), error => {
				receivedError = error;
				if (mode === 'KV failure') assert.equal(error, sentinel);
				else {
					assert.equal(error.name, 'BizError');
					assert.equal(error.code, 501);
					assert.equal(error.message, '数据库未初始化 Database not initialized.');
				}
				return true;
			});
			assert.deepEqual(reads, [['setting:', { type: 'json' }]]);
			assert.deepEqual(sideEffects, []);
			assert.equal(logs.length, 1);
			assert.equal(logs[0][0], '邮件接收异常: ');
			assert.equal(logs[0][1], receivedError);
		});
	}
});

test('optional Workers AI binding returns a code without affecting accepted-mail lifecycle', async t => {
	const h = await createWorkerHarness({ ai: { response: { response: '{"code":"123456"}' } } }); t.after(() => h.close());
	await h.settings({ aiCode: 0 });
	await h.receive(plainMail('AI fixture', 'absent@example.test'), 'absent@example.test');
	const row = await h.db.prepare('SELECT code,status,is_del FROM email WHERE subject=?').bind('AI fixture').first();
	assert.deepEqual(row, { code: '123456', status: 7, is_del: 0 });
	assert.match(h.logs.join(''), /CONTRACT_AI_CALL:/);
});

test('missing AI binding, malformed AI response and AI failure fall back to empty code', async t => {
	for (const options of [{}, { ai: { response: { response: 'not-json' } } }, { ai: { reject: true } }]) {
		await t.test(JSON.stringify(options), async child => {
			const h = await createWorkerHarness(options); child.after(() => h.close());
			await h.settings({ aiCode: 0 });
			await h.receive(plainMail('AI failure', 'absent@example.test'), 'absent@example.test');
			assert.deepEqual(await h.db.prepare('SELECT code,status,is_del FROM email').first(), { code: '', status: 7, is_del: 0 });
		});
	}
});
