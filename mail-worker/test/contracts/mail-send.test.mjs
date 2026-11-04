import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createWorkerHarness, outboundFixture, seedMail, seedUser, sendBody } from '../helpers/worker-harness.mjs';

test('native Email MessageBuilder accepts real binary attachment and returns provider receipt in original envelope', async t => {
	const h = await createWorkerHarness({ nativeEmail: true }); t.after(() => h.close());
	const owner = await seedUser(h);
	const sent = await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner, { attachments: [{ filename: 'native-binary.bin', contentType: 'application/octet-stream', content: 'AQID' }] }) });
	assert.equal(sent.status, 200); assert.equal(sent.body.code, 200); assert.equal(sent.body.data.length, 1);
	const row = sent.body.data[0]; assert.equal(row.type, 1); assert.equal(row.status, 2); assert.ok(row.resendEmailId); assert.equal(row.accountId, owner.accountId);
	assert.equal(row.attList.length, 1); assert.equal(row.attList[0].filename, 'native-binary.bin');
	const stored = await h.db.prepare('SELECT resend_email_id,status FROM email WHERE email_id=?').bind(row.emailId).first();
	assert.equal(stored.resend_email_id, row.resendEmailId); assert.equal(stored.status, 2);
	const artifact = h.logs.join('').match(/Attachment \(attachment\): native-binary\.bin -> ([^\r\n]+)/)?.[1]?.trim();
	assert.ok(artifact, 'Pinned Miniflare native email output must expose the actual serialized attachment');
	assert.deepEqual([...await readFile(artifact)], [1, 2, 3]);
	assert.equal(h.outbound.calls.length, 0, 'native Email.send is not replaced by a generic HTTP success stub');
	const keys = (await h.kv.list({ prefix: 'send_day_count:' })).keys; assert.equal(keys.length, 1); assert.equal(await h.kv.get(keys[0].name), '1');
});

test('native sender restriction and missing provider preserve error envelope without saving a sent row', async t => {
	for (const options of [{ nativeEmail: true }, {}]) {
		await t.test(JSON.stringify(options), async child => {
			const h = await createWorkerHarness(options); child.after(() => h.close()); const owner = await seedUser(h);
			const sent = await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner, { receiveEmail: ['forbidden@example.net'] }) });
			assert.equal(sent.status, 200); assert.equal(sent.body.code, options.nativeEmail ? 500 : 501); assert.deepEqual(Object.keys(sent.body).sort(), ['code', 'message']);
			if (options.nativeEmail) assert.match(sent.body.message, /not allowed/);
			assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 0);
		});
	}
});

test('closed sending and another user account are rejected before calling an external provider', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h); const other = await seedUser(h, 'other@example.test');
	await h.settings({ resendTokens: { 'example.test': 'local-resend-token' }, send: 1 });
	assert.equal((await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner) })).body.code, 403);
	await h.settings({ send: 0 });
	assert.equal((await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner, { accountId: other.accountId }) })).body.code, 501);
	assert.equal(h.outbound.calls.length, 0); assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 0);
});

test('Resend captures actual reply headers/base64 DTO and mixed recipients take one external path', async t => {
	const outbound = outboundFixture().on('https://api.resend.com/emails', call => {
		assert.equal(call.method, 'POST'); assert.equal(call.headers.authorization, 'Bearer local-resend-token');
		const body = JSON.parse(call.body);
		assert.deepEqual(body.to, ['recipient@example.test', 'allowed@example.net']);
		assert.equal(body.headers['in-reply-to'], '<original@external.test>'); assert.equal(body.headers.references, '<original@external.test>');
		assert.equal(body.attachments[0].content, 'AQID'); assert.equal(body.attachments[0].filename, 'resend.bin');
		return { body: { id: 'local-resend-receipt' } };
	});
	const h = await createWorkerHarness({ outbound }); t.after(() => h.close());
	const owner = await seedUser(h); await seedUser(h, 'recipient@example.test');
	const original = await seedMail(h, owner, { message_id: '<original@external.test>' });
	await h.settings({ resendTokens: { 'example.test': 'local-resend-token' } });
	const sent = await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner, { sendType: 'reply', emailId: original.email_id,
		receiveEmail: ['recipient@example.test', 'allowed@example.net'], attachments: [{ filename: 'resend.bin', contentType: 'application/octet-stream', content: 'AQID' }] }) });
	assert.equal(sent.body.code, 200); assert.equal(outbound.calls.length, 1); assert.equal(sent.body.data[0].resendEmailId, 'local-resend-receipt');
	assert.equal(sent.body.data[0].inReplyTo, '<original@external.test>'); assert.equal(sent.body.data[0].status, 1);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email WHERE to_email=? AND type=0').bind('recipient@example.test').first()).n, 0);
	const status = await h.fetch('/api/webhooks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'email.delivered', data: { email_id: 'local-resend-receipt' } }) });
	assert.equal(status.status, 200); assert.equal(await status.text(), 'success');
	assert.equal((await h.db.prepare('SELECT status FROM email WHERE resend_email_id=?').bind('local-resend-receipt').first()).status, 2);
});

test('Resend error response does not persist sent mail or increment daily count', async t => {
	const outbound = outboundFixture().on('https://api.resend.com/emails', () => ({ status: 422, body: { name: 'validation_error', message: 'local provider rejection' } }));
	const h = await createWorkerHarness({ outbound }); t.after(() => h.close()); const owner = await seedUser(h);
	await h.settings({ resendTokens: { 'example.test': 'local-resend-token' } });
	const result = await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner) });
	assert.equal(result.body.code, 501); assert.equal(result.body.message, 'local provider rejection');
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 0);
	assert.equal((await h.kv.list({ prefix: 'send_day_count:' })).keys.length, 0);
});

test('D1 failure after provider acceptance is surfaced; side effect order is recorded as migration evidence', async t => {
	const outbound = outboundFixture().on('https://api.resend.com/emails', () => ({ body: { id: 'accepted-before-d1-failure' } }));
	const h = await createWorkerHarness({ outbound }); t.after(() => h.close()); const owner = await seedUser(h);
	await h.settings({ resendTokens: { 'example.test': 'local-resend-token' } });
	await h.db.prepare("CREATE TRIGGER contract_send_failure BEFORE INSERT ON email WHEN NEW.type=1 BEGIN SELECT RAISE(ABORT,'local fixture persistence failure'); END").run();
	const result = await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner) });
	assert.equal(result.body.code, 500); assert.match(result.body.message, /local fixture persistence failure/);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 0);
	// Do not require this unsafe ordering forever: the audit describes it, and a later dedicated fix may prevent the call.
	t.diagnostic(`Observed provider calls before failed D1 insert: ${outbound.calls.length}`);
});

test('historical empty-array Resend token reaches the real SDK while zero/false keep the no-provider branch', async t => {
	for (const token of [[], 0, false]) {
		await t.test(JSON.stringify(token), async child => {
			const outbound = outboundFixture().on('https://api.resend.com/emails', call => {
				assert.equal(call.method, 'POST');
				// SDK creates "Bearer "; the native Headers implementation trims its trailing space on the wire.
				assert.equal(call.headers.authorization, 'Bearer');
				assert.deepEqual(JSON.parse(call.body).to, ['allowed@example.net']);
				return { status: 401, body: { name: 'validation_error', message: 'local empty-array token rejection' } };
			});
			const h = await createWorkerHarness({ outbound }); child.after(() => h.close());
			const owner = await seedUser(h);
			await h.settings({ resendTokens: { 'example.test': token } });
			const sent = await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner) });
			assert.equal(sent.status, 200); assert.equal(sent.body.code, 501);
			assert.equal(outbound.calls.length, Array.isArray(token) ? 1 : 0);
			if (Array.isArray(token)) assert.equal(sent.body.message, 'local empty-array token rejection');
			else assert.notEqual(sent.body.message, 'local empty-array token rejection');
			assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 0);
			assert.equal((await h.kv.list({ prefix: 'send_day_count:' })).keys.length, 0);
		});
	}
});
