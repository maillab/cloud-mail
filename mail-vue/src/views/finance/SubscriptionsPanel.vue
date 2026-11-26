<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Recurring commitments</div>
        <h2>Subscriptions</h2>
      </div>
      <div class="fin-head-actions">
        <el-button v-perm="'finance.subscriptions:manage'" size="small" type="primary" icon="plus" @click="openSub()">
          New subscription
        </el-button>
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <div v-loading="loading" class="fin-body">
      <div class="fin-stats">
        <StatCard label="Monthly run rate" :value="money(monthlyCents)" :hint="`${activeCount} active`" />
        <StatCard label="Annual run rate" :value="money(annualCents)" hint="Monthly run rate × 12" />
        <StatCard
          label="Due in 7 days"
          :value="String(dueSoon.length)"
          :tone="dueSoon.length ? 'warning' : 'default'"
          :hint="dueSoon.length ? 'Charged soon' : 'Nothing imminent'"
        />
        <StatCard
          label="Overdue"
          :value="String(overdue.length)"
          :tone="overdue.length ? 'negative' : 'default'"
          hint="Past the billing date"
        />
      </div>

      <section class="fin-card">
        <div v-if="subscriptions.length" class="fin-table-wrap">
          <el-table :data="subscriptions" size="small" style="width: 100%">
            <el-table-column label="Service" min-width="180">
              <template #default="scope">
                <div class="fin-cell-main">
                  <span class="fin-table-title">{{ scope.row.service }}</span>
                  <span v-if="scope.row.vendor" class="fin-cell-meta">{{ scope.row.vendor }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Amount" min-width="120" align="right">
              <template #default="scope">
                {{ money(scope.row.amount_cents, scope.row.currency) }}
                <span class="fin-cell-meta">/ {{ cycleLabel(scope.row.billing_cycle) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Next billing" min-width="120">
              <template #default="scope">{{ scope.row.next_billing_date || '—' }}</template>
            </el-table-column>
            <el-table-column label="When" min-width="120">
              <template #default="scope">
                <span :class="{ 'fin-alert-text': scope.row.overdue }">{{ whenLabel(scope.row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Reminders" min-width="140">
              <template #default="scope">
                <span class="fin-cell-meta">
                  {{ scope.row.reminder_offsets_list?.length ? scope.row.reminder_offsets_list.map(d => `${d}d`).join(' · ') : 'none' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="Status" min-width="90">
              <template #default="scope">
                <span class="fin-status" :class="`is-${scope.row.status}`">{{ statusLabel(scope.row.status) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Actions" min-width="190" fixed="right">
              <template #default="scope">
                <el-button text size="small" @click="openDetail(scope.row)">Open</el-button>
                <el-button
                  v-perm="'finance.subscriptions:pay'"
                  v-if="scope.row.status === 'active'"
                  text
                  size="small"
                  type="success"
                  @click="openPay(scope.row)"
                >Pay</el-button>
                <el-button
                  v-perm="'finance.subscriptions:manage'"
                  text
                  size="small"
                  @click="openSub(scope.row)"
                >Edit</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div v-else class="fin-empty">
          <p>No subscriptions yet. Recurring costs are the easiest money to lose track of.</p>
          <el-button v-perm="'finance.subscriptions:manage'" type="primary" @click="openSub()">Add the first subscription</el-button>
        </div>
      </section>

      <section v-if="dueSoon.length || overdue.length" class="fin-card">
        <div class="fin-card-head">
          <h3>Reminders</h3>
          <span class="fin-card-note">Driven by each subscription's own reminder offsets</span>
        </div>
        <ul class="fin-list">
          <li v-for="item in [...overdue, ...dueSoon]" :key="`${item.id}-${item.overdue ? 'o' : 'd'}`">
            <div class="fin-list-main">
              <span class="fin-list-title">{{ item.service }}</span>
              <span class="fin-list-meta">{{ whenLabel(item) }}</span>
            </div>
            <span class="fin-amount">{{ money(item.amount_cents, item.currency) }}</span>
          </li>
        </ul>
      </section>
    </div>

    <el-dialog v-model="subDialog" :title="form.id ? 'Edit subscription' : 'New subscription'" width="560px">
      <el-form :model="form" label-width="130px">
        <el-form-item label="Service" required>
          <el-input v-model="form.service" maxlength="200" placeholder="e.g. Figma" />
        </el-form-item>
        <el-form-item label="Vendor">
          <el-input v-model="form.vendor" maxlength="200" placeholder="Who bills us" />
        </el-form-item>
        <el-form-item label="Amount" required>
          <el-input-number v-model="form.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="Billing cycle">
          <el-select v-model="form.billing_cycle" style="width: 100%" @change="onCycleChange">
            <el-option label="Weekly" value="weekly" />
            <el-option label="Monthly" value="monthly" />
            <el-option label="Quarterly" value="quarterly" />
            <el-option label="Every six months" value="semiannual" />
            <el-option label="Yearly" value="annual" />
            <el-option label="Custom" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.billing_cycle === 'custom'" label="Every (days)">
          <el-input-number v-model="form.custom_days" :min="1" :max="365" controls-position="right" style="width: 130px" />
        </el-form-item>
        <el-form-item label="Next billing">
          <el-date-picker v-model="form.next_billing_date" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
          <span class="fin-hint">Leave empty to calculate it from today.</span>
        </el-form-item>
        <el-form-item label="Auto renew">
          <el-switch v-model="form.auto_renew" />
          <span class="fin-hint">Advances the billing date when a payment is recorded.</span>
        </el-form-item>
        <el-form-item label="Reminders">
          <el-select
            v-model="form.reminder_offsets"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="Days before billing"
            style="width: 100%"
          >
            <el-option v-for="day in [14, 7, 3, 2, 1, 0]" :key="day" :label="`${day} day${day === 1 ? '' : 's'} before`" :value="day" />
          </el-select>
          <span class="fin-hint">Each offset is its own reminder. Stored as data, not hardcoded.</span>
        </el-form-item>
        <el-form-item label="Payment method">
          <el-input v-model="form.payment_method" maxlength="60" placeholder="Card, M-Pesa…" />
        </el-form-item>
        <el-form-item label="Category">
          <el-input v-model="form.category" maxlength="80" placeholder="Software, Hosting…" />
        </el-form-item>
        <el-form-item label="Website">
          <el-input v-model="form.website" maxlength="300" />
        </el-form-item>
        <el-form-item label="Notes">
          <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" />
        </el-form-item>
      </el-form>
      <LinkedRecords
        v-if="form.id"
        source-type="subscription"
        :source-id="form.id"
        :editable="canEditRelations"
      />
      <template #footer>
        <el-button @click="subDialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveSub">Save</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="payDialog" :title="`Record payment · ${payTarget?.service || ''}`" width="520px">
      <el-form :model="payForm" label-width="120px">
        <el-form-item label="Amount">
          <el-input-number v-model="payForm.amount" :precision="2" :min="0" :step="100" controls-position="right" style="width: 100%" />
          <span class="fin-hint">Defaults to the subscription amount.</span>
        </el-form-item>
        <el-form-item label="From account" required>
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

    <el-dialog v-model="detailDialog" :title="detail?.service || 'Subscription'" width="780px" top="6vh">
      <div v-loading="detailLoading" class="fin-detail">
        <div class="fin-stats">
          <StatCard label="Amount" :value="money(detail?.amount_cents, detail?.currency)" :hint="cycleLabel(detail?.billing_cycle)" />
          <StatCard label="Monthly equivalent" :value="money(detail?.monthly_equivalent_cents, detail?.currency)" />
          <StatCard
            label="Next billing"
            :value="detail?.next_billing_date || '—'"
            :tone="detail?.overdue ? 'negative' : (detail?.due_soon ? 'warning' : 'default')"
            :hint="whenLabel(detail)"
          />
          <StatCard label="Status" :value="detail?.status || '—'" :hint="detail?.auto_renew ? 'Auto-renews' : 'Manual renewal'" />
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
              <template #default="scope">{{ money(scope.row.amount_cents, detail.currency) }}</template>
            </el-table-column>
            <el-table-column prop="method" label="Method" min-width="120" />
            <el-table-column prop="account_name" label="Account" min-width="140" />
          </el-table>
          <div v-else class="fin-empty">No payments recorded yet.</div>
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
              <template #default="scope">{{ money(scope.row.amount_cents, detail.currency) }}</template>
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
  financeAccounts, financeSubscription, financeSubscriptionCreate, financeSubscriptionPay,
  financeSubscriptionUpdate, financeSubscriptions,
} from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'
import { statusLabel } from '@/utils/finance-labels.js'

const CYCLE_LABELS = {
  weekly: 'week', monthly: 'month', quarterly: 'quarter', semiannual: '6 months', annual: 'year', custom: 'cycle',
}

const loading = ref(false)
const subscriptions = ref([])
const monthly = ref(0)
const annual = ref(0)
const accounts = ref([])

const subDialog = ref(false)
const saving = ref(false)
const payDialog = ref(false)
const paying = ref(false)
const detailDialog = ref(false)
const detailLoading = ref(false)
const detail = ref(null)
const payTarget = ref(null)

const form = reactive(blankSub())
const payForm = reactive({ amount: 0, account_id: null, method: '', reference: '', paid_at: '' })

function blankSub() {
  return {
    id: null, service: '', vendor: '', amount: 0, billing_cycle: 'monthly', custom_days: 30,
    next_billing_date: '', auto_renew: true, reminder_offsets: [7, 1, 0],
    payment_method: '', category: '', website: '', notes: '',
  }
}

const money = (cents, currency = 'KES') => formatCents(cents, currency)
const canEditRelations = computed(() => hasPerm('finance.subscriptions:manage') || hasPerm('finance:edit'))
const cycleLabel = (cycle) => CYCLE_LABELS[cycle] || cycle || 'cycle'

const active = computed(() => subscriptions.value.filter(row => row.status === 'active'))
const activeCount = computed(() => active.value.length)
const monthlyCents = computed(() => Number(monthly.value) || 0)
const annualCents = computed(() => Number(annual.value) || 0)
const dueSoon = computed(() => active.value.filter(row => row.due_soon && !row.overdue))
const overdue = computed(() => active.value.filter(row => row.overdue))

function whenLabel(row) {
  if (!row) return '—'
  const days = row.days_until_billing
  if (days === null || days === undefined) return 'Not scheduled'
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

async function load() {
  loading.value = true
  try {
    const [list, accountList] = await Promise.all([financeSubscriptions(), financeAccounts()])
    subscriptions.value = list.list || []
    monthly.value = list.monthlyCents ?? 0
    annual.value = list.annualCents ?? 0
    accounts.value = (accountList.list || []).filter(row => row.status === 'active')
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load subscriptions.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function openSub(row = null) {
  Object.assign(form, blankSub())
  if (row) {
    Object.assign(form, {
      id: row.id,
      service: row.service,
      vendor: row.vendor || '',
      amount: (Number(row.amount_cents) || 0) / 100,
      billing_cycle: row.billing_cycle || 'monthly',
      custom_days: 30,
      next_billing_date: row.next_billing_date || '',
      auto_renew: Boolean(row.auto_renew),
      reminder_offsets: row.reminder_offsets_list || [],
      payment_method: row.payment_method || '',
      category: row.category || '',
      website: row.website || '',
      notes: row.notes || '',
    })
  }
  subDialog.value = true
}

function onCycleChange() {
  // Nothing to compute here: the server derives the next date when the field is
  // left empty, which keeps one definition of a billing cycle.
}

async function saveSub() {
  if (!form.service.trim()) {
    ElMessage({ message: 'Give the subscription a name.', type: 'warning', plain: true })
    return
  }
  if (!form.amount) {
    ElMessage({ message: 'Enter an amount greater than zero.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    const payload = {
      service: form.service,
      vendor: form.vendor,
      amount_cents: toCents(form.amount),
      billing_cycle: form.billing_cycle,
      custom_days: form.billing_cycle === 'custom' ? Number(form.custom_days) || 30 : undefined,
      next_billing_date: form.next_billing_date || undefined,
      auto_renew: form.auto_renew,
      reminder_offsets: form.reminder_offsets || [],
      payment_method: form.payment_method,
      category: form.category,
      website: form.website,
      notes: form.notes,
    }
    if (form.id) await financeSubscriptionUpdate(form.id, payload)
    else await financeSubscriptionCreate(payload)
    subDialog.value = false
    await load()
    ElMessage({ message: 'Subscription saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save the subscription.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function openPay(row) {
  payTarget.value = row
  Object.assign(payForm, {
    amount: (Number(row.amount_cents) || 0) / 100,
    account_id: accounts.value[0]?.id ?? null,
    method: row.payment_method || '',
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
    ElMessage({ message: 'Choose the account this was paid from.', type: 'warning', plain: true })
    return
  }
  paying.value = true
  try {
    await financeSubscriptionPay(payTarget.value.id, {
      amount_cents: toCents(payForm.amount),
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

async function openDetail(row) {
  detailDialog.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await financeSubscription(row.id)
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the subscription.', type: 'error', plain: true })
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

.fin-status.is-active {
  color: var(--hq-success, #2f9e6f);
}

.fin-status.is-trial {
  color: var(--hq-warning, #d98a1c);
}

.fin-status.is-paused,
.fin-status.is-cancelled,
.fin-status.is-expired {
  color: var(--hq-muted);
}

.fin-empty {
  padding: 24px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
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
  font-size: 12.5px;
  font-weight: 550;
}

.fin-list-meta {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.fin-hint {
  display: block;
  color: var(--hq-muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.fin-detail {
  display: grid;
  gap: 14px;
}

.fin-block {
  padding-top: 4px;
}
</style>