<template>
  <div class="si-workspace">
    <section class="si-list" aria-label="Shared inbox conversation list">
      <header class="si-heading">
        <div class="si-title">
          <div class="eyebrow">SHARED INBOX</div>
          <h1>{{ mailboxLabel }}</h1>
          <div class="si-subtitle">
            <span>{{ mailboxAddress }}</span>
            <span v-if="total" class="si-dot">·</span>
            <span v-if="total">{{ total }} conversation{{ total === 1 ? '' : 's' }}</span>
            <span v-if="counts && counts.urgent" class="si-urgent">{{ counts.urgent }} urgent</span>
          </div>
        </div>
        <div class="si-heading-actions">
          <button type="button" class="si-icon-btn" title="Refresh" aria-label="Refresh" @click="reload">
            <Icon icon="fluent:arrow-clockwise-20-regular" width="15" height="15" />
          </button>
        </div>
      </header>

      <div class="si-filters" role="tablist" aria-label="Filter conversations">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="si-chip"
          :class="{ 'is-on': status === tab.key }"
          role="tab"
          :aria-selected="status === tab.key"
          @click="setStatus(tab.key)"
        >
          <span>{{ tab.label }}</span>
          <span v-if="tabCount(tab.key)" class="si-chip-count">{{ badge(tabCount(tab.key)) }}</span>
        </button>
      </div>

      <div ref="listEl" class="si-items" @scroll="onScroll">
        <button
          v-for="row in list"
          :key="row.conversation_id"
          type="button"
          class="si-item"
          :class="{ 'is-active': selectedId === row.email_id, 'is-unread': Number(row.unread) === 0 }"
          :aria-current="selectedId === row.email_id ? 'true' : undefined"
          @click="select(row)"
        >
          <span class="si-avatar" :class="avatarTone(row)">{{ initials(row) }}</span>
          <span class="si-item-main">
            <span class="si-item-top">
              <span class="si-sender">{{ senderLabel(row) }}</span>
              <span class="si-time">{{ timeAgo(row.create_time) }}</span>
            </span>
            <span class="si-subject">{{ row.subject || '(no subject)' }}</span>
            <span class="si-snippet">{{ snippet(row) }}</span>
            <span class="si-meta">
              <span class="si-inbox-tag" :title="inboxSourceLabel(row)">
                <Icon icon="fluent:mail-20-regular" width="11" height="11" />{{ inboxSourceLabel(row) }}
              </span>
              <span class="si-status" :class="`is-${row.status}`">{{ statusLabel(row.status) }}</span>
              <span v-if="row.priority === 'urgent'" class="si-flag is-urgent">Urgent</span>
              <span v-else-if="row.priority === 'high'" class="si-flag is-high">High</span>
              <span v-if="row.assigned_to" class="si-assignee">{{ row.assignee_label }}</span>
              <span v-else class="si-assignee is-empty">Unassigned</span>
              <span v-if="row.message_count > 1" class="si-count">{{ row.message_count }}</span>
            </span>
          </span>
        </button>

        <div v-if="!list.length && !loading" class="si-empty">
          <Icon icon="fluent:inbox-20-regular" width="24" height="24" />
          <p class="si-empty-title">Nothing here</p>
          <p class="si-empty-hint">
            {{ status === 'resolved' ? 'Resolved conversations will appear here.' : 'No conversation matches this filter.' }}
          </p>
        </div>

        <button v-if="hasMore" type="button" class="si-more" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </section>

    <section class="si-detail" aria-label="Conversation">
      <template v-if="detail">
        <header class="si-detail-head">
          <div class="si-detail-title">
            <h2>{{ detail.email.subject || '(no subject)' }}</h2>
            <div class="si-detail-sub">
              <span class="si-status" :class="`is-${detail.conversation.status}`">{{ statusLabel(detail.conversation.status) }}</span>
              <span v-if="detail.conversation.priority === 'urgent'" class="si-flag is-urgent">Urgent</span>
              <span class="si-detail-from">from {{ detailMailboxLabel }}</span>
            </div>
          </div>
          <button type="button" class="si-icon-btn" title="Close" aria-label="Close" @click="closeDetail">
            <Icon icon="fluent:dismiss-20-regular" width="15" height="15" />
          </button>
        </header>

        <div v-if="can('assign') || can('reassign')" class="si-bar">
          <label class="si-field">
            <span class="si-field-label">Assignee</span>
            <select class="si-select" :value="detail.conversation.assigned_to || ''" @change="onAssign">
              <option value="">Unassigned</option>
              <option v-for="person in assignees" :key="person.user_id" :value="person.user_id">
                {{ person.display_name || person.email }}
              </option>
            </select>
          </label>

          <label v-if="can('resolve')" class="si-field">
            <span class="si-field-label">Status</span>
            <select class="si-select" :value="detail.conversation.status" @change="onStatus">
              <option v-for="option in statusOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>

          <label v-if="can('resolve')" class="si-field">
            <span class="si-field-label">Priority</span>
            <select class="si-select" :value="detail.conversation.priority" @change="onPriority">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>

          <div v-if="can('manage_tags')" class="si-field si-tags">
            <span class="si-field-label">Tags</span>
            <div class="si-tag-row">
              <button
                v-for="tag in allTags"
                :key="tag.id"
                type="button"
                class="si-tag"
                :class="{ 'is-on': hasTag(tag.id) }"
                :aria-pressed="hasTag(tag.id)"
                @click="toggleTag(tag)"
              >{{ tag.name }}</button>
              <button v-if="!allTags.length" type="button" class="si-tag is-empty" disabled>No tags yet</button>
            </div>
          </div>

          <div v-if="detail.conversation.related_id" class="si-field">
            <span class="si-field-label">Linked request</span>
            <span class="si-link">#{{ detail.conversation.related_id }}</span>
          </div>
        </div>

        <div class="si-thread">
          <article
            v-for="msg in detail.messages"
            :key="msg.email_id"
            class="si-msg"
            :class="Number(msg.type) === 1 ? 'is-out' : 'is-in'"
          >
            <div class="si-msg-head">
              <span class="si-msg-who">
                {{ Number(msg.type) === 1 ? mailboxAddress : (msg.send_email || 'Customer') }}
              </span>
              <span class="si-msg-time">{{ timeAgo(msg.create_time) }}</span>
            </div>
            <div class="si-msg-body" v-html="renderBody(msg)" />
          </article>
        </div>

        <details v-if="detail.events.length" class="si-timeline">
          <summary>Activity ({{ detail.events.length }})</summary>
          <ol>
            <li v-for="event in detail.events" :key="event.id">
              <span class="si-ev-action">{{ eventLabel(event.action) }}</span>
              <span class="si-ev-actor">{{ event.actor_label }}</span>
              <span v-if="event.note" class="si-ev-note">{{ event.note }}</span>
              <span class="si-ev-time">{{ timeAgo(event.create_time) }}</span>
            </li>
          </ol>
        </details>

        <div v-if="detail.conversation.status === 'resolved'" class="si-resolved-note">
          <Icon icon="fluent:checkmark-circle-20-regular" width="15" height="15" />
          This conversation is resolved. A new customer reply will reopen it.
        </div>

        <div v-if="composerEnabled" class="si-composer">
          <div class="si-compose-tabs" role="tablist" aria-label="Compose mode">
            <button
              v-if="can('reply') || can('send')"
              type="button"
              class="si-compose-tab"
              :class="{ 'is-on': mode === 'reply' }"
              role="tab"
              :aria-selected="mode === 'reply'"
              @click="mode = 'reply'"
            >
              <Icon icon="cil:send" width="14" height="14" />
              Reply to customer
            </button>
            <button
              v-if="can('internal_note')"
              type="button"
              class="si-compose-tab"
              :class="{ 'is-on': mode === 'note' }"
              role="tab"
              :aria-selected="mode === 'note'"
              @click="mode = 'note'"
            >
              <Icon icon="fluent:note-edit-20-regular" width="14" height="14" />
              Internal note
            </button>
          </div>

          <p v-if="mode === 'note'" class="si-note-warning">
            <Icon icon="fluent:lock-closed-20-regular" width="13" height="13" />
            Only XPass Team can see internal notes. This is never sent to the customer.
          </p>

          <textarea
            v-model="body"
            class="si-textarea"
            :class="{ 'is-note': mode === 'note' }"
            rows="4"
            :placeholder="mode === 'note' ? 'Add a note for the team…' : 'Write your reply…'"
          />

          <div class="si-compose-foot">
            <span class="si-compose-hint">
              <template v-if="mode === 'reply'">Sending as {{ mailboxAddress }}</template>
              <template v-else>Internal only</template>
            </span>
            <button
              type="button"
              class="si-send"
              :class="{ 'is-note': mode === 'note' }"
              :disabled="!body.trim() || sending"
              @click="submit"
            >
              {{ sending ? 'Sending…' : (mode === 'note' ? 'Add note' : 'Send reply') }}
            </button>
          </div>
        </div>
      </template>

      <div v-else class="si-reader-empty">
        <span class="si-reader-icon"><Icon icon="fluent:chat-multiple-20-regular" width="24" height="24" /></span>
        <p class="si-reader-title">No conversation selected</p>
        <p class="si-reader-hint">Pick a conversation to see the thread, its owner and its history.</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { useMailboxStore } from '@/store/mailbox.js'
import {
  sharedMailboxConversation,
  sharedMailboxConversationAction,
  sharedMailboxConversations,
  sharedMailboxAddNote,
  sharedMailboxAssignees,
  sharedMailboxTags,
} from '@/request/shared-mailbox.js'
import { emailSend } from '@/request/email.js'

defineOptions({ name: 'mail-shared-inbox' })

const route = useRoute()
const router = useRouter()
const mailboxStore = useMailboxStore()

const PAGE_SIZE = 30

const list = ref([])
const total = ref(0)
const page = ref(1)
const status = ref('open')
const loading = ref(false)
const loadingMore = ref(false)
const listEl = ref(null)
const selectedId = ref(null)
const detail = ref(null)
const assignees = ref([])
const allTags = ref([])
const body = ref('')
const mode = ref('reply')
const sending = ref(false)

const mailboxId = computed(() => Number(route.params.mailboxId))

const tabs = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting_customer', label: 'Waiting for customer' },
  { key: 'waiting_internal', label: 'Waiting internally' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'resolved', label: 'Resolved' },
]

const statusOptions = [
  { value: 'new', label: 'New' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_customer', label: 'Waiting for customer' },
  { value: 'waiting_internal', label: 'Waiting internally' },
  { value: 'resolved', label: 'Resolved' },
]

const statusLabels = {
  new: 'New',
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  waiting_customer: 'Waiting for customer',
  waiting_internal: 'Waiting internally',
  resolved: 'Resolved',
}

const eventLabels = {
  received: 'Message received',
  replied: 'Replied',
  reply_received: 'Customer replied',
  assigned: 'Assigned',
  transferred: 'Transferred',
  priority: 'Priority changed',
  status: 'Status changed',
  note: 'Internal note added',
  tag_added: 'Tag added',
  tag_removed: 'Tag removed',
  link_request: 'Linked to request',
  sent: 'Message sent',
}

const mailbox = computed(() => mailboxStore.mailboxById(mailboxId.value))
const mailboxLabel = computed(() => mailboxId.value === 0 ? 'All shared inboxes' : (mailbox.value?.display_name || mailbox.value?.email || 'Shared inbox'))
const mailboxAddress = computed(() => mailboxId.value === 0 ? 'Every shared inbox you can access' : (mailbox.value?.email || ''))
const detailMailboxLabel = computed(() => {
  const email = detail.value?.email || {}
  const title = email.mailbox_display_name || email.mailbox_email || 'Shared inbox'
  return email.mailbox_email && title !== email.mailbox_email ? `${title} · ${email.mailbox_email}` : title
})

// The inbox a conversation arrived at. In a single-mailbox view every row shares
// the current address; the helper still resolves per row so the label stays
// correct if the queue ever spans more than one mailbox.
function inboxLabel(row) {
  const id = Number(row?.account_id)
  if (id) {
    const box = mailboxStore.mailboxById(id)
    if (box?.email) return box.email
  }
  return mailboxAddress.value
}

function inboxSourceLabel(row) {
  const id = Number(row?.account_id)
  const box = id ? mailboxStore.mailboxById(id) : mailbox.value
  if (!box) return mailboxAddress.value
  const title = box.display_name || 'Shared inbox'
  return `${title} · ${box.email || 'address unavailable'}`
}

const counts = computed(() => mailboxStore.countsFor(mailboxId.value))
const hasMore = computed(() => list.value.length < total.value)
const composerEnabled = computed(() => Boolean(detail.value) && (can('reply') || can('send') || can('internal_note')))

function statusLabel(value) {
  return statusLabels[value] || value
}

function eventLabel(value) {
  return eventLabels[value] || value
}

function can(action) {
  const actions = detail.value?.actions || []
  return actions.includes(action)
}

function hasTag(tagId) {
  return (detail.value?.tags || []).some(tag => Number(tag.id) === Number(tagId))
}

function badge(value) {
  const count = Number(value) || 0
  return count > 99 ? '99+' : count
}

function initials(row) {
  const source = row.sender_name || row.send_email || '?'
  const parts = String(source).trim().split(/[\s@._-]+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map(part => part[0].toUpperCase()).join('')
}

function avatarTone(row) {
  const seed = String(row.send_email || row.subject || '')
  let sum = 0
  for (const ch of seed) sum += ch.charCodeAt(0)
  return `tone-${sum % 4}`
}

function senderLabel(row) {
  return row.sender_name || row.send_email || 'Unknown sender'
}

function snippet(row) {
  const text = String(row.snippet || row.text || '').replace(/\s+/g, ' ').trim()
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}

function renderBody(msg) {
  const html = msg.content || msg.html || ''
  if (html) return html
  const text = String(msg.text || '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))
  return `<p>${text.replace(/\n/g, '<br>')}</p>`
}

function timeAgo(value) {
  if (!value) return ''
  const then = new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z')).getTime()
  if (Number.isNaN(then)) return String(value)
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(then).toLocaleDateString()
}

function tabParams() {
  const params = { mailboxId: mailboxId.value === 0 ? 'all' : mailboxId.value, page: 1, pageSize: PAGE_SIZE }
  if (status.value === 'open') {
    // Open is "everything not resolved", which is a server-side exclusion.
    params.excludeStatus = 'resolved'
  } else if (status.value === 'mine') {
    params.assignedToMe = 1
  } else if (status.value === 'urgent') {
    params.priority = 'urgent'
    params.excludeStatus = 'resolved'
  } else {
    params.status = status.value
  }
  return params
}

async function load(reset = true) {
  if (loading.value) return
  loading.value = true
  try {
    const params = tabParams()
    if (!reset) params.page = page.value
    const res = await sharedMailboxConversations(params)
    const rows = res?.list || []
    total.value = Number(res?.total) || 0
    if (reset) {
      list.value = rows
    } else {
      list.value = list.value.concat(rows)
    }
    if (reset && rows.length && !selectedId.value) {
      select(rows[0])
    } else if (reset && !rows.length) {
      closeDetail()
    }
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load conversations.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load(true)
  mailboxStore.loadSummary(true)
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  page.value += 1
  try {
    const params = tabParams()
    params.page = page.value
    const res = await sharedMailboxConversations(params)
    list.value = list.value.concat(res?.list || [])
    total.value = Number(res?.total) || total.value
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load more.', type: 'error', plain: true })
    page.value -= 1
  } finally {
    loadingMore.value = false
  }
}

function onScroll(event) {
  const el = event.target
  if (el.scrollHeight - el.scrollTop - el.clientHeight > 120) return
  if (hasMore.value) loadMore()
}

function setStatus(key) {
  if (status.value === key) return
  status.value = key
  selectedId.value = null
  closeDetail()
  reload()
}

function select(row) {
  selectedId.value = row.email_id
  openDetail(row.email_id)
}

async function openDetail(emailId) {
  try {
    const res = await sharedMailboxConversation(emailId)
    detail.value = res
    const sourceMailboxId = Number(res?.email?.account_id)
    if (sourceMailboxId) {
      sharedMailboxAssignees(sourceMailboxId)
        .then(rows => { assignees.value = rows || [] })
        .catch(() => { assignees.value = [] })
    } else {
      assignees.value = []
    }
    body.value = ''
    mode.value = 'reply'
  } catch (error) {
    ElMessage({ message: error.message || 'Could not open this conversation.', type: 'error', plain: true })
    detail.value = null
  }
}

function closeDetail() {
  detail.value = null
  selectedId.value = null
  body.value = ''
}

async function afterChange(message) {
  await openDetail(selectedId.value)
  await load(true)
  mailboxStore.loadSummary(true)
  if (message) ElMessage({ message, type: 'success', plain: true })
}

async function onAssign(event) {
  const raw = event.target.value
  try {
    await sharedMailboxConversationAction({
      action: 'assign',
      emailId: selectedId.value,
      assigneeId: raw ? Number(raw) : null,
    })
    await afterChange(raw ? 'Conversation assigned.' : 'Conversation unassigned.')
  } catch (error) {
    ElMessage({ message: error.message || 'Could not assign.', type: 'error', plain: true })
  }
}

async function onStatus(event) {
  const next = event.target.value
  try {
    if (next === 'resolved') {
      await sharedMailboxConversationAction({ action: 'resolve', emailId: selectedId.value })
    } else {
      await sharedMailboxConversationAction({ action: 'status', emailId: selectedId.value, status: next })
    }
    await afterChange(`Status set to ${statusLabel(next)}.`)
  } catch (error) {
    ElMessage({ message: error.message || 'Could not change status.', type: 'error', plain: true })
  }
}

async function onPriority(event) {
  try {
    await sharedMailboxConversationAction({ action: 'priority', emailId: selectedId.value, priority: event.target.value })
    await afterChange('Priority updated.')
  } catch (error) {
    ElMessage({ message: error.message || 'Could not change priority.', type: 'error', plain: true })
  }
}

async function toggleTag(tag) {
  const current = (detail.value?.tags || []).map(item => Number(item.id))
  const next = hasTag(tag.id)
    ? current.filter(id => id !== Number(tag.id))
    : current.concat(Number(tag.id))
  try {
    await sharedMailboxConversationAction({ action: 'tags', emailId: selectedId.value, tagIds: next })
    await afterChange()
  } catch (error) {
    ElMessage({ message: error.message || 'Could not update tags.', type: 'error', plain: true })
  }
}

function customerAddress() {
  const messages = detail.value?.messages || []
  const inbound = messages.filter(msg => Number(msg.type) === 0)
  const last = inbound.length ? inbound[inbound.length - 1] : null
  return last?.send_email || messages[0]?.send_email || ''
}

async function submit() {
  const text = body.value.trim()
  if (!text || !detail.value) return
  sending.value = true
  try {
    if (mode.value === 'note') {
      await sharedMailboxAddNote(selectedId.value, text)
      body.value = ''
      await afterChange('Internal note added.')
      return
    }
    const to = customerAddress()
    if (!to) {
      ElMessage({ message: 'This conversation has no customer address to reply to.', type: 'error', plain: true })
      return
    }
    await emailSend({
      // The unified queue is only a view. Replies still leave through the
      // actual mailbox that received the conversation.
      accountId: detail.value?.email?.account_id,
      sendType: 'reply',
      emailId: selectedId.value,
      receiveEmail: [to],
      subject: detail.value.email.subject ? `Re: ${detail.value.email.subject.replace(/^Re:\s*/i, '')}` : '',
      text,
      content: `<p>${text.replace(/\n/g, '<br>')}</p>`,
      name: detail.value?.email?.mailbox_display_name || detail.value?.email?.mailbox_email || mailboxLabel.value,
    })
    body.value = ''
    await afterChange('Reply sent.')
  } catch (error) {
    ElMessage({ message: error.message || 'Could not send.', type: 'error', plain: true })
  } finally {
    sending.value = false
  }
}

function tabCount(key) {
  const c = counts.value
  if (!c) return 0
  if (key === 'open') return Number(c.open) || 0
  if (key === 'mine') return Number(c.mine) || 0
  if (key === 'unassigned') return Number(c.unassigned) || 0
  if (key === 'waiting_internal') return Number(c.waiting_internal) || 0
  if (key === 'urgent') return Number(c.urgent) || 0
  if (key === 'resolved') return Math.max(0, (Number(c.total) || 0) - (Number(c.open) || 0))
  return 0
}

onMounted(async () => {
  await mailboxStore.load()
  // Shared Inbox is one company queue. Sources are labelled on each message,
  // while the server still enforces access separately for every mailbox.
  if (mailboxId.value !== 0) {
    await router.replace({ name: 'mail-shared-inbox', params: { mailboxId: '0' } })
    return
  }
  await reload()
  await mailboxStore.loadSummary()
  sharedMailboxTags().then(rows => { allTags.value = rows || [] }).catch(() => {})
})

watch(mailboxId, async (next, prev) => {
  if (Number.isNaN(next) || next === prev) return
  list.value = []
  closeDetail()
  status.value = 'open'
  await reload()
})
</script>

<style scoped>
.si-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 40%) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}

.si-list {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--el-border-color);
}

.si-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px 8px;
}

.si-title {
  min-width: 0;
}

.eyebrow {
  color: var(--el-text-color-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .13em;
}

.si-heading h1 {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-subtitle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  color: var(--hq-muted);
  font-size: 11px;
}

.si-dot {
  opacity: .5;
}

.si-urgent {
  padding: 0 5px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-danger) 16%, transparent);
  color: var(--el-color-danger);
  font-weight: 600;
}

.si-icon-btn {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 1px solid var(--hq-border);
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  cursor: pointer;
}

.si-icon-btn:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.si-icon-btn:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.si-heading-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.si-inbox-select {
  height: 28px;
  max-width: 190px;
  padding: 0 8px;
  border: 1px solid var(--hq-border);
  border-radius: 6px;
  background: var(--el-bg-color);
  color: var(--hq-text-secondary);
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
}

.si-inbox-select:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.si-inbox-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 150px;
  overflow: hidden;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-size: 10px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-filters {
  display: flex;
  gap: 5px;
  padding: 0 12px 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.si-filters::-webkit-scrollbar {
  display: none;
}

.si-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--hq-border);
  border-radius: 13px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
  cursor: pointer;
}

.si-chip:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.si-chip.is-on {
  border-color: var(--hq-border-strong);
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.si-chip:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.si-chip-count {
  min-width: 15px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10px;
  text-align: center;
}

.si-chip.is-on .si-chip-count {
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
}

.si-items {
  min-height: 0;
  overflow-y: auto;
  padding: 0 6px 10px;
}

.si-item {
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.si-item:hover {
  background: var(--hq-hover);
}

.si-item.is-active {
  background: var(--hq-selected);
}

.si-item:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: -2px;
}

.si-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .02em;
}

.si-avatar.tone-0 {
  background: color-mix(in srgb, var(--hq-accent) 16%, transparent);
  color: var(--hq-accent-strong);
}

.si-avatar.tone-1 {
  background: color-mix(in srgb, #3b82f6 16%, transparent);
  color: #60a5fa;
}

.si-avatar.tone-2 {
  background: color-mix(in srgb, #10b981 16%, transparent);
  color: #34d399;
}

.si-avatar.tone-3 {
  background: color-mix(in srgb, #a855f7 16%, transparent);
  color: #c084fc;
}

.si-item-main {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 1px;
}

.si-item-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.si-sender {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-item.is-unread .si-sender {
  font-weight: 700;
}

.si-time {
  flex: 0 0 auto;
  color: var(--hq-muted);
  font-size: 10px;
}

.si-subject {
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-snippet {
  overflow: hidden;
  color: var(--hq-muted);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}

.si-status {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10px;
  font-weight: 600;
}

.si-status.is-in_progress,
.si-status.is_assigned {
  background: color-mix(in srgb, var(--hq-accent) 14%, transparent);
  color: var(--hq-accent-strong);
}

.si-status.is_waiting_customer {
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #d97706;
}

.si-status.is_waiting_internal {
  background: color-mix(in srgb, #8b5cf6 16%, transparent);
  color: #a78bfa;
}

.si-status.is_resolved {
  background: color-mix(in srgb, #10b981 16%, transparent);
  color: #059669;
}

.si-status.is_new,
.si-status.is_unassigned {
  background: color-mix(in srgb, #ef4444 14%, transparent);
  color: #dc2626;
}

.si-flag {
  padding: 0 5px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

.si-flag.is-urgent {
  background: color-mix(in srgb, var(--el-color-danger) 16%, transparent);
  color: var(--el-color-danger);
}

.si-flag.is-high {
  background: color-mix(in srgb, #f59e0b 16%, transparent);
  color: #d97706;
}

.si-assignee {
  overflow: hidden;
  max-width: 45%;
  color: var(--hq-text-secondary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.si-assignee.is-empty {
  color: var(--hq-muted);
  font-style: italic;
}

.si-count {
  display: inline-grid;
  min-width: 15px;
  height: 15px;
  place-items: center;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10px;
  font-weight: 600;
}

.si-empty,
.si-reader-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 32px 20px;
  text-align: center;
  color: var(--hq-muted);
}

.si-empty-title,
.si-reader-title {
  margin: 4px 0 0;
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.si-empty-hint,
.si-reader-hint {
  max-width: 280px;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
}

.si-more {
  width: 100%;
  height: 30px;
  margin-top: 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-accent-strong);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.si-more:hover {
  background: var(--hq-hover);
}

.si-more:disabled {
  color: var(--hq-muted);
  cursor: default;
}

.si-detail {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.si-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--el-border-color);
}

.si-detail-title {
  min-width: 0;
}

.si-detail-head h2 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 650;
  letter-spacing: -.01em;
}

.si-detail-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  color: var(--hq-muted);
  font-size: 11px;
}

.si-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color);
  background: color-mix(in srgb, var(--hq-surface) 60%, transparent);
}

.si-field {
  display: grid;
  gap: 3px;
}

.si-field-label {
  color: var(--hq-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.si-select {
  height: 27px;
  min-width: 130px;
  padding: 0 6px;
  border: 1px solid var(--hq-border);
  border-radius: 6px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-size: 12px;
  cursor: pointer;
}

.si-select:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 1px;
}

.si-tags {
  min-width: 0;
  flex: 1 1 180px;
}

.si-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.si-tag {
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--hq-border);
  border-radius: 11px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.si-tag:hover {
  background: var(--hq-hover);
}

.si-tag.is-on {
  border-color: var(--hq-border-strong);
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.si-tag.is-empty {
  opacity: .6;
  cursor: default;
}

.si-link {
  height: 27px;
  display: inline-flex;
  align-items: center;
  padding: 0 8px;
  border: 1px solid var(--hq-border);
  border-radius: 6px;
  color: var(--hq-accent-strong);
  font-size: 12px;
}

.si-thread {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.si-msg {
  max-width: 82%;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.si-msg.is-out {
  align-self: flex-end;
  background: color-mix(in srgb, var(--hq-accent) 8%, var(--el-bg-color));
  border-color: color-mix(in srgb, var(--hq-accent) 22%, var(--el-border-color));
}

.si-msg.is-in {
  align-self: flex-start;
}

.si-msg-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 3px;
}

.si-msg-who {
  color: var(--hq-text-secondary);
  font-size: 11px;
  font-weight: 600;
}

.si-msg-time {
  flex: 0 0 auto;
  color: var(--hq-muted);
  font-size: 10px;
}

.si-msg-body {
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.55;
  word-break: break-word;
}

.si-msg-body :deep(p) {
  margin: 0 0 6px;
}

.si-msg-body :deep(p:last-child) {
  margin-bottom: 0;
}

.si-timeline {
  border-top: 1px solid var(--el-border-color);
  padding: 8px 16px;
  color: var(--hq-muted);
  font-size: 11px;
}

.si-timeline summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--hq-text-secondary);
}

.si-timeline ol {
  display: grid;
  gap: 3px;
  margin: 6px 0 0;
  padding-left: 16px;
}

.si-timeline li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.si-ev-action {
  color: var(--hq-text-secondary);
  font-weight: 600;
}

.si-ev-note {
  color: var(--hq-muted);
  font-style: italic;
}

.si-ev-time {
  margin-left: auto;
  opacity: .7;
}

.si-resolved-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 16px 8px;
  padding: 6px 10px;
  border-radius: 7px;
  background: color-mix(in srgb, #10b981 12%, transparent);
  color: #059669;
  font-size: 11px;
}

.si-composer {
  display: grid;
  gap: 6px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--el-border-color);
}

.si-compose-tabs {
  display: flex;
  gap: 4px;
}

.si-compose-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--hq-border);
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
}

.si-compose-tab.is-on {
  border-color: var(--hq-border-strong);
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.si-note-warning {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  padding: 5px 9px;
  border-radius: 6px;
  background: color-mix(in srgb, #f59e0b 14%, transparent);
  color: #b45309;
  font-size: 11px;
  font-weight: 550;
}

.si-textarea {
  width: 100%;
  min-height: 74px;
  padding: 8px 10px;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}

.si-textarea:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 1px;
}

.si-textarea.is-note {
  border-color: color-mix(in srgb, #f59e0b 45%, var(--hq-border));
  background: color-mix(in srgb, #f59e0b 6%, var(--el-bg-color));
}

.si-compose-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.si-compose-hint {
  color: var(--hq-muted);
  font-size: 11px;
}

.si-send {
  height: 30px;
  padding: 0 14px;
  border: 0;
  border-radius: 7px;
  background: var(--hq-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.si-send:hover {
  background: var(--hq-accent-hover);
}

.si-send:disabled {
  background: var(--hq-hover);
  color: var(--hq-muted);
  cursor: default;
}

.si-send.is-note {
  background: #b45309;
}

.si-send.is-note:hover {
  background: #92400e;
}

.si-send:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

@media (max-width: 900px) {
  .si-workspace {
    grid-template-columns: minmax(220px, 44%) minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  .si-workspace {
    display: block;
  }

  .si-list {
    height: 100%;
    border-right: 0;
  }

  .si-detail {
    display: none;
  }

  .si-bar {
    gap: 8px;
  }
}
</style>
