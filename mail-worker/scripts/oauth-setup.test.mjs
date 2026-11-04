import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthFixture, googleIdentity } from './oauth-test-fixture.mjs';

test('new OAuth identity gets a scoped expiring setup proof, not a mail session', async t => {
  const { service, jwt, context, state } = await createOAuthFixture(t);
  const result = await service.saveAndLogin(context, googleIdentity);
  assert.equal(result.token, null);
  const proof = await jwt.verifyToken(context, result.setupToken);
  assert.equal(proof.purpose, 'oauth-setup');
  assert.equal(proof.subject, 'google-sub');
  assert.equal(proof.platform, 'google');
  assert.equal(proof.oauthId, 1);
  assert.equal(proof.exp - proof.iat, 900);
  assert.equal(state.loginCalls.length, 0);
});

test('binding rejects IDs alone, forged/expired/wrong-purpose proofs before registration', async t => {
  const { service, jwt, context, state } = await createOAuthFixture(t);
  const proofs = [
    undefined,
    'forged',
    await jwt.generateToken(context, { purpose: 'oauth-setup', oauthId: 1, platform: 'google', subject: 'google-sub' }, -1),
    await jwt.generateToken(context, { purpose: 'login', oauthId: 1 }, 900),
  ];
  for (const setupToken of proofs) {
    await assert.rejects(service.bindUser(context, { oauthUserId: 'google-sub', email: 'test@example.test', setupToken }));
  }
  assert.equal(state.registers, 0);
});

test('valid proof initializes once; replay and already-bound setup are rejected', async t => {
  const { service, context, state, row } = await createOAuthFixture(t);
  const first = await service.saveAndLogin(context, googleIdentity);
  const result = await service.bindUser(context, { email: 'test@example.test', code: 'registration-key', setupToken: first.setupToken });
  assert.equal(result.token, 'mail-session');
  assert.equal(row().user_id, 7);
  assert.equal(state.registers, 1);
  assert.equal(state.registerCalls[0].oauth, true);
  assert.equal(state.registerCalls[0].params.code, 'registration-key');
  assert.match(state.registerCalls[0].params.password, /^[A-Za-z0-9]{8}$/);
  assert.deepEqual(state.loginCalls[0], { params: { email: 'test@example.test', password: null }, oauth: true });
  // The current response retains the pre-update row; changing this is separate
  // from a type migration and must not be hidden by an ORM predicate mock.
  assert.equal(result.userInfo.userId, 0);
  await assert.rejects(service.bindUser(context, { email: 'second@example.test', setupToken: first.setupToken }));
  assert.equal(state.registers, 1);
});

test('existing account skips setup and receives its login session', async t => {
  const { service, context, bindExistingUser } = await createOAuthFixture(t);
  bindExistingUser();
  const result = await service.saveAndLogin(context, googleIdentity);
  assert.equal(result.token, 'mail-session');
  assert.equal(result.setupToken, undefined);
});

test('provider and identity mismatch cannot complete setup', async t => {
  const { service, jwt, context, state } = await createOAuthFixture(t);
  for (const identity of [{ platform: 'github', subject: 'google-sub' }, { platform: 'google', subject: 'other-sub' }]) {
    const proof = await jwt.generateToken(context, { purpose: 'oauth-setup', oauthId: 1, ...identity }, 900);
    await assert.rejects(service.bindUser(context, { email: 'test@example.test', setupToken: proof }));
  }
  assert.equal(state.registers, 0);
});

test('Google code exchange uses the callback URI and verified provider identity', async t => {
  const { service, context } = await createOAuthFixture(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    if (url === 'https://oauth2.googleapis.com/token') {
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('redirect_uri'), 'https://mail.test/auth/google/callback');
      assert.equal(form.get('code'), 'test-code');
      assert.equal(form.get('client_id'), 'fixture-google-client');
      return Response.json({ access_token: 'provider-token' });
    }
    assert.equal(url, 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.equal(options.headers.Authorization, 'Bearer provider-token');
    return Response.json({ sub: 'verified-google-sub', email: 'verified@example.test', name: 'Test' });
  });
  const result = await service.googleLogin(context, { code: 'test-code', redirectUri: 'https://mail.test/auth/google/callback' });
  assert.equal(result.token, null);
  assert.ok(result.setupToken);
  assert.equal(result.userInfo.platform, 'google');
  assert.equal(result.userInfo.oauthUserId, 'verified-google-sub');
  assert.equal(calls, 2);
});

test('disabled Google login and failed provider exchange never issue a setup proof', async t => {
  const { service, context, state } = await createOAuthFixture(t);
  state.enabled = 1;
  await assert.rejects(service.googleLogin(context, { code: 'test', redirectUri: 'https://mail.test/auth/google/callback' }));
  state.enabled = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 400, statusText: 'invalid_grant' }));
  await assert.rejects(service.googleLogin(context, { code: 'test', redirectUri: 'https://mail.test/auth/google/callback' }));
});
