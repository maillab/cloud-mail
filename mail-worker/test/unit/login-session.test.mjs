import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from '../../scripts/test-module-loader.mjs';

const source = path => new URL(`../../src/${path}`, import.meta.url);
const { default: jwt } = await loadModule(source('utils/jwt-utils'));
const services = ['user-service', 'account-service', 'settings-reader', 'turnstile-service', 'role-service', 'reg-key-service', 'verify-record-service'];

async function fixture({ initialSession, verifyResult = true, verifyError, updateError } = {}) {
  const events = [];
  const user = { userId: 7, email: 'user@example.test', salt: 'salt', password: 'hash', isDel: 0, status: 0 };
  let stored = initialSession === undefined ? { user, tokens: ['current-token', 'other-token'], refreshTime: '2026-10-03T00:00:00.000Z' } : initialSession;
  const env = {
    jwt_secret: 'test-only-login-secret',
    kv: {
      async get(key, options) { events.push(['get', key, options]); return structuredClone(stored); },
      async put(key, value, options) { events.push(['put', key, options]); stored = JSON.parse(value); },
    },
  };
  const authorization = await jwt.generateToken({ env }, { userId: 7, token: 'current-token' });
  const context = { env, req: { header: () => authorization } };
  const { default: service } = await loadModule(source('service/login-service'), { mocks: new Map([
    ...services.filter(name => name !== 'user-service').map(name => [source(`service/${name}`), { default: {} }]),
    [source('service/user-service'), { default: {
      async selectByEmailIncludeDel(c, email) { events.push(['select', email]); return user; },
      async updateUserInfo(c, userId) { events.push(['update', userId]); if (updateError) throw updateError; },
    } }],
    [source('utils/crypto-utils'), { default: {
      async verifyPassword(password, salt, hash) {
        events.push(['verify', password, salt, hash]);
        if (verifyError) throw verifyError;
        return verifyResult;
      },
    } }],
    [source('i18n/i18n'), { t: key => key, tFor: () => key => key }],
  ]) });
  return { service, context, events, user, value: () => stored, replaceTokens: tokens => { stored.tokens = tokens; } };
}

test('logout revokes the current token, preserves other sessions and retains the legacy put options', async () => {
  const { service, context, events, value } = await fixture();
  await service.logout(context, 7);
  assert.deepEqual(value().tokens, ['other-token']);
  assert.deepEqual(events, [
    ['get', 'auth-uid:7', { type: 'json' }],
    ['put', 'auth-uid:7', undefined],
  ]);
});

test('logout does not revoke another session when the current token has already been removed', async () => {
  const { service, context, value, replaceTokens } = await fixture();
  replaceTokens(['other-token']);
  await service.logout(context, 7);
  assert.deepEqual(value().tokens, ['other-token']);
});

test('fresh login stores the JWT UUID under the original KV key with thirty-day TTL after updating user metadata', async () => {
  const { service, context, events, user, value } = await fixture({ initialSession: null });
  const token = await service.login(context, { email: user.email, password: 'password' });
  const payload = await jwt.verifyToken(context, token);
  assert.equal(payload.userId, 7);
  assert.match(payload.token, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(Object.hasOwn(payload, 'exp'), false);
  assert.deepEqual(value().tokens, [payload.token]);
  assert.deepEqual(value().user, user);
  assert.equal(new Date(value().refreshTime).toISOString(), value().refreshTime);
  assert.deepEqual(events, [
    ['select', user.email], ['verify', 'password', user.salt, user.password],
    ['get', 'auth-uid:7', { type: 'json' }], ['update', 7],
    ['put', 'auth-uid:7', { expirationTtl: 2592000 }],
  ]);
});

test('login retains cached user fields and refreshTime, appending a fresh UUID while preserving the existing eleven-session boundary', async () => {
  for (const length of [10, 11]) {
    const oldTokens = Array.from({ length }, (_, index) => `old-${index}`);
    const initialSession = {
      user: { userId: 7, email: 'user@example.test', cachedMarker: 'unchanged' },
      tokens: oldTokens, refreshTime: '2020-01-01T00:00:00.000Z',
    };
    const { service, context, value } = await fixture({ initialSession });
    const first = await service.login(context, { email: 'user@example.test', password: 'password' });
    const payload = await jwt.verifyToken(context, first);
    assert.deepEqual(value().user, initialSession.user);
    assert.equal(value().refreshTime, initialSession.refreshTime);
    assert.deepEqual(value().tokens, [...oldTokens.slice(length > 10 ? 1 : 0), payload.token]);
    assert.equal(value().tokens.length, 11);
    const second = await service.login(context, { email: 'user@example.test', password: 'password' });
    assert.notEqual((await jwt.verifyToken(context, second)).token, payload.token);
  }
});

test('a cached session for a different email is replaced before saving the new UUID', async () => {
  const { service, context, user, value } = await fixture({ initialSession: {
    user: { userId: 7, email: 'old@example.test' }, tokens: ['old-token'], refreshTime: '2020-01-01T00:00:00.000Z',
  } });
  const payload = await jwt.verifyToken(context, await service.login(context, { email: user.email, password: 'password' }));
  assert.deepEqual(value().user, user);
  assert.deepEqual(value().tokens, [payload.token]);
  assert.notEqual(value().refreshTime, '2020-01-01T00:00:00.000Z');
});

test('OAuth password bypass still awaits the password verification before KV access and propagates its rejection', async () => {
  const normal = await fixture({ initialSession: null, verifyResult: false });
  const token = await normal.service.login(normal.context, { email: normal.user.email, password: null }, true);
  assert.equal((await jwt.verifyToken(normal.context, token)).userId, 7);
  assert.deepEqual(normal.events.slice(0, 3), [
    ['select', normal.user.email], ['verify', null, normal.user.salt, normal.user.password],
    ['get', 'auth-uid:7', { type: 'json' }],
  ]);
  const failure = new Error('password verification unavailable');
  const failing = await fixture({ verifyError: failure });
  await assert.rejects(failing.service.login(failing.context, { email: failing.user.email, password: null }, true), error => error === failure);
  assert.deepEqual(failing.events.map(event => event[0]), ['select', 'verify']);
  const denied = await fixture({ verifyResult: false });
  await assert.rejects(denied.service.login(denied.context, { email: denied.user.email, password: 'wrong-password' }), /IncorrectPwd/);
  assert.deepEqual(denied.events.map(event => event[0]), ['select', 'verify']);
});

test('a metadata update failure prevents the login session from being written', async () => {
  const failure = new Error('metadata write unavailable');
  const { service, context, user, events, value } = await fixture({ initialSession: null, updateError: failure });
  await assert.rejects(service.login(context, { email: user.email, password: 'password' }), error => error === failure);
  assert.deepEqual(events.map(event => event[0]), ['select', 'verify', 'get', 'update']);
  assert.equal(value(), null);
});
