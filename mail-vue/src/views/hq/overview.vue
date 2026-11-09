<template>
  <el-scrollbar class="overview-scroll">
    <main class="hq-overview">
      <header class="overview-header">
        <div class="page-intro">
          <div class="page-eyebrow">XPASS HQ <span>/</span> WORKSPACE</div>
          <h1>{{ greeting }}, {{ firstName }}</h1>
          <p>{{ user.email }}<span v-if="user.role?.name"> · {{ user.role.name }}</span></p>
        </div>
        <div class="header-actions">
          <el-button @click="openMail">
            <Icon icon="hugeicons:mailbox-01" width="17" height="17" />
            Open inbox
          </el-button>
          <el-button v-if="canCompose" type="primary" :disabled="!canSend" @click="compose">
            <Icon icon="hugeicons:quill-write-01" width="17" height="17" />
            Compose
          </el-button>
        </div>
      </header>

      <section class="workspace-shortcuts" aria-label="Available workspace modules">
        <button
          v-for="module in availableModules"
          :key="module.id"
          type="button"
          class="shortcut-link"
          :aria-current="module.id === 'overview' ? 'page' : undefined"
          @click="openModule(module)"
        >
          <Icon :icon="module.icon" width="18" height="18" />
          <span>{{ module.name }}</span>
          <Icon icon="fluent:arrow-up-right-20-regular" width="15" height="15" />
        </button>
      </section>

      <section class="mail-summary" aria-label="Mailbox summary">
        <div class="summary-label">Mail activity</div>
        <template v-if="mailLoading">
          <span class="summary-loading" role="status">Loading mailbox summary…</span>
        </template>
        <template v-else-if="mailError">
          <span class="summary-error">Mailbox summary unavailable</span>
        </template>
        <template v-else-if="currentAccount">
          <div class="summary-metrics">
            <div class="summary-metric">
              <span>Unread in inbox</span>
              <strong>{{ mailCounts?.inbox ?? 0 }}</strong>
            </div>
            <div class="summary-metric">
              <span>Sent</span>
              <strong>{{ mailCounts?.sent ?? 0 }}</strong>
            </div>
          </div>
          <span class="summary-account">
            <Icon icon="fluent:mail-20-regular" width="16" height="16" />
            {{ currentAccount.email }}
          </span>
        </template>
        <span v-else class="summary-empty">No mailbox is currently selected.</span>
      </section>

      <div class="overview-content">
        <section class="recent-panel" aria-labelledby="recent-heading">
          <div class="panel-header">
            <div>
              <div class="panel-eyebrow">MAIL</div>
              <h2 id="recent-heading">Recent inbox</h2>
            </div>
            <button type="button" class="text-action" @click="openMail">
              View inbox
              <Icon icon="fluent:arrow-right-20-regular" width="16" height="16" />
            </button>
          </div>

          <div v-if="mailLoading" class="panel-state" role="status">
            <span class="loading-spinner"></span>
            Loading recent messages…
          </div>
          <div v-else-if="mailError" class="panel-state panel-error">
            <HqEmptyState
              icon="fluent:cloud-error-20-regular"
              title="Mail data is unavailable"
              description="Your workspace is still available. Check the Mail connection and try again."
              action-label="Retry"
              @action="loadMail"
            />
          </div>
          <div v-else-if="!currentAccount" class="panel-state">
            <HqEmptyState
              icon="hugeicons:mailbox-01"
              title="No mailbox selected"
              description="Choose one of your available Mail accounts to see inbox activity."
            />
          </div>
          <div v-else-if="!recentMessages.length" class="panel-state">
            <HqEmptyState
              icon="fluent:mail-inbox-20-regular"
              title="Your inbox is clear"
              description="New messages for this mailbox will appear here."
            />
          </div>
          <ul v-else class="recent-list">
            <li v-for="message in recentMessages" :key="message.emailId" class="recent-message">
              <span class="sender-avatar" aria-hidden="true">{{ senderInitial(message.name || message.sendEmail) }}</span>
              <div class="message-copy">
                <strong>{{ message.name || message.sendEmail || 'Unknown sender' }}</strong>
                <span class="message-subject" :class="{ 'is-unread': message.type === 0 && message.unread === 0 }">
                  {{ message.subject || '(No subject)' }}
                </span>
                <small>{{ message.listText || 'Open your inbox to read this message.' }}</small>
              </div>
              <time v-if="message.createTime" class="message-date" :datetime="message.createTime">
                {{ formatDate(message.createTime) }}
              </time>
            </li>
          </ul>
        </section>

        <aside class="workspace-panel" aria-label="Workspace shortcuts">
          <section class="action-section">
            <div class="panel-eyebrow">QUICK ACTIONS</div>
            <button v-if="canCompose" class="action-link" type="button" :disabled="!canSend" @click="compose">
              <span class="action-icon"><Icon icon="hugeicons:quill-write-01" width="18" height="18" /></span>
              <span><strong>Compose an email</strong><small>{{ canSend ? 'Write a new message' : 'Sending is disabled' }}</small></span>
              <Icon class="action-chevron" icon="fluent:chevron-right-20-regular" width="16" height="16" />
            </button>
            <button class="action-link" type="button" @click="openMail">
              <span class="action-icon"><Icon icon="hugeicons:mailbox-01" width="18" height="18" /></span>
              <span><strong>Go to your inbox</strong><small>Review recent conversations</small></span>
              <Icon class="action-chevron" icon="fluent:chevron-right-20-regular" width="16" height="16" />
            </button>
            <button class="action-link" type="button" @click="openSettings">
              <span class="action-icon"><Icon icon="fluent:settings-48-regular" width="18" height="18" /></span>
              <span><strong>Preferences</strong><small>Manage your account settings</small></span>
              <Icon class="action-chevron" icon="fluent:chevron-right-20-regular" width="16" height="16" />
            </button>
          </section>
          <section class="workspace-note">
            <div class="panel-eyebrow">XPASS HQ</div>
            <p>Your company workspace. Mail is available now; additional modules will appear here as they are built.</p>
          </section>
        </aside>
      </div>
    </main>
  </el-scrollbar>
</template>

<script setup>
import {computed, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import {Icon} from '@iconify/vue'
import {ElMessage} from 'element-plus'
import HqEmptyState from '@/components/hq-empty-state/index.vue'
import {emailList} from '@/request/email.js'
import {mailboxCounts} from '@/request/mailbox.js'
import {useAccountStore} from '@/store/account.js'
import {useSettingStore} from '@/store/setting.js'
import {useUiStore} from '@/store/ui.js'
import {useUserStore} from '@/store/user.js'
import {hasPerm} from '@/perm/perm.js'
import {workspaceModules} from '@/modules/registry.js'

const router = useRouter()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const uiStore = useUiStore()
const userStore = useUserStore()
const mailLoading = ref(true)
const mailError = ref('')
const mailCounts = ref(null)
const recentMessages = ref([])

const user = computed(() => userStore.user || {})
const currentAccount = computed(() => accountStore.currentAccount?.accountId
  ? accountStore.currentAccount
  : user.value.account?.accountId
    ? user.value.account
    : null)
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
const canCompose = computed(() => hasPerm('email:send'))
const canSend = computed(() => settingStore.settings.send !== 1)
const availableModules = computed(() => workspaceModules.filter(module =>
  module.available && (!module.requiredPermission || hasPerm(module.requiredPermission))
))

async function loadMail() {
  mailLoading.value = true
  mailError.value = ''
  if (!currentAccount.value) {
    mailCounts.value = null
    recentMessages.value = []
    mailLoading.value = false
    return
  }

  const accountId = currentAccount.value.accountId
  const allReceive = currentAccount.value.allReceive ?? 0
  try {
    const [counts, messages] = await Promise.all([
      mailboxCounts(),
      emailList(accountId, allReceive, 0, 0, 5, 0, 0, {folderKey: 'inbox'}),
    ])
    mailCounts.value = counts
    recentMessages.value = messages.list || []
  } catch (error) {
    console.error('Could not load Overview Mail data:', error)
    mailError.value = error?.message || 'Mail data could not be loaded.'
  } finally {
    mailLoading.value = false
  }
}

function openModule(module) {
  if (!module.available || !module.routeName) return
  router.push({name: module.routeName})
}

function openMail() {
  router.push({name: 'email'})
}

function openSettings() {
  router.push({name: 'setting'})
}

function compose() {
  if (!canCompose.value) return
  if (!canSend.value) {
    ElMessage({message: 'Sending is disabled for this workspace.', type: 'info', plain: true})
    return
  }
  uiStore.writerRef?.open()
}

function senderInitial(name) {
  return String(name || 'X').trim()[0]?.toUpperCase() || 'X'
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${value}${/Z|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z'}`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric'}).format(date)
}

onMounted(loadMail)
</script>

<style scoped>
.overview-scroll {
  height: 100%;
  background: var(--hq-page);
}

.hq-overview {
  width: min(1240px, 100%);
  min-height: 100%;
  margin: 0 auto;
  padding: 28px clamp(20px, 3vw, 42px) 36px;
  color: var(--hq-text);
}

.overview-header {
  display: flex;
  min-height: 92px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.page-eyebrow,
.panel-eyebrow {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
}

.page-eyebrow span {
  margin: 0 5px;
  color: var(--hq-border-strong);
}

.page-intro h1 {
  margin: 5px 0 2px;
  font-family: var(--hq-font-heading);
  font-size: clamp(24px, 2.4vw, 30px);
  font-weight: 650;
  letter-spacing: -.035em;
  line-height: 1.2;
}

.page-intro p {
  overflow: hidden;
  max-width: 460px;
  color: var(--hq-text-secondary);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.header-actions :deep(.el-button) {
  min-height: 36px;
  margin: 0;
  border-radius: 6px;
  font-weight: 550;
}

.header-actions :deep(.el-button:not(.el-button--primary)) {
  border-color: var(--hq-border);
  background: var(--hq-surface);
  color: var(--hq-text);
}

.header-actions :deep(.el-button:not(.el-button--primary):hover) {
  border-color: var(--hq-border-strong);
  background: var(--hq-hover);
}

.workspace-shortcuts {
  display: flex;
  min-height: 45px;
  align-items: center;
  gap: 4px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--hq-border);
}

.shortcut-link {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border-radius: 6px 6px 0 0;
  color: var(--hq-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.shortcut-link:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.shortcut-link[aria-current="page"] {
  border-bottom: 2px solid var(--hq-accent);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.shortcut-link > :last-child {
  color: var(--hq-muted);
}

.mail-summary {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 2fr) minmax(170px, 1fr);
  min-height: 76px;
  align-items: center;
  gap: 18px;
  margin-bottom: 20px;
  padding: 12px 18px;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--hq-surface);
}

.summary-label {
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 600;
}

.summary-metrics {
  display: flex;
  gap: clamp(24px, 4vw, 64px);
}

.summary-metric {
  display: flex;
  align-items: baseline;
  gap: 9px;
}

.summary-metric span,
.summary-account,
.summary-empty,
.summary-loading,
.summary-error {
  color: var(--hq-text-secondary);
  font-size: 12px;
}

.summary-metric strong {
  color: var(--hq-text);
  font-size: 20px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.summary-account {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-account svg {
  flex: 0 0 auto;
  color: var(--hq-muted);
}

.summary-error {
  color: var(--hq-danger);
}

.overview-content {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(250px, .8fr);
  align-items: start;
  gap: 18px;
}

.recent-panel,
.workspace-panel {
  min-width: 0;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--hq-surface);
}

.panel-header {
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--hq-border);
}

.panel-header h2 {
  margin-top: 2px;
  font-size: 16px;
  font-weight: 620;
  letter-spacing: -.015em;
}

.text-action {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 5px;
  padding: 0 8px;
  border-radius: 5px;
  color: var(--hq-accent-strong);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.text-action:hover {
  background: var(--hq-selected);
}

.recent-list {
  padding: 0 18px;
}

.recent-message {
  display: flex;
  min-width: 0;
  min-height: 74px;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--hq-border);
}

.recent-message:last-child {
  border-bottom: 0;
}

.sender-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--hq-border);
  border-radius: 50%;
  background: var(--hq-page);
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 650;
}

.message-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.message-copy strong,
.message-subject,
.message-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-copy strong {
  color: var(--hq-text);
  font-size: 12px;
  font-weight: 600;
}

.message-subject {
  color: var(--hq-text-secondary);
  font-size: 12px;
}

.message-subject.is-unread {
  color: var(--hq-text);
  font-weight: 650;
}

.message-copy small {
  color: var(--hq-muted);
  font-size: 11px;
}

.message-date {
  align-self: flex-start;
  flex: 0 0 auto;
  padding-top: 21px;
  color: var(--hq-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.panel-state {
  display: grid;
  min-height: 220px;
  place-items: center;
  padding: 18px;
  color: var(--hq-text-secondary);
  font-size: 12px;
}

.panel-error {
  display: block;
}

.loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--hq-border);
  border-top-color: var(--hq-accent);
  border-radius: 50%;
  animation: spin .75s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.action-section {
  padding: 14px 16px 8px;
}

.action-section > .panel-eyebrow {
  padding: 0 2px 8px;
}

.action-link {
  display: flex;
  width: 100%;
  min-height: 60px;
  align-items: center;
  gap: 10px;
  padding: 7px 2px;
  border-top: 1px solid var(--hq-border);
  color: var(--hq-text);
  text-align: left;
  cursor: pointer;
}

.action-link:hover > span:nth-child(2) strong {
  color: var(--hq-accent-strong);
}

.action-link:disabled {
  cursor: not-allowed;
  opacity: .55;
}

.action-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--hq-border);
  border-radius: 6px;
  color: var(--hq-text-secondary);
}

.action-link > span:nth-child(2) {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.action-link strong {
  font-size: 12px;
  font-weight: 600;
}

.action-link small {
  color: var(--hq-text-secondary);
  font-size: 11px;
}

.action-chevron {
  flex: 0 0 auto;
  color: var(--hq-muted);
}

.workspace-note {
  margin: 0 16px 16px;
  padding: 12px 2px 0;
  border-top: 1px solid var(--hq-border);
}

.workspace-note p {
  margin-top: 6px;
  color: var(--hq-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.header-actions :deep(.el-button:focus-visible),
.text-action:focus-visible,
.shortcut-link:focus-visible,
.action-link:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

@media (max-width: 1000px) {
  .overview-content {
    grid-template-columns: minmax(0, 1fr) 260px;
  }
}

@media (max-width: 760px) {
  .hq-overview {
    padding: 20px 16px 28px;
  }

  .overview-header {
    min-height: 0;
    align-items: flex-start;
  }

  .overview-content {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(160px, .7fr);
    align-items: start;
  }

  .workspace-note {
    margin-top: 14px;
  }
}

@media (max-width: 520px) {
  .overview-header {
    display: grid;
    gap: 12px;
  }

  .header-actions {
    width: 100%;
  }

  .header-actions :deep(.el-button) {
    flex: 1;
  }

  .workspace-shortcuts {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .shortcut-link {
    flex: 0 0 auto;
    padding: 0 8px;
  }

  .mail-summary {
    grid-template-columns: 1fr auto;
    gap: 8px 12px;
    padding: 12px;
  }

  .summary-label {
    grid-column: 1 / -1;
  }

  .summary-metrics {
    gap: 14px;
  }

  .summary-metric {
    display: grid;
    gap: 0;
  }

  .summary-account {
    max-width: 145px;
    font-size: 10px;
  }

  .panel-header {
    padding: 12px;
  }

  .recent-list {
    padding: 0 12px;
  }

  .recent-message {
    gap: 9px;
  }

  .message-copy small {
    max-width: 220px;
  }

  .workspace-panel {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-spinner {
    animation-duration: 2s;
  }
}
</style>
