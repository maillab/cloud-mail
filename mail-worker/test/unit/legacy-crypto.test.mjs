import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadModule } from '../../scripts/test-module-loader.mjs';

const { default: cryptoUtils } = await loadModule(new URL('../../src/utils/crypto-utils', import.meta.url));

test('password hashing retains random salt base64 and SHA256 of salt followed by password', async t => {
  t.mock.method(crypto, 'getRandomValues', array => {
    for (let index = 0; index < array.length; index++) array[index] = index;
    return array;
  });
  const password = '邮箱-password';
  const salt = Buffer.from(Array.from({ length: 16 }, (_, index) => index)).toString('base64');
  const expected = createHash('sha256').update(salt + password).digest('base64');
  assert.deepEqual(await cryptoUtils.hashPassword(password), { salt, hash: expected });
  assert.equal(cryptoUtils.generateSalt(3), 'AAEC');
  assert.equal(await cryptoUtils.verifyPassword(password, salt, expected), true);
  assert.equal(await cryptoUtils.verifyPassword('other-password', salt, expected), false);
});

test('legacy password runtime coercion remains characterization rather than implicit DTO validation', async () => {
  const salt = 'fixture-salt';
  const expected = createHash('sha256').update('fixture-salt1').digest('base64');
  assert.equal(await cryptoUtils.genHashPassword(1, salt), expected);
  assert.equal(await cryptoUtils.verifyPassword('1', salt, expected), true);
  const nullSaltHash = createHash('sha256').update('nullpassword').digest('base64');
  assert.equal(await cryptoUtils.genHashPassword('password', null), nullSaltHash);
  assert.equal(await cryptoUtils.verifyPassword('password', null, null), false);
});

test('generated temporary passwords retain alphabet, length and existing Math.random behavior', t => {
  let value = 0;
  t.mock.method(Math, 'random', () => value);
  assert.equal(cryptoUtils.genRandomPwd(), 'AAAAAAAA');
  value = 0.999;
  assert.equal(cryptoUtils.genRandomPwd(4), '9999');
  assert.equal(cryptoUtils.genRandomPwd(0), '');
});
