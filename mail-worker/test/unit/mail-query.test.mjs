import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const { listPersonalMail, latestPersonalMail } = await loadModule('src/service/mail-query-service.ts');
const starService = (await loadModule('src/service/star-service.ts')).default;
const { toListText, applyBriefListText } = await loadModule('src/lib/email-list-text.ts');
const { attachListAttachments } = await loadModule('src/lib/email-list-attachments.ts');

async function queryFixture(t) {
  const h = await databaseFixture(t);
  h.database.exec(`INSERT INTO account(account_id,user_id,email,all_receive,is_del) VALUES
    (1,7,'primary@example.test',0,0),(2,7,'secondary@example.test',1,0),
    (3,7,'deleted@example.test',0,1),(4,8,'foreign@example.test',0,0)`);
  const insert = h.database.prepare('INSERT INTO email(email_id,user_id,account_id,text,content,type,is_del,recipient) VALUES (?,?,?,?,?,?,?,?)');
  for (const row of [
    [1,7,1,'A'.repeat(350),'<p>First HTML</p>',0,0],
    [2,7,2,null,'<style>hidden</style><p>Second <b>HTML</b></p>',0,0],
    [3,8,4,'Foreign','<p>Foreign</p>',0,0],
    [4,7,1,'Sent','<p>Sent</p>',1,0],
    [5,7,1,'Deleted','<p>Deleted</p>',0,1],
    [7,7,1,'Latest','<p>Latest HTML</p>',0,0],
    [9,7,3,'Deleted account','<p>Deleted account</p>',0,0],
  ]) insert.run(...row, '[]');
  h.database.exec(`INSERT INTO star(user_id,email_id) VALUES (7,1),(8,7),(7,9),(7,5),(7,999);
    INSERT INTO attachments(user_id,account_id,email_id,key,type,content_id) VALUES
    (7,1,1,'attachments/ordinary.bin',0,NULL),
    (7,1,1,'attachments/cid-att.bin',0,'<duplicate-cid>'),
    (7,1,1,'attachments/embedded.png',1,'<inline>'),
    (7,2,2,'attachments/secondary.bin',0,NULL)`);
  return h;
}

const ids = rows => rows.map(row => row.emailId);
const attachmentReads = h => h.queries.filter(query => query.sql.includes('from "attachments"'));

test('personal list preserves full/brief fields, user-scoped stars, cursor-independent total and marker', async t => {
  const h = await queryFixture(t);
  const params = { accountId: '1', allReceive: '0' };
  const full = await listPersonalMail(h.context, params, 7);
  assert.deepEqual(ids(full.list), [7, 1]);
  assert.equal(full.total, 2);
  assert.deepEqual(full.latestEmail, { emailId: 7, accountId: 1, userId: 7 });
  assert.deepEqual(full.list.map(row => row.isStar), [0, 1]);
  assert.equal(full.list[0].starId, null);
  assert.equal(full.list[1].text.length, 350);
  assert.equal('listText' in full.list[1], false);
  assert.deepEqual(full.list[1].attList.map(row => row.key), ['attachments/ordinary.bin', 'attachments/cid-att.bin']);
  assert.deepEqual(full.list[0].attList, []);
  const brief = await listPersonalMail(h.context, { ...params, emailId: '7', size: '1', full: '0' }, 7);
  assert.deepEqual(ids(brief.list), [1]);
  assert.equal(brief.total, 2);
  assert.deepEqual(brief.latestEmail, full.latestEmail);
  assert.equal(brief.list[0].listText, 'A'.repeat(300));
  for (const key of ['text', 'content', 'attList', 'accountId', 'userId']) assert.equal(key in brief.list[0], false, key);
  const ascending = await listPersonalMail(h.context, { ...params, emailId: '1', timeSort: '1', full: '0' }, 7);
  assert.deepEqual(ids(ascending.list), [7]);
  assert.equal(ascending.total, 2);
  assert.deepEqual(ascending.latestEmail, full.latestEmail);
});

test('allReceive fallback and explicit overrides preserve account join and independent latest marker', async t => {
  const h = await queryFixture(t);
  const all = await listPersonalMail(h.context, { accountId: '2', full: '0' }, 7);
  assert.deepEqual(ids(all.list), [7, 2, 1]);
  assert.equal(all.total, 3);
  assert.deepEqual(all.latestEmail, { emailId: 9, accountId: 3, userId: 7 });
  assert.equal(all.list.find(row => row.emailId === 2).listText, 'Second HTML');
  const one = await listPersonalMail(h.context, { accountId: '2', allReceive: '0' }, 7);
  assert.deepEqual(ids(one.list), [2]);
  assert.deepEqual(one.latestEmail, { emailId: 2, accountId: 2, userId: 7 });
  const explicit = await listPersonalMail(h.context, { accountId: '0', allReceive: '1', full: '0' }, 7);
  assert.deepEqual(explicit, all);
});

test('personal Number coercion, missing account errors and empty sentinel retain legacy boundaries', async t => {
  const h = await queryFixture(t);
  for (const full of [undefined, 'not-a-number', 'true', '1']) {
    const page = await listPersonalMail(h.context, { accountId: '1', allReceive: '0', full }, 7);
    assert.equal('text' in page.list[0], true, String(full));
    assert.equal('listText' in page.list[0], false);
  }
  for (const full of ['', '0', '2', false]) {
    const page = await listPersonalMail(h.context, { accountId: '1', allReceive: '0', full }, 7);
    assert.equal('text' in page.list[0], false, String(full));
    assert.equal('listText' in page.list[0], true);
  }
  assert.deepEqual(ids((await listPersonalMail(h.context, { accountId: '1', allReceive: '0', type: '1' }, 7)).list), [4]);
  h.queries.length = 0;
  await assert.rejects(listPersonalMail(h.context, { accountId: 'invalid' }, 7), { name: 'BizError', code: 501 });
  assert.equal(h.queries.length, 0);
  await assert.rejects(listPersonalMail(h.context, { accountId: '999' }, 7), {
    name: 'TypeError', message: "Cannot read properties of undefined (reading 'allReceive')",
  });
  assert.equal(h.queries.length, 1);
  const page = await listPersonalMail(h.context, { accountId: '999', allReceive: '0' }, '0007');
  assert.deepEqual(page, { list: [], total: 0, latestEmail: { emailId: 0, accountId: 999, userId: '0007' } });
});

test('personal size limits and star unbounded legacy sizes are distinct', async t => {
  const h = await queryFixture(t);
  const mail = h.database.prepare("INSERT INTO email(email_id,user_id,account_id,text,type,recipient) VALUES (?,7,1,'Bulk',0,'[]')");
  const star = h.database.prepare('INSERT INTO star(user_id,email_id) VALUES (7,?)');
  for (let id = 100; id < 160; id++) { mail.run(id); star.run(id); }
  const params = { accountId: '1', allReceive: '0', full: '0' };
  assert.equal((await listPersonalMail(h.context, params, 7)).list.length, 10);
  assert.equal((await listPersonalMail(h.context, { ...params, size: '999' }, 7)).list.length, 50);
  assert.equal((await listPersonalMail(h.context, { ...params, size: 'bad' }, 7)).list.length, 10);
  assert.equal((await listPersonalMail(h.context, { ...params, size: '' }, 7)).list.length, 0);
  // Characterize the current missing LIMIT; changing invalid-size policy is a separate fix.
  assert.equal((await listPersonalMail(h.context, { ...params, size: '-1' }, 7)).list.length, 62);
  for (const size of [undefined, 'bad', '-1']) assert.equal((await starService.list(h.context, { size }, 7)).list.length, 62);
  assert.equal((await starService.list(h.context, { size: '51' }, 7)).list.length, 51);
  assert.deepEqual((await starService.list(h.context, { size: '' }, 7)).list, []);
});

test('latest retains original ID bindings, RECEIVE/account/user scope and full body plus summary without star fields', async t => {
  const h = await queryFixture(t);
  const rows = await latestPersonalMail(h.context, { accountId: '0001', emailId: '0000', allReceive: '0', type: '1', full: '0', timeSort: '1' }, '0007');
  assert.deepEqual(ids(rows), [7, 1]);
  assert.deepEqual(h.queries[0].params, ['0000', '0007', 0, 0, '0001', 0, 20]);
  assert.equal(rows[1].text.length, 350);
  assert.equal(rows[1].listText, 'A'.repeat(300));
  assert.deepEqual(rows[1].attList.map(row => row.key), ['attachments/ordinary.bin', 'attachments/cid-att.bin']);
  for (const key of ['starId', 'isStar']) assert.equal(key in rows[0], false);
  const fallback = await latestPersonalMail(h.context, { accountId: '2', emailId: '0' }, 7);
  assert.deepEqual(ids(fallback), [7, 2, 1]);
  const insert = h.database.prepare("INSERT INTO email(email_id,user_id,account_id,text,type,recipient) VALUES (?,7,1,'Fresh',0,'[]')");
  for (let id = 100; id < 130; id++) insert.run(id);
  const capped = await latestPersonalMail(h.context, { accountId: '1', emailId: '99', allReceive: '0' }, 7);
  assert.deepEqual(ids(capped), Array.from({ length: 20 }, (_, i) => 129 - i));
});

test('brief SQL truncation and blankness decisions stay before JavaScript text cleanup', async t => {
  const h = await queryFixture(t);
  const insert = h.database.prepare('INSERT INTO email(email_id,user_id,account_id,text,content,type,recipient) VALUES (?,7,1,?,?,0,?)');
  insert.run(20, ' '.repeat(300) + 'Visible', '<p>HTML fallback</p>', '[]');
  insert.run(21, '\u200B'.repeat(301), '<p>HTML fallback</p>', '[]');
  const brief = await listPersonalMail(h.context, { accountId: '1', allReceive: '0', emailId: '19', timeSort: '1', full: '0' }, 7);
  assert.deepEqual(ids(brief.list), [20, 21]);
  assert.deepEqual(brief.list.map(row => row.listText), ['', '']);
  const latest = await latestPersonalMail(h.context, { accountId: '1', allReceive: '0', emailId: '19' }, 7);
  assert.deepEqual(latest.map(row => row.listText), ['HTML fallback', 'Visible']);
  assert.equal(latest[1].text.length, 307);
});

test('star preserves brief/full shape, cursor, deleted-account rows and orphan/deleted-mail exclusion', async t => {
  const h = await queryFixture(t);
  const brief = await starService.list(h.context, { size: '50' }, 7);
  assert.deepEqual(Object.keys(brief), ['list']);
  assert.deepEqual(ids(brief.list), [9, 1]);
  assert.ok(brief.list.every(row => row.isStar === 1 && 'starId' in row));
  assert.ok(brief.list.every(row => !('text' in row) && !('content' in row) && !('attList' in row)));
  const full = await starService.list(h.context, { size: '50', full: '1' }, 7);
  assert.deepEqual(ids(full.list), [9, 1]);
  assert.equal('listText' in full.list[0], false);
  assert.deepEqual(full.list[0].attList, []);
  assert.deepEqual(full.list[1].attList.map(row => row.key), ['attachments/ordinary.bin', 'attachments/cid-att.bin']);
  const cursor = await starService.list(h.context, { size: '50', emailId: '9' }, 7);
  assert.deepEqual(ids(cursor.list), [1]);
});

test('empty personal reads skip attachment SQL while empty full star still reads and propagates its failure', async t => {
  const h = await queryFixture(t);
  h.database.exec('DROP TABLE attachments');
  const empty = await listPersonalMail(h.context, { accountId: '1', allReceive: '0', emailId: '1', full: '1' }, 7);
  assert.deepEqual(empty.list, []);
  assert.equal(empty.total, 2);
  assert.deepEqual(await latestPersonalMail(h.context, { accountId: '1', allReceive: '0', emailId: '999' }, 7), []);
  assert.equal(attachmentReads(h).length, 0);
  await assert.rejects(starService.list(h.context, { emailId: '1', size: '50', full: '1' }, 7), /attachments/);
  assert.equal(attachmentReads(h).length, 1);
  await assert.rejects(listPersonalMail(h.context, { accountId: '1', allReceive: '0' }, 7), /attachments/);
});

function interceptReads(h, beforeRead) {
  return { ...h.context, env: { ...h.context.env, db: { prepare(sql) {
    const statement = params => ({
      bind(...values) { return statement(values); },
      async raw() { await beforeRead({ sql, params }); return h.db.prepare(sql).bind(...params).raw(); },
    });
    return statement([]);
  } } } };
}

test('personal list starts all three main reads before waiting and attaches only after they succeed', { timeout: 3000 }, async t => {
  const h = await queryFixture(t);
  const gate = Promise.withResolvers();
  const started = Promise.withResolvers();
  const queries = [];
  let released = false;
  t.after(() => gate.resolve());
  const context = interceptReads(h, async query => {
    queries.push(query);
    if (query.sql.includes('from "attachments"')) { assert.equal(released, true); return; }
    if (queries.length === 3) started.resolve();
    await gate.promise;
  });
  const pending = listPersonalMail(context, { accountId: '1', allReceive: '0' }, 7);
  const finished = assert.doesNotReject(pending);
  await started.promise;
  assert.equal(queries.length, 3);
  released = true; gate.resolve();
  await finished;
  assert.equal(queries.length, 4);
});

test('a main query failure propagates the identical error and prevents attachment reads', async t => {
  const h = await queryFixture(t);
  const failure = new Error('characterization count failure');
  const queries = [];
  const context = interceptReads(h, query => {
    queries.push(query);
    if (query.sql.includes('count(')) throw failure;
  });
  await assert.rejects(listPersonalMail(context, { accountId: '1', allReceive: '0' }, 7), error => error === failure);
  assert.equal(queries.length, 3);
  assert.equal(queries.some(query => query.sql.includes('from "attachments"')), false);
});

test('brief transformation preserves row/array identity, body deletion and existing summary rules', () => {
  const rows = [
    { text: ' A\u200B  B\n C ', content: '<p>unused</p>' },
    { text: null, content: '<style>hidden</style><script>hidden</script><p>Hello <b>world</b></p>' },
    { text: null, content: null },
    { text: '😀'.repeat(200), content: null },
  ];
  const original = [...rows];
  assert.equal(toListText(rows[0]), 'A B C');
  assert.equal(applyBriefListText(rows), rows);
  assert.deepEqual(rows.map(row => row.listText), ['A B C', 'Hello world', '', '😀'.repeat(150)]);
  rows.forEach((row, index) => {
    assert.equal(row, original[index]);
    assert.equal('text' in row, false); assert.equal('content' in row, false);
  });
});

test('attachment association keeps order, strict IDs, duplicate rows and original attachment references', () => {
  const attachments = [{ emailId: 7, key: 'second' }, { emailId: 0, key: 'zero' }, { emailId: 7, key: 'first' }, { emailId: '7', key: 'string-id' }];
  const rows = [{ emailId: 7 }, { emailId: null }, { emailId: 7 }, { emailId: 0 }];
  const originals = [...rows];
  attachListAttachments(rows, attachments);
  assert.deepEqual(rows.map(row => row.attList.map(att => att.key)), [['second', 'first'], [], ['second', 'first'], ['zero']]);
  rows.forEach((row, index) => assert.equal(row, originals[index]));
  assert.equal(rows[0].attList[0], attachments[0]);
  assert.equal(rows[0].attList[1], attachments[2]);
  assert.notEqual(rows[0].attList, rows[2].attList);
  assert.equal(rows[0].attList[0], rows[2].attList[0]);
});
