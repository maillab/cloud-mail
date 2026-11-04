import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { loadModule } from '../../scripts/test-module-loader.mjs';

const { default: analysisDao } = await loadModule(new URL('../../src/dao/analysis-dao', import.meta.url));

// SQLite executes the unchanged aggregate SQL. This small adapter tests the DAO
// boundary; the Worker contract suite separately covers Miniflare's native D1.
function fixture(t) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  database.exec(`
    CREATE TABLE email (type INTEGER, is_del INTEGER, create_time TEXT);
    CREATE TABLE user (is_del INTEGER, create_time TEXT);
    CREATE TABLE account (is_del INTEGER);
  `);
  const calls = [];
  const context = { env: { db: { prepare(sql) {
    calls.push(sql);
    return { async all() { return { results: database.prepare(sql).all().map(row => ({ ...row })) }; } };
  } } } };
  return { database, context, calls };
}

test('analysis totals retain numeric zero values for an empty database', async t => {
  const { context, calls } = fixture(t);
  const result = await analysisDao.numberCount(context);
  assert.deepEqual(result, {
    receiveTotal: 0, sendTotal: 0, delReceiveTotal: 0, delSendTotal: 0,
    normalReceiveTotal: 0, normalSendTotal: 0,
    userTotal: 0, normalUserTotal: 0, delUserTotal: 0,
    accountTotal: 0, normalAccountTotal: 0, delAccountTotal: 0,
  });
  assert.equal(calls.length, 1);
});

test('analysis totals distinguish received/sent and soft-deleted rows without counting other mail types', async t => {
  const { database, context } = fixture(t);
  database.exec(`
    INSERT INTO email (type,is_del) VALUES (0,0),(0,0),(0,1),(1,0),(1,1),(2,0);
    INSERT INTO user (is_del) VALUES (0),(0),(1);
    INSERT INTO account (is_del) VALUES (0),(0),(1),(1);
  `);
  assert.deepEqual(await analysisDao.numberCount(context), {
    receiveTotal: 3, sendTotal: 2, delReceiveTotal: 1, delSendTotal: 1,
    normalReceiveTotal: 2, normalSendTotal: 1,
    userTotal: 3, normalUserTotal: 2, delUserTotal: 1,
    accountTotal: 4, normalAccountTotal: 2, delAccountTotal: 2,
  });
});

test('analysis timezone modifiers preserve fractional offsets and inverse signs', () => {
  assert.deepEqual(analysisDao.tzModifiers(0), { tzMod: '+0 hours', tzBack: '+0 hours' });
  assert.deepEqual(analysisDao.tzModifiers(5.5), { tzMod: '+5.5 hours', tzBack: '-5.5 hours' });
  assert.deepEqual(analysisDao.tzModifiers(-7), { tzMod: '-7 hours', tzBack: '+7 hours' });
});

test('analysis day counts retain the last fifteen completed local days and source mail type', async t => {
  for (const diffHours of [0, 5.5, -7]) {
    const { database, context } = fixture(t);
    const { tzMod, tzBack } = analysisDao.tzModifiers(diffHours);
    const yesterday = `datetime('now', '${tzMod}', 'start of day', '-1 day', '${tzBack}', '+12 hours')`;
    const tooOld = `datetime('now', '${tzMod}', 'start of day', '-16 days', '${tzBack}', '+12 hours')`;
    const today = `datetime('now', '${tzMod}', 'start of day', '${tzBack}', '+12 hours')`;
    database.exec(`
      INSERT INTO user VALUES (0,${yesterday}),(1,${yesterday}),(0,${tooOld}),(0,${today});
      INSERT INTO email VALUES (0,0,${yesterday}),(0,1,${yesterday}),(1,0,${yesterday}),
        (2,0,${yesterday}),(0,0,${tooOld}),(0,0,${today});
    `);
    const { date } = database.prepare(`SELECT DATE(${yesterday}, '${tzMod}') AS date`).get();
    assert.deepEqual(await analysisDao.userDayCount(context, diffHours), [{ date, total: 2 }]);
    assert.deepEqual(await analysisDao.receiveDayCount(context, diffHours), [{ date, total: 2 }]);
    assert.deepEqual(await analysisDao.sendDayCount(context, diffHours), [{ date, total: 1 }]);
  }
});

test('missing D1 fails at the original prepare boundary', async () => {
  await assert.rejects(analysisDao.numberCount({ env: {} }), /Cannot read properties of undefined \(reading 'prepare'\)/);
});

test('raw day rows keep a null DATE for malformed historical timestamp text', async t => {
  const { database, context } = fixture(t);
  database.exec("INSERT INTO user VALUES (0, DATE('now', '-1 day') || ' invalid')");
  assert.deepEqual(await analysisDao.userDayCount(context, 0), [{ date: null, total: 1 }]);
});
