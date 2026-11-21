import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateBaseUrl, isRetryable, mirrorRaw, probe } from '../../src/stalwart/jmap';

const config = (token = 'API_TOKEN') => ({
	enabled: true,
	url: 'https://jadmin.example.com',
	origin: 'https://jadmin.example.com',
	token,
	configured: true
});

function json(body, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('JMAP base URL validation', () => {
	it('accepts the public tunnel URL', () => {
		const result = validateBaseUrl(' https://jadmin.example.com/ ');
		expect(result.ok).toBe(true);
		expect(result.url).toBe('https://jadmin.example.com');
	});

	it('rejects http, localhost and private addresses', () => {
		for (const value of ['http://jadmin.example.com', 'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1']) {
			expect(validateBaseUrl(value).ok).toBe(false);
		}
	});
});

describe('retry classification', () => {
	it('classifies network and 5xx errors as retryable', () => {
		expect(isRetryable({ status: 503 })).toBe(true);
		expect(isRetryable({ status: 429 })).toBe(true);
		expect(isRetryable(new TypeError('fetch failed'))).toBe(true);
	});

	it('classifies 401 and bad requests as permanent', () => {
		expect(isRetryable({ status: 401, retryable: false })).toBe(false);
		expect(isRetryable(new Error('Invalid blob id'))).toBe(false);
	});
});

describe('mirrorRaw', () => {
	it('authenticates with Bearer, resolves inbox and imports the uploaded blob', async () => {
		const calls = [];
		const fetchMock = vi.fn(async (url, options = {}) => {
			calls.push({ url: String(url), options });
			if (String(url).endsWith('/jmap/session')) {
				return json({
					primaryAccounts: { 'urn:ietf:params:jmap:mail': 'b' },
					accountCapabilities: { 'urn:ietf:params:jmap:mail': {} },
					capabilities: { 'urn:ietf:params:jmap:websocket': {} }
				});
			}
			if (String(url).endsWith('/jmap/upload/b')) return json({ blobId: 'real-blob-id' });
			if (String(url).endsWith('/jmap/')) {
				if (options.body?.includes('Mailbox/query')) {
					return json({ methodResponses: [
						['Mailbox/query', { accountId: 'b', ids: ['a'] }, '0'],
						['Mailbox/get', { accountId: 'b', list: [{ id: 'a', role: 'inbox' }] }, '1']
					] });
				}
				return json({ methodResponses: [['Email/import', { created: { incoming: { id: 'email-1' } } }, 'import']] });
			}
			throw new Error(`unexpected URL ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await mirrorRaw(config(), 'From: a@b\n\ntest', '2026-11-20T00:00:00Z');
		expect(result).toEqual({ id: 'email-1', accountId: 'b' });
		expect(calls[0].options.headers.Authorization).toBe('Bearer API_TOKEN');
		expect(calls.some(call => call.url.includes('/jmap/upload/b'))).toBe(true);
		const importCall = calls.find(call => call.options.body?.includes('Email/import'));
		expect(importCall.options.body).toContain('real-blob-id');
		expect(importCall.options.body).toContain('"accountId":"b"');
	});
});

describe('probe', () => {
	it('checks websocket capability and completes a short upgrade', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
			if (String(url).endsWith('/jmap/session')) {
				return json({
					primaryAccounts: { 'urn:ietf:params:jmap:mail': 'b' },
					capabilities: { 'urn:ietf:params:jmap:websocket': {} }
				});
			}
			// Workers' fetch-based upgrade uses an https URL, not wss.
			expect(String(url)).toBe('https://jadmin.example.com/jmap/ws');
			expect(options.headers.Authorization).toBe('Bearer API_TOKEN');
			expect(options.headers.Upgrade).toBe('websocket');
			expect(options.headers['Sec-WebSocket-Protocol']).toBe('jmap');
			expect(options.headers.Connection).toBeUndefined();
			expect(options.headers['Sec-WebSocket-Key']).toBeUndefined();
			return { status: 101, webSocket: { accept() {}, close() {} } };
		}));
		expect(await probe(config())).toEqual({ online: true, accountId: 'b' });
	});

	it('reports offline when the upgrade returns no websocket', async () => {
		vi.stubGlobal('fetch', vi.fn(async (url) => {
			if (String(url).endsWith('/jmap/session')) {
				return json({
					primaryAccounts: { 'urn:ietf:params:jmap:mail': 'b' },
					capabilities: { 'urn:ietf:params:jmap:websocket': {} }
				});
			}
			return { status: 101 };
		}));
		const result = await probe(config());
		expect(result.online).toBe(false);
		expect(result.reason).toContain('101');
	});

	it('reports offline when the websocket capability is missing', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => json({
			primaryAccounts: { 'urn:ietf:params:jmap:mail': 'b' },
			capabilities: {}
		})));
		const result = await probe(config());
		expect(result.online).toBe(false);
		expect(result.reason).toContain('websocket');
	});
});
