<template>
  <el-scrollbar class="overview-scroll">
    <main class="hq-overview" :class="`density-${store.density}`">
      <header class="po-header">
        <div class="po-head-main">
          <div class="po-eyebrow">XPASS HQ <span>/</span> WORKSPACE</div>
          <h1 class="po-title">{{ greeting }}, {{ firstName }}</h1>
          <p class="po-subtitle">{{ todayLabel }}</p>
        </div>
        <div class="po-head-side">
          <el-button v-if="hasPerm('ai:use')" class="ai-entry" @click="openAi">
            <Icon icon="fluent:brain-circuit-20-regular" width="16" height="16" /> XPass AI
          </el-button>
          <el-button type="primary" @click="openCustomize">
            <Icon icon="fluent:settings-20-regular" width="16" height="16" /> Customize workspace
          </el-button>
        </div>
      </header>

      <div class="widget-grid">
        <section
          v-for="widget in store.layout"
          :key="widget.id"
          class="widget"
          :class="[`span-${widget.w}`, `h-${widget.h}`]"
          :data-widget="widget.id"
        >
          <div class="widget-head">
            <h2 class="widget-title">{{ widgetTitle(widget.id) }}</h2>
            <div class="widget-tools">
              <button v-if="customizeMode" type="button" class="icon-btn" title="Move up" @click="nudge(widget.id, -1)">
                <Icon icon="fluent:arrow-up-12-regular" width="14" height="14" />
              </button>
              <button v-if="customizeMode" type="button" class="icon-btn" title="Move down" @click="nudge(widget.id, 1)">
                <Icon icon="fluent:arrow-down-12-regular" width="14" height="14" />
              </button>
              <button v-if="customizeMode && widget.id !== 'attention'" type="button" class="icon-btn" title="Remove" @click="store.removeWidget(widget.id); store.preview()">
                <Icon icon="fluent:dismiss-12-regular" width="14" height="14" />
              </button>
            </div>
          </div>

          <div class="widget-body">
            <template v-if="widget.id === 'attention'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="attentionError" class="w-state w-error">{{ attentionError }}</p>
              <p v-else-if="!attentionItems.length" class="w-state w-ok">
                <Icon icon="fluent:checkmark-circle-16-regular" width="15" height="15" /> Nothing needs your attention.
              </p>
              <ul v-else class="w-list">
                <li v-for="item in attentionItems.slice(0, 7)" :key="item.key" class="w-row" :class="`is-${item.priority}`">
                  <span class="w-badge" :class="`k-${item.kind}`">{{ item.kindLabel }}</span>
                  <div class="w-copy">
                    <strong>{{ item.title }}</strong>
                    <small>{{ item.meta }}</small>
                  </div>
                  <button type="button" class="w-action" @click="runAction(item)">{{ item.actionLabel }}</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'my-tasks'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.tasks" class="w-state w-error">{{ errors.tasks }}</p>
              <p v-else-if="!myTasks.length" class="w-state">
                No tasks. <button class="w-inline" @click="go('crm-tasks')">Create a task</button>
              </p>
              <ul v-else class="w-list">
                <li v-for="t in myTasks.slice(0, 6)" :key="t.id" class="w-row">
                  <span class="w-badge" :class="`s-${t.status}`">{{ t.status }}</span>
                  <div class="w-copy"><strong>{{ t.title }}</strong><small>{{ t.due_at ? 'Due ' + formatDate(t.due_at) : 'No deadline' }}</small></div>
                  <button type="button" class="w-action" @click="go('crm-tasks')">Open</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'overdue-tasks'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.tasks" class="w-state w-error">{{ errors.tasks }}</p>
              <p v-else-if="!overdueTasks.length" class="w-state w-ok">No overdue tasks.</p>
              <ul v-else class="w-list">
                <li v-for="t in overdueTasks.slice(0, 6)" :key="t.id" class="w-row is-high">
                  <div class="w-copy"><strong>{{ t.title }}</strong><small>Due {{ formatDate(t.due_at) }}</small></div>
                  <button type="button" class="w-action" @click="completeTask(t)">Done</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'my-requests'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.support" class="w-state w-error">{{ errors.support }}</p>
              <p v-else-if="!myRequests.length" class="w-state">
                No requests. <button class="w-inline" @click="go('support')">View requests</button>
              </p>
              <ul v-else class="w-list">
                <li v-for="r in myRequests.slice(0, 6)" :key="r.id" class="w-row">
                  <span class="w-badge">{{ r.status }}</span>
                  <div class="w-copy"><strong>{{ r.title }}</strong><small>{{ r.priority }} priority</small></div>
                  <button type="button" class="w-action" @click="go('support')">Open</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'projects'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.projects" class="w-state w-error">{{ errors.projects }}</p>
              <p v-else-if="!myProjects.length" class="w-state">
                No projects. <button class="w-inline" @click="go('projects')">View projects</button>
              </p>
              <ul v-else class="w-list">
                <li v-for="p in myProjects.slice(0, 6)" :key="p.id" class="w-row">
                  <div class="w-copy"><strong>{{ p.name }}</strong><small>{{ p.status }}</small></div>
                  <button type="button" class="w-action" @click="go('projects')">Open</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'mail'">
              <p v-if="mailLoading" class="w-state">Loading…</p>
              <p v-else-if="mailError" class="w-state w-error">{{ mailError }}</p>
              <p v-else-if="!currentAccount" class="w-state">No mailbox selected.</p>
              <p v-else-if="!recentMessages.length" class="w-state w-ok">Inbox is clear.</p>
              <ul v-else class="w-list">
                <li v-for="m in recentMessages.slice(0, 5)" :key="m.emailId" class="w-row" :class="{ unread: m.unread === 0 }">
                  <span class="w-avatar">{{ senderInitial(m.name || m.sendEmail) }}</span>
                  <div class="w-copy">
                    <strong>{{ m.name || m.sendEmail }}</strong>
                    <small>{{ m.subject || '(No subject)' }}</small>
                  </div>
                  <span class="w-when"><small>{{ formatDate(m.createTime) }}</small></span>
                  <button type="button" class="w-action" @click="openMail(m)">Open</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'notifications'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.notifications" class="w-state w-error">{{ errors.notifications }}</p>
              <p v-else-if="!myNotifications.length" class="w-state w-ok">No notifications.</p>
              <ul v-else class="w-list">
                <li v-for="n in notificationPreview" :key="n.id" class="w-row" :class="{ unread: !n.is_read }">
                  <div class="w-copy"><strong>{{ n.title }}</strong><small>{{ n.body || n.type }}</small></div>
                  <button v-if="!n.is_read" type="button" class="w-action" @click="markRead(n)">Read</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'calendar'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.calendar" class="w-state w-error">{{ errors.calendar }}</p>
              <p v-else-if="!scheduleGroups.length" class="w-state">
                Nothing scheduled. <button class="w-inline" @click="go('calendar', {create: 'personal'})">Add event</button>
              </p>
              <div v-else class="sched">
                <section v-for="g in scheduleGroups" :key="g.key" class="sched-group">
                  <div class="sched-label">{{ g.label }}</div>
                  <ul class="w-list">
                    <li v-for="ev in g.items.slice(0, 4)" :key="ev.id" class="w-row is-clickable" @click="openEvent(ev)">
                      <div class="w-when"><strong>{{ formatTime(ev.start_time) }}</strong><small v-if="ev.end_time">{{ formatTime(ev.end_time) }}</small></div>
                      <div class="w-copy"><strong>{{ ev.title }}</strong><small>{{ calendarLabel(ev) }}</small></div>
                    </li>
                  </ul>
                </section>
              </div>
            </template>

            <template v-else-if="widget.id === 'notes'">
              <div class="w-capture">
                <el-input v-model="noteDraft" type="textarea" :rows="2" :disabled="!hasPerm('notes:query')" placeholder="Capture a quick note…" />
                <div class="w-capture-row">
                  <button type="button" class="w-inline" @click="noteExpand = !noteExpand">{{ noteExpand ? 'Less' : 'More options' }}</button>
                  <el-button type="primary" size="small" :disabled="!hasPerm('notes:query') || !noteDraft.trim()" :loading="noteSaving" @click="quickCapture">Save</el-button>
                </div>
                <div v-if="noteExpand" class="w-note-fields">
                  <el-input v-model="noteTitle" size="small" placeholder="Title" />
                  <el-select v-model="notePriority" size="small" style="width: 110px">
                    <el-option v-for="p in NOTE_PRIORITIES" :key="p" :label="p" :value="p" />
                  </el-select>
                  <el-date-picker v-model="noteReminder" type="datetime" size="small" placeholder="Reminder" value-format="YYYY-MM-DDTHH:mm:ssZ" />
                  <el-checkbox v-model="notePinned">Pin</el-checkbox>
                </div>
              </div>
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.notes" class="w-state w-error">{{ errors.notes }}</p>
              <p v-else-if="!myNotes.length" class="w-state">No notes yet.</p>
              <ul v-else class="w-list">
                <li v-for="n in myNotes.slice(0, 5)" :key="n.id" class="w-row is-clickable" @click="go('notes')">
                  <span v-if="n.is_pinned" class="w-badge k-pin">Pinned</span>
                  <div class="w-copy"><strong>{{ n.title || 'Untitled' }}</strong><small>{{ (n.content || '').slice(0, 70) }}</small></div>
                  <span v-if="n.reminder_at" class="w-when"><small>{{ formatDateTime(n.reminder_at) }}</small></span>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'activities'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.activities" class="w-state w-error">{{ errors.activities }}</p>
              <p v-else-if="!myActivities.length" class="w-state w-ok">No activity yet.</p>
              <ul v-else class="w-list">
                <li v-for="a in myActivities.slice(0, 6)" :key="a.id" class="w-row">
                  <div class="w-copy"><strong>{{ activitySentence(a) }}</strong><small>{{ formatDateTime(a.create_time) }}</small></div>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'finance'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.finance" class="w-state w-error">{{ errors.finance }}</p>
              <p v-else-if="!financeAttention.length" class="w-state w-ok">Nothing needs attention.</p>
              <ul v-else class="w-list">
                <li v-for="f in financeAttention.slice(0, 5)" :key="f.key" class="w-row is-high">
                  <div class="w-copy"><strong>{{ f.title }}</strong><small>{{ f.meta }}</small></div>
                  <button type="button" class="w-action" @click="go('finance')">Review</button>
                </li>
              </ul>
              <p v-if="financeTotals" class="w-foot">
                {{ money(financeTotals.totalBalanceCents) }} on hand ·
                {{ money(financeTotals.outstandingDebtCents) }} owed ·
                {{ money(financeTotals.invoiceOutstandingCents) }} to collect
              </p>
            </template>

            <template v-else-if="widget.id === 'approvals'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.approvals" class="w-state w-error">{{ errors.approvals }}</p>
              <p v-else-if="!myApprovals.length" class="w-state w-ok">No approvals waiting on you.</p>
              <ul v-else class="w-list">
                <li v-for="a in myApprovals.slice(0, 6)" :key="a.id" class="w-row is-high">
                  <div class="w-copy"><strong>{{ a.title || 'Untitled approval' }}</strong><small>{{ a.category }} · {{ a.priority }} priority</small></div>
                  <button type="button" class="w-action" @click="go('approvals')">Review</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'internal-requests'">
              <p v-if="store.loading" class="w-state">Loading…</p>
              <p v-else-if="errors.requests" class="w-state w-error">{{ errors.requests }}</p>
              <p v-else-if="!myInternalRequests.length" class="w-state w-ok">No requests for you.</p>
              <ul v-else class="w-list">
                <li v-for="r in myInternalRequests.slice(0, 6)" :key="r.id" class="w-row is-high">
                  <div class="w-copy"><strong>{{ r.title || 'Untitled request' }}</strong><small>{{ r.kind }} · {{ r.status.replace(/_/g, ' ') }}</small></div>
                  <button type="button" class="w-action" @click="go('requests')">Open</button>
                </li>
              </ul>
            </template>

            <template v-else-if="widget.id === 'ai'">
              <p class="w-state">
                <span class="w-dot" :class="{ on: aiSuggestions.length }"></span>
                {{ aiSuggestions.length ? 'Suggestions for your authorized work.' : 'XPass AI is not available yet. Suggestions appear here once it is.' }}
              </p>
              <ul v-if="aiSuggestions.length" class="w-list">
                <li v-for="s in aiSuggestions.slice(0, 4)" :key="s.id" class="w-row">
                  <div class="w-copy"><strong>{{ s.suggestion }}</strong><small>{{ s.context_type }}</small></div>
                  <button v-if="!s.accepted" type="button" class="w-action" @click="acceptSuggestion(s)">Accept</button>
                </li>
              </ul>
            </template>

            <div v-if="widgetMore(widget.id)" class="w-more">
              <button type="button" @click="go(widgetMore(widget.id))">
                {{ $t('crmViewAll') }}
                <Icon icon="fluent:arrow-right-12-regular" width="13" height="13" />
              </button>
            </div>
          </div>
        </section>
      </div>

      <el-drawer
        v-model="customizeOpen"
        title="Customize workspace"
        direction="rtl"
        size="440px"
        :modal="false"
        append-to-body
        class="customize-drawer"
      >
        <div class="cust">
          <div class="cust-section">
            <div class="cust-label">Density</div>
            <div class="cust-density">
              <button :class="{ active: store.density === 'comfortable' }" @click="store.setDraftDensity('comfortable')">Comfortable</button>
              <button :class="{ active: store.density === 'compact' }" @click="store.setDraftDensity('compact')">Compact</button>
            </div>
          </div>

          <div class="cust-section">
            <div class="cust-label">Your widgets</div>
            <ul class="cust-list">
              <li
                v-for="(w, i) in store.draft"
                :key="w.id"
                class="cust-item"
                draggable="true"
                @dragstart="dragIndex = i"
                @dragover.prevent
                @drop="onDrop(i)"
              >
                <span class="cust-grip"><Icon icon="fluent:drag-16-regular" width="14" height="14" /></span>
                <span class="cust-name">{{ widgetTitle(w.id) }}</span>
                <span class="cust-size">
                  <button :class="{ active: w.w === 4 }" @click="store.resizeWidget(w.id, 'sm')">S</button>
                  <button :class="{ active: w.w === 6 }" @click="store.resizeWidget(w.id, 'md')">M</button>
                  <button :class="{ active: w.w === 12 }" @click="store.resizeWidget(w.id, 'lg')">L</button>
                </span>
                <span class="cust-move">
                  <button @click="store.moveWidget(w.id, -1)" :disabled="i === 0"><Icon icon="fluent:arrow-up-12-regular" width="13" height="13" /></button>
                  <button @click="store.moveWidget(w.id, 1)" :disabled="i === store.draft.length - 1"><Icon icon="fluent:arrow-down-12-regular" width="13" height="13" /></button>
                  <button v-if="w.id !== 'attention'" class="cust-remove" @click="store.removeWidget(w.id)"><Icon icon="fluent:dismiss-12-regular" width="13" height="13" /></button>
                </span>
              </li>
            </ul>
            <p v-if="!store.draft.length" class="cust-hint">No widgets yet. Add some below.</p>
          </div>

          <div v-for="cat in catalogGroups" :key="cat.key" class="cust-section">
            <div class="cust-label">{{ cat.label }}</div>
            <div class="cust-lib">
              <button
                v-for="w in cat.items"
                :key="w.id"
                class="cust-add"
                :disabled="store.draft.some(d => d.id === w.id)"
                @click="store.addWidget(w.id)"
              >
                <Icon :icon="w.added ? 'fluent:checkmark-12-regular' : 'fluent:add-12-regular'" width="13" height="13" />
                {{ w.title }}
              </button>
            </div>
          </div>

          <div class="cust-footer">
            <el-button text @click="store.restoreDefault()">Restore default</el-button>
            <div class="cust-footer-right">
              <el-button @click="closeCustomize">Cancel</el-button>
              <el-button @click="store.preview()">Preview</el-button>
              <el-button type="primary" :loading="store.saving" @click="saveCustomize">Save</el-button>
            </div>
          </div>
        </div>
      </el-drawer>
    </main>
  </el-scrollbar>
</template>

<script setup>
import {computed, onMounted, reactive, ref} from 'vue'
import {useRouter} from 'vue-router'
import {Icon} from '@iconify/vue'
import {ElMessage} from 'element-plus'
import {emailList} from '@/request/email.js'
import {mailboxCounts} from '@/request/mailbox.js'
import {useAccountStore} from '@/store/account.js'
import {useUserStore} from '@/store/user.js'
import {useDashboardStore} from '@/store/dashboard.js'
import {useAiStore} from '@/store/ai.js'
import {hasPerm} from '@/perm/perm.js'
import {activitiesList} from '@/request/activities.js'
import {supportList, supportUpdate} from '@/request/support.js'
import {tasksList, tasksUpdate} from '@/request/tasks.js'
import {notificationsList, notificationsMarkRead} from '@/request/notifications.js'
import {calendarList} from '@/request/calendar.js'
import {notesList, notesCreate} from '@/request/notes.js'
import {projectsList} from '@/request/projects.js'
import {aiSuggestionsList, aiAccept} from '@/request/ai.js'
import {financeOverview} from '@/request/finance.js'
import {formatCents} from '@/utils/money.js'
import {approvalList} from '@/request/approvals.js'
import {requestList} from '@/request/requests.js'
import {directoryList} from '@/request/directory.js'

const router = useRouter()
const accountStore = useAccountStore()
const userStore = useUserStore()
const store = useDashboardStore()
const aiStore = useAiStore()

function openAi() {
  aiStore.open({page: 'overview'})
}

const mailLoading = ref(true)
const mailError = ref('')
const recentMessages = ref([])

const myRequests = ref([])
const myTasks = ref([])
const myActivities = ref([])
const myNotifications = ref([])
const myNotes = ref([])
const myEvents = ref([])
const myProjects = ref([])
const financeTotals = ref(null)
const myApprovals = ref([])
const myInternalRequests = ref([])
const mySentRequests = ref([])
const directory = ref([])
const aiSuggestions = ref([])

const errors = reactive({})
const noteDraft = ref('')
const noteSaving = ref(false)
const noteExpand = ref(false)
const noteTitle = ref('')
const notePriority = ref('normal')
const noteReminder = ref('')
const notePinned = ref(false)
const NOTE_PRIORITIES = ['critical', 'high', 'normal', 'low']
const customizeOpen = ref(false)
const customizeMode = ref(false)
const dragIndex = ref(null)

const user = computed(() => userStore.user || {})
const currentAccount = computed(() => accountStore.currentAccount?.accountId
  ? accountStore.currentAccount
  : user.value.account?.accountId ? user.value.account : null)
const firstName = computed(() => {
  const displayName = user.value.name || user.value.email || 'there'
  return displayName.split(/[\s@]/)[0] || 'there'
})
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})
const todayLabel = computed(() => new Intl.DateTimeFormat(undefined, {weekday: 'long', month: 'long', day: 'numeric'}).format(new Date()))

const notificationPreview = computed(() => {
  const seen = new Set()
  const rows = []
  for (const item of myNotifications.value) {
    const key = `${item.link || ''}|${item.title || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(item)
  }
  rows.sort((a, b) => (a.is_read === b.is_read ? 0 : a.is_read ? 1 : -1))
  return rows.slice(0, 5)
})

const WIDGET_MORE = {
  attention: {to: 'approvals', count: () => attentionItems.value.length, limit: 7},
  'my-tasks': {to: 'crm-tasks', count: () => myTasks.value.length, limit: 6},
  'overdue-tasks': {to: 'crm-tasks', count: () => overdueTasks.value.length, limit: 6},
  calendar: {to: 'calendar', count: () => scheduleItems.value.length, limit: 5},
  mail: {to: 'email', count: () => recentMessages.value.length, limit: 5},
  'my-requests': {to: 'requests', count: () => myRequests.value.length, limit: 5},
  approvals: {to: 'approvals', count: () => myApprovals.value.length, limit: 5},
  'internal-requests': {to: 'requests', count: () => myInternalRequests.value.length, limit: 5},
  notes: {to: 'notes', count: () => myNotes.value.length, limit: 5},
  activities: {to: 'crm-activities', count: () => myActivities.value.length, limit: 5},
  projects: {to: 'projects', count: () => myProjects.value.length, limit: 5},
}

function widgetMore(id) {
  const config = WIDGET_MORE[id]
  if (!config) return null
  return config.count() > config.limit ? config.to : null
}

const catalogGroups = computed(() => {
  const labels = {
    work: 'Work & responsibilities',
    communications: 'Communications',
    schedule: 'Schedule & personal',
    activity: 'Relationships & activity',
    business: 'Business',
    intelligence: 'Intelligence'
  }
  const groups = {}
  store.catalog.forEach(w => {
    if (!groups[w.category]) groups[w.category] = []
    groups[w.category].push({...w, added: store.draft.some(d => d.id === w.id)})
  })
  return Object.keys(labels)
    .filter(k => groups[k]?.length)
    .map(k => ({key: k, label: labels[k], items: groups[k]}))
})

function userName(id) { const u = directory.value.find(x => x.user_id === id); return u ? u.name : null }

const money = (cents) => formatCents(cents)

// The finance widget is not an approval queue: the ledger posts directly and
// approval work lives in approvals. What finance actually needs from the
// overview is what is late, overdrawn, or over budget.
const financeAttention = computed(() => {
  const view = financeTotals.value
  if (!view) return []
  const items = []
  ;(view.overBudget || []).forEach(b => {
    items.push({
      key: `fb-${b.id}`, kind: 'finance', kindLabel: 'Finance',
      title: `${b.name} is over budget`,
      meta: `${money(Math.abs(b.variance_cents))} over allocation`,
    })
  })
  ;(view.negativeAccounts || []).forEach(a => {
    items.push({
      key: `fa-${a.id}`, kind: 'finance', kindLabel: 'Finance',
      title: `${a.name} is overdrawn`, meta: money(a.balance_cents),
    })
  })
  ;(view.upcoming || []).forEach((u, index) => {
    if (u.days > 7) return
    items.push({
      key: `fu-${u.kind}-${u.id}-${index}`, kind: 'finance', kindLabel: 'Finance',
      title: u.days < 0 ? `${u.label} is overdue` : `${u.label} is due soon`,
      meta: u.days < 0 ? `${Math.abs(u.days)} days overdue · ${money(u.amount_cents)}` : `${money(u.amount_cents)}`,
    })
  })
  return items
})

const attentionItems = computed(() => {
  const now = Date.now()
  const items = []
  myRequests.value.forEach(r => {
    if (['closed', 'resolved', 'declined'].includes(r.status)) return
    items.push({
      key: `req-${r.id}`, kind: 'request', kindLabel: 'Support', title: r.title || 'Untitled request',
      meta: `${r.priority} priority`, priority: ['high', 'urgent'].includes(r.priority) ? 'high' : 'normal',
      overdue: false, actionLabel: 'Review', ref: r
    })
  })
  myTasks.value.forEach(t => {
    if (['completed', 'done', 'cancelled'].includes(t.status)) return
    const overdue = t.due_at ? new Date(t.due_at).getTime() < now : false
    items.push({
      key: `task-${t.id}`, kind: 'task', kindLabel: 'Task', title: t.title || 'Untitled task',
      meta: t.due_at ? `Due ${formatDate(t.due_at)}` : 'No deadline',
      priority: overdue || ['high', 'urgent'].includes(t.priority) ? 'high' : 'normal',
      overdue, actionLabel: 'Done', ref: t
    })
  })
  myNotifications.value.forEach(n => {
    if (n.is_read) return
    items.push({
      key: `notif-${n.id}`, kind: 'notification', kindLabel: 'Notice', title: n.title || 'Notification',
      meta: n.body || n.type || '', priority: 'normal', overdue: false, actionLabel: 'Read', ref: n
    })
  })
  financeAttention.value.forEach(f => {
    items.push({
      key: f.key, kind: 'finance', kindLabel: 'Finance', title: f.title,
      meta: f.meta, priority: 'high', overdue: false, actionLabel: 'Review', ref: f
    })
  })
  myApprovals.value.forEach(a => {
    if (a.status !== 'pending') return
    items.push({
      key: `ap-${a.id}`, kind: 'approval', kindLabel: 'Approval', title: a.title || 'Untitled approval',
      meta: `${a.category} · ${a.priority} priority`, priority: ['critical', 'high'].includes(a.priority) ? 'high' : 'normal',
      overdue: false, actionLabel: 'Review', ref: a
    })
  })
  myInternalRequests.value.forEach(r => {
    if (!['pending', 'pending_approval', 'accepted', 'in_progress'].includes(r.status)) return
    const from = userName(r.sender_id)
    items.push({
      key: `ir-${r.id}`, kind: 'internal-request', kindLabel: 'For you', title: r.title || 'Untitled request',
      meta: `${from ? 'From ' + from + ' · ' : ''}${r.kind} · ${r.status.replace(/_/g, ' ')}`,
      priority: ['critical', 'high'].includes(r.priority) ? 'high' : 'normal',
      overdue: false, actionLabel: 'Review', ref: r
    })
  })
  mySentRequests.value.forEach(r => {
    const to = userName(r.recipient_id)
    items.push({
      key: `irs-${r.id}`, kind: 'internal-request', kindLabel: 'Sent', title: r.title || 'Untitled request',
      meta: `${to ? 'To ' + to + ' · ' : ''}${r.status.replace(/_/g, ' ')}`,
      priority: 'normal', overdue: false, actionLabel: 'Open', ref: r
    })
  })
  return items.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    const rank = {high: 0, normal: 1}
    return (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1)
  })
})

const attentionError = computed(() => errors.support || errors.tasks || errors.notifications || errors.finance || errors.approvals || errors.requests || '')

const overdueTasks = computed(() => {
  const now = Date.now()
  return myTasks.value.filter(t => t.due_at && new Date(t.due_at).getTime() < now && !['completed', 'done', 'cancelled'].includes(t.status))
})

function startOfTodayISO() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
}

const scheduleItems = computed(() => {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return [...myEvents.value]
    .filter(e => e.start_time && new Date(e.start_time).getTime() >= startOfToday)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
})

const scheduleGroups = computed(() => {
  const now = new Date()
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(sod.getFullYear(), sod.getMonth(), sod.getDate() + 1)
  const dayAfter = new Date(sod.getFullYear(), sod.getMonth(), sod.getDate() + 2)
  const groups = [
    { key: 'today', label: 'Today', items: [] },
    { key: 'tomorrow', label: 'Tomorrow', items: [] },
    { key: 'upcoming', label: 'Upcoming', items: [] }
  ]
  for (const ev of scheduleItems.value) {
    const t = new Date(ev.start_time).getTime()
    if (t < tomorrow.getTime()) groups[0].items.push(ev)
    else if (t < dayAfter.getTime()) groups[1].items.push(ev)
    else groups[2].items.push(ev)
  }
  return groups.filter(g => g.items.length)
})

const widgetTitles = {
  attention: 'Needs your attention',
  'my-tasks': 'My tasks',
  'overdue-tasks': 'Overdue tasks',
  'my-requests': 'My requests',
  approvals: 'Pending approvals',
  'internal-requests': 'Internal requests',
  projects: 'Project milestones',
  mail: 'Unread emails',
  notifications: 'Internal notifications',
  calendar: 'My schedule',
  notes: 'Personal notes',
  activities: 'My activity',
  finance: 'Finance attention',
  ai: 'XPass AI'
}

function widgetTitle(id) {
  return widgetTitles[id] || id
}

async function loadMail() {
  mailLoading.value = true
  mailError.value = ''
  if (!currentAccount.value) {
    recentMessages.value = []
    mailLoading.value = false
    return
  }
  try {
    const [, messages] = await Promise.all([
      mailboxCounts(),
      emailList(currentAccount.value.accountId, currentAccount.value.allReceive ?? 0, 0, 0, 5, 0, 0, {folderKey: 'inbox'})
    ])
    recentMessages.value = messages.list || []
  } catch (error) {
    console.error('Overview mail load failed:', error)
    mailError.value = 'Mailbox unavailable.'
  } finally {
    mailLoading.value = false
  }
}

async function loadSource(key, fn) {
  try {
    await fn()
    delete errors[key]
  } catch (error) {
    console.error(`Overview ${key} load failed:`, error)
    errors[key] = 'Could not load.'
  }
}

async function loadWorkspace() {
  // The old overview opened every widget request at once. Each is protected
  // and performs its own data work, so that stampede delayed first paint and
  // made the Worker compete with itself. Load the information people need to
  // act on first, then hydrate the remaining cards in a small queue.
  const first = []
  const later = []
  if (hasPerm('calendar:query')) first.push(() => loadSource('calendar', async () => { const r = await calendarList({page: 1, pageSize: 12, from: startOfTodayISO()}); myEvents.value = r.list || [] }))
  if (hasPerm('notifications:query')) first.push(() => loadSource('notifications', async () => { const r = await notificationsList({page: 1, pageSize: 8}); myNotifications.value = r.list || [] }))
  if (hasPerm('requests:query')) first.push(() => loadSource('requests', async () => {
    const [recv, sent, dir] = await Promise.all([
      requestList({scope: 'received', pageSize: 12}),
      requestList({scope: 'sent', pageSize: 12}),
      directoryList().catch(() => ({list: []}))
    ])
    myInternalRequests.value = recv.list || []
    mySentRequests.value = sent.list || []
    directory.value = dir.list || []
  }))
  if (hasPerm('support:query')) later.push(() => loadSource('support', async () => { const r = await supportList({page: 1, pageSize: 8}); myRequests.value = r.list || [] }))
  if (hasPerm('tasks:query')) later.push(() => loadSource('tasks', async () => { const r = await tasksList({page: 1, pageSize: 12}); myTasks.value = r.list || [] }))
  if (hasPerm('activities:query')) later.push(() => loadSource('activities', async () => { const r = await activitiesList({page: 1, pageSize: 8}); myActivities.value = r.list || [] }))
  if (hasPerm('notes:query')) later.push(() => loadSource('notes', async () => { const r = await notesList({page: 1, pageSize: 6}); myNotes.value = r.list || [] }))
  if (hasPerm('projects:query')) later.push(() => loadSource('projects', async () => { const r = await projectsList({page: 1, pageSize: 6}); myProjects.value = r.list || [] }))
  if (hasPerm('finance:view')) later.push(() => loadSource('finance', async () => { financeTotals.value = await financeOverview({ period: 'month' }) }))
  if (hasPerm('approvals:query')) later.push(() => loadSource('approvals', async () => { const r = await approvalList({scope: 'inbox', status: 'pending', pageSize: 8}); myApprovals.value = r.list || [] }))
  if (hasPerm('ai:use')) later.push(() => loadSource('ai', async () => { const r = await aiSuggestionsList(); aiSuggestions.value = r.list || [] }))

  await Promise.all(first.map(run => run()))
  // Limit background work to two requests at a time. The cards still hydrate
  // automatically, but the core workspace is usable before optional widgets
  // begin competing for a cold Worker and D1 connection.
  const drain = async () => {
    const pending = [...later]
    const worker = async () => { while (pending.length) await pending.shift()() }
    await Promise.all([worker(), worker()])
  }
  if (later.length) window.setTimeout(() => { drain().catch(() => {}) }, 0)
}

function go(name, query) {
  router.push({ name, ...(query ? { query } : {}) }).catch(() => {})
}

function openEvent(ev) {
  router.push({ name: 'calendar', query: { event: ev.id } }).catch(() => {})
}

function openMail() {
    router.push({name: 'email'})
    }
function activitySentence(a) {
  const type = a.activity_type || 'activity'
  return a.subject || `${type}: ${a.entity_type || ''}`
}

async function runAction(item) {
  try {
    if (item.kind === 'request') {
      await supportUpdate(item.ref.id, {...item.ref, status: 'resolved'})
      myRequests.value = myRequests.value.filter(r => r.id !== item.ref.id)
      ElMessage({message: 'Request resolved.', type: 'success', plain: true})
    } else if (item.kind === 'task') {
      await completeTask(item.ref)
    } else if (item.kind === 'notification') {
      await markRead(item.ref)
    } else {
      const targets = {finance: 'finance', approval: 'approvals', 'internal-request': 'requests'}
      go(targets[item.kind] || 'support')
    }
  } catch (error) {
    ElMessage({message: error?.message || 'Action failed.', type: 'error', plain: true})
  }
}

async function completeTask(t) {
  try {
    await tasksUpdate(t.id, {...t, status: 'completed'})
    myTasks.value = myTasks.value.map(x => x.id === t.id ? {...x, status: 'completed'} : x)
    ElMessage({message: 'Task completed.', type: 'success', plain: true})
  } catch (error) {
    ElMessage({message: error?.message || 'Could not update task.', type: 'error', plain: true})
  }
}

async function markRead(n) {
  try {
    await notificationsMarkRead(n.id)
    n.is_read = 1
  } catch (error) {
    ElMessage({message: error?.message || 'Could not mark as read.', type: 'error', plain: true})
  }
}

async function quickCapture() {
  const text = noteDraft.value.trim()
  if (!text) return
  noteSaving.value = true
  try {
    await notesCreate({
      title: noteTitle.value.trim() || text.split('\n')[0].slice(0, 60),
      content: text,
      priority: notePriority.value,
      reminder_at: noteReminder.value || null,
      is_pinned: notePinned.value ? 1 : 0
    })
    noteDraft.value = ''
    noteTitle.value = ''
    notePriority.value = 'normal'
    noteReminder.value = ''
    notePinned.value = false
    await loadSource('notes', async () => { const r = await notesList({page: 1, pageSize: 6}); myNotes.value = r.list || [] })
    ElMessage({message: 'Note saved.', type: 'success', plain: true})
  } catch (error) {
    ElMessage({message: error?.message || 'Could not save note.', type: 'error', plain: true})
  } finally {
    noteSaving.value = false
  }
}

async function acceptSuggestion(s) {
  try {
    await aiAccept(s.id)
    s.accepted = 1
  } catch (error) {
    ElMessage({message: error?.message || 'Could not accept.', type: 'error', plain: true})
  }
}

function senderInitial(name) {
  return String(name || 'X').trim()[0]?.toUpperCase() || 'X'
}

function toDate(value) {
  const d = new Date(`${value}${/Z|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'}`)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDate(value) {
  const d = toDate(value)
  return d ? new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric'}).format(d) : ''
}

function formatDay(value) {
    return formatDate(value)
    }

    function calendarLabel(ev) {
    const visibility = String(ev.visibility || '')
    const source = String(ev.source || '')
    if (visibility === 'private') return 'Private'
    if (visibility === 'selected') return 'Invited guests'
    if (visibility === 'team') return 'Team calendar'
    if (visibility === 'company') return 'Company calendar'
    if (source) return source.charAt(0).toUpperCase() + source.slice(1)
    return 'Personal'
    }

function formatTime(value) {
  const d = toDate(value)
  return d ? new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'}).format(d) : ''
}

function formatDateTime(value) {
  const d = toDate(value)
  return d ? new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}).format(d) : ''
}

function openCustomize() {
  store.startCustomize()
  customizeMode.value = true
  customizeOpen.value = true
}

function closeCustomize() {
  store.cancel()
  customizeMode.value = false
  customizeOpen.value = false
}

async function saveCustomize() {
  await store.save()
  customizeMode.value = false
  customizeOpen.value = false
  ElMessage({message: 'Workspace saved.', type: 'success', plain: true})
}

function nudge(id, dir) {
  store.moveWidget(id, dir)
  store.preview()
}

function onDrop(to) {
  if (dragIndex.value === null || dragIndex.value === to) return
  const arr = [...store.draft]
  const [item] = arr.splice(dragIndex.value, 1)
  arr.splice(to, 0, item)
  store.draft = arr
  dragIndex.value = null
}

onMounted(() => {
  loadMail()
  loadWorkspace()
  store.load().catch(() => {
    errors.dashboard = 'Could not load your dashboard layout.'
  })
})
</script>

<style scoped>
.overview-scroll {
  height: 100%;
  background: var(--hq-page);
}

.hq-overview {
  width: 100%;
  min-height: 100%;
  padding: 24px clamp(18px, 2.4vw, 34px) 44px;
  color: var(--hq-text);
}

.po-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 20px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--hq-border);
}

.po-eyebrow {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.po-eyebrow span {
  margin: 0 5px;
  color: var(--hq-border-strong);
}

.po-title {
  margin: 6px 0 4px;
  font-family: var(--hq-font-heading);
  font-size: clamp(26px, 2.4vw, 32px);
  font-weight: 680;
  letter-spacing: -.035em;
  line-height: 1.15;
}

.po-subtitle {
  margin: 0;
  color: var(--hq-text-secondary);
  font-size: 14px;
}

.po-head-side {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.po-head-side :deep(.el-button) {
  min-height: 38px;
  margin: 0;
  border-radius: 8px;
  font-weight: 550;
}

.ai-entry {
  background: transparent;
}

.onboard-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding: 14px 18px;
  border: 1px solid var(--hq-border);
  border-radius: 12px;
  background: var(--hq-surface);
}

.onboard-copy strong {
  font-size: 14px;
  font-weight: 650;
}

.onboard-copy p {
  margin: 3px 0 0;
  color: var(--hq-text-secondary);
  font-size: 13px;
}

.onboard-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}

.widget {
  grid-column: span 6;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--hq-border);
  border-radius: 14px;
  background: var(--hq-surface);
}

.span-3 { grid-column: span 3; }
.span-4 { grid-column: span 4; }
.span-6 { grid-column: span 6; }
.span-12 { grid-column: span 12; }

.widget-body {
  flex: 1 1 auto;
  min-height: 0;
}

.h-2 .widget-body { min-height: 0; }
.h-3 .widget-body { min-height: 0; }
.h-4 .widget-body { min-height: 0; }

.widget-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.widget-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -.01em;
}

.widget-tools {
  display: flex;
  gap: 2px;
}

.icon-btn {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-muted);
  cursor: pointer;
}

.icon-btn:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.w-state {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--hq-muted);
  font-size: 13px;
}

.w-ok { color: var(--hq-text-secondary); }

.w-foot {
  margin: 8px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--hq-border);
  color: var(--hq-muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.widget-body > .w-state:only-child {
  flex: 1 1 auto;
  min-height: 84px;
  justify-content: center;
  padding: 10px 12px;
  border: 1px dashed var(--hq-border);
  border-radius: 10px;
  text-align: center;
}

.w-more {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--hq-border);
}

.w-more button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
}

.w-more button:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.sched { display: flex; flex-direction: column; gap: 12px; }
.sched-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--hq-muted); margin-bottom: 4px; }
.w-row.is-clickable { cursor: pointer; border-radius: 6px; }
.w-row.is-clickable:hover { background: var(--hq-hover); }
.w-error { color: var(--hq-danger); }

.w-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.w-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 8px;
}

.w-row:hover { background: var(--hq-hover); }
.w-row.is-high { background: color-mix(in srgb, var(--hq-accent) 6%, transparent); }
.w-row.unread strong { font-weight: 700; }

.w-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: .03em;
  text-transform: uppercase;
}

.k-request { background: var(--hq-selected); color: var(--hq-accent-strong); }
.k-finance { background: color-mix(in srgb, var(--hq-danger) 14%, transparent); color: var(--hq-danger); }
.k-pin { background: var(--hq-selected); color: var(--hq-accent-strong); }
.s-completed, .s-done { background: color-mix(in srgb, #2e9e5b 16%, transparent); color: #2e9e5b; }
.s-in_progress, .s-pending { background: var(--hq-selected); color: var(--hq-accent-strong); }

.w-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.w-copy strong,
.w-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.w-copy strong { font-size: 13px; font-weight: 600; }
.w-copy small { color: var(--hq-muted); font-size: 11px; }

.w-when {
  display: grid;
  flex: 0 0 auto;
  min-width: 58px;
  gap: 1px;
}

.w-when strong { font-size: 12px; font-weight: 650; }
.w-when small { color: var(--hq-muted); font-size: 10px; }

.w-action {
  flex: 0 0 auto;
  padding: 4px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--hq-accent-strong);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.w-action:hover { background: var(--hq-selected); }

.w-inline {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--hq-accent-strong);
  font-weight: 600;
  cursor: pointer;
}

.w-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--hq-border);
  border-radius: 50%;
  background: var(--hq-page);
  color: var(--hq-text-secondary);
  font-size: 11px;
  font-weight: 650;
}

.w-capture {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 10px;
}

.w-capture :deep(.el-textarea) { flex: 1; }

.w-capture-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.w-note-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }

.w-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--hq-muted);
}

.w-dot.on { background: var(--hq-accent); }

/* Density */
.density-compact .widget-grid { gap: 10px; }
.density-compact .widget { padding: 12px 14px; }
.density-compact .widget-body { min-height: 0; }
.density-compact .w-row { padding: 5px 4px; }
.density-compact .widget-head { margin-bottom: 8px; }

/* Customize drawer */
.cust { display: grid; gap: 18px; }
.cust-section { display: grid; gap: 8px; }
.cust-label {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.cust-density { display: flex; gap: 6px; }
.cust-density button {
  flex: 1;
  padding: 8px;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--hq-surface);
  color: var(--hq-text-secondary);
  font-size: 13px;
  cursor: pointer;
}
.cust-density button.active { border-color: var(--hq-accent); color: var(--hq-accent-strong); }

.cust-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.cust-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--hq-surface);
}
.cust-grip { color: var(--hq-muted); cursor: grab; }
.cust-name { flex: 1; font-size: 13px; font-weight: 550; }
.cust-size { display: flex; gap: 2px; }
.cust-size button {
  width: 24px;
  height: 22px;
  border: 1px solid var(--hq-border);
  border-radius: 5px;
  background: transparent;
  color: var(--hq-muted);
  font-size: 11px;
  cursor: pointer;
}
.cust-size button.active { border-color: var(--hq-accent); color: var(--hq-accent-strong); }
.cust-move { display: flex; gap: 2px; }
.cust-move button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--hq-text-secondary);
  cursor: pointer;
}
.cust-move button:disabled { opacity: .35; cursor: not-allowed; }
.cust-move button:hover:not(:disabled) { background: var(--hq-hover); }
.cust-remove { color: var(--hq-danger) !important; }

.cust-hint { margin: 0; color: var(--hq-muted); font-size: 12px; }

.cust-lib { display: flex; flex-wrap: wrap; gap: 6px; }
.cust-add {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--hq-surface);
  color: var(--hq-text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.cust-add:hover:not(:disabled) { border-color: var(--hq-accent); color: var(--hq-accent-strong); }
.cust-add:disabled { opacity: .45; cursor: default; }

.cust-footer {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--hq-border);
  background: var(--el-bg-color);
}
.cust-footer-right { display: flex; gap: 6px; }

@media (max-width: 900px) {
  .po-header { flex-direction: column; }
  .widget, .span-3, .span-4, .span-6, .span-12 { grid-column: span 12; }
}

@media (max-width: 560px) {
  .hq-overview { padding: 18px 14px 32px; }
  .po-head-side { width: 100%; }
  .po-head-side :deep(.el-button) { flex: 1; }
}
</style>
