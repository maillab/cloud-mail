import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/stalwart/jmap', () => ({
	getConfig: vi.fn(async () => ({ configured: true, token: 'API_TOKEN', url: 'https://jadmin.example.com' })),
	mirrorRaw: vi.fn(async () => ({ id: 'stalwart-1', accountId: 'b' })),
	probe: vi.fn(async () => ({ online: true })),
	isRetryable: vi.fn(() => true)
}));

const { mockAccountRow } = vi.hoisted(() => ({
	mockAccountRow: { account_id: 1, stalwart_enabled: 1, stalwart_url: 'https://jadmin.example.com', stalwart_token: 'x' }
}));
vi.mock('../../src/entity/orm', () => ({
	default: () => ({
		select: () => ({ from: () => ({ where: () => ({ get: async () => mockAccountRow }) }) })
	})
}));

import { processPending, isEnabled, retryPending } from '../../src/stalwart/delivery';
import { getConfig, mirrorRaw, probe } from '../../src/stalwart/jmap';

function makeEnv({ queueRows = [], accountRows = [], claim = true, deleteFail = false } = {}) {
	const calls = [];
	const db = {
		prepare(sql) {
			const statement = {
				bind(...args) {
					return {
						async all() {
							calls.push({ sql, args });
							if (sql.startsWith('SELECT email_id')) return { results: queueRows };
							if (sql.startsWith('SELECT account_id')) return { results: accountRows };
							if (sql.startsWith('UPDATE stalwart_queue SET state')) {
								return { results: claim ? [{ email_id: args[0] }] : [] };
							}
							return { results: [] };
						},
						async run() {
							calls.push({ sql, args });
							if (sql.startsWith('DELETE FROM stalwart_queue') && deleteFail) {
								throw new Error('D1_ERROR: delete failed');
							}
							if (sql.startsWith('UPDATE stalwart_queue SET state')) {
								return { success: true, meta: { changes: sql.includes("'processing'") && claim ? 1 : 0 } };
							}
							return { success: true, meta: { changes: 0 } };
						}
					};
				}
			};
			return statement;
		}
	};
	const store = new Map();
	// Seed KV-backed queue rows with a raw MIME payload, as the real enqueue does.
	for (const row of queueRows) {
		const ref = String(row.raw || '');
		if (ref.startsWith('kv:')) store.set(ref.slice(3), 'RAW MIME');
	}
	const kv = {
		async put(key, value) { store.set(key, value); },
		async get(key, options) {
			if (!store.has(key)) return null;
			const value = store.get(key);
			return options?.type === 'json' ? JSON.parse(value) : value;
		},
		async delete(key) { store.delete(key); }
	};
	return { env: { db, kv }, calls, store };
}

const accountRow = {
	account_id: 1,
	is_del: 0,
	stalwart_enabled: 1,
	stalwart_url: 'https://jadmin.example.com',
	stalwart_token: 'stal:v2:sealed'
};
const queueRow = {
	email_id: 42,
	account_id: 1,
	raw: 'kv:stalwart/queue/42',
	attempts: 0,
	received_at: '2026-11-20T00:00:00Z'
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('isEnabled', () => {
	it('ignores soft-deleted accounts', () => {
		expect(isEnabled(accountRow)).toBe(true);
		expect(isEnabled({ ...accountRow, is_del: 1 })).toBe(false);
	});
});

describe('processPending', () => {
	it('respects backoff and claims rows before mirroring', async () => {
		const { env, calls } = makeEnv({ queueRows: [queueRow], accountRows: [accountRow] });
		const result = await processPending({ env });
		expect(result.processed).toBe(1);
		expect(calls.some(call => call.sql.includes('next_at <= ?'))).toBe(true);
		expect(calls.some(call => call.sql.includes("state = 'processing'"))).toBe(true);
		expect(mirrorRaw).toHaveBeenCalledWith(
			expect.anything(), 'RAW MIME', '2026-11-20T00:00:00Z', expect.anything()
		);
	});

	it('does not mirror a row claimed by another invocation', async () => {
		const { env } = makeEnv({ queueRows: [queueRow], accountRows: [accountRow], claim: false });
		const result = await processPending({ env });
		expect(result.processed).toBe(0);
		expect(mirrorRaw).not.toHaveBeenCalled();
	});

	it('loads queued raw MIME from R2 through text()', async () => {
		const r2 = {
			put: vi.fn(async () => {}),
			get: vi.fn(async () => ({ text: async () => 'RAW MIME' })),
			delete: vi.fn(async () => {}),
		};
		const { env } = makeEnv({
			queueRows: [{ ...queueRow, raw: 'r2:stalwart/queue/42' }],
			accountRows: [accountRow],
		});
		env.r2 = r2;
		const result = await processPending({ env });
		expect(result.processed).toBe(1);
		expect(r2.get).toHaveBeenCalledWith('stalwart/queue/42');
		expect(mirrorRaw).toHaveBeenCalledWith(
			expect.anything(), 'RAW MIME', '2026-11-20T00:00:00Z', expect.anything()
		);
	});

	it('keeps the queue row when the account token cannot be decrypted', async () => {
		const { env, calls } = makeEnv({ queueRows: [queueRow], accountRows: [accountRow] });
		vi.mocked(getConfig).mockResolvedValueOnce({ configured: false, token: '', url: '' });
		const result = await processPending({ env });
		expect(result.processed).toBe(0);
		expect(mirrorRaw).not.toHaveBeenCalled();
		expect(calls.some(call => call.sql.startsWith('UPDATE stalwart_queue SET state = \'pending\''))).toBe(true);
		expect(calls.some(call => call.sql.startsWith('DELETE FROM stalwart_queue'))).toBe(false);
	});

	it('resets stale processing claims before selecting rows', async () => {
		const { env, calls } = makeEnv({ queueRows: [queueRow], accountRows: [accountRow] });
		await processPending({ env });
		expect(calls.some(call =>
			call.sql.includes("state = 'processing'") && call.sql.includes('claimed_at = 0')
		)).toBe(true);
	});

	it('retries transient auth failures instead of dropping the raw payload', async () => {
		const { env, calls, store } = makeEnv({ queueRows: [queueRow], accountRows: [accountRow] });
		vi.mocked(mirrorRaw).mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
		const result = await processPending({ env });
		expect(result.processed).toBe(0);
		expect(calls.some(call => call.sql.startsWith('DELETE FROM stalwart_queue'))).toBe(false);
		expect(store.has('stalwart/queue/42')).toBe(true);
		expect(calls.some(call =>
			call.sql.startsWith("UPDATE stalwart_queue SET state = 'pending'") && call.sql.includes('attempts = ?')
		)).toBe(true);
	});

	it('keeps the row and raw payload when the queue DELETE fails', async () => {
		const { env, calls, store } = makeEnv({
			queueRows: [queueRow], accountRows: [accountRow], deleteFail: true
		});
		const result = await processPending({ env });
		expect(result.processed).toBe(0);
		expect(store.has('stalwart/queue/42')).toBe(true);
		expect(calls.some(call =>
			call.sql.startsWith("UPDATE stalwart_queue SET state = 'pending'") && call.sql.includes('attempts = ?')
		)).toBe(true);
	});

	it('drops a row whose raw payload is missing', async () => {
		const { env, calls } = makeEnv({ queueRows: [queueRow], accountRows: [accountRow] });
		await env.kv.delete('stalwart/queue/42');
		const result = await processPending({ env });
		expect(result.processed).toBe(0);
		expect(mirrorRaw).not.toHaveBeenCalled();
		expect(calls.some(call => call.sql.startsWith('DELETE FROM stalwart_queue'))).toBe(true);
	});
});

describe('retryPending', () => {
	it('throttles repeated manual retries for the same account', async () => {
		const { env, store } = makeEnv();
		store.set('stalwart:retry:1', JSON.stringify({ at: Date.now() }));
		const result = await retryPending({ env, accountId: 1 });
		expect(result).toEqual({ online: false, reason: 'retry too soon' });
		expect(probe).not.toHaveBeenCalled();
	});

	it('records a cooldown after a real retry', async () => {
		const { env, store } = makeEnv();
		const result = await retryPending({ env, accountId: 1 });
		expect(result.online).toBe(true);
		expect(JSON.parse(store.get('stalwart:retry:1')).at).toBeGreaterThan(0);
	});
});
