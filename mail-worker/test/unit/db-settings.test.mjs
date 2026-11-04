import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const source = path => new URL(`../../src/${path}`, import.meta.url);
const { tables, drizzle } = await loadModule(new URL('./db-schema-module.mjs', import.meta.url));

async function settingsFixture(t, { cached, domain = ['example.test'], projectLink = false, verifyRecords = async () => [], realStorage = false, onStorage } = {}) {
  const fixture = await databaseFixture(t);
  await drizzle(fixture.db).insert(tables.setting).values({}).run();
  const stored = new Map();
  if (cached !== undefined) stored.set('setting:', JSON.stringify(cached));
  const requestCache = new Map();
  const operations = [];
  const context = {
    ...fixture.context,
    env: { ...fixture.context.env, domain, project_link: projectLink, kv: {
      async get(key) { operations.push(['get', key]); return stored.has(key) ? JSON.parse(stored.get(key)) : null; },
      async put(key, value) { operations.push(['put', key]); stored.set(key, value); },
    } },
    get(key) { operations.push(['context:get', key]); return requestCache.get(key); },
    set(key, value) { operations.push(['context:set', key]); requestCache.set(key, value); },
  };
  const storageModule = source('service/r2-service');
  const mocks = new Map([
    [source('i18n/i18n'), { t: key => key, tFor: () => key => key }],
    [storageModule, { default: { async storageType() { return 'KV'; } } }],
    [source('service/verify-record-service'), { default: { selectListByIP: verifyRecords } }],
    [source('security/user-context'), { default: { async getToken() { return undefined; } } }],
  ]);
  if (realStorage) {
    const storageMocks = new Map(mocks);
    storageMocks.delete(storageModule);
    const { default: storage } = await loadModule(storageModule, { mocks: storageMocks });
    mocks.set(storageModule, { default: {
      ...storage,
      async storageType(c) { onStorage?.(c); return storage.storageType(c); },
    } });
  }
  const { default: service } = await loadModule(source('service/setting-service'), { mocks });
  const { default: reader } = await loadModule(source('service/settings-reader'), { mocks });
  return { ...fixture, context, service, reader, stored, requestCache, operations };
}

test('query keeps KV keys, domain prefixes, CSV parsing, optional old fields and cached object identity', async t => {
  const h = await settingsFixture(t, { cached: { emailPrefixFilter: 'one,,two', resendTokens: { 'example.test': 'token' } }, domain: '["example.test"]', projectLink: 'false' });
  const result = await h.reader.query(h.context);
  assert.deepEqual(result, {
    emailPrefixFilter: ['one', 'two'], resendTokens: { 'example.test': 'token' },
    domainList: ['@example.test'], projectLink: false,
  });
  assert.equal(await h.reader.query(h.context), result);
  assert.deepEqual(h.operations, [
    ['context:get', 'setting'], ['get', 'setting:'], ['context:set', 'setting'],
    ['context:get', 'setting'], ['context:get', 'setting'],
  ]);
});

test('query preserves historical cache scalars without a whole-object rejection or normalization', async t => {
  for (const fields of [
    { receive: '0', loginDomain: '1', autoRefresh: false },
    { receive: '0', loginDomain: '1', autoRefresh: null },
    { receive: 0, loginDomain: 0, autoRefresh: 0 },
    {},
  ]) {
    await t.test(JSON.stringify(fields), async child => {
      const h = await settingsFixture(child, { cached: { emailPrefixFilter: 'one,,two', resendTokens: {}, ...fields } });
      const result = await h.reader.query(h.context);
      for (const key of ['receive', 'loginDomain', 'autoRefresh']) {
        assert.equal(result[key], fields[key], `Historical ${key} value must remain unchanged`);
        assert.equal(Object.hasOwn(result, key), Object.hasOwn(fields, key));
      }
      assert.deepEqual(result.emailPrefixFilter, ['one', 'two']);
      assert.deepEqual(result.domainList, ['@example.test']);
      assert.equal(h.requestCache.get('setting'), result);
      assert.equal(await h.reader.query(h.context), result);
      assert.equal(h.operations.filter(([operation]) => operation === 'get').length, 1);
    });
  }
});

test('refresh exposes raw request cache before query, with unchanged string filter and no derived domain list', async t => {
  const h = await settingsFixture(t);
  await h.service.refresh(h.context);
  const raw = h.requestCache.get('setting');
  assert.equal(raw.emailPrefixFilter, '');
  assert.equal(raw.domainList, undefined);
  assert.deepEqual(raw.resendTokens, {});
  assert.equal(await h.reader.query(h.context), raw);
  assert.equal(h.operations.filter(([operation]) => operation === 'get').length, 0);
  assert.deepEqual(JSON.parse(h.stored.get('setting:')), raw);
});

test('get masks the same request object and retains existing response flags', async t => {
  const h = await settingsFixture(t);
  h.database.exec("UPDATE setting SET site_key='site-secret',secret_key='turnstile-secret',resend_tokens='{}',s3_access_key='access-secret',s3_secret_key='secret-value',tg_bot_token='telegram-secret'");
  await h.service.refresh(h.context);
  const raw = h.requestCache.get('setting');
  const response = await h.service.get(h.context);
  assert.equal(response, raw);
  assert.equal(response.siteKey, 'site-s******');
  assert.equal(response.secretKey, 'turnst******');
  assert.equal(response.storageType, 'KV');
  assert.equal(response.hasR2, false);
  assert.equal(response.hasCfEmail, false);
  assert.equal(response.regVerifyOpen, false);
  assert.equal(response.addVerifyOpen, false);
  assert.equal(response.domainList, undefined);
});

test('invalid domain and missing prefix preserve legacy error categories and relevant messages', async t => {
  const invalid = await settingsFixture(t, { cached: { emailPrefixFilter: '' }, domain: 'invalid-json' });
  await assert.rejects(invalid.reader.query(invalid.context), { message: 'notJsonDomain' });
  const missing = await settingsFixture(t, { cached: {} });
  await assert.rejects(missing.reader.query(missing.context), { name: 'TypeError', message: "Cannot read properties of undefined (reading 'split')" });
});

test('settings patch retains token merging, falsy deletion and CSV/URL serializer mutation', async t => {
  const h = await settingsFixture(t, { cached: { emailPrefixFilter: '', resendTokens: { old: 'old-token', keep: 'keep-token' } } });
  const patch = { resendTokens: { old: '', added: 'new-token' }, emailPrefixFilter: ['one', 'two'], aiCodeFilter: ['sender'], webhookUrl: 'webhook.test/' };
  await h.service.set(h.context, patch);
  assert.equal(patch.emailPrefixFilter, 'one,two');
  assert.equal(patch.aiCodeFilter, 'sender');
  assert.equal(patch.webhookUrl, 'https://webhook.test/');
  assert.deepEqual(JSON.parse(patch.resendTokens), { keep: 'keep-token', added: 'new-token' });
  const row = h.database.prepare('SELECT email_prefix_filter,ai_code_filter,resend_tokens FROM setting').get();
  assert.equal(row.email_prefix_filter, 'one,two');
  assert.equal(row.ai_code_filter, 'sender');
  assert.deepEqual(JSON.parse(row.resend_tokens), { keep: 'keep-token', added: 'new-token' });
});

test('historical token JSON keeps number values and array slice masking behavior', async t => {
  const number = await settingsFixture(t);
  number.database.exec("UPDATE setting SET resend_tokens='7'");
  await number.service.refresh(number.context);
  assert.equal((await number.service.get(number.context)).resendTokens, 7);
  const array = await settingsFixture(t);
  array.database.exec("UPDATE setting SET resend_tokens='[[\"one\",\"two\"]]'");
  await array.service.refresh(array.context);
  assert.deepEqual((await array.service.get(array.context)).resendTokens, ['one,two******']);
});

test('env-only reads repeat the original KV request and derive independent objects without a request cache', async t => {
  const cached = { emailPrefixFilter: 'one,,two', resendTokens: { keep: 'provider-token' }, receive: '0' };
  const h = await settingsFixture(t, { cached, domain: '["example.test"]', projectLink: 'false' });
  const context = { env: h.context.env };
  const reads = [];
  const originalGet = context.env.kv.get;
  context.env.kv.get = async (key, options) => {
    reads.push([key, options]);
    return originalGet(key, options);
  };
  const first = await h.reader.query(context);
  const second = await h.reader.query(context);
  const expected = { ...cached, emailPrefixFilter: ['one', 'two'], domainList: ['@example.test'], projectLink: false };
  assert.deepEqual(first, expected);
  assert.deepEqual(second, expected);
  assert.notEqual(first, second);
  assert.notEqual(first.resendTokens, second.resendTokens);
  assert.deepEqual(reads, [['setting:', { type: 'json' }], ['setting:', { type: 'json' }]]);
  assert.deepEqual(h.operations, [['get', 'setting:'], ['get', 'setting:']]);
  assert.equal(h.requestCache.size, 0);
  assert.deepEqual(JSON.parse(h.stored.get('setting:')), cached);
});

test('a raw context cache bypasses KV, invalid domain and field processing while retaining identity and missing fields', async t => {
  const h = await settingsFixture(t, { domain: 'invalid-json' });
  const raw = { receive: '0', emailPrefixFilter: null, resendTokens: 7 };
  h.requestCache.set('setting', raw);
  assert.equal(await h.reader.query(h.context), raw);
  assert.deepEqual(raw, { receive: '0', emailPrefixFilter: null, resendTokens: 7 });
  assert.equal(Object.hasOwn(raw, 'domainList'), false);
  assert.equal(Object.hasOwn(raw, 'projectLink'), false);
  assert.deepEqual(h.operations, [['context:get', 'setting'], ['context:get', 'setting']]);
  assert.equal(h.queries.length, 1); // Only fixture setup inserted a setting row.
});

test('cold reads retain initialization-before-domain errors and original field failure boundaries', async t => {
  for (const cached of [undefined, null, false, 0, '']) {
    await t.test(`uninitialized ${String(cached)}`, async child => {
      const h = await settingsFixture(child, { cached, domain: 'invalid-json' });
      await assert.rejects(h.reader.query(h.context), {
        name: 'BizError', message: '数据库未初始化 Database not initialized.', code: 501,
      });
      assert.equal(h.requestCache.size, 0);
      assert.deepEqual(h.operations, [['context:get', 'setting'], ['get', 'setting:']]);
    });
  }
  const invalidField = await settingsFixture(t, { cached: { emailPrefixFilter: [] } });
  await assert.rejects(invalidField.reader.query(invalidField.context), {
    name: 'TypeError', message: 'setting.emailPrefixFilter.split is not a function',
  });
  assert.equal(invalidField.requestCache.size, 0);
  const primitive = await settingsFixture(t, { cached: 7 });
  await assert.rejects(primitive.reader.query(primitive.context), {
    name: 'TypeError', message: "Cannot create property 'domainList' on number '7'",
  });
  const domainFirst = await settingsFixture(t, { cached: 7, domain: 'invalid-json' });
  await assert.rejects(domainFirst.reader.query(domainFirst.context), { name: 'BizError', message: 'notJsonDomain', code: 501 });
});

test('get waits for the real reader before verification and real storageType reuses the same masked context object', async t => {
  const events = [];
  const cached = {
    emailPrefixFilter: 'one,,two', resendTokens: { keep: 'provider-token' },
    siteKey: 'site-secret', secretKey: 'verify-secret',
    bucket: 'test-bucket', endpoint: 'https://s3.test', s3AccessKey: 'access-secret', s3SecretKey: 'secret-value',
  };
  const h = await settingsFixture(t, {
    cached,
    realStorage: true,
    async verifyRecords(c) {
      assert.equal(c, h.context);
      assert.equal(h.requestCache.get('setting').secretKey, 'verify-secret');
      events.push('verify');
      return [];
    },
    onStorage(c) {
      assert.equal(c, h.context);
      assert.equal(h.requestCache.get('setting').secretKey, 'verify******');
      events.push('storage');
    },
  });
  const gate = Promise.withResolvers();
  const originalGet = h.context.env.kv.get;
  h.context.env.kv.get = async (key, options) => {
    assert.equal(key, 'setting:');
    assert.deepEqual(options, { type: 'json' });
    events.push('kv:start');
    await gate.promise;
    return originalGet(key, options);
  };
  const pending = h.service.get(h.context);
  assert.deepEqual(events, ['kv:start']);
  assert.equal(h.requestCache.size, 0);
  await Promise.resolve();
  assert.deepEqual(events, ['kv:start']);
  gate.resolve();
  const result = await pending;
  assert.deepEqual(events, ['kv:start', 'verify', 'storage']);
  assert.equal(result, h.requestCache.get('setting'));
  assert.equal(result.storageType, 'S3');
  assert.equal(result.siteKey, 'site-s******');
  assert.equal(result.resendTokens.keep, 'provider-tok******');
  assert.deepEqual(h.operations, [
    ['context:get', 'setting'], ['get', 'setting:'], ['context:set', 'setting'],
    ['context:get', 'setting'], ['context:get', 'setting'],
  ]);
  assert.equal(h.queries.length, 1);
  assert.deepEqual(JSON.parse(h.stored.get('setting:')), cached);
});

test('a rejected deferred KV read propagates the identical error and prevents verification and storage lookup', async t => {
  const calls = [];
  const h = await settingsFixture(t, {
    realStorage: true,
    async verifyRecords() { calls.push('verify'); return []; },
    onStorage() { calls.push('storage'); },
  });
  const gate = Promise.withResolvers();
  const failure = new Error('setting KV unavailable');
  h.context.env.kv.get = async (key, options) => {
    calls.push(['get', key, options]);
    return gate.promise;
  };
  const pending = h.service.get(h.context);
  const rejected = assert.rejects(pending, error => error === failure);
  assert.deepEqual(calls, [['get', 'setting:', { type: 'json' }]]);
  await Promise.resolve();
  assert.deepEqual(calls, [['get', 'setting:', { type: 'json' }]]);
  gate.reject(failure);
  await rejected;
  assert.deepEqual(calls, [['get', 'setting:', { type: 'json' }]]);
  assert.equal(h.requestCache.size, 0);
  assert.deepEqual(h.operations, [['context:get', 'setting']]);
  assert.equal(h.queries.length, 1);
});

test('refresh publishes the raw context row before a deferred or failed KV put without rolling it back', async t => {
  const h = await settingsFixture(t, { cached: { title: 'old KV value', emailPrefixFilter: '', resendTokens: {} } });
  h.database.exec("UPDATE setting SET title='database title',email_prefix_filter='one,two',resend_tokens='7'");
  const gate = Promise.withResolvers();
  const publication = Promise.withResolvers();
  const failure = new Error('setting KV publish unavailable');
  let published;
  h.context.env.kv.put = async (key, value) => {
    assert.equal(key, 'setting:');
    published = value;
    assert.deepEqual(h.requestCache.get('setting'), JSON.parse(value));
    publication.resolve();
    return gate.promise;
  };
  const pending = h.service.refresh(h.context);
  const rejected = assert.rejects(pending, error => error === failure);
  // Wait for the real SQLite SELECT and publication hook, without resolving KV.
  await Promise.race([publication.promise, pending]);
  assert.equal(typeof published, 'string');
  const raw = h.requestCache.get('setting');
  assert.equal(raw.title, 'database title');
  assert.equal(raw.emailPrefixFilter, 'one,two');
  assert.equal(raw.resendTokens, 7);
  assert.equal(Object.hasOwn(raw, 'domainList'), false);
  assert.equal(await h.reader.query(h.context), raw);
  gate.reject(failure);
  await rejected;
  assert.equal(h.requestCache.get('setting'), raw);
  assert.equal(JSON.parse(h.stored.get('setting:')).title, 'old KV value');
  assert.deepEqual(h.operations, [['context:set', 'setting'], ['context:get', 'setting'], ['context:get', 'setting']]);
});

test('empty background performs only the settings read without SQL writes, refresh or object operations', async t => {
  const h = await settingsFixture(t, { cached: { background: '', emailPrefixFilter: '', resendTokens: {} }, realStorage: true,
    onStorage() { assert.fail('Empty background must not select an object store'); } });
  h.queries.length = 0;
  await h.service.deleteBackground(h.context);
  assert.deepEqual(h.queries, []);
  assert.deepEqual(h.operations, [['context:get', 'setting'], ['get', 'setting:'], ['context:set', 'setting']]);
  assert.equal(h.database.prepare('SELECT background FROM setting').get().background, null);
  assert.equal(JSON.parse(h.stored.get('setting:')).background, '');
});

test('URL background replacement updates and refreshes the cleared row before writing and publishing the replacement', async t => {
  const oldBackground = 'https://old.test/background.png';
  const newBackground = 'https://new.test/background.png';
  const h = await settingsFixture(t, { cached: { background: oldBackground, emailPrefixFilter: '', resendTokens: {} }, realStorage: true,
    onStorage() { assert.fail('URL backgrounds must not select an object store'); } });
  h.database.prepare('UPDATE setting SET background=?').run(oldBackground);
  h.queries.length = 0;
  const publications = [];
  const originalPut = h.context.env.kv.put;
  h.context.env.kv.put = async (key, value) => {
    const raw = h.requestCache.get('setting');
    assert.deepEqual(raw, JSON.parse(value));
    assert.equal(raw.emailPrefixFilter, '');
    assert.equal(Object.hasOwn(raw, 'domainList'), false);
    assert.equal(h.database.prepare('SELECT background FROM setting').get().background, raw.background);
    publications.push({ background: raw.background, queryCount: h.queries.length, raw });
    return originalPut(key, value);
  };
  assert.equal(await h.service.setBackground(h.context, { background: newBackground }), newBackground);
  assert.deepEqual(h.queries.map(query => ({ sql: query.sql.split(' ').slice(0, 3).join(' '), params: query.params })), [
    { sql: 'update "setting" set', params: [''] },
    { sql: 'select "register", "receive",', params: [] },
    { sql: 'update "setting" set', params: [newBackground] },
    { sql: 'select "register", "receive",', params: [] },
  ]);
  assert.deepEqual(publications.map(({ background, queryCount }) => ({ background, queryCount })), [
    { background: '', queryCount: 2 }, { background: newBackground, queryCount: 4 },
  ]);
  assert.notEqual(publications[0].raw, publications[1].raw);
  assert.equal(h.requestCache.get('setting'), publications[1].raw);
  assert.equal(JSON.parse(h.stored.get('setting:')).background, newBackground);
  assert.deepEqual(h.operations, [
    ['context:get', 'setting'], ['get', 'setting:'], ['context:set', 'setting'],
    ['context:set', 'setting'], ['put', 'setting:'], ['context:set', 'setting'], ['put', 'setting:'],
  ]);
});
