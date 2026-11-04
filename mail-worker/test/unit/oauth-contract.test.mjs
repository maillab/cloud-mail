import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthFixture } from '../../scripts/oauth-test-fixture.mjs';
import { loadModule } from '../../scripts/test-module-loader.mjs';

const schema = await loadModule(new URL('./db-schema-module.mjs', import.meta.url));
const db = schema.drizzle({});
const providers = [
  {
    name: 'linuxdo', method: 'linuxDoLogin',
    tokenUrl: 'https://connect.linux.do/oauth2/token', profileUrl: 'https://connect.linux.do/api/user',
    profile: { id: 42, username: 'linux-user', name: 'Linux User', active: true, silenced: false, trust_level: 3, avatar_url: 'https://avatar.test/linux', ignored: 'extra' },
    normalized: { oauthUserId: '42', username: 'linux-user', name: 'Linux User', active: 0, silenced: 1, trustLevel: 3, avatar: 'https://avatar.test/linux', platform: 'linuxdo' },
  },
  {
    name: 'github', method: 'githubLogin',
    tokenUrl: 'https://github.com/login/oauth/access_token', profileUrl: 'https://api.github.com/user',
    profile: { id: 43, login: 'github-user', name: null, avatar_url: 'https://avatar.test/github', ignored: 'extra' },
    normalized: { oauthUserId: '43', username: 'github-user', name: null, avatar: 'https://avatar.test/github', platform: 'github' },
  },
  {
    name: 'google', method: 'googleLogin',
    tokenUrl: 'https://oauth2.googleapis.com/token', profileUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    profile: { sub: 'google-new-subject', email: 'google@example.test', name: 'Google User', picture: 'https://avatar.test/google', ignored: 'extra' },
    normalized: { oauthUserId: 'google-new-subject', username: 'google@example.test', name: 'Google User', avatar: 'https://avatar.test/google', platform: 'google' },
  },
];

for (const provider of providers) {
  test(`${provider.name} OAuth preserves exchange format, callback, identity mapping, SQL bindings and setup proof`, async t => {
    const h = await createOAuthFixture(t);
    const now = 1800000000000;
    t.mock.method(Date, 'now', () => now);
    const redirectUri = `https://mail.test/auth/${provider.name}/callback?literal=a+b&state=x%2Fy`;
    const code = 'code +/&=邮箱';
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      calls.push({ url, options });
      if (url === provider.tokenUrl) return Response.json({ access_token: 'provider-access-token' });
      assert.equal(url, provider.profileUrl);
      return Response.json(provider.profile);
    });
    const result = await h.service[provider.method](h.context, { code, redirectUri });
    assert.equal(calls.length, 2);
    const [exchange, identity] = calls;
    assert.equal(exchange.options.method, 'POST');
    if (provider.name === 'github') {
      assert.deepEqual(exchange.options.headers, { 'Content-Type': 'application/json', Accept: 'application/json' });
      assert.deepEqual(JSON.parse(exchange.options.body), {
        client_id: 'fixture-github-client', client_secret: 'fixture-github-secret', code, redirect_uri: redirectUri,
      });
      assert.deepEqual(identity.options, { headers: { Authorization: 'Bearer provider-access-token', 'User-Agent': 'cloud-mail' } });
    } else {
      assert.deepEqual(exchange.options.headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
      assert.deepEqual([...new URLSearchParams(exchange.options.body)], [
        ['client_id', `fixture-${provider.name}-client`], ['client_secret', `fixture-${provider.name}-secret`],
        ['code', code], ['redirect_uri', redirectUri], ['grant_type', 'authorization_code'],
      ]);
      assert.deepEqual(identity.options, { headers: { Authorization: 'Bearer provider-access-token' } });
    }
    assert.equal(result.token, null);
    assert.equal(result.expiresAt, now + 900000);
    const proof = await h.jwt.verifyToken(h.context, result.setupToken);
    assert.deepEqual(proof, {
      purpose: 'oauth-setup', oauthId: result.userInfo.oauthId,
      platform: provider.name, subject: provider.normalized.oauthUserId,
      iat: now / 1000, exp: now / 1000 + 900,
    });
    for (const [key, value] of Object.entries(provider.normalized)) assert.equal(result.userInfo[key], value);
    const actualInsert = h.queries.find(query => query.sql.startsWith('insert into "oauth"'));
    // Compare against the original direct Drizzle values(profile) call, using
    // production schema/encoders. This catches unknown-JSON parameter changes.
    const expected = db.insert(schema.tables.oauth).values({ ...provider.profile, ...provider.normalized }).returning().toSQL();
    assert.deepEqual(actualInsert, { sql: expected.sql, params: expected.params });
    assert.deepEqual(h.state.loginCalls, []);
  });
}

test('OAuth update preserves undefined/default/null values and the original direct Drizzle SQL parameters', async t => {
  const h = await createOAuthFixture(t);
  const profile = { oauthUserId: 'google-sub', platform: 'google', name: null, avatar: undefined, username: 'changed', extra: 'ignored' };
  const returned = await h.service.saveUser(h.context, profile);
  const expected = db.update(schema.tables.oauth).set(profile).where(schema.eq(schema.tables.oauth.oauthId, 1)).returning().toSQL();
  const update = h.queries.find(query => query.sql.startsWith('update "oauth"'));
  assert.deepEqual(update, { sql: expected.sql, params: expected.params });
  assert.equal(returned.name, null);
  assert.equal(returned.username, 'changed');
  assert.equal(returned.oauthId, 1);
  assert.equal(returned.userId, 0);
});

test('OAuth proof narrowing preserves legacy numeric-string expiry and SQL ID bindings without turning them into new input validation', async t => {
  const h = await createOAuthFixture(t);
  const now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  const proof = await h.jwt.generateToken(h.context, {
    purpose: 'oauth-setup', oauthId: '1', platform: 'google', subject: 'google-sub', exp: String(now / 1000 + 900),
  });
  const result = await h.service.bindUser(h.context, { email: 'user@example.test', setupToken: proof });
  assert.equal(result.token, 'mail-session');
  const select = h.queries.find(query => query.sql.startsWith('select'));
  const expected = db.select().from(schema.tables.oauth).where(schema.eq(schema.tables.oauth.oauthId, '1')).toSQL();
  assert.deepEqual(select, { sql: expected.sql, params: expected.params });
  assert.deepEqual(select.params, ['1']);
  assert.equal(h.state.registerCalls.length, 1);
});

test('OAuth JSON property access retains primitives, null errors, array identity and unknown persisted field values', async () => {
  const { jsonProperty, setJsonProperty } = await loadModule(new URL('../../src/integrations/oauth-client', import.meta.url));
  for (const value of [false, 1, 'profile']) assert.equal(jsonProperty(value, 'id'), undefined);
  for (const value of [null, undefined]) {
    assert.throws(() => jsonProperty(value, 'id'), error => error.message === `Cannot read properties of ${String(value)} (reading 'id')`);
  }
  for (const value of [false, 1, 'profile']) {
    assert.throws(() => setJsonProperty(value, 'oauthUserId', 'undefined'), TypeError);
  }
  const array = [{ name: 'retained' }];
  setJsonProperty(array, 'platform', 'github');
  assert.equal(array.platform, 'github');
  assert.deepEqual(array[0], { name: 'retained' });
  const object = { profileValue: { unknown: true } };
  const raw = object.profileValue;
  setJsonProperty(object, 'name', raw);
  assert.equal(object.name, raw);
  assert.equal(jsonProperty(object, 'name'), raw);
});

test('OAuth disabled switches stop each provider before fetch, and null request bodies fail before settings lookup', async t => {
  const h = await createOAuthFixture(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected provider request'); });
  h.state.enabled = 1;
  for (const provider of providers) {
    await assert.rejects(h.service[provider.method](h.context, { code: 'code', redirectUri: 'https://mail.test/callback' }), error => error.message === 'oauthDisabled' && error.code === 501);
    await assert.rejects(h.service[provider.method](h.context, null), TypeError);
  }
  assert.equal(calls, 0);
  assert.equal(h.queries.length, 0);
});

test('OAuth transport retains provider HTTP and network errors, GitHub error descriptions and malformed JSON property behavior', async t => {
  const { default: client } = await loadModule(new URL('../../src/integrations/oauth-client', import.meta.url));
  const config = { clientId: undefined, clientSecret: null };
  const params = { code: 'code', redirectUri: 'https://mail.test/callback' };
  let fetchImpl;
  t.mock.method(globalThis, 'fetch', (...args) => fetchImpl(...args));
  for (const method of ['linuxdo', 'github', 'google']) {
    fetchImpl = async () => new Response('', { status: 400, statusText: 'invalid_grant' });
    await assert.rejects(client[method](config, params), error => error.message === 'invalid_grant' && error.code === 501);
    const failure = new Error('provider network unavailable');
    fetchImpl = async () => { throw failure; };
    await assert.rejects(client[method](config, params), error => error === failure);
    fetchImpl = async () => Response.json(null);
    await assert.rejects(client[method](config, params), error => error instanceof TypeError && error.message.includes("Cannot read properties of null"));
  }
  let calls = 0;
  fetchImpl = async () => { calls++; return Response.json({ error: 'bad_code', error_description: 'Provider rejected code' }); };
  await assert.rejects(client.github(config, params), error => error.message === 'Provider rejected code' && error.code === 501);
  assert.equal(calls, 1);
  fetchImpl = async () => Response.json({ error: 'bad_code', error_description: '' });
  await assert.rejects(client.github(config, params), /bad_code/);
  const missingCalls = [];
  fetchImpl = async (url, options) => { missingCalls.push({ url, options }); return Response.json({}); };
  await client.google(config, params);
  assert.deepEqual([...new URLSearchParams(missingCalls[0].options.body)].slice(0, 2), [['client_id', 'undefined'], ['client_secret', 'null']]);
  assert.equal(missingCalls[1].options.headers.Authorization, 'Bearer undefined');
});

test('explicit OAuth API registration preserves route casing and JSON envelope for real provider exchange', async t => {
  const h = await createOAuthFixture(t);
  const { createHono } = await loadModule(new URL('../../src/hono/hono', import.meta.url));
  const { registerOauthApi } = await loadModule(new URL('../../src/api/oauth-api', import.meta.url), { mocks: new Map([
    [new URL('../../src/service/oauth-service', import.meta.url), { default: h.service }],
  ]) });
  const app = createHono();
  registerOauthApi(app);
  t.mock.method(globalThis, 'fetch', async url => Response.json(url.includes('/token') ? { access_token: 'provider-token' } : providers[0].profile));
  const response = await app.request('/oauth/linuxDo/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'code', redirectUri: 'https://mail.test/auth/linuxdo/callback' }) }, h.context.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('set-cookie'), null);
  const json = await response.json();
  assert.equal(json.code, 200);
  assert.equal(json.message, 'success');
  assert.equal(json.data.token, null);
  assert.equal(json.data.userInfo.platform, 'linuxdo');
  assert.ok(json.data.setupToken);
  assert.equal((await app.request('/oauth/linuxdo/login', { method: 'POST' }, h.context.env)).status, 404);
});
