// Per-account Stalwart mirror orchestration.
// Cloud-mail D1 stays canonical: a successful import never deletes local mail.
// Raw RFC 5322 is kept in the existing R2/KV binding, not in the mail D1 table.

import orm from '../entity/orm';
import { account } from '../entity/account';
import { eq } from 'drizzle-orm';
import { isDel } from '../const/entity-const';
import { getConfig, mirrorRaw, probe, isRetryable } from './jmap';

const MAX_ATTEMPTS = 50;
// A claimed row whose invocation was killed must become eligible again. The
// hourly cron and a 5-minute margin keep this well above the longest drain.
const STALE_CLAIM_MS = 10 * 60 * 1000;
// Authentication failures are usually a bad/rotated token, but a short burst
// can be transient. Retry them a few times before dropping the queue payload.
const AUTH_ATTEMPT_LIMIT = 3;
// ctx.waitUntil() may extend an invocation by only 30 s. Bound the mirror so
// the catch path always gets a chance to enqueue before the runtime cancels it.
const MIRROR_BUDGET_MS = 25 * 1000;
// Free-tier Workers allow 50 subrequests per invocation and the cron already
// runs other maintenance. Keep each drain small enough to stay under it.
const BATCH = 3;
// One manual retry per account per minute; KV TTL makes the window self-cleaning.
const RETRY_COOLDOWN_MS = 60 * 1000;
const RETRY_KEY_PREFIX = 'stalwart:retry:';

function isAuthError(error) {
	return [401, 403].includes(Number(error?.status));
}

function backoffMs(attempts) {
	if (attempts <= 0) return 0;
	return Math.min(60000 * Math.pow(2, attempts - 1), 30 * 60 * 1000);
}

export function isEnabled(accountRow) {
	if (!accountRow || Number(accountRow.isDel ?? accountRow.is_del) !== isDel.NORMAL) return false;
	const enabled = Number(accountRow.stalwart_enabled ?? accountRow.stalwartEnabled) === 1;
	return enabled
		&& !!(accountRow.stalwart_url || accountRow.stalwartUrl)
		&& !!(accountRow.stalwart_token || accountRow.stalwartToken);
}

// Raw payload storage: use the already-bound R2 bucket, or KV if R2 is absent.
// The queue keeps only a small reference string in D1.
function rawKey(emailId) {
	return `stalwart/queue/${Number(emailId)}`;
}

function rawRef(env, emailId) {
	if (env?.r2) return `r2:${rawKey(emailId)}`;
	if (env?.kv) return `kv:${rawKey(emailId)}`;
	return '';
}

async function storeRaw(env, emailId, raw) {
	const ref = rawRef(env, emailId);
	if (!ref) throw new Error('No R2/KV binding available for the Stalwart queue');
	const key = rawKey(emailId);
	if (ref.startsWith('r2:')) await env.r2.put(key, String(raw || ''));
	else await env.kv.put(key, String(raw || ''));
	return ref;
}

async function loadRaw(env, stored) {
	const value = String(stored || '');
	if (value.startsWith('r2:')) {
		const object = await env.r2.get(value.slice(3));
		return object ? await object.text() : '';
	}
	if (value.startsWith('kv:')) return (await env.kv.get(value.slice(3))) || '';
	return value; // legacy inline payload
}

async function dropRaw(env, stored) {
	const value = String(stored || '');
	try {
		if (value.startsWith('r2:')) await env.r2.delete(value.slice(3));
		else if (value.startsWith('kv:')) await env.kv.delete(value.slice(3));
	} catch {}
}

async function enqueue(env, { emailId, accountId, raw, attempts = 0, error = '', receivedAt = '' }) {
	await env.db.prepare(
		`INSERT INTO stalwart_queue (email_id, account_id, raw, attempts, next_at, last_error, state, received_at, created_time)
		 VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(email_id) DO UPDATE SET
		   account_id = excluded.account_id,
		   raw = excluded.raw,
		   attempts = excluded.attempts,
		   next_at = excluded.next_at,
		   last_error = excluded.last_error,
		   received_at = excluded.received_at,
		   state = excluded.state`
	).bind(
		emailId,
		accountId,
		String(raw || ''),
		attempts,
		Date.now() + backoffMs(attempts),
		String(error || '').slice(0, 500),
		String(receivedAt || '').slice(0, 64)
	).run();
}

// Re-queue an existing row after a transient failure without touching its raw
// payload. Also used to release a claimed row back to 'pending'.
async function release(env, emailId, attempts, error) {
	try {
		await env.db.prepare(
			`UPDATE stalwart_queue SET state = 'pending', claimed_at = 0, attempts = ?, next_at = ?, last_error = ? WHERE email_id = ?`
		).bind(
			attempts,
			Date.now() + backoffMs(attempts),
			String(error || '').slice(0, 500),
			emailId
		).run();
	} catch (e) {
		console.error('stalwart queue release failed', emailId, e?.message || e);
	}
}

// Returns true only when the queue row is gone. The raw payload is dropped
// AFTER that is confirmed, so a failed D1 delete cannot orphan an in-flight
// message. A successful delete with zero changes still cleans up stray raw.
async function dequeue(env, emailId, raw) {
	try {
		await env.db.prepare('DELETE FROM stalwart_queue WHERE email_id = ?').bind(emailId).run();
	} catch (error) {
		console.warn('stalwart queue delete failed', emailId, error?.message || error);
		return false;
	}
	await dropRaw(env, raw);
	return true;
}

async function resetStaleClaims(env) {
	try {
		await env.db.prepare(
			`UPDATE stalwart_queue SET state = 'pending', claimed_at = 0
			 WHERE state = 'processing' AND (claimed_at = 0 OR claimed_at < ?)`
		).bind(Date.now() - STALE_CLAIM_MS).run();
	} catch (error) {
		console.warn('stalwart stale claim reset failed', error?.message || error);
	}
}

export async function mirrorIncoming({ env, account: accountRow, emailId, raw, receivedAt }) {
	if (!isEnabled(accountRow)) return { state: 'skipped' };
	const config = await getConfig(accountRow, env);
	if (!config.configured) return { state: 'skipped' };
	try {
		const result = await mirrorRaw(config, raw, receivedAt, AbortSignal.timeout(MIRROR_BUDGET_MS));
		return { state: 'stored', id: result.id };
	} catch (error) {
		if (!isRetryable(error) && !isAuthError(error)) return { state: 'failed', error: error?.message || String(error) };
		try {
			const ref = await storeRaw(env, emailId, raw);
			await enqueue(env, {
				emailId,
				accountId: accountRow.accountId,
				raw: ref,
				error: error?.message || error,
				receivedAt
			});
			return { state: 'pending' };
		} catch (queueError) {
			return { state: 'failed', error: queueError?.message || String(queueError) };
		}
	}
}

export async function processPending({ env, accountId } = {}) {
	if (!env?.db) return { processed: 0 };
	await resetStaleClaims(env);
	let rows;
	try {
		// Always respect backoff, including on manual retry.
		const sql = accountId
			? 'SELECT email_id, account_id, raw, attempts, received_at FROM stalwart_queue WHERE account_id = ? AND next_at <= ? ORDER BY created_time ASC LIMIT ?'
			: 'SELECT email_id, account_id, raw, attempts, received_at FROM stalwart_queue WHERE next_at <= ? ORDER BY created_time ASC LIMIT ?';
		const statement = env.db.prepare(sql);
		const result = accountId
			? await statement.bind(accountId, Date.now(), BATCH).all()
			: await statement.bind(Date.now(), BATCH).all();
		rows = result?.results || [];
	} catch (error) {
		console.warn('stalwart queue read failed', error?.message || error);
		return { processed: 0 };
	}
	if (!rows.length) return { processed: 0 };

	// One D1 query for all accounts instead of one per row.
	const ids = [...new Set(rows.map(row => Number(row.account_id)).filter(Boolean))];
	const accountMap = new Map();
	if (ids.length) {
		try {
			const placeholders = ids.map(() => '?').join(',');
			const found = await env.db.prepare(
				`SELECT account_id, stalwart_enabled, stalwart_url, stalwart_token, is_del FROM account WHERE account_id IN (${placeholders})`
			).bind(...ids).all();
			for (const row of found?.results || []) accountMap.set(Number(row.account_id), row);
		} catch (error) {
			console.warn('stalwart account lookup failed', error?.message || error);
		}
	}

	let processed = 0;
	for (const row of rows) {
		const emailId = Number(row.email_id);
		const rowAccountId = Number(row.account_id);
		const attempts = Number(row.attempts || 0) + 1;
		try {
			// Claim the row so the cron and a manual retry cannot both mirror it.
			const claim = await env.db.prepare(
				`UPDATE stalwart_queue SET state = 'processing', claimed_at = ? WHERE email_id = ? AND state = 'pending'`
			).bind(Date.now(), emailId).run();
			if (!claim?.meta?.changes) continue;

			const accountRow = accountMap.get(rowAccountId);
			if (!accountRow || !isEnabled(accountRow)) {
				await dequeue(env, emailId, row.raw);
				continue;
			}

			const config = await getConfig(accountRow, env);
			if (!config.configured) {
				// Keep the payload: the token may just be undecryptable after a
				// jwt_secret rotation, which is recoverable.
				if (attempts < MAX_ATTEMPTS) await release(env, emailId, attempts, 'account not configured');
				else await dequeue(env, emailId, row.raw);
				continue;
			}

			try {
				const raw = await loadRaw(env, row.raw);
				if (!raw) {
					// The payload is gone; retrying would upload an empty message.
					await dequeue(env, emailId, row.raw);
					continue;
				}
				await mirrorRaw(config, raw, row.received_at || '', AbortSignal.timeout(MIRROR_BUDGET_MS));
				if (!(await dequeue(env, emailId, row.raw))) {
					// The import succeeded but D1 still has the row. Keep the raw
					// payload and retry; at-least-once beats a silent mirror loss.
					await release(env, emailId, attempts, 'imported but queue delete failed');
					continue;
				}
				processed++;
			} catch (error) {
				const permanent = !isRetryable(error) && !isAuthError(error);
				const authExhausted = isAuthError(error) && attempts >= AUTH_ATTEMPT_LIMIT;
				if (!permanent && !authExhausted && attempts < MAX_ATTEMPTS) {
					await release(env, emailId, attempts, error?.message || error);
				} else {
					await dequeue(env, emailId, row.raw);
				}
			}
		} catch (error) {
			console.error('stalwart queue item failed', emailId, error?.message || error);
			// Unknown/runtime errors are transient: leave the row for a later run.
			if (attempts < MAX_ATTEMPTS) await release(env, emailId, attempts, error?.message || error);
		}
	}
	return { processed };
}

// Manual retry: liveness first, then drain only eligible pending rows.
export async function retryPending({ env, ctx, accountId }) {
	const accountRow = await orm({ env }).select().from(account).where(eq(account.accountId, Number(accountId))).get();
	if (!accountRow) return { online: false, reason: 'account not found' };

	// Throttle before probing so a stuck "Retry" button cannot hammer the
	// tunnel or burn the shared subrequest budget. KV is optional.
	const retryKey = `${RETRY_KEY_PREFIX}${Number(accountId)}`;
	if (env?.kv) {
		try {
			const last = await env.kv.get(retryKey, { type: 'json' });
			if (last?.at && Date.now() - Number(last.at) < RETRY_COOLDOWN_MS) {
				return { online: false, reason: 'retry too soon' };
			}
		} catch {}
		try {
			await env.kv.put(retryKey, JSON.stringify({ at: Date.now() }), { expirationTtl: 60 });
		} catch {}
	}

	const config = await getConfig(accountRow, env);
	const liveness = await probe(config);
	if (!liveness.online) return liveness;
	const result = await processPending({ env, ctx, accountId: Number(accountId) });
	return { ...liveness, ...result };
}
