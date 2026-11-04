import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHarness, fixtureJson, outboundFixture, seedMail, seedUser } from '../helpers/worker-harness.mjs';

async function grantPermissions(h, owner, keys) {
	assert.notEqual(owner.email, 'admin@example.test');
	const role = await h.db.prepare('INSERT INTO role(name,key,avail_domain,account_count) VALUES (?,?,?,?) RETURNING role_id')
		.bind('Settings contract role', `settings-contract-${owner.userId}`, 'example.test', 20).first();
	await h.db.prepare('UPDATE user SET type=? WHERE user_id=?').bind(role.role_id, owner.userId).run();
	const permissions = (await h.db.prepare(`SELECT perm_id,perm_key FROM perm WHERE type=2 AND perm_key IN (${keys.map(() => '?').join(',')})`)
		.bind(...keys).all()).results;
	assert.deepEqual(permissions.map(row => row.perm_key).sort(), [...keys].sort());
	await h.db.batch(permissions.map(row => h.db.prepare('INSERT INTO role_perm(role_id,perm_id) VALUES (?,?)').bind(role.role_id, row.perm_id)));
}

async function seedAccount(h, owner, email) {
	const row = await h.db.prepare('INSERT INTO account(user_id,email,name) VALUES (?,?,?) RETURNING account_id')
		.bind(owner.userId, email, email.split('@')[0]).first();
	return { ...owner, email, accountId: row.account_id };
}

async function seedAttachment(h, owner, mail, key) {
	await h.db.prepare('INSERT INTO attachments(user_id,account_id,email_id,key,filename,mime_type,size) VALUES (?,?,?,?,?,?,?)')
		.bind(owner.userId, owner.accountId, mail.email_id, key, 'contract.bin', 'application/octet-stream', 3).run();
	await h.kv.put(key, new Uint8Array([1, 2, 3]), { metadata: { contentType: 'application/octet-stream' } });
}

function assertSuccess(response, data = null) {
	assert.equal(response.status, 200);
	assert.deepEqual(response.body, { code: 200, message: 'success', data });
	assert.equal(response.headers.get('set-cookie'), null);
}

test('account creation respects both disabled settings before inserting accounts or verification records', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h, 'owner@example.test');
	await grantPermissions(h, owner, ['account:add']);
	for (const patch of [{ addEmail: 1, manyEmail: 0 }, { addEmail: 0, manyEmail: 1 }]) {
		await h.settings(patch);
		const result = await h.api('/account/add', { method: 'POST', token: owner.token, body: { email: 'disabled@example.test' } });
		assert.equal(result.status, 200);
		assert.deepEqual(result.body, { code: 501, message: 'Add Email Address feature is disabled' });
		assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM account').first()).n, 1);
		assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 1);
		assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM verify_record').first()).n, 0);
	}
	assert.equal(h.outbound.calls.length, 0);
});

test('account creation returns the existing account projection and addVerifyOpen with captcha disabled', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h, 'owner@example.test');
	await grantPermissions(h, owner, ['account:add']);
	await h.settings({ addEmail: 0, manyEmail: 0, addEmailVerify: 1 });
	const result = await h.api('/account/add', { method: 'POST', token: owner.token, body: { email: 'created@example.test' } });
	assert.equal(result.status, 200); assert.equal(result.body.code, 200); assert.equal(result.body.message, 'success');
	assert.deepEqual(Object.keys(result.body).sort(), ['code', 'data', 'message']);
	assert.equal(result.headers.get('set-cookie'), null);
	const row = await h.db.prepare('SELECT * FROM account WHERE email=?').bind('created@example.test').first();
	assert.deepEqual(result.body.data, {
		accountId: row.account_id, email: 'created@example.test', name: 'created', status: 0,
		latestEmailTime: null, createTime: row.create_time, userId: owner.userId,
		allReceive: 0, sort: 0, isDel: 0, addVerifyOpen: false,
	});
	assert.equal(typeof row.create_time, 'string');
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM account WHERE user_id=?').bind(owner.userId).first()).n, 2);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM verify_record').first()).n, 0);
	assert.equal(h.outbound.calls.length, 0);
});

test('COUNT account creation reaches its threshold first and verifies Turnstile on the next creation', async t => {
	const outbound = outboundFixture().on('https://challenges.cloudflare.com/turnstile/v0/siteverify', call => {
		assert.equal(call.method, 'POST');
		assert.deepEqual([...new URLSearchParams(call.body)], [
			['secret', 'contract-turnstile-secret'], ['response', 'contract-widget-token'], ['remoteip', '127.0.0.1'],
		]);
		return { body: { success: true } };
	});
	const h = await createWorkerHarness({ outbound }); t.after(() => h.close());
	const owner = await seedUser(h, 'owner@example.test');
	await grantPermissions(h, owner, ['account:add']);
	await h.settings({ addEmail: 0, manyEmail: 0, addEmailVerify: 2, addVerifyCount: 1, secretKey: 'contract-turnstile-secret' });
	const first = await h.api('/account/add', { method: 'POST', token: owner.token, body: { email: 'first@example.test' } });
	assert.equal(first.body.code, 200); assert.equal(first.body.data.addVerifyOpen, true);
	assert.equal(outbound.calls.length, 0);
	assert.deepEqual((await h.db.prepare('SELECT ip,type,count FROM verify_record').all()).results, [{ ip: '127.0.0.1', type: 1, count: 1 }]);
	const second = await h.api('/account/add', { method: 'POST', token: owner.token,
		body: { email: 'second@example.test', token: 'contract-widget-token' } });
	assert.equal(second.status, 200); assert.equal(second.body.code, 200); assert.equal(second.body.data.addVerifyOpen, true);
	assert.equal(outbound.calls.length, 1);
	assert.deepEqual((await h.db.prepare('SELECT ip,type,count FROM verify_record').all()).results, [{ ip: '127.0.0.1', type: 1, count: 1 }]);
	assert.deepEqual((await h.db.prepare('SELECT email FROM account WHERE user_id=? ORDER BY account_id').bind(owner.userId).all()).results,
		[{ email: owner.email }, { email: 'first@example.test' }, { email: 'second@example.test' }]);
});

test('account deletion checks the main mailbox and ownership before looking up missing settings', async t => {
	const h = await createWorkerHarness(); t.after(() => h.close());
	const owner = await seedUser(h, 'owner@example.test');
	await grantPermissions(h, owner, ['account:delete']);
	const foreign = await seedUser(h, 'foreign@example.test');
	const owned = await seedAccount(h, owner, 'owned@example.test');
	await h.kv.delete('setting:');
	for (const [accountId, message] of [[owner.accountId, 'Cannot delete your own email'],
		[foreign.accountId, 'This email does not belong to the current user']]) {
		const denied = await h.api(`/account/delete?accountId=${accountId}`, { method: 'DELETE', token: owner.token });
		assert.equal(denied.status, 200); assert.deepEqual(denied.body, { code: 501, message });
	}
	const missingSettings = await h.api(`/account/delete?accountId=${owned.accountId}`, { method: 'DELETE', token: owner.token });
	assert.equal(missingSettings.status, 200);
	assert.deepEqual(missingSettings.body, { code: 501, message: '数据库未初始化 Database not initialized.' });
	assert.equal(await h.kv.get('setting:'), null);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM account').first()).n, 3);
	assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM account WHERE is_del<>0').first()).n, 0);
});

for (const syncDelete of [0, 1]) {
	test(`account deletion preserves syncDelete=${syncDelete} and its existing mail/attachment behavior`, async t => {
		const h = await createWorkerHarness(); t.after(() => h.close());
		const owner = await seedUser(h, 'owner@example.test');
		await grantPermissions(h, owner, ['account:delete']);
		const secondary = await seedAccount(h, owner, 'secondary@example.test');
		const mail = await seedMail(h, secondary);
		const key = `attachments/account-delete-${syncDelete}.bin`;
		await seedAttachment(h, secondary, mail, key);
		const foreign = await seedUser(h, 'foreign@example.test');
		const foreignMail = await seedMail(h, foreign);
		await h.settings({ syncDelete });
		assertSuccess(await h.api(`/account/delete?accountId=${secondary.accountId}`, { method: 'DELETE', token: owner.token }));
		const account = await h.db.prepare('SELECT is_del FROM account WHERE account_id=?').bind(secondary.accountId).first();
		const received = await h.db.prepare('SELECT is_del FROM email WHERE email_id=?').bind(mail.email_id).first();
		const attachment = await h.db.prepare('SELECT key FROM attachments WHERE email_id=?').bind(mail.email_id).first();
		if (syncDelete === 0) {
			assert.equal(account, null); assert.equal(received, null); assert.equal(attachment, null);
			assert.equal(await h.kv.get(key, 'arrayBuffer'), null);
		} else {
			assert.deepEqual(account, { is_del: 1 }); assert.deepEqual(received, { is_del: 0 });
			assert.deepEqual(attachment, { key });
			assert.deepEqual([...new Uint8Array(await h.kv.get(key, 'arrayBuffer'))], [1, 2, 3]);
		}
		assert.deepEqual(await h.db.prepare('SELECT is_del FROM account WHERE account_id=?').bind(owner.accountId).first(), { is_del: 0 });
		assert.deepEqual(await h.db.prepare('SELECT is_del FROM account WHERE account_id=?').bind(foreign.accountId).first(), { is_del: 0 });
		assert.ok(await h.db.prepare('SELECT email_id FROM email WHERE email_id=?').bind(foreignMail.email_id).first());
		assert.ok(await h.kv.get(`auth-uid:${owner.userId}`, 'json'));
	});

	test(`personal user deletion preserves syncDelete=${syncDelete} and revokes auth-uid`, async t => {
		const h = await createWorkerHarness(); t.after(() => h.close());
		const owner = await seedUser(h, 'owner@example.test');
		await grantPermissions(h, owner, ['my:delete']);
		const secondary = await seedAccount(h, owner, 'secondary@example.test');
		const mail = await seedMail(h, secondary);
		const key = `attachments/user-delete-${syncDelete}.bin`;
		await seedAttachment(h, secondary, mail, key);
		await h.db.prepare('INSERT INTO star(user_id,email_id) VALUES (?,?)').bind(owner.userId, mail.email_id).run();
		await h.db.prepare('INSERT INTO oauth(oauth_user_id,platform,user_id) VALUES (?,?,?)').bind('contract-subject', 'google', owner.userId).run();
		const foreign = await seedUser(h, 'foreign@example.test');
		await h.settings({ syncDelete });
		assertSuccess(await h.api('/my/delete', { method: 'DELETE', token: owner.token }));
		assert.equal(await h.kv.get(`auth-uid:${owner.userId}`, 'json'), null);
		const user = await h.db.prepare('SELECT is_del FROM user WHERE user_id=?').bind(owner.userId).first();
		const accounts = (await h.db.prepare('SELECT is_del FROM account WHERE user_id=? ORDER BY account_id').bind(owner.userId).all()).results;
		const received = await h.db.prepare('SELECT is_del FROM email WHERE email_id=?').bind(mail.email_id).first();
		const attachment = await h.db.prepare('SELECT key FROM attachments WHERE email_id=?').bind(mail.email_id).first();
		const stars = (await h.db.prepare('SELECT user_id FROM star WHERE user_id=?').bind(owner.userId).all()).results;
		const oauth = (await h.db.prepare('SELECT user_id FROM oauth WHERE user_id=?').bind(owner.userId).all()).results;
		if (syncDelete === 0) {
			assert.equal(user, null); assert.deepEqual(accounts, []); assert.equal(received, null); assert.equal(attachment, null);
			assert.deepEqual(stars, []); assert.deepEqual(oauth, []); assert.equal(await h.kv.get(key, 'arrayBuffer'), null);
		} else {
			assert.deepEqual(user, { is_del: 1 }); assert.deepEqual(accounts, [{ is_del: 0 }, { is_del: 0 }]);
			assert.deepEqual(received, { is_del: 0 }); assert.deepEqual(attachment, { key });
			assert.deepEqual(stars, [{ user_id: owner.userId }]); assert.deepEqual(oauth, [{ user_id: owner.userId }]);
			assert.deepEqual([...new Uint8Array(await h.kv.get(key, 'arrayBuffer'))], [1, 2, 3]);
		}
		assert.deepEqual(await h.db.prepare('SELECT is_del FROM user WHERE user_id=?').bind(foreign.userId).first(), { is_del: 0 });
		assert.ok(await h.kv.get(`auth-uid:${foreign.userId}`, 'json'));
		assert.equal((await h.api('/my/loginUserInfo', { token: owner.token })).body.code, 401);
	});
}

test('settings query still masks secrets and returns flags while websiteConfig keeps its public projection', async t => {
	const h = await createWorkerHarness({ r2: true, nativeEmail: true }); t.after(() => h.close());
	const owner = await seedUser(h, 'settings-reader@example.test');
	await grantPermissions(h, owner, ['setting:query']);
	const raw = await h.settings({
		siteKey: 'site-123456-secret', secretKey: 'turn-123456-secret',
		resendTokens: { 'example.test': 'resend-token-actual-private' },
		s3AccessKey: 'access-key-123456789', s3SecretKey: 'secret-key-123456789',
		tgBotToken: '12345678901234567890-telegram-private', bucket: '', endpoint: '',
		title: 'Settings contract title', loginDomain: 0, emailPrefixFilter: 'blocked,,reserved',
	});
	const queried = await h.api('/setting/query', { token: owner.token });
	assert.equal(queried.status, 200); assert.equal(queried.body.code, 200); assert.equal(queried.body.message, 'success');
	assert.equal(queried.headers.get('set-cookie'), null);
	const settings = queried.body.data;
	assert.equal(settings.siteKey, 'site-1******'); assert.equal(settings.secretKey, 'turn-1******');
	assert.deepEqual(settings.resendTokens, { 'example.test': 'resend-token******' });
	assert.equal(settings.s3AccessKey, 'access-key-1******'); assert.equal(settings.s3SecretKey, 'secret-key-1******');
	assert.equal(settings.tgBotToken, '12345678901234567890******');
	assert.equal(settings.hasR2, true); assert.equal(settings.hasCfEmail, true); assert.equal(settings.storageType, 'R2');
	assert.equal(settings.regVerifyOpen, false); assert.equal(settings.addVerifyOpen, false);
	assert.deepEqual(settings.domainList, ['@example.test']); assert.deepEqual(settings.emailPrefixFilter, ['blocked', 'reserved']);
	assert.equal(settings.projectLink, true); assert.equal(settings.title, 'Settings contract title');
	const website = await h.api('/setting/websiteConfig');
	assert.equal(website.status, 200); assert.equal(website.body.code, 200); assert.equal(website.body.message, 'success');
	assert.deepEqual(Object.keys(website.body.data).sort(), (await fixtureJson('public-config-keys.json')).sort());
	assert.equal(website.body.data.siteKey, 'site-123456-secret'); assert.equal(website.body.data.title, 'Settings contract title');
	assert.deepEqual(website.body.data.domainList, ['@example.test']);
	assert.deepEqual(await h.kv.get('setting:', 'json'), raw);
});
