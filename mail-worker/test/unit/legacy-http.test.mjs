import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from '../../scripts/test-module-loader.mjs';

const source = path => new URL(`../../src/${path}`, import.meta.url);
const { default: result } = await loadModule(source('model/result'));
const { default: BizError } = await loadModule(source('error/biz-error'));

test('legacy JSON envelopes retain falsy-data handling and fail omits data', () => {
  for (const value of [undefined, null, false, 0, '']) {
    assert.deepEqual(result.ok(value), { code: 200, message: 'success', data: null });
  }
  assert.deepEqual(result.ok([]), { code: 200, message: 'success', data: [] });
  assert.deepEqual(result.ok({ token: 'session' }), { code: 200, message: 'success', data: { token: 'session' } });
  assert.deepEqual(result.fail('failed'), { code: 500, message: 'failed' });
  assert.deepEqual(result.fail('expired', 401), { code: 401, message: 'expired' });
  assert.equal(Object.hasOwn(result.fail('failed'), 'data'), false);
});

test('BizError preserves its name and default/falsy code behavior', () => {
  assert.equal(new BizError('failed').name, 'BizError');
  assert.equal(new BizError('failed').code, 501);
  assert.equal(new BizError('failed', 0).code, 501);
  assert.equal(new BizError('expired', 401).code, 401);
});

test('actual OAuth API routes retain methods, request bodies, envelope and no session cookie', async () => {
  const { createHono } = await loadModule(source('hono/hono'));
  const app = createHono();
  const calls = [];
  const methods = ['linuxDoLogin', 'githubLogin', 'googleLogin', 'bindUser'];
  const service = Object.fromEntries(methods.map(method => [method, async (c, body) => {
    calls.push({ method, body, context: c });
    return { userInfo: { userId: 7 }, token: 'mail-session' };
  }]));
  const { registerOauthApi } = await loadModule(source('api/oauth-api'), { mocks: new Map([
    [source('service/oauth-service'), { default: service }],
  ]) });
  registerOauthApi(app);
  const routes = [
    ['POST', '/oauth/linuxDo/login', 'linuxDoLogin'],
    ['POST', '/oauth/github/login', 'githubLogin'],
    ['POST', '/oauth/google/login', 'googleLogin'],
    ['PUT', '/oauth/bindUser', 'bindUser'],
  ];
  assert.deepEqual(app.routes.filter(route => route.method !== 'ALL').map(route => [route.method, route.path]), routes.map(([method, path]) => [method, path]));
  for (const [method, path, handler] of routes) {
    const body = { code: 'provider-code', redirectUri: 'https://mail.test/auth/google/callback', setupToken: 'setup-proof', email: 'user@example.test' };
    const response = await app.fetch(new Request(`https://mail.test${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.deepEqual(await response.json(), { code: 200, message: 'success', data: { userInfo: { userId: 7 }, token: 'mail-session' } });
    const last = calls.at(-1);
    assert.equal(last.method, handler);
    assert.deepEqual(last.body, body);
    assert.equal(typeof last.context.req.json, 'function');
  }
});

test('actual Hono error handler preserves HTTP200 failure codes, infrastructure diagnostics and CORS', async t => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const { createHono } = await loadModule(source('hono/hono'));
  const app = createHono();
  const failures = [
    [new BizError('expired', 401), { code: 401, message: 'expired' }],
    [new BizError('forbidden', 403), { code: 403, message: 'forbidden' }],
    [new BizError('business failure'), { code: 501, message: 'business failure' }],
    [new Error('ordinary failure'), { code: 500, message: 'ordinary failure' }],
    [new TypeError("Cannot read properties of undefined (reading 'get')"), { code: 502, message: 'KV数据库未绑定<br/>KV database not bound' }],
    [new TypeError("Cannot read properties of undefined (reading 'prepare')"), { code: 502, message: 'D1数据库未绑定<br/>D1 database not bound' }],
    [new Error('D1_ERROR: no such column: missing'), { code: 502, message: '请按照文档更新数据库<br/>Please update the database as documented' }],
  ];
  for (const [index, [error]] of failures.entries()) {
    // These routes live only in this isolated test app, never in production src.
    app.get(`/fixture/${index}`, () => { throw error; });
  }
  for (const [index, [, expected]] of failures.entries()) {
    const response = await app.fetch(new Request(`https://mail.test/fixture/${index}`), {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  const preflight = await app.fetch(new Request('https://mail.test/fixture/0', { method: 'OPTIONS' }), {});
  assert.equal(preflight.status, 204);
});
