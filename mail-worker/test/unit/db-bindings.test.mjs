import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const storageCalls = [];
const operations = [];
const module = await loadModule(new URL('./db-bindings-module.mjs', import.meta.url), { mocks: new Map([
  [new URL('../../src/service/r2-service', import.meta.url), { default: {
    async putObj(_c, key, content, metadata) { operations.push('storage'); storageCalls.push({ key, content, metadata }); },
  } }],
  [new URL('../../src/service/settings-reader', import.meta.url), { default: { async query() { return { r2Domain: '' }; } } }],
]) });
const { tables, drizzle, eq, and, inArray, isNull, boundId, boundIds } = module;
const builder = drizzle({ prepare() { throw new Error('This assertion only compiles SQL'); } });

function recordingContext() {
  const queries = [];
  const statement = (query, params = []) => ({
    bind(...values) { return statement(query, values); },
    async raw() { queries.push({ sql: query, params }); return []; },
    async all() { queries.push({ sql: query, params }); return { success: true, results: [] }; },
    async run() { operations.push('database'); queries.push({ sql: query, params }); return { success: true, results: [], meta: { changes: 1 } }; },
  });
  return { context: { env: { db: { prepare: query => statement(query) } } }, queries };
}

test('scalar ID bridge preserves exact predicates and bound values, including missing query IDs', () => {
  for (const table of [tables.user, tables.email, tables.att, tables.star]) {
    const column = table.userId;
    for (const value of ['0007', '9007199254740993', '', 'not-a-number', 0, 7, null, undefined]) {
      const original = builder.select().from(table).where(eq(column, value)).toSQL();
      const migrated = builder.select().from(table).where(eq(column, boundId(value))).toSQL();
      assert.deepEqual(migrated, original, `${table.userId.name}: ${String(value)}`);
      assert.deepEqual(migrated.params, [value]);
    }
  }
});

test('ID list bridge keeps inArray SQL shape for empty, string and nullable lists', () => {
  for (const values of [[], [0], ['0007'], ['9007199254740993', '8'], [null], ['7', null, 0], ['7', '7']]) {
    for (const table of [tables.user, tables.att, tables.star]) {
      const original = builder.delete(table).where(inArray(table.userId, values)).toSQL();
      const migrated = builder.delete(table).where(inArray(table.userId, boundIds(values))).toSQL();
      assert.deepEqual(migrated, original, JSON.stringify(values));
    }
  }
});

test('moved attachment/email/star DAO methods execute the original SQL with string ID bindings', async () => {
  const { att, email, star } = tables;
  const { context, queries } = recordingContext();
  await module.attDao.list(context, { emailId: '0007' }, '9007199254740993');
  assert.deepEqual(queries.pop(), builder.select().from(att).where(and(eq(att.emailId, '0007'), eq(att.userId, '9007199254740993'), eq(att.type, 0), isNull(att.contentId))).toSQL());
  for (const ids of [[], ['0007', null]]) {
    await module.attDao.selectByEmailIds(context, ids);
    assert.deepEqual(queries.pop(), builder.select().from(att).where(and(inArray(att.emailId, ids), eq(att.type, 0))).toSQL());
    await module.starDao.removeByEmailIds(context, ids);
    assert.deepEqual(queries.pop(), builder.delete(star).where(inArray(star.emailId, ids)).toSQL());
    await module.starDao.removeByUserIds(context, ids);
    assert.deepEqual(queries.pop(), builder.delete(star).where(inArray(star.userId, ids)).toSQL());
  }
  for (const id of ['0007', undefined]) {
    await module.emailDao.selectById(context, id);
    assert.deepEqual(queries.pop(), builder.select().from(email).where(and(eq(email.emailId, id), eq(email.isDel, 0))).toSQL());
  }
});

test('explicit null auto-increment ID copies preserve SQL/params and allocate a distinct row', async t => {
  const { att, email } = tables;
  const fixture = await databaseFixture(t);
  const db = drizzle(fixture.db);
  const originalAttachment = { attId: null, userId: 3, accountId: 4, emailId: 5, key: 'attachments/shared.bin', related: null };
  assert.deepEqual(builder.insert(att).values({ ...originalAttachment, attId: boundId(null) }).toSQL(), builder.insert(att).values(originalAttachment).toSQL());
  await db.insert(att).values({ ...originalAttachment, attId: boundId(null) }).run();
  await db.insert(att).values({ ...originalAttachment, attId: boundId(null), emailId: 6 }).run();
  const rows = fixture.database.prepare('SELECT att_id,key,related,email_id FROM attachments ORDER BY att_id').all();
  assert.equal(rows.length, 2); assert.notEqual(rows[0].att_id, rows[1].att_id);
  assert.equal(rows[0].key, rows[1].key); assert.equal(rows[0].related, null);
  const emailCopy = { emailId: null, userId: 3, accountId: 4, recipient: '[]', text: null, content: null, cc: '[{"address":"copy@example.test"}]' };
  assert.deepEqual(builder.insert(email).values({ ...emailCopy, emailId: boundId(null) }).toSQL(), builder.insert(email).values(emailCopy).toSQL());
  await db.insert(email).values({ ...emailCopy, emailId: boundId(null) }).run();
  const saved = fixture.database.prepare('SELECT text,content,cc FROM email').get();
  assert.deepEqual({ ...saved }, { text: null, content: null, cc: emailCopy.cc });
});

test('receiving attachment boolean related values remain boolean SQL params and storage precedes the insert', async () => {
  const { att } = tables;
  for (const related of [true, false, undefined]) {
    const { context, queries } = recordingContext();
    const data = { userId: '0007', accountId: '0008', emailId: 9, key: 'attachments/raw.bin', content: new Uint8Array([1, 2]).buffer,
      filename: 'raw.bin', mimeType: 'application/octet-stream', related };
    storageCalls.length = 0;
    operations.length = 0;
    await module.attService.addAtt(context, [data]);
    assert.deepEqual(queries[0], builder.insert(att).values([data]).toSQL());
    assert.equal(storageCalls.length, 1); assert.equal(storageCalls[0].key, data.key);
    assert.deepEqual(operations, ['storage', 'database']);
    assert.equal(att.related.mapToDriverValue(related), related, 'The historical text mapper must not coerce boolean to 0/1 or string');
  }
});

test('missing attachment INSERT IDs and inline key retain legacy SQL null rather than undefined binding', async () => {
  {
    const { context, queries } = recordingContext();
    const incoming = { key: 'attachments/missing-ids.bin', filename: 'fixture.bin', mimeType: 'application/octet-stream', content: new ArrayBuffer(0) };
    await module.attService.addAtt(context, [incoming]);
    assert.deepEqual(queries[0], builder.insert(tables.att).values([incoming]).toSQL());
    assert.equal(queries[0].params.includes(undefined), false);
  }
  {
    const { context, queries } = recordingContext();
    const inline = { contentId: 'fixture-cid', content: new ArrayBuffer(0), related: true };
    await module.attService.saveArticleAtt(context, [inline], '0007', '0008', 9);
    assert.deepEqual(queries[0], builder.insert(tables.att).values([inline]).toSQL());
    assert.equal(queries[0].params.includes(undefined), false);
    assert.equal(queries[0].params.includes(true), true);
  }
  {
    const { context, queries } = recordingContext();
    const outbound = { filename: 'missing-id.bin', content: 'AQID' };
    await module.attService.saveSendAtt(context, [outbound], undefined, undefined, undefined);
    const oldRow = { userId: undefined, accountId: undefined, emailId: undefined, key: outbound.key, size: 3, filename: outbound.filename, mimeType: undefined, type: 0 };
    assert.deepEqual(queries[0], builder.insert(tables.att).values([oldRow]).toSQL());
    assert.equal(queries[0].params.includes(undefined), false);
  }
});

test('outbound and inline attachment inserts preserve string IDs, nullable metadata and mutation order', async () => {
  const { att } = tables;
  {
    const { context, queries } = recordingContext();
    const outbound = { filename: 'raw.bin', content: 'AQID', type: 'application/octet-stream' };
    operations.length = 0;
    await module.attService.saveSendAtt(context, [outbound], '0007', '0008', 9);
    const oldRow = { userId: '0007', accountId: '0008', emailId: 9, key: outbound.key, size: 3, filename: outbound.filename, mimeType: outbound.type, type: 0 };
    assert.deepEqual(queries[0], builder.insert(att).values([oldRow]).toSQL());
    assert.deepEqual([...outbound.buff], [1, 2, 3]);
    assert.deepEqual(operations, ['database', 'storage']);
  }
  {
    const { context, queries } = recordingContext();
    const inline = { key: 'attachments/shared.bin', contentId: 'fixture-cid', filename: null, mimeType: null, size: null, content: new Uint8Array([1]).buffer,
      buff: new Uint8Array([1]).buffer };
    operations.length = 0;
    await module.attService.saveArticleAtt(context, [inline], '0007', '0008', 9);
    assert.deepEqual(queries[0], builder.insert(att).values([inline]).toSQL());
    assert.equal('buff' in inline, false);
    assert.equal(inline.filename, null); assert.equal(inline.type, 1);
    assert.equal(inline.userId, '0007'); assert.equal(inline.accountId, '0008');
    assert.deepEqual(operations, ['storage', 'database']);
  }
});

test('real historical DDL and production mappers preserve scalar unions, CSV, JSON and null fields', async t => {
  const fixture = await databaseFixture(t);
  const db = drizzle(fixture.db);
  const { user, role, att, oauth, verifyRecord, setting } = tables;
  const person = await db.insert(user).values({ email: 'scalar@example.test', password: 'fixture', salt: 'fixture', sort: 'historical-sort', sendCount: '5', os: null }).returning().get();
  assert.equal(person.sort, 'historical-sort'); assert.equal(person.sendCount, 5); assert.equal(person.os, null);
  const identity = await db.insert(role).values({ name: 'CSV role', key: null, banEmail: '@blocked.test,exact@example.test', availDomain: 'example.test,sub.example.test' }).returning().get();
  assert.equal(identity.key, null); assert.equal(identity.banEmail, '@blocked.test,exact@example.test'); assert.equal(identity.availDomain, 'example.test,sub.example.test');
  for (const status of [0, 'historical-status']) {
    const attachment = await db.insert(att).values({ userId: 1, accountId: 2, emailId: 3, key: 'attachments/scalar.bin', status, related: null }).returning().get();
    assert.equal(attachment.status, status); assert.equal(attachment.related, null);
  }
  for (const platform of [0, 'google']) {
    const provider = await db.insert(oauth).values({ platform }).returning().get();
    assert.equal(provider.platform, platform);
  }
  const verification = await db.insert(verifyRecord).values({ ip: '127.0.0.1' }).returning().get();
  assert.equal(verification.ip, '127.0.0.1');
  const config = await db.insert(setting).values({ loginOpacity: 0.88, emailPrefixFilter: 'admin,root', resendTokens: '{"example.test":"fixture-token"}', r2Domain: null }).returning().get();
  assert.equal(config.loginOpacity, 0.88); assert.equal(config.emailPrefixFilter, 'admin,root');
  assert.equal(config.resendTokens, '{"example.test":"fixture-token"}'); assert.equal(config.r2Domain, null);
});
