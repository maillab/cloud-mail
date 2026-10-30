import assert from 'node:assert/strict';
import test from 'node:test';
import service from '../.wrangler/sendflare-tests.mjs';

function mockFetch(response, status = 200) {
	const calls = [];
	globalThis.fetch = async (url, init) => {
		calls.push({ url, init, body: JSON.parse(init.body) });
		return new Response(JSON.stringify(response), { status });
	};
	return calls;
}

const base = {
	name: 'Alice',
	accountEmail: 'alice@example.com',
	subject: 'Hi',
	text: 'plain',
	html: '<p>html</p>',
	attachments: []
};

test('single send puts first recipient in to and the rest in cc', async () => {
	const calls = mockFetch({ code: 0, success: true, data: { emilId: 'id-1' } });
	const id = await service.send('tok', { ...base, receiveEmail: ['a@x.com', 'b@x.com'] });
	assert.equal(id, 'id-1');
	assert.equal(calls[0].url, 'https://api.sendflare.com/v1/send');
	assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
	assert.deepEqual(calls[0].body, {
		from: 'Alice <alice@example.com>', subject: 'Hi', body: '<p>html</p>', to: 'a@x.com', cc: ['b@x.com']
	});
});

test('reply sets threading headers and inline attachments keep content id', async () => {
	const calls = mockFetch({ code: 0, data: { emailId: 'id-2' } });
	await service.send('tok', {
		...base, receiveEmail: ['a@x.com'], sendType: 'reply', messageId: '<m@x>',
		attachments: [{ filename: 'a.png', content: 'AAAA', contentType: 'image/png', contentId: '<cid1>' }]
	});
	assert.deepEqual(calls[0].body.header, { 'In-Reply-To': '<m@x>', 'References': '<m@x>' });
	assert.deepEqual(calls[0].body.attachments, [
		{ filename: 'a.png', content: 'AAAA', contentType: 'image/png', disposition: 'inline', contentId: 'cid1' }
	]);
});

test('batch send passes recipients as an array and returns ids', async () => {
	const calls = mockFetch({ code: 0, data: ['i1', 'i2'] });
	const ids = await service.batchSend('tok', { ...base, receiveEmail: ['a@x.com', 'b@x.com'] });
	assert.deepEqual(ids, ['i1', 'i2']);
	assert.equal(calls[0].url, 'https://api.sendflare.com/v1/batchSend');
	assert.deepEqual(calls[0].body.to, ['a@x.com', 'b@x.com']);
});

test('business error codes are surfaced', async () => {
	mockFetch({ code: 100030, success: false, message: 'The sending domain is invalid' });
	await assert.rejects(service.send('tok', { ...base, receiveEmail: ['a@x.com'] }), /sending domain is invalid \(100030\)/);
});

test('webhook maps delivery events and ignores engagement events', async () => {
	const updates = globalThis.sendflareUpdates;
	updates.length = 0;
	await service.webhooks({}, { type: 'email.delivered', data: { emailId: 'known' } });
	await service.webhooks({}, { type: 'email.bounced', emailId: 'known', bounce: { type: 'Permanent' } });
	await service.webhooks({}, { type: 'email.opened', data: { emailId: 'known' } });
	await service.webhooks({}, { type: 'email.complaint', data: { emailId: 'missing' } });
	assert.deepEqual(updates.map(u => [u.resendEmailId, u.status]), [['known', 2], ['known', 3], ['missing', 4]]);
	assert.equal(updates[1].message, '{"type":"Permanent"}');
});
