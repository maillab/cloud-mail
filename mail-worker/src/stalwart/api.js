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
		error: config.validationError
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

	let token = String(row.stalwart_token || row.stalwartToken || '');
	if (Object.prototype.hasOwnProperty.call(body, 'token')) {
		const plain = String(body.token || '').trim();
		token = plain ? await sealToken(plain, secretKeyFromEnv(c.env), accountId) : '';
	}

	await orm(c).update(account).set({
		stalwartEnabled: enabled,
		stalwartUrl: url,
		stalwartToken: token
	}).where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();

	return c.json(result.ok({ enabled: !!enabled, configured: !!(url && token), url, hasToken: !!token }));
});

app.post('/account/stalwart/retry', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const row = await ownedAccount(c, body.accountId, userId);
	if (!row) return c.json(result.fail('Not found', 404));
	const outcome = await retryPending({ env: c.env, ctx: c.executionCtx, accountId: row.accountId });
	return c.json(result.ok(outcome));
});
