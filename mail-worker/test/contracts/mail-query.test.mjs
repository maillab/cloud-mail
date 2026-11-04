import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerHarness, seedMail, seedUser, signToken } from '../helpers/worker-harness.mjs';

const ids = rows => rows.map(row => row.emailId);

function success(response) {
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ['code', 'data', 'message']);
  assert.equal(response.body.code, 200, JSON.stringify(response.body));
  assert.equal(response.body.message, 'success');
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('set-cookie'), null);
  return response.body.data;
}

async function accountFor(h, owner, email, allReceive = 0, deleted = 0) {
  const row = await h.db.prepare('INSERT INTO account(user_id,email,name,all_receive,is_del) VALUES (?,?,?,?,?) RETURNING account_id')
    .bind(owner.userId, email, email.split('@')[0], allReceive, deleted).first();
  return { ...owner, email, accountId: row.account_id };
}

async function attachmentsFor(h, owner, emailId) {
  for (const [key, type, contentId] of [
    ['attachments/query-ordinary.bin', 0, null],
    ['attachments/query-cid-att.bin', 0, '<duplicate-cid>'],
    ['attachments/query-embedded.png', 1, '<inline>'],
  ]) await h.db.prepare('INSERT INTO attachments(user_id,account_id,email_id,key,type,content_id) VALUES (?,?,?,?,?,?)')
    .bind(owner.userId, owner.accountId, emailId, key, type, contentId).run();
}

async function grantAllMailRead(h, owner) {
  assert.notEqual(owner.email, 'admin@example.test');
  const role = await h.db.prepare('INSERT INTO role(name,key,avail_domain) VALUES (?,?,?) RETURNING role_id')
    .bind('All mail read contract', `all-mail-read-${owner.userId}`, 'example.test').first();
  const permission = await h.db.prepare('SELECT perm_id FROM perm WHERE perm_key=? AND type=2')
    .bind('all-email:query').first();
  assert.ok(permission);
  await h.db.prepare('INSERT INTO role_perm(role_id,perm_id) VALUES (?,?)').bind(role.role_id, permission.perm_id).run();
  await h.db.prepare('UPDATE user SET type=? WHERE user_id=?').bind(role.role_id, owner.userId).run();
  const assigned = (await h.db.prepare('SELECT perm.perm_key FROM role_perm JOIN perm ON perm.perm_id=role_perm.perm_id WHERE role_perm.role_id=?')
    .bind(role.role_id).all()).results;
  assert.deepEqual(assigned.map(row => row.perm_key), ['all-email:query']);
  return role.role_id;
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

test('personal list HTTP keeps the frontend brief/full sequence, star scope, cursors, totals and attachment projection', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const owner = await seedUser(h, 'query-owner@example.test');
  const foreign = await seedUser(h, 'query-foreign@example.test');
  const first = await seedMail(h, owner, { text: 'A'.repeat(350), subject: 'First query mail' });
  const second = await seedMail(h, owner, { subject: 'Second query mail' });
  await seedMail(h, foreign);
  await h.db.prepare('INSERT INTO star(user_id,email_id) VALUES (?,?),(?,?)')
    .bind(owner.userId, first.email_id, foreign.userId, second.email_id).run();
  await attachmentsFor(h, owner, first.email_id);
  const base = `/email/list?accountId=${owner.accountId}&allReceive=0&type=0`;
  const brief = success(await h.api(`${base}&full=0`, { token: owner.token }));
  assert.deepEqual(Object.keys(brief).sort(), ['latestEmail', 'list', 'total']);
  assert.deepEqual(ids(brief.list), [second.email_id, first.email_id]);
  assert.equal(brief.total, 2);
  assert.deepEqual(brief.latestEmail, { emailId: second.email_id, accountId: owner.accountId, userId: owner.userId });
  assert.deepEqual(brief.list.map(row => row.isStar), [0, 1]);
  assert.deepEqual(Object.keys(brief.list[0]).sort(), [
    'emailId', 'sendEmail', 'name', 'subject', 'code', 'recipient', 'toEmail', 'type', 'status',
    'message', 'unread', 'createTime', 'isDel', 'starId', 'isStar', 'listText',
  ].sort());
  assert.equal(brief.list[1].listText, 'A'.repeat(300));
  assert.equal(typeof brief.list[0].recipient, 'string');
  const full = success(await h.api(`${base}&full=1`, { token: owner.token }));
  assert.deepEqual(ids(full.list), ids(brief.list));
  assert.equal(full.list[1].text.length, 350);
  assert.equal(full.list[1].content, first.content);
  assert.equal('listText' in full.list[0], false);
  assert.deepEqual(full.list[0].attList, []);
  assert.deepEqual(full.list[1].attList.map(row => [row.key, row.type, row.contentId]), [
    ['attachments/query-ordinary.bin', 0, null], ['attachments/query-cid-att.bin', 0, '<duplicate-cid>'],
  ]);
  const cursor = success(await h.api(`${base}&emailId=${second.email_id}&full=0&size=1`, { token: owner.token }));
  assert.deepEqual(ids(cursor.list), [first.email_id]); assert.equal(cursor.total, 2);
  assert.deepEqual(cursor.latestEmail, brief.latestEmail);
  const ascending = success(await h.api(`${base}&emailId=${first.email_id}&timeSort=1&full=0`, { token: owner.token }));
  assert.deepEqual(ids(ascending.list), [second.email_id]);
  const detailPage = success(await h.api(`${base}&emailId=${second.email_id}&full=1&size=50`, { token: owner.token }));
  assert.equal(detailPage.list[0].emailId, first.email_id);
  assert.equal(detailPage.list[0].content, first.content);
  assert.equal(h.outbound.calls.length, 0);
});

test('account fallback, independent deleted-account marker, empty sentinel and original HTTP errors remain distinct', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const owner = await seedUser(h, 'query-owner@example.test');
  const secondary = await accountFor(h, owner, 'secondary@example.test', 1);
  const deleted = await accountFor(h, owner, 'deleted@example.test', 0, 1);
  const first = await seedMail(h, owner);
  const second = await seedMail(h, secondary, { text: null, content: '<style>hidden</style><p>HTML summary</p>' });
  const marker = await seedMail(h, deleted);
  const base = `/email/list?accountId=${secondary.accountId}&full=0`;
  const fallback = success(await h.api(base, { token: owner.token }));
  assert.deepEqual(ids(fallback.list), [second.email_id, first.email_id]);
  assert.equal(fallback.list[0].listText, 'HTML summary');
  assert.equal(fallback.total, 2); assert.equal(fallback.latestEmail.emailId, marker.email_id);
  const explicit = success(await h.api(`${base}&allReceive=0`, { token: owner.token }));
  assert.deepEqual(ids(explicit.list), [second.email_id]);
  const latest = success(await h.api(`/email/latest?accountId=${secondary.accountId}&emailId=0`, { token: owner.token }));
  assert.deepEqual(ids(latest), [second.email_id, first.email_id]);
  const empty = success(await h.api('/email/list?accountId=999999&allReceive=0', { token: owner.token }));
  assert.deepEqual(empty, { list: [], total: 0, latestEmail: { emailId: 0, accountId: 999999, userId: owner.userId } });
  const missing = await h.api('/email/list?accountId=999999', { token: owner.token });
  assert.equal(missing.status, 200);
  assert.deepEqual(missing.body, { code: 500, message: "Cannot read properties of undefined (reading 'allReceive')" });
  const invalid = await h.api('/email/list?accountId=invalid', { token: owner.token });
  assert.equal(invalid.status, 200);
  assert.deepEqual(invalid.body, { code: 501, message: 'accountId cannot be empty' });
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM email').first()).n, 3);
});

test('personal latest HTTP keeps RECEIVE scope, descending twenty-row cap, complete body and summary without stars', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const owner = await seedUser(h, 'query-owner@example.test');
  const foreign = await seedUser(h, 'query-foreign@example.test');
  const deleted = await accountFor(h, owner, 'deleted@example.test', 0, 1);
  const received = [];
  for (let i = 0; i < 25; i++) received.push(await seedMail(h, owner, { text: 'L'.repeat(350) }));
  await seedMail(h, owner, { type: 1 });
  await seedMail(h, owner, { is_del: 1 });
  await seedMail(h, foreign);
  await seedMail(h, deleted);
  await attachmentsFor(h, owner, received.at(-1).email_id);
  const rows = success(await h.api(`/email/latest?emailId=0&accountId=${owner.accountId}&allReceive=0&full=0&type=1&timeSort=1`, { token: owner.token }));
  assert.deepEqual(ids(rows), received.slice(-20).reverse().map(row => row.email_id));
  assert.equal(rows[0].text.length, 350); assert.equal(rows[0].listText, 'L'.repeat(300));
  assert.equal(rows[0].content, received.at(-1).content);
  assert.deepEqual(rows[0].attList.map(row => row.key), ['attachments/query-ordinary.bin', 'attachments/query-cid-att.bin']);
  assert.deepEqual(rows[1].attList, []);
  for (const row of rows) for (const field of ['starId', 'isStar']) assert.equal(field in row, false);
});

test('star HTTP preserves its brief default, full fields, cursor and deleted-account/orphan filtering differences', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const owner = await seedUser(h, 'query-owner@example.test');
  const foreign = await seedUser(h, 'query-foreign@example.test');
  const deletedAccount = await accountFor(h, owner, 'deleted@example.test', 0, 1);
  const first = await seedMail(h, owner);
  const removed = await seedMail(h, owner, { is_del: 1 });
  const last = await seedMail(h, deletedAccount);
  await h.db.prepare('INSERT INTO star(user_id,email_id) VALUES (?,?),(?,?),(?,?),(?,?),(?,?)')
    .bind(owner.userId, first.email_id, owner.userId, removed.email_id, owner.userId, last.email_id,
      owner.userId, 999999, foreign.userId, first.email_id).run();
  await attachmentsFor(h, owner, first.email_id);
  const brief = success(await h.api('/star/list?size=50', { token: owner.token }));
  assert.deepEqual(Object.keys(brief), ['list']);
  assert.deepEqual(ids(brief.list), [last.email_id, first.email_id]);
  assert.ok(brief.list.every(row => row.isStar === 1 && 'starId' in row && 'listText' in row));
  for (const row of brief.list) for (const field of ['text', 'content', 'attList']) assert.equal(field in row, false);
  const full = success(await h.api('/star/list?size=50&full=1', { token: owner.token }));
  assert.deepEqual(ids(full.list), ids(brief.list));
  assert.equal(full.list[0].content, last.content);
  assert.equal('listText' in full.list[0], false);
  assert.deepEqual(full.list[0].attList, []);
  assert.equal(full.list[1].attList.length, 2);
  const cursor = success(await h.api(`/star/list?size=50&emailId=${last.email_id}`, { token: owner.token }));
  assert.deepEqual(ids(cursor.list), [first.email_id]);
});

test('all-site SQL keeps its independent marker, type/search and deleted/noone scopes through shared assembly', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const admin = await seedUser(h);
  const owner = await seedUser(h, 'query-owner@example.test');
  const foreign = await seedUser(h, 'query-foreign@example.test');
  const received = await seedMail(h, owner);
  const sent = await seedMail(h, owner, { type: 1 });
  const other = await seedMail(h, foreign);
  const deleted = await seedMail(h, owner, { is_del: 1 });
  const noone = await seedMail(h, { userId: 0, accountId: 0, email: 'unassigned@example.test' }, { status: 7 });
  await attachmentsFor(h, owner, received.email_id);
  const denied = await h.api('/allEmail/list', { token: owner.token });
  assert.equal(denied.status, 200); assert.equal(denied.body.code, 403);
  const brief = success(await h.api('/allEmail/list?type=send&full=0', { token: admin.token }));
  assert.deepEqual(ids(brief.list), [sent.email_id]); assert.equal(brief.total, 1);
  assert.equal(brief.list[0].userEmail, owner.email);
  assert.equal(brief.latestEmail.emailId, noone.email_id);
  for (const field of ['text', 'content', 'attList', 'isStar', 'starId']) assert.equal(field in brief.list[0], false);
  const full = success(await h.api('/allEmail/list?type=receive&full=1', { token: admin.token }));
  assert.deepEqual(ids(full.list), [noone.email_id, deleted.email_id, other.email_id, received.email_id]);
  assert.equal(full.list[0].userEmail, null);
  assert.ok(full.list.every(row => !('listText' in row) && 'content' in row && Array.isArray(row.attList)));
  assert.equal(full.list.at(-1).attList.length, 2);
  const latest = success(await h.api('/allEmail/latest?emailId=0', { token: admin.token }));
  assert.deepEqual(ids(latest), ids(full.list));
  assert.ok(latest.every(row => 'listText' in row && 'content' in row && Array.isArray(row.attList)));
  assert.equal(latest.at(-1).attList.length, 2);
  const deletedPage = success(await h.api('/allEmail/list?type=delete&full=0', { token: admin.token }));
  assert.deepEqual(ids(deletedPage.list), [deleted.email_id]);
  const noonePage = success(await h.api('/allEmail/list?type=noone&full=0', { token: admin.token }));
  assert.deepEqual(ids(noonePage.list), [noone.email_id]);
  const searched = success(await h.api(`/allEmail/list?type=receive&full=0&userEmail=${owner.email}`, { token: admin.token }));
  assert.deepEqual(ids(searched.list), [deleted.email_id, received.email_id]);
  const empty = success(await h.api('/allEmail/list?subject=absent-query-subject&full=1', { token: admin.token }));
  assert.deepEqual(empty.list, []); assert.equal(empty.total, 0);
  assert.equal(empty.latestEmail.emailId, noone.email_id);
});

test('empty full queries keep their distinct attachment failure boundaries in actual Worker HTTP', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const owner = await seedUser(h);
  await h.db.prepare('DROP TABLE attachments').run();
  const personal = success(await h.api(`/email/list?accountId=${owner.accountId}&allReceive=0&full=1`, { token: owner.token }));
  assert.deepEqual(personal.list, []);
  assert.deepEqual(success(await h.api(`/email/latest?accountId=${owner.accountId}&emailId=0&allReceive=0`, { token: owner.token })), []);
  assert.deepEqual(success(await h.api('/allEmail/list?full=1', { token: owner.token })), {
    list: [], total: 0, latestEmail: { emailId: 0, accountId: 0, userId: 0 },
  });
  assert.deepEqual(success(await h.api('/allEmail/latest?emailId=0', { token: owner.token })), []);
  const star = await h.api('/star/list?size=50&full=1', { token: owner.token });
  assert.equal(star.status, 200); assert.equal(star.body.code, 500);
  assert.match(star.body.message, /attachments/);
  assert.deepEqual(Object.keys(star.body).sort(), ['code', 'message']);
});

test('query routes retain session requirements, wrong methods, CORS and no cookies', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const owner = await seedUser(h);
  for (const path of ['/email/list', '/email/latest', '/star/list', '/allEmail/list', '/allEmail/latest']) {
    const denied = await h.api(path);
    assert.equal(denied.status, 200);
    assert.deepEqual(denied.body, { code: 401, message: 'Authentication has expired. Please sign in again' });
    assert.equal(denied.headers.get('access-control-allow-origin'), '*');
    assert.equal(denied.headers.get('set-cookie'), null);
    const wrongMethod = await h.fetch(`/api${path}`, { method: 'POST', headers: { Authorization: owner.token } });
    assert.equal(wrongMethod.status, 404);
  }
  const preflight = await h.fetch('/api/email/latest', { method: 'OPTIONS', headers: {
    Origin: 'https://client.example.test', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
});

test('delegated all-mail read permission spans users and noone while personal queries stay scoped and revocation is immediate', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await seedUser(h, 'delegated-reader@example.test');
  const foreign = await seedUser(h, 'delegated-foreign@example.test');
  const own = await seedMail(h, reader);
  const other = await seedMail(h, foreign);
  const noone = await seedMail(h, { userId: 0, accountId: 0, email: 'unassigned@example.test' }, { status: 7 });
  const paths = ['/allEmail/list?full=0', '/allEmail/latest?emailId=0'];
  for (const path of paths) failure(await h.api(path, { token: reader.token }), 403, 'Unauthorized');
  const roleId = await grantAllMailRead(h, reader);
  const page = success(await h.api(paths[0], { token: reader.token }));
  const latest = success(await h.api(paths[1], { token: reader.token }));
  assert.deepEqual(ids(page.list), [noone.email_id, other.email_id, own.email_id]);
  assert.equal(page.total, 3);
  assert.deepEqual(page.list.map(row => row.userEmail), [null, foreign.email, reader.email]);
  assert.deepEqual(ids(latest), ids(page.list));
  const personal = success(await h.api(`/email/list?accountId=${reader.accountId}&allReceive=1&full=0`, { token: reader.token }));
  const personalLatest = success(await h.api(`/email/latest?accountId=${reader.accountId}&allReceive=1&emailId=0`, { token: reader.token }));
  assert.deepEqual(ids(personal.list), [own.email_id]);
  assert.deepEqual(ids(personalLatest), [own.email_id]);
  await h.db.prepare('DELETE FROM role_perm WHERE role_id=?').bind(roleId).run();
  for (const path of paths) failure(await h.api(path, { token: reader.token }), 403, 'Unauthorized');
  assert.deepEqual(ids(success(await h.api(`/email/list?accountId=${reader.accountId}&allReceive=1&full=0`, { token: reader.token })).list), [own.email_id]);
  assert.equal(h.outbound.calls.length, 0);
});

test('all-mail GET routes preserve HEAD, unauthenticated preflight and raw session Authorization contracts', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await seedUser(h, 'wire-reader@example.test');
  await grantAllMailRead(h, reader);
  await seedMail(h, reader);
  const paths = ['/allEmail/list?full=0', '/allEmail/latest?emailId=0'];
  const missingToken = signToken({ userId: reader.userId, token: 'not-in-the-session' });
  for (const path of paths) {
    const head = await h.fetch(`/api${path}`, { method: 'HEAD', headers: { Authorization: reader.token } });
    assert.equal(head.status, 200);
    assert.match(head.headers.get('content-type'), /application\/json/);
    assert.equal(head.headers.get('access-control-allow-origin'), '*');
    assert.equal(head.headers.get('set-cookie'), null);
    assert.equal(await head.text(), '');
    const preflight = await h.fetch(`/api${path}`, { method: 'OPTIONS', headers: {
      Origin: 'https://client.example.test', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization',
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
    assert.match(preflight.headers.get('access-control-allow-methods'), /\bGET\b/);
    assert.match(preflight.headers.get('access-control-allow-methods'), /\bHEAD\b/);
    assert.equal(preflight.headers.get('access-control-allow-headers').toLowerCase(), 'authorization');
    assert.equal(preflight.headers.get('set-cookie'), null);
    assert.equal(await preflight.text(), '');
    for (const token of [`Bearer ${reader.token}`, missingToken]) {
      failure(await h.api(path, { token }), 401, 'Authentication has expired. Please sign in again');
    }
    const wrongMethod = await h.fetch(`/api${path}`, { method: 'POST', headers: { Authorization: reader.token } });
    assert.equal(wrongMethod.status, 404);
  }
  await h.kv.delete(`auth-uid:${reader.userId}`);
  for (const path of paths) failure(await h.api(path, { token: reader.token }), 401, 'Authentication has expired. Please sign in again');
});

test('all-mail authentication and permission rejection precede broken mail SQL', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await seedUser(h, 'fault-reader@example.test');
  const denied = await seedUser(h, 'fault-denied@example.test');
  const roleId = await grantAllMailRead(h, reader);
  await h.db.prepare('DROP TABLE email').run();
  const paths = ['/allEmail/list?full=0', '/allEmail/latest?emailId=0'];
  for (const path of paths) {
    failure(await h.api(path), 401, 'Authentication has expired. Please sign in again');
    failure(await h.api(path, { token: denied.token }), 403, 'Unauthorized');
    const queried = await h.api(path, { token: reader.token });
    failure(queried, 500);
    assert.match(queried.body.message, /no such table: email/);
  }
  await h.db.prepare('DELETE FROM role_perm WHERE role_id=?').bind(roleId).run();
  for (const path of paths) failure(await h.api(path, { token: reader.token }), 403, 'Unauthorized');
  assert.equal((await h.db.prepare('SELECT COUNT(*) AS n FROM user').first()).n, 2);
  assert.equal(h.outbound.calls.length, 0);
});

test('all-mail brief/full and detail-page cursors preserve totals, order, padded IDs and projection differences', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await seedUser(h, 'page-reader@example.test');
  const foreign = await seedUser(h, 'page-foreign@example.test');
  await grantAllMailRead(h, reader);
  const first = await seedMail(h, reader, { text: 'First body', content: '<p>First full body</p>' });
  const second = await seedMail(h, foreign, { text: 'Second body', content: '<p>Second full body</p>' });
  const third = await seedMail(h, reader, { text: 'P'.repeat(350), content: '<p>Third full body</p>' });
  await attachmentsFor(h, foreign, second.email_id);
  const base = '/allEmail/list?type=receive&size=1';
  const brief = success(await h.api(`${base}&full=0`, { token: reader.token }));
  const full = success(await h.api(`${base}&full=1`, { token: reader.token }));
  assert.deepEqual(ids(brief.list), [third.email_id]);
  assert.deepEqual(ids(full.list), ids(brief.list));
  assert.equal(brief.list[0].listText, 'P'.repeat(300));
  assert.deepEqual(Object.keys(brief.list[0]).sort(), [
    'emailId', 'sendEmail', 'name', 'subject', 'code', 'recipient', 'toEmail', 'type', 'status',
    'message', 'unread', 'createTime', 'isDel', 'userEmail', 'listText',
  ].sort());
  assert.equal(full.list[0].text, third.text);
  assert.equal(full.list[0].content, third.content);
  assert.deepEqual(full.list[0].attList, []);
  assert.equal('listText' in full.list[0], false);
  const cursor = `000${third.email_id}`;
  const nextBrief = success(await h.api(`${base}&emailId=${cursor}&full=0`, { token: reader.token }));
  const nextFull = success(await h.api(`${base}&emailId=${cursor}&full=1`, { token: reader.token }));
  assert.deepEqual(ids(nextBrief.list), [second.email_id]);
  assert.deepEqual(ids(nextFull.list), ids(nextBrief.list));
  assert.equal(nextFull.list[0].userEmail, foreign.email);
  assert.equal(nextFull.list[0].content, second.content);
  assert.equal(nextFull.list[0].attList.length, 2);
  const detailPage = success(await h.api(`/allEmail/list?type=receive&size=50&full=1&emailId=${cursor}`, { token: reader.token }));
  assert.deepEqual(ids(detailPage.list), [second.email_id, first.email_id]);
  assert.equal(detailPage.list.find(row => row.emailId === first.email_id).content, first.content);
  const ascending = success(await h.api(`${base}&emailId=000${first.email_id}&timeSort=1&full=0`, { token: reader.token }));
  assert.deepEqual(ids(ascending.list), [second.email_id]);
  for (const page of [brief, full, nextBrief, nextFull, detailPage, ascending]) {
    assert.equal(page.total, 3);
    assert.deepEqual(page.latestEmail, { emailId: third.email_id, accountId: reader.accountId, userId: reader.userId });
  }
});

test('all-mail latest keeps its twenty-row RECEIVE window, unnormalized string cursor and full-body projection', async t => {
  const h = await createWorkerHarness(); t.after(() => h.close());
  const reader = await seedUser(h, 'latest-reader@example.test');
  const foreign = await seedUser(h, 'latest-foreign@example.test');
  await grantAllMailRead(h, reader);
  const received = [];
  for (let index = 0; index < 25; index++) {
    received.push(await seedMail(h, index % 2 ? foreign : reader, { text: 'W'.repeat(350), is_del: index === 22 ? 1 : 0 }));
  }
  const noone = await seedMail(h, { userId: 0, accountId: 0, email: 'unassigned@example.test' }, { status: 7 });
  const sent = await seedMail(h, foreign, { type: 1 });
  const rows = success(await h.api(`/allEmail/latest?emailId=000${received[0].email_id}&type=send&full=0&timeSort=1`, { token: reader.token }));
  assert.deepEqual(ids(rows), [noone.email_id, ...received.slice(-19).reverse().map(row => row.email_id)]);
  assert.equal(rows.length, 20);
  assert.equal(rows[0].userEmail, null);
  assert.equal(rows[1].text.length, 350);
  assert.equal(rows[1].listText, 'W'.repeat(300));
  for (const row of rows) {
    assert.ok('text' in row && 'content' in row && 'listText' in row);
    assert.deepEqual(row.attList, []);
    assert.equal('isStar' in row, false);
    assert.equal('starId' in row, false);
  }
  assert.deepEqual(ids(success(await h.api(`/allEmail/latest?emailId=000${received.at(-1).email_id}`, { token: reader.token }))), [noone.email_id]);
  assert.deepEqual(success(await h.api(`/allEmail/latest?emailId=${sent.email_id}`, { token: reader.token })), []);
  // The latest query binds this original string; list instead applies Number(value) || 0.
  assert.deepEqual(success(await h.api('/allEmail/latest?emailId=not-a-number', { token: reader.token })), []);
  const coercedList = success(await h.api('/allEmail/list?emailId=not-a-number&type=receive&size=50&full=0', { token: reader.token }));
  assert.equal(coercedList.list.length, 26);
});
