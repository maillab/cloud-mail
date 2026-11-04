import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHarness, decodeToken, outboundFixture, seedUser } from '../helpers/worker-harness.mjs';
import { multipartMail, plainMail } from '../fixtures/inbound.mjs';

test('Turnstile registration preserves form secret/response/IP and accepts only a successful provider result', async t => {
	for (const success of [true, false]) {
		await t.test(String(success), async child => {
			const outbound = outboundFixture().on('https://challenges.cloudflare.com/turnstile/v0/siteverify', call => {
				assert.equal(call.method, 'POST'); const form = new URLSearchParams(call.body);
				assert.equal(form.get('secret'), 'local-turnstile-secret'); assert.equal(form.get('response'), 'local-widget-token'); assert.equal(form.get('remoteip'), '127.0.0.1');
				return { body: { success } };
			});
			const h = await createWorkerHarness({ outbound }); child.after(() => h.close());
			await h.settings({ registerVerify: 0, secretKey: 'local-turnstile-secret' });
			const registered = await h.api('/register', { method: 'POST', body: { email: 'registered@example.test', password: 'local-password', token: 'local-widget-token' } });
			assert.equal(registered.status, 200); assert.equal(registered.body.code, success ? 200 : 400); assert.equal(outbound.calls.length, 1);
			assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, success ? 1 : 0);
		});
	}
});

test('empty Turnstile token fails before fetch and null provider JSON keeps the legacy error envelope', async t => {
	const outbound = outboundFixture().on('https://challenges.cloudflare.com/turnstile/v0/siteverify', () => ({ body: null }));
	const h = await createWorkerHarness({ outbound }); t.after(() => h.close()); await h.settings({ registerVerify: 0 });
	const body = { email: 'registered@example.test', password: 'local-password' };
	assert.equal((await h.api('/register', { method: 'POST', body })).body.code, 400); assert.equal(outbound.calls.length, 0);
	assert.equal((await h.api('/register', { method: 'POST', body: { ...body, token: 'local-token' } })).body.code, 500);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 0);
});

test('Telegram notification captures per-chat DTO, view JWT/URL and provider failure leaves accepted mail intact', async t => {
	const captured = [];
	const outbound = outboundFixture().on('https://api.telegram.org/botlocal-token/sendMessage', call => {
		assert.equal(call.method, 'POST'); const body = JSON.parse(call.body); captured.push(body);
		assert.equal(body.parse_mode, 'HTML'); assert.match(body.text, /Telegram fixture/);
		return { status: 503, body: 'local fixture failure' };
	});
	const h = await createWorkerHarness({ outbound }); t.after(() => h.close());
	await h.settings({ tgBotStatus: 0, tgBotToken: 'local-token', tgChatId: '101,202', customDomain: 'https://mail.example.test/' });
	await h.receive(plainMail('Telegram fixture', 'absent@example.test'), 'absent@example.test');
	const row = await h.db.prepare('SELECT * FROM email').first(); assert.equal(row.status, 7); assert.equal(row.is_del, 0);
	assert.deepEqual(captured.map(body => body.chat_id).sort(), ['101', '202']);
	const link = captured[0].reply_markup.inline_keyboard[0][0].web_app.url; assert.ok(link.startsWith('https://mail.example.test/api/telegram/getEmail/'));
	const token = link.split('/').at(-1); const payload = decodeToken(token); assert.equal(payload.emailId, row.email_id); assert.deepEqual(Object.keys(payload).sort(), ['emailId', 'iat']);
	const view = await h.fetch(`/api/telegram/getEmail/${token}`); assert.equal(view.status, 200); assert.match(view.headers.get('content-type'), /text\/html/);
	assert.equal(view.headers.get('cache-control'), 'public, max-age=604800, immutable'); assert.match(await view.text(), /The local fixture body/);
	const ordinary = await seedUser(h);
	const denied = await h.fetch(`/api/telegram/getEmail/${ordinary.token}`); assert.equal((await denied.text()).includes('The local fixture body'), false);
});

test('real S3 SDK stores binary objects, outranks R2, reads bytes and sends MD5 multi-delete over captured transport', async t => {
	const objects = new Map();
	const outbound = outboundFixture().on(/^https:\/\/s3\.fixture\.invalid\//, call => {
		const url = new URL(call.url); assert.ok(url.pathname.startsWith('/local-bucket/'));
		assert.match(call.headers.authorization, /^AWS4-HMAC-SHA256 Credential=local-access-key\//);
		if (call.method === 'PUT') {
			objects.set(url.pathname, { bytes: call.bytes, contentType: call.headers['content-type'], disposition: call.headers['content-disposition'] });
			return { body: '', headers: { etag: '"local-fixture-etag"' } };
		}
		if (call.method === 'GET') {
			const object = objects.get(url.pathname); assert.ok(object);
			return { body: new Uint8Array(object.bytes), headers: { 'content-type': object.contentType, 'content-disposition': object.disposition } };
		}
		assert.equal(call.method, 'POST'); assert.ok(url.searchParams.has('delete')); assert.ok(call.headers['content-md5']);
		for (const [, key] of call.body.matchAll(/<Key>([^<]+)<\/Key>/g)) objects.delete(`/local-bucket/${key}`);
		return { body: '<DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>', headers: { 'content-type': 'application/xml' } };
	});
	const h = await createWorkerHarness({ r2: true, outbound }); t.after(() => h.close()); const recipient = await seedUser(h, 'recipient@example.test');
	await h.settings({ bucket: 'local-bucket', endpoint: 'https://s3.fixture.invalid', s3AccessKey: 'local-access-key', s3SecretKey: 'local-secret-key', region: 'auto', forcePathStyle: 0, syncDelete: 0 });
	await h.receive(multipartMail('S3 fixture'));
	const email = await h.db.prepare('SELECT * FROM email WHERE subject=?').bind('S3 fixture').first(); assert.ok(email);
	const rows = (await h.db.prepare('SELECT * FROM attachments WHERE email_id=?').bind(email.email_id).all()).results; assert.equal(rows.length, 2);
	assert.equal(objects.size, 2); const ordinary = rows.find(row => row.filename === 'binary.bin'); assert.equal(await h.r2.get(ordinary.key), null);
	const response = await h.fetch(`/api/oss/${ordinary.key}`); assert.equal(response.status, 200); assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
	const removed = await h.api(`/email/delete?emailIds=${email.email_id}`, { method: 'DELETE', token: recipient.token }); assert.equal(removed.body.code, 200); assert.equal(objects.size, 0);
	assert.equal(outbound.calls.filter(call => call.method === 'POST').length, 1);
});
