<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Where the money sits</div>
        <h2>Accounts &amp; funds</h2>
      </div>
      <div class="fin-head-actions">
        <el-button v-perm="'finance.accounts:manage'" size="small" type="primary" icon="plus" @click="openAccount()">
          New account
        </el-button>
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <div v-loading="loading" class="fin-body">
      <div class="fin-stats">
        <StatCard label="Total balance" :value="money(totalBalance)" :hint="`${accounts.length} account${accounts.length === 1 ? '' : 's'}`" />
        <StatCard
          label="Overdrawn"
          :value="String(overdrawn.length)"
          :tone="overdrawn.length ? 'negative' : 'default'"
          hint="Balances below zero"
        />
        <StatCard
          label="Restricted"
          :value="String(restricted.length)"
          :tone="restricted.length ? 'warning' : 'default'"
          hint="Accounts with access limits"
        />
      </div>

      <section class="fin-card">
        <div class="fin-card-head">
          <h3>Accounts</h3>
          <span class="fin-card-note">Balances are derived from the ledger, never typed in</span>
        </div>

        <el-table v-if="accounts.length" :data="accounts" size="small" style="width: 100%">
          <el-table-column label="Account" min-width="200">
            <template #default="scope">
              <span class="fin-table-title">{{ scope.row.name }}</span>
              <span v-if="scope.row.confidential" class="fin-tag">Restricted</span>
            </template>
          </el-table-column>
          <el-table-column prop="account_type" label="Type" min-width="110" />
          <el-table-column label="Opened" min-width="110">
            <template #default="scope">{{ scope.row.opened_on || '—' }}</template>
          </el-table-column>
          <el-table-column label="Opening" min-width="130" align="right">
            <template #default="scope">{{ money(scope.row.opening_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column label="Balance" min-width="140" align="right">
            <template #default="scope">
              <span class="fin-amount" :class="{ 'fin-alert-text': scope.row.balance_cents < 0 }">
                {{ money(scope.row.balance_cents, scope.row.currency) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="Status" min-width="90">
            <template #default="scope">
              <span class="fin-status" :class="`is-${scope.row.status}`">{{ statusLabel(scope.row.status) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="Actions" min-width="180" fixed="right">
            <template #default="scope">
              <el-button text size="small" @click="openLedger(scope.row)">Ledger</el-button>
              <el-button v-perm="'finance.accounts:manage'" text size="small" @click="openAccount(scope.row)">Edit</el-button>
              <el-button
                v-perm="'finance.accounts:manage'"
                v-if="scope.row.status === 'active'"
                text
                size="small"
                type="danger"
                @click="archive(scope.row)"
              >Archive</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-else class="fin-empty">
          <p>No accounts yet. Add the account the company actually keeps its money in.</p>
          <el-button v-perm="'finance.accounts:manage'" type="primary" @click="openAccount()">Add an account</el-button>
        </div>
      </section>

      <section class="fin-card">
        <div class="fin-card-head">
          <h3>Funding</h3>
          <div class="fin-card-tools">
            <span class="fin-card-note">Grants, loans and equity, with what is committed against what arrived</span>
            <el-button
              v-perm="'finance.transactions:create'"
              size="small"
              icon="plus"
              @click="openFunding"
            >Record funding</el-button>
          </div>
        </div>

        <el-table v-if="funding.length" :data="funding" size="small" style="width: 100%">
          <el-table-column prop="name" label="Source" min-width="180" />
          <el-table-column label="Type" min-width="110">
            <template #default="scope">{{ scope.row.funding_type }}</template>
          </el-table-column>
          <el-table-column label="Committed" min-width="130" align="right">
            <template #default="scope">{{ money(scope.row.committed_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column label="Received" min-width="130" align="right">
            <template #default="scope">{{ money(scope.row.received_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column prop="account_name" label="Account" min-width="140">
            <template #default="scope">{{ scope.row.account_name || '—' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="Status" min-width="100" />
        </el-table>
        <div v-else class="fin-empty">No funding recorded.</div>
      </section>
    </div>

    <el-dialog v-model="accountDialog" :title="form.id ? 'Edit account' : 'New account'" width="520px">
      <el-form :model="form" label-width="130px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" maxlength="120" placeholder="e.g. Equity Bank KES" />
        </el-form-item>
        <el-form-item label="Type">
          <el-select v-model="form.account_type" style="width: 100%" filterable allow-create>
            <el-option v-for="type in accountTypes" :key="type" :label="accountTypeLabel(type)" :value="type" />
          </el-select>
        </el-form-item>
        <el-form-item label="Currency">
          <el-input v-model="form.currency" maxlength="8" placeholder="KES" />
        </el-form-item>
        <el-form-item :label="form.id ? 'Opening balance' : 'Opening balance'">
          <el-input-number
            v-model="form.opening"
            :precision="2"
            :step="100"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
          <div class="fin-hint">
            The opening balance is the start of this account's ledger. Changing it is recorded in the audit log.
          </div>
        </el-form-item>
        <el-form-item v-if="form.id" label="Change reason">
          <el-input
            v-model="form.opening_reason"
            maxlength="300"
            placeholder="Required only if the opening balance is changed"
          />
        </el-form-item>
        <el-form-item label="Opened on">
          <el-date-picker v-model="form.opened_on" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Custodian">
          <el-select
            v-model="form.owner_id"
            clearable
            filterable
            placeholder="Who holds or controls this money"
            style="width: 100%"
          >
            <el-option
              v-for="member in members"
              :key="member.user_id"
              :label="member.display_name || member.email || member.username"
              :value="member.user_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Source">
          <el-input v-model="form.source" maxlength="120" placeholder="Where this money came from" />
        </el-form-item>
        <el-form-item label="Restrictions">
          <el-input v-model="form.restrictions" type="textarea" :rows="2" maxlength="500" placeholder="What this money may be used for" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item label="Restricted access">
          <el-switch v-model="form.confidential" />
          <span class="fin-hint">Only granted members see a restricted account.</span>
        </el-form-item>
      </el-form>
      <LinkedRecords
        v-if="form.id"
        source-type="account"
        :source-id="form.id"
        :editable="canEditRelations"
        title="Linked records"
      />
      <template #footer>
        <el-button @click="accountDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveAccount">Save</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="fundingDialog" title="Record funding" width="520px">
      <el-form :model="fundingForm" label-width="130px">
        <el-form-item label="Source" required>
          <el-input v-model="fundingForm.name" maxlength="200" placeholder="e.g. XPass seed grant" />
        </el-form-item>
        <el-form-item label="From">
          <el-input v-model="fundingForm.source" maxlength="200" placeholder="Funder or lender" />
        </el-form-item>
        <el-form-item label="Type">
          <el-select v-model="fundingForm.funding_type" style="width: 100%">
            <el-option label="Grant" value="grant" />
            <el-option label="Loan" value="loan" />
            <el-option label="Equity" value="equity" />
            <el-option label="Other" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="Committed">
          <el-input-number v-model="fundingForm.committed" :precision="2" :min="0" :step="1000" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Received">
          <el-input-number v-model="fundingForm.received" :precision="2" :min="0" :step="1000" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Into account" required>
          <el-select v-model="fundingForm.account_id" placeholder="Choose the account" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="fundingForm.funding_type === 'loan'" label="Also record a debt">
          <el-switch v-model="fundingForm.create_debt" />
          <span class="fin-hint">A loan is money in and an obligation at once.</span>
        </el-form-item>
        <el-form-item label="Conditions">
          <el-input v-model="fundingForm.conditions" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fundingDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="savingFunding" @click="saveFunding">Record</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="ledgerDialog" :title="ledger.account?.name || 'Account ledger'" width="860px" top="6vh">
      <div v-loading="ledgerLoading" class="fin-ledger">
        <div class="fin-stats">
          <StatCard label="Opening" :value="money(ledger.opening_cents, ledger.account?.currency)" />
          <StatCard label="Money in" :value="money(ledger.moneyInCents, ledger.account?.currency)" tone="positive" />
          <StatCard label="Money out" :value="money(ledger.moneyOutCents, ledger.account?.currency)" tone="negative" />
          <StatCard
            label="Balance"
            :value="money(ledger.balance_cents, ledger.account?.currency)"
            :tone="Number(ledger.balance_cents) < 0 ? 'negative' : 'default'"
          />
        </div>

        <div v-if="utilization.by_category?.length" class="fin-split">
          <span class="fin-split-label">Where it went</span>
          <span v-for="row in utilization.by_category" :key="row.name" class="fin-split-item">
            {{ row.name }} · {{ money(row.amount_cents, ledger.account?.currency) }}
          </span>
        </div>

        <el-table v-if="ledger.list?.length" :data="ledger.list" size="small" style="width: 100%">
          <el-table-column label="Date" min-width="110">
            <template #default="scope">{{ scope.row.txn_date || '—' }}</template>
          </el-table-column>
          <el-table-column prop="description" label="Description" min-width="200">
            <template #default="scope">{{ scope.row.description || scope.row.type }}</template>
          </el-table-column>
          <el-table-column label="Category" min-width="120">
            <template #default="scope">{{ scope.row.category || '—' }}</template>
          </el-table-column>
          <el-table-column label="Movement" min-width="130" align="right">
            <template #default="scope">
              <span :class="scope.row.net_cents >= 0 ? 'fin-positive' : 'fin-alert-text'">
                {{ signed(scope.row.net_cents, ledger.account?.currency) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="Balance" min-width="130" align="right">
            <template #default="scope">{{ money(scope.row.balance_after_cents, ledger.account?.currency) }}</template>
          </el-table-column>
        </el-table>
        <div v-else class="fin-empty">No movements on this account yet.</div>
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
  financeAccountArchive, financeAccountCreate, financeAccountLedger, financeAccountUpdate,
  financeAccountUtilization, financeAccounts, financeFunding, financeFundingCreate, financeMembers,
  financeCategories,
} from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'
import { statusLabel, accountTypeLabel } from '@/utils/finance-labels.js'
import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()

const loading = ref(false)
const accounts = ref([])
const totalBalance = ref(0)
const funding = ref([])
const members = ref([])
const accountTypes = ref([])

const accountDialog = ref(false)
const saving = ref(false)
const fundingDialog = ref(false)
const savingFunding = ref(false)
const ledgerDialog = ref(false)
const ledgerLoading = ref(false)

const form = reactive(blankAccount())
const fundingForm = reactive(blankFunding())
const ledger = ref({ account: null, list: [], opening_cents: 0, balance_cents: 0, moneyInCents: 0, moneyOutCents: 0 })
const utilization = ref({ by_category: [] })

function blankAccount() {
  return {
    id: null, name: '', account_type: 'bank', currency: 'KES', opening: 0, opening_reason: '', opened_on: '',
    source: '', restrictions: '', description: '', confidential: false, owner_id: null,
  }
}

function blankFunding() {
  return {
    name: '', source: '', funding_type: 'grant', committed: 0, received: 0,
    account_id: null, create_debt: false, conditions: '',
  }
}

const overdrawn = computed(() => accounts.value.filter(row => Number(row.balance_cents) < 0))
const restricted = computed(() => accounts.value.filter(row => row.confidential))

const money = (cents, currency = 'KES') => formatCents(cents, currency)
const canEditRelations = computed(() => hasPerm('finance.accounts:manage') || hasPerm('finance:edit'))
const signed = (cents, currency = 'KES') => (Number(cents) > 0 ? `+${formatCents(cents, currency)}` : formatCents(cents, currency))

async function load() {
  loading.value = true
  try {
    const [list, funds, memberList, accountTypeList] = await Promise.all([
      financeAccounts(), financeFunding(), financeMembers().catch(() => ({ list: [] })),
      financeCategories('account_type').catch(() => []),
    ])
    accounts.value = list.list || []
    totalBalance.value = list.totalBalanceCents ?? 0
    funding.value = funds.list || []
    members.value = memberList.list || []
    // Config-driven types; fall back to the built-in codes if config is empty.
    const configured = (accountTypeList || []).map(row => row.name)
    accountTypes.value = configured.length ? configured : ['bank', 'cash', 'mobile', 'petty', 'other']
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load accounts.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function openAccount(row = null) {
  Object.assign(form, blankAccount())
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      account_type: row.account_type || 'bank',
      currency: row.currency || 'KES',
      opening: (Number(row.opening_cents) || 0) / 100,
      opening_reason: '',
      opened_on: row.opened_on || '',
      source: row.source || '',
      restrictions: row.restrictions || '',
      description: row.description || '',
      confidential: Boolean(row.confidential),
      owner_id: row.owner_id || null,
    })
  }
  accountDialog.value = true
}

async function saveAccount() {
  const name = form.name.trim()
  if (!name) {
    ElMessage({ message: 'Give the account a name.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    const payload = {
      name,
      account_type: form.account_type,
      currency: (form.currency || 'KES').toUpperCase(),
      opening_cents: toCents(form.opening, (form.currency || 'KES').toUpperCase()),
      opening_reason: form.opening_reason?.trim() || undefined,
      opened_on: form.opened_on || undefined,
      source: form.source,
      restrictions: form.restrictions,
      description: form.description,
      confidential: form.confidential,
      owner_id: form.owner_id || undefined,
    }
    const currentOpening = Number((accounts.value.find(row => row.id === form.id)?.opening_cents || 0) / 100)
    if (form.id && Number(form.opening) !== currentOpening && !payload.opening_reason) {
      ElMessage({ message: 'Explain why the opening balance is changing so the audit record stays useful.', type: 'warning', plain: true })
      return
    }
    if (form.id) {
      await financeAccountUpdate(form.id, payload)
    } else {
      await financeAccountCreate({ ...payload, opening_cents: toCents(form.opening, payload.currency) })
    }
    accountDialog.value = false
    await load()
    ElMessage({ message: 'Account saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save the account.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function archive(row) {
  if (!await confirm(`Archive "${row.name}"? Its history is kept, but no new money can be recorded against it.`)) return
  try {
    await financeAccountArchive(row.id)
    await load()
    ElMessage({ message: 'Account archived.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not archive the account.', type: 'error', plain: true })
  }
}

async function openLedger(row) {
  ledgerDialog.value = true
  ledgerLoading.value = true
  ledger.value = { account: row, list: [], opening_cents: 0, balance_cents: 0, moneyInCents: 0, moneyOutCents: 0 }
  utilization.value = { by_category: [] }
  try {
    const [detail, usage] = await Promise.all([
      financeAccountLedger(row.id, { page: 1, pageSize: 100 }),
      financeAccountUtilization(row.id),
    ])
    ledger.value = detail
    utilization.value = usage
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the ledger.', type: 'error', plain: true })
  } finally {
    ledgerLoading.value = false
  }
}

function openFunding() {
  Object.assign(fundingForm, blankFunding())
  fundingForm.account_id = accounts.value.find(row => row.status === 'active')?.id ?? null
  fundingDialog.value = true
}

async function saveFunding() {
  if (!fundingForm.name.trim()) {
    ElMessage({ message: 'Give this funding a name.', type: 'warning', plain: true })
    return
  }
  savingFunding.value = true
  try {
    await financeFundingCreate({
      name: fundingForm.name,
      source: fundingForm.source,
      funding_type: fundingForm.funding_type,
      committed_cents: toCents(fundingForm.committed),
      received_cents: toCents(fundingForm.received),
      account_id: fundingForm.account_id,
      create_debt: fundingForm.create_debt,
      conditions: fundingForm.conditions,
    })
    fundingDialog.value = false
    await load()
    ElMessage({ message: 'Funding recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not record the funding.', type: 'error', plain: true })
  } finally {
    savingFunding.value = false
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
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
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
  align-items: baseline;
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

.fin-card-tools {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.fin-empty {
  padding: 18px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
}

.fin-table-title {
  font-weight: 550;
}

.fin-amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fin-positive {
  color: var(--hq-success, #2f9e6f);
  font-weight: 600;
}

.fin-alert-text {
  color: var(--hq-danger, #e5484d);
  font-weight: 600;
}

.fin-tag {
  margin-left: 8px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.fin-status {
  font-size: 11.5px;
  font-weight: 600;
  text-transform: capitalize;
}

.fin-status.is-active {
  color: var(--hq-success, #2f9e6f);
}

.fin-status.is-archived {
  color: var(--hq-muted);
}

.fin-hint {
  color: var(--hq-muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.fin-ledger {
  display: grid;
  gap: 14px;
}

.fin-split {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--hq-hover);
}

.fin-split-label {
  color: var(--hq-muted);
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.fin-split-item {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
</style>
