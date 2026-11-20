// Per-account Stalwart mirror orchestration.
// Cloud-mail D1 stays canonical: a successful import never deletes local mail.
// Raw RFC 5322 is captured at receive time and kept in the D1 retry queue.

import orm from '../entity/orm';
import { account } from '../entity/account';
import { eq } from 'drizzle-orm';
import { notifyStalwartStatus } from '../websocket/notify';
import { getConfig, mirrorRaw, probe, isRetryable } from './jmap';

const MAX_ATTEMPTS = 50;
const BATCH = 20;

function backoffMs(attempts) {
	if (attempts <= 0) return 0;
	return Math.min(60000 * Math.pow(2, attempts - 1), 30 * 60 * 1000);
}

function status(env, ctx, emailId, accountId, state, detail) {
	notifyStalwartStatus(env, ctx, {
		emailId,
		accountId,
		state,
		detail: String(detail || '').slice(0, 300)
	});
}

export function isEnabled(accountRow) {
	const enabled = Number(accountRow?.stalwart_enabled ?? accountRow?.stalwartEnabled) === 1;
	return enabled
		&& !!(accountRow?.stalwart_url || accountRow?.stalwartUrl)
		&& !!(accountRow?.stalwart_token || accountRow?.stalwartToken);
}

async function enqueue(env, { emailId, accountId, raw, attempts = 0, error = '' }) {
	await env.db.prepare(
		`INSERT INTO stalwart_queue (email_id, account_id, raw, attempts, next_at, last_error, state, created_time)
		 VALUES (?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
		 ON CONFLICT(email_id) DO UPDATE SET
		   account_id = excluded.account_id,
		   raw = excluded.raw,
		   attempts = excluded.attempts,
		   next_at = excluded.next_at,
		   last_error = excluded.last_error,
		   state = excluded.state`
	).bind(emailId, accountId, String(raw || ''), attempts, Date.now() + backoffMs(attempts), String(error || '').slice(0, 500)).run();
}

async function dequeue(env, emailId) {
	try {
		await env.db.prepare('DELETE FROM stalwart_queue WHERE email_id = ?').bind(emailId).run();
	} catch {}
}

export async function mirrorIncoming({ env, ctx, account: accountRow, emailId, raw, receivedAt }) {
	if (!isEnabled(accountRow)) return { state: 'skipped' };
	const config = await getConfig(accountRow, env);
	if (!config.configured) {
		status(env, ctx, emailId, accountRow.accountId, 'skipped', config.validationError || 'invalid token');
		return { state: 'skipped' };
	}
	try {
		const result = await mirrorRaw(config, raw, receivedAt);
		status(env, ctx, emailId, accountRow.accountId, 'stored', result.id);
		return { state: 'stored', id: result.id };
	} catch (error) {
		if (isRetryable(error)) {
			try {
				await enqueue(env, { emailId, accountId: accountRow.accountId, raw, error: error?.message || error });
				status(env, ctx, emailId, accountRow.accountId, 'pending', error?.message || error);
				return { state: 'pending' };
			} catch (queueError) {
				status(env, ctx, emailId, accountRow.accountId, 'failed', queueError?.message || queueError);
				return { state: 'failed' };
			}
		}
		status(env, ctx, emailId, accountRow.accountId, 'failed', error?.message || error);
		return { state: 'failed' };
	}
}

export async function processPending({ env, ctx, accountId } = {}) {
	if (!env?.db) return { processed: 0 };
	let rows;
	try {
		const sql = accountId
			? 'SELECT email_id, account_id, raw, attempts, next_at FROM stalwart_queue WHERE account_id = ? ORDER BY created_time ASC LIMIT ?'
			: 'SELECT email_id, account_id, raw, attempts, next_at FROM stalwart_queue WHERE next_at <= ? ORDER BY created_time ASC LIMIT ?';
		const statement = env.db.prepare(sql);
		const result = accountId
			? await statement.bind(accountId, BATCH).all()
			: await statement.bind(Date.now(), BATCH).all();
		rows = result?.results || [];
	} catch (error) {
		console.warn('stalwart queue read failed', error?.message || error);
		return { processed: 0 };
	}

	let processed = 0;
	for (const row of rows) {
		const emailId = Number(row.email_id);
		const rowAccountId = Number(row.account_id);
		try {
			const accountRow = await orm({ env }).select().from(account).where(eq(account.accountId, rowAccountId)).get();
			if (!accountRow) {
				await dequeue(env, emailId);
				continue;
			}
			const config = await getConfig(accountRow, env);
			if (!config.configured) {
				await dequeue(env, emailId);
				status(env, ctx, emailId, rowAccountId, 'skipped', 'account disabled');
				continue;
			}
			try {
				const result = await mirrorRaw(config, String(row.raw || ''), '');
				await dequeue(env, emailId);
				processed++;
				status(env, ctx, emailId, rowAccountId, 'stored', result.id);
			} catch (error) {
				const attempts = Number(row.attempts || 0) + 1;
				if (isRetryable(error) && attempts < MAX_ATTEMPTS) {
					await enqueue(env, {
						emailId,
						accountId: rowAccountId,
						raw: row.raw,
						attempts,
						error: error?.message || error
					});
					status(env, ctx, emailId, rowAccountId, 'retry', `attempt ${attempts}`);
				} else {
					await dequeue(env, emailId);
					status(env, ctx, emailId, rowAccountId, 'failed', error?.message || error);
				}
			}
		} catch (error) {
			console.error('stalwart queue item failed', emailId, error?.message || error);
		}
	}
	return { processed };
}

// Manual retry: check WebSocket liveness first, then drain the pending queue.
export async function retryPending({ env, ctx, accountId }) {
	const accountRow = await orm({ env }).select().from(account).where(eq(account.accountId, Number(accountId))).get();
	if (!accountRow) return { online: false, reason: 'account not found' };
	const config = await getConfig(accountRow, env);
	const liveness = await probe(config);
	if (!liveness.online) return liveness;
	const result = await processPending({ env, ctx, accountId: Number(accountId) });
	return { ...liveness, ...result };
}
