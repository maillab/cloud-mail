<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">What the company owes</div>
        <h2>Debts</h2>
      </div>
      <div class="fin-head-actions">
        <el-button v-perm="'finance.debts:create'" size="small" type="primary" icon="plus" @click="openDebt()">
          Record debt
        </el-button>
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <div v-loading="loading" class="fin-body">
      <div class="fin-stats">
        <StatCard label="Outstanding" :value="money(sumOutstanding)" hint="Across every open debt" />
        <StatCard
          label="Overdue"
          :value="money(sumOverdue)"
          :tone="sumOverdue > 0 ? 'negative' : 'default'"
          :hint="`${overdueCount} overdue`"
        />
        <StatCard label="Paid so far" :value="money(sumPaid)" tone="positive" hint="Payments already made" />
        <StatCard label="Original total" :value="money(sumOriginal)" hint="Never overwritten by payments" />
      </div>

      <section class="fin-card">
        <div v-if="debts.length" class="fin-table-wrap">
          <el-table :data="debts" size="small" style="width: 100%">
            <el-table-column label="Debt" min-width="190">
              <template #default="scope">
                <div class="fin-cell-main">
                  <span class="fin-table-title">{{ scope.row.name }}</span>
                  <span v-if="scope.row.creditor" class="fin-cell-meta">{{ scope.row.creditor }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Original" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.original_cents) }}</template>
            </el-table-column>
            <el-table-column label="Added" min-width="110" align="right">
              <template #default="scope">
                <span v-if="scope.row.added_cents" class="fin-alert-text">
                  {{ signed(scope.row.added_cents) }}
                </span>
                <span v-else class="fin-cell-meta">—</span>
              </template>
            </el-table-column>
            <el-table-column label="Paid" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.paid_cents) }}</template>
            </el-table-column>
            <el-table-column label="Outstanding" min-width="130" align="right">
              <template #default="scope">
                <span class="fin-amount" :class="{ 'fin-alert-text': scope.row.outstanding_cents > 0 }">
                  {{ money(scope.row.outstanding_cents) }}
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
                <span class="fin-status" :class="`is-${scope.row.status}`">{{ statusLabel(scope.row.status) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Actions" min-width="200" fixed="right">
              <template #default="scope">
                <el-button text size="small" @click="openDetail(scope.row)">Open</el-button>
                <el-button
                  v-perm="'finance.debts:pay'"
                  v-if="scope.row.outstanding_cents > 0 && scope.row.status !== 'cancelled'"
                  text
                  size="small"
                  type="success"
                  @click="openPay(scope.row)"
                >Pay</el-button>
                <el-button
                  v-perm="'finance.debts:create'"
                  v-if="scope.row.outstanding_cents > 0 && scope.row.status !== 'cancelled'"
                  text
                  size="small"
                  @click="openCharge(scope.row)"
                >Add charge</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="fin-empty">
          <p>No debts recorded. Anything the company owes belongs here, not in someone's notes.</p>
          <el-button v-perm="'finance.debts:create'" type="primary" @click="openDebt()">Record the first debt</el-button>
        </div>
      </section>
    </div>

    <el-dialog v-model="debtDialog" title="Record a debt" width="520px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" maxlength="200" placeholder="e.g. Supplier loan" />
        </el-form-item>
        <el-form-item label="Creditor">
          <el-input v-model="form.creditor" maxlength="200" placeholder="Who is owed" />
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="form.amount" :precision="2" :min="0" :step="1000" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Due date">
          <el-date-picker v-model="form.due_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Priority">
          <el-select v-model="form.priority" style="width: 100%">
            <el-option label="Normal" value="normal" />
            <el-option label="High" value="high" />
            <el-option label="Critical" value="critical" />
          </el-select>
        </el-form-item>
        <el-form-item label="Category">
          <el-input v-model="form.category" maxlength="80" placeholder="Loan, Supplier, Tax…" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="1000" />
        </el-form-item>
      </el-form>
      <div class="fin-hint fin-hint-block">
        The original amount is kept exactly as entered. Payments reduce the outstanding balance; charges added later
        appear separately so the history stays readable.
      </div>

      <LinkedRecords
        v-if="form.id"
        source-type="debt"
        :source-id="form.id"
        :editable="canEditRelations"
      />

      <template #footer>
        <el-button @click="debtDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveDebt">Record</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="payDialog" :title="`Record payment · ${payTarget?.name || ''}`" width="520px">
      <el-form :model="payForm" label-width="120px">
        <el-form-item label="Outstanding">
          <span class="fin-amount">{{ money(payTarget?.outstanding_cents) }}</span>
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="payForm.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
          <el-button text size="small" @click="payForm.amount = (Number(payTarget?.outstanding_cents) || 0) / 100">Pay in full</el-button>
        </el-form-item>
        <el-form-item label="From account" required>
          <el-select v-model="payForm.account_id" placeholder="Choose the account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Fee">
          <el-input-number v-model="payForm.fee" :precision="2" :min="0" :step="10" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Method">
          <el-input v-model="payForm.method" maxlength="60" placeholder="Bank transfer, M-Pesa…" />
        </el-form-item>
        <el-form-item label="Reference">
          <el-input v-model="payForm.reference" maxlength="120" />
        </el-form-item>
        <el-form-item label="Paid on">
          <el-date-picker v-model="payForm.paid_at" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="payForm.notes" type="textarea" :rows="2" maxlength="1000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="paying" @click="savePay">Record payment</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="chargeDialog" :title="`Add a charge · ${chargeTarget?.name || ''}`" width="500px">
      <el-form :model="chargeForm" label-width="110px">
        <el-form-item label="Amount" required>
          <el-input-number v-model="chargeForm.amount" :precision="2" :step="100" controls-position="right" style="width: 100%" />
          <span class="fin-hint">Use a negative amount to reduce what is owed.</span>
        </el-form-item>
        <el-form-item label="Reason" required>
          <el-input v-model="chargeForm.reason" type="textarea" :rows="3" maxlength="300" placeholder="Why the balance changed" />
        </el-form-item>
      </el-form>
      <div class="fin-hint fin-hint-block">
        Interest, penalties and negotiated reductions are all charges. Each one is kept with its reason.
      </div>
      <template #footer>
        <el-button @click="chargeDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="charging" @click="saveCharge">Add charge</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialog" :title="detail?.name || 'Debt'" width="820px" top="6vh">
      <div v-loading="detailLoading" class="fin-detail">
        <div class="fin-stats">
          <StatCard label="Original" :value="money(detail?.original_cents)" />
          <StatCard label="Paid" :value="money(detail?.paid_cents)" tone="positive" />
          <StatCard
            label="Outstanding"
            :value="money(detail?.outstanding_cents)"
            :tone="Number(detail?.outstanding_cents) > 0 ? 'warning' : 'positive'"
          />
          <StatCard label="Status" :value="detail?.status || '—'" :hint="detail?.due_date ? `Due ${detail.due_date}` : 'No due date'" />
        </div>

        <section class="fin-block">
          <div class="fin-card-head">
            <h3>Payments</h3>
          </div>
          <el-table v-if="detail?.payments?.length" :data="detail.payments" size="small" style="width: 100%">
            <el-table-column label="Paid on" min-width="160">
              <template #default="scope">{{ String(scope.row.paid_at || '').slice(0, 10) || '—' }}</template>
            </el-table-column>
            <el-table-column label="Amount" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.amount_cents) }}</template>
            </el-table-column>
            <el-table-column prop="method" label="Method" min-width="120" />
            <el-table-column prop="reference" label="Reference" min-width="140" />
            <el-table-column prop="account_name" label="Account" min-width="140" />
          </el-table>
          <div v-else class="fin-empty">No payments recorded.</div>
        </section>

        <section class="fin-block">
          <div class="fin-card-head">
            <h3>Charges added</h3>
          </div>
          <el-table v-if="detail?.adjustments?.length" :data="detail.adjustments" size="small" style="width: 100%">
            <el-table-column label="Amount" min-width="130" align="right">
              <template #default="scope">{{ signed(scope.row.amount_cents) }}</template>
            </el-table-column>
            <el-table-column prop="reason" label="Reason" min-width="220" />
            <el-table-column label="When" min-width="160">
              <template #default="scope">{{ scope.row.create_time }}</template>
            </el-table-column>
          </el-table>
          <div v-else class="fin-empty">Nothing added after the debt was recorded.</div>
        </section>

        <section class="fin-block">
          <div class="fin-card-head">
            <h3>Ledger movements</h3>
          </div>
          <el-table v-if="detail?.transactions?.length" :data="detail.transactions" size="small" style="width: 100%">
            <el-table-column label="Date" min-width="110">
              <template #default="scope">{{ scope.row.txn_date || '—' }}</template>
            </el-table-column>
            <el-table-column prop="description" label="Description" min-width="240" />
            <el-table-column label="Amount" min-width="130" align="right">
              <template #default="scope">{{ money(scope.row.amount_cents) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="Status" min-width="90" />
          </el-table>
          <div v-else class="fin-empty">No movements recorded.</div>
        </section>
      </div>
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
  financeAccounts, financeDebt, financeDebtCharge, financeDebtCreate, financeDebtPay, financeDebts,
} from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'
import { statusLabel } from '@/utils/finance-labels.js'

const loading = ref(false)
const debts = ref([])
const accounts = ref([])

const debtDialog = ref(false)
const saving = ref(false)
const payDialog = ref(false)
const paying = ref(false)
const chargeDialog = ref(false)
const charging = ref(false)
const detailDialog = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const payTarget = ref(null)
const chargeTarget = ref(null)

const form = reactive(blankDebt())
const payForm = reactive({ amount: 0, account_id: null, fee: 0, method: '', reference: '', paid_at: '', notes: '' })
const chargeForm = reactive({ amount: 0, reason: '' })

function blankDebt() {
  return { name: '', creditor: '', amount: 0, due_date: '', priority: 'normal', category: '', notes: '' }
}

const money = (cents) => formatCents(cents)
const canEditRelations = computed(() => hasPerm('finance.debts:create') || hasPerm('finance:edit'))
const signed = (cents) => `${Number(cents) > 0 ? '+' : ''}${formatCents(cents)}`

const sumOutstanding = computed(() => debts.value
  .filter(row => !['cancelled', 'paid'].includes(row.status))
  .reduce((sum, row) => sum + (Number(row.outstanding_cents) || 0), 0))
const sumOverdue = computed(() => debts.value
  .filter(row => row.overdue && !['cancelled'].includes(row.status))
  .reduce((sum, row) => sum + (Number(row.outstanding_cents) || 0), 0))
const overdueCount = computed(() => debts.value.filter(row => row.overdue).length)
const sumPaid = computed(() => debts.value.reduce((sum, row) => sum + (Number(row.paid_cents) || 0), 0))
const sumOriginal = computed(() => debts.value
  .filter(row => row.status !== 'cancelled')
  .reduce((sum, row) => sum + (Number(row.original_cents) || 0), 0))

async function load() {
  loading.value = true
  try {
    const [list, accountList] = await Promise.all([financeDebts(), financeAccounts()])
    debts.value = list.list || []
    accounts.value = (accountList.list || []).filter(row => row.status === 'active')
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load debts.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function openDebt() {
  Object.assign(form, blankDebt())
  debtDialog.value = true
}

async function saveDebt() {
  if (!form.name.trim()) {
    ElMessage({ message: 'Give the debt a name.', type: 'warning', plain: true })
    return
  }
  if (!form.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    await financeDebtCreate({
      name: form.name,
      creditor: form.creditor,
      amount_cents: toCents(form.amount),
      due_date: form.due_date || undefined,
      priority: form.priority,
      category: form.category,
      notes: form.notes,
    })
    debtDialog.value = false
    await load()
    ElMessage({ message: 'Debt recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not record the debt.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function openPay(row) {
  payTarget.value = row
  Object.assign(payForm, {
    amount: 0,
    account_id: accounts.value[0]?.id ?? null,
    fee: 0,
    method: '',
    reference: '',
    paid_at: new Date().toISOString().slice(0, 10),
    notes: '',
  })
  payDialog.value = true
}

async function savePay() {
  if (!payForm.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  if (!payForm.account_id) {
    ElMessage({ message: 'Choose the account this was paid from.', type: 'warning', plain: true })
    return
  }
  paying.value = true
  try {
    await financeDebtPay(payTarget.value.id, {
      amount_cents: toCents(payForm.amount),
      fee_cents: toCents(payForm.fee),
      account_id: payForm.account_id,
      method: payForm.method,
      reference: payForm.reference,
      paid_at: payForm.paid_at || undefined,
      notes: payForm.notes,
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

function openCharge(row) {
  chargeTarget.value = row
  Object.assign(chargeForm, { amount: 0, reason: '' })
  chargeDialog.value = true
}

async function saveCharge() {
  if (!chargeForm.amount) {
    ElMessage({ message: 'Enter a non-zero amount.', type: 'warning', plain: true })
    return
  }
  if (!chargeForm.reason.trim()) {
    ElMessage({ message: 'A reason is required for a charge.', type: 'warning', plain: true })
    return
  }
  charging.value = true
  try {
    await financeDebtCharge(chargeTarget.value.id, {
      amount_cents: toCents(chargeForm.amount),
      reason: chargeForm.reason,
    })
    chargeDialog.value = false
    await load()
    ElMessage({ message: 'Charge added.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not add the charge.', type: 'error', plain: true })
  } finally {
    charging.value = false
  }
}

async function openDetail(row) {
  detailDialog.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await financeDebt(row.id)
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the debt.', type: 'error', plain: true })
  } finally {
    detailLoading.value = false
  }
}

onMounted(load)
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
  font-variant-numeric: tabular-nums;
}

.fin-status {
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.fin-status.is-open,
.fin-status.is-partial {
  color: var(--hq-warning, #d98a1c);
}

.fin-status.is-overdue {
  color: var(--hq-danger, #e5484d);
}

.fin-status.is-paid {
  color: var(--hq-success, #2f9e6f);
}

.fin-status.is-cancelled,
.fin-status.is-disputed {
  color: var(--hq-muted);
}

.fin-empty {
  padding: 24px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
}

.fin-hint {
  display: block;
  color: var(--hq-muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.fin-hint-block {
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--hq-hover);
}

.fin-detail {
  display: grid;
  gap: 14px;
}

.fin-block {
  padding-top: 4px;
}

.fin-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.fin-card-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--hq-text-secondary);
}
</style>