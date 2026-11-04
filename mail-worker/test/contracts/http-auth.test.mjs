import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHarness, decodeToken, fixtureJson, seedMail, seedUser, signToken } from '../helpers/worker-harness.mjs';

test('HTTP dispatch preserves API JSON, asset fallback, CORS and raw Authorization semantics', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	assert.equal(await (await h.fetch('/settings')).text(), 'local-assets:/settings');
	assert.equal(await (await h.fetch('/api')).text(), 'local-assets:/api');
	const config = await h.api('/setting/websiteConfig');
	assert.equal(config.status, 200);
	assert.equal(config.body.code, 200);
	assert.equal(config.body.message, 'success');
	assert.deepEqual(Object.keys(config.body.data).sort(), (await fixtureJson('public-config-keys.json')).sort());
	assert.deepEqual(config.body.data.domainList, ['@example.test']);
	assert.equal(config.headers.get('access-control-allow-origin'), '*');
	assert.equal(config.headers.get('set-cookie'), null);
	const protectedRequest = await h.api('/my/loginUserInfo');
	assert.equal(protectedRequest.status, 200);
	assert.equal(protectedRequest.body.code, 401);
	assert.deepEqual(Object.keys(protectedRequest.body).sort(), ['code', 'message']);
	const preflight = await h.fetch('/api/email/send', { method: 'OPTIONS', headers: { Origin: 'https://client.example.test', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization,Content-Type' } });
	assert.equal(preflight.status, 204);
	assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
});

test('password login uses D1 hash, JWT/KV session, response envelope and no cookies', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h);
	const bad = await h.api('/login', { method: 'POST', body: { email: owner.email, password: 'incorrect' } });
	assert.equal(bad.status, 200); assert.equal(bad.body.code, 501);
	const login = await h.api('/login', { method: 'POST', body: { email: owner.email, password: owner.password } });
	assert.equal(login.status, 200); assert.deepEqual(Object.keys(login.body).sort(), ['code', 'data', 'message']);
	assert.equal(login.body.code, 200); assert.deepEqual(Object.keys(login.body.data), ['token']);
	assert.equal(login.headers.get('set-cookie'), null);
	const token = login.body.data.token;
	const payload = decodeToken(token);
	assert.deepEqual(Object.keys(payload).sort(), ['iat', 'token', 'userId']);
	assert.equal(payload.userId, owner.userId);
	const session = await h.kv.get(`auth-uid:${owner.userId}`, 'json');
	assert.ok(session.tokens.includes(payload.token)); assert.equal(session.user.email, owner.email);
	const user = await h.api('/my/loginUserInfo', { token });
	assert.equal(user.body.code, 200); assert.deepEqual(user.body.data.permKeys, ['*']);
	assert.equal((await h.api('/my/loginUserInfo', { token: `Bearer ${token}` })).body.code, 401);
	assert.equal((await h.api('/my/loginUserInfo', { token: signToken({ userId: owner.userId, token: 'missing-session' }) })).body.code, 401);
});

test('API query/body contract preserves brief/full list projections, cursors, reads and tenant scope', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h);
	const foreign = await seedUser(h, 'other@example.test');
	const first = await seedMail(h, owner, { subject: 'First', text: 'A'.repeat(350) });
	const second = await seedMail(h, owner, { subject: 'Second' });
	await seedMail(h, foreign, { subject: 'Foreign' });
	const query = `/email/list?accountId=${owner.accountId}&type=0&allReceive=0&size=1&full=0`;
	const brief = await h.api(query, { token: owner.token });
	assert.equal(brief.body.code, 200);
	assert.deepEqual(Object.keys(brief.body.data).sort(), ['latestEmail', 'list', 'total']);
	assert.equal(brief.body.data.total, 2); assert.equal(brief.body.data.list[0].emailId, second.email_id);
	assert.equal(brief.body.data.latestEmail.emailId, second.email_id);
	assert.equal('text' in brief.body.data.list[0], false); assert.equal('content' in brief.body.data.list[0], false);
	const cursor = await h.api(`${query}&emailId=${second.email_id}`, { token: owner.token });
	assert.equal(cursor.body.data.list[0].emailId, first.email_id); assert.equal(cursor.body.data.list[0].listText.length, 300);
	const full = await h.api(`/email/list?accountId=${owner.accountId}&type=0&allReceive=0&full=1`, { token: owner.token });
	assert.equal(full.body.data.list.length, 2); assert.ok(full.body.data.list[0].content); assert.deepEqual(full.body.data.list[0].attList, []);
	const read = await h.api('/email/read', { method: 'PUT', token: owner.token, body: { emailIds: [first.email_id] } });
	assert.deepEqual(read.body, { code: 200, message: 'success', data: null });
	assert.equal((await h.db.prepare('SELECT unread FROM email WHERE email_id=?').bind(first.email_id).first()).unread, 1);
	const wrongMethod = await h.fetch('/api/email/list', { method: 'POST', headers: { Authorization: owner.token } });
	assert.equal(wrongMethod.status, 404);
});

test('permission errors preserve JSON code 403 while public-token mode stays distinct from JWT', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h, 'ordinary@example.test');
	const forbidden = await h.api('/user/list', { token: owner.token });
	assert.equal(forbidden.status, 200); assert.equal(forbidden.body.code, 403);
	await h.kv.put('public_key:', 'local-public-token');
	const wrong = await h.api('/public/emailList', { method: 'POST', token: owner.token, body: {} });
	assert.equal(wrong.body.code, 401);
	const correct = await h.api('/public/emailList', { method: 'POST', token: 'local-public-token', body: { size: 2, num: 1 } });
	assert.deepEqual(correct.body, { code: 200, message: 'success', data: [] });
});
