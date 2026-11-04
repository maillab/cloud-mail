import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const { listAllMail, latestAllMail } = await loadModule('src/service/all-mail-query-service.ts');

async function allMailFixture(t) {
  const h = await databaseFixture(t);
  h.database.exec(`INSERT INTO user(user_id,email,password,salt,is_del) VALUES
    (7,'Alice@Example.test','hash','salt',0),(8,'bob@example.test','hash','salt',1)`);
  // There are deliberately no account rows: global reads do not join account.
  const insert = h.database.prepare(`INSERT INTO email
    (email_id,user_id,account_id,name,subject,to_email,send_email,text,content,type,status,is_del,recipient)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of [
    [1,7,101,'Alice sender','Welcome first','team@example.test','sender@outside.test','A'.repeat(350),'<p>First HTML</p>',0,0,0],
    [2,8,102,'Bob sender','Welcome second','other@outside.test','TEAM@example.test',null,'<style>hidden</style><p>Second HTML</p>',0,0,0],
    [3,7,101,'Alice sender','Sent note','team@example.test','alice@example.test','Sent','<p>Sent</p>',1,1,0],
    [4,7,101,'Alice sender','Deleted note','team@example.test','sender@outside.test','Deleted','<p>Deleted</p>',0,0,1],
    [5,999,0,'Unknown sender','Orphan note','unknown@example.test','unknown@outside.test','Orphan','<p>Orphan</p>',0,0,0],
    [6,0,0,'Noone sender','Noone note','absent@example.test','nobody@outside.test','Noone','<p>Noone</p>',0,7,0],
    [7,8,102,'Bob sender','Saving note','other@example.test','sender@outside.test','Saving','<p>Saving</p>',0,6,0],
    [8,7,101,'Alice sender','Non-mail type','team@example.test','sender@outside.test','Other','<p>Other</p>',2,0,0],
    [9,999,0,'Unknown sender','Deleted orphan marker','unknown@example.test','other@outside.test','Marker','<p>Marker</p>',0,0,1],
    [10,8,102,'Bob sender','Latest sent','other@example.test','bob@example.test','Last sent','<p>Sent</p>',1,1,0],
  ]) insert.run(...row, '[]');
  h.database.exec(`INSERT INTO attachments(user_id,account_id,email_id,key,type,content_id) VALUES
    (7,101,1,'attachments/ordinary.bin',0,NULL),
    (7,101,1,'attachments/cid-att.bin',0,'<cid-att>'),
    (7,101,1,'attachments/embedded.png',1,'<inline>'),
    (8,102,2,'attachments/secondary.bin',0,NULL)`);
  return h;
}

const ids = rows => rows.map(row => row.emailId);
const attachmentReads = queries => queries.filter(query => query.sql.includes('from "attachments"'));
const whereAndAfter = query => query.sql.slice(query.sql.indexOf(' where '));

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

test('global full and brief results keep deleted/orphan/saving rows, nullable user email and ATT-only attachments', async t => {
  const h = await allMailFixture(t);
  const full = await listAllMail(h.context, {});
  assert.deepEqual(ids(full.list), [9, 7, 6, 5, 4, 2, 1]);
  assert.equal(full.total, 7);
  assert.deepEqual(full.latestEmail, { emailId: 9, accountId: 0, userId: 999 });
  assert.equal(full.list[0].userEmail, null);
  assert.equal(full.list[1].userEmail, 'bob@example.test');
  assert.equal(full.list.at(-1).text.length, 350);
  assert.deepEqual(full.list.at(-1).attList.map(row => [row.key, row.contentId]), [
    ['attachments/ordinary.bin', null], ['attachments/cid-att.bin', '<cid-att>'],
  ]);
  assert.ok(full.list.every(row => Array.isArray(row.attList) && !('listText' in row)));
  assert.equal(h.database.prepare('SELECT COUNT(*) AS n FROM account').get().n, 0);
  const brief = await listAllMail(h.context, { full: '0' });
  assert.deepEqual(ids(brief.list), ids(full.list));
  assert.equal(brief.list.at(-1).listText, 'A'.repeat(300));
  assert.equal(brief.list.find(row => row.emailId === 2).listText, 'Second HTML');
  for (const row of brief.list) for (const key of ['text', 'content', 'attList', 'accountId', 'userId', 'isStar', 'starId']) {
    assert.equal(key in row, false, key);
  }
});

test('global count joins user only for truthy userEmail while list always keeps its LEFT JOIN', async t => {
  const h = await allMailFixture(t);
  for (const [userEmail, expectedIds, expectedParams] of [
    [undefined, [9, 7, 6, 5, 4, 2, 1], [0]],
    ['', [9, 7, 6, 5, 4, 2, 1], [0]],
    ['ALICE', [4, 1], [0, 'ALICE%']],
    ['BOB', [7, 2], [0, 'BOB%']],
  ]) {
    h.queries.length = 0;
    const page = await listAllMail(h.context, { userEmail, full: '0' });
    assert.deepEqual(ids(page.list), expectedIds);
    assert.equal(page.total, expectedIds.length);
    const [list, count, marker] = h.queries;
    assert.match(list.sql, /left join "user"/);
    assert.equal(count.sql.includes('left join "user"'), Boolean(userEmail));
    assert.equal(count.sql.includes('"user"."email" COLLATE NOCASE LIKE ?'), Boolean(userEmail));
    assert.deepEqual(count.params, expectedParams);
    assert.deepEqual(list.params, [300, ...expectedParams, 10]);
    assert.deepEqual(marker.params, [0, 1]);
    assert.equal(marker.sql.includes('join'), false);
    assert.equal(h.queries.length, 3);
  }
});

test('global cursors preserve Number coercion, independent totals and ascending/descending SQL', async t => {
  const h = await allMailFixture(t);
  for (const [params, expectedIds, comparator, order, cursor] of [
    [{ emailId: '0007' }, [6, 5, 4, 2, 1], '<', 'desc', 7],
    [{ emailId: '0004', timeSort: '1' }, [5, 6, 7, 9], '>', 'asc', 4],
  ]) {
    h.queries.length = 0;
    const page = await listAllMail(h.context, { ...params, full: '0', size: '2' });
    assert.deepEqual(ids(page.list), expectedIds.slice(0, 2));
    assert.equal(page.total, 7);
    assert.deepEqual(page.latestEmail, { emailId: 9, accountId: 0, userId: 999 });
    const [list, count, marker] = h.queries;
    assert.equal(whereAndAfter(list), ` where ("email"."type" = ? and "email"."email_id" ${comparator} ?) order by "email"."email_id" ${order} limit ?`);
    assert.deepEqual(list.params, [300, 0, cursor, 2]);
    assert.equal(whereAndAfter(count), ' where "email"."type" = ?');
    assert.deepEqual(count.params, [0]);
    assert.deepEqual(marker.params, [0, 1]);
  }
  for (const emailId of ['not-a-number', '', '0']) {
    h.queries.length = 0;
    assert.deepEqual(ids((await listAllMail(h.context, { emailId, full: '0' })).list), [9, 7, 6, 5, 4, 2, 1]);
    assert.deepEqual(h.queries[0].params, [300, 0, 10]);
  }
});

test('global combined searches retain parameter order, case-insensitive prefixes and account-address OR grouping', async t => {
  const h = await allMailFixture(t);
  const page = await listAllMail(h.context, {
    userEmail: 'ALICE', accountEmail: 'TEAM@', name: 'ALICE', subject: 'WELCOME',
    emailId: '0000', timeSort: '1', size: '2', full: '0',
  });
  assert.deepEqual(ids(page.list), [1]);
  assert.equal(page.total, 1);
  const [list, count, marker] = h.queries;
  const predicate = ' where ("email"."type" = ? and "user"."email" COLLATE NOCASE LIKE ? and ("email"."to_email" COLLATE NOCASE LIKE ? or "email"."send_email" COLLATE NOCASE LIKE ?) and "email"."name" COLLATE NOCASE LIKE ? and "email"."subject" COLLATE NOCASE LIKE ?)';
  assert.equal(whereAndAfter(list), predicate + ' order by "email"."email_id" asc limit ?');
  assert.equal(whereAndAfter(count), predicate);
  const expectedParams = [0, 'ALICE%', 'TEAM@%', 'TEAM@%', 'ALICE%', 'WELCOME%'];
  assert.deepEqual(list.params, [300, ...expectedParams, 2]);
  assert.deepEqual(count.params, expectedParams);
  assert.deepEqual(marker.params, [0, 1]);
  assert.deepEqual(ids((await listAllMail(h.context, { accountEmail: 'TEAM@', full: '0' })).list), [4, 2, 1]);
  assert.deepEqual(ids((await listAllMail(h.context, { subject: 'come', full: '0' })).list), []);
  h.queries.length = 0;
  assert.deepEqual(ids((await listAllMail(h.context, { subject: 'Wel_ome%', full: '0' })).list), [2, 1]);
  assert.deepEqual(h.queries[1].params, [0, 'Wel_ome%%']);
  const quoted = "Welcome' OR 1=1 --";
  h.queries.length = 0;
  assert.deepEqual((await listAllMail(h.context, { subject: quoted, full: '0' })).list, []);
  assert.deepEqual(h.queries[1].params, [0, quoted + '%']);
  assert.equal(h.queries[1].sql.includes(quoted), false);
});

test('global type defaults apply only to undefined and preserve independent delete/noone predicates', async t => {
  const h = await allMailFixture(t);
  for (const [type, expectedIds] of [
    [undefined, [9, 7, 6, 5, 4, 2, 1]], ['receive', [9, 7, 6, 5, 4, 2, 1]],
    ['send', [10, 3]], ['delete', [9, 4]], ['noone', [6]],
    ['', [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]], ['unknown', [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]],
    ['0', [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]],
  ]) {
    const page = await listAllMail(h.context, { type, full: '0' });
    assert.deepEqual(ids(page.list), expectedIds, String(type));
    assert.equal(page.total, expectedIds.length);
    assert.deepEqual(page.latestEmail, { emailId: 9, accountId: 0, userId: 999 });
  }
});

test('global size and full coercion retain the current defaults, cap, zero and negative-size behavior', async t => {
  const h = await allMailFixture(t);
  const insert = h.database.prepare("INSERT INTO email(email_id,user_id,account_id,text,content,type) VALUES (?,7,101,'Bulk','<p>Bulk</p>',0)");
  for (let id = 100; id < 160; id++) insert.run(id);
  for (const [size, expectedLength, expectedLimit] of [
    [undefined, 10, 10], ['bad', 10, 10], ['999', 50, 50], ['Infinity', 50, 50], ['', 0, 0], ['-1', 67, undefined],
  ]) {
    h.queries.length = 0;
    const page = await listAllMail(h.context, { size, full: '0' });
    assert.equal(page.list.length, expectedLength, String(size));
    assert.equal(page.total, 67);
    assert.equal(h.queries[0].sql.includes(' limit '), expectedLimit !== undefined);
    assert.deepEqual(h.queries[0].params, expectedLimit === undefined ? [300, 0] : [300, 0, expectedLimit]);
  }
  for (const full of [undefined, 'bad', 'true', '1', true]) {
    const row = (await listAllMail(h.context, { full, size: '1' })).list[0];
    assert.equal('text' in row, true, String(full));
    assert.equal('attList' in row, true);
    assert.equal('listText' in row, false);
  }
  for (const full of ['', '0', '2', false]) {
    const row = (await listAllMail(h.context, { full, size: '1' })).list[0];
    assert.equal('text' in row, false, String(full));
    assert.equal('attList' in row, false);
    assert.equal('listText' in row, true);
  }
});

test('global marker ignores search, cursor, type and deletion while no RECEIVE row produces the zero sentinel', async t => {
  const h = await allMailFixture(t);
  for (const params of [
    { type: 'send', emailId: '4' },
    { type: 'noone', userEmail: 'missing' },
    { subject: 'missing', emailId: '100', timeSort: '1' },
  ]) {
    h.queries.length = 0;
    const page = await listAllMail(h.context, { ...params, full: '0' });
    assert.deepEqual(page.latestEmail, { emailId: 9, accountId: 0, userId: 999 });
    assert.equal(whereAndAfter(h.queries[2]), ' where "email"."type" = ? order by "email"."email_id" desc limit ?');
    assert.deepEqual(h.queries[2].params, [0, 1]);
  }
  h.database.exec('DELETE FROM email WHERE type=0');
  const sent = await listAllMail(h.context, { type: 'send', full: '0' });
  assert.deepEqual(ids(sent.list), [10, 3]);
  assert.equal(sent.total, 2);
  assert.deepEqual(sent.latestEmail, { emailId: 0, accountId: 0, userId: 0 });
});

test('global latest retains raw ID bindings, RECEIVE-only descending scope, body/summary and twenty-row cap', async t => {
  const h = await allMailFixture(t);
  const rows = await latestAllMail(h.context, { emailId: '0000', type: 'send', full: '0', timeSort: '1', subject: 'missing' });
  assert.deepEqual(ids(rows), [9, 7, 6, 5, 4, 2, 1]);
  assert.deepEqual(h.queries[0].params, ['0000', 0, 20]);
  assert.equal(whereAndAfter(h.queries[0]), ' where ("email"."email_id" > ? and "email"."type" = ?) order by "email"."email_id" desc limit ?');
  assert.match(h.queries[0].sql, /left join "user"/);
  assert.equal(rows[0].userEmail, null);
  assert.equal(rows.at(-1).text.length, 350);
  assert.equal(rows.at(-1).listText, 'A'.repeat(300));
  assert.equal(rows.at(-1).content, '<p>First HTML</p>');
  assert.deepEqual(rows.at(-1).attList.map(row => row.key), ['attachments/ordinary.bin', 'attachments/cid-att.bin']);
  for (const row of rows) for (const key of ['isStar', 'starId']) assert.equal(key in row, false, key);
  const insert = h.database.prepare("INSERT INTO email(email_id,user_id,account_id,text,type) VALUES (?,7,101,'Fresh',0)");
  for (let id = 100; id < 130; id++) insert.run(id);
  h.queries.length = 0;
  const capped = await latestAllMail(h.context, { emailId: '0099' });
  assert.deepEqual(ids(capped), Array.from({ length: 20 }, (_, i) => 129 - i));
  assert.deepEqual(h.queries[0].params, ['0099', 0, 20]);
});

test('missing latest ID remains an undefined SQL binding rather than a new zero default', async t => {
  const h = await allMailFixture(t);
  const failure = new Error('observe missing ID before native SQLite binding');
  const observed = [];
  const context = interceptReads(h, query => { observed.push(query); throw failure; });
  await assert.rejects(latestAllMail(context, {}), error => error === failure);
  assert.equal(observed.length, 1);
  assert.deepEqual(observed[0].params, [undefined, 0, 20]);
  assert.equal(h.queries.length, 0);
});

test('empty global full reads and brief results skip attachments even when the table is absent', async t => {
  const h = await allMailFixture(t);
  h.database.exec('DROP TABLE attachments');
  const page = await listAllMail(h.context, { subject: 'missing', full: '1' });
  assert.deepEqual(page.list, []);
  assert.equal(page.total, 0);
  assert.deepEqual(page.latestEmail, { emailId: 9, accountId: 0, userId: 999 });
  assert.deepEqual(await latestAllMail(h.context, { emailId: '999' }), []);
  assert.equal((await listAllMail(h.context, { full: '0' })).list.length, 7);
  assert.equal(attachmentReads(h.queries).length, 0);
});

test('global list starts all three main reads before waiting and attaches only after all three finish', { timeout: 3000 }, async t => {
  const h = await allMailFixture(t);
  const gate = Promise.withResolvers();
  const started = Promise.withResolvers();
  const observed = [];
  let released = false;
  t.after(() => gate.resolve());
  const context = interceptReads(h, async query => {
    observed.push(query);
    if (query.sql.includes('from "attachments"')) { assert.equal(released, true); return; }
    if (observed.length === 3) started.resolve();
    await gate.promise;
  });
  const pending = listAllMail(context, {});
  const finished = assert.doesNotReject(pending);
  await Promise.race([started.promise, pending]);
  assert.equal(observed.length, 3);
  assert.equal(attachmentReads(observed).length, 0);
  released = true; gate.resolve();
  await finished;
  assert.equal(observed.length, 4);
  assert.equal(attachmentReads(observed).length, 1);
});

for (const [label, index] of [['list', 0], ['count', 1], ['marker', 2]]) {
  test(`asynchronous global ${label} failure preserves error identity and prevents attachment reads`, async t => {
    const h = await allMailFixture(t);
    const failure = new Error(`characterization ${label} failure`);
    const observed = [];
    const context = interceptReads(h, async query => {
      observed.push(query);
      if (observed.length - 1 === index) throw failure;
    });
    await assert.rejects(listAllMail(context, {}), error => error === failure);
    assert.equal(observed.length, 3);
    assert.equal(attachmentReads(observed).length, 0);
  });
}

for (const [label, read] of [
  ['list', context => listAllMail(context, {})],
  ['latest', context => latestAllMail(context, { emailId: '0' })],
]) {
  test(`nonempty global ${label} propagates the original attachment failure after its main reads`, async t => {
    const h = await allMailFixture(t);
    const failure = new Error(`characterization ${label} attachment failure`);
    const observed = [];
    const context = interceptReads(h, query => {
      observed.push(query);
      if (query.sql.includes('from "attachments"')) throw failure;
    });
    await assert.rejects(read(context), error => error === failure);
    assert.equal(observed.length, label === 'list' ? 4 : 2);
    assert.equal(attachmentReads(observed).length, 1);
    assert.equal(attachmentReads(h.queries).length, 0);
  });
}
