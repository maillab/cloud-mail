import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { observeSchema } from './db-schema-observation.mjs';

const module = await loadModule(new URL('./db-schema-module.mjs', import.meta.url));
const baseline = JSON.parse(await readFile(new URL('./db-schema-baseline.json', import.meta.url), 'utf8'));
const current = observeSchema(module);

test('all twelve entity builders preserve column names, nullability, defaults and runtime mappers', () => {
  assert.equal(Object.keys(current.schema).length, 12);
  assert.deepEqual(current.schema, baseline.schema);
});

test('representative entity SELECT/INSERT/UPDATE and full/brief projection keep SQL and bound params', () => {
  assert.deepEqual(current.queries, baseline.queries);
  assert.equal(current.emailListTextLength, 300);
  assert.equal(current.emailListTextLength, baseline.emailListTextLength);
});

test('$type returns the same builder and leaves defaults and driver mapping intact', () => {
  for (const builder of [module.text('sort').default(0), module.integer('ip').notNull().default('')]) {
    const config = builder.config;
    assert.equal(builder.$type(), builder);
    assert.equal(builder.config, config);
  }
  const { user, att, verifyRecord, oauth, setting } = module.tables;
  assert.equal(user.sort.mapFromDriverValue(5), 5);
  assert.equal(user.sort.mapFromDriverValue('5'), '5');
  assert.equal(user.sendCount.default, 0);
  assert.equal(user.sort.notNull, false);
  assert.equal(att.status.default, 0);
  assert.equal(att.status.mapFromDriverValue('0'), '0');
  assert.equal(verifyRecord.ip.mapFromDriverValue('127.0.0.1'), '127.0.0.1');
  assert.equal(verifyRecord.ip.default, '');
  assert.equal(oauth.platform.mapFromDriverValue(0), 0);
  assert.equal(oauth.platform.mapFromDriverValue('google'), 'google');
  assert.equal(oauth.platform.mapFromDriverValue(null), null);
  assert.equal(setting.send.default, 1);
  assert.equal(setting.syncDelete.default, 1);
  assert.equal(setting.resendTokens.mapFromDriverValue('{"fixture":"token"}'), '{"fixture":"token"}');
});
