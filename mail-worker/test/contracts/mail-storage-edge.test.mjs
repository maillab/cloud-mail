import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { actualModule, createWorkerHarness, seedUser, sendBody } from '../helpers/worker-harness.mjs';
import { multipartMail } from '../fixtures/inbound.mjs';

const hashKey = (bytes, extension) => `attachments/${createHash('sha256').update(new Uint8Array(bytes)).digest('hex').slice(0, 32)}.${extension}`;

function repeatedCidMail() {
	const head = 'From: Sender <sender@external.test>\r\nTo: Recipient <recipient@example.test>\r\nSubject: Repeated CID fixture\r\nMessage-ID: <repeated-cid@external.test>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="cid-edge"\r\n\r\n';
	const html = '--cid-edge\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p><img src="cid:shared"><img src="cid:shared"><img src="cid:second-reference"></p>\r\n';
	const image = (filename, cid, content) => `--cid-edge\r\nContent-Type: image/png; name="${filename}"\r\nContent-Disposition: inline; filename="${filename}"\r\nContent-ID: <${cid}>\r\nContent-Transfer-Encoding: base64\r\n\r\n${content}\r\n`;
	return head + html + image('first.png', 'shared', 'BAUG') + image('duplicate-cid.png', 'shared', 'BwgJ') + image('same-object.png', 'second-reference', 'BAUG') + '--cid-edge--\r\n';
}

test('R2 OSS GET/HEAD preserve MIME/disposition and raw bytes while object-path dispatch remains KV', async t => {
	const h = await createWorkerHarness({ r2: true }); t.after(() => h.close());
	const key = 'attachments/r2-response.bin';
	const bytes = new Uint8Array([0, 127, 128, 255]);
	await h.r2.put(key, bytes, { httpMetadata: { contentType: 'application/x-contract-binary', contentDisposition: 'inline; filename="r2-response.bin"', cacheControl: 'max-age=259200' } });
	const object = await h.r2.get(key); assert.equal(object.httpMetadata.cacheControl, 'max-age=259200');
	for (const method of ['GET', 'HEAD']) {
		const response = await h.fetch(`/api/oss/${key}`, { method });
		assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'application/x-contract-binary');
		assert.equal(response.headers.get('content-disposition'), 'inline; filename="r2-response.bin"');
		assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], method === 'GET' ? [...bytes] : []);
		// Existing API forwards MIME/disposition only; future cache policy needs a separate approved change.
		assert.equal(response.headers.get('cache-control'), null);
	}
	assert.equal((await h.fetch(`/${key}`)).status, 404);
	assert.equal(await h.kv.get(key), null);
});

test('repeated CID uses its first attachment and equal-content images retain distinct D1 references to one R2 key', async t => {
	const h = await createWorkerHarness({ r2: true }); t.after(() => h.close());
	const recipient = await seedUser(h, 'recipient@example.test');
	const response = await h.receive(repeatedCidMail());
	assert.equal(response.status, 200, await response.text());
	const email = await h.db.prepare('SELECT * FROM email WHERE subject=?').bind('Repeated CID fixture').first();
	assert.ok(email, JSON.stringify((await h.db.prepare('SELECT subject,status FROM email').all()).results) + h.logs.join(''));
	assert.equal(email.user_id, recipient.userId); assert.equal(email.status, 0); assert.equal(email.is_del, 0);
	const rows = (await h.db.prepare('SELECT filename,key,type,content_id FROM attachments WHERE email_id=? ORDER BY att_id').bind(email.email_id).all()).results;
	assert.deepEqual(rows, [
		{ filename: 'first.png', key: hashKey([4, 5, 6], 'png'), type: 1, content_id: '<shared>' },
		{ filename: 'duplicate-cid.png', key: hashKey([7, 8, 9], 'png'), type: 0, content_id: '<shared>' },
		{ filename: 'same-object.png', key: hashKey([4, 5, 6], 'png'), type: 1, content_id: '<second-reference>' },
	]);
	assert.equal(email.content.split(`{{domain}}${rows[0].key}`).length - 1, 3);
	assert.equal(email.content.includes(rows[1].key), false);
	assert.equal((await h.r2.list()).objects.length, 2);
	const shared = await h.r2.get(rows[0].key);
	assert.deepEqual([...new Uint8Array(await shared.arrayBuffer())], [4, 5, 6]);
	assert.equal(shared.httpMetadata.contentDisposition, 'inline;filename=same-object.png');
	assert.equal(shared.httpMetadata.cacheControl, 'max-age=259200');
	assert.deepEqual((await h.api(`/email/attList?emailId=${email.email_id}`, { token: recipient.token })).body.data, []);
});

test('actual production inbound callback consumes a controlled many-chunk MIME stream against real local D1/KV/R2', async t => {
	const h = await createWorkerHarness({ r2: true }); t.after(() => h.close());
	const recipient = await seedUser(h, 'recipient@example.test');
	const { email } = await actualModule('src/email/email');
	const bytes = new TextEncoder().encode(multipartMail('Chunked MIME fixture'));
	let offset = 0; let chunkCount = 0;
	const raw = new ReadableStream({ pull(controller) {
		if (offset === bytes.length) { controller.close(); return; }
		const end = Math.min(offset + [1, 7, 19, 3][chunkCount % 4], bytes.length);
		controller.enqueue(bytes.slice(offset, end)); offset = end; chunkCount++;
	} });
	await email({ from: 'sender@external.test', to: recipient.email, raw,
		setReject(reason) { assert.fail(`Unexpected rejection: ${reason}`); }, async forward() { assert.fail('Forwarding is disabled in the fixture'); } },
		{ kv: h.kv, db: h.db, r2: h.r2, domain: ['example.test'], admin: 'admin@example.test' }, {});
	assert.ok(chunkCount > 50, 'The real callback must consume many boundary/header/base64 chunks');
	const row = await h.db.prepare('SELECT * FROM email WHERE subject=?').bind('Chunked MIME fixture').first();
	assert.equal(row.account_id, recipient.accountId); assert.equal(row.message_id, '<fixture-mime@external.test>');
	assert.equal(row.status, 0); assert.equal(row.is_del, 0); assert.match(row.content, /Fixture body/);
	const attachments = (await h.db.prepare('SELECT filename,key,type,size FROM attachments WHERE email_id=? ORDER BY att_id').bind(row.email_id).all()).results;
	assert.deepEqual(attachments, [
		{ filename: 'binary.bin', key: hashKey([1, 2, 3], 'bin'), type: 0, size: 3 },
		{ filename: 'inline.png', key: hashKey([4, 5, 6], 'png'), type: 1, size: 3 },
	]);
	for (const [index, attachment] of attachments.entries()) {
		assert.deepEqual([...new Uint8Array(await (await h.r2.get(attachment.key)).arrayBuffer())], index === 0 ? [1, 2, 3] : [4, 5, 6]);
	}
});

test('native sender reloads repeated stored body images as binary attachments and persists shared references', async t => {
	const h = await createWorkerHarness({ r2: true, nativeEmail: true }); t.after(() => h.close());
	const owner = await seedUser(h); await seedUser(h, 'recipient@example.test');
	await h.receive(multipartMail('Stored image fixture'));
	const key = hashKey([4, 5, 6], 'png');
	const sent = await h.api('/email/send', { method: 'POST', token: owner.token, body: sendBody(owner, {
		content: `<p><img src="${key}"><img src="${key}"></p>`, subject: 'Native reused image fixture',
	}) });
	assert.equal(sent.status, 200); assert.equal(sent.body.code, 200); assert.equal(sent.body.data[0].status, 2);
	const sentId = sent.body.data[0].emailId;
	const rows = (await h.db.prepare('SELECT key,type,content_id FROM attachments WHERE email_id=? ORDER BY att_id').bind(sentId).all()).results;
	assert.equal(rows.length, 2); assert.deepEqual(rows.map(row => row.key), [key, key]); assert.deepEqual(rows.map(row => row.type), [1, 1]);
	assert.notEqual(rows[0].content_id, rows[1].content_id); assert.match(rows[0].content_id, /^<[a-f0-9]{32}>$/);
	assert.equal(sent.body.data[0].content.split(`{{domain}}${key}`).length - 1, 2);
	assert.deepEqual(sent.body.data[0].attList, []);
	const artifacts = [...h.logs.join('').matchAll(/Attachment \(inline\): inline\.png -> ([^\r\n]+)/g)].map(match => match[1].trim());
	assert.equal(artifacts.length, 2, 'The real native builder serializes both separately identified body images');
	for (const artifact of artifacts) assert.deepEqual([...await readFile(artifact)], [4, 5, 6]);
	assert.equal(h.outbound.calls.length, 0);
});

test('attachment D1 insertion failure is logged after R2 writes while the original inbound completion behavior is preserved', async t => {
	const h = await createWorkerHarness({ r2: true }); t.after(() => h.close()); await seedUser(h, 'recipient@example.test');
	await h.db.prepare("CREATE TRIGGER contract_attachment_failure BEFORE INSERT ON attachments BEGIN SELECT RAISE(ABORT,'local attachment persistence failure'); END").run();
	await h.receive(multipartMail('Failed attachment fixture'));
	const row = await h.db.prepare('SELECT status,is_del FROM email WHERE subject=?').bind('Failed attachment fixture').first();
	assert.deepEqual(row, { status: 0, is_del: 0 });
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM attachments').first()).n, 0);
	assert.equal((await h.r2.list()).objects.length, 2);
	assert.match(h.logs.join(''), /local attachment persistence failure/);
	// This intentionally preserves the current error boundary during migration; atomic receive needs a separate design.
});
