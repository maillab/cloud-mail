<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Money owed to people</div>
        <h2>Payments</h2>
      </div>
      <div class="fin-head-actions">
        <el-button v-perm="'finance.transactions:create'" size="small" @click="openAdvance">Issue advance</el-button>
        <el-button v-perm="'finance.transactions:create'" size="small" type="primary" icon="plus" @click="openClaim">
          Submit expense
        </el-button>
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <div v-loading="loading" class="fin-body">
      <div class="fin-stats">
        <StatCard
          label="Awaiting review"
          :value="money(pendingCents)"
          :hint="`${pendingCount} claim${pendingCount === 1 ? '' : 's'}`"
        />
        <StatCard
          label="Approved, not paid"
          :value="money(approvedCents)"
          :tone="approvedCents > 0 ? 'warning' : 'default'"
          hint="Ready to reimburse"
        />
        <StatCard label="Paid out" :value="money(paidCents)" tone="positive" hint="Claims settled" />
        <StatCard
          label="Advances out"
          :value="money(advancesCents)"
          :tone="advancesCents > 0 ? 'warning' : 'default'"
          hint="Cash already with the team"
        />
      </div>

      <section class="fin-card">
        <div class="fin-card-head">
          <h3>Reimbursements</h3>
          <el-select v-model="claimStatus" size="small" style="width: 170px" @change="loadClaims">
            <el-option label="All statuses" value="" />
            <el-option v-for="status in CLAIM_STATUSES" :key="status" :label="status" :value="status" />
          </el-select>
        </div>

        <el-table v-if="claims.length" :data="claims" size="small" style="width: 100%">
          <el-table-column label="Claim" min-width="220">
            <template #default="scope">
              <div class="fin-cell-main">
                <span class="fin-table-title">{{ scope.row.reason }}</span>
                <span class="fin-cell-meta">
                  {{ scope.row.member_name || 'Unknown member' }}
                  <template v-if="scope.row.notes"> · {{ scope.row.notes }}</template>
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="Amount" min-width="130" align="right">
            <template #default="scope">{{ money(scope.row.amount_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column label="Status" min-width="110">
            <template #default="scope">
              <span class="fin-status" :class="`is-${scope.row.status}`">{{ statusLabel(scope.row.status) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Submitted" min-width="120">
            <template #default="scope">{{ String(scope.row.create_time || '').slice(0, 10) || '—' }}</template>
          </el-table-column>
          <el-table-column label="Actions" min-width="200" fixed="right">
            <template #default="scope">
              <el-button
                v-perm="['finance.budgets:manage', 'finance:approve']"
                v-if="scope.row.status === 'submitted'"
                text
                size="small"
                @click="review(scope.row, 'reviewed')"
              >Review</el-button>
              <el-button
                v-perm="['finance.budgets:manage', 'finance:approve']"
                v-if="scope.row.status === 'submitted' || scope.row.status === 'reviewed'"
                text
                size="small"
                type="success"
                @click="review(scope.row, 'approved')"
              >Approve</el-button>
              <el-button
                v-perm="['finance.budgets:manage', 'finance:approve']"
                v-if="scope.row.status === 'submitted' || scope.row.status === 'reviewed'"
                text
                size="small"
                type="danger"
                @click="review(scope.row, 'declined')"
              >Decline</el-button>
              <el-button
                v-perm="'finance.transactions:create'"
                v-if="scope.row.status === 'approved'"
                text
                size="small"
                type="primary"
                @click="openPayClaim(scope.row)"
              >Pay</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="fin-empty">No expense claims.</div>
      </section>

      <section class="fin-card">
        <div class="fin-card-head">
          <h3>Advances</h3>
          <span class="fin-card-note">Cash issued before the spend happens</span>
        </div>
        <el-table v-if="advances.length" :data="advances" size="small" style="width: 100%">
          <el-table-column prop="purpose" label="Purpose" min-width="220" />
          <el-table-column label="Issued" min-width="130" align="right">
            <template #default="scope">{{ money(scope.row.amount_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column label="Spent" min-width="120" align="right">
            <template #default="scope">{{ money(scope.row.spent_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column label="Returned" min-width="120" align="right">
            <template #default="scope">{{ money(scope.row.returned_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column label="Member" min-width="150">
            <template #default="scope">{{ scope.row.member_name || '—' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="Status" min-width="100" />
          <el-table-column prop="issued_on" label="Issued on" min-width="110" />
          <el-table-column label="Actions" min-width="110" fixed="right">
            <template #default="scope">
              <el-button
                v-perm="'finance.transactions:create'"
                v-if="scope.row.status === 'issued'"
                text
                size="small"
                type="primary"
                @click="openSettle(scope.row)"
              >Settle</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="fin-empty">No advances issued.</div>
      </section>
    </div>

    <el-dialog v-model="claimDialog" title="Submit an expense claim" width="500px">
      <el-form :model="claimForm" label-width="120px">
        <el-form-item label="What was it for" required>
          <el-input v-model="claimForm.reason" maxlength="300" placeholder="e.g. Client lunch in Nakuru" />
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="claimForm.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="claimForm.notes" type="textarea" :rows="3" maxlength="1000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="claimDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="savingClaim" @click="saveClaim">Submit</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="payClaimDialog" :title="`Pay ${payClaim?.member_name || 'claim'}`" width="480px">
      <el-form :model="payClaimForm" label-width="110px">
        <el-form-item label="Amount">
          <span class="fin-amount">{{ money(payClaim?.amount_cents, payClaim?.currency) }}</span>
        </el-form-item>
        <el-form-item label="From account" required>
          <el-select v-model="payClaimForm.account_id" placeholder="Choose the account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Method">
          <el-input v-model="payClaimForm.method" maxlength="60" placeholder="M-Pesa, bank transfer…" />
        </el-form-item>
        <el-form-item label="Reference">
          <el-input v-model="payClaimForm.reference" maxlength="120" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="payClaimDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="payingClaim" @click="savePayClaim">Pay</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="advanceDialog" title="Issue an advance" width="500px">
      <el-form :model="advanceForm" label-width="120px">
        <el-form-item label="Purpose" required>
          <el-input v-model="advanceForm.purpose" maxlength="300" placeholder="e.g. Travel to Kisumu" />
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="advanceForm.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="From account" required>
          <el-select v-model="advanceForm.account_id" placeholder="Choose the account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Issued on">
          <el-date-picker v-model="advanceForm.issued_on" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="advanceForm.notes" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="advanceDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="savingAdvance" @click="saveAdvance">Issue</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="settleDialog" :title="`Settle ${settleAdvance?.purpose || 'advance'}`" width="520px">
      <el-form :model="settleForm" label-width="120px">
        <el-form-item label="Issued">
          <span class="fin-amount">{{ money(settleAdvance?.amount_cents, settleAdvance?.currency) }}</span>
        </el-form-item>
        <el-form-item label="Spent" required>
          <el-input-number
            v-model="settleForm.spent"
            :precision="2"
            :min="0"
            :max="settleAmount"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="Returned" required>
          <el-input-number
            v-model="settleForm.returned"
            :precision="2"
            :min="0"
            :max="settleAmount"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item>
          <span :class="['fin-split', settleRemaining === 0 ? 'is-ok' : 'is-off']">
            {{ settleRemaining === 0 ? 'Split adds up.' : `${money(settleRemaining)} left to account for` }}
          </span>
        </el-form-item>
        <el-form-item label="Returned to">
          <el-select v-model="settleForm.account_id" placeholder="Choose the account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Method">
          <el-input v-model="settleForm.method" maxlength="60" placeholder="M-Pesa, bank transfer…" />
        </el-form-item>
        <el-form-item label="Reference">
          <el-input v-model="settleForm.reference" maxlength="120" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settleDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="savingSettle" @click="saveSettle">Settle</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import StatCard from './StatCard.vue'
import {
  financeAccounts, financeAdvanceCreate, financeAdvances, financeAdvanceSettle, financeReimbursementCreate,
  financeReimbursementPay, financeReimbursementReview, financeReimbursements,
} from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'
import { statusLabel } from '@/utils/finance-labels.js'

const CLAIM_STATUSES = ['submitted', 'reviewed', 'approved', 'paid', 'declined']

const loading = ref(false)
const claims = ref([])
const advances = ref([])
const accounts = ref([])
const claimStatus = ref('')

const claimDialog = ref(false)
const savingClaim = ref(false)
const payClaimDialog = ref(false)
const payingClaim = ref(false)
const advanceDialog = ref(false)
const savingAdvance = ref(false)
const payClaim = ref(null)
const settleDialog = ref(false)
const savingSettle = ref(false)
const settleAdvance = ref(null)

const claimForm = reactive({ reason: '', amount: 0, notes: '' })
const payClaimForm = reactive({ account_id: null, method: '', reference: '' })
const advanceForm = reactive({ purpose: '', amount: 0, account_id: null, issued_on: '', notes: '' })
const settleForm = reactive({ spent: 0, returned: 0, account_id: null, method: '', reference: '' })

const money = (cents, currency = 'KES') => formatCents(cents, currency)

const pending = computed(() => claims.value.filter(row => row.status === 'submitted'))
const approved = computed(() => claims.value.filter(row => row.status === 'approved'))
const paid = computed(() => claims.value.filter(row => row.status === 'paid'))

const pendingCents = computed(() => pending.value.reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0))
const approvedCents = computed(() => approved.value.reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0))
const paidCents = computed(() => paid.value.reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0))
const advancesCents = computed(() => advances.value
  .filter(row => row.status === 'issued')
  .reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0))
const pendingCount = computed(() => pending.value.length)

// Settling splits the issued amount into what was spent and what came back.
// The two have to add up, so the dialog shows what is still unaccounted for
// rather than letting the server reject it silently.
const settleAmount = computed(() => toCents(settleAdvance.value?.amount_cents ?? 0))
const settleRemaining = computed(() => settleAmount.value - toCents(settleForm.spent) - toCents(settleForm.returned))

async function loadClaims() {
  try {
    const result = await financeReimbursements(claimStatus.value ? { status: claimStatus.value } : {})
    claims.value = result.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load claims.', type: 'error', plain: true })
  }
}

async function load() {
  loading.value = true
  try {
    const [claimList, advanceList, accountList] = await Promise.all([
      financeReimbursements(claimStatus.value ? { status: claimStatus.value } : {}),
      financeAdvances(),
      financeAccounts(),
    ])
    claims.value = claimList.list || []
    advances.value = advanceList.list || []
    accounts.value = (accountList.list || []).filter(row => row.status === 'active')
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load payments.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function openClaim() {
  Object.assign(claimForm, { reason: '', amount: 0, notes: '' })
  claimDialog.value = true
}

async function saveClaim() {
  if (!claimForm.reason.trim()) {
    ElMessage({ message: 'Say what the expense was for.', type: 'warning', plain: true })
    return
  }
  if (!claimForm.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  savingClaim.value = true
  try {
    await financeReimbursementCreate({
      reason: claimForm.reason,
      amount_cents: toCents(claimForm.amount),
      notes: claimForm.notes,
    })
    claimDialog.value = false
    await load()
    ElMessage({ message: 'Claim submitted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not submit the claim.', type: 'error', plain: true })
  } finally {
    savingClaim.value = false
  }
}

async function review(row, status) {
  try {
    await financeReimbursementReview(row.id, { status })
    await load()
    ElMessage({ message: `Claim ${status}.`, type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not update the claim.', type: 'error', plain: true })
  }
}

function openPayClaim(row) {
  payClaim.value = row
  Object.assign(payClaimForm, { account_id: accounts.value[0]?.id ?? null, method: '', reference: '' })
  payClaimDialog.value = true
}

async function savePayClaim() {
  if (!payClaimForm.account_id) {
    ElMessage({ message: 'Choose the account this is paid from.', type: 'warning', plain: true })
    return
  }
  payingClaim.value = true
  try {
    await financeReimbursementPay(payClaim.value.id, {
      account_id: payClaimForm.account_id,
      method: payClaimForm.method,
      reference: payClaimForm.reference,
    })
    payClaimDialog.value = false
    await load()
    ElMessage({ message: 'Claim paid.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not pay the claim.', type: 'error', plain: true })
  } finally {
    payingClaim.value = false
  }
}

function openAdvance() {
  Object.assign(advanceForm, {
    purpose: '', amount: 0, account_id: accounts.value[0]?.id ?? null,
    issued_on: new Date().toISOString().slice(0, 10), notes: '',
  })
  advanceDialog.value = true
}

async function saveAdvance() {
  if (!advanceForm.purpose.trim()) {
    ElMessage({ message: 'Say what the advance is for.', type: 'warning', plain: true })
    return
  }
  if (!advanceForm.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  if (!advanceForm.account_id) {
    ElMessage({ message: 'Choose the account this is issued from.', type: 'warning', plain: true })
    return
  }
  savingAdvance.value = true
  try {
    await financeAdvanceCreate({
      purpose: advanceForm.purpose,
      amount_cents: toCents(advanceForm.amount),
      account_id: advanceForm.account_id,
      issued_on: advanceForm.issued_on || undefined,
      notes: advanceForm.notes,
    })
    advanceDialog.value = false
    await load()
    ElMessage({ message: 'Advance issued.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not issue the advance.', type: 'error', plain: true })
  } finally {
    savingAdvance.value = false
  }
}

function openSettle(row) {
  settleAdvance.value = row
  // Most advances are spent in full, so that is the honest default; the person
  // settling only edits what actually came back.
  Object.assign(settleForm, {
    spent: (Number(row.amount_cents) || 0) / 100,
    returned: 0,
    account_id: row.account_id ?? accounts.value[0]?.id ?? null,
    method: '',
    reference: '',
  })
  settleDialog.value = true
}

async function saveSettle() {
  if (settleRemaining.value !== 0) {
    ElMessage({
      message: `Spent plus returned must equal ${money(settleAmount.value)}.`,
      type: 'warning',
      plain: true,
    })
    return
  }
  if (!settleForm.account_id) {
    ElMessage({ message: 'Choose the account this is returned to.', type: 'warning', plain: true })
    return
  }
  savingSettle.value = true
  try {
    await financeAdvanceSettle(settleAdvance.value.id, {
      spent_cents: toCents(settleForm.spent),
      returned_cents: toCents(settleForm.returned),
      account_id: settleForm.account_id,
      method: settleForm.method,
      reference: settleForm.reference,
    })
    settleDialog.value = false
    await load()
    ElMessage({ message: 'Advance settled.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not settle the advance.', type: 'error', plain: true })
  } finally {
    savingSettle.value = false
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

.fin-status {
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
}

.fin-status.is-approved,
.fin-status.is-paid {
  color: var(--hq-success, #2f9e6f);
}

.fin-status.is-submitted,
.fin-status.is-reviewed {
  color: var(--hq-warning, #d98a1c);
}

.fin-status.is-declined {
  color: var(--hq-muted);
}

.fin-status.is-issued {
  color: var(--hq-warning, #d98a1c);
}

.fin-status.is-settled {
  color: var(--hq-success, #2f9e6f);
}

.fin-split {
  font-size: 12px;
  font-weight: 600;
}

.fin-split.is-ok {
  color: var(--hq-success, #2f9e6f);
}

.fin-split.is-off {
  color: var(--hq-warning, #d98a1c);
}

.fin-empty {
  padding: 24px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
}
</style>
