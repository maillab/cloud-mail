import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const { default: userService } = await loadModule('src/service/user-service.ts', {
  mocks: new Map([[new URL('../../src/integrations/mail-sender', import.meta.url), { default: {} }]]),
});

const publicKeys = [
  'userId', 'email', 'type', 'status', 'createTime', 'activeTime', 'createIp', 'activeIp', 'os', 'browser', 'device',
  'sort', 'sendCount', 'regKeyId', 'isDel', 'username', 'trustLevel', 'avatar', 'name', 'platform',
  'receiveEmailCount', 'sendEmailCount', 'accountCount', 'delReceiveEmailCount', 'delSendEmailCount', 'delAccountCount', 'sendAction',
].sort();

// This baseline compares only the non-credential contract. It never asserts
// that credential fields should exist; the security target is added separately.
function publicRow(row) {
  return Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'password' && key !== 'salt'));
}

async function userListFixture(t) {
  const h = await databaseFixture(t);
  const context = { ...h.context, env: { ...h.context.env, admin: 'admin@example.test' } };
  h.database.exec(`INSERT INTO role(role_id,name,key,send_type,send_count) VALUES
    (10,'Daily','daily','day',7),(11,'Nullable quota','nullable','custom-policy',NULL),
    (20,'Read only','reader','count',0),(30,'Admin backing role','admin-row','count',999);
    INSERT INTO perm(perm_id,name,perm_key,type) VALUES (1,'Send','email:send',2),(2,'Read','email:read',2);
    INSERT INTO role_perm(role_id,perm_id) VALUES (10,1),(11,1),(20,2)`);
  const insert = h.database.prepare(`INSERT INTO user
    (user_id,email,type,status,is_del,sort,send_count,reg_key_id,create_time,active_time,create_ip,active_ip,os,browser,device,password,salt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of [
    [1,'admin@example.test',30,0,0,0,0,0,'2024-01-01 00:00:00',null,null,null,null,null,null],
    [2,'Alice@Example.test',10,0,0,'legacy-sort','legacy-send-count',7,null,null,'192.0.2.2',null,'Fixture OS',null,'fixture-device'],
    [3,'no-oauth@example.test',20,1,0,5,6,0,'2024-01-03 00:00:00','2024-02-03 00:00:00',null,null,null,null,null],
    [4,'deleted@example.test',10,0,1,10,0,0,'2024-01-04 00:00:00',null,null,null,null,null,null],
    [5,'no-role@example.test',999,0,0,0,0,0,'2024-01-05 00:00:00',null,null,null,null,null,null],
    [6,'numeric-platform@example.test',11,0,0,9,8,0,'2024-01-06 00:00:00',null,null,null,null,null,null],
  ]) insert.run(...row, 'fixture-password-hash', 'fixture-salt');
  h.database.exec(`INSERT INTO oauth(oauth_id,user_id,oauth_user_id,username,name,avatar,trust_level,platform) VALUES
    (1,2,'alice-google','oauth-alice','OAuth Alice','https://avatar.test/alice',3,'google'),
    (2,6,'numeric-profile','Numeric',NULL,NULL,0,0);
    INSERT INTO account(account_id,user_id,email,is_del) VALUES
    (10,2,'Alice@Example.test',0),(11,2,'secondary@example.test',0),(12,2,'deleted-alias@example.test',1),
    (20,3,'no-oauth@example.test',0)`);
  const mail = h.database.prepare('INSERT INTO email(email_id,user_id,account_id,type,is_del,status) VALUES (?,?,?,?,?,?)');
  for (const row of [
    [1,2,10,0,0,0],[2,2,11,0,0,0],[3,2,10,0,1,0],[4,2,10,0,0,6],[5,2,10,0,0,7],
    [6,2,10,1,0,1],[7,2,11,1,0,2],[8,2,10,1,1,2],[9,2,10,1,1,6],[10,2,10,2,0,0],
    [11,3,20,0,0,0],[12,3,20,1,0,6],[13,4,40,0,0,0],
  ]) mail.run(...row);
  return { ...h, context };
}

const ids = list => list.map(row => row.userId);
const fromAndAfter = query => query.sql.slice(query.sql.indexOf(' from '));

function interceptReads(h, beforeRead) {
  return { ...h.context, env: { ...h.context.env, db: { prepare(sql) {
    const statement = params => ({
      bind(...values) { return statement(values); },
      async raw() {
        await beforeRead({ sql, params });
        return h.db.prepare(sql).bind(...params).raw();
      },
    });
    return statement([]);
  } } } };
}

test('user list keeps all 27 non-credential fields, legacy scalars, null metadata and OAuth values', async t => {
  const h = await userListFixture(t);
  const page = await userService.list(h.context, { email: 'ALICE' });
  assert.equal(page.total, 1);
  assert.equal(page.list.length, 1);
  const row = publicRow(page.list[0]);
  assert.deepEqual(Object.keys(row).sort(), publicKeys);
  assert.deepEqual(row, {
    userId: 2, email: 'Alice@Example.test', type: 10, status: 0,
    createTime: null, activeTime: null, createIp: '192.0.2.2', activeIp: null,
    os: 'Fixture OS', browser: null, device: 'fixture-device',
    sort: 'legacy-sort', sendCount: 'legacy-send-count', regKeyId: 7, isDel: 0,
    username: 'oauth-alice', trustLevel: 3, avatar: 'https://avatar.test/alice', name: 'OAuth Alice', platform: 'google',
    receiveEmailCount: 3, sendEmailCount: 2, accountCount: 2,
    delReceiveEmailCount: 1, delSendEmailCount: 1, delAccountCount: 1,
    sendAction: { hasPerm: true, sendType: 'day', sendCount: 7 },
  });
});

test('missing OAuth remains five present null fields while numeric platform and zero trust remain numeric', async t => {
  const h = await userListFixture(t);
  const page = await userService.list(h.context, {});
  assert.deepEqual(ids(page.list), [6, 5, 4, 3, 2, 1]);
  for (const item of page.list) assert.deepEqual(Object.keys(publicRow(item)).sort(), publicKeys);
  const absent = publicRow(page.list.find(row => row.userId === 3));
  for (const key of ['username', 'trustLevel', 'avatar', 'name', 'platform']) {
    assert.equal(Object.hasOwn(absent, key), true);
    assert.equal(absent[key], null);
  }
  assert.equal(absent.sort, 5); assert.equal(absent.sendCount, 6);
  const numeric = publicRow(page.list[0]);
  assert.equal(numeric.platform, 0); assert.equal(numeric.trustLevel, 0);
  assert.equal(numeric.avatar, null); assert.equal(numeric.name, null);
  assert.equal(numeric.sort, 9); assert.equal(numeric.sendCount, 8);
});

test('six counts preserve type/deletion groups, SAVING exclusion, NOONE inclusion and zero fallback', async t => {
  const h = await userListFixture(t);
  const page = await userService.list(h.context, {});
  const counts = row => [row.receiveEmailCount, row.sendEmailCount, row.accountCount,
    row.delReceiveEmailCount, row.delSendEmailCount, row.delAccountCount];
  assert.deepEqual(counts(page.list.find(row => row.userId === 2)), [3, 2, 2, 1, 1, 1]);
  assert.deepEqual(counts(page.list.find(row => row.userId === 3)), [1, 0, 1, 0, 0, 0]);
  assert.deepEqual(counts(page.list.find(row => row.userId === 4)), [1, 0, 0, 0, 0, 0]);
  assert.deepEqual(counts(page.list.find(row => row.userId === 5)), [0, 0, 0, 0, 0, 0]);
  const userIds = [6, 5, 4, 3, 2, 1];
  const emailQueries = h.queries.filter(query => query.sql.includes('from "email"'));
  const accountQueries = h.queries.filter(query => query.sql.includes('from "account"'));
  assert.deepEqual(emailQueries.map(query => query.params), [
    [...userIds, 0, 0, 6], [...userIds, 0, 1, 6], [...userIds, 1, 0, 6], [...userIds, 1, 1, 6],
  ]);
  assert.ok(emailQueries.every(query => query.sql.includes('group by "email"."user_id"')));
  assert.deepEqual(accountQueries.map(query => query.params), [[...userIds, 0], [...userIds, 1]]);
  assert.deepEqual(h.queries.find(query => query.sql.includes('from "perm"')).params, ['email:send', 11, 999, 10, 20, 30]);
});

test('sendAction retains missing permission, nullable role quota and administrator override branches', async t => {
  const h = await userListFixture(t);
  const page = await userService.list(h.context, {});
  assert.deepEqual(page.list.find(row => row.userId === 3).sendAction, { hasPerm: false });
  assert.deepEqual(page.list.find(row => row.userId === 5).sendAction, { hasPerm: false });
  assert.deepEqual(page.list.find(row => row.userId === 6).sendAction, {
    hasPerm: true, sendType: 'custom-policy', sendCount: null,
  });
  const admin = publicRow(page.list.find(row => row.userId === 1));
  assert.equal(admin.type, 0);
  assert.deepEqual(admin.sendAction, { hasPerm: true, sendType: 'count', sendCount: 0 });
  assert.equal(h.database.prepare('SELECT type FROM user WHERE user_id=1').get().type, 30);
  assert.equal(page.list.find(row => row.userId === 2).type, 10);
});

test('multiple OAuth rows still occupy joined pagination positions while total counts users only', async t => {
  const h = await userListFixture(t);
  h.database.exec("INSERT INTO oauth(user_id,oauth_user_id,username,platform) VALUES (2,'alice-github','other-profile','github')");
  const page = await userService.list(h.context, { email: 'ALICE', size: '2' });
  assert.deepEqual(ids(page.list), [2, 2]);
  assert.equal(page.total, 1);
  assert.deepEqual(page.list.map(row => row.platform).sort(), ['github', 'google']);
  assert.deepEqual(page.list.map(row => row.receiveEmailCount), [3, 3]);
  assert.deepEqual(h.queries.find(query => query.sql.includes('from "email"')).params, [2, 2, 0, 0, 6]);
  assert.deepEqual(h.queries.find(query => query.sql.includes('from "perm"')).params, ['email:send', 10]);
  assert.match(h.queries[0].sql, /left join "oauth"/);
  assert.equal(h.queries[1].sql.includes('join'), false);
  const first = await userService.list(h.context, { email: 'ALICE', num: '1', size: '1' });
  const second = await userService.list(h.context, { email: 'ALICE', num: '2', size: '1' });
  assert.deepEqual(ids(first.list), [2]); assert.deepEqual(ids(second.list), [2]);
  assert.equal(first.total, 1); assert.equal(second.total, 1);
  assert.deepEqual([first.list[0].platform, second.list[0].platform].sort(), ['github', 'google']);
});

test('status binding, prefix search, isDel mutation and contradictory deletion conditions stay unchanged', async t => {
  const h = await userListFixture(t);
  const params = { email: 'ALICE', status: '0000', isDel: '0', num: '2', size: '1', timeSort: '1' };
  const page = await userService.list(h.context, params);
  assert.deepEqual(page.list, []); assert.equal(page.total, 1);
  assert.equal(params.isDel, 0);
  assert.equal(fromAndAfter(h.queries[0]), ' from "user" left join "oauth" on "oauth"."user_id" = "user"."user_id" where ("user"."status" = ? and "user"."is_del" = ? and "user"."email" COLLATE NOCASE LIKE ?) order by "user"."user_id" asc limit ? offset ?');
  assert.deepEqual(h.queries[0].params, ['0000', 0, 'ALICE%', 1, 1]);
  assert.deepEqual(h.queries[1].params, ['0000', 0, 'ALICE%']);
  h.queries.length = 0;
  assert.deepEqual((await userService.list(h.context, { status: '0', isDel: '1' })).list, []);
  assert.deepEqual(h.queries[1].params, ['0', 0, 1]);
  assert.deepEqual(ids((await userService.list(h.context, { status: '-1', isDel: '1' })).list), [4]);
  h.queries.length = 0;
  assert.deepEqual((await userService.list(h.context, { status: '' })).list, []);
  assert.deepEqual(h.queries[1].params, ['', 0]);
  assert.deepEqual((await userService.list(h.context, { email: 'Example' })).list, []);
  assert.deepEqual(ids((await userService.list(h.context, { email: 'A_i%' })).list), [2]);
});

test('user pagination retains its defaults, fifty cap, ordering, zero and negative-size behavior', async t => {
  const h = await userListFixture(t);
  assert.deepEqual(ids((await userService.list(h.context, { num: '2', size: '2' })).list), [4, 3]);
  assert.deepEqual(ids((await userService.list(h.context, { num: '2', size: '2', timeSort: '1' })).list), [3, 4]);
  const insert = h.database.prepare("INSERT INTO user(user_id,email,type,password,salt) VALUES (?, ?,20,'fixture','fixture')");
  for (let id = 100; id < 155; id++) insert.run(id, `bulk-${id}@example.test`);
  for (const [size, length] of [[undefined, 50], ['bad', 50], ['999', 50], ['', 0], ['-1', 61]]) {
    h.queries.length = 0;
    const params = { num: 'bad', size };
    const page = await userService.list(h.context, params);
    assert.equal(page.list.length, length, String(size));
    assert.equal(page.total, 61);
    assert.equal(Number.isNaN(params.isDel), true);
    assert.equal(h.queries.length, 9);
    if (size === '-1') assert.equal(h.queries[0].sql.includes(' limit '), false);
  }
});

test('an empty user page still performs all seven count and role queries with the original empty-ID parameters', async t => {
  const h = await userListFixture(t);
  const page = await userService.list(h.context, { email: 'absent' });
  assert.deepEqual(page, { list: [], total: 0 });
  assert.equal(h.queries.length, 9);
  assert.deepEqual(h.queries.slice(2).map(query => query.params), [
    ['email:send'], [0, 0, 6], [0, 1, 6], [1, 0, 6], [1, 1, 6], [0], [1],
  ]);
  h.database.exec('DROP TABLE email');
  await assert.rejects(userService.list(h.context, { email: 'absent' }), /email/);
});

test('user reads wait for list then total before starting all seven statistics together', { timeout: 3000 }, async t => {
  const h = await userListFixture(t);
  const gates = [Promise.withResolvers(), Promise.withResolvers(), Promise.withResolvers()];
  const started = [Promise.withResolvers(), Promise.withResolvers(), Promise.withResolvers()];
  const observed = [];
  const context = interceptReads(h, async query => {
    observed.push(query);
    const position = observed.length;
    const phase = position === 1 ? 0 : position === 2 ? 1 : 2;
    if (position === 1 || position === 2 || position === 9) started[phase].resolve();
    await gates[phase].promise;
  });
  const pending = userService.list(context, {});
  try {
    await Promise.race([started[0].promise, pending]);
    assert.equal(observed.length, 1);
    gates[0].resolve();
    await Promise.race([started[1].promise, pending]);
    assert.equal(observed.length, 2);
    gates[1].resolve();
    await Promise.race([started[2].promise, pending]);
    assert.equal(observed.length, 9);
    // The eager role .all() starts before the six async DAO thenables execute.
    assert.equal(observed[2].sql.includes('from "perm"'), true);
    assert.equal(observed.slice(3, 7).every(query => query.sql.includes('from "email"')), true);
    assert.equal(observed.slice(7, 9).every(query => query.sql.includes('from "account"')), true);
    gates[2].resolve();
    await pending;
  } finally {
    gates.forEach(gate => gate.resolve());
    await pending.catch(() => {});
  }
});

for (const [label, matches, expectedReads] of [
  ['list', query => query.sql.includes('from "user"') && query.sql.includes('left join'), 1],
  ['total', query => query.sql.startsWith('select count(') && query.sql.includes('from "user"'), 2],
  ['email counts', query => query.sql.includes('from "email"'), 9],
  ['account counts', query => query.sql.includes('from "account"'), 9],
  ['role lookup', query => query.sql.includes('from "perm"'), 9],
]) {
  test(`user ${label} failure preserves error identity and the original stage boundary`, async t => {
    const h = await userListFixture(t);
    const failure = new Error(`characterization ${label} failure`);
    const observed = [];
    let injected = false;
    const context = interceptReads(h, async query => {
      observed.push(query);
      if (!injected && matches(query)) { injected = true; throw failure; }
    });
    await assert.rejects(userService.list(context, {}), error => error === failure);
    assert.equal(observed.length, expectedReads);
  });
}

test('user list security target returns exactly the public keys and excludes credential columns from SQL', async t => {
  const h = await userListFixture(t);
  const page = await userService.list(h.context, {});
  assert.equal(page.list.length, 6);
  const keyLists = page.list.map(row => Object.keys(row).sort());
  const selectedColumns = h.queries[0].sql.split(' from ')[0];
  // Report keys only: failed security assertions must not print row values.
  assert.deepEqual({
    allRowsHaveExactKeys: keyLists.every(keys => JSON.stringify(keys) === JSON.stringify(publicKeys)),
    unexpectedRowKeys: [...new Set(keyLists.flat().filter(key => !publicKeys.includes(key)))].sort(),
    missingRowKeys: [...new Set(keyLists.flatMap(keys => publicKeys.filter(key => !keys.includes(key))))].sort(),
    selectedCredentialColumns: ['password', 'salt'].filter(key => selectedColumns.includes(`"${key}"`)),
  }, {
    allRowsHaveExactKeys: true,
    unexpectedRowKeys: [],
    missingRowKeys: [],
    selectedCredentialColumns: [],
  });
});
