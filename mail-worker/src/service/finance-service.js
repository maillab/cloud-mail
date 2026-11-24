import BizError from '../error/biz-error';
import permService from './perm-service';
import { toCents, formatCents, percent } from '../lib/money';
import { generateInvitationToken, hashToken } from '../utils/security-crypto';

// Finance is the company's money, so every read is scoped and every write is
// audited. Balances are always derived from movements: nothing in this file
// trusts a stored balance as the truth, the stored copy is only a cache.
//
// Money is integer cents. The only conversion happens at the boundary, in
// toCents(), and the only formatting happens in money()/amount().

const db = (c) => c.env.db;

const TRANSACTION_TYPES = [
	'income', 'expense', 'funding', 'transfer', 'payment', 'fee', 'refund',
	'adjustment', 'debt_payment', 'subscription_payment', 'invoice_payment',
	'reimbursement', 'advance', 'advance_return', 'opening',
];

const DIRECTIONS = {
	income: 'in',
	expense: 'out',
	funding: 'in',
	payment: 'out',
	fee: 'out',
	refund: 'in',
	adjustment: null,
	debt_payment: 'out',
	subscription_payment: 'out',
	invoice_payment: 'in',
	reimbursement: 'out',
	advance: 'out',
	advance_return: 'in',
	opening: 'in',
};

const DEBT_STATUSES = ['open', 'partial', 'paid', 'overdue', 'disputed', 'cancelled'];
const SUBSCRIPTION_STATUSES = ['active', 'trial', 'paused', 'cancelled', 'expired'];
const INVOICE_STATUSES = ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled'];
const COMMITMENT_STATUSES = ['planned', 'approved', 'paid', 'cancelled'];

// issued  = XPass billed a customer, so the balance is money owed to us
// vendor  = a supplier billed XPass, so the balance is money we owe
// The two are never added together: one is a receivable, the other a payable.
const INVOICE_DIRECTIONS = ['issued', 'vendor'];
const INVOICE_DIRECTION_LABELS = { issued: 'Issued by XPass', vendor: 'Supplier bill' };

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const cents = (value) => {
	const parsed = typeof value === 'number' ? Math.round(value) : toCents(value);
	return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};
const intOrNull = (value) => {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const today = () => new Date().toISOString().slice(0, 10);
const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export async function permKeys(c, userId) {
	return permService.userPermKeys(c, userId);
}

export function hasPerm(keys, key) {
	return (keys || []).includes('*') || (keys || []).includes(key);
}

// Company-wide finance is a permission of its own, so a budget owner can be
// given exactly the budgets they own without being handed the whole ledger.
export function isCompanyScope(keys) {
	return hasPerm(keys, 'finance:view_all');
}

// Accounts are confidential: without company scope, a member sees only the
// accounts they were granted and the accounts they own.
export async function visibleAccountIds(c, userId, keys) {
	const { results } = await db(c).prepare(`
		SELECT account_id FROM finance_account_member WHERE user_id = ?
		UNION
		SELECT id AS account_id FROM finance_accounts WHERE owner_id = ? AND is_del = 0
	`).bind(userId, userId).all();
	const explicit = (results || []).map(row => Number(row.account_id));

	// Company-wide finance is not a skeleton key into confidential records:
	// payroll, legal and shareholder accounts need finance.view_confidential or
	// an explicit grant on top. null means "no account filter at all", which is
	// only correct when confidential records are included.
	if (hasPerm(keys, 'finance.view_confidential')) return null;

	if (!isCompanyScope(keys)) return explicit;

	const { results: rows } = await db(c)
		.prepare(`SELECT id, confidential FROM finance_accounts WHERE is_del = 0`).all();
	const out = (rows || [])
		.filter(row => !row.confidential || explicit.includes(Number(row.id)))
		.map(row => Number(row.id));
	return out;
}

export async function canViewAccount(c, userId, keys, accountId) {
	const visible = await visibleAccountIds(c, userId, keys);
	if (visible === null) return true;
	return visible.includes(Number(accountId));
}

export function assertPerm(keys, key, label = 'This action') {
	if (!hasPerm(keys, key)) throw new BizError(`${label} requires ${key}.`, 403);
}

// Some keys were seeded before the finer-grained ones existed (finance:create,
// finance:edit, finance:approve). A role built against the older key must keep
// working, so the coarse keys are accepted wherever the matching fine key is.
export function assertAnyPerm(keys, candidates, label = 'This action') {
	for (const key of candidates) {
		if (hasPerm(keys, key)) return;
	}
	throw new BizError(`${label} requires ${candidates.join(' or ')}.`, 403);
}

// ---- audit ---------------------------------------------------------------

export async function audit(c, entry) {
	await db(c).prepare(`
		INSERT INTO finance_audit
			(entity_type, entity_id, action, before_value, after_value, actor_id,
			 amount_cents, account_id, reason, source, record_label, create_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).bind(
		entry.entityType || 'finance',
		entry.entityId ?? null,
		entry.action || 'updated',
		entry.before ? JSON.stringify(entry.before) : '',
		entry.after ? JSON.stringify(entry.after) : '',
		entry.actorId ?? null,
		entry.amountCents ?? 0,
		entry.accountId ?? null,
		entry.reason || '',
		entry.source || 'finance',
		entry.recordLabel || '',
		nowStamp(),
	).run();
}

// ---- accounts ------------------------------------------------------------

const ACCOUNT_SELECT = `
	SELECT a.*,
	       a.opening_cents + COALESCE((
	           SELECT SUM(CASE WHEN t.direction = 'in'
	                        THEN t.amount_cents
	                        ELSE -(t.amount_cents + t.fee_cents) END)
	           FROM finance_transactions t
	           WHERE t.account_id = a.id AND t.status = 'posted' AND t.is_del = 0
	       ), 0) AS computed_balance_cents
	FROM finance_accounts a
`;

function withBalance(row) {
	if (!row) return null;
	return { ...row, balance_cents: Number(row.computed_balance_cents) || 0 };
}

export async function listAccounts(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:view', 'Viewing finance');
	const visible = await visibleAccountIds(c, userId, keys);
	let sql = `${ACCOUNT_SELECT} WHERE a.is_del = 0`;
	const args = [];
	if (params.status) { sql += ' AND a.status = ?'; args.push(params.status); }
	if (params.includeArchived !== '1') { /* status filter is enough */ }
	if (visible !== null) {
		if (!visible.length) return { list: [], total: 0, totalBalanceCents: 0 };
		sql += ` AND a.id IN (${visible.map(() => '?').join(',')})`;
		args.push(...visible);
	}
	sql += ' ORDER BY a.sort ASC, a.name COLLATE NOCASE ASC';
	const { results } = await db(c).prepare(sql).bind(...args).all();
	const list = (results || []).map(withBalance);
	const totalBalanceCents = list
		.filter(row => row.status === 'active')
		.reduce((sum, row) => sum + row.balance_cents, 0);
	return { list, total: list.length, totalBalanceCents, companyScope: isCompanyScope(keys) };
}

export async function getAccount(c, userId, accountId) {
	const keys = await permKeys(c, userId);
	if (!(await canViewAccount(c, userId, keys, accountId))) {
		throw new BizError('Account not found.', 404);
	}
	const row = await db(c).prepare(`${ACCOUNT_SELECT} WHERE a.id = ? AND a.is_del = 0`).bind(accountId).first();
	if (!row) throw new BizError('Account not found.', 404);
	return withBalance(row);
}

// Recomputes the cached balance from the ledger. Called after every movement so
// the cache can never disagree with the transactions it is derived from.
export async function recomputeAccount(c, accountId) {
	const row = await db(c).prepare(`
		SELECT opening_cents + COALESCE((
			SELECT SUM(CASE WHEN t.direction = 'in'
			                THEN t.amount_cents
			                ELSE -(t.amount_cents + t.fee_cents) END)
			FROM finance_transactions t
			WHERE t.account_id = ? AND t.status = 'posted' AND t.is_del = 0
		), 0) AS balance
		FROM finance_accounts WHERE id = ?
	`).bind(accountId, accountId).first();
	await db(c).prepare(
		`UPDATE finance_accounts SET balance_cents = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(Number(row?.balance) || 0, accountId).run();
	return Number(row?.balance) || 0;
}

export async function createAccount(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.accounts:manage', 'finance:edit'], 'Creating an account');
	const name = text(body.name, 120);
	if (!name) throw new BizError('Account name is required.', 400);
	const currency = text(body.currency, 8).toUpperCase() || 'KES';
	const opening = cents(body.opening_cents ?? body.opening_balance ?? 0);
	const { meta } = await db(c).prepare(`
		INSERT INTO finance_accounts
			(user_id, name, account_type, currency, opening_cents, balance_cents, status,
			 owner_id, description, source, restrictions, opened_on, sort, confidential, create_time, update_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		userId, name, text(body.account_type, 40) || 'bank', currency, opening, opening,
		body.status === 'archived' ? 'archived' : 'active',
		intOrNull(body.owner_id) ?? userId,
		text(body.description, 500), text(body.source, 120), text(body.restrictions, 500),
		body.opened_on || today(), Number(body.sort) || 0,
		body.confidential ? 1 : 0,
	).run();
	const accountId = meta.last_row_id;
	await audit(c, {
		entityType: 'account', entityId: accountId, action: 'created', actorId: userId,
		amountCents: opening, accountId, recordLabel: name, after: { name, opening_cents: opening },
	});
	return getAccount(c, userId, accountId);
}

export async function updateAccount(c, userId, accountId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.accounts:manage', 'finance:edit'], 'Editing an account');
	const before = await getAccount(c, userId, accountId);
	const patch = {};
	const assign = (column, value) => { if (value !== undefined) patch[column] = value; };
	assign('name', body.name !== undefined ? text(body.name, 120) : undefined);
	assign('account_type', body.account_type !== undefined ? text(body.account_type, 40) : undefined);
	assign('currency', body.currency !== undefined ? text(body.currency, 8).toUpperCase() : undefined);
	assign('status', body.status !== undefined ? text(body.status, 20) : undefined);
	assign('owner_id', body.owner_id !== undefined ? intOrNull(body.owner_id) : undefined);
	assign('description', body.description !== undefined ? text(body.description, 500) : undefined);
	assign('source', body.source !== undefined ? text(body.source, 120) : undefined);
	assign('restrictions', body.restrictions !== undefined ? text(body.restrictions, 500) : undefined);
	assign('confidential', body.confidential !== undefined ? (body.confidential ? 1 : 0) : undefined);
	assign('opened_on', body.opened_on !== undefined ? (body.opened_on || null) : undefined);

	// The opening balance is a deliberate, audited event: it is the start of the
	// ledger, not a number someone can nudge to fix a total.
	if (body.opening_cents !== undefined || body.opening_balance !== undefined) {
		const opening = cents(body.opening_cents ?? body.opening_balance);
		if (opening !== Number(before.opening_cents)) {
			const reason = text(body.opening_reason ?? body.reason, 300);
			if (!reason) throw new BizError('Explain why the opening balance is changing so the audit record stays useful.', 400);
			await db(c).prepare(
				`UPDATE finance_accounts SET opening_cents = ? WHERE id = ?`
			).bind(opening, accountId).run();
			await audit(c, {
				entityType: 'account', entityId: accountId, action: 'opening_changed', actorId: userId,
				amountCents: opening, accountId, recordLabel: before.name, reason,
				before: { opening_cents: Number(before.opening_cents) },
				after: { opening_cents: opening },
			});
		}
	}

	const columns = Object.keys(patch);
	if (columns.length) {
		await db(c).prepare(
			`UPDATE finance_accounts SET ${columns.map(col => `${col} = ?`).join(', ')}, update_time = CURRENT_TIMESTAMP WHERE id = ?`
		).bind(...columns.map(col => patch[col]), accountId).run();
	}
	await recomputeAccount(c, accountId);
	await audit(c, {
		entityType: 'account', entityId: accountId, action: 'updated', actorId: userId,
		accountId, recordLabel: patch.name || before.name,
		before: { status: before.status, owner_id: before.owner_id },
		after: patch,
	});
	return getAccount(c, userId, accountId);
}

export async function archiveAccount(c, userId, accountId) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.accounts:manage', 'finance:edit'], 'Archiving an account');
	const before = await getAccount(c, userId, accountId);
	await db(c).prepare(
		`UPDATE finance_accounts SET status = 'archived', update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(accountId).run();
	await audit(c, {
		entityType: 'account', entityId: accountId, action: 'archived', actorId: userId,
		accountId, recordLabel: before.name, before: { status: before.status }, after: { status: 'archived' },
	});
	return getAccount(c, userId, accountId);
}

export async function grantAccountAccess(c, userId, accountId, targetUserId, access = 'view') {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.accounts:manage', 'finance:edit'], 'Granting account access');
	const existing = await db(c).prepare(
		`SELECT id FROM finance_account_member WHERE account_id = ? AND user_id = ?`
	).bind(accountId, targetUserId).first();
	if (existing) {
		await db(c).prepare(
			`UPDATE finance_account_member SET access = ? WHERE id = ?`
		).bind(access === 'manage' ? 'manage' : 'view', existing.id).run();
	} else {
		await db(c).prepare(
			`INSERT INTO finance_account_member (account_id, user_id, access, created_by) VALUES (?, ?, ?, ?)`
		).bind(accountId, targetUserId, access === 'manage' ? 'manage' : 'view', userId).run();
	}
	await audit(c, {
		entityType: 'account_access', entityId: accountId, action: 'granted', actorId: userId,
		accountId, recordLabel: `user ${targetUserId}`, after: { targetUserId, access },
	});
	return true;
}

export async function listAccountMembers(c, userId, accountId) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.accounts:manage', 'finance:edit'], 'Listing account access');
	const { results } = await db(c).prepare(`
		SELECT m.*, u.display_name, u.username, u.email
		FROM finance_account_member m
		LEFT JOIN user u ON u.user_id = m.user_id
		WHERE m.account_id = ? ORDER BY u.display_name COLLATE NOCASE
	`).bind(accountId).all();
	return results || [];
}

// ---- ledger --------------------------------------------------------------

export async function accountLedger(c, userId, accountId, params = {}) {
	const account = await getAccount(c, userId, accountId);
	const page = Math.max(1, Number(params.page) || 1);
	const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));
	const offset = (page - 1) * pageSize;

	const args = [accountId];
	let where = 'account_id = ? AND is_del = 0';
	if (params.status) { where += ' AND status = ?'; args.push(params.status); }
	if (params.type) { where += ' AND type = ?'; args.push(params.type); }
	if (params.from) { where += ' AND COALESCE(txn_date, substr(create_time,1,10)) >= ?'; args.push(params.from); }
	if (params.to) { where += ' AND COALESCE(txn_date, substr(create_time,1,10)) <= ?'; args.push(params.to); }

	const { results } = await db(c).prepare(`
		SELECT * FROM finance_transactions WHERE ${where}
		ORDER BY COALESCE(txn_date, substr(create_time,1,10)) ASC, id ASC
	`).bind(...args).all();

	// The running balance is computed from the opening balance in date order, so
	// the ledger can be reconstructed at any point in the account's life.
	let running = Number(account.opening_cents) || 0;
	const rows = (results || []).map(row => {
		const delta = row.direction === 'in'
			? Number(row.amount_cents) || 0
			: -((Number(row.amount_cents) || 0) + (Number(row.fee_cents) || 0));
		running += delta;
		return { ...row, net_cents: delta, balance_after_cents: running };
	});
	const total = rows.length;
	const pageRows = rows.slice(offset, offset + pageSize).reverse();
	return {
		account,
		list: pageRows,
		total,
		page,
		pageSize,
		opening_cents: Number(account.opening_cents) || 0,
		balance_cents: account.balance_cents,
		moneyInCents: rows.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount_cents, 0),
		moneyOutCents: rows.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount_cents, 0),
		feesCents: rows.filter(r => r.direction === 'out').reduce((s, r) => s + (r.fee_cents || 0), 0),
	};
}

// ---- transactions --------------------------------------------------------

function assertAmount(amountCents, label = 'Amount') {
	if (!Number.isFinite(amountCents) || amountCents <= 0) {
		throw new BizError(`${label} must be greater than zero.`, 400);
	}
}

async function insertTransaction(c, row) {
	const { meta } = await db(c).prepare(`
		INSERT INTO finance_transactions
			(user_id, account_id, type, amount_cents, currency, fee_cents, description, status,
			 direction, txn_date, txn_time, category, subcategory, counterparty, reason, method,
			 reference, tax_cents, recorded_by, budget_id, commitment_id, debt_id, subscription_id,
			 invoice_id, funding_id, reimbursement_id, advance_id, project_id, event_id, request_id,
			 document_key, transfer_group, transfer_role, tags, notes, record_source, create_time, update_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		row.user_id, row.account_id ?? null, row.type, row.amount_cents, row.currency || 'KES',
		row.fee_cents || 0, row.description || '', row.status || 'posted',
		row.direction, row.txn_date || today(), row.txn_time || '',
		row.category || '', row.subcategory || '', row.counterparty || '', row.reason || '',
		row.method || '', row.reference || '', row.tax_cents || 0, row.recorded_by ?? null,
		row.budget_id ?? null, row.commitment_id ?? null, row.debt_id ?? null,
		row.subscription_id ?? null, row.invoice_id ?? null, row.funding_id ?? null,
		row.reimbursement_id ?? null, row.advance_id ?? null, row.project_id ?? null,
		row.event_id ?? null, row.request_id ?? null, row.document_key || '',
		row.transfer_group || '', row.transfer_role || '', row.tags || '', row.notes || '',
		row.record_source || 'manual',
	).run();
	return meta.last_row_id;
}

function baseTransaction(c, userId, body) {
	const type = TRANSACTION_TYPES.includes(body.type) ? body.type : 'expense';
	const currency = text(body.currency, 8).toUpperCase() || 'KES';
	const direction = body.direction === 'in' || body.direction === 'out'
		? body.direction
		: DIRECTIONS[type];
	if (!direction) throw new BizError('That transaction type needs a direction.', 400);
	return {
		type,
		currency,
		direction,
		amount_cents: cents(body.amount_cents ?? body.amount),
		fee_cents: cents(body.fee_cents ?? body.fee),
		tax_cents: cents(body.tax_cents ?? body.tax),
		account_id: intOrNull(body.account_id),
		description: text(body.description, 300),
		reason: text(body.reason, 300),
		category: text(body.category, 80),
		subcategory: text(body.subcategory, 80),
		counterparty: text(body.counterparty, 200),
		method: text(body.method, 60),
		reference: text(body.reference, 120),
		status: body.status === 'pending' ? 'pending' : 'posted',
		txn_date: body.txn_date || today(),
		txn_time: text(body.txn_time, 8),
		budget_id: intOrNull(body.budget_id),
		commitment_id: intOrNull(body.commitment_id),
		debt_id: intOrNull(body.debt_id),
		subscription_id: intOrNull(body.subscription_id),
		invoice_id: intOrNull(body.invoice_id),
		funding_id: intOrNull(body.funding_id),
		reimbursement_id: intOrNull(body.reimbursement_id),
		advance_id: intOrNull(body.advance_id),
		project_id: intOrNull(body.project_id),
		event_id: intOrNull(body.event_id),
		request_id: intOrNull(body.request_id),
		document_key: text(body.document_key, 300),
		tags: text(body.tags, 200),
		notes: text(body.notes, 1000),
		recorded_by: userId,
		approved_by: intOrNull(body.approved_by),
	};
}

async function assertAccountUsable(c, userId, keys, accountId) {
	if (!accountId) throw new BizError('Choose the account this belongs to.', 400);
	const row = await db(c).prepare(`SELECT id, status FROM finance_accounts WHERE id = ? AND is_del = 0`).bind(accountId).first();
	if (!row) throw new BizError('Account not found.', 404);
	if (row.status !== 'active') throw new BizError('This account is archived.', 400);
	if (!(await canViewAccount(c, userId, keys, accountId))) {
		throw new BizError('Account not found.', 404);
	}
}

// Records any money movement. Specialized modules (debt payment, subscription
// payment, invoice payment) call this so a single movement is never written
// twice: the module row references the transaction, it does not copy it.
export async function createTransaction(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.transactions:create', 'finance:create'], 'Recording a transaction');

	if (body.type === 'transfer') {
		return createTransfer(c, userId, keys, body);
	}

	const row = baseTransaction(c, userId, body);
	assertAmount(row.amount_cents);
	if (row.fee_cents < 0) throw new BizError('A fee cannot be negative.', 400);
	if (row.tax_cents < 0) throw new BizError('Tax cannot be negative.', 400);
	await assertAccountUsable(c, userId, keys, row.account_id);
	if (row.budget_id) await assertBudgetVisible(c, userId, keys, row.budget_id);

	row.user_id = userId;
	const id = await insertTransaction(c, row);
	if (row.status === 'posted') await recomputeAccount(c, row.account_id);
	await commitCommitmentPayment(c, userId, row);
	await audit(c, {
		entityType: 'transaction', entityId: id, action: 'created', actorId: userId,
		amountCents: row.amount_cents, accountId: row.account_id,
		recordLabel: row.description || row.category || row.type,
		after: { type: row.type, amount_cents: row.amount_cents, fee_cents: row.fee_cents, direction: row.direction },
		reason: row.reason, source: row.record_source || 'manual',
	});
	return getTransaction(c, userId, id);
}

async function commitCommitmentPayment(c, userId, row) {
	if (!row.commitment_id || row.status !== 'posted') return;
	const latest = await db(c)
		.prepare(`SELECT MAX(id) AS id FROM finance_transactions WHERE commitment_id = ?`)
		.bind(row.commitment_id).first();
	await db(c).prepare(
		`UPDATE finance_commitment SET status = 'paid', txn_id = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(latest?.id ?? null, row.commitment_id).run();
}

// A transfer is two linked movements. The company total does not change, which
// is the whole point: money moving between our own accounts is not income.
export async function createTransfer(c, userId, keys, body = {}) {
	const fromId = intOrNull(body.from_account_id ?? body.account_id);
	const toId = intOrNull(body.to_account_id);
	const amountCents = cents(body.amount_cents ?? body.amount);
	const feeCents = cents(body.fee_cents ?? body.fee);
	assertAmount(amountCents);
	if (!fromId || !toId) throw new BizError('Choose both accounts for the transfer.', 400);
	if (fromId === toId) throw new BizError('Choose two different accounts.', 400);
	await assertAccountUsable(c, userId, keys, fromId);
	await assertAccountUsable(c, userId, keys, toId);

	const currency = text(body.currency, 8).toUpperCase() || 'KES';
	const group = `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	const shared = {
		currency,
		description: text(body.description, 300) || 'Transfer between accounts',
		reason: text(body.reason, 300),
		reference: text(body.reference, 120),
		counterparty: text(body.counterparty, 200),
		method: text(body.method, 60),
		txn_date: body.txn_date || today(),
		txn_time: text(body.txn_time, 8),
		recorded_by: userId,
		transfer_group: group,
		status: body.status === 'pending' ? 'pending' : 'posted',
		record_source: 'transfer',
		tags: text(body.tags, 200),
		notes: text(body.notes, 1000),
		document_key: text(body.document_key, 300),
	};

	const outId = await insertTransaction(c, {
		...shared, user_id: userId, account_id: fromId, type: 'transfer',
		amount_cents: amountCents, fee_cents: feeCents, direction: 'out', transfer_role: 'from',
	});
	const inId = await insertTransaction(c, {
		...shared, user_id: userId, account_id: toId, type: 'transfer',
		amount_cents: amountCents, fee_cents: 0, direction: 'in', transfer_role: 'to',
	});
	if (shared.status === 'posted') {
		await recomputeAccount(c, fromId);
		await recomputeAccount(c, toId);
	}
	await audit(c, {
		entityType: 'transfer', entityId: outId, action: 'created', actorId: userId,
		amountCents: amountCents, accountId: fromId, recordLabel: shared.description,
		after: { from_account_id: fromId, to_account_id: toId, amount_cents: amountCents, fee_cents: feeCents },
		reason: shared.reason, source: 'transfer',
	});
	return {
		id: outId,
		transfer_group: group,
		from_txn_id: outId,
		to_txn_id: inId,
		amount_cents: amountCents,
		fee_cents: feeCents,
		net_company_cents: 0,
	};
}

export async function listTransactions(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	const visible = await visibleAccountIds(c, userId, keys);
	const page = Math.max(1, Number(params.page) || 1);
	const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));
	const offset = (page - 1) * pageSize;

	const where = ['t.is_del = 0'];
	const args = [];
	if (params.account_id) { where.push('t.account_id = ?'); args.push(Number(params.account_id)); }
	if (visible !== null) {
		if (!visible.length) return { list: [], total: 0, totals: {} };
		where.push(`t.account_id IN (${visible.map(() => '?').join(',')})`);
		args.push(...visible);
	}
	if (params.status) { where.push('t.status = ?'); args.push(params.status); }
	if (params.type) { where.push('t.type = ?'); args.push(params.type); }
	if (params.direction) { where.push('t.direction = ?'); args.push(params.direction); }
	if (params.category) { where.push('t.category = ?'); args.push(params.category); }
	if (params.budget_id) { where.push('t.budget_id = ?'); args.push(Number(params.budget_id)); }
	if (params.debt_id) { where.push('t.debt_id = ?'); args.push(Number(params.debt_id)); }
	if (params.subscription_id) { where.push('t.subscription_id = ?'); args.push(Number(params.subscription_id)); }
	if (params.invoice_id) { where.push('t.invoice_id = ?'); args.push(Number(params.invoice_id)); }
	if (params.method) { where.push('t.method = ?'); args.push(params.method); }
	if (params.from) { where.push('COALESCE(t.txn_date, substr(t.create_time,1,10)) >= ?'); args.push(params.from); }
	if (params.to) { where.push('COALESCE(t.txn_date, substr(t.create_time,1,10)) <= ?'); args.push(params.to); }
	if (params.search) {
		const like = `%${text(params.search, 120)}%`;
		where.push('(t.description LIKE ? OR t.reference LIKE ? OR t.counterparty LIKE ? OR t.notes LIKE ?)');
		args.push(like, like, like, like);
	}
	const whereSql = where.join(' AND ');

	const { results } = await db(c).prepare(`
		SELECT t.*, a.name AS account_name
		FROM finance_transactions t
		LEFT JOIN finance_accounts a ON a.id = t.account_id
		WHERE ${whereSql}
		ORDER BY COALESCE(t.txn_date, substr(t.create_time,1,10)) DESC, t.id DESC
		LIMIT ? OFFSET ?
	`).bind(...args, pageSize, offset).all();

	const countRow = await db(c).prepare(
		`SELECT COUNT(*) AS total FROM finance_transactions t WHERE ${whereSql}`
	).bind(...args).first();

	const totalsRow = await db(c).prepare(`
		SELECT
			COALESCE(SUM(CASE WHEN t.direction = 'in' AND t.type NOT IN ('transfer', 'advance', 'advance_return') THEN t.amount_cents ELSE 0 END), 0) AS income_cents,
			COALESCE(SUM(CASE WHEN t.direction = 'out' AND t.type NOT IN ('transfer', 'advance') THEN t.amount_cents ELSE 0 END), 0) AS expense_cents,
			COALESCE(SUM(CASE WHEN t.direction = 'out' THEN t.fee_cents ELSE 0 END), 0) AS fees_cents,
			COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.direction = 'out' THEN t.amount_cents ELSE 0 END), 0) AS transfers_cents,
			COALESCE(SUM(CASE WHEN t.type = 'advance' AND t.direction = 'out' THEN t.amount_cents ELSE 0 END), 0)
			  - COALESCE(SUM(CASE WHEN t.type = 'advance_return' THEN t.amount_cents ELSE 0 END), 0) AS advances_cents
		FROM finance_transactions t WHERE ${whereSql} AND t.status = 'posted'
	`).bind(...args).first();

	// Money moved between our own accounts is not income and not an expense.
	// It is reported on its own line so the two columns stay honest.
	const incomeCents = Number(totalsRow?.income_cents) || 0;
	const expenseCents = Number(totalsRow?.expense_cents) || 0;
	return {
		list: results || [],
		total: countRow?.total ?? 0,
		page,
		pageSize,
		totals: {
			income_cents: incomeCents,
			expense_cents: expenseCents,
			fees_cents: Number(totalsRow?.fees_cents) || 0,
			transfers_cents: Number(totalsRow?.transfers_cents) || 0,
			net_cents: incomeCents - expenseCents,
		},
	};
}

export async function getTransaction(c, userId, txnId) {
	const keys = await permKeys(c, userId);
	const row = await db(c).prepare(`
		SELECT t.*, a.name AS account_name
		FROM finance_transactions t
		LEFT JOIN finance_accounts a ON a.id = t.account_id
		WHERE t.id = ? AND t.is_del = 0
	`).bind(txnId).first();
	if (!row) throw new BizError('Transaction not found.', 404);
	if (row.account_id && !(await canViewAccount(c, userId, keys, row.account_id))) {
		throw new BizError('Transaction not found.', 404);
	}
	return row;
}

// A transaction is the canonical movement; everything it points at is context.
// The detail view resolves those pointers to names, so the UI never has to guess
// what a budget_id or a subscription_id refers to, and shows the audit trail that
// belongs to this row and nothing else.
const TRANSACTION_LINKS = [
	['budget', 'finance_budget', 'budget_id', 'name'],
	['debt', 'finance_debt', 'debt_id', 'name'],
	['subscription', 'finance_subscription', 'subscription_id', 'service'],
	['invoice', 'finance_invoices', 'invoice_id', 'invoice_number'],
	['funding', 'finance_funding', 'funding_id', 'name'],
	['commitment', 'finance_commitment', 'commitment_id', 'description'],
	['reimbursement', 'finance_reimbursement', 'reimbursement_id', 'reason'],
	['advance', 'finance_advance', 'advance_id', 'purpose'],
	['project', 'projects', 'project_id', 'name'],
	['event', 'crm_events', 'event_id', 'name'],
	['request', 'internal_requests', 'request_id', 'title'],
];

export async function transactionDetail(c, userId, txnId) {
	const keys = await permKeys(c, userId);
	const row = await getTransaction(c, userId, txnId);

	const links = [];
	for (const [kind, table, column, labelColumn] of TRANSACTION_LINKS) {
		const id = row[column];
		if (!id) continue;
		const linked = await db(c).prepare(
			`SELECT ${labelColumn} AS label FROM ${table} WHERE id = ?`
		).bind(id).first();
		if (linked?.label) links.push({ kind, id: Number(id), label: String(linked.label) });
	}

	const { results: auditRows } = await db(c).prepare(`
		SELECT a.*, u.display_name AS actor_name FROM finance_audit a
		LEFT JOIN user u ON u.user_id = a.actor_id
		WHERE a.entity_type = 'transaction' AND a.entity_id = ?
		ORDER BY a.id DESC
	`).bind(txnId).all();

	// A transfer is two rows. Showing only one of them would look like money
	// vanished, so the other half is resolved here.
	let transfer = null;
	if (row.transfer_group && row.transfer_role) {
		const siblingRole = row.transfer_role === 'from' ? 'to' : 'from';
		transfer = await db(c).prepare(`
			SELECT t.id, t.account_id, t.direction, t.amount_cents, t.fee_cents, a.name AS account_name
			FROM finance_transactions t
			LEFT JOIN finance_accounts a ON a.id = t.account_id
			WHERE t.transfer_group = ? AND t.transfer_role = ? AND t.is_del = 0
		`).bind(row.transfer_group, siblingRole).first() ?? null;
	}

	const amount = Number(row.amount_cents) || 0;
	const fee = Number(row.fee_cents) || 0;
	return {
		...row,
		net_cents: row.direction === 'in' ? amount : -(amount + fee),
		impact_cents: row.direction === 'out' ? -(amount + fee) : amount,
		links,
		transfer,
		audit: auditRows || [],
		can_void: row.status === 'posted' && hasPerm(keys, 'finance:void'),
	};
}

// Export is a server job on purpose. The browser only ever holds one page of
// rows, and a page exported as if it were the company's transactions is worse
// than no export at all. The same filters as the list apply, so an export can
// never contain a row the member could not open in the app.
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export async function exportTransactions(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:export', 'Exporting transactions');
	const { list } = await listTransactions(c, userId, { ...params, page: 1, pageSize: 5000 });
	const header = [
		'date', 'type', 'direction', 'description', 'counterparty', 'category', 'account',
		'amount_cents', 'fee_cents', 'currency', 'status', 'reference', 'method', 'recorded_by',
	];
	const lines = [header.join(',')];
	for (const row of list) {
		lines.push([
			row.txn_date, row.type, row.direction, row.description, row.counterparty, row.category,
			row.account_name, Number(row.amount_cents) || 0, Number(row.fee_cents) || 0,
			row.currency, row.status, row.reference, row.method, row.recorded_by,
		].map(csvCell).join(','));
	}
	await audit(c, {
		entityType: 'export', entityId: null, action: 'transactions', actorId: userId,
		recordLabel: `${list.length} transactions`,
		after: {
			rows: list.length,
			from: params.from || null,
			to: params.to || null,
			account_id: params.account_id ?? null,
			type: params.type || null,
		},
	});
	return {
		filename: `finance-transactions-${today()}.csv`,
		rows: list.length,
		truncated: list.length >= 5000,
		csv: lines.join('\r\n'),
	};
}

// ---- import --------------------------------------------------------------
//
// Import is server-authoritative: the browser parses the file and maps columns,
// but every row is validated, de-duplicated and written here so an import can
// never bypass the permission and audit rules a single create enforces. The
// flow is two-phase: previewImport classifies each row (new / duplicate /
// error) without writing, then commitImport writes only the rows the caller
// approved.
//
// A row is a duplicate when an existing posted transaction in the same account
// has the same date, amount, type and a matching reference or description. The
// fingerprint keeps that comparison in one indexed lookup instead of a scan.

function importFingerprint(row) {
	const ref = String(row.reference || '').trim().toLowerCase();
	const desc = String(row.description || '').trim().toLowerCase();
	const anchor = ref || desc;
	return [
		row.account_id ?? '',
		String(row.txn_date || '').slice(0, 10),
		Number(row.amount_cents) || 0,
		row.direction || '',
		anchor,
	].join('|');
}

async function existingImportKeys(c, rows) {
	// Pull the posted transactions for the accounts and date span in the batch,
	// then build the same fingerprint so duplicates are caught against the DB.
	const accountIds = [...new Set(rows.map(r => r.account_id).filter(Boolean))];
	if (!accountIds.length) return new Set();
	const dates = rows.map(r => String(r.txn_date || '').slice(0, 10)).filter(Boolean).sort();
	const from = dates[0];
	const to = dates[dates.length - 1];
	const { results } = await db(c).prepare(`
		SELECT account_id, txn_date, amount_cents, direction, reference, description
		FROM finance_transactions
		WHERE is_del = 0 AND status = 'posted'
		  AND account_id IN (${accountIds.map(() => '?').join(',')})
		  AND COALESCE(txn_date, '') >= ? AND COALESCE(txn_date, '') <= ?
	`).bind(...accountIds, from, to).all();
	const seen = new Set();
	for (const row of results || []) {
		seen.add(importFingerprint({
			account_id: row.account_id,
			txn_date: row.txn_date,
			amount_cents: row.amount_cents,
			direction: row.direction,
			reference: row.reference,
			description: row.description,
		}));
	}
	return seen;
}

function normalizeImportRows(c, rawRows) {
	const rows = Array.isArray(rawRows) ? rawRows : [];
	return rows.slice(0, 1000).map((raw, index) => {
		const row = baseTransaction(c, null, raw);
		const problems = [];
		if (!row.account_id) problems.push('Missing account');
		if (!(Number(row.amount_cents) > 0)) problems.push('Amount must be greater than zero');
		if (!row.txn_date) problems.push('Missing date');
		return { index: index + 1, row, problems };
	});
}

export async function previewImport(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.transactions:create', 'finance:create'], 'Importing transactions');
	const normalized = normalizeImportRows(c, body.rows);
	// Visibility: a row pointing at an account the caller cannot see is an error,
	// not a silent skip, so the importer knows to fix it.
	for (const entry of normalized) {
		if (entry.row.account_id && !(await canViewAccount(c, userId, keys, entry.row.account_id))) {
			entry.problems.push('No access to that account');
		}
	}
	const existing = await existingImportKeys(c, normalized.map(e => e.row));
	const batchSeen = new Set();
	const rows = normalized.map(entry => {
		const fp = importFingerprint(entry.row);
		let status = 'new';
		if (entry.problems.length) status = 'error';
		else if (existing.has(fp) || batchSeen.has(fp)) status = 'duplicate';
		batchSeen.add(fp);
		return {
			index: entry.index,
			status,
			problems: entry.problems,
			date: entry.row.txn_date,
			description: entry.row.description,
			amount_cents: entry.row.amount_cents,
			type: entry.row.type,
			direction: entry.row.direction,
			account_id: entry.row.account_id,
			reference: entry.row.reference,
		};
	});
	return {
		total: rows.length,
		new: rows.filter(r => r.status === 'new').length,
		duplicate: rows.filter(r => r.status === 'duplicate').length,
		error: rows.filter(r => r.status === 'error').length,
		rows,
	};
}

export async function commitImport(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.transactions:create', 'finance:create'], 'Importing transactions');
	const normalized = normalizeImportRows(c, body.rows);
	const existing = await existingImportKeys(c, normalized.map(e => e.row));
	const batchSeen = new Set();
	const accountCache = new Map();
	let created = 0;
	let duplicate = 0;
	let error = 0;
	const failures = [];
	for (const entry of normalized) {
		const { row, problems } = entry;
		if (problems.length || !row.account_id || !(Number(row.amount_cents) > 0)) {
			error += 1;
			failures.push({ index: entry.index, reason: problems.join('; ') || 'Invalid row' });
			continue;
		}
		if (!(await canViewAccount(c, userId, keys, row.account_id))) {
			error += 1;
			failures.push({ index: entry.index, reason: 'No access to that account' });
			continue;
		}
		const fp = importFingerprint(row);
		if (existing.has(fp) || batchSeen.has(fp)) {
			duplicate += 1;
			continue;
		}
		batchSeen.add(fp);
		row.user_id = userId;
		row.record_source = 'import';
		const id = await insertTransaction(c, row);
		if (row.status === 'posted') {
			// Recompute each affected account once after the loop when possible;
			// here we recompute inline for correctness, the cache avoids repeats.
			await recomputeAccount(c, row.account_id);
			accountCache.set(row.account_id, true);
		}
		await audit(c, {
			entityType: 'transaction', entityId: id, action: 'import', actorId: userId,
			amountCents: row.amount_cents, accountId: row.account_id,
			recordLabel: row.description || row.category || row.type,
			after: { type: row.type, amount_cents: row.amount_cents, direction: row.direction },
			source: 'import',
		});
		created += 1;
	}
	await audit(c, {
		entityType: 'import', entityId: null, action: 'commit', actorId: userId,
		recordLabel: `${created} imported`,
		after: { created, duplicate, error },
		source: 'import',
	});
	return { created, duplicate, error, failures: failures.slice(0, 50) };
}

// Voiding reverses the movement instead of deleting it. The row, its audit
// trail and the account's history all survive.
export async function voidTransaction(c, userId, txnId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:void', 'Voiding a transaction');
	const row = await getTransaction(c, userId, txnId);
	if (row.status === 'void') throw new BizError('This transaction is already void.', 400);
	const reason = text(body.reason, 300);
	if (!reason) throw new BizError('A reason is required to void a transaction.', 400);

	await db(c).prepare(`
		UPDATE finance_transactions
		SET status = 'void', voided_at = ?, voided_by = ?, void_reason = ?, update_time = CURRENT_TIMESTAMP
		WHERE id = ?
	`).bind(nowStamp(), userId, reason, txnId).run();

	if (row.account_id) await recomputeAccount(c, row.account_id);
	if (row.debt_id) await refreshDebt(c, row.debt_id);
	if (row.subscription_id) await refreshSubscription(c, row.subscription_id);
	if (row.invoice_id) await refreshInvoice(c, row.invoice_id);
	if (row.funding_id) await refreshFunding(c, row.funding_id);
	if (row.commitment_id) {
		await db(c).prepare(
			`UPDATE finance_commitment SET status = 'planned', txn_id = NULL, update_time = CURRENT_TIMESTAMP WHERE id = ?`
		).bind(row.commitment_id).run();
	}

	await audit(c, {
		entityType: 'transaction', entityId: txnId, action: 'voided', actorId: userId,
		amountCents: row.amount_cents, accountId: row.account_id,
		recordLabel: row.description || row.type, reason,
		before: { status: row.status }, after: { status: 'void', void_reason: reason },
	});
	return getTransaction(c, userId, txnId);
}

// ---- funding -------------------------------------------------------------

export async function listFunding(c, userId) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:view', 'Viewing funding');
	const { results } = await db(c).prepare(`
		SELECT f.*, a.name AS account_name
		FROM finance_funding f
		LEFT JOIN finance_accounts a ON a.id = f.account_id
		ORDER BY f.id DESC
	`).all();
	const visible = await visibleAccountIds(c, userId, keys);
	const rows = (results || []).filter(row => {
		if (row.account_id) return visible === null || visible.includes(Number(row.account_id));
		// A funding promise without a destination account is still sensitive.
		// Outside company scope, only the person who recorded it can see it.
		return isCompanyScope(keys) || Number(row.created_by) === Number(userId);
	});
	return { list: rows, total: rows.length, companyScope: isCompanyScope(keys) };
}

export async function getFunding(c, userId, fundingId) {
	const row = await db(c).prepare(`
		SELECT f.*, a.name AS account_name FROM finance_funding f
		LEFT JOIN finance_accounts a ON a.id = f.account_id WHERE f.id = ?
	`).bind(fundingId).first();
	if (!row) throw new BizError('Funding record not found.', 404);
	const keys = await permKeys(c, userId);
	if ((row.account_id && !(await canViewAccount(c, userId, keys, row.account_id)))
		|| (!row.account_id && !isCompanyScope(keys) && Number(row.created_by) !== Number(userId))) {
		throw new BizError('Funding record not found.', 404);
	}
	const { results } = await db(c).prepare(`
		SELECT * FROM finance_transactions WHERE funding_id = ? ORDER BY id ASC
	`).bind(fundingId).all();
	return { ...row, transactions: results || [] };
}

// Recording funding is what puts money into an account. The funding row is the
// explanation; the transaction is the movement.
export async function createFunding(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:create', 'Recording funding');
	const name = text(body.name, 200);
	if (!name) throw new BizError('Funding name is required.', 400);
	const receivedCents = cents(body.received_cents ?? body.amount);
	const committedCents = cents(body.committed_cents ?? body.amount);
	if (receivedCents < 0 || committedCents < 0) throw new BizError('Amounts cannot be negative.', 400);
	const accountId = intOrNull(body.account_id);
	if (receivedCents > 0) await assertAccountUsable(c, userId, keys, accountId);

	const currency = text(body.currency, 8).toUpperCase() || 'KES';
	const fundingType = ['loan', 'equity', 'grant', 'other'].includes(body.funding_type) ? body.funding_type : 'other';

	const { meta } = await db(c).prepare(`
		INSERT INTO finance_funding
			(name, source, funding_type, committed_cents, received_cents, currency, received_date,
			 account_id, conditions, document_key, status, notes, created_by, create_time, update_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		name, text(body.source, 200), fundingType, committedCents, receivedCents, currency,
		body.received_date || today(), accountId, text(body.conditions, 500),
		text(body.document_key, 300), receivedCents > 0 ? 'received' : 'committed',
		text(body.notes, 1000), userId,
	).run();
	const fundingId = meta.last_row_id;

	let txnId = null;
	if (receivedCents > 0) {
		const txn = await createTransaction(c, userId, {
			type: 'funding',
			amount_cents: receivedCents,
			currency,
			account_id: accountId,
			funding_id: fundingId,
			counterparty: text(body.source, 200),
			category: 'Funding',
			description: text(body.description, 300) || `${name} received`,
			reason: text(body.conditions, 300),
			document_key: text(body.document_key, 300),
			method: text(body.method, 60),
			reference: text(body.reference, 120),
			txn_date: body.received_date || today(),
			status: 'posted',
		});
		txnId = txn.id;
		await db(c).prepare(`UPDATE finance_funding SET status = 'received' WHERE id = ?`).bind(fundingId).run();
	}

	// A loan is funding and an obligation at once. Recording both would double
	// count, so the debt is created and linked rather than paid again.
	let debtId = null;
	if (fundingType === 'loan' && body.create_debt) {
		const debt = await createDebt(c, userId, {
			name: `${name} (loan)`,
			creditor: text(body.source, 200),
			amount_cents: receivedCents || committedCents,
			currency,
			due_date: body.repayment_date || null,
			category: 'Loan',
			notes: text(body.conditions, 500),
			status: 'open',
		});
		debtId = debt.id;
		await db(c).prepare(`UPDATE finance_funding SET debt_id = ? WHERE id = ?`).bind(debtId, fundingId).run();
	}

	await audit(c, {
		entityType: 'funding', entityId: fundingId, action: 'created', actorId: userId,
		amountCents: receivedCents, accountId, recordLabel: name,
		after: { name, received_cents: receivedCents, funding_type: fundingType },
	});
	return getFunding(c, userId, fundingId);
}

async function refreshFunding(c, fundingId) {
	const row = await db(c).prepare(`
		SELECT COALESCE(SUM(amount_cents), 0) AS received
		FROM finance_transactions
		WHERE funding_id = ? AND type = 'funding' AND status = 'posted' AND is_del = 0
	`).bind(fundingId).first();
	await db(c).prepare(
		`UPDATE finance_funding SET received_cents = ?, status = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(Number(row?.received) || 0, Number(row?.received) > 0 ? 'received' : 'committed', fundingId).run();
}

// Assigning a budget or granting account access needs a short list of people,
// not the company's user directory. This is the only people list finance
// exposes, it is gated on a finance key rather than user:query, and it returns
// names only.
export async function assignableMembers(c, userId) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.budgets:assign', 'finance.budgets:manage', 'finance.accounts:manage'], 'Assigning finance records');
	const { results } = await db(c).prepare(`
		SELECT user_id, display_name, username, email
		FROM user WHERE status = 0
		ORDER BY display_name COLLATE NOCASE
	`).all();
	return { list: results || [] };
}

// ---- budgets -------------------------------------------------------------

async function assertBudgetVisible(c, userId, keys, budgetId) {
	const row = await db(c).prepare(`SELECT id, owner_id FROM finance_budget WHERE id = ? AND is_del = 0`).bind(budgetId).first();
	if (!row) throw new BizError('Budget not found.', 404);
	if (!isCompanyScope(keys) && Number(row.owner_id) !== Number(userId)) {
		throw new BizError('Budget not found.', 404);
	}
	return row;
}

export async function listBudgets(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	const visible = await visibleAccountIds(c, userId, keys);
	let sql = `SELECT b.*, a.name AS account_name FROM finance_budget b
		LEFT JOIN finance_accounts a ON a.id = b.account_id
		WHERE b.is_del = 0`;
	const args = [];
	if (params.status) { sql += ' AND b.status = ?'; args.push(params.status); }
	if (!isCompanyScope(keys)) {
		sql += ' AND (b.owner_id = ? OR b.id IN (SELECT budget_id FROM finance_commitment WHERE created_by = ?))';
		args.push(userId, userId);
	}
	sql += ' ORDER BY b.id DESC';
	const { results } = await db(c).prepare(sql).bind(...args).all();

	const list = [];
	for (const row of results || []) {
		if (row.account_id && visible !== null && !visible.includes(Number(row.account_id))) continue;
		list.push(await decorateBudget(c, row));
	}
	return { list, total: list.length };
}

async function decorateBudget(c, row) {
	const allocated = Number(row.allocated_cents) || 0;
	const spentRow = await db(c).prepare(`
		SELECT COALESCE(SUM(amount_cents + fee_cents), 0) AS spent
		FROM finance_transactions
		WHERE budget_id = ? AND status = 'posted' AND is_del = 0
	`).bind(row.id).first();
	const committedRow = await db(c).prepare(`
		SELECT COALESCE(SUM(amount_cents), 0) AS committed
		FROM finance_commitment
		WHERE budget_id = ? AND status IN ('planned', 'approved')
	`).bind(row.id).first();
	const spent = Number(spentRow?.spent) || 0;
	const committed = Number(committedRow?.committed) || 0;
	const available = allocated - spent - committed;
	const variance = allocated - spent;
	const usedPercent = percent(spent, allocated);
	const overBudget = spent > allocated;
	const warningThreshold = Number(row.warning_threshold) || 80;
	const nearThreshold = !overBudget && usedPercent >= warningThreshold;
	return {
		...row,
		allocated_cents: allocated,
		spent_cents: spent,
		committed_cents: committed,
		available_cents: available,
		variance_cents: variance,
		used_percent: usedPercent,
		over_budget: overBudget,
		near_threshold: nearThreshold,
	};
}

export async function getBudget(c, userId, budgetId) {
	const keys = await permKeys(c, userId);
	await assertBudgetVisible(c, userId, keys, budgetId);
	const row = await db(c).prepare(`
		SELECT b.*, a.name AS account_name FROM finance_budget b
		LEFT JOIN finance_accounts a ON a.id = b.account_id WHERE b.id = ? AND b.is_del = 0
	`).bind(budgetId).first();
	const decorated = await decorateBudget(c, row);
	const { results: commitments } = await db(c).prepare(`
		SELECT * FROM finance_commitment WHERE budget_id = ? ORDER BY id DESC
	`).bind(budgetId).all();
	const { results: transactions } = await db(c).prepare(`
		SELECT * FROM finance_transactions WHERE budget_id = ? AND is_del = 0 ORDER BY id DESC LIMIT 200
	`).bind(budgetId).all();
	const owner = row.owner_id
		? await db(c).prepare(`SELECT user_id, display_name, username, email FROM user WHERE user_id = ?`).bind(row.owner_id).first()
		: null;
	return { ...decorated, commitments: commitments || [], transactions: transactions || [], owner: owner || null };
}

export async function createBudget(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.budgets:create', 'Creating a budget');
	const name = text(body.name, 200);
	if (!name) throw new BizError('Budget name is required.', 400);
	const allocated = cents(body.allocated_cents ?? body.amount);
	if (allocated < 0) throw new BizError('A budget cannot be negative.', 400);
	const accountId = intOrNull(body.account_id);
	if (accountId) await assertAccountUsable(c, userId, keys, accountId);
	const ownerId = intOrNull(body.owner_id) ?? userId;
	if (ownerId !== Number(userId)) {
		assertAnyPerm(keys, ['finance.budgets:assign', 'finance.budgets:manage'], 'Assigning a budget owner');
	}
	const startDate = body.start_date || null;
	const endDate = body.end_date || null;
	if (startDate && endDate && startDate > endDate) throw new BizError('The budget end date must be after its start date.', 400);
	const warningThreshold = Math.max(1, Math.min(100, Number(body.warning_threshold) || 80));
	const { meta } = await db(c).prepare(`
		INSERT INTO finance_budget
			(name, period, allocated_cents, currency, owner_id, category, status, description,
			 start_date, end_date, team_id, account_id, warning_threshold, project_id, event_id,
			 notes, create_time, update_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		name, text(body.period, 40), allocated, text(body.currency, 8).toUpperCase() || 'KES',
		ownerId, text(body.category, 80), body.status || 'active',
		text(body.description, 500), startDate, endDate,
		intOrNull(body.team_id), accountId,
		warningThreshold, intOrNull(body.project_id), intOrNull(body.event_id),
		text(body.notes, 1000),
	).run();
	const budgetId = meta.last_row_id;
	await audit(c, {
		entityType: 'budget', entityId: budgetId, action: 'created', actorId: userId,
		amountCents: allocated, recordLabel: name, after: { name, allocated_cents: allocated },
	});
	return getBudget(c, userId, budgetId);
}

export async function updateBudget(c, userId, budgetId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.budgets:manage', 'Editing a budget');
	const before = await getBudget(c, userId, budgetId);
	const patch = [];
	const args = [];
	const add = (column, value) => { if (value !== undefined) { patch.push(`${column} = ?`); args.push(value); } };
	const nextAccountId = body.account_id !== undefined ? intOrNull(body.account_id) : null;
	if (nextAccountId) await assertAccountUsable(c, userId, keys, nextAccountId);
	const nextOwnerId = body.owner_id !== undefined ? intOrNull(body.owner_id) : null;
	if (nextOwnerId && nextOwnerId !== Number(before.owner_id)) {
		assertAnyPerm(keys, ['finance.budgets:assign', 'finance.budgets:manage'], 'Assigning a budget owner');
	}
	const nextStartDate = body.start_date !== undefined ? (body.start_date || null) : before.start_date;
	const nextEndDate = body.end_date !== undefined ? (body.end_date || null) : before.end_date;
	if (nextStartDate && nextEndDate && nextStartDate > nextEndDate) throw new BizError('The budget end date must be after its start date.', 400);
	add('name', body.name !== undefined ? text(body.name, 200) : undefined);
	add('period', body.period !== undefined ? text(body.period, 40) : undefined);
	add('status', body.status !== undefined ? text(body.status, 20) : undefined);
	add('description', body.description !== undefined ? text(body.description, 500) : undefined);
	add('notes', body.notes !== undefined ? text(body.notes, 1000) : undefined);
	add('warning_threshold', body.warning_threshold !== undefined ? Math.max(1, Math.min(100, Number(body.warning_threshold) || 80)) : undefined);
	add('account_id', body.account_id !== undefined ? nextAccountId : undefined);
	add('owner_id', body.owner_id !== undefined ? nextOwnerId : undefined);
	add('team_id', body.team_id !== undefined ? intOrNull(body.team_id) : undefined);
	add('start_date', body.start_date !== undefined ? nextStartDate : undefined);
	add('end_date', body.end_date !== undefined ? nextEndDate : undefined);
	if (body.allocated_cents !== undefined || body.amount !== undefined) {
		add('allocated_cents', cents(body.allocated_cents ?? body.amount));
	}
	if (patch.length) {
		args.push(budgetId);
		await db(c).prepare(
			`UPDATE finance_budget SET ${patch.join(', ')}, update_time = CURRENT_TIMESTAMP WHERE id = ?`
		).bind(...args).run();
	}
	await audit(c, {
		entityType: 'budget', entityId: budgetId, action: 'updated', actorId: userId,
		amountCents: body.allocated_cents !== undefined ? cents(body.allocated_cents) : undefined,
		recordLabel: body.name || before.name, before: { allocated_cents: before.allocated_cents }, after: body,
	});
	return getBudget(c, userId, budgetId);
}

// Approval is authorization to spend; it is not money leaving an account.
export async function createCommitment(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.budgets:create', 'Committing budget spend');
	const budgetId = intOrNull(body.budget_id);
	if (!budgetId) throw new BizError('Choose a budget.', 400);
	await assertBudgetVisible(c, userId, keys, budgetId);
	const amount = cents(body.amount_cents ?? body.amount);
	assertAmount(amount);
	const accountId = intOrNull(body.account_id);
	if (accountId) await assertAccountUsable(c, userId, keys, accountId);
	const status = COMMITMENT_STATUSES.includes(body.status) ? body.status : 'planned';
	const { meta } = await db(c).prepare(`
		INSERT INTO finance_commitment
			(budget_id, description, amount_cents, currency, status, counterparty, due_date,
			 account_id, created_by, notes, create_time, update_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		budgetId, text(body.description, 300), amount,
		text(body.currency, 8).toUpperCase() || 'KES', status, text(body.counterparty, 200),
		body.due_date || null, accountId, userId, text(body.notes, 500),
	).run();
	const commitmentId = meta.last_row_id;
	await audit(c, {
		entityType: 'commitment', entityId: commitmentId, action: 'created', actorId: userId,
		amountCents: amount, recordLabel: text(body.description, 120), after: { budget_id: budgetId, amount_cents: amount, status },
	});
	return { id: commitmentId, budget: await getBudget(c, userId, budgetId) };
}

// An approved finance request is an authorisation to spend, not a payment. The
// commitment reserves the budget so the money is not double-committed later, and
// the payment stays a separate finance action. The link back to the request is
// stored, so the audit trail answers "who approved this and why".
export async function createRequestCommitment(c, userId, requestId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.budgets:create', 'finance:approve', 'finance:edit'], 'Converting a request into a commitment');

	const request = await db(c).prepare(
		`SELECT * FROM internal_requests WHERE id = ? AND is_del = 0`
	).bind(requestId).first();
	if (!request) throw new BizError('Request not found.', 404);
	if (String(request.category || '').toLowerCase() !== 'finance') {
		throw new BizError('Only finance requests become budget commitments.', 400);
	}
	if (request.status !== 'approved') {
		throw new BizError('Only an approved request can be committed.', 400);
	}

	const existing = await db(c).prepare(
		`SELECT id FROM finance_commitment WHERE request_id = ? LIMIT 1`
	).bind(requestId).first();
	if (existing) throw new BizError('This request is already committed.', 400);

	const amount = cents(body.amount_cents ?? body.amount);
	assertAmount(amount);
	const budgetId = intOrNull(body.budget_id);
	if (!budgetId) throw new BizError('Choose the budget this is charged to.', 400);
	await assertBudgetVisible(c, userId, keys, budgetId);

	const { meta } = await db(c).prepare(`
		INSERT INTO finance_commitment
			(budget_id, description, amount_cents, currency, status, counterparty, due_date,
			 account_id, request_id, created_by, notes, create_time, update_time)
		VALUES (?, ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		budgetId,
		text(body.description, 300) || text(request.title, 300) || `Request #${request.id}`,
		amount,
		text(body.currency, 8).toUpperCase() || 'KES',
		text(body.counterparty, 200),
		body.due_date || request.due_date || null,
		intOrNull(body.account_id),
		request.id,
		userId,
		text(body.notes, 500) || text(request.description, 500),
	).run();
	const commitmentId = meta.last_row_id;

	await audit(c, {
		entityType: 'commitment', entityId: commitmentId, action: 'from_request', actorId: userId,
		amountCents: amount, recordLabel: text(request.title, 120),
		after: { budget_id: budgetId, amount_cents: amount, request_id: request.id, status: 'planned' },
	});

	return {
		id: commitmentId,
		request_id: request.id,
		status: 'planned',
		budget: await getBudget(c, userId, budgetId),
	};
}

export async function listCommitments(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	let sql = `SELECT cm.*, b.name AS budget_name FROM finance_commitment cm
		LEFT JOIN finance_budget b ON b.id = cm.budget_id WHERE 1 = 1`;
	const args = [];
	if (params.budget_id) { sql += ' AND cm.budget_id = ?'; args.push(Number(params.budget_id)); }
	if (params.status) { sql += ' AND cm.status = ?'; args.push(params.status); }
	if (!isCompanyScope(keys)) {
		sql += ' AND (cm.created_by = ? OR cm.budget_id IN (SELECT id FROM finance_budget WHERE owner_id = ?))';
		args.push(userId, userId);
	}
	sql += ' ORDER BY cm.id DESC';
	const { results } = await db(c).prepare(sql).bind(...args).all();
	return { list: results || [], total: (results || []).length };
}

// ---- debts ---------------------------------------------------------------

export async function listDebts(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.debts:view', 'Viewing debts');
	const where = ['d.is_del = 0'];
	const args = [];
	if (params.status) { where.push('d.status = ?'); args.push(params.status); }
	if (params.priority) { where.push('d.priority = ?'); args.push(params.priority); }
	const visibleAccounts = await visibleAccountIds(c, userId, keys);
	if (!isCompanyScope(keys)) {
		if (visibleAccounts?.length) {
			where.push(`(d.created_by = ? OR d.account_id IN (${visibleAccounts.map(() => '?').join(', ')}))`);
			args.push(userId, ...visibleAccounts);
		} else {
			where.push('d.created_by = ?');
			args.push(userId);
		}
	} else if (visibleAccounts !== null) {
		// Company finance is not a skeleton key into debts tied to a confidential account.
		where.push(`(d.account_id IS NULL OR d.account_id IN (${visibleAccounts.length ? visibleAccounts.map(() => '?').join(', ') : 'NULL'}))`);
		args.push(...visibleAccounts);
	}
	const { results } = await db(c).prepare(
		`SELECT d.* FROM finance_debt d WHERE ${where.join(' AND ')} ORDER BY
			CASE status WHEN 'overdue' THEN 0 WHEN 'open' THEN 1 WHEN 'partial' THEN 2 ELSE 3 END,
			due_date IS NULL, due_date ASC, id DESC`
	).bind(...args).all();

	const list = [];
	for (const row of results || []) list.push(await decorateDebt(c, row));
	return { list, total: list.length };
}

async function assertDebtVisible(c, userId, keys, row) {
	if (!row || row.is_del) throw new BizError('Debt not found.', 404);
	const visibleAccounts = await visibleAccountIds(c, userId, keys);
	if (!isCompanyScope(keys)) {
		if (Number(row.created_by) === Number(userId)) return;
		if (row.account_id && (visibleAccounts === null || visibleAccounts.includes(Number(row.account_id)))) return;
		throw new BizError('Debt not found.', 404);
	}
	if (row.account_id && visibleAccounts !== null && !visibleAccounts.includes(Number(row.account_id))) {
		throw new BizError('Debt not found.', 404);
	}
}

async function decorateDebt(c, row) {
	const adjustmentRow = await db(c).prepare(
		`SELECT COALESCE(SUM(amount_cents), 0) AS adjusted FROM finance_debt_adjustment WHERE debt_id = ?`
	).bind(row.id).first();
	const paidRow = await db(c).prepare(`
		SELECT COALESCE(SUM(amount_cents), 0) AS paid
		FROM finance_transactions
		WHERE debt_id = ? AND type = 'debt_payment' AND status = 'posted' AND is_del = 0
	`).bind(row.id).first();
	const original = Number(row.amount_cents) || 0;
	const adjusted = Number(adjustmentRow?.adjusted) || 0;
	const paid = Number(paidRow?.paid) || 0;
	const outstanding = original + adjusted - paid;
	const overdue = row.status !== 'cancelled' && row.status !== 'paid' && row.due_date && row.due_date < today();
	const status = row.status === 'cancelled' || row.status === 'disputed'
		? row.status
		: (outstanding <= 0 ? 'paid' : (overdue ? 'overdue' : (paid > 0 ? 'partial' : 'open')));
	return {
		...row,
		original_cents: original,
		added_cents: adjusted,
		paid_cents: paid,
		outstanding_cents: outstanding,
		status,
		overdue: Boolean(overdue),
	};
}

export async function getDebt(c, userId, debtId) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.debts:view', 'Viewing a debt');
	const row = await db(c).prepare(`SELECT * FROM finance_debt WHERE id = ? AND is_del = 0`).bind(debtId).first();
	await assertDebtVisible(c, userId, keys, row);
	const decorated = await decorateDebt(c, row);
	const { results: payments } = await db(c).prepare(`
		SELECT p.*, a.name AS account_name FROM finance_payment p
		LEFT JOIN finance_accounts a ON a.id = p.account_id
		WHERE p.debt_id = ? ORDER BY p.id ASC
	`).bind(debtId).all();
	const { results: adjustments } = await db(c).prepare(`
		SELECT * FROM finance_debt_adjustment WHERE debt_id = ? ORDER BY id ASC
	`).bind(debtId).all();
	const { results: transactions } = await db(c).prepare(`
		SELECT * FROM finance_transactions WHERE debt_id = ? ORDER BY id ASC
	`).bind(debtId).all();
	return { ...decorated, payments: payments || [], adjustments: adjustments || [], transactions: transactions || [] };
}

export async function createDebt(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.debts:create', 'Recording a debt');
	const name = text(body.name, 200);
	if (!name) throw new BizError('Debt name is required.', 400);
	const amount = cents(body.amount_cents ?? body.amount);
	assertAmount(amount);
	const accountId = intOrNull(body.account_id);
	if (accountId) await assertAccountUsable(c, userId, keys, accountId);
	const { meta } = await db(c).prepare(`
		INSERT INTO finance_debt
			(name, creditor, amount_cents, outstanding_cents, paid_cents, currency, due_date,
			 status, priority, category, notes, account_id, document_key, created_by, create_time, update_time)
		VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		name, text(body.creditor, 200), amount, amount,
		text(body.currency, 8).toUpperCase() || 'KES', body.due_date || null,
		body.status || 'open', body.priority || 'normal', text(body.category, 80),
		text(body.notes, 1000), accountId, text(body.document_key, 300), userId,
	).run();
	const debtId = meta.last_row_id;
	await audit(c, {
		entityType: 'debt', entityId: debtId, action: 'created', actorId: userId,
		amountCents: amount, recordLabel: name, after: { name, amount_cents: amount, creditor: text(body.creditor, 200) },
	});
	return getDebt(c, userId, debtId);
}

// A debt's original amount is an accounting fact. Editing the descriptive
// fields is always allowed to the debt manager, but changing a balance after
// any payment or correction would rewrite history. Balance corrections use the
// dedicated, reasoned adjustment workflow below instead.
export async function updateDebt(c, userId, debtId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.debts:edit', 'finance.debts:create'], 'Editing a debt');
	const debt = await getDebt(c, userId, debtId);
	if (debt.status === 'cancelled') throw new BizError('A cancelled debt cannot be edited. Restore it first if it is still owed.', 400);

	const patch = {};
	if (body.name !== undefined) {
		const name = text(body.name, 200);
		if (!name) throw new BizError('Debt name is required.', 400);
		patch.name = name;
	}
	if (body.creditor !== undefined) patch.creditor = text(body.creditor, 200);
	if (body.due_date !== undefined) patch.due_date = body.due_date ? String(body.due_date).slice(0, 10) : null;
	if (body.priority !== undefined) {
		const priority = text(body.priority, 20).toLowerCase();
		if (!['normal', 'high', 'critical'].includes(priority)) throw new BizError('Choose normal, high, or critical priority.', 400);
		patch.priority = priority;
	}
	if (body.category !== undefined) patch.category = text(body.category, 80);
	if (body.notes !== undefined) patch.notes = text(body.notes, 1000);
	if (body.account_id !== undefined) patch.account_id = intOrNull(body.account_id);
	if (body.document_key !== undefined) patch.document_key = text(body.document_key, 300);

	const requestedAmount = body.amount_cents ?? body.amount;
	if (requestedAmount !== undefined) {
		const nextAmount = cents(requestedAmount);
		assertAmount(nextAmount);
		const hasHistory = (debt.payments || []).length > 0 || (debt.adjustments || []).length > 0;
		if (hasHistory && nextAmount !== Number(debt.amount_cents)) {
			throw new BizError('The original amount is locked after a payment or correction. Use “Correct balance” with a reason so the history stays accurate.', 400);
		}
		if (!hasHistory) {
			patch.amount_cents = nextAmount;
			patch.outstanding_cents = nextAmount;
		}
	}
	if (patch.account_id) await assertAccountUsable(c, userId, keys, patch.account_id);

	if (!Object.keys(patch).length) return debt;
	patch.update_time = nowStamp();
	const columns = Object.keys(patch);
	await db(c).prepare(
		`UPDATE finance_debt SET ${columns.map(column => `${column} = ?`).join(', ')} WHERE id = ? AND is_del = 0`
	).bind(...columns.map(column => patch[column]), debtId).run();

	await audit(c, {
		entityType: 'debt', entityId: debtId, action: 'updated', actorId: userId,
		recordLabel: patch.name || debt.name, before: {
			name: debt.name, creditor: debt.creditor, due_date: debt.due_date,
			priority: debt.priority, category: debt.category, notes: debt.notes,
			amount_cents: debt.amount_cents
		}, after: patch
	});
	return getDebt(c, userId, debtId);
}

export async function deleteDebt(c, userId, debtId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.debts:cancel', 'finance.debts:edit', 'finance.debts:create'], 'Removing a debt');
	const debt = await getDebt(c, userId, debtId);
	if ((debt.payments || []).length || (debt.adjustments || []).length || (debt.transactions || []).length) {
		throw new BizError('This debt has financial history and cannot be deleted. Cancel it instead so its history is preserved.', 400);
	}
	await db(c).prepare(
		`UPDATE finance_debt SET is_del = 1, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(debtId).run();
	await audit(c, {
		entityType: 'debt', entityId: debtId, action: 'removed', actorId: userId,
		recordLabel: debt.name, before: { amount_cents: debt.amount_cents, creditor: debt.creditor },
		reason: text(body.reason, 300) || 'Removed before financial activity'
	});
	return { deleted: true, id: debtId };
}

export async function cancelDebt(c, userId, debtId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.debts:cancel', 'finance.debts:edit', 'finance.debts:create'], 'Cancelling a debt');
	const debt = await getDebt(c, userId, debtId);
	if (debt.status === 'cancelled') return debt;
	const reason = text(body.reason, 300);
	if (!reason) throw new BizError('Explain why this debt is being cancelled.', 400);
	await db(c).prepare(
		`UPDATE finance_debt SET status = 'cancelled', update_time = CURRENT_TIMESTAMP WHERE id = ? AND is_del = 0`
	).bind(debtId).run();
	await audit(c, {
		entityType: 'debt', entityId: debtId, action: 'cancelled', actorId: userId,
		recordLabel: debt.name, before: { status: debt.status, outstanding_cents: debt.outstanding_cents },
		after: { status: 'cancelled' }, reason
	});
	return getDebt(c, userId, debtId);
}

// A payment is a real movement of money, and the obligation's outstanding
// balance is derived from it. The outstanding figure is never typed by hand.
export async function payDebt(c, userId, debtId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.debts:pay', 'Recording a debt payment');
	const debt = await getDebt(c, userId, debtId);
	if (debt.status === 'cancelled') throw new BizError('This debt is cancelled.', 400);
	const amount = cents(body.amount_cents ?? body.amount);
	assertAmount(amount);
	const fee = cents(body.fee_cents ?? body.fee);
	const accountId = intOrNull(body.account_id) ?? debt.account_id;
	await assertAccountUsable(c, userId, keys, accountId);

	const txn = await createTransaction(c, userId, {
		type: 'debt_payment',
		amount_cents: amount,
		fee_cents: fee,
		currency: debt.currency || 'KES',
		account_id: accountId,
		debt_id: debtId,
		counterparty: debt.creditor || debt.name,
		category: 'Debt payment',
		description: text(body.description, 300) || `Payment towards ${debt.name}`,
		method: text(body.method, 60),
		reference: text(body.reference, 120),
		document_key: text(body.document_key, 300),
		txn_date: body.paid_at ? String(body.paid_at).slice(0, 10) : today(),
		notes: text(body.notes, 1000),
		status: 'posted',
	});

	await db(c).prepare(`
		INSERT INTO finance_payment
			(debt_id, related_type, amount_cents, fee_cents, currency, paid_at, method, reference,
			 paid_by, recipient, account_id, txn_id, evidence_key, notes, created_by, create_time)
		VALUES (?, 'debt', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`).bind(
		debtId, amount, fee, debt.currency || 'KES', body.paid_at || nowStamp(),
		text(body.method, 60), text(body.reference, 120), userId,
		debt.creditor || debt.name, accountId, txn.id, text(body.document_key, 300), text(body.notes, 500), userId,
	).run();

	await refreshDebt(c, debtId);
	await audit(c, {
		entityType: 'debt', entityId: debtId, action: 'payment', actorId: userId,
		amountCents: amount, accountId, recordLabel: debt.name,
		before: { outstanding_cents: debt.outstanding_cents },
		after: { payment_txn_id: txn.id, paid_cents: debt.paid_cents + amount },
		reason: text(body.description, 300),
	});
	return getDebt(c, userId, debtId);
}

async function refreshDebt(c, debtId) {
	const row = await db(c).prepare(`SELECT amount_cents, currency FROM finance_debt WHERE id = ?`).bind(debtId).first();
	if (!row) return;
	const adjustmentRow = await db(c).prepare(
		`SELECT COALESCE(SUM(amount_cents), 0) AS adjusted FROM finance_debt_adjustment WHERE debt_id = ?`
	).bind(debtId).first();
	const paidRow = await db(c).prepare(`
		SELECT COALESCE(SUM(amount_cents), 0) AS paid
		FROM finance_transactions
		WHERE debt_id = ? AND type = 'debt_payment' AND status = 'posted' AND is_del = 0
	`).bind(debtId).first();
	const outstanding = (Number(row.amount_cents) || 0) + (Number(adjustmentRow?.adjusted) || 0) - (Number(paidRow?.paid) || 0);
	await db(c).prepare(`
		UPDATE finance_debt
		SET paid_cents = ?, outstanding_cents = ?,
		    status = CASE WHEN ? = 'cancelled' THEN 'cancelled'
		                  WHEN ? <= 0 THEN 'paid'
		                  WHEN ? > 0 THEN 'partial'
		                  ELSE 'open' END,
		    update_time = CURRENT_TIMESTAMP
		WHERE id = ?
	`).bind(
		Number(paidRow?.paid) || 0, outstanding,
		row.status || 'open', outstanding, Number(paidRow?.paid) || 0, debtId,
	).run();
}

// Charges added after the debt was created. The original amount and the earlier
// history stay exactly as they were.
export async function addDebtCharge(c, userId, debtId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.debts:create', 'Adding a debt charge');
	const debt = await getDebt(c, userId, debtId);
	const amount = cents(body.amount_cents ?? body.amount);
	if (!amount) throw new BizError('Enter a non-zero amount.', 400);
	const reason = text(body.reason, 300);
	if (!reason) throw new BizError('A reason is required for a debt adjustment.', 400);

	await db(c).prepare(`
		INSERT INTO finance_debt_adjustment (debt_id, amount_cents, reason, actor_id, create_time)
		VALUES (?, ?, ?, ?, ?)
	`).bind(debtId, amount, reason, userId, nowStamp()).run();
	await refreshDebt(c, debtId);
	await audit(c, {
		entityType: 'debt', entityId: debtId, action: 'charge_added', actorId: userId,
		amountCents: amount, recordLabel: debt.name, reason,
		before: { outstanding_cents: debt.outstanding_cents },
		after: { adjustment_cents: amount },
	});
	return getDebt(c, userId, debtId);
}

// ---- subscriptions -------------------------------------------------------

function addCycle(dateStr, cycle, customDays) {
	const base = dateStr ? new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`) : new Date();
	if (Number.isNaN(base.getTime())) return dateStr;
 const next = new Date(base.getTime());
	const days = Number(customDays) || 0;
	if (cycle === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
	else if (cycle === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
	else if (cycle === 'quarterly') next.setUTCMonth(next.getUTCMonth() + 3);
	else if (cycle === 'semiannual') next.setUTCMonth(next.getUTCMonth() + 6);
	else if (cycle === 'annual') next.setUTCFullYear(next.getUTCFullYear() + 1);
	else if (cycle === 'custom' && days > 0) next.setUTCDate(next.getUTCDate() + days);
	return next.toISOString().slice(0, 10);
}

export async function listSubscriptions(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.subscriptions:view', 'Viewing subscriptions');
	const where = ['1 = 1'];
	const args = [];
	if (params.status) { where.push('status = ?'); args.push(params.status); }
	if (!isCompanyScope(keys)) { where.push('owner_id = ?'); args.push(userId); }
	const { results } = await db(c).prepare(
		`SELECT * FROM finance_subscription WHERE ${where.join(' AND ')}
		 ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trial' THEN 1 ELSE 2 END,
		          next_billing_date IS NULL, next_billing_date ASC`
	).bind(...args).all();

	const list = (results || []).map(row => decorateSubscription(row));
	return {
		list,
		total: list.length,
		monthlyCents: list.filter(r => r.status === 'active').reduce((sum, r) => sum + monthlyEquivalent(r), 0),
		annualCents: list.filter(r => r.status === 'active').reduce((sum, r) => sum + monthlyEquivalent(r) * 12, 0),
	};
}

// A subscription is quoted per cycle, but the budget is spent per month, so the
// monthly figure is what the overview and the budget comparison use.
function monthlyEquivalent(row) {
	const amount = Number(row.amount_cents) || 0;
	const cycle = row.billing_cycle;
	if (cycle === 'weekly') return Math.round((amount * 52) / 12);
	if (cycle === 'quarterly') return Math.round(amount / 3);
	if (cycle === 'semiannual') return Math.round(amount / 6);
	if (cycle === 'annual') return Math.round(amount / 12);
	return amount;
}

// reminder_offsets is data (7,3,2,1,0), never a list baked into the UI. A
// reminder at offset N fires N days before billing, so:
//   reminders_active      the windows we are inside today ("alert now")
//   next_reminder_in_days days until the next reminder fires, null if all fired
function decorateSubscription(row) {
	const next = row.next_billing_date ? String(row.next_billing_date).slice(0, 10) : null;
	const days = next ? Math.ceil((new Date(`${next}T00:00:00Z`) - new Date(`${today()}T00:00:00Z`)) / 86400000) : null;
	const offsets = String(row.reminder_offsets || '')
		.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value) && value >= 0)
		.sort((a, b) => b - a);
	let nextReminderDays = null;
	if (days !== null && days > 0) {
		const pending = offsets.filter(offset => offset < days);
		nextReminderDays = pending.length ? days - pending[0] : null;
	}
	return {
		...row,
		amount_cents: Number(row.amount_cents) || 0,
		next_billing_date: next,
		days_until_billing: days,
		overdue: days !== null && days < 0 && row.status === 'active',
		due_soon: days !== null && days >= 0 && days <= 7 && row.status === 'active',
		reminder_offsets_list: offsets,
		reminders_active: days === null ? [] : offsets.filter(offset => days <= offset),
		next_reminder_in_days: nextReminderDays,
		monthly_equivalent_cents: monthlyEquivalent(row),
	};
}

export async function getSubscription(c, userId, id) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.subscriptions:view', 'Viewing a subscription');
	const row = await db(c).prepare(`SELECT * FROM finance_subscription WHERE id = ?`).bind(id).first();
	if (!row) throw new BizError('Subscription not found.', 404);
	if (!isCompanyScope(keys) && Number(row.owner_id) !== Number(userId)) {
		throw new BizError('Subscription not found.', 404);
	}
	const { results: payments } = await db(c).prepare(`
		SELECT p.*, a.name AS account_name FROM finance_payment p
		LEFT JOIN finance_accounts a ON a.id = p.account_id
		WHERE p.related_type = 'subscription' AND p.related_id = ? ORDER BY p.id ASC
	`).bind(id).all();
	const { results: transactions } = await db(c).prepare(`
		SELECT * FROM finance_transactions WHERE subscription_id = ? ORDER BY id ASC
	`).bind(id).all();
	return { ...decorateSubscription(row), payments: payments || [], transactions: transactions || [] };
}

export async function createSubscription(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.subscriptions:manage', 'Creating a subscription');
	const service = text(body.service, 200);
	if (!service) throw new BizError('Service name is required.', 400);
	const amount = cents(body.amount_cents ?? body.amount);
	const cycle = ['weekly', 'monthly', 'quarterly', 'semiannual', 'annual', 'custom'].includes(body.billing_cycle)
		? body.billing_cycle : 'monthly';
	const offsets = Array.isArray(body.reminder_offsets)
		? body.reminder_offsets.join(',')
		: text(body.reminder_offsets, 60) || '7,1,0';
	const ownerId = intOrNull(body.owner_id) ?? userId;
	if (ownerId !== Number(userId) && !isCompanyScope(keys)) {
		throw new BizError('Assigning a subscription to another member requires company-wide Finance access.', 403);
	}

	const { meta } = await db(c).prepare(`
		INSERT INTO finance_subscription
			(service, vendor, category, description, amount_cents, currency, billing_cycle, start_date,
			 next_billing_date, payment_method, payment_reference, owner_id, team_id, status, auto_renew,
			 reminder_offsets, website, contract_key, notes, create_time, update_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		service, text(body.vendor, 200), text(body.category, 80), text(body.description, 400),
		amount, text(body.currency, 8).toUpperCase() || 'KES', cycle,
		body.start_date || today(),
		body.next_billing_date || addCycle(today(), cycle, body.custom_days),
		text(body.payment_method, 60), text(body.payment_reference, 120),
		ownerId, intOrNull(body.team_id),
		SUBSCRIPTION_STATUSES.includes(body.status) ? body.status : 'active',
		body.auto_renew === false ? 0 : 1, offsets,
		text(body.website, 300), text(body.contract_key, 300), text(body.notes, 1000),
	).run();
	const id = meta.last_row_id;
	await audit(c, {
		entityType: 'subscription', entityId: id, action: 'created', actorId: userId,
		amountCents: amount, recordLabel: service, after: { service, amount_cents: amount, billing_cycle: cycle },
	});
	return getSubscription(c, userId, id);
}

export async function updateSubscription(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.subscriptions:manage', 'Editing a subscription');
	const before = await getSubscription(c, userId, id);
	const patch = [];
	const args = [];
	const add = (column, value) => { if (value !== undefined) { patch.push(`${column} = ?`); args.push(value); } };
	const nextOwnerId = body.owner_id !== undefined ? intOrNull(body.owner_id) : null;
	if (nextOwnerId && nextOwnerId !== Number(before.owner_id) && !isCompanyScope(keys)) {
		throw new BizError('Assigning a subscription to another member requires company-wide Finance access.', 403);
	}
	add('service', body.service !== undefined ? text(body.service, 200) : undefined);
	add('vendor', body.vendor !== undefined ? text(body.vendor, 200) : undefined);
	add('category', body.category !== undefined ? text(body.category, 80) : undefined);
	add('description', body.description !== undefined ? text(body.description, 400) : undefined);
	add('status', body.status !== undefined ? text(body.status, 20) : undefined);
	add('billing_cycle', body.billing_cycle !== undefined ? text(body.billing_cycle, 20) : undefined);
	add('next_billing_date', body.next_billing_date !== undefined ? body.next_billing_date : undefined);
	add('payment_method', body.payment_method !== undefined ? text(body.payment_method, 60) : undefined);
	add('payment_reference', body.payment_reference !== undefined ? text(body.payment_reference, 120) : undefined);
	add('owner_id', body.owner_id !== undefined ? nextOwnerId : undefined);
	add('team_id', body.team_id !== undefined ? intOrNull(body.team_id) : undefined);
	add('website', body.website !== undefined ? text(body.website, 300) : undefined);
	add('notes', body.notes !== undefined ? text(body.notes, 1000) : undefined);
	add('auto_renew', body.auto_renew !== undefined ? (body.auto_renew ? 1 : 0) : undefined);
	if (body.amount_cents !== undefined || body.amount !== undefined) add('amount_cents', cents(body.amount_cents ?? body.amount));
	if (body.reminder_offsets !== undefined) {
		add('reminder_offsets', Array.isArray(body.reminder_offsets)
			? body.reminder_offsets.join(',')
			: text(body.reminder_offsets, 60));
	}
	if (body.status === 'cancelled') add('cancelled_at', nowStamp());
	if (patch.length) {
		args.push(id);
		await db(c).prepare(
			`UPDATE finance_subscription SET ${patch.join(', ')}, update_time = CURRENT_TIMESTAMP WHERE id = ?`
		).bind(...args).run();
	}
	await audit(c, {
		entityType: 'subscription', entityId: id, action: 'updated', actorId: userId,
		amountCents: body.amount_cents !== undefined ? cents(body.amount_cents) : before.amount_cents,
		recordLabel: body.service || before.service,
		before: { status: before.status, next_billing_date: before.next_billing_date, amount_cents: before.amount_cents },
		after: body,
	});
	return getSubscription(c, userId, id);
}

// Paying a subscription records one movement, advances the billing date and
// keeps every earlier payment.
export async function paySubscription(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.subscriptions:pay', 'Recording a subscription payment');
	const sub = await getSubscription(c, userId, id);
	const amount = cents(body.amount_cents ?? body.amount ?? sub.amount_cents);
	assertAmount(amount);
	const fee = cents(body.fee_cents ?? body.fee);
	const accountId = intOrNull(body.account_id);
	await assertAccountUsable(c, userId, keys, accountId);

	const txn = await createTransaction(c, userId, {
		type: 'subscription_payment',
		amount_cents: amount,
		fee_cents: fee,
		currency: sub.currency || 'KES',
		account_id: accountId,
		subscription_id: id,
		counterparty: sub.vendor || sub.service,
		category: sub.category || 'Subscriptions',
		description: text(body.description, 300) || `${sub.service} subscription`,
		method: text(body.method, 60) || sub.payment_method,
		reference: text(body.reference, 120) || sub.payment_reference,
		document_key: text(body.document_key, 300),
		txn_date: body.paid_at ? String(body.paid_at).slice(0, 10) : today(),
		notes: text(body.notes, 1000),
		status: 'posted',
	});

	await db(c).prepare(`
		INSERT INTO finance_payment
			(related_type, related_id, amount_cents, fee_cents, currency, paid_at, method, reference,
			 paid_by, recipient, account_id, txn_id, evidence_key, notes, created_by, create_time)
		VALUES ('subscription', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`).bind(
		id, amount, fee, sub.currency || 'KES', body.paid_at || nowStamp(),
		text(body.method, 60) || sub.payment_method, text(body.reference, 120) || sub.payment_reference,
		userId, sub.vendor || sub.service, accountId, txn.id, text(body.document_key, 300), text(body.notes, 500), userId,
	).run();

	await refreshSubscription(c, id);
	await audit(c, {
		entityType: 'subscription', entityId: id, action: 'paid', actorId: userId,
		amountCents: amount, accountId, recordLabel: sub.service,
		before: { next_billing_date: sub.next_billing_date, amount_cents: sub.amount_cents },
		after: { payment_txn_id: txn.id },
	});
	return getSubscription(c, userId, id);
}

async function refreshSubscription(c, id) {
	const row = await db(c).prepare(`SELECT next_billing_date, billing_cycle, auto_renew FROM finance_subscription WHERE id = ?`).bind(id).first();
	if (!row) return;
	const lastRow = await db(c).prepare(`
		SELECT MAX(paid_at) AS last_paid FROM finance_payment
		WHERE related_type = 'subscription' AND related_id = ?
	`).bind(id).first();
	const nextDate = row.auto_renew
		? addCycle(row.next_billing_date || today(), row.billing_cycle)
		: row.next_billing_date;
	await db(c).prepare(`
		UPDATE finance_subscription SET last_paid_at = ?, next_billing_date = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?
	`).bind(lastRow?.last_paid || null, nextDate, id).run();
}

export async function upcomingSubscriptions(c, userId, days = 30) {
	const { list } = await listSubscriptions(c, userId, { status: 'active' });
	const horizon = Number(days) || 30;
	return list.filter(row => row.days_until_billing !== null && row.days_until_billing <= horizon);
}

// ---- invoices ------------------------------------------------------------

export async function listInvoices(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:view', 'Viewing invoices');
	const where = ['i.is_del = 0'];
	const args = [];
	if (params.status) { where.push('i.status = ?'); args.push(params.status); }
	if (params.direction) { where.push('i.direction = ?'); args.push(params.direction); }
	const visibleAccounts = await visibleAccountIds(c, userId, keys);
	if (!isCompanyScope(keys)) {
		if (visibleAccounts?.length) {
			where.push(`(i.user_id = ? OR i.account_id IN (${visibleAccounts.map(() => '?').join(', ')}))`);
			args.push(userId, ...visibleAccounts);
		} else {
			where.push('i.user_id = ?');
			args.push(userId);
		}
	} else if (visibleAccounts !== null) {
		where.push(`(i.account_id IS NULL OR i.account_id IN (${visibleAccounts.length ? visibleAccounts.map(() => '?').join(', ') : 'NULL'}))`);
		args.push(...visibleAccounts);
	}
	const { results } = await db(c).prepare(
		`SELECT i.* FROM finance_invoices i WHERE ${where.join(' AND ')} ORDER BY i.id DESC`
	).bind(...args).all();
	const list = (results || []).map(decorateInvoice);
	// Receivables and payables are reported separately. Adding them would
	// describe money owed to us and money we owe as if they were one number.
	const open = list.filter(r => r.status !== 'cancelled');
	const sum = (rows) => rows.reduce((total, r) => total + r.balance_cents, 0);
	return {
		list,
		total: list.length,
		outstandingCents: sum(open.filter(r => r.direction !== 'vendor')),
		payableCents: sum(open.filter(r => r.direction === 'vendor')),
		overdueCents: sum(open.filter(r => r.overdue && r.direction !== 'vendor')),
		overduePayableCents: sum(open.filter(r => r.overdue && r.direction === 'vendor')),
	};
}

function decorateInvoice(row) {
	const total = Number(row.total_cents) || Number(row.amount_cents) || 0;
	const paid = Number(row.paid_cents) || 0;
	const balance = Math.max(0, total - paid);
	const overdue = row.status !== 'cancelled' && row.status !== 'draft'
		&& row.due_date && String(row.due_date).slice(0, 10) < today() && balance > 0;
	const status = row.status === 'cancelled' ? 'cancelled'
		: (balance <= 0 && total > 0 ? 'paid'
			: (overdue ? 'overdue'
				: (paid > 0 ? 'partial' : (row.status === 'draft' ? 'draft' : (row.status || 'sent')))));
	const direction = INVOICE_DIRECTIONS.includes(row.direction) ? row.direction : 'issued';
	return {
		...row,
		direction,
		direction_label: INVOICE_DIRECTION_LABELS[direction],
		total_cents: total,
		paid_cents: paid,
		balance_cents: balance,
		status,
		overdue: Boolean(overdue),
	};
}

export async function getInvoice(c, userId, id) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:view', 'Viewing an invoice');
	const row = await db(c).prepare(`SELECT * FROM finance_invoices WHERE id = ? AND is_del = 0`).bind(id).first();
	if (!row) throw new BizError('Invoice not found.', 404);
	const visibleAccounts = await visibleAccountIds(c, userId, keys);
	if (!isCompanyScope(keys)) {
		if (Number(row.user_id) !== Number(userId)
			&& (!row.account_id || (visibleAccounts !== null && !visibleAccounts.includes(Number(row.account_id))))) {
			throw new BizError('Invoice not found.', 404);
		}
	} else if (row.account_id && visibleAccounts !== null && !visibleAccounts.includes(Number(row.account_id))) {
		throw new BizError('Invoice not found.', 404);
	}
	const { results: items } = await db(c).prepare(
		`SELECT * FROM finance_invoice_item WHERE invoice_id = ? ORDER BY sort ASC, id ASC`
	).bind(id).all();
	const { results: payments } = await db(c).prepare(`
		SELECT p.*, a.name AS account_name FROM finance_payment p
		LEFT JOIN finance_accounts a ON a.id = p.account_id
		WHERE p.related_type = 'invoice' AND p.related_id = ? ORDER BY p.id ASC
	`).bind(id).all();
	const { results: transactions } = await db(c).prepare(
		`SELECT * FROM finance_transactions WHERE invoice_id = ? ORDER BY id ASC`
	).bind(id).all();
	return { ...decorateInvoice(row), items: items || [], payments: payments || [], transactions: transactions || [] };
}

export async function createInvoice(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:create', 'Creating an invoice');
	const items = Array.isArray(body.items) ? body.items : [];
	let subtotal = 0;
	const cleanItems = items.map((item, index) => {
		const rate = cents(item.rate_cents ?? item.rate);
		const quantity = Number(item.quantity) || 1;
		const amount = Math.round(rate * quantity);
		subtotal += amount;
		return {
			description: text(item.description, 300),
			quantity,
			rate_cents: rate,
			amount_cents: amount,
			sort: index,
		};
	});
	if (!cleanItems.length) {
		const fallback = cents(body.subtotal_cents ?? body.amount_cents ?? body.amount);
		if (fallback > 0) {
			cleanItems.push({ description: text(body.description, 300) || 'Services', quantity: 1, rate_cents: fallback, amount_cents: fallback, sort: 0 });
			subtotal = fallback;
		}
	}
	const tax = cents(body.tax_cents ?? body.tax);
	const total = subtotal + tax;
	const invoiceNumber = text(body.invoice_number, 60)
		|| `${INVOICE_DIRECTIONS.includes(body.direction) && body.direction === 'vendor' ? 'BILL' : 'INV'}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
	const direction = INVOICE_DIRECTIONS.includes(body.direction) ? body.direction : 'issued';
	const accountId = intOrNull(body.account_id);
	if (accountId) await assertAccountUsable(c, userId, keys, accountId);

	const { meta } = await db(c).prepare(`
		INSERT INTO finance_invoices
			(user_id, invoice_number, client_name, customer_email, amount_cents, subtotal_cents,
			 tax_cents, total_cents, paid_cents, balance_cents, currency, status, issue_date, due_date,
			 account_id, notes, direction, create_time, update_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		userId, invoiceNumber, text(body.client_name ?? body.customer_name, 200),
		text(body.customer_email, 200), total, subtotal, tax, total, total,
		text(body.currency, 8).toUpperCase() || 'KES',
		INVOICE_STATUSES.includes(body.status) ? body.status : 'draft',
		body.issue_date || today(), body.due_date || addCycle(today(), 'monthly'),
		accountId, text(body.notes, 1000), direction,
	).run();
	const invoiceId = meta.last_row_id;
	for (const item of cleanItems) {
		await db(c).prepare(`
			INSERT INTO finance_invoice_item (invoice_id, description, quantity, rate_cents, amount_cents, sort)
			VALUES (?, ?, ?, ?, ?, ?)
		`).bind(invoiceId, item.description, item.quantity, item.rate_cents, item.amount_cents, item.sort).run();
	}
	await audit(c, {
		entityType: 'invoice', entityId: invoiceId, action: 'created', actorId: userId,
		amountCents: total, recordLabel: invoiceNumber, after: { invoice_number: invoiceNumber, total_cents: total },
	});
	return getInvoice(c, userId, invoiceId);
}

export async function updateInvoice(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:manage', 'Editing an invoice');
	const before = await getInvoice(c, userId, id);
	const patch = [];
	const args = [];
	const add = (column, value) => { if (value !== undefined) { patch.push(`${column} = ?`); args.push(value); } };
	const nextAccountId = body.account_id !== undefined ? intOrNull(body.account_id) : null;
	if (nextAccountId) await assertAccountUsable(c, userId, keys, nextAccountId);
	add('client_name', body.client_name !== undefined ? text(body.client_name, 200) : undefined);
	add('customer_email', body.customer_email !== undefined ? text(body.customer_email, 200) : undefined);
	add('issue_date', body.issue_date !== undefined ? body.issue_date : undefined);
	add('due_date', body.due_date !== undefined ? body.due_date : undefined);
	add('status', body.status !== undefined ? text(body.status, 20) : undefined);
	add('notes', body.notes !== undefined ? text(body.notes, 1000) : undefined);
	add('account_id', body.account_id !== undefined ? nextAccountId : undefined);
	if (body.status === 'sent' && !before.sent_at) add('sent_at', nowStamp());

	// Line items are the invoice. Replacing them recomputes the totals from the
	// lines, so an edited quantity can never leave a stale amount behind.
	if (Array.isArray(body.items)) {
		let subtotal = 0;
		const cleanItems = body.items.map((item, index) => {
			const rate = cents(item.rate_cents ?? item.rate);
			const quantity = Number(item.quantity) || 1;
			const amount = Math.round(rate * quantity);
			subtotal += amount;
			return {
				description: text(item.description, 300), quantity, rate_cents: rate,
				amount_cents: amount, sort: index,
			};
		});
		const tax = cents(body.tax_cents ?? body.tax ?? before.tax_cents);
		const total = subtotal + tax;
		if (total < before.paid_cents) {
			throw new BizError(
				`That would make the invoice smaller than the ${formatCents(before.paid_cents)} already paid.`,
				400,
			);
		}
		add('amount_cents', total);
		add('subtotal_cents', subtotal);
		add('tax_cents', tax);
		add('total_cents', total);
		add('balance_cents', Math.max(0, total - before.paid_cents));
		await db(c).prepare(`DELETE FROM finance_invoice_item WHERE invoice_id = ?`).bind(id).run();
		for (const item of cleanItems) {
			await db(c).prepare(`
				INSERT INTO finance_invoice_item (invoice_id, description, quantity, rate_cents, amount_cents, sort)
				VALUES (?, ?, ?, ?, ?, ?)
			`).bind(id, item.description, item.quantity, item.rate_cents, item.amount_cents, item.sort).run();
		}
	}

	if (patch.length) {
		args.push(id);
		await db(c).prepare(
			`UPDATE finance_invoices SET ${patch.join(', ')}, update_time = CURRENT_TIMESTAMP WHERE id = ?`
		).bind(...args).run();
	}
	await refreshInvoice(c, id);
	await audit(c, {
		entityType: 'invoice', entityId: id, action: 'updated', actorId: userId,
		amountCents: before.total_cents, recordLabel: before.invoice_number,
		before: { status: before.status, due_date: before.due_date, total_cents: before.total_cents },
		after: body,
	});
	return getInvoice(c, userId, id);
}

export async function payInvoice(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:manage', 'Recording an invoice payment');
	const invoice = await getInvoice(c, userId, id);
	if (invoice.status === 'cancelled') throw new BizError('This invoice is cancelled.', 400);
	const amount = cents(body.amount_cents ?? body.amount);
	assertAmount(amount);
	if (amount > invoice.balance_cents) {
		throw new BizError(`That is more than the invoice balance (${formatCents(invoice.balance_cents)}).`, 400);
	}
	const fee = cents(body.fee_cents ?? body.fee);
	const accountId = intOrNull(body.account_id);
	await assertAccountUsable(c, userId, keys, accountId);

	// Paying a supplier bill is money leaving the company, so it posts as a
	// payment against a supplier category. Paying a customer invoice is money
	// arriving. The direction on the invoice decides, not the caller.
	const isVendorBill = invoice.direction === 'vendor';
	const txn = await createTransaction(c, userId, {
		type: isVendorBill ? 'payment' : 'invoice_payment',
		amount_cents: amount,
		fee_cents: fee,
		currency: invoice.currency || 'KES',
		account_id: accountId,
		invoice_id: id,
		counterparty: invoice.client_name,
		category: isVendorBill ? 'Suppliers' : 'Income',
		description: text(body.description, 300)
			|| `${isVendorBill ? 'Payment for bill' : 'Payment for'} ${invoice.invoice_number}`,
		method: text(body.method, 60),
		reference: text(body.reference, 120),
		document_key: text(body.document_key, 300),
		txn_date: body.paid_at ? String(body.paid_at).slice(0, 10) : today(),
		notes: text(body.notes, 1000),
		status: 'posted',
	});

	await db(c).prepare(`
		INSERT INTO finance_payment
			(related_type, related_id, amount_cents, fee_cents, currency, paid_at, method, reference,
			 paid_by, recipient, account_id, txn_id, evidence_key, notes, created_by, create_time)
		VALUES ('invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
	`).bind(
		id, amount, fee, invoice.currency || 'KES', body.paid_at || nowStamp(),
		text(body.method, 60), text(body.reference, 120), userId, invoice.client_name,
		accountId, txn.id, text(body.document_key, 300), text(body.notes, 500), userId,
	).run();

	await refreshInvoice(c, id);
	await audit(c, {
		entityType: 'invoice', entityId: id, action: 'paid', actorId: userId,
		amountCents: amount, accountId, recordLabel: invoice.invoice_number,
		before: { paid_cents: invoice.paid_cents, balance_cents: invoice.balance_cents },
		after: { payment_txn_id: txn.id },
	});
	return getInvoice(c, userId, id);
}

async function refreshInvoice(c, id) {
	const row = await db(c).prepare(`SELECT total_cents, status, direction FROM finance_invoices WHERE id = ?`).bind(id).first();
	if (!row) return;
	// A supplier bill is settled with a payment (money out); an issued invoice
	// is settled with an invoice payment (money in). Both are movements against
	// the same invoice, so both count towards what has been settled.
	const paidRow = await db(c).prepare(`
		SELECT COALESCE(SUM(amount_cents), 0) AS paid
		FROM finance_transactions
		WHERE invoice_id = ? AND type IN ('invoice_payment', 'payment')
		  AND status = 'posted' AND is_del = 0
	`).bind(id).first();
	const paid = Number(paidRow?.paid) || 0;
	const total = Number(row.total_cents) || 0;
	const balance = Math.max(0, total - paid);
	const status = row.status === 'cancelled' ? 'cancelled'
		: (balance <= 0 && total > 0 ? 'paid' : (paid > 0 ? 'partial' : row.status));
	await db(c).prepare(`
		UPDATE finance_invoices SET paid_cents = ?, balance_cents = ?, status = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?
	`).bind(paid, balance, status, id).run();
}

// ---- reimbursements ------------------------------------------------------

export async function listReimbursements(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:view', 'Viewing reimbursements');
	const where = ['1 = 1'];
	const args = [];
	if (params.status) { where.push('status = ?'); args.push(params.status); }
	const canReviewClaims = hasPerm(keys, 'finance:approve') || hasPerm(keys, 'finance.budgets:manage');
	if (!isCompanyScope(keys) && !canReviewClaims) { where.push('member_id = ?'); args.push(userId); }
	const { results } = await db(c).prepare(
		`SELECT r.*, u.display_name AS member_name FROM finance_reimbursement r
		 LEFT JOIN user u ON u.user_id = r.member_id WHERE ${where.join(' AND ')} ORDER BY r.id DESC`
	).bind(...args).all();
	return { list: results || [], total: (results || []).length };
}

export async function createReimbursement(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:create', 'Submitting a reimbursement');
	const amount = cents(body.amount_cents ?? body.amount);
	assertAmount(amount);
	const reason = text(body.reason, 300);
	if (!reason) throw new BizError('Tell us what the expense was for.', 400);
	const memberId = intOrNull(body.member_id) ?? userId;
	if (memberId !== Number(userId)) throw new BizError('Submit a reimbursement from your own account. Finance can review it after submission.', 403);
	const { meta } = await db(c).prepare(`
		INSERT INTO finance_reimbursement
			(member_id, amount_cents, currency, reason, status, notes, document_key, create_time, update_time)
		VALUES (?, ?, ?, ?, 'submitted', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		memberId, amount,
		text(body.currency, 8).toUpperCase() || 'KES', reason, text(body.notes, 1000), text(body.document_key, 300),
	).run();
	const id = meta.last_row_id;
	await audit(c, {
		entityType: 'reimbursement', entityId: id, action: 'submitted', actorId: userId,
		amountCents: amount, recordLabel: reason, after: { amount_cents: amount, status: 'submitted' },
	});
	return { id, status: 'submitted' };
}

export async function reviewReimbursement(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.budgets:manage', 'finance:approve'], 'Reviewing a reimbursement');
	const row = await db(c).prepare(`SELECT * FROM finance_reimbursement WHERE id = ?`).bind(id).first();
	if (!row) throw new BizError('Reimbursement not found.', 404);
	// Once money has moved the claim is settled: rewriting its status would make
	// the paid transaction and the claim disagree about what happened.
	if (row.status === 'paid') throw new BizError('A paid claim cannot be reviewed again.', 400);
	const status = ['reviewed', 'approved', 'declined'].includes(body.status) ? body.status : 'reviewed';
	await db(c).prepare(`
		UPDATE finance_reimbursement SET status = ?, reviewer_id = ?, reviewed_at = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?
	`).bind(status, userId, nowStamp(), id).run();
	await audit(c, {
		entityType: 'reimbursement', entityId: id, action: status, actorId: userId,
		amountCents: row.amount_cents, recordLabel: row.reason, before: { status: row.status }, after: { status },
		reason: text(body.reason, 300),
	});
	return { id, status };
}

// Paying a reimbursement is the point where money actually leaves an account.
export async function payReimbursement(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:create', 'Paying a reimbursement');
	const row = await db(c).prepare(`SELECT * FROM finance_reimbursement WHERE id = ?`).bind(id).first();
	if (!row) throw new BizError('Reimbursement not found.', 404);
	if (row.status === 'paid') throw new BizError('This reimbursement is already paid.', 400);
	// A declined claim is refused money. Paying it would contradict the review.
	if (row.status === 'declined') throw new BizError('This claim was declined, so it cannot be paid.', 400);
	if (row.status === 'submitted') throw new BizError('Review and approve this claim before paying it.', 400);
	const accountId = intOrNull(body.account_id);
	await assertAccountUsable(c, userId, keys, accountId);
	const txn = await createTransaction(c, userId, {
		type: 'reimbursement',
		amount_cents: row.amount_cents,
		currency: row.currency || 'KES',
		account_id: accountId,
		reimbursement_id: id,
		counterparty: '',
		category: 'Reimbursement',
		description: text(body.description, 300) || `Reimbursement: ${row.reason}`,
		method: text(body.method, 60),
		reference: text(body.reference, 120),
		txn_date: today(),
		notes: row.notes,
		status: 'posted',
	});
	await db(c).prepare(`
		UPDATE finance_reimbursement SET status = 'paid', txn_id = ?, account_id = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?
	`).bind(txn.id, accountId, id).run();
	await audit(c, {
		entityType: 'reimbursement', entityId: id, action: 'paid', actorId: userId,
		amountCents: row.amount_cents, accountId, recordLabel: row.reason,
		after: { payment_txn_id: txn.id },
	});
	return { id, status: 'paid', transaction: txn };
}

// ---- advances ------------------------------------------------------------

export async function listAdvances(c, userId) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:view', 'Viewing advances');
	const visible = await visibleAccountIds(c, userId, keys);
	const where = [];
	const args = [];
	if (visible !== null) {
		// Without company scope an advance is only visible when the account it
		// was paid from is one this member can see.
		if (!visible.length) return { list: [], total: 0 };
		where.push(`a.account_id IN (${visible.map(() => '?').join(',')})`);
		args.push(...visible);
	}
	const { results } = await db(c).prepare(`
		SELECT a.*, u.display_name AS member_name FROM finance_advance a
		LEFT JOIN user u ON u.user_id = a.member_id
		${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY a.id DESC
	`).bind(...args).all();
	return { list: results || [], total: (results || []).length };
}

export async function createAdvance(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:create', 'Issuing an advance');
	const amount = cents(body.amount_cents ?? body.amount);
	assertAmount(amount);
	const accountId = intOrNull(body.account_id);
	await assertAccountUsable(c, userId, keys, accountId);
	const { meta } = await db(c).prepare(`
		INSERT INTO finance_advance
			(member_id, amount_cents, spent_cents, returned_cents, currency, purpose, status,
			 account_id, issued_on, notes, create_time, update_time)
		VALUES (?, ?, 0, 0, ?, ?, 'issued', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	`).bind(
		intOrNull(body.member_id) ?? userId, amount, text(body.currency, 8).toUpperCase() || 'KES',
		text(body.purpose, 300), accountId, body.issued_on || today(), text(body.notes, 500),
	).run();
	const id = meta.last_row_id;
	const txn = await createTransaction(c, userId, {
		type: 'advance',
		amount_cents: amount,
		currency: text(body.currency, 8).toUpperCase() || 'KES',
		account_id: accountId,
		advance_id: id,
		counterparty: '',
		category: 'Advances',
		description: text(body.purpose, 300) || 'Cash advance issued',
		method: text(body.method, 60),
		reference: text(body.reference, 120),
		txn_date: body.issued_on || today(),
		status: 'posted',
	});
	await audit(c, {
		entityType: 'advance', entityId: id, action: 'issued', actorId: userId,
		amountCents: amount, accountId, recordLabel: text(body.purpose, 120),
		after: { amount_cents: amount, transaction_id: txn.id },
	});
	return { id, status: 'issued', transaction: txn };
}

// Closing an advance splits it into what was actually spent and what came back.
// The spent part is a real expense; the returned part is cash coming back into
// the account, which is not income because it was never revenue in the first
// place. Without this an advance would stay open forever with a zero split.
export async function settleAdvance(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:create', 'Settling an advance');
	const row = await db(c).prepare(`SELECT * FROM finance_advance WHERE id = ?`).bind(id).first();
	if (!row) throw new BizError('Advance not found.', 404);
	if (row.status !== 'issued') throw new BizError('This advance is already settled.', 400);

	const spent = cents(body.spent_cents ?? body.spent);
	const returned = cents(body.returned_cents ?? body.returned);
	if (spent < 0 || returned < 0) throw new BizError('Spent and returned cannot be negative.', 400);
	const amount = cents(row.amount_cents);
	if (spent + returned !== amount) {
		throw new BizError('Spent plus returned has to equal the advance amount.', 400);
	}

	const accountId = intOrNull(body.account_id) ?? intOrNull(row.account_id);
	await assertAccountUsable(c, userId, keys, accountId);

	const shared = {
		account_id: accountId,
		advance_id: id,
		method: text(body.method, 60),
		reference: text(body.reference, 120),
		txn_date: body.settle_date || today(),
		status: 'posted',
	};

	let spentTxn = null;
	if (spent > 0) {
		spentTxn = await createTransaction(c, userId, {
			...shared,
			type: 'expense',
			amount_cents: spent,
			category: 'Advance spent',
			description: text(body.description, 300) || `${text(row.purpose, 200)} (advance spent)`,
		});
	}

	let returnedTxn = null;
	if (returned > 0) {
		returnedTxn = await createTransaction(c, userId, {
			...shared,
			type: 'advance_return',
			amount_cents: returned,
			category: 'Advance returned',
			description: text(body.description, 300) || `${text(row.purpose, 200)} (advance returned)`,
		});
	}

	await db(c).prepare(`
		UPDATE finance_advance
		SET status = 'settled', spent_cents = ?, returned_cents = ?, account_id = ?, update_time = CURRENT_TIMESTAMP
		WHERE id = ?
	`).bind(spent, returned, accountId, id).run();

	await audit(c, {
		entityType: 'advance', entityId: id, action: 'settled', actorId: userId,
		amountCents: amount, accountId,
		recordLabel: text(row.purpose, 120),
		before: { status: row.status },
		after: { spent_cents: spent, returned_cents: returned, expense_txn_id: spentTxn?.id ?? null, return_txn_id: returnedTxn?.id ?? null },
	});

	return {
		id,
		status: 'settled',
		spent_cents: spent,
		returned_cents: returned,
		expense_txn_id: spentTxn?.id ?? null,
		return_txn_id: returnedTxn?.id ?? null,
	};
}

// ---- overview ------------------------------------------------------------

function periodStart(period) {
	const now = new Date();
	const iso = now.toISOString().slice(0, 10);
	if (period === 'today') return iso;
	if (period === 'week') {
		const day = now.getUTCDay() || 7;
		now.setUTCDate(now.getUTCDate() - (day - 1));
		return now.toISOString().slice(0, 10);
	}
	if (period === 'month') return `${iso.slice(0, 7)}-01`;
	if (period === 'quarter') {
		const month = Math.floor(now.getUTCMonth() / 3) * 3;
		return `${now.getUTCFullYear()}-${String(month + 1).padStart(2, '0')}-01`;
	}
	if (period === 'year') return `${iso.slice(0, 4)}-01-01`;
	return iso.slice(0, 7) + '-01';
}

export async function overview(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:view', 'Viewing finance');
	const visible = await visibleAccountIds(c, userId, keys);
	const from = params.from || periodStart(params.period || 'month');
	const to = params.to || today();

	let accountWhere = 'is_del = 0';
	const accountArgs = [];
	if (visible !== null) {
		if (!visible.length) {
			return {
				companyScope: false, accounts: [], totalBalanceCents: 0, incomeCents: 0, expenseCents: 0,
				feesCents: 0, transfersCents: 0, advancesCents: 0, netCents: 0,
				outstandingDebtCents: 0, overdueDebtCents: 0, committedCents: 0,
				invoiceOutstandingCents: 0, overdueInvoiceCents: 0, vendorBillCents: 0, budgets: [], overBudget: [],
				nearThreshold: [], dueSubscriptions: [], upcoming: [],
			};
		}
		accountWhere += ` AND id IN (${visible.map(() => '?').join(',')})`;
		accountArgs.push(...visible);
	}
	const { results: accountRows } = await db(c).prepare(
		`SELECT id, name, currency, status, opening_cents,
		 opening_cents + COALESCE((SELECT SUM(CASE WHEN t.direction = 'in' THEN t.amount_cents
		                                          ELSE -(t.amount_cents + t.fee_cents) END)
		                           FROM finance_transactions t
		                           WHERE t.account_id = finance_accounts.id AND t.status = 'posted' AND t.is_del = 0), 0) AS balance
		 FROM finance_accounts WHERE ${accountWhere}`
	).bind(...accountArgs).all();
	const accounts = (accountRows || []).map(row => ({ ...row, balance_cents: Number(row.balance) || 0 }));
	const totalBalanceCents = accounts.filter(a => a.status === 'active').reduce((sum, a) => sum + a.balance_cents, 0);

	const visibleSql = visible === null ? '' : (visible.length
		? ` AND account_id IN (${visible.map(() => '?').join(',')})`
		: ' AND 1 = 0');
	const visibleArgs = visible === null ? [] : visible;

	const flow = await db(c).prepare(`
		SELECT
			COALESCE(SUM(CASE WHEN direction = 'in' AND type NOT IN ('transfer', 'advance', 'advance_return') THEN amount_cents ELSE 0 END), 0) AS income_cents,
			COALESCE(SUM(CASE WHEN direction = 'out' AND type NOT IN ('transfer', 'advance') THEN amount_cents ELSE 0 END), 0) AS expense_cents,
			COALESCE(SUM(CASE WHEN direction = 'out' THEN fee_cents ELSE 0 END), 0) AS fees_cents,
			COALESCE(SUM(CASE WHEN direction = 'out' AND type = 'transfer' THEN amount_cents ELSE 0 END), 0) AS transfers_cents,
			COALESCE(SUM(CASE WHEN direction = 'out' AND type = 'advance' THEN amount_cents ELSE 0 END), 0)
			  - COALESCE(SUM(CASE WHEN type = 'advance_return' THEN amount_cents ELSE 0 END), 0) AS advances_cents
		FROM finance_transactions
		WHERE status = 'posted' AND is_del = 0
		  AND COALESCE(txn_date, substr(create_time,1,10)) >= ?
		  AND COALESCE(txn_date, substr(create_time,1,10)) <= ?${visibleSql}
	`).bind(from, to, ...visibleArgs).first();

	// Each block needs its own key. A member who can read the ledger but not
	// subscriptions should still get a cash position, not a 403 for the whole
	// page, so an unreadable block degrades to "not available to you".
	const optional = async (fallback, run) => {
		try {
			return await run();
		} catch (error) {
			// Deliberately silent: this is a scope decision, not a fault, and a
			// member must not learn from a log line what they cannot read.
			if (error?.code === 403) return fallback;
			throw error;
		}
	};

	const { list: budgets } = await optional({ list: [] }, () => listBudgets(c, userId, {}));
	const committedCents = budgets.reduce((sum, b) => sum + b.committed_cents, 0);
	const overBudget = budgets.filter(b => b.over_budget);
	const nearThreshold = budgets.filter(b => b.near_threshold);

	const { list: subs } = await optional({ list: [] }, () => listSubscriptions(c, userId, {}));
	const dueSubscriptions = subs
		.filter(s => s.status === 'active' && s.days_until_billing !== null)
		.sort((a, b) => a.days_until_billing - b.days_until_billing)
		.slice(0, 5)
		.map(s => ({ id: s.id, service: s.service, amount_cents: s.amount_cents, days: s.days_until_billing }));

	const { list: invoices, outstandingCents: invoiceOutstanding, payableCents: invoicePayable } = await optional(
		{ list: [], outstandingCents: 0, payableCents: 0 }, () => listInvoices(c, userId, {})
	);
	// Only issued invoices are money owed to us. Supplier bills are reported as
	// payables and never added to receivables, so the two can never double count.
	const overdueInvoices = invoices.filter(i => i.overdue && i.direction !== 'vendor');

	const debts = (await optional(null, async () => (await listDebts(c, userId, {})).list)) || [];
	const openDebts = debts.filter(d => d.status !== 'cancelled');
	const outstandingDebtCents = openDebts.reduce((sum, d) => sum + (Number(d.outstanding_cents) || 0), 0);
	const overdueDebtCents = openDebts
		.filter(d => d.overdue)
		.reduce((sum, d) => sum + (Number(d.outstanding_cents) || 0), 0);

	const upcoming = [];
	for (const s of subs.filter(x => x.status === 'active' && x.days_until_billing !== null && x.days_until_billing <= 30)) {
		upcoming.push({ kind: 'subscription', id: s.id, label: s.service, amount_cents: s.amount_cents, days: s.days_until_billing });
	}
	for (const d of openDebts) {
		if (d.due_date && d.outstanding_cents > 0) {
			const days = Math.ceil((new Date(`${String(d.due_date).slice(0, 10)}T00:00:00Z`) - new Date(`${today()}T00:00:00Z`)) / 86400000);
			upcoming.push({ kind: 'debt', id: d.id, label: d.name, amount_cents: d.outstanding_cents, days });
		}
	}
	for (const i of overdueInvoices.slice(0, 5)) {
		upcoming.push({ kind: 'invoice', id: i.id, label: i.invoice_number, amount_cents: i.balance_cents, days: -1 });
	}
	// A supplier bill that is past due is a bill to pay, not money owed to us.
	for (const i of invoices.filter(x => x.overdue && x.direction === 'vendor').slice(0, 5)) {
		upcoming.push({ kind: 'bill', id: i.id, label: i.invoice_number, amount_cents: i.balance_cents, days: -1 });
	}
	upcoming.sort((a, b) => a.days - b.days);

	return {
		companyScope: isCompanyScope(keys),
		period: { from, to },
		accounts,
		totalBalanceCents,
		incomeCents: Number(flow?.income_cents) || 0,
		expenseCents: Number(flow?.expense_cents) || 0,
		feesCents: Number(flow?.fees_cents) || 0,
		transfersCents: Number(flow?.transfers_cents) || 0,
		advancesCents: Number(flow?.advances_cents) || 0,
		netCents: (Number(flow?.income_cents) || 0) - (Number(flow?.expense_cents) || 0),
		outstandingDebtCents,
		overdueDebtCents,
		committedCents,
		invoiceOutstandingCents: invoiceOutstanding,
		vendorBillCents: invoicePayable,
		overdueInvoiceCents: overdueInvoices.reduce((sum, i) => sum + i.balance_cents, 0),
		budgets: budgets.slice(0, 5),
		overBudget: overBudget.map(b => ({ id: b.id, name: b.name, variance_cents: b.variance_cents, used_percent: b.used_percent })),
		nearThreshold: nearThreshold.map(b => ({ id: b.id, name: b.name, used_percent: b.used_percent })),
		subscriptionsDue: dueSubscriptions,
		upcoming: upcoming.slice(0, 12),
		negativeAccounts: accounts.filter(a => a.balance_cents < 0).map(a => ({ id: a.id, name: a.name, balance_cents: a.balance_cents })),
	};
}

// ---- reports -------------------------------------------------------------

export async function spendingByCategory(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	const visible = await visibleAccountIds(c, userId, keys);
	const where = [`status = 'posted'`, `is_del = 0`, `direction = 'out'`, `type NOT IN ('transfer', 'advance')`];
	const args = [];
	if (visible !== null) {
		if (!visible.length) return { list: [], totalCents: 0 };
		where.push(`account_id IN (${visible.map(() => '?').join(',')})`);
		args.push(...visible);
	}
	if (params.from) { where.push('COALESCE(txn_date, substr(create_time,1,10)) >= ?'); args.push(params.from); }
	if (params.to) { where.push('COALESCE(txn_date, substr(create_time,1,10)) <= ?'); args.push(params.to); }
	const { results } = await db(c).prepare(`
		SELECT COALESCE(NULLIF(category, ''), 'Uncategorised') AS category,
		       COUNT(*) AS count, SUM(amount_cents) AS amount_cents, SUM(fee_cents) AS fee_cents
		FROM finance_transactions WHERE ${where.join(' AND ')}
		GROUP BY COALESCE(NULLIF(category, ''), 'Uncategorised')
		ORDER BY amount_cents DESC
	`).bind(...args).all();
	const list = (results || []).map(row => ({ ...row, amount_cents: Number(row.amount_cents) || 0, fee_cents: Number(row.fee_cents) || 0 }));
	return { list, totalCents: list.reduce((sum, row) => sum + row.amount_cents + row.fee_cents, 0) };
}

// Fund utilization answers "the KES 100,000 launch fund: where did it go?".
export async function fundUtilization(c, userId, accountId) {
	const keys = await permKeys(c, userId);
	const account = await getAccount(c, userId, accountId);
	const { results } = await db(c).prepare(`
		SELECT type, category, counterparty, description, amount_cents, fee_cents, direction, txn_date, status
		FROM finance_transactions
		WHERE account_id = ? AND is_del = 0
		ORDER BY COALESCE(txn_date, substr(create_time,1,10)) ASC, id ASC
	`).bind(accountId).all();
	const rows = (results || []).filter(row => row.status === 'posted');
	const moneyIn = rows.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount_cents, 0);
	const moneyOut = rows.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount_cents + r.fee_cents, 0);
	const fees = rows.filter(r => r.direction === 'out').reduce((s, r) => s + r.fee_cents, 0);
	const byCategory = {};
	for (const row of rows.filter(r => r.direction === 'out')) {
		const key = row.category || 'Uncategorised';
		byCategory[key] = (byCategory[key] || 0) + row.amount_cents + row.fee_cents;
	}
	return {
		account,
		opening_cents: Number(account.opening_cents) || 0,
		money_in_cents: moneyIn,
		money_out_cents: moneyOut,
		fees_cents: fees,
		closing_cents: account.balance_cents,
		utilization_percent: percent(moneyOut, moneyIn + (Number(account.opening_cents) || 0)),
		by_category: Object.entries(byCategory).map(([name, cents]) => ({ name, amount_cents: cents })),
		rows,
	};
}

// The cash-flow report: where the company stood when the period opened, what
// came in, what went out, what the payment providers kept, and where it stands
// now. Every figure is derived from posted movements and filtered by the same
// account scope as the ledger, so a total can never leak a balance the caller
// is not allowed to see.
export async function financeSummary(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.transactions:view', 'Viewing finance reports');
	const visible = await visibleAccountIds(c, userId, keys);
	const from = params.from || periodStart(params.period || 'month');
	const to = params.to || today();

	const empty = {
		from, to, opening_cents: 0, income_cents: 0, expense_cents: 0, fees_cents: 0,
		transfers_cents: 0, net_cents: 0, closing_cents: 0, by_account: [], by_counterparty: [],
	};
	if (visible !== null && !visible.length) return empty;

	const accountWhere = ['a.is_del = 0'];
	const accountArgs = [];
	if (visible !== null) {
		accountWhere.push(`a.id IN (${visible.map(() => '?').join(',')})`);
		accountArgs.push(...visible);
	}
	const { results: accountRows } = await db(c).prepare(`
		SELECT a.id, a.name, a.currency, a.status, a.opening_cents,
		       a.opening_cents + COALESCE((SELECT SUM(CASE WHEN t.direction = 'in'
		                                                   THEN t.amount_cents
		                                                   ELSE -(t.amount_cents + t.fee_cents) END)
		                                     FROM finance_transactions t
		                                     WHERE t.account_id = a.id AND t.status = 'posted' AND t.is_del = 0), 0) AS balance
		FROM finance_accounts a WHERE ${accountWhere.join(' AND ')}
		ORDER BY a.name COLLATE NOCASE
	`).bind(...accountArgs).all();

	const flowWhere = [`status = 'posted'`, `is_del = 0`,
		`COALESCE(txn_date, substr(create_time,1,10)) >= ?`,
		`COALESCE(txn_date, substr(create_time,1,10)) <= ?`];
	const flowArgs = [from, to];
	if (visible !== null) {
		flowWhere.push(`account_id IN (${visible.map(() => '?').join(',')})`);
		flowArgs.push(...visible);
	}
	const flowSql = flowWhere.join(' AND ');
	const { results: flowRows } = await db(c).prepare(`
		SELECT account_id,
		       SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE 0 END) AS in_cents,
		       SUM(CASE WHEN direction = 'out' THEN amount_cents + fee_cents ELSE 0 END) AS out_cents,
		       SUM(CASE WHEN direction = 'out' THEN fee_cents ELSE 0 END) AS fee_cents,
		       SUM(CASE WHEN direction = 'in' AND type NOT IN ('transfer', 'advance', 'advance_return') THEN amount_cents ELSE 0 END) AS income_cents,
		       SUM(CASE WHEN direction = 'out' AND type NOT IN ('transfer', 'advance') THEN amount_cents ELSE 0 END) AS expense_cents,
		       SUM(CASE WHEN type = 'transfer' AND direction = 'out' THEN amount_cents ELSE 0 END) AS transfer_cents,
		       SUM(CASE WHEN type = 'advance' AND direction = 'out' THEN amount_cents ELSE 0 END)
		         - SUM(CASE WHEN type = 'advance_return' THEN amount_cents ELSE 0 END) AS advance_cents
		FROM finance_transactions WHERE ${flowSql}
		GROUP BY account_id
	`).bind(...flowArgs).all();

	const flowByAccount = new Map((flowRows || []).map(row => [Number(row.account_id), row]));
	const byAccount = (accountRows || []).map(row => {
		const flow = flowByAccount.get(Number(row.id)) || {};
		const balance = Number(row.balance) || 0;
		const inflow = Number(flow.in_cents) || 0;
		const outflow = Number(flow.out_cents) || 0;
		return {
			id: row.id,
			name: row.name,
			currency: row.currency,
			status: row.status,
			balance_cents: balance,
			opening_cents: balance - (inflow - outflow),
			income_cents: Number(flow.income_cents) || 0,
			expense_cents: Number(flow.expense_cents) || 0,
			fees_cents: Number(flow.fee_cents) || 0,
			transfers_cents: Number(flow.transfer_cents) || 0,
			advances_cents: Number(flow.advance_cents) || 0,
		};
	});

	const { results: counterpartyRows } = await db(c).prepare(`
		SELECT COALESCE(NULLIF(counterparty, ''), 'Unspecified') AS counterparty,
		       SUM(amount_cents) AS amount_cents
		FROM finance_transactions
		WHERE ${flowSql} AND direction = 'out' AND type NOT IN ('transfer', 'advance')
		GROUP BY COALESCE(NULLIF(counterparty, ''), 'Unspecified')
		ORDER BY amount_cents DESC
		LIMIT 10
	`).bind(...flowArgs).all();

	return {
		...empty,
		opening_cents: byAccount.reduce((sum, row) => sum + row.opening_cents, 0),
		income_cents: byAccount.reduce((sum, row) => sum + row.income_cents, 0),
		expense_cents: byAccount.reduce((sum, row) => sum + row.expense_cents, 0),
		fees_cents: byAccount.reduce((sum, row) => sum + row.fees_cents, 0),
		transfers_cents: byAccount.reduce((sum, row) => sum + row.transfers_cents, 0),
		closing_cents: byAccount.reduce((sum, row) => sum + row.balance_cents, 0),
		by_account: byAccount,
		by_counterparty: (counterpartyRows || []).map(row => ({
			name: row.counterparty, amount_cents: Number(row.amount_cents) || 0,
		})),
		net_cents: byAccount.reduce((sum, row) => sum + row.income_cents - row.expense_cents, 0),
	};
}

// ---- audit ---------------------------------------------------------------

export async function listAudit(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.audit:view', 'Viewing the audit log');
	const page = Math.max(1, Number(params.page) || 1);
	const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || 50));
	const offset = (page - 1) * pageSize;

	const where = ['1 = 1'];
	const args = [];
	if (params.entity_type) { where.push('entity_type = ?'); args.push(params.entity_type); }
	if (params.action) { where.push('action = ?'); args.push(params.action); }
	if (params.actor_id) { where.push('actor_id = ?'); args.push(Number(params.actor_id)); }
	if (params.account_id) { where.push('account_id = ?'); args.push(Number(params.account_id)); }
	if (params.from) { where.push('substr(create_time,1,10) >= ?'); args.push(params.from); }
	if (params.to) { where.push('substr(create_time,1,10) <= ?'); args.push(params.to); }
	if (params.search) {
		const like = `%${text(params.search, 120)}%`;
		where.push('(record_label LIKE ? OR reason LIKE ? OR entity_type LIKE ?)');
		args.push(like, like, like);
	}
	// A member without company scope only sees the records they touched.
	if (!isCompanyScope(keys)) {
		where.push('actor_id = ?');
		args.push(userId);
	}
	const whereSql = where.join(' AND ');

	const { results } = await db(c).prepare(`
		SELECT a.*, u.display_name AS actor_name, u.username AS actor_username
		FROM finance_audit a
		LEFT JOIN user u ON u.user_id = a.actor_id
		WHERE ${whereSql}
		ORDER BY a.id DESC LIMIT ? OFFSET ?
	`).bind(...args, pageSize, offset).all();

	const countRow = await db(c).prepare(
		`SELECT COUNT(*) AS total FROM finance_audit a WHERE ${whereSql}`
	).bind(...args).first();

	const list = (results || []).map(row => ({
		...row,
		actor_label: row.actor_name
			? (row.actor_username ? `${row.actor_name} (@${row.actor_username})` : row.actor_name)
			: 'System',
		amount_label: row.amount_cents ? formatCents(row.amount_cents) : '',
		summary: auditSummary(row),
	}));

	return { list, total: countRow?.total ?? 0, page, pageSize };
}

function auditSummary(row) {
	const amount = row.amount_cents ? formatCents(row.amount_cents) : '';
	const who = row.actor_label || 'System';
	const what = row.record_label || `${row.entity_type} #${row.entity_id ?? '?'}`;
	const verb = {
		created: 'created', updated: 'updated', voided: 'voided', payment: 'recorded a payment against',
		paid: 'paid', charge_added: 'added a charge to', opening_changed: 'changed the opening balance of',
		granted: 'granted access to', archived: 'archived', submitted: 'submitted',
		reviewed: 'reviewed', approved: 'approved', declined: 'declined', issued: 'issued',
	}[row.action] || row.action;
	return amount ? `${who} ${verb} ${amount} on ${what}` : `${who} ${verb} ${what}`;
}

// ---- categories ----------------------------------------------------------

export async function listCategories(c, kind = 'expense') {
	const { results } = await db(c).prepare(
		`SELECT id, kind, name FROM finance_category WHERE kind = ? ORDER BY sort ASC, name COLLATE NOCASE ASC`
	).bind(kind).all();
	return results || [];
}

// ---- configuration framework --------------------------------------------
//
// One table (finance_category) holds every dropdown the finance screens offer:
// expense/income categories, account types, payment methods and free-form tags.
// The kind is the discriminator. Reads are open to anyone who can see the
// matching finance screen; writes require finance:configure so a member can use
// a category without being able to redefine the company's chart of accounts.

const CONFIG_KINDS = {
	expense: 'Spending category',
	income: 'Income category',
	account_type: 'Where money is held',
	payment_method: 'Payment method',
	tag: 'Internal label',
};

export function listConfigKinds() {
	return Object.entries(CONFIG_KINDS).map(([key, label]) => ({ key, label }));
}

function assertKnownConfigKind(kind) {
	if (!CONFIG_KINDS[kind]) throw new BizError(`Unknown configuration kind: ${kind}`, 400);
}

// Every kind in one call, so the configuration screen loads in a single request.
export async function listConfiguration(c, userId) {
	const keys = await permKeys(c, userId);
	const { results } = await db(c).prepare(
		`SELECT id, kind, name, sort FROM finance_category ORDER BY kind ASC, sort ASC, name COLLATE NOCASE ASC`
	).all();
	const grouped = {};
	for (const [kind] of Object.entries(CONFIG_KINDS)) grouped[kind] = [];
	for (const row of results || []) {
		if (!grouped[row.kind]) grouped[row.kind] = [];
		grouped[row.kind].push({ id: row.id, kind: row.kind, name: row.name, sort: row.sort });
	}
	return {
		canManage: hasPerm(keys, 'finance:configure'),
		kinds: listConfigKinds(),
		config: grouped,
	};
}

export async function createConfigItem(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:configure', 'Managing finance configuration');
	const kind = text(body.kind, 40);
	const name = text(body.name, 80);
	assertKnownConfigKind(kind);
	if (!name) throw new BizError('A name is required.', 400);
	const existing = await db(c).prepare(
		`SELECT id FROM finance_category WHERE kind = ? AND name = ? COLLATE NOCASE LIMIT 1`
	).bind(kind, name).first();
	if (existing) throw new BizError(`${CONFIG_KINDS[kind]} "${name}" already exists.`, 409);
	const countRow = await db(c).prepare(`SELECT COALESCE(MAX(sort), -1) AS maxSort FROM finance_category WHERE kind = ?`).bind(kind).first();
	const sort = Number(countRow?.maxSort ?? -1) + 1;
	const { meta } = await db(c).prepare(
		`INSERT INTO finance_category (kind, name, sort) VALUES (?, ?, ?)`
	).bind(kind, name, sort).run();
	await audit(c, {
		entityType: 'finance_config', entityId: meta.last_row_id, action: 'created', actorId: userId,
		recordLabel: `${kind}: ${name}`, after: { kind, name, sort },
	});
	return { id: meta.last_row_id, kind, name, sort };
}

export async function updateConfigItem(c, userId, id, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:configure', 'Managing finance configuration');
	const row = await db(c).prepare(`SELECT * FROM finance_category WHERE id = ?`).bind(id).first();
	if (!row) throw new BizError('Configuration item not found.', 404);
	const name = body.name !== undefined ? text(body.name, 80) : row.name;
	if (!name) throw new BizError('A name is required.', 400);
	const duplicate = await db(c).prepare(
		`SELECT id FROM finance_category WHERE kind = ? AND name = ? COLLATE NOCASE AND id <> ? LIMIT 1`
	).bind(row.kind, name, id).first();
	if (duplicate) throw new BizError(`"${name}" already exists.`, 409);
	const sort = body.sort !== undefined ? Number(body.sort) || 0 : row.sort;
	await db(c).prepare(`UPDATE finance_category SET name = ?, sort = ? WHERE id = ?`).bind(name, sort, id).run();
	await audit(c, {
		entityType: 'finance_config', entityId: id, action: 'updated', actorId: userId,
		recordLabel: `${row.kind}: ${name}`, before: { name: row.name, sort: row.sort }, after: { name, sort },
	});
	return { id, kind: row.kind, name, sort };
}

export async function deleteConfigItem(c, userId, id) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:configure', 'Managing finance configuration');
	const row = await db(c).prepare(`SELECT * FROM finance_category WHERE id = ?`).bind(id).first();
	if (!row) throw new BizError('Configuration item not found.', 404);
	await db(c).prepare(`DELETE FROM finance_category WHERE id = ?`).bind(id).run();
	await audit(c, {
		entityType: 'finance_config', entityId: id, action: 'deleted', actorId: userId,
		recordLabel: `${row.kind}: ${row.name}`, before: { name: row.name, kind: row.kind },
	});
	return { id, deleted: true };
}

// ---- invoice share links -------------------------------------------------
//
// A share link is a high-entropy token (stored hashed) that lets someone who is
// not a member of the company view a single, read-only invoice. It is scoped to
// one invoice, optionally expires, and can be revoked. The public read path
// lives in a separate unauthenticated route and only ever returns the invoice
// view model, never the member's other data.

async function addDays(date, days) {
	const value = new Date(date);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 19).replace('T', ' ');
}

export async function listInvoiceShares(c, userId, invoiceId) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:view', 'Viewing invoices');
	await getInvoice(c, userId, invoiceId); // visibility + existence
	const { results } = await db(c).prepare(
		`SELECT id, invoice_id, expires_at, revoked_at, access_count, last_access_at, create_time
		 FROM finance_invoice_share WHERE invoice_id = ? ORDER BY id DESC`
	).bind(invoiceId).all();
	return (results || []).map(row => ({
		...row,
		active: !row.revoked_at && (!row.expires_at || row.expires_at > new Date().toISOString().slice(0, 19).replace('T', ' ')),
	}));
}

export async function createInvoiceShare(c, userId, invoiceId, body = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:send', 'Sharing an invoice');
	await getInvoice(c, userId, invoiceId); // visibility + existence
	const days = Number(body.expires_in_days);
	const expiresAt = Number.isFinite(days) && days > 0 ? await addDays(new Date(), Math.min(days, 3650)) : null;
	const token = await generateInvitationToken();
	const tokenHash = await hashToken(token);
	await db(c).prepare(
		`INSERT INTO finance_invoice_share (invoice_id, token_hash, created_by, expires_at) VALUES (?, ?, ?, ?)`
	).bind(invoiceId, tokenHash, userId, expiresAt).run();
	await audit(c, {
		entityType: 'invoice_share', entityId: invoiceId, action: 'created', actorId: userId,
		recordLabel: `share link for invoice ${invoiceId}`, after: { invoice_id: invoiceId, expires_at: expiresAt },
	});
	// The raw token is returned exactly once; only its hash is stored.
	const base = body.base_url ? String(body.base_url).replace(/\/+$/, '') : '';
	const path = `/invoice/${token}`;
	return { token, path, url: base ? `${base}${path}` : path, expires_at: expiresAt };
}

export async function revokeInvoiceShare(c, userId, shareId) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance.invoices:send', 'Sharing an invoice');
	const row = await db(c).prepare(`SELECT * FROM finance_invoice_share WHERE id = ?`).bind(shareId).first();
	if (!row) throw new BizError('Share link not found.', 404);
	await db(c).prepare(`UPDATE finance_invoice_share SET revoked_at = ? WHERE id = ?`)
		.bind(new Date().toISOString().slice(0, 19).replace('T', ' '), shareId).run();
	await audit(c, {
		entityType: 'invoice_share', entityId: row.invoice_id, action: 'revoked', actorId: userId,
		recordLabel: `share link ${shareId}`, before: { invoice_id: row.invoice_id },
	});
	return { id: shareId, revoked: true };
}

// Public, unauthenticated read. Returns only what a recipient should see on the
// invoice: number, parties, line items, totals and payment status. No member
// fields, no account internals. A missing, revoked or expired token all return
// the same "not available" so the endpoint does not leak which links exist.
export async function getSharedInvoice(c, token) {
	if (!token) return null;
	const tokenHash = await hashToken(token);
	const row = await db(c).prepare(`SELECT * FROM finance_invoice_share WHERE token_hash = ? LIMIT 1`).bind(tokenHash).first();
	if (!row || row.revoked_at) return null;
	const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
	if (row.expires_at && row.expires_at < now) return null;
	const invoice = await getPublicInvoiceView(c, row.invoice_id);
	if (!invoice) return null;
	await db(c).prepare(
		`UPDATE finance_invoice_share SET access_count = access_count + 1, last_access_at = ? WHERE id = ?`
	).bind(now, row.id).run();
	return invoice;
}

// A deliberately narrow invoice projection for the public share page. It shares
// decorateInvoice for the money arithmetic but never returns account ids,
// recorded_by, or any internal reference.
async function getPublicInvoiceView(c, invoiceId) {
	const row = await db(c).prepare(
		`SELECT * FROM finance_invoices WHERE id = ? AND is_del = 0`
	).bind(invoiceId).first();
	if (!row) return null;
	const decorated = decorateInvoice(row);
	const { results: items } = await db(c).prepare(
		`SELECT description, quantity, rate_cents, amount_cents FROM finance_invoice_item WHERE invoice_id = ? ORDER BY sort ASC, id ASC`
	).bind(invoiceId).all();
	return {
		invoice_number: decorated.invoice_number,
		client_name: decorated.client_name,
		currency: decorated.currency,
		status: decorated.status,
		issue_date: decorated.issue_date,
		due_date: decorated.due_date,
		subtotal_cents: decorated.subtotal_cents ?? decorated.total_cents,
		tax_cents: decorated.tax_cents ?? 0,
		total_cents: decorated.total_cents,
		paid_cents: decorated.paid_cents,
		balance_cents: decorated.balance_cents,
		items: (items || []).map(it => ({
			description: it.description, quantity: it.quantity,
			rate_cents: Number(it.rate_cents) || 0, amount_cents: Number(it.amount_cents) || 0,
		})),
	};
}

// ---- cross-module relations ---------------------------------------------
//
// One relationship model for every link that crosses a module boundary. The
// ledger keeps its own foreign keys (a transaction's budget_id, debt_id,
// invoice_id) because those feed the arithmetic; this table is for everything
// else: an invoice raised for a project, a subscription bought for a team, a
// payment that settled a request.
//
// Both ends are (type, id). The registry below is the single place that knows
// how to name and label each type, which permission guards it, and how to test
// whether the caller may see a particular row of it. The picker, the read side
// and the write side all go through this registry, so a new module is one entry
// rather than three edits.

const RELATION_TYPES = {
	transaction: {
		label: 'Transaction', table: 'finance_transactions', labelColumn: 'description',
		labelExpr: `t.description || ' - ' || t.amount_cents`, perm: 'finance.transactions:view',
		finance: true, deletable: true,
	},
	invoice: {
		label: 'Invoice', table: 'finance_invoices', labelColumn: 'invoice_number',
		labelExpr: `i.invoice_number || ' - ' || COALESCE(i.client_name, '')`, perm: 'finance.invoices:view',
		finance: true, deletable: true,
	},
	subscription: {
		label: 'Subscription', table: 'finance_subscription', labelColumn: 'service',
		labelExpr: `s.service`, perm: 'finance.subscriptions:view',
		finance: true, deletable: true,
	},
	debt: {
		label: 'Obligation', table: 'finance_debt', labelColumn: 'name',
		labelExpr: `d.name`, perm: 'finance.debts:view',
		finance: true, deletable: true,
	},
	budget: {
		label: 'Budget', table: 'finance_budget', labelColumn: 'name',
		labelExpr: `b.name`, perm: 'finance.budgets:view',
		finance: true, deletable: true,
	},
	funding: {
		label: 'Funding', table: 'finance_funding', labelColumn: 'name',
		labelExpr: `f.name`, perm: 'finance.transactions:view',
		finance: true, deletable: true,
	},
	commitment: {
		label: 'Commitment', table: 'finance_commitment', labelColumn: 'description',
		labelExpr: `c.description`, perm: 'finance.budgets:view',
		finance: true, deletable: true,
	},
	reimbursement: {
		label: 'Reimbursement', table: 'finance_reimbursement', labelColumn: 'reason',
		labelExpr: `r.reason`, perm: 'finance.transactions:view',
		finance: true, deletable: true,
	},
	advance: {
		label: 'Advance', table: 'finance_advance', labelColumn: 'purpose',
		labelExpr: `a.purpose`, perm: 'finance.transactions:view',
		finance: true, deletable: true,
	},
	account: {
		label: 'Account', table: 'finance_accounts', labelColumn: 'name',
		labelExpr: `acc.name`, perm: 'finance.accounts:view',
		finance: true, deletable: true,
	},
	project: {
		label: 'Project', table: 'projects', labelColumn: 'name',
		labelExpr: `p.name`, perm: 'projects:query',
		finance: false, deletable: true,
	},
	request: {
		label: 'Request', table: 'internal_requests', labelColumn: 'title',
		labelExpr: `req.title`, perm: 'requests:query',
		finance: false, deletable: true,
	},
	lead: {
		label: 'Lead', table: 'crm_leads', labelColumn: 'name',
		labelExpr: `l.name`, perm: 'leads:query',
		finance: false, deletable: true,
	},
	contact: {
		label: 'Contact', table: 'crm_contacts', labelColumn: 'name',
		labelExpr: `ct.name`, perm: 'contacts:query',
		finance: false, deletable: true,
	},
	deal: {
		label: 'Deal', table: 'crm_deals', labelColumn: 'title',
		labelExpr: `dl.title`, perm: 'deals:query',
		finance: false, deletable: true,
	},
	member: {
		label: 'Team member', table: 'user', labelColumn: 'display_name',
		labelExpr: `COALESCE(NULLIF(u.display_name, ''), u.email)`, perm: 'team:query',
		finance: false, deletable: true,
	},
};

const RELATION_KINDS = {
	related: 'Related',
	paid_from: 'Paid from',
	funds: 'Funds',
	supports: 'Supports',
	billed_to: 'Billed to',
	delivered_by: 'Delivered by',
	requested_by: 'Requested by',
	reimburses: 'Reimburses',
	evidence: 'Evidence for',
};

export function relationTypes() {
	return Object.entries(RELATION_TYPES).map(([key, meta]) => ({
		key, label: meta.label, finance: meta.finance,
		permitted: true,
	}));
}

export function relationKinds() {
	return Object.entries(RELATION_KINDS).map(([key, label]) => ({ key, label }));
}

function assertKnownType(type) {
	if (!RELATION_TYPES[type]) throw new BizError(`Unknown relation type: ${type}`, 400);
}

function assertKnownKind(relation) {
	if (relation && !RELATION_KINDS[relation]) throw new BizError(`Unknown relation kind: ${relation}`, 400);
}

// The alias every table above is selected from, so labelExpr stays readable.
const RELATION_ALIAS = {
	transaction: 't', invoice: 'i', subscription: 's', debt: 'd', budget: 'b',
	funding: 'f', commitment: 'c', reimbursement: 'r', advance: 'a', account: 'acc',
	project: 'p', request: 'req', lead: 'l', contact: 'ct', deal: 'dl', member: 'u',
};

const RELATION_KEY_COLUMNS = {
	transaction: 'id', invoice: 'id', subscription: 'id', debt: 'id', budget: 'id',
	funding: 'id', commitment: 'id', reimbursement: 'id', advance: 'id', account: 'id',
	project: 'id', request: 'id', lead: 'id', contact: 'id', deal: 'id', member: 'user_id',
};

// Which account a finance record draws on, when it has one. Relations inherit
// the scope of the record they hang off: a member who cannot see the account a
// transaction belongs to must not learn the transaction exists through a link.
const RELATION_ACCOUNT_COLUMNS = {
	transaction: 'account_id', reimbursement: 'account_id', advance: 'account_id',
	account: 'id', funding: 'account_id', commitment: 'account_id', debt: 'account_id',
	invoice: 'account_id',
};

async function targetVisible(c, userId, keys, type, id) {
	const meta = RELATION_TYPES[type];
	if (!meta) return false;
	if (!hasPerm(keys, meta.perm)) return false;
	if (meta.finance && RELATION_ACCOUNT_COLUMNS[type]) {
		const column = RELATION_ACCOUNT_COLUMNS[type];
		const row = await db(c).prepare(
			`SELECT ${column} AS account_id FROM ${meta.table} WHERE ${RELATION_KEY_COLUMNS[type]} = ?`
		).bind(id).first();
		if (!row) return false;
		if (row.account_id && !(await canViewAccount(c, userId, keys, row.account_id))) return false;
		return true;
	}
	if (meta.finance) {
		// Finance records with no account of their own still need a scope answer:
		// company scope sees them, a scoped member sees only the ones they own.
		if (isCompanyScope(keys)) return true;
		const ownerColumn = { budget: 'owner_id', subscription: 'owner_id', funding: 'created_by', commitment: 'created_by' }[type];
		if (!ownerColumn) return hasPerm(keys, 'finance:view');
		const row = await db(c).prepare(
			`SELECT ${ownerColumn} AS owner_id FROM ${meta.table} WHERE ${RELATION_KEY_COLUMNS[type]} = ?`
		).bind(id).first();
		return !!row && Number(row.owner_id) === Number(userId);
	}
	// Non-finance modules are guarded by their own view permission. Their record
	// level scoping belongs to those modules; finance links only ever expose the
	// label, never the record, so type level is the honest boundary here.
	return true;
}

async function sourceVisible(c, userId, keys, type, id) {
	assertKnownType(type);
	const meta = RELATION_TYPES[type];
	if (!hasPerm(keys, meta.perm)) throw new BizError(`Linking to ${meta.label} requires ${meta.perm}.`, 403);
	if (meta.finance && RELATION_ACCOUNT_COLUMNS[type]) {
		const column = RELATION_ACCOUNT_COLUMNS[type];
		const row = await db(c).prepare(
			`SELECT ${column} AS account_id FROM ${meta.table} WHERE ${RELATION_KEY_COLUMNS[type]} = ?`
		).bind(id).first();
		if (!row) throw new BizError(`${meta.label} not found.`, 404);
		if (row.account_id && !(await canViewAccount(c, userId, keys, row.account_id))) {
			throw new BizError(`${meta.label} not found.`, 404);
		}
		return;
	}
	const row = await db(c).prepare(
		`SELECT ${RELATION_KEY_COLUMNS[type]} AS id FROM ${meta.table} WHERE ${RELATION_KEY_COLUMNS[type]} = ?`
	).bind(id).first();
	if (!row) throw new BizError(`${meta.label} not found.`, 404);
}

// Both directions of a relation, resolved to labels. A link is stored once and
// read twice: asking for a transaction returns the project it was billed to, and
// asking for that project returns the transaction.
export async function listRelations(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:view', 'Viewing finance');

	const sourceType = String(params.source_type || params.type || '').trim();
	const sourceId = Number(params.source_id || params.id || 0);
	assertKnownType(sourceType);
	if (!sourceId) throw new BizError('A relation needs both ends.', 400);
	await sourceVisible(c, userId, keys, sourceType, sourceId);

	const out = [];
	const forward = await db(c).prepare(`
		SELECT r.id, r.source_type, r.source_id, r.target_type, r.target_id, r.relation, r.note,
		       r.created_by, r.create_time, u.display_name AS created_by_name
		FROM finance_relation r
		LEFT JOIN user u ON u.user_id = r.created_by
		WHERE r.source_type = ? AND r.source_id = ?
		ORDER BY r.id ASC
	`).bind(sourceType, sourceId).all();

	for (const row of forward.results || []) {
		if (!(await targetVisible(c, userId, keys, row.target_type, row.target_id))) continue;
		out.push(await decorateRelation(c, row, 'out'));
	}

	const reverse = await db(c).prepare(`
		SELECT r.id, r.source_type, r.source_id, r.target_type, r.target_id, r.relation, r.note,
		       r.created_by, r.create_time, u.display_name AS created_by_name
		FROM finance_relation r
		LEFT JOIN user u ON u.user_id = r.created_by
		WHERE r.target_type = ? AND r.target_id = ?
		ORDER BY r.id ASC
	`).bind(sourceType, sourceId).all();

	for (const row of reverse.results || []) {
		if (!(await targetVisible(c, userId, keys, row.source_type, row.source_id))) continue;
		out.push(await decorateRelation(c, row, 'in'));
	}

	return { list: out, total: out.length };
}

async function decorateRelation(c, row, direction) {
	const meta = RELATION_TYPES[direction === 'out' ? row.target_type : row.source_type];
	const otherType = direction === 'out' ? row.target_type : row.source_type;
	const otherId = direction === 'out' ? row.target_id : row.source_id;
	const other = RELATION_TYPES[otherType];
	const alias = RELATION_ALIAS[otherType];
	const key = RELATION_KEY_COLUMNS[otherType];
	let label = `#${otherId}`;
	try {
		const found = await db(c).prepare(
			`SELECT ${other.labelExpr} AS label FROM ${other.table} ${alias} WHERE ${alias}.${key} = ?`
		).bind(otherId).first();
		if (found?.label) label = String(found.label);
	} catch (e) {
		// A label is a convenience; a broken join must not hide the link itself.
	}
	return {
		id: row.id,
		direction,
		type: otherType,
		type_id: otherId,
		type_label: other.label,
		relation: row.relation,
		relation_label: RELATION_KINDS[row.relation] || row.relation,
		label,
		note: row.note || '',
		created_by: row.created_by ?? null,
		created_by_name: row.created_by_name || '',
		create_time: row.create_time || '',
		editable: meta?.deletable !== false,
	};
}

export async function createRelation(c, userId, body = {}) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.transactions:create', 'finance:edit'], 'Linking records');

	const sourceType = String(body.source_type || '').trim();
	const sourceId = intOrNull(body.source_id);
	const targetType = String(body.target_type || '').trim();
	const targetId = intOrNull(body.target_id);
	assertKnownType(sourceType);
	assertKnownType(targetType);
	if (!sourceId || !targetId) throw new BizError('A relation needs both ends.', 400);
	if (sourceType === targetType && sourceId === targetId) {
		throw new BizError('A record cannot be linked to itself.', 400);
	}
	const relation = text(body.relation, 40) || 'related';
	assertKnownKind(relation);

	await sourceVisible(c, userId, keys, sourceType, sourceId);
	if (!(await targetVisible(c, userId, keys, targetType, targetId))) {
		throw new BizError(`${RELATION_TYPES[targetType].label} not found.`, 404);
	}

	const existing = await db(c).prepare(`
		SELECT id FROM finance_relation
		WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND relation = ?
		LIMIT 1
	`).bind(sourceType, sourceId, targetType, targetId, relation).first();
	if (existing) throw new BizError('That link already exists.', 400);

	const { meta } = await db(c).prepare(`
		INSERT INTO finance_relation
			(source_type, source_id, target_type, target_id, relation, note, created_by, create_time)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`).bind(
		sourceType, sourceId, targetType, targetId, relation,
		text(body.note, 500), userId, nowStamp(),
	).run();

	await audit(c, {
		entityType: 'relation', entityId: meta.last_row_id, action: 'created',
		actorId: userId, reason: text(body.note, 500),
		recordLabel: `${RELATION_TYPES[sourceType].label} #${sourceId} -> ${RELATION_TYPES[targetType].label} #${targetId}`,
	});
	return { id: meta.last_row_id };
}

export async function deleteRelation(c, userId, relationId) {
	const keys = await permKeys(c, userId);
	assertAnyPerm(keys, ['finance.transactions:create', 'finance:edit'], 'Removing a link');

	const row = await db(c).prepare(`SELECT * FROM finance_relation WHERE id = ?`).bind(relationId).first();
	if (!row) throw new BizError('That link no longer exists.', 404);

	// The same scope that let the caller see the source governs removing its link.
	await sourceVisible(c, userId, keys, row.source_type, row.source_id);

	await db(c).prepare(`DELETE FROM finance_relation WHERE id = ?`).bind(relationId).run();
	await audit(c, {
		entityType: 'relation', entityId: row.id, action: 'deleted',
		actorId: userId,
		recordLabel: `${RELATION_TYPES[row.source_type]?.label || row.source_type} #${row.source_id} -> ${RELATION_TYPES[row.target_type]?.label || row.target_type} #${row.target_id}`,
	});
	return { id: row.id };
}

// The picker's backend: candidates the caller may actually link to, filtered by
// type and free text, with the label the UI shows. Search happens in SQL and the
// limit is small, so the picker never ships a page of the whole company to the
// browser to filter locally.
export async function searchRelationTargets(c, userId, params = {}) {
	const keys = await permKeys(c, userId);
	assertPerm(keys, 'finance:view', 'Searching for records to link');

	const requested = String(params.types || '')
		.split(',').map(v => v.trim()).filter(Boolean);
	const types = (requested.length ? requested : Object.keys(RELATION_TYPES))
		.filter(type => RELATION_TYPES[type] && hasPerm(keys, RELATION_TYPES[type].perm));
	if (!types.length) return { list: [], total: 0 };

	const q = text(params.q, 80).toLowerCase();
	const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 50);
	const results = [];

	for (const type of types) {
		const meta = RELATION_TYPES[type];
		const alias = RELATION_ALIAS[type];
		const key = RELATION_KEY_COLUMNS[type];
		const clauses = [];
		const args = [];
		if (q) {
			clauses.push(`LOWER(${meta.labelExpr}) LIKE ?`);
			args.push(`%${q}%`);
		}
		if (meta.finance && RELATION_ACCOUNT_COLUMNS[type]) {
			const column = RELATION_ACCOUNT_COLUMNS[type];
			const visible = await visibleAccountIds(c, userId, keys);
			if (visible === null) {
				// Company scope including confidential records: no filter.
			} else if (!visible.length) {
				continue;
			} else {
				clauses.push(`COALESCE(${alias}.${column}, 0) IN (${visible.map(() => '?').join(',')})`);
				args.push(...visible);
			}
		} else if (meta.finance) {
			if (!isCompanyScope(keys)) {
				const ownerColumn = { budget: 'owner_id', subscription: 'owner_id', funding: 'created_by', commitment: 'created_by' }[type];
				if (!ownerColumn) continue;
				clauses.push(`${alias}.${ownerColumn} = ?`);
				args.push(userId);
			}
		}
		if (type === 'project' || type === 'request' || type === 'lead' || type === 'contact' || type === 'deal') {
			clauses.push(`COALESCE(${alias}.is_del, 0) = 0`);
		}

		const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
		try {
			const { results: rows } = await db(c).prepare(`
				SELECT ${alias}.${key} AS id, ${meta.labelExpr} AS label
				FROM ${meta.table} ${alias}
				${where}
				ORDER BY 2 ASC
				LIMIT ?
			`).bind(...args, limit).all();
			for (const row of rows || []) {
				results.push({
					type, type_label: meta.label, id: Number(row.id),
					label: String(row.label || `#${row.id}`),
				});
			}
		} catch (e) {
			// A module that is not installed on this deployment simply offers no
			// candidates; the picker still works for the modules that do.
		}
	}

	return { list: results, total: results.length };
}
