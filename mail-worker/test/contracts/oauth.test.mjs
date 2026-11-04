import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHarness, decodeToken, outboundFixture, seedUser, signToken } from '../helpers/worker-harness.mjs';

const redirectUri = 'https://client.example.test/auth/google/callback';

function googleFixture({ subject = 'google-subject', tokenStatus = 200, missingSubject = false } = {}) {
	return outboundFixture()
		.on('https://oauth2.googleapis.com/token', call => {
			assert.equal(call.method, 'POST');
			assert.match(call.headers['content-type'], /application\/x-www-form-urlencoded/);
			assert.equal(new URLSearchParams(call.body).get('redirect_uri'), redirectUri);
			assert.equal(new URLSearchParams(call.body).get('code'), 'local-code');
			return { status: tokenStatus, body: { access_token: 'local-google-access-token' } };
		})
		.on('https://openidconnect.googleapis.com/v1/userinfo', call => {
			assert.equal(call.method, 'GET'); assert.equal(call.headers.authorization, 'Bearer local-google-access-token');
			return { body: { ...(missingSubject ? {} : { sub: subject }), email: 'identity@external.test', name: 'Local Google', picture: 'https://images.invalid/avatar' } };
		});
}

test('Google OAuth preserves form exchange, provider identity and separate 900-second setup proof', async t => {
	const h = await createWorkerHarness({ outbound: googleFixture() }); t.after(() => h.close());
	await h.settings({ googleSwitch: 0, googleClientId: 'local-id', googleClientSecret: 'local-secret' });
	const result = await h.api('/oauth/google/login', { method: 'POST', body: { code: 'local-code', redirectUri } });
	assert.equal(result.status, 200); assert.equal(result.body.code, 200);
	assert.deepEqual(Object.keys(result.body.data).sort(), ['expiresAt', 'setupToken', 'token', 'userInfo']);
	assert.equal(result.body.data.token, null);
	const proof = decodeToken(result.body.data.setupToken);
	assert.equal(proof.purpose, 'oauth-setup'); assert.equal(proof.platform, 'google'); assert.equal(proof.subject, 'google-subject');
	assert.equal(proof.exp - proof.iat, 900);
	const row = await h.db.prepare('SELECT * FROM oauth WHERE oauth_id=?').bind(proof.oauthId).first();
	assert.equal(row.oauth_user_id, 'google-subject'); assert.equal(row.user_id, 0);
	assert.equal((await h.api('/my/loginUserInfo', { token: result.body.data.setupToken })).body.code, 401);
	const bound = await h.api('/oauth/bindUser', { method: 'PUT', body: { email: 'oauth-user@example.test', setupToken: result.body.data.setupToken } });
	assert.equal(bound.body.code, 200);
	const payload = decodeToken(bound.body.data.token);
	const auth = await h.kv.get(`auth-uid:${payload.userId}`, 'json'); assert.ok(auth.tokens.includes(payload.token));
	assert.equal((await h.api('/my/loginUserInfo', { token: bound.body.data.token })).body.data.email, 'oauth-user@example.test');
	const replay = await h.api('/oauth/bindUser', { method: 'PUT', body: { email: 'replay@example.test', setupToken: result.body.data.setupToken } });
	assert.equal(replay.body.code, 501);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 1);
});

test('OAuth malformed identity / HTTP provider failures create no users and no setup session', async t => {
	for (const fixture of [{ tokenStatus: 503 }, { missingSubject: true }]) {
		await t.test(JSON.stringify(fixture), async child => {
			const h = await createWorkerHarness({ outbound: googleFixture(fixture) }); child.after(() => h.close());
			await h.settings({ googleSwitch: 0 });
			const result = await h.api('/oauth/google/login', { method: 'POST', body: { code: 'local-code', redirectUri } });
			assert.equal(result.status, 200); assert.equal(result.body.code, 501);
			assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM oauth').first()).n, 0);
			assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 0);
		});
	}
});

test('already bound OAuth logs in through normal KV/JWT session without another mailbox', async t => {
	const h = await createWorkerHarness({ outbound: googleFixture() }); t.after(() => h.close());
	const owner = await seedUser(h);
	await h.settings({ googleSwitch: 0 });
	await h.db.prepare('INSERT INTO oauth(oauth_user_id,platform,user_id) VALUES (?,?,?)').bind('google-subject', 'google', owner.userId).run();
	const result = await h.api('/oauth/google/login', { method: 'POST', body: { code: 'local-code', redirectUri } });
	assert.equal(result.body.code, 200); assert.equal(decodeToken(result.body.data.token).userId, owner.userId);
	assert.equal('setupToken' in result.body.data, false); assert.equal(result.headers.get('set-cookie'), null);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM account').first()).n, 1);
});

test('setup proof requires purpose, unexpired time and matching provider subject', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	await h.settings({ googleSwitch: 0 });
	await h.db.prepare('INSERT INTO oauth(oauth_user_id,platform,user_id) VALUES (?,?,?)').bind('google-subject', 'google', 0).run();
	const row = await h.db.prepare('SELECT oauth_id FROM oauth').first();
	const proof = { purpose: 'oauth-setup', oauthId: row.oauth_id, platform: 'google', subject: 'google-subject', exp: Math.floor(Date.now() / 1000) + 900 };
	for (const patch of [{ purpose: 'ordinary' }, { exp: 1 }, { subject: 'different' }, { platform: 'github' }]) {
		const result = await h.api('/oauth/bindUser', { method: 'PUT', body: { email: 'setup@example.test', setupToken: signToken({ ...proof, ...patch }) } });
		assert.equal(result.body.code, 501);
	}
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 0);
});
