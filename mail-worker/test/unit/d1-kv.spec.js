import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { withStorage } from '../../src/adapter/d1-kv';

describe('existing D1-backed KV storage', () => {
  let sqlite, env;
  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec('CREATE TABLE kv_store (key TEXT PRIMARY KEY, value TEXT, metadata TEXT, expires_at INTEGER)');
    const db = { prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind(...args) { return {
        run: async () => statement.run(...args),
        first: async () => statement.get(...args),
        all: async () => ({ results: statement.all(...args) }),
      }; } };
    } };
    env = withStorage({ db });
  });
  afterEach(() => sqlite.close());

  it('reads existing base64 encoded settings without a KV binding', async () => {
    sqlite.prepare('INSERT INTO kv_store VALUES (?, ?, ?, ?)').run('setting:', 'eyJ0aXRsZSI6ImhhcHB5IG1haWwifQ==', null, null);
    expect(await env.kv.get('setting:', { type: 'json' })).toEqual({ title: 'happy mail' });
  });
  it('round trips binary attachments and metadata', async () => {
    await env.kv.put('attachments/test', new Uint8Array([0, 128, 255]), { metadata: { type: 'application/octet-stream' } });
    const result = await env.kv.getWithMetadata('attachments/test', { type: 'arrayBuffer' });
    expect([...new Uint8Array(result.value)]).toEqual([0, 128, 255]);
    expect(result.metadata).toEqual({ type: 'application/octet-stream' });
  });
  it('excludes expired authentication entries from reads and lists', async () => {
    await env.kv.put('auth:expired', 'secret', { expiration: 1 });
    expect(await env.kv.get('auth:expired')).toBeNull();
    expect((await env.kv.list({ prefix: 'auth:' })).keys).toEqual([]);
  });
  it('overwrites and deletes existing values', async () => {
    await env.kv.put('key', 'old');
    await env.kv.put('key', '新值');
    expect(await env.kv.get('key')).toBe('新值');
    await env.kv.delete('key');
    expect(await env.kv.get('key')).toBeNull();
  });
  it('treats SQL wildcard characters in list prefixes literally', async () => {
    await env.kv.put('a_%:one', '1');
    await env.kv.put('abcd:two', '2');
    expect((await env.kv.list({ prefix: 'a_%:' })).keys.map(key => key.name)).toEqual(['a_%:one']);
  });
  it('uses a real KV binding when one is supplied', () => {
    const bound = { db: env.db, kv: { existing: true } };
    expect(withStorage(bound)).toBe(bound);
  });
});
