import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHarness, decodeToken, seedMail, seedUser, signToken } from '../helpers/worker-harness.mjs';

const publicKeys = [
  'userId', 'email', 'type', 'status', 'createTime', 'activeTime', 'createIp', 'activeIp', 'os', 'browser', 'device',
  'sort', 'sendCount', 'regKeyId', 'isDel', 'username', 'trustLevel', 'avatar', 'name', 'platform',
  'receiveEmailCount', 'sendEmailCount', 'accountCount', 'delReceiveEmailCount', 'delSendEmailCount', 'delAccountCount', 'sendAction',
].sort();

// This compatibility baseline deliberately ignores only the two fields removed by S-USER-LIST.
function nonCredentialRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'password' && key !== 'salt'));
}

function success(response) {
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['code', 'data', 'message']);
  assert.equal(response.body.code, 200);
  assert.equal(response.body.message, 'success');
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('set-cookie'), null);
  return response.body.data;
}

function failure(response, code, message) {
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['code', 'message']);
  assert.equal(response.body.code, code);
  assert.equal(typeof response.body.message, 'string');
  if (message !== undefined) assert.equal(response.body.message, message);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('set-cookie'), null);
}

function assertPublicRow(row, expected) {
  const publicRow = nonCredentialRow(row);
  assert.equal(publicKeys.length, 27);
  assert.deepEqual(Object.keys(publicRow).sort(), publicKeys);
  assert.deepEqual(publicRow, expected);
}

async function fixedUser(h, email = 'admin@example.test', type) {
  const owner = await seedUser(h, email);
  const defaultRole = await h.db.prepare('SELECT role_id FROM role WHERE is_default=1 LIMIT 1').first();
  const roleId = type ?? defaultRole.role_id;
  await h.db.prepare(`UPDATE user SET type=?,status=0,create_time=?,active_time=?,create_ip=?,active_ip=?,
    os=?,browser=?,device=?,sort=7,send_count=3,reg_key_id=0,is_del=0 WHERE user_id=?`)
    .bind(roleId, '2020-01-02 03:04:05', '2021-02-03 04:05:06', '198.51.100.1', '198.51.100.2',
      'Fixture OS', 'Fixture Browser', 'Fixture Device', owner.userId).run();
  return { ...owner, expected: {
    userId: owner.userId, email, type: email === 'admin@example.test' ? 0 : roleId, status: 0,
    createTime: '2020-01-02 03:04:05', activeTime: '2021-02-03 04:05:06', createIp: '198.51.100.1', activeIp: '198.51.100.2',
    os: 'Fixture OS', browser: 'Fixture Browser', device: 'Fixture Device', sort: 7, sendCount: 3, regKeyId: 0, isDel: 0,
    username: null, trustLevel: null, avatar: null, name: null, platform: null,
    receiveEmailCount: 0, sendEmailCount: 0, accountCount: 1, delReceiveEmailCount: 0, delSendEmailCount: 0, delAccountCount: 0,
    sendAction: email === 'admin@example.test' ? { hasPerm: true, sendType: 'count', sendCount: 0 }
      : type === undefined ? { hasPerm: true, sendType: 'ban', sendCount: null } : { hasPerm: false },
  } };
}

async function roleWithPermissions(h, label, keys) {
  const role = await h.db.prepare('INSERT INTO role(name,key,avail_domain,send_count,send_type,account_count) VALUES (?,?,?,?,?,?) RETURNING role_id')
    .bind(label, label, 'example.test', 19, 'day', 20).first();
  for (const key of keys) {
    const permission = await h.db.prepare('SELECT perm_id FROM perm WHERE perm_key=? AND type=2').bind(key).first();
    assert.ok(permission, `fixture permission exists: ${key}`);
    await h.db.prepare('INSERT INTO role_perm(role_id,perm_id) VALUES (?,?)').bind(role.role_id, permission.perm_id).run();
  }
  const assigned = (await h.db.prepare('SELECT perm.perm_key FROM role_perm JOIN perm ON perm.perm_id=role_perm.perm_id WHERE role_perm.role_id=?')
    .bind(role.role_id).all()).results;
  assert.deepEqual(assigned.map(row => row.perm_key).sort(), [...keys].sort());
  return role.role_id;
}

async function grantUserQuery(h, owner) {
  assert.notEqual(owner.email, 'admin@example.test');
  const roleId = await roleWithPermissions(h, `user-list-reader-${owner.userId}`, ['user:query']);
  await h.db.prepare('UPDATE user SET type=? WHERE user_id=?').bind(roleId, owner.userId).run();
  owner.expected.type = roleId;
  owner.expected.sendAction = { hasPerm: false };
  return roleId;
}

async function credentialRows(h) {
  return (await h.db.prepare('SELECT user_id,password,salt FROM user ORDER BY user_id').all()).results;
}

function assertCredentialsEqual(actual, expected) {
  assert.ok(JSON.stringify(actual) === JSON.stringify(expected), 'persisted credential values remain unchanged');
}

test('user list admin response preserves the other twenty-seven fields, OAuth null/profile values, counts and sendAction', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const admin = await fixedUser(h);
  const ordinary = await fixedUser(h, 'list-null@example.test');
  const sendingRole = await roleWithPermissions(h, 'user-list-sender', ['email:send']);
  const profile = await fixedUser(h, 'list-profile@example.test', sendingRole);
  await h.db.prepare('INSERT INTO oauth(oauth_user_id,username,name,avatar,trust_level,platform,user_id) VALUES (?,?,?,?,?,?,?)')
    .bind('provider-id', 'fixture-user', 'Fixture Name', 'https://avatar.example.test/profile.png', 3, 'linuxdo', profile.userId).run();
  await h.db.prepare('INSERT INTO account(user_id,email,name,is_del) VALUES (?,?,?,0),(?,?,?,1)')
    .bind(profile.userId, 'list-active@example.test', 'active', profile.userId, 'list-deleted@example.test', 'deleted').run();
  for (const patch of [
    { type: 0 }, { type: 0 }, { type: 1 }, { type: 0, is_del: 1 }, { type: 1, is_del: 1 }, { type: 1, is_del: 1 }, { type: 0, status: 6 },
  ]) await seedMail(h, profile, patch);
  Object.assign(profile.expected, {
    username: 'fixture-user', trustLevel: 3, avatar: 'https://avatar.example.test/profile.png', name: 'Fixture Name', platform: 'linuxdo',
    receiveEmailCount: 2, sendEmailCount: 1, accountCount: 2, delReceiveEmailCount: 1, delSendEmailCount: 2, delAccountCount: 1,
    sendAction: { hasPerm: true, sendType: 'day', sendCount: 19 },
  });
  const page = success(await h.api('/user/list?num=1&size=50&timeSort=1', { token: admin.token }));
  assert.deepEqual(Object.keys(page).sort(), ['list', 'total']);
  assert.equal(page.total, 3);
  assert.deepEqual(page.list.map(row => row.userId), [admin.userId, ordinary.userId, profile.userId]);
  for (const [index, owner] of [admin, ordinary, profile].entries()) assertPublicRow(page.list[index], owner.expected);
  const empty = success(await h.api('/user/list?email=absent-user-list&num=1&size=50', { token: admin.token }));
  assert.deepEqual(empty, { list: [], total: 0 });
  assert.equal(h.outbound.calls.length, 0);
});

test('user list permits a non-admin role with only user:query, keeps cross-user results and rejects revoked permission', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await fixedUser(h, 'list-reader@example.test');
  const foreign = await fixedUser(h, 'list-other@example.test');
  failure(await h.api('/user/list', { token: reader.token }), 403, 'Unauthorized');
  const roleId = await grantUserQuery(h, reader);
  const page = success(await h.api('/user/list?num=1&size=50&timeSort=1', { token: reader.token }));
  assert.equal(page.total, 2);
  assert.deepEqual(page.list.map(row => row.userId), [reader.userId, foreign.userId]);
  assertPublicRow(page.list[0], reader.expected);
  assertPublicRow(page.list[1], foreign.expected);
  await h.db.prepare('DELETE FROM role_perm WHERE role_id=?').bind(roleId).run();
  failure(await h.api('/user/list', { token: reader.token }), 403, 'Unauthorized');
  assert.ok(await h.kv.get(`auth-uid:${reader.userId}`, 'json'));
});

test('user list preserves raw Authorization, HEAD, preflight, wrong-method and failed-session HTTP contracts', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await fixedUser(h, 'list-wire@example.test');
  await grantUserQuery(h, reader);
  const expiredMessage = 'Authentication has expired. Please sign in again';
  failure(await h.api('/user/list'), 401, expiredMessage);
  for (const token of [`Bearer ${reader.token}`, 'not-a-jwt', signToken({ userId: reader.userId, token: 'not-in-session' })]) {
    failure(await h.api('/user/list', { token }), 401, expiredMessage);
  }
  const head = await h.fetch('/api/user/list', { method: 'HEAD', headers: { Authorization: reader.token } });
  assert.equal(head.status, 200);
  assert.match(head.headers.get('content-type'), /application\/json/);
  assert.equal(head.headers.get('access-control-allow-origin'), '*');
  assert.equal(head.headers.get('set-cookie'), null);
  assert.equal(await head.text(), '');
  const preflight = await h.fetch('/api/user/list', { method: 'OPTIONS', headers: {
    Origin: 'https://client.example.test', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.match(preflight.headers.get('access-control-allow-methods'), /\bGET\b/);
  assert.equal(preflight.headers.get('access-control-allow-headers').toLowerCase(), 'authorization');
  assert.equal(preflight.headers.get('set-cookie'), null);
  assert.equal(await preflight.text(), '');
  const wrongMethod = await h.fetch('/api/user/list', { method: 'POST', headers: { Authorization: reader.token } });
  assert.equal(wrongMethod.status, 404);
  await h.kv.delete(`auth-uid:${reader.userId}`);
  failure(await h.api('/user/list', { token: reader.token }), 401, expiredMessage);
});

test('listing users leaves database credentials intact and real password logins preserve the existing session', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const admin = await fixedUser(h);
  const owner = await fixedUser(h, 'list-login@example.test');
  const before = await credentialRows(h);
  await h.kv.delete(`auth-uid:${owner.userId}`);
  const firstLogin = success(await h.api('/login', { method: 'POST', body: { email: owner.email, password: owner.password } }));
  assert.deepEqual(Object.keys(firstLogin), ['token']);
  const firstClaims = decodeToken(firstLogin.token);
  assert.deepEqual(Object.keys(firstClaims).sort(), ['iat', 'token', 'userId']);
  const firstSession = await h.kv.get(`auth-uid:${owner.userId}`, 'json');
  const credentials = before.find(row => row.user_id === owner.userId);
  assert.ok(firstSession.user.password === credentials.password && firstSession.user.salt === credentials.salt, 'fresh login retains its private credential data');
  const page = success(await h.api('/user/list?num=1&size=50', { token: admin.token }));
  assert.equal(page.total, 2);
  for (const row of page.list) assert.deepEqual(Object.keys(nonCredentialRow(row)).sort(), publicKeys);
  assertCredentialsEqual(await credentialRows(h), before);
  assert.deepEqual(await h.kv.get(`auth-uid:${owner.userId}`, 'json'), firstSession);
  const secondLogin = success(await h.api('/login', { method: 'POST', body: { email: owner.email, password: owner.password } }));
  const secondClaims = decodeToken(secondLogin.token);
  assert.notEqual(secondClaims.token, firstClaims.token);
  const secondSession = await h.kv.get(`auth-uid:${owner.userId}`, 'json');
  assert.deepEqual(secondSession.tokens, [...firstSession.tokens, secondClaims.token]);
  assert.deepEqual(secondSession.user, firstSession.user);
  assert.equal(secondSession.refreshTime, firstSession.refreshTime);
  for (const token of [firstLogin.token, secondLogin.token]) success(await h.api('/my/loginUserInfo', { token }));
  const wrong = await h.api('/login', { method: 'POST', body: { email: owner.email, password: 'incorrect-password' } });
  failure(wrong, 501);
  assert.deepEqual(await h.kv.get(`auth-uid:${owner.userId}`, 'json'), secondSession);
  assertCredentialsEqual(await credentialRows(h), before);
});

test('user list retains cross-day actor metadata and KV refresh without changing cached user, tokens or target credentials', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await fixedUser(h, 'list-refresh@example.test');
  const target = await fixedUser(h, 'list-refresh-target@example.test');
  await grantUserQuery(h, reader);
  const key = `auth-uid:${reader.userId}`;
  const before = await credentialRows(h);
  const staleSession = { ...await h.kv.get(key, 'json'), refreshTime: '2000-01-01T00:00:00.000Z' };
  await h.kv.put(key, JSON.stringify(staleSession));
  const started = Math.floor(Date.now() / 1000);
  const page = success(await h.api(`/user/list?email=${target.email}`, { token: reader.token, headers: {
    'cf-connecting-ip': '203.0.113.9',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  } }));
  assert.equal(page.total, 1);
  assertPublicRow(page.list[0], target.expected);
  const refreshed = await h.kv.get(key, 'json');
  assert.deepEqual(refreshed.user, staleSession.user);
  assert.deepEqual(refreshed.tokens, staleSession.tokens);
  assert.notEqual(refreshed.refreshTime, staleSession.refreshTime);
  assert.equal(new Date(refreshed.refreshTime).toISOString(), refreshed.refreshTime);
  const actor = await h.db.prepare('SELECT active_ip,active_time,create_ip,os,browser,device FROM user WHERE user_id=?').bind(reader.userId).first();
  assert.equal(actor.active_ip, '203.0.113.9');
  assert.equal(actor.create_ip, '198.51.100.1');
  assert.notEqual(actor.active_time, reader.expected.activeTime);
  assert.equal(actor.os, 'Windows10');
  assert.equal(actor.browser, 'Chrome 120.0.0.0');
  assert.equal(actor.device, 'Desktop');
  const storedKey = (await h.kv.list({ prefix: key })).keys.find(entry => entry.name === key);
  assert.ok(storedKey.expiration >= started + 2592000 && storedKey.expiration <= Math.floor(Date.now() / 1000) + 2592000);
  success(await h.api(`/user/list?email=${target.email}`, { token: reader.token, headers: { 'cf-connecting-ip': '203.0.113.10' } }));
  assert.equal((await h.db.prepare('SELECT active_ip FROM user WHERE user_id=?').bind(reader.userId).first()).active_ip, '203.0.113.9');
  assert.deepEqual(await h.kv.get(key, 'json'), refreshed);
  assertCredentialsEqual(await credentialRows(h), before);
});

test('user-list authentication and permission failures precede an OAuth-table query fault', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await fixedUser(h, 'list-fault-reader@example.test');
  const denied = await fixedUser(h, 'list-fault-denied@example.test');
  const roleId = await grantUserQuery(h, reader);
  await h.db.prepare('DROP TABLE oauth').run();
  failure(await h.api('/user/list'), 401, 'Authentication has expired. Please sign in again');
  failure(await h.api('/user/list', { token: denied.token }), 403, 'Unauthorized');
  const queried = await h.api('/user/list', { token: reader.token });
  failure(queried, 500);
  assert.match(queried.body.message, /no such table: oauth/);
  await h.db.prepare('DELETE FROM role_perm WHERE role_id=?').bind(roleId).run();
  failure(await h.api('/user/list', { token: reader.token }), 403, 'Unauthorized');
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 2);
  assert.equal(h.outbound.calls.length, 0);
});

test('user list security target excludes credential keys and database values for admin and delegated reader', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const admin = await fixedUser(h);
  const reader = await fixedUser(h, 'security-reader@example.test');
  await grantUserQuery(h, reader);
  const owners = [admin, reader];
  const credentials = await credentialRows(h);
  assert.ok(credentials.every(row => typeof row.password === 'string' && row.password.length > 0 && typeof row.salt === 'string' && row.salt.length > 0));
  const observations = [];
  for (const actor of owners) {
    const response = await h.api('/user/list?num=1&size=50&timeSort=1', { token: actor.token });
    const page = success(response);
    assert.equal(page.total, owners.length);
    assert.deepEqual(page.list.map(row => row.userId), owners.map(owner => owner.userId));
    const serialized = JSON.stringify(response.body);
    observations.push({
      actorId: actor.userId,
      rows: page.list.map(row => ({
        userId: row.userId, keys: Object.keys(row).sort(),
        hasPassword: Object.hasOwn(row, 'password'), hasSalt: Object.hasOwn(row, 'salt'),
      })),
      databaseValues: credentials.map(row => ({
        userId: row.user_id, containsPassword: serialized.includes(row.password), containsSalt: serialized.includes(row.salt),
      })),
    });
  }
  // Aggregate both actors before asserting, and report only key names and leak booleans.
  assert.deepEqual(observations, owners.map(actor => ({
    actorId: actor.userId,
    rows: owners.map(owner => ({ userId: owner.userId, keys: publicKeys, hasPassword: false, hasSalt: false })),
    databaseValues: credentials.map(row => ({ userId: row.user_id, containsPassword: false, containsSalt: false })),
  })));
  assert.equal(h.outbound.calls.length, 0);
});
