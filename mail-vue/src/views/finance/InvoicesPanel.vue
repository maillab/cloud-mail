<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Money owed to the company, and bills we owe</div>
        <h2>Invoices</h2>
      </div>
      <div class="fin-head-actions">
        <el-button v-perm="'finance.invoices:create'" size="small" type="primary" icon="plus" @click="openInvoice()">
          New invoice
        </el-button>
        <el-button v-perm="'finance.invoices:create'" size="small" icon="plus" @click="openBill()">
          Record a supplier bill
        </el-button>
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <div v-loading="loading" class="fin-body">
      <div class="fin-stats">
        <StatCard label="Owed to us" :value="money(outstanding)" hint="Issued invoices not yet paid" />
        <StatCard
          label="Overdue"
          :value="money(overdue)"
          :tone="overdue > 0 ? 'negative' : 'default'"
          :hint="`${overdueCount} overdue`"
        />
        <StatCard label="We owe" :value="money(payable)" hint="Supplier bills not yet paid" />
        <StatCard label="Paid" :value="money(paidTotal)" tone="positive" hint="Settled invoices and bills" />
      </div>

      <section class="fin-card">
        <div class="fin-card-head">
          <el-select v-model="statusFilter" size="small" style="width: 160px" @change="load">
            <el-option label="All statuses" value="" />
            <el-option v-for="status in STATUSES" :key="status" :label="status" :value="status" />
          </el-select>
          <el-select v-model="directionFilter" size="small" style="width: 190px" @change="load">
            <el-option label="Issued and supplier bills" value="" />
            <el-option v-for="option in DIRECTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
          <span class="fin-card-note">Issued invoices are owed to us; supplier bills are what we owe</span>
        </div>

        <div v-if="invoices.length" class="fin-table-wrap">
          <el-table :data="invoices" size="small" style="width: 100%">
            <el-table-column prop="invoice_number" label="Invoice" min-width="140">
              <template #default="scope">
                <div class="fin-cell-main">
                  <span class="fin-table-title">{{ scope.row.invoice_number }}</span>
                  <span v-if="scope.row.client_name" class="fin-cell-meta">{{ scope.row.client_name }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Direction" min-width="140">
              <template #default="scope">
                <span class="fin-status" :class="scope.row.direction === 'vendor' ? 'is-draft' : 'is-sent'">
                  {{ directionLabel(scope.row.direction) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="Total" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.total_cents, scope.row.currency) }}</template>
            </el-table-column>
            <el-table-column label="Paid" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.paid_cents, scope.row.currency) }}</template>
            </el-table-column>
            <el-table-column label="Balance" min-width="130" align="right">
              <template #default="scope">
                <span class="fin-amount" :class="{ 'fin-alert-text': scope.row.balance_cents > 0 }">
                  {{ money(scope.row.balance_cents, scope.row.currency) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="Due" min-width="110">
              <template #default="scope">
                <span :class="{ 'fin-alert-text': scope.row.overdue }">{{ scope.row.due_date || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Status" min-width="100">
              <template #default="scope">
                <span class="fin-status" :class="`is-${scope.row.status}`">{{ invoiceStatusLabel(scope.row.status) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Actions" min-width="260" fixed="right">
              <template #default="scope">
                <el-button text size="small" @click="openDetail(scope.row)">Open</el-button>
                <el-button
                  v-perm="'finance.invoices:send'"
                  text
                  size="small"
                  @click="openShare(scope.row)"
                >Share</el-button>
                <el-button
                  v-perm="'finance.invoices:send'"
                  v-if="scope.row.status === 'draft'"
                  text
                  size="small"
                  @click="markSent(scope.row)"
                >Mark sent</el-button>
                <el-button
                  v-perm="'finance.invoices:manage'"
                  v-if="scope.row.balance_cents > 0 && scope.row.status !== 'cancelled'"
                  text
                  size="small"
                  type="success"
                  @click="openPay(scope.row)"
                >Record payment</el-button>
                <el-button
                  v-perm="'finance.invoices:manage'"
                  v-if="scope.row.status !== 'paid' && scope.row.status !== 'cancelled'"
                  text
                  size="small"
                  @click="openInvoice(scope.row)"
                >Edit</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="fin-empty">
          <p>No invoices yet. An invoice is how a promise to pay becomes a record the company can chase.</p>
          <el-button v-perm="'finance.invoices:create'" type="primary" @click="openInvoice()">Create the first invoice</el-button>
        </div>
      </section>
    </div>

    <el-dialog v-model="invoiceDialog" :title="dialogTitle" width="720px" top="5vh">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Invoice number">
          <el-input v-model="form.invoice_number" maxlength="60" placeholder="Leave empty to generate one" />
        </el-form-item>
        <el-form-item label="Client" required>
          <el-input v-model="form.client_name" maxlength="200" placeholder="Who is being billed" />
        </el-form-item>
        <el-form-item label="Client email">
          <el-input v-model="form.customer_email" maxlength="200" placeholder="billing@client.com" />
        </el-form-item>
        <el-form-item label="Currency">
          <el-input v-model="form.currency" maxlength="8" placeholder="KES" />
        </el-form-item>
        <el-form-item label="Issue date">
          <el-date-picker v-model="form.issue_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Due date">
          <el-date-picker v-model="form.due_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Into account">
          <el-select v-model="form.account_id" clearable placeholder="Where the payment will land" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <div class="fin-items">
        <div class="fin-items-head">
          <span class="fin-card-label">Line items</span>
          <el-button text size="small" icon="plus" @click="addItem">Add line</el-button>
        </div>
        <div v-for="(item, index) in form.items" :key="index" class="fin-item-row">
          <el-input v-model="item.description" placeholder="Description" maxlength="300" class="fin-item-desc" />
          <el-input-number v-model="item.quantity" :min="0" :precision="0" :step="1" controls-position="right" class="fin-item-qty" />
          <el-input-number v-model="item.rate" :min="0" :precision="2" :step="100" controls-position="right" class="fin-item-rate" />
          <span class="fin-item-total">{{ money(toCents(item.rate) * (Number(item.quantity) || 0), form.currency) }}</span>
          <el-button text size="small" type="danger" icon="delete" @click="removeItem(index)" />
        </div>
        <div class="fin-items-foot">
          <span class="fin-card-label">Tax</span>
          <el-input-number v-model="form.tax" :min="0" :precision="2" :step="100" controls-position="right" class="fin-item-rate" />
          <span class="fin-items-total">
            Total {{ money(lineTotal + toCents(form.tax), form.currency) }}
          </span>
        </div>
      </div>

      <el-form label-width="120px">
        <el-form-item label="Direction">
          <el-select v-model="form.direction" style="width: 100%" :disabled="!!form.id">
            <el-option v-for="option in DIRECTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
          <span class="fin-hint">
            Issued invoices are money owed to XPass. Supplier bills are money XPass owes; they never
            add to receivables.
          </span>
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" />
        </el-form-item>
        <el-form-item label="Status">
          <el-select v-model="form.status" style="width: 100%">
            <el-option label="Draft" value="draft" />
            <el-option label="Sent" value="sent" />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- Links outlive the edit: a deal, a project or a request explains what
           this invoice was for. Editing the invoice does not remove them. -->
      <LinkedRecords
        v-if="form.id"
        source-type="invoice"
        :source-id="form.id"
        :editable="canEditRelations"
      />

      <template #footer>
        <el-button @click="invoiceDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveInvoice">Save</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="payDialog" :title="`Record payment · ${payTarget?.invoice_number || ''}`" width="520px">
      <el-form :model="payForm" label-width="120px">
        <el-form-item label="Balance">
          <span class="fin-amount">{{ money(payTarget?.balance_cents, payTarget?.currency) }}</span>
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="payForm.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
          <el-button text size="small" @click="payForm.amount = (Number(payTarget?.balance_cents) || 0) / 100">Settle in full</el-button>
        </el-form-item>
        <el-form-item label="Into account" required>
          <el-select v-model="payForm.account_id" placeholder="Choose the account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Method">
          <el-input v-model="payForm.method" maxlength="60" />
        </el-form-item>
        <el-form-item label="Reference">
          <el-input v-model="payForm.reference" maxlength="120" />
        </el-form-item>
        <el-form-item label="Paid on">
          <el-date-picker v-model="payForm.paid_at" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="paying" @click="savePay">Record payment</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialog" :title="detail?.invoice_number || 'Invoice'" width="820px" top="6vh">
      <div v-loading="detailLoading" class="fin-detail">
        <div class="fin-stats">
          <StatCard label="Total" :value="money(detail?.total_cents, detail?.currency)" />
          <StatCard label="Paid" :value="money(detail?.paid_cents, detail?.currency)" tone="positive" />
          <StatCard
            label="Balance"
            :value="money(detail?.balance_cents, detail?.currency)"
            :tone="Number(detail?.balance_cents) > 0 ? 'warning' : 'positive'"
          />
          <StatCard label="Status" :value="detail?.status || '—'" :hint="detail?.due_date ? `Due ${detail.due_date}` : ''" />
        </div>

        <section class="fin-block">
          <div class="fin-card-head">
            <h3>Line items</h3>
            <span class="fin-card-note">{{ detail?.client_name || 'No client' }}</span>
          </div>
          <el-table v-if="detail?.items?.length" :data="detail.items" size="small" style="width: 100%">
            <el-table-column prop="description" label="Description" min-width="240" />
            <el-table-column prop="quantity" label="Qty" min-width="70" align="right" />
            <el-table-column label="Rate" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.rate_cents, detail.currency) }}</template>
            </el-table-column>
            <el-table-column label="Amount" min-width="130" align="right">
              <template #default="scope">{{ money(scope.row.amount_cents, detail.currency) }}</template>
            </el-table-column>
          </el-table>
          <div v-else class="fin-empty">No line items.</div>
        </section>

        <section class="fin-block">
          <div class="fin-card-head">
            <h3>Payments</h3>
          </div>
          <el-table v-if="detail?.payments?.length" :data="detail.payments" size="small" style="width: 100%">
            <el-table-column label="Paid on" min-width="160">
              <template #default="scope">{{ String(scope.row.paid_at || '').slice(0, 10) || '—' }}</template>
            </el-table-column>
            <el-table-column label="Amount" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.amount_cents, detail.currency) }}</template>
            </el-table-column>
            <el-table-column prop="method" label="Method" min-width="120" />
            <el-table-column prop="reference" label="Reference" min-width="140" />
            <el-table-column prop="account_name" label="Account" min-width="140" />
          </el-table>
          <div v-else class="fin-empty">No payments recorded.</div>
        </section>
      </div>
    </el-dialog>

    <el-dialog v-model="shareDialog" title="Share invoice" width="560px">
      <div v-if="shareTarget" class="fin-share">
        <p class="fin-share-intro">
          Anyone with this link can view invoice
          <strong>{{ shareTarget.invoice_number }}</strong> read-only. They cannot see any other
          company data, and you can revoke the link at any time.
        </p>
        <el-form label-position="top">
          <el-form-item label="Link expires">
            <el-select v-model="shareExpiry" style="width: 100%">
              <el-option label="In 7 days" :value="7" />
              <el-option label="In 30 days" :value="30" />
              <el-option label="Never (revoke manually)" :value="0" />
            </el-select>
          </el-form-item>
        </el-form>
        <div class="fin-share-actions">
          <el-button type="primary" :loading="creatingShare" @click="createShare">
            {{ shareUrl ? 'Create a new link' : 'Create share link' }}
          </el-button>
        </div>
        <div v-if="shareUrl" class="fin-share-result">
          <el-input :model-value="shareUrl" readonly>
            <template #append>
              <el-button @click="copyShare">Copy</el-button>
            </template>
          </el-input>
          <span class="fin-hint">
            Open
            <a :href="shareUrl" target="_blank" rel="noopener">the shared invoice</a>
            to preview what the recipient sees.
          </span>
        </div>
        <div class="fin-share-links">
          <span class="fin-card-label">Active links</span>
          <div v-if="!shares.length" class="fin-empty">No active links yet.</div>
          <ul v-else class="fin-share-list">
            <li v-for="link in shares" :key="link.id">
              <span class="fin-share-meta">
                {{ link.expires_at ? `Expires ${link.expires_at.slice(0, 10)}` : 'No expiry' }}
                · {{ link.access_count }} view{{ link.access_count === 1 ? '' : 's' }}
              </span>
              <el-button text size="small" type="danger" @click="revokeShare(link)">Revoke</el-button>
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <el-button @click="shareDialog = false">Close</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import StatCard from './StatCard.vue'
import LinkedRecords from '@/components/finance/LinkedRecords.vue'
import { hasPerm } from '@/perm/perm.js'
import {
  financeAccounts, financeInvoice, financeInvoiceCreate, financeInvoicePay,
  financeInvoiceUpdate, financeInvoices, financeInvoiceShares,
  financeInvoiceShareCreate, financeInvoiceShareRevoke,
} from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'
import { statusLabel as invoiceStatusLabel } from '@/utils/finance-labels.js'

const STATUSES = ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled']
// issued = XPass billed a customer. vendor = a supplier billed XPass.
const DIRECTIONS = [
  { value: 'issued', label: 'Issued by XPass' },
  { value: 'vendor', label: 'Supplier bill' },
]

const loading = ref(false)
const invoices = ref([])
const outstanding = ref(0)
const payable = ref(0)
const overdueTotal = ref(0)
const accounts = ref([])
const statusFilter = ref('')
const directionFilter = ref('')

const invoiceDialog = ref(false)
const saving = ref(false)
const payDialog = ref(false)
const paying = ref(false)
const detailDialog = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const payTarget = ref(null)

const shareDialog = ref(false)
const shareTarget = ref(null)
const shareExpiry = ref(30)
const shareUrl = ref('')
const shares = ref([])
const creatingShare = ref(false)

const form = reactive(blankInvoice())
const payForm = reactive({ amount: 0, account_id: null, method: '', reference: '', paid_at: '' })

function blankInvoice() {
  return {
    id: null, invoice_number: '', client_name: '', customer_email: '', currency: 'KES',
    issue_date: '', due_date: '', account_id: null, tax: 0, status: 'draft', notes: '',
    direction: 'issued',
    items: [{ description: '', quantity: 1, rate: 0 }],
  }
}

const money = (cents, currency = 'KES') => formatCents(cents, currency)
const canEditRelations = computed(() => hasPerm('finance.invoices:create') || hasPerm('finance:edit'))
const dialogTitle = computed(() => {
  if (form.id) return form.direction === 'vendor' ? 'Edit supplier bill' : 'Edit invoice'
  return form.direction === 'vendor' ? 'Record a supplier bill' : 'New invoice'
})
function directionLabel(value) {
  return DIRECTIONS.find((option) => option.value === value)?.label || 'Issued by XPass'
}

const lineTotal = computed(() => form.items.reduce((sum, item) => {
  return sum + toCents(item.rate, form.currency) * (Number(item.quantity) || 0)
}, 0))

const overdueCount = computed(() => invoices.value.filter(row => row.overdue).length)
const paidTotal = computed(() => invoices.value.reduce((sum, row) => sum + (Number(row.paid_cents) || 0), 0))

async function load() {
  loading.value = true
  try {
    const params = {}
    if (statusFilter.value) params.status = statusFilter.value
    if (directionFilter.value) params.direction = directionFilter.value
    const [list, accountList] = await Promise.all([
      financeInvoices(params),
      financeAccounts(),
    ])
    invoices.value = list.list || []
    outstanding.value = list.outstandingCents ?? 0
    payable.value = list.payableCents ?? 0
    overdueTotal.value = list.overdueCents ?? 0
    accounts.value = (accountList.list || []).filter(row => row.status === 'active')
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load invoices.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function addItem() {
  form.items.push({ description: '', quantity: 1, rate: 0 })
}

// A supplier bill is the same document with the direction flipped. Keeping one
// form means a bill cannot drift away from the invoice rules that govern it.
function openBill() {
  openInvoice()
  form.direction = 'vendor'
}

function removeItem(index) {
  if (form.items.length === 1) {
    form.items[0] = { description: '', quantity: 1, rate: 0 }
    return
  }
  form.items.splice(index, 1)
}

function openInvoice(row = null) {
  Object.assign(form, blankInvoice())
  if (row) {
    Object.assign(form, {
      id: row.id,
      invoice_number: row.invoice_number || '',
      client_name: row.client_name || '',
      customer_email: row.customer_email || '',
      currency: row.currency || 'KES',
      issue_date: row.issue_date || '',
      due_date: row.due_date || '',
      account_id: row.account_id || null,
      tax: (Number(row.tax_cents) || 0) / 100,
      status: row.status === 'sent' ? 'sent' : 'draft',
      direction: row.direction === 'vendor' ? 'vendor' : 'issued',
      notes: row.notes || '',
      items: (row.items || []).map(item => ({
        description: item.description,
        quantity: item.quantity,
        rate: (Number(item.rate_cents) || 0) / 100,
      })),
    })
    if (!form.items.length) form.items = [{ description: '', quantity: 1, rate: 0 }]
  }
  invoiceDialog.value = true
}

async function saveInvoice() {
  if (!form.client_name.trim()) {
    ElMessage({ message: 'Name the client being billed.', type: 'warning', plain: true })
    return
  }
  if (!lineTotal.value) {
    ElMessage({ message: 'Add at least one line with an amount.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    const payload = {
      invoice_number: form.invoice_number || undefined,
      client_name: form.client_name,
      customer_email: form.customer_email,
      currency: (form.currency || 'KES').toUpperCase(),
      issue_date: form.issue_date || undefined,
      due_date: form.due_date || undefined,
      account_id: form.account_id,
      tax_cents: toCents(form.tax, form.currency),
      status: form.status,
      notes: form.notes,
      direction: form.direction || 'issued',
      items: form.items.map(item => ({
        description: item.description,
        quantity: Number(item.quantity) || 1,
        rate_cents: toCents(item.rate, form.currency),
      })),
    }
    if (form.id) await financeInvoiceUpdate(form.id, payload)
    else await financeInvoiceCreate(payload)
    invoiceDialog.value = false
    await load()
    ElMessage({ message: 'Invoice saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save the invoice.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function openPay(row) {
  payTarget.value = row
  Object.assign(payForm, {
    amount: 0,
    account_id: row.account_id ?? accounts.value[0]?.id ?? null,
    method: '',
    reference: '',
    paid_at: new Date().toISOString().slice(0, 10),
  })
  payDialog.value = true
}

async function savePay() {
  if (!payForm.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  if (!payForm.account_id) {
    ElMessage({ message: 'Choose the account the money landed in.', type: 'warning', plain: true })
    return
  }
  paying.value = true
  try {
    await financeInvoicePay(payTarget.value.id, {
      amount_cents: toCents(payForm.amount, payTarget.value.currency),
      account_id: payForm.account_id,
      method: payForm.method,
      reference: payForm.reference,
      paid_at: payForm.paid_at || undefined,
    })
    payDialog.value = false
    await load()
    ElMessage({ message: 'Payment recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not record the payment.', type: 'error', plain: true })
  } finally {
    paying.value = false
  }
}

async function markSent(row) {
  try {
    await financeInvoiceUpdate(row.id, { status: 'sent' })
    await load()
    ElMessage({ message: 'Invoice marked as sent.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not update the invoice.', type: 'error', plain: true })
  }
}

async function openShare(row) {
  shareTarget.value = row
  shareUrl.value = ''
  shareExpiry.value = 30
  shares.value = []
  shareDialog.value = true
  try {
    const list = await financeInvoiceShares(row.id)
    shares.value = (list || []).filter(link => link.active)
  } catch {
    // A missing list is not fatal; the create action still works.
  }
}

async function createShare() {
  if (!shareTarget.value) return
  creatingShare.value = true
  try {
    const origin = window.location.origin
    const result = await financeInvoiceShareCreate(shareTarget.value.id, {
      expires_in_days: shareExpiry.value || undefined,
      base_url: origin,
    })
    shareUrl.value = result.url || `${origin}${result.path}`
    const list = await financeInvoiceShares(shareTarget.value.id)
    shares.value = (list || []).filter(link => link.active)
    ElMessage({ message: 'Share link created.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not create the share link.', type: 'error', plain: true })
  } finally {
    creatingShare.value = false
  }
}

async function copyShare() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    ElMessage({ message: 'Link copied.', type: 'success', plain: true })
  } catch {
    ElMessage({ message: 'Copy failed. Select the link and copy it manually.', type: 'warning', plain: true })
  }
}

async function revokeShare(link) {
  try {
    await financeInvoiceShareRevoke(shareTarget.value.id, link.id)
    shares.value = shares.value.filter(item => item.id !== link.id)
    ElMessage({ message: 'Link revoked.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not revoke the link.', type: 'error', plain: true })
  }
}

async function openDetail(row) {
  detailDialog.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await financeInvoice(row.id)
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the invoice.', type: 'error', plain: true })
  } finally {
    detailLoading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.fin-share {
  display: grid;
  gap: 14px;
}

.fin-share-intro {
  margin: 0;
  color: var(--hq-muted);
  font-size: 13px;
  line-height: 1.5;
}

.fin-share-actions {
  display: flex;
  gap: 8px;
}

.fin-share-result {
  display: grid;
  gap: 6px;
}

.fin-share-links {
  display: grid;
  gap: 6px;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
}

.fin-share-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.fin-share-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}

.fin-share-meta {
  color: var(--hq-muted);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
}

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

.fin-body {
  display: grid;
  gap: 14px;
  min-height: 200px;
}

.fin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
}

.fin-card {
  padding: 14px 16px 16px;
  border: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
  border-radius: 11px;
  background: var(--hq-surface, transparent);
}

.fin-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.fin-card-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--hq-text-secondary);
}

.fin-card-note {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.fin-table-wrap {
  min-width: 0;
  overflow-x: auto;
}

.fin-cell-main {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.fin-table-title {
  font-weight: 550;
}

.fin-cell-meta {
  color: var(--hq-muted);
  font-size: 11px;
}

.fin-amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fin-alert-text {
  color: var(--hq-danger, #e5484d);
  font-weight: 600;
}

.fin-status {
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.fin-status.is-paid {
  color: var(--hq-success, #2f9e6f);
}

.fin-status.is-overdue {
  color: var(--hq-danger, #e5484d);
}

.fin-status.is-partial,
.fin-status.is-sent,
.fin-status.is-viewed {
  color: var(--hq-warning, #d98a1c);
}

.fin-status.is-draft,
.fin-status.is-cancelled {
  color: var(--hq-muted);
}

.fin-empty {
  padding: 24px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
}

.fin-items {
  display: grid;
  gap: 8px;
  padding: 12px 0 4px;
  border-top: 1px solid var(--hq-border, rgba(148, 163, 184, .16));
}

.fin-items-head,
.fin-items-foot {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fin-card-label {
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.fin-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 90px 130px 130px 32px;
  gap: 8px;
  align-items: center;
}

.fin-item-qty {
  width: 90px;
}

.fin-item-rate {
  width: 130px;
}

.fin-item-total {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.fin-items-foot {
  padding-top: 6px;
  border-top: 1px dashed var(--hq-border, rgba(148, 163, 184, .16));
}

.fin-items-total {
  margin-left: auto;
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.fin-detail {
  display: grid;
  gap: 14px;
}

.fin-block {
  padding-top: 4px;
}

@media (max-width: 700px) {
  .fin-item-row {
    grid-template-columns: minmax(0, 1fr) 80px;
  }

  .fin-item-total {
    text-align: left;
  }
}
</style>