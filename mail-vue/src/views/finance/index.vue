<template>
  <el-scrollbar class="fin-scroll">
    <div class="fin-shell">
      <aside class="fin-rail">
        <div class="fin-rail-head">
          <div class="fin-eyebrow">XPass HQ / Finance</div>
          <h1>Finance</h1>
          <div class="fin-scope">{{ companyScope ? 'Company-wide' : 'Limited to your access' }}</div>
        </div>

        <nav class="fin-nav" aria-label="Finance sections">
          <button
            v-for="item in sections"
            :key="item.id"
            type="button"
            class="fin-link"
            :class="{ 'is-active': item.id === section }"
            :aria-current="item.id === section ? 'page' : undefined"
            @click="go(item.id)"
          >
            <Icon :icon="item.icon" width="17" height="17" />
            <span class="fin-link-text">{{ item.label }}</span>
            <span v-if="item.badge" class="fin-badge">{{ item.badge }}</span>
          </button>
        </nav>
      </aside>

      <main class="fin-main">
        <component
          :is="current.component"
          :key="section"
          v-bind="current.props || {}"
          @navigate="go"
        />
      </main>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { hasPerm } from '@/perm/perm.js'
import OverviewPanel from './OverviewPanel.vue'
import AccountsPanel from './AccountsPanel.vue'
import TransactionsPanel from './TransactionsPanel.vue'
import BudgetsPanel from './BudgetsPanel.vue'
import DebtsPanel from './DebtsPanel.vue'
import SubscriptionsPanel from './SubscriptionsPanel.vue'
import PaymentsPanel from './PaymentsPanel.vue'
import InvoicesPanel from './InvoicesPanel.vue'
import ReportsPanel from './ReportsPanel.vue'
import AuditPanel from './AuditPanel.vue'
import ConfigPanel from './ConfigPanel.vue'

// A section is hidden, not broken, when the role lacks its key. The route itself
// is already gated on finance:view, so this only narrows what is reachable.
const CATALOG = [
  { id: 'overview', label: 'Overview', icon: 'solar:widget-2-line-duotone', perm: 'finance:view', component: OverviewPanel },
  { id: 'accounts', label: 'Accounts & funds', icon: 'fluent:wallet-credit-card-20-regular', perm: 'finance.accounts:view', component: AccountsPanel },
  { id: 'transactions', label: 'Transactions', icon: 'fluent:arrow-swap-20-regular', perm: 'finance.transactions:view', component: TransactionsPanel },
  // Expenses, income and funding are views of the same ledger, filtered by the
  // panel itself. They are not three more transaction models.
  { id: 'expenses', label: 'Expenses', icon: 'fluent:receipt-money-20-regular', perm: 'finance.transactions:view', component: TransactionsPanel, props: { initialType: 'expense' } },
  { id: 'income', label: 'Income & funding', icon: 'fluent:arrow-trending-20-regular', perm: 'finance.transactions:view', component: TransactionsPanel, props: { initialDirection: 'in' } },
  { id: 'budgets', label: 'Budgets', icon: 'fluent:chart-multiple-20-regular', perm: 'finance.budgets:view', component: BudgetsPanel },
  { id: 'debts', label: 'Debts', icon: 'fluent:receipt-20-regular', perm: 'finance.debts:view', component: DebtsPanel },
  { id: 'subscriptions', label: 'Subscriptions', icon: 'fluent:arrow-repeat-all-20-regular', perm: 'finance.subscriptions:view', component: SubscriptionsPanel },
  { id: 'payments', label: 'Payments', icon: 'fluent:wallet-20-regular', perm: 'finance.transactions:view', component: PaymentsPanel },
  { id: 'invoices', label: 'Invoices', icon: 'fluent:document-text-20-regular', perm: 'finance.invoices:view', component: InvoicesPanel },
  { id: 'reports', label: 'Reports', icon: 'fluent:data-bar-horizontal-20-regular', perm: 'finance.transactions:view', component: ReportsPanel },
  { id: 'config', label: 'Configuration', icon: 'fluent:settings-20-regular', perm: 'finance:view', component: ConfigPanel },
  { id: 'audit', label: 'Audit log', icon: 'fluent:history-20-regular', perm: 'finance.audit:view', component: AuditPanel },
]

const route = useRoute()
const router = useRouter()

const sections = computed(() => CATALOG.filter(item => hasPerm(item.perm)))

const section = ref(sections.value.some(item => item.id === route.query.section)
  ? String(route.query.section)
  : sections.value[0]?.id || 'overview')

const current = computed(() => sections.value.find(item => item.id === section.value) || sections.value[0])

// Reachable by URL without a click, and the chosen section survives a refresh.
function go(id) {
  const target = sections.value.find(item => item.id === id)
  if (!target) return
  section.value = id
  if (route.query.section !== id) {
    router.replace({ query: { ...route.query, section: id } })
  }
}

watch(() => route.query.section, (value) => {
  if (value && sections.value.some(item => item.id === value) && value !== section.value) {
    section.value = String(value)
  }
})
</script>

<style scoped>
.fin-scroll {
  height: 100%;
  background: var(--hq-page);
}

.fin-shell {
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  min-height: 100%;
  width: 100%;
}

.fin-rail {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;
  padding: 24px 14px 28px 20px;
  border-right: 1px solid var(--hq-border, rgba(148, 163, 184, .22));
}

.fin-rail-head {
  display: grid;
  gap: 2px;
  padding: 0 8px;
}

.fin-eyebrow {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.fin-rail-head h1 {
  margin: 2px 0 0;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -.035em;
  line-height: 1.2;
}

.fin-scope {
  margin-top: 4px;
  color: var(--hq-muted);
  font-size: 12px;
}

.fin-nav {
  display: grid;
  gap: 1px;
}

.fin-link {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 34px;
  padding: 0 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.fin-link:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.fin-link.is-active {
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.fin-link:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.fin-link-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fin-badge {
  flex: 0 0 auto;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--hq-danger, #e5484d);
  color: #fff;
  font-size: 10.5px;
  font-weight: 650;
  line-height: 16px;
  text-align: center;
}

.fin-main {
  min-width: 0;
  padding: 24px clamp(18px, 2.6vw, 34px) 40px;
}

@media (max-width: 900px) {
  .fin-shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .fin-rail {
    position: static;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    border-right: 0;
    border-bottom: 1px solid var(--hq-border, rgba(148, 163, 184, .22));
    overflow-x: auto;
  }

  .fin-rail-head {
    display: none;
  }

  .fin-nav {
    display: flex;
    gap: 4px;
  }

  .fin-link {
    flex: 0 0 auto;
    white-space: nowrap;
  }
}
</style>