import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { loadModule } from '../../scripts/test-module-loader.mjs';
import { createOAuthFixture } from '../../scripts/oauth-test-fixture.mjs';

const source = path => new URL(`../../src/${path}`, import.meta.url);
const { default: jwt } = await loadModule(source('utils/jwt-utils'));
const { default: userContext } = await loadModule(source('security/user-context'));
const context = { env: { jwt_secret: 'test-only-jwt-contract-secret' } };
const now = 1_800_000_000;

function signedPayload(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', context.env.jwt_secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

test('ordinary JWT preserves HS256 bytes, Unicode claims, iat and absence of automatic exp', async t => {
  t.mock.method(Date, 'now', () => now * 1000);
  const claims = { userId: 7, token: 'session-random-id', label: '邮箱' };
  const token = await jwt.generateToken(context, claims);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ...claims, iat: now })).toString('base64url');
  const signature = createHmac('sha256', context.env.jwt_secret).update(`${header}.${payload}`).digest('base64url');
  assert.equal(token, `${header}.${payload}.${signature}`);
  assert.deepEqual(await jwt.verifyToken(context, token), { ...claims, iat: now });
  assert.equal(Object.hasOwn(await jwt.verifyToken(context, token), 'exp'), false);
});

test('JWT expiration retains the existing second boundary and zero-TTL behavior', async t => {
  t.mock.method(Date, 'now', () => now * 1000);
  const token = await jwt.generateToken(context, { userId: 7 }, 1);
  t.mock.method(Date, 'now', () => (now + 1) * 1000);
  assert.equal((await jwt.verifyToken(context, token)).exp, now + 1);
  t.mock.method(Date, 'now', () => (now + 2) * 1000);
  assert.equal(await jwt.verifyToken(context, token), null);
  const zero = await jwt.generateToken(context, { userId: 7 }, 0);
  assert.equal(Object.hasOwn(await jwt.verifyToken(context, zero), 'exp'), false);
});

test('invalid signatures, wrong secrets and malformed JWT inputs return null', async t => {
  t.mock.method(console, 'log', () => {});
  const token = await jwt.generateToken(context, { userId: 7, token: 'session' });
  const parts = token.split('.');
  parts[1] = Buffer.from(JSON.stringify({ userId: 99 })).toString('base64url');
  assert.equal(await jwt.verifyToken(context, parts.join('.')), null);
  assert.equal(await jwt.verifyToken({ env: { jwt_secret: 'other-test-secret' } }, token), null);
  for (const invalid of ['', 'not-a-token', 'a.b.c', null, undefined, 7]) {
    assert.equal(await jwt.verifyToken(context, invalid), null);
  }
});

test('generic JWT parsing returns unknown signed JSON and preserves legacy expiration coercion', async t => {
  t.mock.method(Date, 'now', () => now * 1000);
  const log = t.mock.method(console, 'log', () => {});
  for (const value of [false, 7, 'signed-string', ['signed-array']]) {
    assert.deepEqual(await jwt.verifyToken(context, signedPayload(value)), value);
  }
  assert.equal(await jwt.verifyToken(context, signedPayload(null)), null);
  assert.equal(log.mock.calls.length, 1);
  assert.equal(log.mock.calls[0].arguments[0].name, 'TypeError');
  for (const exp of ['1', true, []]) {
    assert.equal(await jwt.verifyToken(context, signedPayload({ exp })), null);
  }
  for (const exp of ['not-a-number', false]) {
    assert.deepEqual(await jwt.verifyToken(context, signedPayload({ exp })), { exp });
  }
});

test('user context reads the original Authorization value and exposes async session token lookup', async t => {
  t.mock.method(console, 'log', () => {});
  const token = await jwt.generateToken(context, { userId: 7, token: 'session-random-id' });
  const user = { userId: 7, email: 'user@example.test' };
  const requestContext = {
    env: context.env,
    get: key => { assert.equal(key, 'user'); return user; },
    req: { header: key => { assert.equal(key, 'Authorization'); return token; } },
  };
  assert.equal(userContext.getUserId(requestContext), 7);
  assert.equal(userContext.getUser(requestContext), user);
  const pending = userContext.getToken(requestContext);
  assert.equal(typeof pending.then, 'function');
  assert.equal(await pending, 'session-random-id');
  requestContext.req.header = () => `Bearer ${token}`;
  assert.equal(await userContext.getToken(requestContext), undefined);
});

test('OAuth setup rejects exp equal to now even though generic JWT verification accepts it', async t => {
  const { service, jwt: oauthJwt, context: oauthContext, state } = await createOAuthFixture(t);
  t.mock.method(Date, 'now', () => now * 1000);
  const proof = await oauthJwt.generateToken(oauthContext, {
    purpose: 'oauth-setup', oauthId: 1, platform: 'google', subject: 'google-sub', exp: now,
  });
  assert.equal((await oauthJwt.verifyToken(oauthContext, proof)).exp, now);
  await assert.rejects(service.bindUser(oauthContext, { email: 'test@example.test', setupToken: proof }), /设置会话已失效/);
  assert.equal(state.registers, 0);
});
