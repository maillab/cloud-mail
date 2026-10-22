import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudMailClient } from '../src/client.js';

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

describe('CloudMailClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('login sends POST {baseUrl}/api/login with JSON {email,password} and stores data.token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, message: 'success', data: { token: 'tok-123' } })
      )
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { ok: true } }));

    const client = new CloudMailClient('https://example.com', 'user@example.com', 'pw');
    await client.get('/account/list');

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [loginUrl, loginInit] = fetchMock.mock.calls[0];
    expect(loginUrl).toBe('https://example.com/api/login');
    expect(loginInit.method).toBe('POST');
    expect(loginInit.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(loginInit.body)).toEqual({ email: 'user@example.com', password: 'pw' });
  });

  it('sends the raw token (no "Bearer " prefix) as the Authorization header on authenticated requests', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ code: 200, message: 'success', data: { token: 'raw-token-abc' } })
      )
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: [] }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    await client.get('/account/list');

    const [, requestInit] = fetchMock.mock.calls[1];
    expect(requestInit.headers.Authorization).toBe('raw-token-abc');
  });

  it('buildUrl prefixes the path with /api and builds a querystring skipping undefined/null values', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 't' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: [] }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    await client.get('/email/list', { accountId: 1, emailId: undefined, full: null, size: 10 });

    const [url] = fetchMock.mock.calls[1];
    const parsed = new URL(url as string);
    expect(parsed.pathname).toBe('/api/email/list');
    expect(parsed.searchParams.get('accountId')).toBe('1');
    expect(parsed.searchParams.has('emailId')).toBe(false);
    expect(parsed.searchParams.has('full')).toBe(false);
    expect(parsed.searchParams.get('size')).toBe('10');
  });

  it('POST includes Content-Type: application/json and a JSON-stringified body', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 't' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: null }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    await client.post('/email/send', { subject: 'hi' });

    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ subject: 'hi' });
  });

  it('PUT includes Content-Type: application/json and a JSON-stringified body', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 't' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: null }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    await client.put('/email/read', { emailIds: [1, 2] });

    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ emailIds: [1, 2] });
  });

  it('GET has no body and no Content-Type header', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 't' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: [] }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    await client.get('/account/list');

    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('code 200 returns the envelope data', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 't' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { foo: 'bar' } }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    const result = await client.get('/x');
    expect(result).toEqual({ foo: 'bar' });
  });

  it('on a first 401 it clears the token, re-logins, retries once, and returns data on the retry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 'tok1' } })) // initial login
      .mockResolvedValueOnce(jsonResponse({ code: 401, message: 'unauthorized' })) // first request -> 401
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 'tok2' } })) // re-login
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { ok: true } })); // retried request

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    const result = await client.get('/x');

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result).toEqual({ ok: true });

    const [, lastInit] = fetchMock.mock.calls[3];
    expect(lastInit.headers.Authorization).toBe('tok2');
  });

  it('throws when a second consecutive 401 happens after the retry', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 'tok1' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 401, message: 'unauthorized' }))
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 'tok2' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 401, message: 'unauthorized' }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    await expect(client.get('/x')).rejects.toThrow('cloud-mail 401: unauthorized');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws an Error containing "cloud-mail <code>: <message>" for any other non-200 code', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: 200, message: 'success', data: { token: 't' } }))
      .mockResolvedValueOnce(jsonResponse({ code: 500, message: 'internal error' }));

    const client = new CloudMailClient('https://example.com', 'u', 'p');
    await expect(client.get('/x')).rejects.toThrow('cloud-mail 500: internal error');
  });
});
