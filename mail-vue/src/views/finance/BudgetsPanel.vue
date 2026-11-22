<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Allocated, spent, still free</div>
        <h2>Budgets</h2>
      </div>
      <div class="fin-head-actions">
        <el-button v-perm="'finance.budgets:create'" size="small" type="primary" icon="plus" @click="openBudget()">
          New budget
        </el-button>
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <div v-loading="loading" class="fin-body">
      <div class="fin-stats">
        <StatCard label="Allocated" :value="money(sumAllocated)" :hint="`${budgets.length} budget${budgets.length === 1 ? '' : 's'}`" />
        <StatCard label="Spent" :value="money(sumSpent)" tone="negative" hint="Posted transactions" />
        <StatCard label="Committed" :value="money(sumCommitted)" tone="warning" hint="Approved but not yet paid" />
        <StatCard
          label="Still available"
          :value="money(sumAvailable)"
          :tone="sumAvailable < 0 ? 'negative' : 'positive'"
          hint="Allocated less spent and committed"
        />
      </div>

      <div v-if="overBudget.length" class="fin-alert">
        <strong>{{ overBudget.length }} budget{{ overBudget.length === 1 ? ' is' : 's are' }} over allocation</strong>
        <span v-for="budget in overBudget" :key="budget.id" class="fin-alert-item">
          {{ budget.name }} · {{ money(Math.abs(budget.variance_cents)) }} over
        </span>
      </div>

      <div v-if="!budgets.length && !loading" class="fin-card">
        <div class="fin-empty">
          <p>No budgets yet. A budget is what makes "can we afford this?" answerable before the money is spent.</p>
          <el-button v-perm="'finance.budgets:create'" type="primary" @click="openBudget()">Create the first budget</el-button>
        </div>
      </div>

      <section v-for="budget in budgets" :key="budget.id" class="fin-card fin-budget">
        <div class="fin-budget-head">
          <div class="fin-budget-title">
            <span class="fin-table-title">{{ budget.name }}</span>
            <span class="fin-tag">{{ budget.period || 'No period' }}</span>
            <span v-if="budget.owner" class="fin-card-note">Owner: {{ budget.owner.display_name || budget.owner.username }}</span>
          </div>
          <div class="fin-budget-actions">
            <el-button text size="small" @click="openDetail(budget)">Open</el-button>
            <el-button
              v-perm="'finance.budgets:create'"
              text
              size="small"
              @click="openCommitment(budget)"
            >Commit spend</el-button>
            <el-button
              v-perm="'finance.budgets:manage'"
              text
              size="small"
              @click="openBudget(budget)"
            >Edit</el-button>
          </div>
        </div>

        <div class="fin-budget-bar" :class="{ 'is-over': budget.over_budget }">
          <span class="fin-budget-fill" :style="{ width: `${barWidth(budget)}%` }" />
        </div>

        <div class="fin-budget-nums">
          <div><span class="fin-num-label">Allocated</span>{{ money(budget.allocated_cents) }}</div>
          <div><span class="fin-num-label">Spent</span>{{ money(budget.spent_cents) }}</div>
          <div><span class="fin-num-label">Committed</span>{{ money(budget.committed_cents) }}</div>
          <div :class="{ 'fin-alert-text': budget.available_cents < 0 }">
            <span class="fin-num-label">Available</span>{{ money(budget.available_cents) }}
          </div>
          <div :class="{ 'fin-alert-text': budget.over_budget }">
            <span class="fin-num-label">Variance</span>{{ money(budget.variance_cents) }}
          </div>
          <div>
            <span class="fin-num-label">Used</span>{{ Math.round(budget.used_percent) }}%
          </div>
        </div>

        <div v-if="budget.over_budget" class="fin-budget-flag is-danger">Over allocation by {{ money(Math.abs(budget.variance_cents)) }}</div>
        <div v-else-if="budget.near_threshold" class="fin-budget-flag is-warning">
          {{ money(budget.available_cents) }} left before this budget is exhausted
        </div>
      </section>
    </div>

    <el-dialog v-model="budgetDialog" :title="form.id ? 'Edit budget' : 'New budget'" width="540px">
      <el-form :model="form" label-width="130px">
        <el-form-item label="Name" required>
          <el-input v-model="form.name" maxlength="200" placeholder="e.g. Launch marketing" />
        </el-form-item>
        <el-form-item label="Allocated" required>
          <el-input-number v-model="form.amount" :precision="2" :min="0" :step="1000" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Period">
          <el-input v-model="form.period" maxlength="40" placeholder="e.g. Q1 2026, Launch, Ongoing" />
        </el-form-item>
        <el-form-item label="Account">
          <el-select v-model="form.account_id" clearable placeholder="Which account funds it" style="width: 100%">
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="Owner">
          <el-select
            v-model="form.owner_id"
            clearable
            filterable
            placeholder="Who is accountable for this budget"
            style="width: 100%"
          >
            <el-option
              v-for="member in members"
              :key="member.user_id"
              :label="member.display_name || member.email || member.username"
              :value="member.user_id"
            />
          </el-select>
          <span class="fin-hint">The owner sees this budget and its spend, not the rest of finance.</span>
        </el-form-item>
        <el-form-item label="Alert at">
          <el-input-number v-model="form.warning_threshold" :min="1" :max="100" :step="5" controls-position="right" style="width: 130px" />
          <span class="fin-hint">% of allocation used</span>
        </el-form-item>
        <el-form-item label="Start date">
          <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="End date">
          <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" />
        </el-form-item>
      </el-form>
      <LinkedRecords
        v-if="form.id"
        source-type="budget"
        :source-id="form.id"
        :editable="canEditRelations"
      />
      <template #footer>
        <el-button @click="budgetDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveBudget">Save</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="commitmentDialog" :title="`Commit spend · ${commitmentBudget?.name || ''}`" width="520px">
      <el-form :model="commitment" label-width="120px">
        <el-form-item label="Description" required>
          <el-input v-model="commitment.description" maxlength="300" placeholder="What this money is reserved for" />
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="commitment.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Counterparty">
          <el-input v-model="commitment.counterparty" maxlength="200" placeholder="Supplier or person" />
        </el-form-item>
        <el-form-item label="Due date">
          <el-date-picker v-model="commitment.due_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Status">
          <el-select v-model="commitment.status" style="width: 100%">
            <el-option label="Planned" value="planned" />
            <el-option label="Approved" value="approved" />
          </el-select>
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="commitment.notes" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <div class="fin-hint fin-hint-block">
        A commitment reserves budget without moving money. Paying it later records a normal expense against this budget.
      </div>
      <template #footer>
        <el-button @click="commitmentDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="savingCommitment" @click="saveCommitment">Commit</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialog" :title="detail?.name || 'Budget'" width="820px" top="6vh">
      <div v-loading="detailLoading" class="fin-detail">
        <div class="fin-stats">
          <StatCard label="Allocated" :value="money(detail?.allocated_cents)" />
          <StatCard label="Spent" :value="money(detail?.spent_cents)" tone="negative" />
          <StatCard label="Committed" :value="money(detail?.committed_cents)" tone="warning" />
          <StatCard
            label="Available"
            :value="money(detail?.available_cents)"
            :tone="Number(detail?.available_cents) < 0 ? 'negative' : 'positive'"
          />
        </div>

        <section class="fin-block">
          <div class="fin-card-head">
            <h3>Committed spend</h3>
            <el-button v-perm="'finance.budgets:create'" text size="small" @click="openCommitment(detail)">Add</el-button>
          </div>
          <el-table v-if="detail?.commitments?.length" :data="detail.commitments" size="small" style="width: 100%">
            <el-table-column prop="description" label="Description" min-width="200" />
            <el-table-column prop="counterparty" label="Counterparty" min-width="140" />
            <el-table-column label="Amount" min-width="120" align="right">
              <template #default="scope">{{ money(scope.row.amount_cents) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="Status" min-width="100" />
            <el-table-column prop="due_date" label="Due" min-width="110" />
          </el-table>
          <div v-else class="fin-empty">Nothing committed against this budget.</div>
        </section>

        <section class="fin-block">
          <div class="fin-card-head">
            <h3>Spend charged to this budget</h3>
          </div>
          <el-table v-if="detail?.transactions?.length" :data="detail.transactions" size="small" style="width: 100%">
            <el-table-column label="Date" min-width="110">
              <template #default="scope">{{ scope.row.txn_date || '—' }}</template>
            </el-table-column>
            <el-table-column prop="description" label="Description" min-width="220" />
            <el-table-column label="Amount" min-width="130" align="right">
              <template #default="scope">{{ money(scope.row.amount_cents) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="Status" min-width="90" />
          </el-table>
          <div v-else class="fin-empty">No spending recorded against this budget yet.</div>
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
  financeAccounts, financeBudget, financeBudgetCreate, financeBudgetUpdate,
  financeBudgets, financeCommitmentCreate, financeMembers,
} from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'

const loading = ref(false)
const budgets = ref([])
const accounts = ref([])
const members = ref([])

const budgetDialog = ref(false)
const saving = ref(false)
const commitmentDialog = ref(false)
const savingCommitment = ref(false)
const detailDialog = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const commitmentBudget = ref(null)

const form = reactive(blankBudget())
const commitment = reactive({ description: '', amount: 0, counterparty: '', due_date: '', status: 'approved', notes: '' })

function blankBudget() {
  return {
    id: null, name: '', amount: 0, period: '', account_id: null, owner_id: null, warning_threshold: 80,
    start_date: '', end_date: '', description: '', notes: '',
  }
}

const money = (cents) => formatCents(cents)
const canEditRelations = computed(() => hasPerm('finance.budgets:create') || hasPerm('finance:edit'))

const sumAllocated = computed(() => budgets.value.reduce((sum, row) => sum + (Number(row.allocated_cents) || 0), 0))
const sumSpent = computed(() => budgets.value.reduce((sum, row) => sum + (Number(row.spent_cents) || 0), 0))
const sumCommitted = computed(() => budgets.value.reduce((sum, row) => sum + (Number(row.committed_cents) || 0), 0))
const sumAvailable = computed(() => sumAllocated.value - sumSpent.value - sumCommitted.value)
const overBudget = computed(() => budgets.value.filter(row => row.over_budget))

function barWidth(budget) {
  const used = Number(budget.used_percent) || 0
  return Math.max(0, Math.min(100, used))
}

async function load() {
  loading.value = true
  try {
    const [list, accountList, memberList] = await Promise.all([
      financeBudgets(), financeAccounts(), financeMembers().catch(() => ({ list: [] })),
    ])
    budgets.value = list.list || []
    accounts.value = (accountList.list || []).filter(row => row.status === 'active')
    members.value = memberList.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load budgets.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function openBudget(row = null) {
  Object.assign(form, blankBudget())
  if (row) {
    Object.assign(form, {
      id: row.id,
      name: row.name,
      amount: (Number(row.allocated_cents) || 0) / 100,
      period: row.period || '',
      account_id: row.account_id || null,
      owner_id: row.owner_id || row.owner?.user_id || null,
      warning_threshold: Number(row.warning_threshold) || 80,
      start_date: row.start_date || '',
      end_date: row.end_date || '',
      description: row.description || '',
      notes: row.notes || '',
    })
  }
  budgetDialog.value = true
}

async function saveBudget() {
  if (!form.name.trim()) {
    ElMessage({ message: 'Give the budget a name.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    const payload = {
      name: form.name,
      allocated_cents: toCents(form.amount),
      period: form.period,
      account_id: form.account_id,
      owner_id: form.owner_id || undefined,
      warning_threshold: Number(form.warning_threshold) || 80,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      description: form.description,
      notes: form.notes,
    }
    if (form.id) await financeBudgetUpdate(form.id, payload)
    else await financeBudgetCreate(payload)
    budgetDialog.value = false
    await load()
    ElMessage({ message: 'Budget saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save the budget.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function openDetail(budget) {
  detailDialog.value = true
  detailLoading.value = true
  detail.value = budget
  try {
    detail.value = await financeBudget(budget.id)
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the budget.', type: 'error', plain: true })
  } finally {
    detailLoading.value = false
  }
}

function openCommitment(budget) {
  commitmentBudget.value = budget
  Object.assign(commitment, { description: '', amount: 0, counterparty: '', due_date: '', status: 'approved', notes: '' })
  commitmentDialog.value = true
}

async function saveCommitment() {
  const budget = commitmentBudget.value
  if (!budget?.id) return
  if (!commitment.description.trim()) {
    ElMessage({ message: 'Say what this money is reserved for.', type: 'warning', plain: true })
    return
  }
  if (!commitment.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  savingCommitment.value = true
  try {
    await financeCommitmentCreate({
      budget_id: budget.id,
      description: commitment.description,
      amount_cents: toCents(commitment.amount),
      counterparty: commitment.counterparty,
      due_date: commitment.due_date || undefined,
      status: commitment.status,
      notes: commitment.notes,
    })
    commitmentDialog.value = false
    await load()
    ElMessage({ message: 'Spend committed.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not commit the spend.', type: 'error', plain: true })
  } finally {
    savingCommitment.value = false
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
  gap: 12px;
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

.fin-budget {
  display: grid;
  gap: 10px;
}

.fin-budget-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.fin-budget-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.fin-table-title {
  font-weight: 600;
  font-size: 13px;
}

.fin-tag {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.fin-card-note {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.fin-budget-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.fin-budget-bar {
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--hq-hover);
}

.fin-budget-bar.is-over {
  background: color-mix(in srgb, var(--hq-danger, #e5484d) 20%, transparent);
}

.fin-budget-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--hq-accent, #3b82f6);
  transition: width .2s ease;
}

.fin-budget-bar.is-over .fin-budget-fill {
  background: var(--hq-danger, #e5484d);
}

.fin-budget-nums {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px 14px;
}

.fin-num-label {
  display: block;
  color: var(--hq-muted);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.fin-budget-flag {
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 550;
}

.fin-budget-flag.is-danger {
  background: color-mix(in srgb, var(--hq-danger, #e5484d) 12%, transparent);
  color: var(--hq-danger, #e5484d);
}

.fin-budget-flag.is-warning {
  background: color-mix(in srgb, var(--hq-warning, #d98a1c) 12%, transparent);
  color: var(--hq-warning, #d98a1c);
}

.fin-alert {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  padding: 10px 12px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--hq-danger, #e5484d) 12%, transparent);
  font-size: 12.5px;
}

.fin-alert-item {
  color: var(--hq-danger, #e5484d);
}

.fin-alert-text {
  color: var(--hq-danger, #e5484d);
  font-weight: 600;
}

.fin-empty {
  padding: 22px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
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