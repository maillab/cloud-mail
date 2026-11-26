<template>
  <div class="mail-nav">
    <button
      v-perm="'email:send'"
      class="mail-compose"
      type="button"
      title="Compose email"
      @click="compose"
    >
      <Icon icon="hugeicons:quill-write-01" width="17" height="17" />
      <span>Compose</span>
    </button>

    <div class="mail-nav-label">Personal</div>
    <button
      v-for="item in primaryLinks"
      :key="item.id"
      class="mail-link"
      :class="{ 'is-active': isLinkActive(item) }"
      type="button"
      :aria-current="isLinkActive(item) ? 'page' : undefined"
      @click="open(item)"
    >
      <Icon :icon="item.icon" width="17" height="17" />
      <span class="mail-link-text">{{ item.label }}</span>
      <span v-if="item.count" class="mail-count">{{ badge(item.count) }}</span>
    </button>

    <!-- Shared inboxes are peers of the personal inbox, not a separate app and
         not a mode the whole workspace switches into. Only inboxes this member
         actually belongs to are rendered; the server never returns the others. -->
    <template v-if="sharedMailboxes.length">
      <div class="mail-nav-label mail-nav-label-shared">
        <span>Shared</span>
        <button
          class="mail-nav-mini"
          type="button"
          title="Refresh shared inboxes"
          aria-label="Refresh shared inboxes"
          @click="refreshShared"
        >
          <Icon icon="fluent:arrow-clockwise-20-regular" width="13" height="13" />
        </button>
      </div>
      <button
        v-for="box in sharedMailboxes"
        :key="`shared-${box.account_id}`"
        class="mail-link"
        :class="{ 'is-active': isSharedActive(box) }"
        type="button"
        :aria-current="isSharedActive(box) ? 'page' : undefined"
        @click="openShared(box)"
      >
        <Icon :icon="sharedIcon(box)" width="17" height="17" />
        <span class="mail-link-text">{{ sharedLabel(box) }}</span>
        <span v-if="sharedBadge(box)" class="mail-count is-accent">{{ sharedBadge(box) }}</span>
      </button>
    </template>

    <button
      class="mail-link mail-more-toggle"
      type="button"
      :aria-expanded="moreOpen"
      @click="moreOpen = !moreOpen"
    >
      <Icon icon="fluent:folder-20-regular" width="17" height="17" />
      <span class="mail-link-text">More folders</span>
      <Icon
        class="mail-chevron"
        :icon="moreOpen ? 'fluent:chevron-up-12-regular' : 'fluent:chevron-down-12-regular'"
        width="13"
        height="13"
      />
    </button>

    <div v-show="moreOpen" class="mail-more">
      <button
        v-for="item in moreLinks"
        :key="item.id"
        class="mail-link mail-link-sub"
        :class="{ 'is-active': isLinkActive(item) }"
        type="button"
        :aria-current="isLinkActive(item) ? 'page' : undefined"
        @click="open(item)"
      >
        <Icon :icon="item.icon" width="16" height="16" />
        <span class="mail-link-text">{{ item.label }}</span>
        <span v-if="item.count" class="mail-count">{{ badge(item.count) }}</span>
      </button>

      <div v-if="folders.length" class="mail-nav-label mail-nav-label-sub">Folders</div>
      <button
        v-for="folder in folders"
        :key="folder.folderId"
        class="mail-link mail-link-sub"
        :class="{ 'is-active': route.params.folderKey === `custom-${folder.folderId}` }"
        type="button"
        :aria-current="route.params.folderKey === `custom-${folder.folderId}` ? 'page' : undefined"
        @click="openFolder(`custom-${folder.folderId}`)"
      >
        <Icon icon="fluent:folder-20-regular" width="16" height="16" />
        <span class="mail-link-text">{{ folder.name }}</span>
        <span v-if="folder.unreadCount" class="mail-count">{{ badge(folder.unreadCount) }}</span>
      </button>

      <div class="mail-folder-tools">
        <button type="button" title="Create folder" aria-label="Create folder" @click="showCreate = true">
          <Icon icon="fluent:add-20-regular" width="16" height="16" />
        </button>
        <button type="button" title="Manage folders" aria-label="Manage folders" @click="manageFolders">
          <Icon icon="fluent:settings-48-regular" width="16" height="16" />
        </button>
      </div>
    </div>
  </div>

  <el-dialog v-model="showCreate" title="Create new folder" width="420px" append-to-body>
    <el-input v-model="folderName" maxlength="60" show-word-limit placeholder="Folder name" @keyup.enter="createFolder" />
    <template #footer>
      <el-button @click="showCreate = false">{{ $t('cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="createFolder">Create</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import router from '@/router/index.js'
import { useUiStore } from '@/store/ui.js'
import { useMailboxStore } from '@/store/mailbox.js'
import { hasPerm } from '@/perm/perm.js'
import { mailboxCounts, mailboxFolderCreate, mailboxFolderList } from '@/request/mailbox.js'

const emit = defineEmits(['navigate'])
const { t } = useI18n()

const route = useRoute()
const uiStore = useUiStore()
const mailboxStore = useMailboxStore()

const folders = ref([])
const counts = ref({})
const moreOpen = ref(false)
const showCreate = ref(false)
const folderName = ref('')
const saving = ref(false)

const sharedMailboxes = computed(() => mailboxStore.sharedMailboxes)

const primaryLinks = computed(() => [
  { id: 'inbox', label: 'Inbox', icon: 'hugeicons:mailbox-01', routeName: 'email', count: counts.value.inbox },
  { id: 'sent', label: 'Sent', icon: 'cil:send', routeName: 'send', permission: 'email:send' },
  { id: 'drafts', label: 'Drafts', icon: 'fluent:document-20-regular', routeName: 'draft', permission: 'email:send', count: counts.value.draft },
  { id: 'starred', label: 'Starred', icon: 'solar:star-line-duotone', routeName: 'star' },
  { id: 'templates', label: 'Templates', icon: 'fluent:document-bullet-list-20-regular', routeName: 'templates' },
].filter(item => !item.permission || hasPerm(item.permission)))

const moreLinks = computed(() => [
  { id: 'unread', label: 'Unread', icon: 'fluent:mail-unread-20-regular', folderKey: 'all-unread', count: counts.value.unread },
  { id: 'snoozed', label: 'Snoozed', icon: 'fluent:clock-20-regular', folderKey: 'snoozed', count: counts.value.snoozed },
  { id: 'archive', label: 'Archive', icon: 'fluent:archive-20-regular', folderKey: 'archive', count: counts.value.archive },
  { id: 'spam', label: 'Spam', icon: 'fluent:shield-error-20-regular', folderKey: 'spam', count: counts.value.spam },
  { id: 'trash', label: 'Trash', icon: 'fluent:delete-20-regular', folderKey: 'trash', count: counts.value.trash },
  { id: 'outbox', label: 'Outbox', icon: 'fluent:send-clock-20-regular', folderKey: 'outbox', count: counts.value.outbox },
  { id: 'newsletter', label: 'Newsletter', icon: 'fluent:mail-list-20-regular', folderKey: 'newsletter', count: counts.value.newsletter },
  { id: 'notification', label: 'Notification', icon: 'fluent:alert-20-regular', folderKey: 'notification', count: counts.value.notification },
])

function badge(value) {
  const count = Number(value) || 0
  return count > 99 ? '99+' : count
}

function isLinkActive(item) {
  if (item.folderKey) return route.params.folderKey === item.folderKey
  if (item.routeName === 'email') {
    return ['email', 'mail', 'content', 'message-detail'].includes(route.name)
      && (!route.params.mailbox || route.params.mailbox === 'inbox')
  }
  return route.name === item.routeName
}

// A shared inbox is addressed by its account id so the personal inbox and a
// support inbox can never collide on the same route.
function sharedRouteName(box) {
  return 'mail-shared-inbox'
}

function isSharedActive(box) {
  if (route.name !== sharedRouteName(box)) return false
  return Number(route.params.mailboxId) === Number(box.account_id)
}

function open(item) {
  if (item.folderKey) {
    openFolder(item.folderKey)
    return
  }
  router.push({ name: item.routeName })
  closeAfterNavigate()
}

function openFolder(folderKey) {
  router.push({ name: 'mail-folder', params: { folderKey } })
  closeAfterNavigate()
}

function openShared(box) {
  router.push({ name: sharedRouteName(box), params: { mailboxId: String(box.account_id) } })
  closeAfterNavigate()
}

function sharedLabel(box) {
  return box.display_name || box.email || 'Shared inbox'
}

function sharedBadge(box) {
  return mailboxStore.badgeFor(box.account_id)
}

function sharedIcon(box) {
  const name = `${sharedLabel(box)}`.toLowerCase()
  if (name.includes('support')) return 'fluent:chat-help-20-regular'
  if (name.includes('legal')) return 'fluent:gavel-20-regular'
  if (name.includes('info')) return 'fluent:info-20-regular'
  return 'fluent:people-team-20-regular'
}

function closeAfterNavigate() {
  if (window.innerWidth < 700) uiStore.asideShow = false
  emit('navigate')
}

// Compose opens in the mailbox the member is looking at: the shared inbox they
// are reading, or their own mailbox everywhere else. The composer still shows
// the sender explicitly, and the member can change it.
function compose() {
  const sharedId = route.name === 'mail-shared-inbox' ? Number(route.params.mailboxId) : 0
  uiStore.writerRef?.open(sharedId ? { mailboxId: sharedId } : {})
  closeAfterNavigate()
}

function manageFolders() {
  router.push({ name: 'folder-settings' })
  closeAfterNavigate()
}

async function createFolder() {
  if (!folderName.value.trim()) return
  saving.value = true
  try {
    await mailboxFolderCreate(folderName.value)
    folderName.value = ''
    showCreate.value = false
    await refresh()
  } catch (error) {
    ElMessage({ message: error.message || 'Could not create folder.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

// Counts come from the server in one request. The sidebar never invents a
// number, so a badge only appears when the queue actually has something.
async function refreshSharedCounts() {
  await mailboxStore.loadSummary(true)
}

async function refreshShared() {
  await mailboxStore.load(true)
  await refreshSharedCounts()
}

async function refresh() {
  try {
    const [folderRows, folderCounts] = await Promise.all([mailboxFolderList(), mailboxCounts()])
    folders.value = folderRows || []
    counts.value = folderCounts || {}
  } catch (error) {
    console.error('Mail navigation refresh failed:', error)
  }
}

onMounted(async () => {
  await mailboxStore.load()
  refresh()
  refreshSharedCounts()
  window.addEventListener('mailbox:updated', refresh)
  window.addEventListener('mailbox:shared-updated', refreshShared)
})

onUnmounted(() => {
  window.removeEventListener('mailbox:updated', refresh)
  window.removeEventListener('mailbox:shared-updated', refreshShared)
})

watch(() => route.path, () => {
  if (route.name === 'email' && !route.params.folderKey) moreOpen.value = false
})
</script>

<style scoped>
.mail-nav {
  display: grid;
  gap: 1px;
}

.mail-compose {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 4px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: var(--hq-accent);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color .15s ease;
}

.mail-compose:hover {
  background: var(--hq-accent-hover);
}

.mail-compose:focus-visible,
.mail-link:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.mail-nav-label {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 9px 4px;
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.mail-nav-label-shared {
  justify-content: space-between;
}

.mail-nav-mini {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--hq-muted);
  cursor: pointer;
}

.mail-nav-mini:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.mail-nav-label-sub {
  padding-top: 8px;
}

.mail-link {
  display: flex;
  min-width: 0;
  min-height: 32px;
  align-items: center;
  gap: 9px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}

.mail-link:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.mail-link.is-active {
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.mail-link-sub {
  min-height: 30px;
  padding-left: 27px;
  font-size: 12px;
}

.mail-link-text {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mail-chevron {
  flex: 0 0 auto;
  color: var(--hq-muted);
}

.mail-count {
  min-width: 18px;
  margin-left: auto;
  padding: 1px 5px;
  border-radius: 9px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10px;
  text-align: center;
}

.mail-count.is-accent {
  background: color-mix(in srgb, var(--hq-accent) 16%, transparent);
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.mail-link.is-active .mail-count {
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
}

.mail-more-toggle {
  margin-top: 2px;
}

.mail-more {
  display: grid;
  gap: 1px;
}

.mail-folder-tools {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  padding: 4px 6px 2px;
}

.mail-folder-tools button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-muted);
  cursor: pointer;
}

.mail-folder-tools button:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.mail-folder-tools button:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}
</style>