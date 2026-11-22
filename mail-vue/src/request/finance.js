import http from '@/axios/index.js'

// Finance is one domain with one ledger. Every call returns integer cents; the
// views format through @/utils/money.js and never do their own arithmetic.

export function financeOverview(params) {
  return http.get('/finance/overview', { params })
}

export function financeCategories(kind = 'expense') {
  return http.get('/finance/categories', { params: { kind } })
}

// ---- configuration (categories, account types, payment methods, tags) ----

export function financeConfig() {
  return http.get('/finance/config')
}

export function financeConfigCreate(data) {
  return http.post('/finance/config', data)
}

export function financeConfigUpdate(id, data) {
  return http.put(`/finance/config/${id}`, data)
}

export function financeConfigDelete(id) {
  return http.delete(`/finance/config/${id}`)
}

// People who can be assigned a budget or an account. Names only, and only for
// members who hold an assigning finance key.
export function financeMembers() {
  return http.get('/finance/members')
}

// ----- accounts -----------------------------------------------------------

export function financeAccounts(params) {
  return http.get('/finance/accounts', { params })
}

export function financeAccount(id) {
  return http.get(`/finance/accounts/${id}`)
}

export function financeAccountCreate(data) {
  return http.post('/finance/accounts', data)
}

export function financeAccountUpdate(id, data) {
  return http.put(`/finance/accounts/${id}`, data)
}

export function financeAccountArchive(id) {
  return http.delete(`/finance/accounts/${id}`)
}

export function financeAccountLedger(id, params) {
  return http.get(`/finance/accounts/${id}/ledger`, { params })
}

export function financeAccountUtilization(id) {
  return http.get(`/finance/accounts/${id}/utilization`)
}

export function financeAccountMembers(id) {
  return http.get(`/finance/accounts/${id}/members`)
}

export function financeAccountMemberAdd(id, data) {
  return http.post(`/finance/accounts/${id}/members`, data)
}

// ----- transactions -------------------------------------------------------

export function financeTransactions(params) {
  return http.get('/finance/transactions', { params })
}

export function financeTransaction(id) {
  return http.get(`/finance/transactions/${id}`)
}

// The server builds the CSV. The browser only holds one page of rows, so a
// client-side export would quietly be a partial export.
export function financeTransactionExport(params) {
  return http.get('/finance/transactions/export', { params })
}

// Two-phase import. The browser parses + maps columns, the server validates and
// de-duplicates. preview returns per-row status; commit writes the approved rows.
export function financeImportPreview(rows) {
  return http.post('/finance/transactions/import/preview', { rows })
}

export function financeImportCommit(rows) {
  return http.post('/finance/transactions/import', { rows })
}

export function financeRequestCommitment(id, data) {
  return http.post(`/finance/requests/${id}/commitment`, data)
}

export function financeTransactionCreate(data) {
  return http.post('/finance/transactions', data)
}

export function financeTransactionVoid(id, data) {
  return http.post(`/finance/transactions/${id}/void`, data)
}

export function financeTransferCreate(data) {
  return http.post('/finance/transfers', data)
}

// ----- funding ------------------------------------------------------------

export function financeFunding() {
  return http.get('/finance/funding')
}

export function financeFundingCreate(data) {
  return http.post('/finance/funding', data)
}

export function financeFundingDetail(id) {
  return http.get(`/finance/funding/${id}`)
}

// ----- budgets ------------------------------------------------------------

export function financeBudgets(params) {
  return http.get('/finance/budgets', { params })
}

export function financeBudget(id) {
  return http.get(`/finance/budgets/${id}`)
}

export function financeBudgetCreate(data) {
  return http.post('/finance/budgets', data)
}

export function financeBudgetUpdate(id, data) {
  return http.put(`/finance/budgets/${id}`, data)
}

export function financeCommitments(params) {
  return http.get('/finance/commitments', { params })
}

export function financeCommitmentCreate(data) {
  return http.post('/finance/commitments', data)
}

// ----- debts --------------------------------------------------------------

export function financeDebts(params) {
  return http.get('/finance/debts', { params })
}

export function financeDebt(id) {
  return http.get(`/finance/debts/${id}`)
}

export function financeDebtCreate(data) {
  return http.post('/finance/debts', data)
}

export function financeDebtUpdate(id, data) {
  return http.put(`/finance/debts/${id}`, data)
}

export function financeDebtDelete(id, data = {}) {
  return http.delete(`/finance/debts/${id}`, { data })
}

export function financeDebtCancel(id, data) {
  return http.post(`/finance/debts/${id}/cancel`, data)
}

export function financeDebtPay(id, data) {
  return http.post(`/finance/debts/${id}/payments`, data)
}

export function financeDebtCharge(id, data) {
  return http.post(`/finance/debts/${id}/charges`, data)
}

// ----- subscriptions ------------------------------------------------------

export function financeSubscriptions(params) {
  return http.get('/finance/subscriptions', { params })
}

export function financeSubscriptionUpcoming(days = 30) {
  return http.get('/finance/subscriptions/upcoming', { params: { days } })
}

export function financeSubscription(id) {
  return http.get(`/finance/subscriptions/${id}`)
}

export function financeSubscriptionCreate(data) {
  return http.post('/finance/subscriptions', data)
}

export function financeSubscriptionUpdate(id, data) {
  return http.put(`/finance/subscriptions/${id}`, data)
}

export function financeSubscriptionPay(id, data) {
  return http.post(`/finance/subscriptions/${id}/payments`, data)
}

// ----- invoices -----------------------------------------------------------

export function financeInvoices(params) {
  return http.get('/finance/invoices', { params })
}

export function financeInvoice(id) {
  return http.get(`/finance/invoices/${id}`)
}

export function financeInvoiceCreate(data) {
  return http.post('/finance/invoices', data)
}

export function financeInvoiceUpdate(id, data) {
  return http.put(`/finance/invoices/${id}`, data)
}

export function financeInvoicePay(id, data) {
  return http.post(`/finance/invoices/${id}/payments`, data)
}

// Secure, read-only share links. The raw token is returned once on create.
export function financeInvoiceShares(id) {
  return http.get(`/finance/invoices/${id}/shares`)
}

export function financeInvoiceShareCreate(id, data) {
  return http.post(`/finance/invoices/${id}/shares`, data)
}

export function financeInvoiceShareRevoke(id, shareId) {
  return http.delete(`/finance/invoices/${id}/shares/${shareId}`)
}

// Public, unauthenticated: resolve a shared invoice by its token.
export function publicInvoice(token) {
  return http.get(`/public/invoice/${token}`)
}

// ----- reimbursements and advances ---------------------------------------

export function financeReimbursements(params) {
  return http.get('/finance/reimbursements', { params })
}

export function financeReimbursementCreate(data) {
  return http.post('/finance/reimbursements', data)
}

export function financeReimbursementReview(id, data) {
  return http.put(`/finance/reimbursements/${id}/review`, data)
}

export function financeReimbursementPay(id, data) {
  return http.post(`/finance/reimbursements/${id}/pay`, data)
}

export function financeAdvances() {
  return http.get('/finance/advances')
}

export function financeAdvanceCreate(data) {
  return http.post('/finance/advances', data)
}

export function financeAdvanceSettle(id, data) {
  return http.post(`/finance/advances/${id}/settle`, data)
}

// ----- reports and audit --------------------------------------------------

export function financeSpendingByCategory(params) {
  return http.get('/finance/reports/spending', { params })
}

export function financeReportSummary(params) {
  return http.get('/finance/reports/summary', { params })
}

export function financeAudit(params) {
  return http.get('/finance/audit', { params })
}
// ----- cross-module relations ---------------------------------------------

export function financeRelationTypes() {
  return http.get('/finance/relations/types')
}

export function financeRelationKinds() {
  return http.get('/finance/relations/kinds')
}

export function financeRelations(params) {
  return http.get('/finance/relations', { params })
}

export function financeRelationSearch(params) {
  return http.get('/finance/relations/search', { params })
}

export function financeRelationCreate(data) {
  return http.post('/finance/relations', data)
}

export function financeRelationDelete(id) {
  return http.delete(`/finance/relations/${id}`)
}
