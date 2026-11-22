<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Cash position</div>
        <h2>Overview</h2>
      </div>
      <div class="fin-head-actions">
        <el-radio-group v-model="period" size="small" @change="load">
          <el-radio-button value="month">This month</el-radio-button>
          <el-radio-button value="quarter">This quarter</el-radio-button>
          <el-radio-button value="year">This year</el-radio-button>
        </el-radio-group>
        <el-button size="small" text circle icon="refresh" :title="'Refresh'" :aria-label="'Refresh'" @click="load" />
      </div>
    </header>

    <div v-loading="loading" class="fin-body">
      <!-- 1. ACCOUNTS -->
      <section class="fin-section">
        <div class="fin-section-head">
          <h3>Accounts</h3>
          <span class="fin-section-note">{{ view.accounts?.length || 0 }} account{{ (view.accounts?.length || 0) === 1 ? '' : 's' }} · available cash {{ money(view.totalBalanceCents) }}</span>
          <el-button text size="small" @click="emit('navigate', 'accounts')">Manage accounts</el-button>
        </div>
        <div class="fin-stats">
          <StatCard
            label="Available cash"
            :value="moneyShort(view.totalBalanceCents)"
            :hint="`${view.accounts?.length || 0} account${(view.accounts?.length || 0) === 1 ? '' : 's'} · ${money(view.totalBalanceCents)}`"
          />
          <StatCard label="Money in" :value="moneyShort(view.incomeCents)" tone="positive" :hint="periodLabel" />
          <StatCard label="Money out" :value="moneyShort(view.expenseCents)" tone="negative" :hint="periodLabel" />
          <StatCard
            label="Net"
            :value="signedShort(view.netCents)"
            :tone="toneOf(view.netCents)"
            :hint="view.transfersCents ? `${money(view.transfersCents)} moved between accounts` : 'No transfers'"
          />
        </div>
        <div v-if="view.negativeAccounts?.length" class="fin-alert is-danger">
          <strong>Overdrawn {{ view.negativeAccounts.length === 1 ? 'account' : 'accounts' }}</strong>
          <span v-for="account in view.negativeAccounts" :key="account.id" class="fin-alert-item">
            {{ account.name }} · {{ money(account.balance_cents) }}
          </span>
        </div>
        <ul v-if="view.accounts?.length" class="fin-list fin-list-inline">
          <li v-for="account in view.accounts" :key="account.id">
            <div class="fin-list-main">
              <span class="fin-list-title">{{ account.name }}</span>
              <span class="fin-list-meta">{{ account.currency || 'KES' }} · {{ account.status }}</span>
            </div>
            <span class="fin-amount" :class="{ 'fin-alert-text': account.balance_cents < 0 }">
              {{ money(account.balance_cents) }}
            </span>
          </li>
        </ul>
      </section>

      <!-- 2. SPENDING -->
      <section class="fin-section">
        <div class="fin-section-head">
          <h3>Spending</h3>
          <span class="fin-section-note">Where money went {{ periodLabel.toLowerCase() }}</span>
          <el-button text size="small" @click="emit('navigate', 'transactions')">All transactions</el-button>
        </div>
        <div class="fin-cols">
          <section class="fin-card">
            <div class="fin-card-head">
              <h3>What the company owes</h3>
              <el-button text size="small" @click="emit('navigate', 'debts')">Open debts</el-button>
            </div>
            <dl class="fin-rows">
              <div class="fin-row">
                <dt>Outstanding debt</dt>
                <dd>{{ money(view.outstandingDebtCents) }}</dd>
              </div>
              <div class="fin-row" :class="{ 'is-alert': view.overdueDebtCents > 0 }">
                <dt>Overdue</dt>
                <dd>{{ money(view.overdueDebtCents) }}</dd>
              </div>
              <div class="fin-row">
                <dt>Invoices owed to us</dt>
                <dd>{{ money(view.invoiceOutstandingCents) }}</dd>
              </div>
              <div class="fin-row" :class="{ 'is-alert': view.overdueInvoiceCents > 0 }">
                <dt>Overdue invoices</dt>
                <dd>{{ money(view.overdueInvoiceCents) }}</dd>
              </div>
              <div class="fin-row">
                <dt>Committed from budgets</dt>
                <dd>{{ money(view.committedCents) }}</dd>
              </div>
            </dl>
          </section>
          <section class="fin-card">
            <div class="fin-card-head">
              <h3>Spending by category</h3>
            </div>
            <div v-if="!categorySpending.length" class="fin-empty">No spending recorded {{ periodLabel.toLowerCase() }}.</div>
            <ul v-else class="fin-list">
              <li v-for="cat in categorySpending" :key="cat.category">
                <div class="fin-list-main">
                  <span class="fin-list-title">{{ cat.label }}</span>
                  <span class="fin-bar"><span class="fin-bar-fill" :style="{ width: cat.percent + '%' }" /></span>
                </div>
                <span class="fin-amount">{{ money(cat.amount_cents) }}</span>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <!-- 3. BUDGETS -->
      <section class="fin-section">
        <div class="fin-section-head">
          <h3>Budgets</h3>
          <span class="fin-section-note">{{ view.budgets?.length || 0 }} budget{{ (view.budgets?.length || 0) === 1 ? '' : 's' }}</span>
          <el-button text size="small" @click="emit('navigate', 'budgets')">Open budgets</el-button>
        </div>
        <section class="fin-card">
          <div class="fin-card-head">
            <h3>Budgets needing attention</h3>
          </div>
          <div v-if="!budgetAlerts.length" class="fin-empty">Every budget is within its allocation.</div>
          <ul v-else class="fin-list">
            <li v-for="budget in budgetAlerts" :key="budget.id">
              <div class="fin-list-main">
                <span class="fin-list-title">{{ budget.name }}</span>
                <span class="fin-list-meta">
                  {{ money(budget.spent_cents) }} of {{ money(budget.allocated_cents) }}
                  <template v-if="budget.over_budget"> · {{ money(Math.abs(budget.variance_cents)) }} over</template>
                </span>
              </div>
              <span class="fin-pill" :class="budget.over_budget ? 'is-danger' : 'is-warning'">
                {{ budget.over_budget ? 'Over budget' : `${Math.round(budget.used_percent)}%` }}
              </span>
            </li>
          </ul>
        </section>
      </section>

      <!-- 4. BILLS -->
      <section class="fin-section">
        <div class="fin-section-head">
          <h3>Bills</h3>
          <span class="fin-section-note">Subscriptions, debts and overdue invoices in date order</span>
          <el-button text size="small" @click="emit('navigate', 'subscriptions')">All subscriptions</el-button>
        </div>
        <section class="fin-card">
          <div v-if="!view.upcoming?.length" class="fin-empty">Nothing due in the next 30 days.</div>
          <el-table v-else :data="view.upcoming" size="small" style="width: 100%">
            <el-table-column label="What" min-width="220">
              <template #default="scope">
                <span class="fin-table-title">{{ scope.row.label }}</span>
                <span class="fin-tag">{{ kindLabel(scope.row.kind) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Amount" min-width="140" align="right">
              <template #default="scope">{{ money(scope.row.amount_cents) }}</template>
            </el-table-column>
            <el-table-column label="When" min-width="140">
              <template #default="scope">
                <span :class="{ 'fin-alert-text': scope.row.days < 0 }">{{ whenLabel(scope.row.days) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </section>

      <!-- 5. ACTIVITY -->
      <section class="fin-section">
        <div class="fin-section-head">
          <h3>Activity</h3>
          <span class="fin-section-note">Recent movements across your accounts</span>
          <el-button text size="small" @click="emit('navigate', 'transactions')">Full ledger</el-button>
        </div>
        <section class="fin-card">
          <div v-if="!recentActivity.length" class="fin-empty">No activity recorded yet.</div>
          <ul v-else class="fin-list">
            <li v-for="tx in recentActivity" :key="tx.id">
              <div class="fin-list-main">
                <span class="fin-list-title">{{ tx.description || tx.counterparty || 'Transaction' }}</span>
                <span class="fin-list-meta">{{ tx.date || tx.create_time }} · {{ tx.category_label || tx.kind }}</span>
              </div>
              <span class="fin-amount" :class="tx.direction === 'in' ? 'fin-positive' : 'fin-alert-text'">
                {{ tx.direction === 'in' ? '+' : '−' }}{{ money(Math.abs(tx.amount_cents)) }}
              </span>
            </li>
          </ul>
        </section>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import StatCard from './StatCard.vue'
import { financeOverview } from '@/request/finance.js'
import { formatCents, formatCentsShort, formatPercent } from '@/utils/money.js'

const emit = defineEmits(['navigate'])

const loading = ref(false)
const period = ref('month')
const view = ref(emptyView())

function emptyView() {
  return {
    accounts: [], totalBalanceCents: 0, incomeCents: 0, expenseCents: 0, feesCents: 0,
    transfersCents: 0, netCents: 0, outstandingDebtCents: 0, overdueDebtCents: 0,
    committedCents: 0, invoiceOutstandingCents: 0, overdueInvoiceCents: 0,
    budgets: [], overBudget: [], nearThreshold: [], upcoming: [], negativeAccounts: [],
  }
}

const periodLabel = computed(() => ({ month: 'This month', quarter: 'This quarter', year: 'This year' }[period.value]))

const budgetAlerts = computed(() => {
  const over = view.value.overBudget || []
  const near = view.value.nearThreshold || []
  return [...over, ...near].slice(0, 6)
})

// Spending by category for the current period. Falls back to an empty list if
// the overview does not include a category breakdown.
const categorySpending = computed(() => {
  const raw = view.value.categorySpending || view.value.spendingByCategory || []
  const total = raw.reduce((sum, c) => sum + Number(c.amount_cents || 0), 0) || 1
  return raw.slice(0, 6).map(c => ({
    category: c.category || c.label,
    label: c.label || c.category,
    amount_cents: Number(c.amount_cents || 0),
    percent: Math.round((Number(c.amount_cents || 0) / total) * 100),
  }))
})

// Recent ledger activity. The overview endpoint may include a recent list; if
// not, the Activity section shows an empty state rather than failing.
const recentActivity = computed(() => {
  const raw = view.value.recentActivity || view.value.recent || []
  return raw.slice(0, 6)
})

const money = (cents) => formatCents(cents)
const moneyShort = (cents) => formatCentsShort(cents)
const signed = (cents) => (Number(cents) > 0 ? `+${formatCents(cents)}` : formatCents(cents))
const signedShort = (cents) => (Number(cents) > 0 ? `+${formatCentsShort(cents)}` : formatCentsShort(cents))
const toneOf = (cents) => (Number(cents) > 0 ? 'positive' : Number(cents) < 0 ? 'negative' : 'default')

const KIND_LABELS = { subscription: 'Subscription', debt: 'Debt', invoice: 'Invoice' }
const kindLabel = (kind) => KIND_LABELS[kind] || kind

function whenLabel(days) {
  const value = Number(days)
  if (!Number.isFinite(value)) return '—'
  if (value < 0) return `${Math.abs(value)} day${Math.abs(value) === 1 ? '' : 's'} overdue`
  if (value === 0) return 'Today'
  if (value === 1) return 'Tomorrow'
  return `In ${value} days`
}

async function load() {
  loading.value = true
  try {
    view.value = { ...emptyView(), ...(await financeOverview({ period: period.value })) }
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the finance overview.', type: 'error', plain: true })
  } finally {
    loading.value = false
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
  gap: 20px;
  min-height: 220px;
}

.fin-section {
  display: grid;
  gap: 10px;
}

.fin-section-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.fin-section-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--hq-text);
}

.fin-section-note {
  flex: 1;
  min-width: 0;
  color: var(--hq-muted);
  font-size: 11.5px;
}

.fin-list-inline {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0 20px;
}

.fin-bar {
  display: block;
  flex: 1;
  min-width: 60px;
  height: 6px;
  border-radius: 3px;
  background: var(--hq-hover);
  overflow: hidden;
}

.fin-bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--hq-accent, #ff5500);
}

.fin-positive {
  color: var(--hq-success, #16a34a);
  font-weight: 600;
}

.fin-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 1100px) {
  .fin-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 560px) {
  .fin-stats { grid-template-columns: minmax(0, 1fr); }
}

.fin-cols {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
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

.fin-rows {
  display: grid;
  gap: 8px;
  margin: 0;
}

.fin-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.fin-row dt {
  color: var(--hq-text-secondary);
  font-size: 12.5px;
}

.fin-row dd {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fin-row.is-alert dd {
  color: var(--hq-danger, #e5484d);
}

.fin-empty {
  padding: 14px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
}

.fin-list {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fin-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--hq-border, rgba(148, 163, 184, .14));
}

.fin-list li:last-child {
  border-bottom: 0;
}

.fin-list-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.fin-list-title {
  overflow: hidden;
  color: var(--hq-text);
  font-size: 12.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fin-list-meta {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.fin-amount {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fin-pill {
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 600;
}

.fin-pill.is-danger {
  background: color-mix(in srgb, var(--hq-danger, #e5484d) 16%, transparent);
  color: var(--hq-danger, #e5484d);
}

.fin-pill.is-warning {
  background: color-mix(in srgb, var(--hq-warning, #d98a1c) 16%, transparent);
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
  color: var(--hq-text);
  font-size: 12.5px;
}

.fin-alert-item {
  color: var(--hq-danger, #e5484d);
  font-variant-numeric: tabular-nums;
}

.fin-alert-text {
  color: var(--hq-danger, #e5484d);
  font-weight: 600;
}

.fin-table-title {
  margin-right: 8px;
  font-weight: 550;
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
</style>
