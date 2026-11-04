import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createWorkerHarness, seedUser, sendBody } from '../helpers/worker-harness.mjs';
import { multipartMail } from '../fixtures/inbound.mjs';

test('KV attachment/static/legacy paths preserve bytes, MIME, HEAD, missing and method responses', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	await h.kv.put('attachments/probe.bin', new Uint8Array([1, 2, 3]), { metadata: { contentType: 'application/pdf', contentDisposition: 'attachment; filename="probe.bin"' } });
	await h.kv.put('static/background/local.png', new Uint8Array([4, 5]), { metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' } });
	for (const path of ['/attachments/probe.bin', '/mail/attachments/probe.bin']) {
		const response = await h.fetch(path);
		assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/pdf');
		assert.equal(response.headers.get('content-length'), '3'); assert.equal(response.headers.get('content-disposition'), 'attachment; filename="probe.bin"');
		assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
		const head = await h.fetch(path, { method: 'HEAD' });
		assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '3'); assert.equal(await head.text(), '');
	}
	assert.equal((await h.fetch('/static/background/local.png')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
	const missing = await h.fetch('/attachments/missing'); assert.equal(missing.status, 404); assert.equal(await missing.text(), 'Not Found');
	const post = await h.fetch('/attachments/probe.bin', { method: 'POST' }); assert.equal(post.status, 405); assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('actual inbound MIME persists D1 attachment records and truncated-SHA256 object keys through optional R2', async t => {
	const h = await createWorkerHarness({ r2: true }); t.after(() => h.close());
	const owner = await seedUser(h, 'recipient@example.test');
	const response = await h.receive(multipartMail()); assert.equal(response.status, 200);
	const email = await h.db.prepare('SELECT * FROM email WHERE subject=?').bind('Contract MIME').first();
	assert.equal(email.user_id, owner.userId); assert.equal(email.account_id, owner.accountId); assert.equal(email.is_del, 0);
	const rows = (await h.db.prepare('SELECT * FROM attachments ORDER BY att_id').all()).results; assert.equal(rows.length, 2);
	const ordinary = rows.find(row => row.filename === 'binary.bin'); const inline = rows.find(row => row.filename === 'inline.png');
	const expectedKey = `attachments/${createHash('sha256').update(new Uint8Array([1, 2, 3])).digest('hex').slice(0, 32)}.bin`;
	assert.equal(ordinary.key, expectedKey); assert.equal(ordinary.mime_type, 'application/octet-stream'); assert.equal(ordinary.type, 0);
	assert.equal(inline.type, 1); assert.equal(inline.content_id, '<fixture-image>'); assert.ok(email.content.includes(`{{domain}}${inline.key}`));
	const object = await h.r2.get(expectedKey); assert.deepEqual([...new Uint8Array(await object.arrayBuffer())], [1, 2, 3]);
	assert.equal(object.httpMetadata.contentType, 'application/octet-stream'); assert.equal(await h.kv.get(expectedKey), null);
	const oss = await h.fetch(`/api/oss/${expectedKey}`); assert.equal(oss.headers.get('content-type'), 'application/octet-stream');
	assert.deepEqual([...new Uint8Array(await oss.arrayBuffer())], [1, 2, 3]);
	const listed = await h.api(`/email/attList?emailId=${email.email_id}`, { token: owner.token }); assert.equal(listed.body.data.length, 1);
	assert.equal(listed.body.data[0].key, expectedKey);
});

test('station copies share attachment keys and deleting one owner preserves remaining reference', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const sender = await seedUser(h); const recipient = await seedUser(h, 'recipient@example.test');
	const sent = await h.api('/email/send', { method: 'POST', token: sender.token, body: sendBody(sender, { receiveEmail: [recipient.email], attachments: [{ filename: 'shared.bin', type: 'application/octet-stream', content: 'AQID' }] }) });
	assert.equal(sent.body.code, 200);
	const rows = (await h.db.prepare('SELECT * FROM attachments ORDER BY att_id').all()).results; assert.equal(rows.length, 2);
	assert.equal(rows[0].key, rows[1].key); assert.equal(h.outbound.calls.length, 0);
	await h.settings({ syncDelete: 0 });
	const deleted = await h.api(`/email/delete?emailIds=${rows[0].email_id}`, { method: 'DELETE', token: sender.token }); assert.equal(deleted.body.code, 200);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM attachments WHERE key=?').bind(rows[0].key).first()).n, 1);
	assert.ok(await h.kv.get(rows[0].key, 'arrayBuffer'));
	const received = await h.api(`/email/attList?emailId=${rows[1].email_id}`, { token: recipient.token }); assert.equal(received.body.data.length, 1);
	await h.api(`/email/delete?emailIds=${rows[1].email_id}`, { method: 'DELETE', token: recipient.token });
	assert.equal(await h.kv.get(rows[0].key), null);
});
