// Per-account Stalwart settings and manual retry endpoints.
// The API token is write-only: reads return only hasToken.

import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import orm from '../entity/orm';
import { account } from '../entity/account';
import { and, eq } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import { validateBaseUrl, getConfig } from './jmap';
import { sealToken, secretKeyFromEnv } from './crypto';
import { retryPending } from './delivery';

async function ownedAccount(c, accountId, userId) {
	const ormClient = orm(c);
	return ormClient.select().from(account).where(and(
		eq(account.accountId, Number(accountId)),
		eq(account.userId, userId),
		eq(account.isDel, isDel.NORMAL)
	)).get();
}

// A blank token field means "keep the stored token", not "clear it". The UI
// shows a write-only placeholder after a token has been saved, so an ordinary
// save would otherwise silently wipe the sealed credential. Explicit clearing
// requires clearToken: true.
export function resolveTokenUpdate(body, storedToken) {
	const current = String(storedToken || '');
	if (body?.clearToken === true) return { action: 'clear', token: '' };
	const hasField = Object.prototype.hasOwnProperty.call(body || {}, 'token');
	const plain = hasField ? String(body.token ?? '').trim() : '';
	if (!plain) return { action: 'keep', token: current };
	return { action: 'replace', plain, token: current };
}

// The webmail URL is public deployment config, not a credential. The static
// client signs in with a normal Stalwart account, so the link is shown to every
// account and is independent of the per-account mirror token.
export function webmailUrlFor(c) {
	const raw = String(c?.env?.stalwart_webmail_url || '').trim();
	if (!raw) return '';
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' ? url.toString() : '';
	} catch {
		return '';
	}
}

async function pendingCount(env, accountId) {
	try {
		const result = await env.db.prepare(
			'SELECT COUNT(*) AS n FROM stalwart_queue WHERE account_id = ?'
		).bind(Number(accountId)).all();
		return Number(result?.results?.[0]?.n || 0);
	} catch {
		return 0;
	}
}

app.get('/account/stalwart', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await ownedAccount(c, c.req.query('accountId'), userId);
	if (!row) return c.json(result.ok(null));
	const config = await getConfig(row, c.env);
	return c.json(result.ok({
		enabled: config.enabled,
		configured: config.configured,
		url: config.url,
		hasToken: !!config.token,
		webmailUrl: webmailUrlFor(c),
		error: config.validationError,
		pending: await pendingCount(c.env, row.accountId),
		rawStore: c.env?.r2 ? 'r2' : c.env?.kv ? 'kv' : 'none'
	}));
});

app.put('/account/stalwart', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const accountId = Number(body.accountId);
	const row = await ownedAccount(c, accountId, userId);
	if (!row) return c.json(result.fail('Not found', 404));

	const enabled = body.enabled ? 1 : 0;
	const rawUrl = String(body.url || '').trim();
	let url = '';
	if (rawUrl) {
		const validation = validateBaseUrl(rawUrl);
		if (!validation.ok) return c.json(result.fail(validation.error || 'Invalid URL', 400));
		url = validation.url;
	}
	if (enabled && (!url || !(body.token || row.stalwart_token || row.stalwartToken))) {
		return c.json(result.fail('URL and API token are required when enabled', 400));
	}

	const tokenUpdate = resolveTokenUpdate(body, row.stalwart_token || row.stalwartToken || '');
	let token = tokenUpdate.token;
	if (tokenUpdate.action === 'replace') {
		token = await sealToken(tokenUpdate.plain, secretKeyFromEnv(c.env), accountId);
	}

	await orm(c).update(account).set({
		stalwartEnabled: enabled,
		stalwartUrl: url,
		stalwartToken: token
	}).where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();

	return c.json(result.ok({
		enabled: !!enabled,
		configured: !!(url && token),
		url,
		hasToken: !!token,
		webmailUrl: webmailUrlFor(c),
		pending: await pendingCount(c.env, accountId)
	}));
});

app.post('/account/stalwart/retry', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const row = await ownedAccount(c, body.accountId, userId);
	if (!row) return c.json(result.fail('Not found', 404));
	const outcome = await retryPending({ env: c.env, ctx: c.executionCtx, accountId: row.accountId });
	return c.json(result.ok({ ...outcome, pending: await pendingCount(c.env, row.accountId) }));
});
