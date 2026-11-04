import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './test-module-loader.mjs';

// Compile the real entry and KV implementation; isolate only unrelated handlers.
// The API fixture also observes the actual /api prefix rewrite in the dispatcher.
const app = { fetch: request => {
  assert.equal(new URL(request.url).pathname, '/mail/list');
  return new Response('api');
} };
const source = path => new URL(`../src/${path}`, import.meta.url);
const unrelatedServices = ['user-service', 'verify-record-service', 'email-service', 'oauth-service', 'analysis-service'];
const { default: worker } = await loadModule(source('index'), { mocks: new Map([
  [source('hono/webs'), { default: app }],
  [source('email/email'), { email: () => {} }],
  ...unrelatedServices.map(name => [source(`service/${name}`), { default: {} }]),
]) });
const types = ['image/jpeg', 'video/mp4', 'audio/mpeg', 'application/pdf', 'application/zip'];

for (const type of types) {
  test(`${type}: canonical and legacy URLs return identical file bytes`, async () => {
    for (const prefix of ['/attachments/', '/mail/attachments/']) {
      const env = {
        kv: { getWithMetadata: async key => {
          assert.equal(key, 'attachments/file');
          return { value: new Uint8Array([1, 2, 3]).buffer, metadata: { contentType: type, contentDisposition: 'inline' } };
        } },
        assets: { fetch: () => { throw new Error('Attachment reached SPA'); } },
      };
      const response = await worker.fetch(new Request(`https://mail.test${prefix}file`), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Content-Type'), type);
      assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
      const head = await worker.fetch(new Request(`https://mail.test${prefix}file`, { method: 'HEAD' }), env);
      assert.equal(await head.text(), '');
      assert.equal(head.headers.get('Content-Length'), '3');
    }
  });
}

test('missing attachments return 404, writes return 405, normal routes retain SPA/API dispatch', async () => {
  const env = { kv: { getWithMetadata: async () => ({ value: null }) }, assets: { fetch: () => new Response('spa') } };
  const request = (path, method = 'GET') => worker.fetch(new Request(`https://mail.test${path}`, { method }), env);
  assert.equal((await request('/mail/attachments/missing')).status, 404);
  assert.equal((await request('/attachments/file', 'POST')).status, 405);
  assert.equal(await (await request('/mail/123')).text(), 'spa');
  assert.equal(await (await request('/api/mail/list')).text(), 'api');
});
