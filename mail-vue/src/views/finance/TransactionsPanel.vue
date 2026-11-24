<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Every movement</div>
        <h2>Transactions</h2>
      </div>
      <div class="fin-head-actions">
        <el-button v-perm="'finance.transactions:create'" size="small" @click="openTransfer">Transfer</el-button>
        <el-button v-perm="'finance.transactions:create'" size="small" icon="upload" @click="openImport">Import</el-button>
        <el-button v-perm="'finance.transactions:create'" size="small" type="primary" icon="plus" @click="openEntry()">
          Record
        </el-button>
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <div class="fin-stats">
      <StatCard label="Money in" :value="money(totals.income_cents)" tone="positive" :hint="rangeLabel" />
      <StatCard label="Money out" :value="money(totals.expense_cents)" tone="negative" :hint="rangeLabel" />
      <StatCard
        label="Net"
        :value="signed(totals.net_cents)"
        :tone="toneOf(totals.net_cents)"
        :hint="`${money(totals.fees_cents)} in fees`"
      />
      <StatCard
        label="Moved between accounts"
        :value="money(totals.transfers_cents)"
        hint="Not income, not an expense"
      />
    </div>

    <section class="fin-card">
      <div class="fin-filters">
        <el-input
          v-model="filters.search"
          placeholder="Search description, reference, counterparty…"
          clearable
          style="max-width: 300px"
          @keyup.enter="applyFilters"
          @clear="applyFilters"
        />
        <el-select v-model="filters.direction" style="width: 150px" @change="applyFilters">
          <el-option label="All movements" value="" />
          <el-option label="Money in" value="in" />
          <el-option label="Money out" value="out" />
        </el-select>
        <el-select v-model="filters.type" style="width: 170px" @change="applyFilters">
          <el-option label="All types" value="" />
          <el-option v-for="type in TYPES" :key="type" :label="typeLabel(type)" :value="type" />
        </el-select>
        <el-select v-model="filters.account_id" style="width: 180px" @change="applyFilters">
          <el-option label="All accounts" :value="null" />
          <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
        </el-select>
        <el-date-picker
          v-model="filters.from"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="From"
          style="width: 150px"
          @change="applyFilters"
        />
        <el-date-picker
          v-model="filters.to"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="To"
          style="width: 150px"
          @change="applyFilters"
        />
        <el-button text @click="resetFilters">Clear</el-button>
        <el-button
          v-perm="'finance:export'"
          text
          :loading="exporting"
          @click="exportCsv"
        >Export</el-button>
      </div>

      <el-table
        v-if="rows.length"
        v-loading="loading"
        :data="rows"
        size="small"
        style="width: 100%"
        class="fin-clickable"
        @row-click="openDetail"
      >
        <el-table-column label="Date" min-width="110">
          <template #default="scope">{{ scope.row.txn_date || '—' }}</template>
        </el-table-column>
        <el-table-column label="Description" min-width="220">
          <template #default="scope">
            <div class="fin-cell-main">
              <span class="fin-table-title">{{ scope.row.description || scope.row.type }}</span>
              <span v-if="scope.row.counterparty" class="fin-cell-meta">{{ scope.row.counterparty }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Type" min-width="120">
          <template #default="scope">{{ typeLabel(scope.row.type) }}</template>
        </el-table-column>
        <el-table-column label="Category" min-width="120">
          <template #default="scope">{{ scope.row.category || '—' }}</template>
        </el-table-column>
        <el-table-column prop="account_name" label="Account" min-width="140">
          <template #default="scope">{{ scope.row.account_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="Amount" min-width="140" align="right">
          <template #default="scope">
            <span :class="scope.row.direction === 'in' ? 'fin-positive' : 'fin-amount-out'">
              {{ signed(scope.row.amount_cents, scope.row.direction, scope.row.currency) }}
            </span>
            <span v-if="scope.row.fee_cents" class="fin-cell-meta">fee {{ money(scope.row.fee_cents, scope.row.currency) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Status" min-width="90">
          <template #default="scope">
            <span class="fin-status" :class="`is-${scope.row.status}`">{{ statusLabel(scope.row.status) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="" min-width="80" fixed="right">
          <template #default="scope">
            <el-button
              v-perm="'finance:void'"
              v-if="scope.row.status === 'posted'"
              text
              size="small"
              type="danger"
              @click="openVoid(scope.row)"
            >Void</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-else-if="!loading" class="fin-empty">No transactions match these filters.</div>

      <div v-if="total > rows.length" class="fin-pager">
        <el-button size="small" :disabled="page <= 1" @click="changePage(page - 1)">Previous</el-button>
        <span class="fin-pager-label">Page {{ page }} of {{ pages }}</span>
        <el-button size="small" :disabled="page >= pages" @click="changePage(page + 1)">Next</el-button>
      </div>
    </section>

    <el-dialog v-model="entryDialog" title="Record a transaction" width="560px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Type">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="type in ENTRY_TYPES" :key="type" :label="typeLabel(type)" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="form.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="hasFee" label="Fee">
          <el-input-number v-model="form.fee" :precision="2" :min="0" :step="10" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Account" required>
          <el-select v-model="form.account_id" placeholder="Choose the account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Category">
          <el-select v-model="form.category" clearable filterable placeholder="Choose a category" style="width: 100%">
            <el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="Counterparty">
          <el-input v-model="form.counterparty" maxlength="200" placeholder="Who was paid, or who paid" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="300" />
        </el-form-item>
        <el-form-item label="Date">
          <el-date-picker v-model="form.txn_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-collapse class="fin-form-optional">
          <el-collapse-item title="Receipt, payment method & allocation" name="details">
        <el-form-item label="Method">
          <el-select v-model="form.method" style="width: 100%" filterable allow-create clearable placeholder="Bank transfer, M-Pesa, cash…">
            <el-option v-for="method in paymentMethods" :key="method" :label="method" :value="method" />
          </el-select>
        </el-form-item>
        <el-form-item label="Reference">
          <el-input v-model="form.reference" maxlength="120" placeholder="Receipt or transaction number" />
        </el-form-item>
        <el-form-item label="Budget">
          <el-select v-model="form.budget_id" clearable placeholder="Charge this to a budget" style="width: 100%">
            <el-option v-for="budget in budgets" :key="budget.id" :label="budget.name" :value="budget.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" />
        </el-form-item>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <template #footer>
        <el-button @click="entryDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveEntry">Record</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="transferDialog" title="Transfer between accounts" width="500px">
      <el-form :model="transferForm" label-width="110px">
        <el-form-item label="From" required>
          <el-select v-model="transferForm.from_account_id" placeholder="Source account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="To" required>
          <el-select v-model="transferForm.to_account_id" placeholder="Destination account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="transferForm.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Fee">
          <el-input-number v-model="transferForm.fee" :precision="2" :min="0" :step="10" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="transferForm.description" maxlength="300" placeholder="Why the money moved" />
        </el-form-item>
      </el-form>
      <div class="fin-hint fin-hint-block">
        A transfer is two linked movements with the same reference. It never changes the company's total cash.
      </div>
      <template #footer>
        <el-button @click="transferDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="savingTransfer" @click="saveTransfer">Transfer</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="voidDialog" title="Void transaction" width="440px">
      <p class="fin-void-copy">
        Voiding reverses <strong>{{ voidTarget?.description || voidTarget?.type }}</strong>
        ({{ money(voidTarget?.amount_cents, voidTarget?.currency) }}). The row and its history are kept.
      </p>
      <el-input v-model="voidReason" type="textarea" :rows="3" maxlength="300" placeholder="Why is this being reversed?" />
      <template #footer>
        <el-button @click="voidDialog = false">Cancel</el-button>
        <el-button type="danger" :loading="voiding" :disabled="!voidReason.trim()" @click="confirmVoid">Void transaction</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailOpen" title="Transaction" size="460px" :destroy-on-close="true">
      <div v-loading="detailLoading" class="fin-detail">
        <template v-if="detail">
          <div class="fin-detail-amount">
            <span :class="detail.direction === 'in' ? 'fin-positive' : 'fin-amount-out'">
              {{ signed(detail.amount_cents, detail.direction, detail.currency) }}
            </span>
            <span class="fin-detail-type">{{ typeLabel(detail.type) }} · {{ detail.status }}</span>
          </div>

          <dl class="fin-detail-grid">
            <dt>Account</dt>
            <dd>{{ detail.account_name || '—' }}</dd>
            <dt>Date</dt>
            <dd>{{ detail.txn_date || '—' }}</dd>
            <dt>Counterparty</dt>
            <dd>{{ detail.counterparty || '—' }}</dd>
            <dt>Category</dt>
            <dd>{{ detail.category || '—' }}</dd>
            <dt>Fee</dt>
            <dd>{{ detail.fee_cents ? money(detail.fee_cents, detail.currency) : '—' }}</dd>
            <dt>Net impact</dt>
            <dd>{{ money(detail.net_cents, detail.currency) }}</dd>
            <dt>Method</dt>
            <dd>{{ detail.method || '—' }}</dd>
            <dt>Reference</dt>
            <dd>{{ detail.reference || '—' }}</dd>
            <dt>Recorded by</dt>
            <dd>{{ detail.recorded_by || '—' }}</dd>
          </dl>

          <p v-if="detail.description" class="fin-detail-description">{{ detail.description }}</p>
          <p v-if="detail.reason" class="fin-detail-description">
            <strong>Reason:</strong> {{ detail.reason }}
          </p>
          <p v-if="detail.void_reason" class="fin-detail-description">
            <strong>Voided:</strong> {{ detail.void_reason }}
          </p>

          <section v-if="detail.links?.length" class="fin-detail-block">
            <h3>Ledger references</h3>
            <ul class="fin-detail-links">
              <li v-for="link in detail.links" :key="`${link.kind}-${link.id}`">
                <span class="fin-link-kind">{{ linkLabel(link.kind) }}</span>
                <span>{{ link.label }}</span>
              </li>
            </ul>
          </section>

          <LinkedRecords
            source-type="transaction"
            :source-id="detail.id"
            :editable="canEditRelations"
          />

          <section v-if="detail.transfer" class="fin-detail-block">
            <h3>Other half of the transfer</h3>
            <p class="fin-cell-meta">
              {{ detail.transfer.account_name || 'Account' }}
              · {{ signed(detail.transfer.amount_cents, detail.transfer.direction, detail.currency) }}
            </p>
          </section>

          <section class="fin-detail-block">
            <h3>History</h3>
            <p v-if="!detail.audit?.length" class="fin-cell-meta">No audit entries.</p>
            <ul v-else class="fin-detail-trail">
              <li v-for="entry in detail.audit" :key="entry.id">
                <span class="fin-trail-action">{{ entry.action }}</span>
                <span class="fin-cell-meta">
                  {{ entry.actor_name || 'user ' + entry.actor_id }} · {{ entry.create_time }}
                  <template v-if="entry.reason"> · {{ entry.reason }}</template>
                </span>
              </li>
            </ul>
          </section>

          <div class="fin-detail-actions">
            <el-button
              v-if="detail.can_void"
              v-perm="'finance:void'"
              type="danger"
              plain
              @click="openVoid(detail); detailOpen = false"
            >Void this transaction</el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <ImportDialog v-model="importOpen" :accounts="accounts" @imported="onImported" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import StatCard from './StatCard.vue'
import ImportDialog from './ImportDialog.vue'
import LinkedRecords from '@/components/finance/LinkedRecords.vue'
import { hasPerm } from '@/perm/perm.js'
import {
  financeAccounts, financeBudgets, financeCategories, financeTransaction,
  financeTransactionCreate, financeTransactionExport, financeTransactionVoid,
  financeTransactions, financeTransferCreate,
} from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'
import { statusLabel } from '@/utils/finance-labels.js'

const TYPES = [
  'income', 'expense', 'funding', 'payment', 'refund', 'fee',
  'debt_payment', 'subscription_payment', 'invoice_payment', 'reimbursement', 'advance',
]
const ENTRY_TYPES = ['expense', 'income', 'payment', 'refund', 'fee']

const TYPE_LABELS = {
  income: 'Income', expense: 'Expense', funding: 'Funding', payment: 'Payment',
  refund: 'Refund', fee: 'Fee', debt_payment: 'Debt payment',
  subscription_payment: 'Subscription', invoice_payment: 'Invoice payment',
  reimbursement: 'Reimbursement', advance: 'Advance', transfer: 'Transfer',
}

// The ledger's own foreign keys, named the way the rest of the product names
// them. A member should not have to know that a budget is stored as budget_id.
const LINK_LABELS = {
  budget: 'Budget', debt: 'Obligation', subscription: 'Subscription', invoice: 'Invoice',
  funding: 'Funding', commitment: 'Commitment', reimbursement: 'Reimbursement',
  advance: 'Advance', project: 'Project', event: 'Event', request: 'Request',
}

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 50
const accounts = ref([])
const budgets = ref([])
const categories = ref([])
const paymentMethods = ref([])
const totals = ref({ income_cents: 0, expense_cents: 0, fees_cents: 0, transfers_cents: 0, net_cents: 0 })

const entryDialog = ref(false)
const saving = ref(false)
const transferDialog = ref(false)
const savingTransfer = ref(false)
const voidDialog = ref(false)
const voiding = ref(false)
const voidReason = ref('')
const importOpen = ref(false)
const voidTarget = ref(null)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const exporting = ref(false)

const filters = reactive({ search: '', direction: '', type: '', account_id: null, from: '', to: '' })

// Expenses, income and funding are the same ledger seen through a filter, not
// three more transaction models.
const props = defineProps({
  initialType: { type: String, default: '' },
  initialDirection: { type: String, default: '' },
})

const form = reactive(blankForm())
const transferForm = reactive({ from_account_id: null, to_account_id: null, amount: 0, fee: 0, description: '' })

function blankForm() {
  return {
    type: 'expense', amount: 0, fee: 0, account_id: null, category: '', counterparty: '',
    description: '', txn_date: '', method: '', reference: '', budget_id: null, notes: '',
  }
}

const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const hasFee = computed(() => ['expense', 'payment', 'debt_payment', 'subscription_payment', 'transfer'].includes(form.type))
const canEditRelations = computed(() => hasPerm('finance.transactions:create') || hasPerm('finance:edit'))
function linkLabel(kind) {
  return LINK_LABELS[kind] || kind
}
const rangeLabel = computed(() => {
  if (filters.from && filters.to) return `${filters.from} → ${filters.to}`
  if (filters.from) return `From ${filters.from}`
  if (filters.to) return `Until ${filters.to}`
  return 'All time'
})

const money = (cents, currency = 'KES') => formatCents(cents, currency)
const signed = (cents, direction, currency = 'KES') => {
  const value = Number(cents) || 0
  const prefix = direction === 'in' ? '+' : direction === 'out' ? '-' : ''
  return `${prefix}${formatCents(value, currency)}`
}
const toneOf = (cents) => (Number(cents) > 0 ? 'positive' : Number(cents) < 0 ? 'negative' : 'default')
const typeLabel = (type) => TYPE_LABELS[type] || type

async function load() {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize,
      search: filters.search || undefined,
      direction: filters.direction || undefined,
      type: filters.type || undefined,
      account_id: filters.account_id || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }
    const result = await financeTransactions(params)
    rows.value = result.list || []
    total.value = result.total ?? 0
    totals.value = result.totals || totals.value
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load transactions.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function loadLookups() {
  try {
    const [accountList, budgetList, categoryList, methodList] = await Promise.all([
      financeAccounts(),
      financeBudgets(),
      financeCategories(filters.direction === 'in' ? 'income' : 'expense'),
      financeCategories('payment_method').catch(() => []),
    ])
    accounts.value = (accountList.list || []).filter(row => row.status === 'active')
    budgets.value = budgetList.list || []
    categories.value = categoryList || []
    paymentMethods.value = (methodList || []).map(row => row.name)
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load finance options.', type: 'error', plain: true })
  }
}

function applyFilters() {
  page.value = 1
  load()
}

function resetFilters() {
  Object.assign(filters, { search: '', direction: '', type: '', account_id: null, from: '', to: '' })
  applyFilters()
}

function changePage(next) {
  page.value = next
  load()
}

async function openDetail(row) {
  detail.value = null
  detailOpen.value = true
  detailLoading.value = true
  try {
    detail.value = await financeTransaction(row.id)
  } catch (error) {
    detailOpen.value = false
    ElMessage({ message: error.message || 'Could not open this transaction.', type: 'error', plain: true })
  } finally {
    detailLoading.value = false
  }
}

function downloadCsv(result) {
  const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = result.filename || `finance-transactions-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

async function exportCsv() {
  exporting.value = true
  try {
    // The server builds the file from the same filters, so the export is the
    // whole filtered set rather than the page on screen.
    const result = await financeTransactionExport({
      search: filters.search || undefined,
      direction: filters.direction || undefined,
      type: filters.type || undefined,
      account_id: filters.account_id || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    })
    downloadCsv(result)
    if (result.truncated) {
      ElMessage({
        message: 'Only the first 5,000 matching rows were exported.',
        type: 'warning',
        plain: true,
      })
    } else {
      ElMessage({ message: `${result.rows} transactions exported.`, type: 'success', plain: true })
    }
  } catch (error) {
    ElMessage({ message: error.message || 'Could not export.', type: 'error', plain: true })
  } finally {
    exporting.value = false
  }
}

function openEntry() {
  Object.assign(form, blankForm())
  form.txn_date = new Date().toISOString().slice(0, 10)
  form.account_id = accounts.value[0]?.id ?? null
  entryDialog.value = true
}

async function saveEntry() {
  if (!form.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  if (!form.account_id) {
    ElMessage({ message: 'Choose the account this belongs to.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    await financeTransactionCreate({
      type: form.type,
      amount_cents: toCents(form.amount),
      fee_cents: toCents(form.fee),
      account_id: form.account_id,
      category: form.category,
      counterparty: form.counterparty,
      description: form.description,
      txn_date: form.txn_date || undefined,
      method: form.method,
      reference: form.reference,
      budget_id: form.budget_id,
      notes: form.notes,
      status: 'posted',
    })
    entryDialog.value = false
    await load()
    ElMessage({ message: 'Transaction recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not record the transaction.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function openImport() {
  importOpen.value = true
}

function onImported() {
  loadLookups()
  load()
  ElMessage({ message: 'Import complete.', type: 'success', plain: true })
}

function openTransfer() {
  Object.assign(transferForm, {
    from_account_id: accounts.value[0]?.id ?? null,
    to_account_id: accounts.value[1]?.id ?? null,
    amount: 0,
    fee: 0,
    description: '',
  })
  transferDialog.value = true
}

async function saveTransfer() {
  if (transferForm.from_account_id === transferForm.to_account_id) {
    ElMessage({ message: 'Choose two different accounts.', type: 'warning', plain: true })
    return
  }
  if (!transferForm.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  savingTransfer.value = true
  try {
    await financeTransferCreate({
      from_account_id: transferForm.from_account_id,
      to_account_id: transferForm.to_account_id,
      amount_cents: toCents(transferForm.amount),
      fee_cents: toCents(transferForm.fee),
      description: transferForm.description,
    })
    transferDialog.value = false
    await load()
    ElMessage({ message: 'Transfer recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not record the transfer.', type: 'error', plain: true })
  } finally {
    savingTransfer.value = false
  }
}

function openVoid(row) {
  voidTarget.value = row
  voidReason.value = ''
  voidDialog.value = true
}

async function confirmVoid() {
  const reason = voidReason.value.trim()
  if (!reason) return
  voiding.value = true
  try {
    await financeTransactionVoid(voidTarget.value.id, { reason })
    voidDialog.value = false
    await load()
    ElMessage({ message: 'Transaction voided.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not void the transaction.', type: 'error', plain: true })
  } finally {
    voiding.value = false
  }
}

// The ledger is the source of truth; exporting it as CSV keeps the books
// portable without adding a reporting engine.
onMounted(async () => {
  // A section can open straight onto a filter (Expenses, Income, Funding).
  if (props.initialType) filters.type = props.initialType
  if (props.initialDirection) filters.direction = props.initialDirection
  await Promise.all([load(), loadLookups()])
})
</script>

<style scoped>
.fin-panel {
  display: grid;
  gap: 16px;
  max-width: 1180px;
}

.fin-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.fin-kicker {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.fin-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -.03em;
}

.fin-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.fin-card {
  padding: 14px 16px 16px;
  border: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
  border-radius: 11px;
  background: var(--hq-surface, transparent);
}

.fin-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.fin-cell-main {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.fin-cell-meta {
  display: block;
  color: var(--hq-muted);
  font-size: 11px;
}

.fin-table-title {
  font-weight: 550;
}

.fin-positive {
  color: var(--hq-success, #2f9e6f);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fin-amount-out {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fin-status {
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.fin-status.is-posted {
  color: var(--hq-success, #2f9e6f);
}

.fin-status.is-pending {
  color: var(--hq-warning, #d98a1c);
}

.fin-status.is-void {
  color: var(--hq-muted);
  text-decoration: line-through;
}

.fin-empty {
  padding: 26px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
}

.fin-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.fin-pager-label {
  color: var(--hq-muted);
  font-size: 12px;
}

.fin-hint {
  color: var(--hq-muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.fin-hint-block {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--hq-hover);
}

.fin-void-copy {
  margin: 0 0 12px;
  color: var(--hq-text-secondary);
  font-size: 12.5px;
  line-height: 1.5;
}

.fin-clickable :deep(.el-table__row) {
  cursor: pointer;
}

.fin-detail {
  display: grid;
  gap: 16px;
}

.fin-detail-amount {
  display: grid;
  gap: 2px;
  font-size: 26px;
  font-weight: 650;
  letter-spacing: -.02em;
  font-variant-numeric: tabular-nums;
}

.fin-detail-type {
  color: var(--hq-muted);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
}

.fin-detail-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 7px 12px;
  margin: 0;
  font-size: 12.5px;
}

.fin-detail-grid dt {
  color: var(--hq-muted);
}

.fin-detail-grid dd {
  margin: 0;
  color: var(--hq-text);
}

.fin-detail-description {
  margin: 0;
  color: var(--hq-text-secondary);
  font-size: 12.5px;
  line-height: 1.5;
}

.fin-detail-block {
  display: grid;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
}

.fin-detail-block h3 {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: .02em;
  text-transform: uppercase;
  color: var(--hq-muted);
}

.fin-detail-links,
.fin-detail-trail {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
}

.fin-detail-links li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fin-link-kind {
  min-width: 92px;
  color: var(--hq-muted);
  font-size: 11px;
  text-transform: capitalize;
}

.fin-trail-action {
  font-weight: 600;
  text-transform: capitalize;
}

.fin-detail-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
}
</style>
