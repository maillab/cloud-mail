import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { databaseFixture } from './db-fixture.mjs';

const { default: service } = await loadModule(new URL('../../src/service/verify-record-service', import.meta.url));

test('registration verification returns the created row on the first request and increments on the next', async t => {
  const { context } = await databaseFixture(t);
  const first = await service.increaseRegCount(context);
  assert.equal(first.count, 1);
  assert.equal(first.ip, '127.0.0.1');
  assert.equal(await service.isOpenRegVerify(context, 1), true);
  const second = await service.increaseRegCount(context);
  assert.equal(second.count, 2);
  assert.equal(second.vrId, first.vrId);
});

test('add-mailbox verification has its own count and keeps the same IP', async t => {
  const { context } = await databaseFixture(t);
  await service.increaseRegCount(context);
  const first = await service.increaseAddCount(context);
  const second = await service.increaseAddCount(context);
  assert.equal(first.count, 1);
  assert.equal(second.count, 2);
  const rows = await service.selectListByIP(context);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.count).sort(), [1, 2]);
});
