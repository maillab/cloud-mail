import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const source = path => new URL(`../../src/${path}`, import.meta.url);
const { default: service } = await loadModule(source('service/reg-key-service'), { mocks: new Map([
  [source('i18n/i18n'), { t: key => key, tFor: () => key => key }],
  [source('service/user-service'), { default: { async listByRegKeyId() { return []; } } }],
]) });

test('a registration key awaits the role lookup and rejects a missing role before INSERT', async t => {
  const h = await databaseFixture(t);
  await assert.rejects(service.add(h.context, { code: 'missing-role', roleId: '999', count: 2, expireTime: '2099-01-01' }, 1), { message: 'roleNotExist' });
  assert.equal(h.database.prepare('SELECT COUNT(*) AS n FROM reg_key').get().n, 0);
});

test('valid registration keys keep string role/user parameters, CSV deletion and listed role names', async t => {
  const h = await databaseFixture(t);
  h.database.exec("INSERT INTO role (role_id,name,key) VALUES (2,'fixture-role',NULL)");
  await service.add(h.context, { code: 'fixture-key', roleId: '2', count: 2, expireTime: '2099-01-01' }, '8');
  const insert = h.queries.find(query => query.sql.startsWith('insert into "reg_key"'));
  assert.ok(insert.params.includes('2'));
  assert.ok(insert.params.includes('8'));
  const rows = await service.list(h.context, { code: 'fixture' });
  assert.equal(rows[0].roleName, 'fixture-role');
  await service.reduceCount(h.context, 'fixture-key', 1);
  assert.equal((await service.selectByCode(h.context, 'fixture-key')).count, 1);
  await service.delete(h.context, { regKeyIds: String(rows[0].regKeyId) });
  assert.equal(h.database.prepare('SELECT COUNT(*) AS n FROM reg_key').get().n, 0);
});
