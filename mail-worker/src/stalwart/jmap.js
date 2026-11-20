// Minimal JMAP client for one Stalwart account behind the jadmin tunnel.
// Uses the narrow per-account Bearer API token and never rewrites discovery.
// Endpoint paths are built from the configured public URL only.

import { openToken, secretKeyFromEnv } from './crypto';

const TIMEOUT = 15000;
const WS_TIMEOUT = 8000;
const USING_MAIL = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'];

function normalize(raw) {
	let value = String(raw || '').trim();
	if (!value) return '';
	if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
	return value.replace(/\/+$/, '');
}

function blockedHost(hostname) {
	const host = String(hostname || '').toLowerCase();
	if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
	if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('::ffff:')) return true;
	const parts = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!parts) return false;
	const [a, b] = [Number(parts[1]), Number(parts[2])];
	return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export function validateBaseUrl(raw) {
	const url = normalize(raw);
	if (!url) return { ok: false, error: 'Empty URL' };
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, error: 'Invalid URL' };
	}
	if (parsed.protocol !== 'https:') return { ok: false, error: 'Only https URLs are allowed' };
	if (blockedHost(parsed.hostname)) return { ok: false, error: 'Host not allowed' };
	return { ok: true, url: parsed.origin + parsed.pathname.replace(/\/+$/, ''), origin: parsed.origin };
}

export async function getConfig(account, env) {
	const url = String(account?.stalwart_url || account?.stalwartUrl || '').trim();
	const validation = validateBaseUrl(url);
	const token = await openToken(
		String(account?.stalwart_token || account?.stalwartToken || ''),
		secretKeyFromEnv(env),
		account?.accountId
	);
	const enabled = Number(account?.stalwart_enabled ?? account?.stalwartEnabled) === 1;
	return {
		enabled,
		url: validation.ok ? validation.url : '',
		origin: validation.ok ? validation.origin : '',
		token,
		configured: enabled && validation.ok && !!token,
		validationError: validation.error || ''
	};
}

export function isRetryable(err) {
	if (!err) return true;
	if (err.retryable === true) return true;
	if (err.retryable === false) return false;
	if (err.status >= 500 || err.status === 429 || err.status === 408) return true;
	if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
	if (err instanceof TypeError) return true;
	const message = String(err.message || '').toLowerCase();
	return ['network', 'fetch failed', 'timeout', 'econn', 'socket', 'dns'].some(word => message.includes(word));
}

function headers(config) {
	return { Authorization: `Bearer ${config.token}` };
}

async function fetchJson(url, options = {}) {
	const response = await fetch(url, {
		...options,
		signal: options.signal || AbortSignal.timeout(TIMEOUT)
	});
	const text = await response.text();
	let body = null;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = null;
	}
	if (!response.ok) {
		const error = new Error(body?.detail || body?.message || text || `HTTP ${response.status}`);
		error.status = response.status;
		error.retryable = isRetryable({ status: response.status });
		throw error;
	}
	return body;
}

async function readSession(config) {
	let session;
	try {
		session = await fetchJson(`${config.url}/jmap/session`, { headers: headers(config) });
	} catch (error) {
		if (error.status !== 404) throw error;
		session = await fetchJson(`${config.url}/.well-known/jmap`, { headers: headers(config) });
	}
	const accountId = session?.primaryAccounts?.['urn:ietf:params:jmap:mail']
		|| Object.keys(session?.accounts || {})[0];
	if (!accountId) {
		const error = new Error('Stalwart session has no mail account');
		error.retryable = false;
		throw error;
	}
	return { session, accountId };
}

async function call(config, accountId, using, methodCalls) {
	return fetchJson(`${config.url}/jmap/`, {
		method: 'POST',
		headers: { ...headers(config), 'Content-Type': 'application/json' },
		body: JSON.stringify({ using, methodCalls })
	});
}

async function findInbox(config, accountId) {
	const body = await call(config, accountId, USING_MAIL, [
		['Mailbox/query', { accountId, filter: { role: 'inbox' } }, '0'],
		['Mailbox/get', { accountId, '#ids': { resultOf: '0', name: 'Mailbox/query', path: '/ids' } }, '1']
	]);
	for (const response of body?.methodResponses || []) {
		if (response[0] === 'error') {
			const error = new Error(response[1]?.description || response[1]?.type || 'JMAP method error');
			error.retryable = false;
			throw error;
		}
	}
	const get = (body?.methodResponses || []).find(response => response[0] === 'Mailbox/get');
	const inboxId = get?.[1]?.list?.[0]?.id || body?.methodResponses?.[0]?.[1]?.ids?.[0];
	if (!inboxId) {
		const error = new Error('Stalwart inbox not found');
		error.retryable = false;
		throw error;
	}
	return inboxId;
}

async function uploadRaw(config, accountId, raw) {
	const response = await fetch(`${config.url}/jmap/upload/${encodeURIComponent(accountId)}`, {
		method: 'POST',
		headers: { ...headers(config), 'Content-Type': 'message/rfc822' },
		body: raw,
		signal: AbortSignal.timeout(TIMEOUT)
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		const error = new Error(text || `Upload HTTP ${response.status}`);
		error.status = response.status;
		error.retryable = isRetryable({ status: response.status });
		throw error;
	}
	const body = await response.json();
	if (!body?.blobId) {
		const error = new Error('Stalwart upload returned no blobId');
		error.retryable = true;
		throw error;
	}
	return body.blobId;
}

async function importBlob(config, accountId, blobId, mailboxId, receivedAt) {
	const body = await call(config, accountId, USING_MAIL, [
		['Email/import', {
			accountId,
			emails: {
				incoming: {
					blobId,
					mailboxIds: { [mailboxId]: true },
					keywords: { $seen: false },
					receivedAt: receivedAt || new Date().toISOString()
				}
			}
		}, 'import']
	]);
	const response = (body?.methodResponses || [])[0];
	if (!response) {
		const error = new Error('Empty Email/import response');
		error.retryable = true;
		throw error;
	}
	if (response[0] === 'error') {
		const error = new Error(response[1]?.description || response[1]?.type || 'Email/import failed');
		error.retryable = false;
		throw error;
	}
	const created = response[1]?.created?.incoming;
	const notCreated = response[1]?.notCreated?.incoming;
	if (notCreated) {
		const error = new Error(notCreated.description || notCreated.type || 'Email/import rejected');
		error.retryable = ['overQuota', 'serverFail', 'rateLimit'].includes(notCreated.type);
		throw error;
	}
	if (!created) {
		const error = new Error('Email/import returned no created id');
		error.retryable = true;
		throw error;
	}
	return created.id || created.blobId || 'imported';
}

// Stores one raw RFC 5322 message in the account's inbox.
export async function mirrorRaw(config, raw, receivedAt) {
	if (!config.configured) {
		const error = new Error('Stalwart account is not configured');
		error.retryable = false;
		throw error;
	}
	const { session, accountId } = await readSession(config);
	const capabilities = Object.keys(session?.accountCapabilities || session?.capabilities || {});
	if (!capabilities.includes('urn:ietf:params:jmap:mail')) {
		const error = new Error('Stalwart account has no mail capability');
		error.retryable = false;
		throw error;
	}
	const mailboxId = await findInbox(config, accountId);
	const blobId = await uploadRaw(config, accountId, raw);
	const id = await importBlob(config, accountId, blobId, mailboxId, receivedAt);
	return { id, accountId };
}

// Liveness signal used before a manual queue drain. A short authenticated
// WebSocket upgrade proves the tunnel, TLS, token and JMAP websocket endpoint
// are all alive without keeping a socket open (free-tier friendly).
export async function probe(config) {
	if (!config.configured) return { online: false, reason: 'not configured' };
	try {
		const { session, accountId } = await readSession(config);
		const websocket = session?.capabilities?.['urn:ietf:params:jmap:websocket']
			|| session?.accountCapabilities?.['urn:ietf:params:jmap:websocket'];
		if (!websocket) return { online: false, reason: 'websocket capability unavailable', accountId };
		const wsUrl = `${config.origin.replace(/^http/, 'ws')}/jmap/ws`;
		const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
		const response = await fetch(wsUrl, {
			headers: {
				Authorization: `Bearer ${config.token}`,
				Connection: 'Upgrade',
				Upgrade: 'websocket',
				'Sec-WebSocket-Key': key,
				'Sec-WebSocket-Version': '13',
				'Sec-WebSocket-Protocol': 'jmap'
			},
			signal: AbortSignal.timeout(WS_TIMEOUT)
		});
		if (response.status !== 101) {
			return { online: false, reason: `websocket upgrade HTTP ${response.status}`, accountId };
		}
		try { response.webSocket?.close(); } catch {}
		return { online: true, accountId };
	} catch (error) {
		return { online: false, reason: error?.message || String(error) };
	}
}
