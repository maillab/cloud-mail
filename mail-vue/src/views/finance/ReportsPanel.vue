<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Where the money went</div>
        <h2>Reports</h2>
      </div>
      <div class="fin-head-actions">
        <el-date-picker v-model="from" type="date" value-format="YYYY-MM-DD" placeholder="From" size="small" style="width: 150px" @change="reload" />
        <el-date-picker v-model="to" type="date" value-format="YYYY-MM-DD" placeholder="To" size="small" style="width: 150px" @change="reload" />
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="reload" />
      </div>
    </header>

    <section class="fin-card" v-loading="summaryLoading">
      <div class="fin-card-head">
        <h3>Cash flow</h3>
        <span class="fin-card-note">{{ summary.from }} → {{ summary.to }}</span>
      </div>
      <div class="fin-stats fin-stats-tight">
        <StatCard label="Opening" :value="money(summary.opening_cents)" />
        <StatCard label="Money in" :value="money(summary.income_cents)" tone="positive" />
        <StatCard label="Money out" :value="money(summary.expense_cents)" tone="negative" />
        <StatCard
          label="Closing"
          :value="money(summary.closing_cents)"
          :tone="Number(summary.closing_cents) < 0 ? 'negative' : 'default'"
          :hint="`${summary.net_cents < 0 ? '-' : ''}${money(Math.abs(Number(summary.net_cents) || 0))} net`"
        />
      </div>
      <p class="fin-card-note">
        Fees paid: {{ money(summary.fees_cents) }}
        <template v-if="summary.transfers_cents"> · moved between accounts: {{ money(summary.transfers_cents) }}</template>
        · transfers and advances are not income or expense.
      </p>
    </section>

    <div class="fin-cols">
      <section class="fin-card" v-loading="summaryLoading">
        <div class="fin-card-head">
          <h3>Closing balance by account</h3>
          <span class="fin-card-note">Opening → closing</span>
        </div>
        <el-table v-if="summary.by_account?.length" :data="summary.by_account" size="small" style="width: 100%">
          <el-table-column prop="name" label="Account" min-width="160" />
          <el-table-column label="Opening" min-width="120" align="right">
            <template #default="scope">{{ money(scope.row.opening_cents) }}</template>
          </el-table-column>
          <el-table-column label="In" min-width="110" align="right">
            <template #default="scope">{{ money(scope.row.income_cents) }}</template>
          </el-table-column>
          <el-table-column label="Out" min-width="110" align="right">
            <template #default="scope">{{ money(scope.row.expense_cents) }}</template>
          </el-table-column>
          <el-table-column label="Fees" min-width="100" align="right">
            <template #default="scope">{{ money(scope.row.fees_cents) }}</template>
          </el-table-column>
          <el-table-column label="Closing" min-width="120" align="right">
            <template #default="scope">
              <span :class="Number(scope.row.balance_cents) < 0 ? 'fin-amount-out' : 'fin-positive'">
                {{ money(scope.row.balance_cents) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="fin-empty">No accounts in scope.</div>
      </section>

      <section class="fin-card" v-loading="summaryLoading">
        <div class="fin-card-head">
          <h3>Top counterparties</h3>
          <span class="fin-card-note">Money out this period</span>
        </div>
        <div v-if="summary.by_counterparty?.length" class="fin-bars">
          <div v-for="row in summary.by_counterparty" :key="row.name" class="fin-bar-row">
            <div class="fin-bar-head">
              <span class="fin-bar-label">{{ row.name }}</span>
              <span class="fin-bar-value">{{ money(row.amount_cents) }}</span>
            </div>
            <div class="fin-bar-track">
              <span class="fin-bar-fill" :style="{ width: `${width(row.amount_cents)}%` }" />
            </div>
          </div>
        </div>
        <div v-else class="fin-empty">No payments to counterparties in this period.</div>
      </section>
    </div>

    <div class="fin-cols">
      <section class="fin-card" v-loading="spendingLoading">
        <div class="fin-card-head">
          <h3>Spending by category</h3>
          <span class="fin-card-note">{{ money(spending.totalCents) }} across {{ spending.list.length }} categories</span>
        </div>

        <div v-if="spending.list.length" class="fin-bars">
          <div v-for="row in spending.list" :key="row.category" class="fin-bar-row">
            <div class="fin-bar-head">
              <span class="fin-bar-label">{{ row.category }}</span>
              <span class="fin-bar-value">
                {{ money(row.amount_cents) }}
                <span class="fin-cell-meta">{{ row.count }} payment{{ row.count === 1 ? '' : 's' }}</span>
              </span>
            </div>
            <div class="fin-bar-track">
              <span class="fin-bar-fill" :style="{ width: `${width(row.amount_cents)}%` }" />
            </div>
          </div>
        </div>
        <div v-else class="fin-empty">No spending in this period.</div>
      </section>

      <section class="fin-card" v-loading="utilLoading">
        <div class="fin-card-head">
          <h3>Fund utilisation</h3>
          <el-select
            v-model="accountId"
            size="small"
            placeholder="Choose an account"
            style="width: 200px"
            @change="loadUtilization"
          >
            <el-option v-for="account in accounts" :key="account.id" :label="account.name" :value="account.id" />
          </el-select>
        </div>

        <template v-if="utilization.account">
          <div class="fin-stats fin-stats-tight">
            <StatCard label="Opening" :value="money(utilization.opening_cents)" />
            <StatCard label="Money in" :value="money(utilization.money_in_cents)" tone="positive" />
            <StatCard label="Money out" :value="money(utilization.money_out_cents)" tone="negative" />
            <StatCard
              label="Closing"
              :value="money(utilization.closing_cents)"
              :tone="Number(utilization.closing_cents) < 0 ? 'negative' : 'default'"
              :hint="`${Math.round(utilization.utilization_percent || 0)}% of opening used`"
            />
          </div>

          <div v-if="utilization.by_category?.length" class="fin-bars">
            <div v-for="row in utilization.by_category" :key="row.name" class="fin-bar-row">
              <div class="fin-bar-head">
                <span class="fin-bar-label">{{ row.name }}</span>
                <span class="fin-bar-value">{{ money(row.amount_cents) }}</span>
              </div>
              <div class="fin-bar-track">
                <span class="fin-bar-fill" :style="{ width: `${width(row.amount_cents)}%` }" />
              </div>
            </div>
          </div>
        </template>
        <div v-else class="fin-empty">Choose an account to see where its money went.</div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import StatCard from './StatCard.vue'
import {
  financeAccountUtilization, financeAccounts, financeReportSummary, financeSpendingByCategory,
} from '@/request/finance.js'
import { formatCents } from '@/utils/money.js'

const summaryLoading = ref(false)
const spendingLoading = ref(false)
const summary = ref({ from: '', to: '', opening_cents: 0, income_cents: 0, expense_cents: 0, fees_cents: 0, transfers_cents: 0, net_cents: 0, closing_cents: 0, by_account: [], by_counterparty: [] })
const utilLoading = ref(false)
const spending = ref({ list: [], totalCents: 0 })
const utilization = ref({ account: null, by_category: [] })
const accounts = ref([])
const accountId = ref(null)
const from = ref('')
const to = ref('')

const money = (cents) => formatCents(cents)

const maxAmount = () => {
  const values = [
    ...spending.value.list.map(row => Number(row.amount_cents) || 0),
    ...(utilization.value.by_category || []).map(row => Number(row.amount_cents) || 0),
  ]
  return values.length ? Math.max(...values) : 0
}

function width(cents) {
  const max = maxAmount()
  if (!max) return '0%'
  return `${Math.max(2, Math.round(((Number(cents) || 0) / max) * 100))}%`
}

async function loadSpending() {
  spendingLoading.value = true
  try {
    spending.value = await financeSpendingByCategory({
      from: from.value || undefined,
      to: to.value || undefined,
    })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load spending.', type: 'error', plain: true })
  } finally {
    spendingLoading.value = false
  }
}

async function loadUtilization() {
  if (!accountId.value) {
    utilization.value = { account: null, by_category: [] }
    return
  }
  utilLoading.value = true
  try {
    utilization.value = await financeAccountUtilization(accountId.value)
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load fund utilisation.', type: 'error', plain: true })
  } finally {
    utilLoading.value = false
  }
}

async function loadSummary() {
  summaryLoading.value = true
  try {
    summary.value = await financeReportSummary({
      from: from.value || undefined,
      to: to.value || undefined,
    })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the cash flow.', type: 'error', plain: true })
  } finally {
    summaryLoading.value = false
  }
}

async function reload() {
  await Promise.all([loadSummary(), loadSpending()])
  try {
    const result = await financeAccounts()
    accounts.value = result.list || []
    if (!accountId.value && accounts.value.length) {
      accountId.value = accounts.value[0].id
      await loadUtilization()
    }
  } catch {
    // Accounts are an optional aid for this report; spending still stands alone.
  }
}

onMounted(reload)
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

.fin-cols {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
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
  flex-wrap: wrap;
  margin-bottom: 12px;
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

.fin-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}

.fin-stats-tight {
  margin-bottom: 14px;
}

.fin-bars {
  display: grid;
  gap: 12px;
  margin-top: 4px;
}

.fin-bar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
}

.fin-bar-label {
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fin-bar-value {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.fin-cell-meta {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 400;
}

.fin-bar-track {
  height: 7px;
  overflow: hidden;
  border-radius: 4px;
  background: var(--hq-hover);
}

.fin-bar-fill {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: var(--hq-accent, #3b82f6);
}

.fin-empty {
  padding: 20px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
}
</style>