<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <header class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>CRM Home</h1>
        </div>
        <div class="crm-actions">
          <button type="button" class="crm-icon-btn" :disabled="loading" :aria-label="loading ? 'Refreshing' : 'Refresh'" :title="loading ? 'Refreshing' : 'Refresh'" @click="loadData">
            <Icon icon="fluent:arrow-clockwise-16-regular" width="16" height="16" />
          </button>
        </div>
      </header>

      <p v-if="loadError" class="crm-error">
        Could not load CRM data.
        <button type="button" class="crm-inline" @click="loadData">Retry</button>
      </p>

      <section class="crm-section">
        <div class="crm-section-head">
          <h2>My relationship work</h2>
          <span class="crm-section-hint">Owned by you</span>
        </div>
        <div class="work-grid">
          <div class="crm-card">
            <div class="crm-card-head">
              <span class="crm-card-label">Leads to qualify</span>
              <button type="button" class="crm-link-btn" @click="go('crm-leads')">View all</button>
            </div>
            <p v-if="loading" class="crm-empty">Loading…</p>
            <p v-else-if="!myLeads.length" class="crm-empty">No leads assigned to you.</p>
            <ul v-else class="crm-list">
              <li v-for="lead in myLeads" :key="lead.id" class="crm-row" @click="go('crm-leads')">
                <div class="crm-row-copy">
                  <strong>{{ lead.title || lead.name || 'Untitled lead' }}</strong>
                  <small>{{ lead.source || lead.status || '' }}</small>
                </div>
                <span class="crm-badge" :class="`st-${lead.status || 'new'}`">{{ lead.status || 'new' }}</span>
              </li>
            </ul>
          </div>

          <div class="crm-card">
            <div class="crm-card-head">
              <span class="crm-card-label">Open opportunities</span>
              <button type="button" class="crm-link-btn" @click="go('crm-deals')">View all</button>
            </div>
            <p v-if="loading" class="crm-empty">Loading…</p>
            <p v-else-if="!myDeals.length" class="crm-empty">No open opportunities assigned to you.</p>
            <ul v-else class="crm-list">
              <li v-for="deal in myDeals" :key="deal.id" class="crm-row" @click="go('crm-deals')">
                <div class="crm-row-copy">
                  <strong>{{ deal.title }}</strong>
                  <small>{{ deal.expected_close_date ? 'Closes ' + formatDate(deal.expected_close_date) : 'No close date' }}</small>
                </div>
                <span class="crm-amount">{{ formatMoney(deal.value_cents, deal.currency) }}</span>
              </li>
            </ul>
          </div>

          <div class="crm-card">
            <div class="crm-card-head">
              <span class="crm-card-label">Tasks due</span>
              <button type="button" class="crm-link-btn" @click="go('crm-tasks')">View all</button>
            </div>
            <p v-if="loading" class="crm-empty">Loading…</p>
            <p v-else-if="!myTasks.length" class="crm-empty">Nothing assigned to you.</p>
            <ul v-else class="crm-list">
              <li v-for="task in myTasks" :key="task.id" class="crm-row" @click="go('crm-tasks')">
                <div class="crm-row-copy">
                  <strong>{{ task.title }}</strong>
                  <small>{{ task.due_at ? 'Due ' + formatDate(task.due_at) : 'No due date' }}</small>
                </div>
                <span v-if="task.due_at && isOverdue(task.due_at)" class="crm-badge st-overdue">Overdue</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="crm-section">
        <div class="crm-section-head">
          <h2>Pipeline snapshot</h2>
          <span class="crm-section-hint">{{ openDeals.length }} open · {{ formatMoney(totalOpenValue, 'KES') }}</span>
        </div>
        <div class="crm-card">
          <p v-if="loading" class="crm-empty">Loading…</p>
          <p v-else-if="!stages.length" class="crm-empty">No pipelines configured.</p>
          <div v-else class="stage-row">
            <button
              v-for="stage in stageSummary"
              :key="stage.id"
              type="button"
              class="stage-chip"
              @click="go('crm-deals', { stage: stage.id })"
            >
              <span class="stage-name">{{ stage.name }}</span>
              <span class="stage-count">{{ stage.count }}</span>
              <span class="stage-value">{{ formatMoney(stage.value, 'KES') }}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="crm-section">
        <div class="crm-section-head">
          <h2>Relationship activity</h2>
          <button type="button" class="crm-link-btn" @click="go('crm-activities')">View all</button>
        </div>
        <div class="crm-card">
          <p v-if="loading" class="crm-empty">Loading…</p>
          <p v-else-if="!activities.length" class="crm-empty">No activity recorded yet.</p>
          <ul v-else class="crm-timeline">
            <li v-for="item in activities" :key="item.id" class="crm-timeline-row">
              <span class="crm-timeline-icon">
                <Icon :icon="activityIcon(item.activity_type)" width="15" height="15" />
              </span>
              <div class="crm-row-copy">
                <strong>{{ item.subject || item.activity_type || 'Activity' }}</strong>
                <small>{{ item.activity_type || '' }}{{ item.related_name ? ' · ' + item.related_name : '' }}</small>
              </div>
              <span class="crm-time">{{ formatDateTime(item.occurred_at || item.create_time) }}</span>
            </li>
          </ul>
        </div>
      </section>

      <section class="crm-section">
        <div class="crm-section-head">
          <h2>Quick access</h2>
        </div>
        <div class="quick-grid">
          <button v-perm="'contacts:query'" type="button" class="quick-link" @click="go('crm-contacts')">My contacts</button>
          <button v-perm="'organizations:query'" type="button" class="quick-link" @click="go('crm-organizations')">My accounts</button>
          <button v-perm="'deals:query'" type="button" class="quick-link" @click="go('crm-deals')">My opportunities</button>
          <button v-perm="'tasks:query'" type="button" class="quick-link" @click="go('crm-tasks')">My follow-ups</button>
          <button v-perm="'events:query'" type="button" class="quick-link" @click="go('crm-events')">Linked events</button>
        </div>
      </section>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useUserStore } from '@/store/user.js'
import { contactsList } from '@/request/contacts.js'
import { pipelinesList } from '@/request/pipelines.js'
import { dealsList } from '@/request/deals.js'
import { stagesList } from '@/request/stages.js'
import { tasksList } from '@/request/tasks.js'
import { organizationsList } from '@/request/organizations.js'
import { eventsList } from '@/request/events.js'
import { leadsList } from '@/request/leads.js'
import { activitiesList } from '@/request/activities.js'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(false)
const loadError = ref(false)

const myLeads = ref([])
const myDeals = ref([])
const myTasks = ref([])
const stages = ref([])
const openDeals = ref([])
const activities = ref([])

const me = computed(() => String(userStore.user?.id || ''))

const totalOpenValue = computed(() =>
  openDeals.value.reduce((sum, deal) => sum + (Number(deal.value_cents) || 0), 0)
)

const stageSummary = computed(() => {
  const buckets = new Map()
  for (const stage of stages.value) {
    buckets.set(stage.id, { id: stage.id, name: stage.name, count: 0, value: 0 })
  }
  for (const deal of openDeals.value) {
    const key = deal.stage_id ?? deal.stageId
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count += 1
      bucket.value += Number(deal.value_cents) || 0
    }
  }
  return [...buckets.values()]
})

async function loadData() {
  loading.value = true
  loadError.value = false
  try {
    const [leads, deals, tasks, stageRows, allOpen, activityRows] = await Promise.allSettled([
      leadsList({ page: 1, pageSize: 5 }),
      dealsList({ page: 1, pageSize: 5, status: 'open' }),
      tasksList({ page: 1, pageSize: 5, assigned_to: me.value, status: 'pending' }),
      stagesList({ page: 1, pageSize: 50 }),
      dealsList({ page: 1, pageSize: 100, status: 'open' }),
      activitiesList({ page: 1, pageSize: 6 }),
    ])
    myLeads.value = leads.status === 'fulfilled' ? (leads.value.list ?? []) : []
    myDeals.value = deals.status === 'fulfilled' ? (deals.value.list ?? []) : []
    myTasks.value = tasks.status === 'fulfilled' ? (tasks.value.list ?? []) : []
    stages.value = stageRows.status === 'fulfilled' ? (stageRows.value.list ?? []) : []
    openDeals.value = allOpen.status === 'fulfilled' ? (allOpen.value.list ?? []) : []
    activities.value = activityRows.status === 'fulfilled' ? (activityRows.value.list ?? []) : []
    loadError.value = [leads, deals, tasks].every(result => result.status === 'rejected')
  } catch (error) {
    console.error('CRM overview load failed:', error)
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function go(name, query) {
  router.push({ name, query: query || {} })
}

function activityIcon(type) {
  const key = String(type || '').toLowerCase()
  if (key.includes('call')) return 'fluent:call-16-regular'
  if (key.includes('mail') || key.includes('email')) return 'fluent:mail-16-regular'
  if (key.includes('meet')) return 'fluent:people-16-regular'
  if (key.includes('task')) return 'fluent:clipboard-task-16-regular'
  return 'fluent:note-16-regular'
}

function toDate(value) {
  if (!value) return null
  const normalized = /[zZ]|[+-]\d\d:?\d\d$/.test(String(value)) ? value : `${value}Z`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(value) {
  const date = toDate(value)
  return date
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    : ''
}

function formatDateTime(value) {
  const date = toDate(value)
  return date
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
    : ''
}

function isOverdue(value) {
  const date = toDate(value)
  return date ? date.getTime() < Date.now() : false
}

function formatMoney(cents, currency) {
  const amount = (Number(cents) || 0) / 100
  const code = currency || 'KES'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(amount)
  } catch (error) {
    return `${code} ${amount.toLocaleString()}`
  }
}

onMounted(loadData)
</script>

<style scoped>
.crm-scroll {
  height: 100%;
  background: var(--hq-page);
}

.crm-container {
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 28px clamp(20px, 3vw, 42px) 36px;
  color: var(--hq-text);
}

.crm-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.crm-eyebrow {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.crm-title h1 {
  margin: 4px 0 0;
  font-size: clamp(22px, 2.2vw, 28px);
  font-weight: 650;
  letter-spacing: -.03em;
  line-height: 1.2;
}

.crm-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--hq-border);
  border-radius: 7px;
  background: transparent;
  color: var(--hq-muted);
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}

.crm-icon-btn:hover:not(:disabled) {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.crm-icon-btn:disabled {
  opacity: .55;
  cursor: default;
}

.crm-icon-btn:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.crm-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  padding: 10px 14px;
  border: 1px solid var(--hq-danger);
  border-radius: 8px;
  color: var(--hq-danger);
  font-size: 12px;
}

.crm-inline {
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.crm-section {
  margin-bottom: 26px;
}

.crm-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.crm-section-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -.01em;
}

.crm-section-hint {
  color: var(--hq-muted);
  font-size: 11px;
}

.work-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
  align-items: start;
}

.crm-card {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--hq-border);
  border-radius: 12px;
  background: var(--hq-surface);
}

.crm-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.crm-card-label {
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.crm-link-btn {
  border: 0;
  background: transparent;
  color: var(--hq-muted);
  font-size: 11px;
  cursor: pointer;
}

.crm-link-btn:hover {
  color: var(--hq-text);
  text-decoration: underline;
}

.crm-empty {
  margin: 10px 0 4px;
  color: var(--hq-muted);
  font-size: 12px;
}

.crm-list,
.crm-timeline {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.crm-row,
.crm-timeline-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 8px;
  cursor: pointer;
}

.crm-timeline-row {
  cursor: default;
}

.crm-row:hover {
  background: var(--hq-hover);
}

.crm-row-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.crm-row-copy strong,
.crm-row-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crm-row-copy strong {
  font-size: 13px;
  font-weight: 600;
}

.crm-row-copy small {
  color: var(--hq-muted);
  font-size: 11px;
}

.crm-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10px;
  font-weight: 650;
  text-transform: capitalize;
}

.crm-badge.st-overdue {
  background: color-mix(in srgb, var(--hq-danger) 14%, transparent);
  color: var(--hq-danger);
}

.crm-badge.st-won {
  background: color-mix(in srgb, var(--hq-success) 16%, transparent);
  color: var(--hq-success);
}

.crm-amount {
  flex: 0 0 auto;
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.crm-timeline-icon {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  color: var(--hq-muted);
}

.crm-time {
  flex: 0 0 auto;
  color: var(--hq-muted);
  font-size: 11px;
}

.stage-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 4px 0;
}

.stage-chip {
  display: grid;
  min-width: 120px;
  flex: 1 1 140px;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--hq-border);
  border-radius: 10px;
  background: var(--hq-page);
  text-align: left;
  cursor: pointer;
}

.stage-chip:hover {
  border-color: var(--hq-border-strong);
  background: var(--hq-hover);
}

.stage-name {
  overflow: hidden;
  color: var(--hq-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-count {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -.02em;
}

.stage-value {
  color: var(--hq-text-secondary);
  font-size: 11px;
}

.quick-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-link {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--hq-border);
  border-radius: 7px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
}

.quick-link:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

@media (max-width: 700px) {
  .work-grid {
    grid-template-columns: 1fr;
  }
}
</style>