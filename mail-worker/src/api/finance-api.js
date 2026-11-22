import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import * as finance from '../service/finance-service';

// Finance routes are thin: every rule, permission check and audit entry lives in
// the service. These handlers only translate HTTP into a call and back, so a
// behaviour can never drift between two routes that touch the same record.
//
// Money crosses the boundary as integer minor units (amount_cents). The UI is
// responsible for showing KES; the API never guesses a currency conversion.

const uid = (c) => userContext.getUserId(c);
const int = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const body = async (c) => {
	try {
		return (await c.req.json()) || {};
	} catch {
		return {};
	}
};
const query = (c) => c.req.query();

// ----- overview -----------------------------------------------------------

app.get('/finance/overview', async (c) => {
	return c.json(result.ok(await finance.overview(c, uid(c), query(c))));
});

app.get('/finance/categories', async (c) => {
	const kind = String(query(c).kind || 'expense');
	return c.json(result.ok(await finance.listCategories(c, kind)));
});

// ---- configuration (categories, account types, payment methods, tags) ----

app.get('/finance/config', async (c) => {
	return c.json(result.ok(await finance.listConfiguration(c, uid(c))));
});

app.post('/finance/config', async (c) => {
	return c.json(result.ok(await finance.createConfigItem(c, uid(c), await body(c))));
});

app.put('/finance/config/:id', async (c) => {
	return c.json(result.ok(await finance.updateConfigItem(c, uid(c), int(c.req.param('id')), await body(c))));
});

app.delete('/finance/config/:id', async (c) => {
	return c.json(result.ok(await finance.deleteConfigItem(c, uid(c), int(c.req.param('id')))));
});

// Names only, finance-gated: enough to assign a budget owner or an account
// custodian without handing out the user directory.
app.get('/finance/members', async (c) => {
	return c.json(result.ok(await finance.assignableMembers(c, uid(c))));
});

// ----- accounts -----------------------------------------------------------

app.get('/finance/accounts', async (c) => {
	return c.json(result.ok(await finance.listAccounts(c, uid(c), query(c))));
});

app.post('/finance/accounts', async (c) => {
	return c.json(result.ok(await finance.createAccount(c, uid(c), await body(c))));
});

app.get('/finance/accounts/:id', async (c) => {
	return c.json(result.ok(await finance.getAccount(c, uid(c), int(c.req.param('id')))));
});

app.put('/finance/accounts/:id', async (c) => {
	return c.json(result.ok(await finance.updateAccount(c, uid(c), int(c.req.param('id')), await body(c))));
});

// Archiving keeps every movement and the account's history intact.
app.delete('/finance/accounts/:id', async (c) => {
	return c.json(result.ok(await finance.archiveAccount(c, uid(c), int(c.req.param('id')))));
});

app.get('/finance/accounts/:id/ledger', async (c) => {
	return c.json(result.ok(await finance.accountLedger(c, uid(c), int(c.req.param('id')), query(c))));
});

app.get('/finance/accounts/:id/utilization', async (c) => {
	return c.json(result.ok(await finance.fundUtilization(c, uid(c), int(c.req.param('id')))));
});

app.get('/finance/accounts/:id/members', async (c) => {
	return c.json(result.ok(await finance.listAccountMembers(c, uid(c), int(c.req.param('id')))));
});

app.post('/finance/accounts/:id/members', async (c) => {
	const payload = await body(c);
	const access = payload.access === 'manage' ? 'manage' : 'view';
	const targetUserId = int(payload.user_id ?? payload.userId);
	return c.json(result.ok(await finance.grantAccountAccess(c, uid(c), int(c.req.param('id')), targetUserId, access)));
});

// ----- transactions -------------------------------------------------------

app.get('/finance/transactions', async (c) => {
	return c.json(result.ok(await finance.listTransactions(c, uid(c), query(c))));
});

app.post('/finance/transactions', async (c) => {
	return c.json(result.ok(await finance.createTransaction(c, uid(c), await body(c))));
});

// Registered before /:id so "export" is never read as an id. The server builds
// the CSV: the browser only holds one page of rows, so a client-side export
// would silently be a partial export. The rows come back as text because every
// other finance call is JSON and the shared axios layer decodes JSON.
app.get('/finance/transactions/export', async (c) => {
	return c.json(result.ok(await finance.exportTransactions(c, uid(c), query(c))));
});

// Two-phase import: preview classifies rows without writing, commit writes only
// the rows the caller approves. Both are server-authoritative for validation,
// de-duplication and audit, exactly like a single create.
app.post('/finance/transactions/import/preview', async (c) => {
	return c.json(result.ok(await finance.previewImport(c, uid(c), await body(c))));
});

app.post('/finance/transactions/import', async (c) => {
	return c.json(result.ok(await finance.commitImport(c, uid(c), await body(c))));
});

app.get('/finance/transactions/:id', async (c) => {
	return c.json(result.ok(await finance.transactionDetail(c, uid(c), int(c.req.param('id')))));
});

// Voiding reverses the movement; it never deletes the row.
app.post('/finance/transactions/:id/void', async (c) => {
	return c.json(result.ok(await finance.voidTransaction(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- transfers ----------------------------------------------------------

// A transfer is created as two linked rows with the same transfer_group.
app.post('/finance/transfers', async (c) => {
	const payload = await body(c);
	return c.json(result.ok(await finance.createTransaction(c, uid(c), { ...payload, type: 'transfer' })));
});

// ----- funding ------------------------------------------------------------

app.get('/finance/funding', async (c) => {
	return c.json(result.ok(await finance.listFunding(c, uid(c))));
});

app.post('/finance/funding', async (c) => {
	return c.json(result.ok(await finance.createFunding(c, uid(c), await body(c))));
});

app.get('/finance/funding/:id', async (c) => {
	return c.json(result.ok(await finance.getFunding(c, uid(c), int(c.req.param('id')))));
});

// ----- budgets ------------------------------------------------------------

app.get('/finance/budgets', async (c) => {
	return c.json(result.ok(await finance.listBudgets(c, uid(c), query(c))));
});

app.post('/finance/budgets', async (c) => {
	return c.json(result.ok(await finance.createBudget(c, uid(c), await body(c))));
});

app.get('/finance/budgets/:id', async (c) => {
	return c.json(result.ok(await finance.getBudget(c, uid(c), int(c.req.param('id')))));
});

app.put('/finance/budgets/:id', async (c) => {
	return c.json(result.ok(await finance.updateBudget(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- commitments --------------------------------------------------------

// A commitment reserves budget; it is not money leaving an account.
app.get('/finance/commitments', async (c) => {
	return c.json(result.ok(await finance.listCommitments(c, uid(c), query(c))));
});

app.post('/finance/commitments', async (c) => {
	return c.json(result.ok(await finance.createCommitment(c, uid(c), await body(c))));
});

// Approval authorises; this records the reservation against a budget. It never
// moves money: paying the commitment is a separate transaction.
app.post('/finance/requests/:id/commitment', async (c) => {
	return c.json(result.ok(await finance.createRequestCommitment(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- debts --------------------------------------------------------------

app.get('/finance/debts', async (c) => {
	return c.json(result.ok(await finance.listDebts(c, uid(c), query(c))));
});

app.post('/finance/debts', async (c) => {
	return c.json(result.ok(await finance.createDebt(c, uid(c), await body(c))));
});

app.get('/finance/debts/:id', async (c) => {
	return c.json(result.ok(await finance.getDebt(c, uid(c), int(c.req.param('id')))));
});

app.post('/finance/debts/:id/payments', async (c) => {
	return c.json(result.ok(await finance.payDebt(c, uid(c), int(c.req.param('id')), await body(c))));
});

// Charges added after creation; the original amount is never overwritten.
app.post('/finance/debts/:id/charges', async (c) => {
	return c.json(result.ok(await finance.addDebtCharge(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- subscriptions ------------------------------------------------------

// Registered before /:id so "upcoming" is never read as an id.
app.get('/finance/subscriptions/upcoming', async (c) => {
	return c.json(result.ok(await finance.upcomingSubscriptions(c, uid(c), int(query(c).days) || 30)));
});

app.get('/finance/subscriptions', async (c) => {
	return c.json(result.ok(await finance.listSubscriptions(c, uid(c), query(c))));
});

app.post('/finance/subscriptions', async (c) => {
	return c.json(result.ok(await finance.createSubscription(c, uid(c), await body(c))));
});

app.get('/finance/subscriptions/:id', async (c) => {
	return c.json(result.ok(await finance.getSubscription(c, uid(c), int(c.req.param('id')))));
});

app.put('/finance/subscriptions/:id', async (c) => {
	return c.json(result.ok(await finance.updateSubscription(c, uid(c), int(c.req.param('id')), await body(c))));
});

app.post('/finance/subscriptions/:id/payments', async (c) => {
	return c.json(result.ok(await finance.paySubscription(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- invoices -----------------------------------------------------------

app.get('/finance/invoices', async (c) => {
	return c.json(result.ok(await finance.listInvoices(c, uid(c), query(c))));
});

app.post('/finance/invoices', async (c) => {
	return c.json(result.ok(await finance.createInvoice(c, uid(c), await body(c))));
});

app.get('/finance/invoices/:id', async (c) => {
	return c.json(result.ok(await finance.getInvoice(c, uid(c), int(c.req.param('id')))));
});

app.put('/finance/invoices/:id', async (c) => {
	return c.json(result.ok(await finance.updateInvoice(c, uid(c), int(c.req.param('id')), await body(c))));
});

// Secure, read-only share links for a single invoice. The raw token is returned
// once on create; only its hash is stored.
app.get('/finance/invoices/:id/shares', async (c) => {
	return c.json(result.ok(await finance.listInvoiceShares(c, uid(c), int(c.req.param('id')))));
});

app.post('/finance/invoices/:id/shares', async (c) => {
	const payload = await body(c);
	const baseUrl = c.req.query('base_url') || payload.base_url || new URL(c.req.url).origin;
	return c.json(result.ok(await finance.createInvoiceShare(c, uid(c), int(c.req.param('id')), { ...payload, base_url: baseUrl })));
});

app.delete('/finance/invoices/:id/shares/:shareId', async (c) => {
	return c.json(result.ok(await finance.revokeInvoiceShare(c, uid(c), int(c.req.param('shareId')))));
});

// Overpayment is rejected in the service: a payment cannot exceed the balance.
app.post('/finance/invoices/:id/payments', async (c) => {
	return c.json(result.ok(await finance.payInvoice(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- reimbursements -----------------------------------------------------

app.get('/finance/reimbursements', async (c) => {
	return c.json(result.ok(await finance.listReimbursements(c, uid(c), query(c))));
});

app.post('/finance/reimbursements', async (c) => {
	return c.json(result.ok(await finance.createReimbursement(c, uid(c), await body(c))));
});

app.put('/finance/reimbursements/:id/review', async (c) => {
	return c.json(result.ok(await finance.reviewReimbursement(c, uid(c), int(c.req.param('id')), await body(c))));
});

app.post('/finance/reimbursements/:id/pay', async (c) => {
	return c.json(result.ok(await finance.payReimbursement(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- advances -----------------------------------------------------------

app.get('/finance/advances', async (c) => {
	return c.json(result.ok(await finance.listAdvances(c, uid(c))));
});

app.post('/finance/advances', async (c) => {
	return c.json(result.ok(await finance.createAdvance(c, uid(c), await body(c))));
});

// Settling records what was spent and what came back; the advance is then closed.
app.post('/finance/advances/:id/settle', async (c) => {
	return c.json(result.ok(await finance.settleAdvance(c, uid(c), int(c.req.param('id')), await body(c))));
});

// ----- reports ------------------------------------------------------------

app.get('/finance/reports/spending', async (c) => {
	return c.json(result.ok(await finance.spendingByCategory(c, uid(c), query(c))));
});

// Cash flow, fees and spend by counterparty in one scoped read.
app.get('/finance/reports/summary', async (c) => {
	return c.json(result.ok(await finance.financeSummary(c, uid(c), query(c))));
});

// ----- audit --------------------------------------------------------------

app.get('/finance/audit', async (c) => {
	return c.json(result.ok(await finance.listAudit(c, uid(c), query(c))));
});

// ----- relations ----------------------------------------------------------
//
// One relationship model across modules. The static /types and /kinds routes are
// declared before the parameterised ones so they are never swallowed by :id.

app.get('/finance/relations/types', async (c) => {
	return c.json(result.ok(await finance.relationTypes()));
});

app.get('/finance/relations/kinds', async (c) => {
	return c.json(result.ok(await finance.relationKinds()));
});

// The picker's candidate list: permission-aware, server-side searched.
app.get('/finance/relations/search', async (c) => {
	return c.json(result.ok(await finance.searchRelationTargets(c, uid(c), query(c))));
});

app.get('/finance/relations', async (c) => {
	return c.json(result.ok(await finance.listRelations(c, uid(c), query(c))));
});

app.post('/finance/relations', async (c) => {
	return c.json(result.ok(await finance.createRelation(c, uid(c), await body(c))));
});

app.delete('/finance/relations/:id', async (c) => {
	return c.json(result.ok(await finance.deleteRelation(c, uid(c), int(c.req.param('id')))));
});