<template>
  <div class="header">
    <div class="header-btn">
      <hanburger :is-active="navigationExpanded" @toggle-click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <div v-if="showComposeAction" v-perm="'email:send'" class="writer-box">
      <el-button
        class="writer"
        size="default"
        :aria-label="`${$t('compose')} email`"
        title="Compose email"
        @click="openSend"
      >
        <el-icon :size="23">
          <Icon icon="hugeicons:quill-write-01"/>
        </el-icon>
      </el-button>
    </div>
    <email-search
      v-if="showInboxSearch"
      :store="emailStore"
      :search-options="inboxSearchOptions"
      :class="['header-search', { 'account-show': accountPanelShow }]"
      @search="returnToList('email')"
      @reset="returnToList('email')"
    />
    <email-search
      v-else-if="showSentSearch"
      :store="sendStore"
      :search-options="sentSearchOptions"
      :class="['header-search', { 'account-show': accountPanelShow }]"
      @search="returnToList('send')"
      @reset="returnToList('send')"
    />
    <all-email-search
      v-else-if="showAllMailSearch"
      :class="{ 'account-show': accountPanelShow }"
      @search="returnToList('all-email')"
      @reset="returnToList('all-email')"
    />
    <div class="toolbar">
      <button
        v-if="hasPerm('ai:use')"
        class="header-icon-btn"
        type="button"
        :aria-label="$t('aiAssistant')"
        :title="$t('aiAssistant')"
        @click="openAi"
      >
        <Icon icon="fluent:brain-circuit-20-regular" width="19" height="19" />
      </button>
      <el-dropdown
        ref="createDropdownRef"
        trigger="click"
        :teleported="false"
        popper-class="create-dropdown"
      >
        <button class="create-btn" type="button" :aria-label="$t('createNew')" aria-haspopup="menu">
          <Icon icon="fluent:add-20-regular" width="18" height="18" />
          <span>{{ $t('createNew') }}</span>
        </button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-for="group in createGroups" :key="group.label">
              <el-dropdown-item disabled class="create-group-label">{{ t(group.key) }}</el-dropdown-item>
              <el-dropdown-item
                v-for="item in group.items"
                :key="item.routeName + '-' + (item.create || '')"
                @click.native.prevent="openCreateItem(item)"
              >
                <Icon :icon="item.icon" width="16" height="16" />
                <span>{{ item.label }}</span>
              </el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-dropdown
        v-if="hasPerm('notifications:query')"
        ref="notificationDropdownRef"
        trigger="click"
        placement="bottom-end"
        :teleported="false"
        popper-class="notification-dropdown"
        @visible-change="onNotificationToggle"
      >
        <button
          class="notification-bell"
          type="button"
          :aria-label="`${$t('notifications')} (${notificationStore.unreadCount} unread)`"
          aria-haspopup="menu"
        >
          <Icon icon="fluent:alert-20-regular" width="20" height="20" />
          <span v-if="notificationStore.unreadCount > 0" class="notification-badge">{{ notificationStore.unreadCount > 9 ? '9+' : notificationStore.unreadCount }}</span>
        </button>
        <template #dropdown>
          <div class="notification-panel">
            <header class="notification-panel-head">
              <span class="notification-panel-title">{{ $t('notifications') }}</span>
              <button
                v-if="notificationStore.unreadCount > 0"
                type="button"
                class="notification-markall"
                @click="markAllNotifications"
              >{{ $t('markAllRead') }}</button>
            </header>
            <div v-if="notificationStore.loading" class="notification-state">{{ $t('notificationsLoading') }}</div>
            <div v-else-if="notificationStore.list.length === 0" class="notification-state">{{ $t('notificationsEmpty') }}</div>
            <ul v-else class="notification-list">
              <li
                v-for="item in notificationStore.list"
                :key="item.id"
                class="notification-item"
                :class="{ 'is-unread': !item.is_read }"
                @click="openNotification(item)"
              >
                <span class="notification-dot" aria-hidden="true"></span>
                <div class="notification-item-body">
                  <div class="notification-item-title">{{ item.title || $t('notifications') }}</div>
                  <div v-if="item.body" class="notification-item-text">{{ item.body }}</div>
                </div>
              </li>
            </ul>
          </div>
        </template>
      </el-dropdown>
      <el-dropdown
        ref="userDropdownRef"
        trigger="click"
        :teleported="false"
        popper-class="detail-dropdown"
        @visible-change="userCardVisible = $event"
      >
        <button class="avatar" type="button" :aria-label="`User menu for ${currentIdentity.displayName || userStore.user.email}`" aria-haspopup="menu">
          <hq-avatar
            :src="currentIdentity.avatarUrl"
            :name="currentIdentity.displayName"
            :username="currentIdentity.username"
            :size="32"
            :tooltip="false"
            :show-presence="true"
            :presence="presence"
          />
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </button>
        <template #dropdown>
          <div class="user-details">
            <div class="profile-identity">
              <hq-avatar
                :src="currentIdentity.avatarUrl"
                :name="currentIdentity.displayName"
                :username="currentIdentity.username"
                :size="48"
                :show-presence="true"
                :presence="presence"
              />
              <div class="profile-identity-copy">
                <div class="user-name">{{ currentIdentity.displayName }}</div>
                <div v-if="currentIdentity.username" class="detail-username">@{{ currentIdentity.username }}</div>
                <div class="detail-email" @click="copyEmail(userStore.user.email)">
                  {{ userStore.user.email }}
                </div>
              </div>
            </div>
            <div class="profile-context">
              <span v-if="currentIdentity.jobTitle" class="profile-context-item">{{ currentIdentity.jobTitle }}</span>
              <span v-if="currentIdentity.jobTitle && currentIdentity.team" class="profile-context-sep" aria-hidden="true">·</span>
              <span v-if="currentIdentity.team" class="profile-context-item">{{ currentIdentity.team.name }}</span>
            </div>
            <div class="profile-access">
              <Icon icon="fluent:shield-keyhole-20-regular" width="14" height="14" />
              <span>{{ accessSummary }}</span>
            </div>
            <div class="profile-links">
              <button type="button" @click="goSetting('profile')">
                <Icon icon="fluent:person-20-regular" width="16" height="16" />
                <span>{{ $t('myProfile') }}</span>
              </button>
              <button type="button" @click="goSetting('accounts')">
                <Icon icon="fluent:mail-multiple-20-regular" width="16" height="16" />
                <span>{{ $t('mailAccounts') }}</span>
              </button>
              <button type="button" @click="goSetting('security')">
                <Icon icon="fluent:shield-keyhole-20-regular" width="16" height="16" />
                <span>{{ $t('security') }}</span>
              </button>
            </div>
            <div class="logout">
              <el-button :loading="logoutLoading" @click="clickLogout">{{ $t('logOut') }}</el-button>
            </div>
          </div>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import router from "@/router";
import hanburger from '@/components/hamburger/index.vue'
import {logout} from "@/request/login.js";
import {Icon} from "@iconify/vue";
import HqAvatar from "@/components/hq-avatar/index.vue";
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute} from "vue-router";
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import emailSearch from '@/components/email-search/index.vue'
import allEmailSearch from '@/components/all-email-search/index.vue'
import {useEmailStore} from '@/store/email.js'
import {useSendStore} from '@/store/send.js'
import {workspaceModules} from '@/modules/registry.js'
import {useNotificationStore} from "@/store/notification.js"
import {useAiStore} from "@/store/ai.js"
import { usePresence } from "@/composables/use-presence.js"

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const emailStore = useEmailStore()
const sendStore = useSendStore()
const notificationStore = useNotificationStore();
const aiStore = useAiStore();
const { online } = usePresence();
const presence = computed(() => online.value ? 'online' : 'offline');
const userRole = computed(() => userStore.user.role || { name: '', sendType: 'count', sendCount: 0, accountCount: 0 })
const userRoleName = computed(() => userRole.value.name || (userStore.user.type === 0 ? 'Administrator' : 'Team member'))
const accessSummary = computed(() => `${userRoleName.value} access`)
const logoutLoading = ref(false)
const userDropdownRef = ref(null)
const notificationDropdownRef = ref(null)
const userCardVisible = ref(false)
const isMobileLayout = ref(window.innerWidth < 700)
const navigationExpanded = computed(() => isMobileLayout.value ? uiStore.asideShow : !uiStore.asideCollapsed)
const outsidePointerEvents = ['mousedown', 'pointerup', 'mouseup', 'click', 'pointercancel']
let blockOutsideClick = false
const inboxSearchOptions = computed(() => [
  {label: t('subject'), type: 'subject'},
  {label: t('searchSummaryContent'), type: 'content'},
  {label: t('sender'), type: 'sender'},
  {label: t('searchSenderAddress'), type: 'senderAddress'},
])
const sentSearchOptions = computed(() => [
  {label: t('subject'), type: 'subject'},
  {label: t('searchSummaryContent'), type: 'content'},
  {label: t('searchRecipientAddress'), type: 'recipientAddress'},
])
const showComposeAction = computed(() =>
  workspaceModules.find(module => module.id === 'mail')?.routeNames?.includes(route.name)
)
const accountPanelShow = computed(() => uiStore.accountShow && hasPerm('account:query'))
const showInboxSearch = computed(() =>
  route.meta.name === 'email' || isMailboxDetail('inbox')
)
const showSentSearch = computed(() =>
  route.meta.name === 'send' || isMailboxDetail('sent')
)
const showAllMailSearch = computed(() =>
  route.meta.name === 'all-email' || isMailboxDetail('all-mail')
)

const createGroups = computed(() => {
  // Only common human actions belong here. Every entry must be authorized and
  // open a real workflow; the exhaustive list of record types lives inside each
  // module. CRM deal/organization, the separate approval flow, standalone
  // reminders, team-duplicated calendar entries and the ambiguous "New event"
  // were removed from this menu on purpose.
  const groups = [
    {key: 'createGroupCommunication', match: ['email', 'send', 'content', 'draft', 'star', 'folder', 'requests'], items: [
      {label: t('createEmail'), routeName: 'send', icon: 'cil:send', perm: 'email:send'},
      {label: t('createRequest'), routeName: 'requests', icon: 'fluent:chat-add-20-regular', perm: 'requests:add', create: 'request'},
    ]},
    {key: 'createGroupRelationships', match: ['crm', 'crm-contacts', 'crm-leads', 'crm-deals', 'crm-activities'], items: [
      {label: t('createContact'), routeName: 'crm-contacts', icon: 'fluent:people-20-regular', perm: 'contacts:add', create: 'contact'},
      {label: t('createLead'), routeName: 'crm-leads', icon: 'fluent:person-add-20-regular', perm: 'leads:add', create: 'lead'},
    ]},
    {key: 'createGroupMyWork', match: ['projects', 'crm-tasks', 'notes', 'requests'], items: [
      {label: t('createTask'), routeName: 'crm-tasks', icon: 'fluent:clipboard-task-20-regular', perm: 'tasks:add', create: 'task'},
      {label: t('createProject'), routeName: 'projects', icon: 'fluent:folder-20-regular', perm: 'projects:add', create: 'project'},
      {label: t('createNote'), routeName: 'notes', icon: 'fluent:note-20-regular', perm: 'notes:add', create: 'note'},
    ]},
    {key: 'createGroupSchedule', match: ['calendar'], items: [
      // One calendar action: visibility (private / selected people / team /
      // company) is chosen inside the event dialog.
      {label: t('createCalendarEvent'), routeName: 'calendar', icon: 'fluent:calendar-ltr-20-regular', perm: 'calendar:add', create: 'personal'},
    ]},
    {key: 'createGroupDocuments', match: ['documents'], items: [
      {label: t('upload'), routeName: 'documents', icon: 'fluent:arrow-upload-20-regular', perm: 'documents:add', create: 'document'},
      {label: t('createFolder'), routeName: 'documents', icon: 'fluent:folder-add-20-regular', perm: 'documents:add', create: 'folder'},
    ]},
  ]

  const permitted = groups
    .map(group => ({...group, items: group.items.filter(item => hasPerm(item.perm))}))
    .filter(group => group.items.length > 0)

  // The module you are in decides which permitted group comes first, so Create
  // stays useful without turning into a site map.
  const current = String(route.name || '')
  const prioritized = permitted.filter(group => (group.match || []).includes(current))
  const rest = permitted.filter(group => !prioritized.includes(group))
  return [...prioritized, ...rest]
})

function openCreateItem(item) {
  router.push({name: item.routeName, query: item.create ? {create: item.create} : {}})
  if (window.innerWidth < 700) {
    uiStore.asideShow = false
  }
}

function isMailboxDetail(mailbox) {
  return route.meta.name === 'content' && route.params.mailbox === mailbox
}

function returnToList(listName) {
  if (route.meta.name !== 'content') return
  router.push({name: listName})
}

const accountCount = computed(() => {
  return userRole.value.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userRole.value.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userRole.value.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userRole.value.sendCount) {
    return t('unlimited')
  }

  if (userRole.value.sendType === 'day') {
    return t('daily')
  }

  if (userRole.value.sendType === 'count') {
    return t('total')
  }
})

const currentIdentity = computed(() => {
  const identity = userStore.user.identity || {}
  return {
    displayName: identity.displayName || userStore.user.name || '',
    username: identity.username || '',
    email: userStore.user.email || '',
    avatarUrl: identity.avatarUrl || '',
    jobTitle: identity.jobTitle || '',
    team: identity.team || null
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userRole.value.sendType === 'ban') {
    return null
  }

  if (userRole.value.sendType === 'internal') {
    return null
  }

  if (!userRole.value.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userRole.value.sendCount
})

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error(`${t('copyFailMsg')}:`, err);
    ElMessage({
      message: t('copyFailMsg'),
      type: 'error',
      plain: true,
    })
  }
}

function changeAside() {
  if (window.innerWidth < 700) {
    uiStore.asideShow = !uiStore.asideShow
    return
  }
  uiStore.asideCollapsed = !uiStore.asideCollapsed
}

function openSend() {
  uiStore.openCompose();
}

function openAi() {
  aiStore.open({page: route.name});
}

function goSetting(tab) {
  userDropdownRef.value?.handleClose();
  router.push({name: 'setting', query: {tab}});
}

function onNotificationToggle(visible) {
  if (!visible) return
  notificationStore.fetchList({page: 1, pageSize: 20}).catch(() => {})
}

async function markAllNotifications() {
  try {
    await notificationStore.markAllRead()
  } catch (err) {
    ElMessage({ message: t('notificationsMarkReadAllFailed'), type: 'error', plain: true })
  }
}

async function openNotification(item) {
  if (!item) return
  if (!item.is_read) {
    try {
      await notificationStore.markRead(item.id)
    } catch (err) {
      // Non-blocking: reading a notice must never break navigation.
    }
  }
  notificationDropdownRef.value?.handleClose()
  const link = typeof item.link === 'string' ? item.link.trim() : ''
  if (link.startsWith('/')) {
    router.push(link).catch(() => {})
  }
}

function clickLogout() {
  logoutLoading.value = true
  logout().then(() => {
    localStorage.removeItem("token")
    router.replace('/login')
  }).finally(() => {
    logoutLoading.value = false
  })
}

function formatName(email) {
  return email[0]?.toUpperCase() || ''
}

function isInsideUserCard(target) {
  const element = target instanceof Element ? target : target?.parentElement
  if (!(element instanceof Element)) return false
  if (userDropdownRef.value?.$el?.contains(element)) return true
  return !!element.closest('.detail-dropdown')
}

function handleUserCardPointerDown(event) {
  blockOutsideClick = userCardVisible.value && !isInsideUserCard(event.target)
  if (!blockOutsideClick) return

  event.preventDefault()
  event.stopPropagation()
  userDropdownRef.value?.handleClose()
}

function handleUserCardPointerEvent(event) {
  if (!blockOutsideClick) return
  event.preventDefault()
  event.stopPropagation()
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    setTimeout(() => {
      blockOutsideClick = false
    })
  }
}

function updateMobileLayout() {
  isMobileLayout.value = window.innerWidth < 700
}

onMounted(() => {
  window.addEventListener('resize', updateMobileLayout)
  document.addEventListener('pointerdown', handleUserCardPointerDown, true)
  outsidePointerEvents.forEach(type => {
    document.addEventListener(type, handleUserCardPointerEvent, true)
  })
  if (hasPerm('notifications:query')) {
    notificationStore.fetchList({page: 1, pageSize: 20}).catch(() => {})
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateMobileLayout)
  document.removeEventListener('pointerdown', handleUserCardPointerDown, true)
  outsidePointerEvents.forEach(type => {
    document.removeEventListener(type, handleUserCardPointerEvent, true)
  })
})

</script>
<style>
.detail-dropdown {
  color: var(--el-text-color-primary) !important;
}
</style>
<style lang="scss" scoped>

:deep(.el-popper.is-pure) {
  border-radius: 6px;
}

.user-details {
  width: 300px;
  max-width: calc(100vw - 24px);
  font-size: 14px;
  display: grid;
  grid-template-columns: 1fr;
  justify-items: stretch;
  padding: 4px 0 0;

  .user-name {
    font-weight: 650;
    font-size: 15px;
    letter-spacing: -.01em;
    color: var(--hq-text);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
  }

  .detail-user-type {
    margin-top: 10px;
  }

  .action-info {
    width: 100%;
    display: grid;
    grid-template-columns: auto auto;
    margin-top: 10px;

    > div:first-child {
      display: grid;
      align-items: center;
      gap: 10px;
    }

    > div:last-child {
      display: grid;
      gap: 10px;
      text-align: center;

      > div {
        display: flex;
        align-items: center;
      }
    }
  }

  .detail-email {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-align: left;
    color: var(--hq-muted);
    font-size: 12.5px;
    cursor: pointer;
  }

  .profile-links {
    width: 100%;
    display: grid;
    gap: 2px;
    margin-top: 12px;
    padding: 8px 10px 0;
    border-top: 1px solid var(--hq-border);

    button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 32px;
      padding: 0 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--hq-text-secondary);
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }

    button:hover {
      background: var(--hq-hover);
      color: var(--hq-text);
    }
  }

  .logout {
    margin-top: 12px;
    width: 100%;
    padding: 0 10px 10px;
    border-top: 1px solid var(--hq-border);
    padding-top: 10px;

    .el-button {
      border-radius: 6px;
      height: 30px;
      width: 100%;
    }
  }

  .profile-identity {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 14px 16px 0;
  }

  .profile-identity-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .profile-identity-copy .user-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-context {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin: 10px 16px 0;
    color: var(--hq-text-secondary);
    font-size: 12.5px;
  }

  .profile-context-sep {
    color: var(--hq-muted);
  }

  .profile-access {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 8px 16px 0;
    color: var(--hq-muted);
    font-size: 12px;
  }

  .detail-username {
    color: var(--hq-muted);
    font-size: 12px;
    font-weight: 550;
  }
}


.header {
  text-align: left;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 14px 0 10px;
  position: relative;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.header-search {
  flex: 1 1 auto;
  min-width: 0;
}

.header.not-send {
  display: flex;
}

@media (max-width: 767px) {
  .header {
    gap: 6px;
    padding: 0 10px 0 6px;
  }

  .header-btn {
    flex: 1;
  }

  .toolbar {
    padding-left: 5px;
    flex-shrink: 0;
    margin-left: 0;
  }

  .toolbar .create-btn {
    width: 32px;
    padding: 0;
    justify-content: center;
  }

  .toolbar .create-btn span {
    display: none;
  }
}

.writer-box {
  display: none;

  .writer {
    width: 34px;
    height: 34px;
    border-radius: 7px;
    color: #fff;
    background: var(--el-color-primary);
  }

  @media (max-width: 700px) {
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 0;
    flex-shrink: 0;

    .writer {
      width: 38px;
      height: 38px;
      border-radius: 7px;
      border: 1px solid var(--el-color-primary);
      color: #fff;
      background: var(--el-color-primary);
    }
  }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  height: 100%;
  min-width: 0;
}

.breadcrumb-item {
  min-width: 0;
  margin-left: 4px;
  font-weight: bold;
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

  .toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    flex: 0 0 auto;

    .create-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 10px;
      border: 1px solid var(--hq-border);
      border-radius: 6px;
      background: transparent;
      color: var(--hq-text-secondary);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color .15s ease, border-color .15s ease, color .15s ease;
    }

    .create-btn:hover {
      background: var(--hq-hover);
      color: var(--hq-text);
      border-color: var(--hq-border-strong);
    }

    .create-btn:focus-visible,
    .header-icon-btn:focus-visible,
    .notification-bell:focus-visible {
      outline: 2px solid var(--hq-focus);
      outline-offset: 2px;
    }

    .icon-item {
    align-self: center;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .icon-item:hover {
    background: var(--base-fill);
  }

  .avatar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 32px;
    margin-left: 6px;
    padding: 0 0 0 10px;
    border: 0;
    border-left: 1px solid var(--hq-border);
    background: transparent;
    font: inherit;
    cursor: pointer;

    .avatar-text {
      box-sizing: border-box;
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      height: 32px;
      width: 32px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 7px;
      border: 1px solid var(--dark-border);
    }

    .setting-icon {
      color: var(--hq-muted);
    }
  }

}

.avatar:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 3px;
}

.el-tooltip__trigger:first-child:focus-visible {
  outline: 2px solid rgba(255, 85, 0, .72);
  outline-offset: 3px;
}

.create-dropdown {
  min-width: 264px;
  max-width: 320px;
  max-height: 70vh;
  overflow-y: auto;
  border: 1px solid var(--hq-border) !important;
  border-radius: 8px !important;
  background: var(--el-bg-color) !important;
}

.create-dropdown .create-group-label {
  padding: 6px 12px 2px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--hq-text-secondary);
  cursor: default;
  opacity: 1;
  -webkit-text-fill-color: var(--hq-text-secondary);
  pointer-events: none;
}

.create-dropdown .create-group-label:hover {
  background: transparent;
}

.create-dropdown .el-dropdown-menu {
  background: var(--el-bg-color);
}

.create-dropdown .el-dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 12px;
  color: var(--el-text-color-primary);
  font-size: 13px;
}

.create-dropdown .el-dropdown-menu__item .iconify {
  flex: 0 0 auto;
  color: var(--hq-muted);
}

.create-dropdown .el-dropdown-menu__item:hover .iconify {
  color: var(--hq-text);
}

.create-dropdown .el-dropdown-menu__item:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.create-dropdown .create-item-disabled {
  color: var(--el-text-color-disabled);
  pointer-events: none;
}

.header-icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  cursor: pointer;
}

.header-icon-btn:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.notification-bell {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-text-secondary);
  cursor: pointer;
}

.notification-bell:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.notification-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--hq-danger);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-dropdown {
  width: 340px !important;
  max-width: calc(100vw - 24px);
  padding: 0 !important;
  border: 1px solid var(--hq-border) !important;
  border-radius: 10px !important;
  background: var(--el-bg-color) !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .18) !important;
  overflow: hidden;
}

.notification-panel {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.notification-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--hq-border);
}

.notification-panel-title {
  font-size: 13px;
  font-weight: 650;
  color: var(--hq-text);
  letter-spacing: -.01em;
}

.notification-markall {
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 12px;
  font-weight: 550;
  color: var(--hq-accent);
  cursor: pointer;
}

.notification-markall:hover {
  text-decoration: underline;
}

.notification-state {
  padding: 26px 16px;
  text-align: center;
  font-size: 12.5px;
  color: var(--hq-muted);
}

.notification-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  overflow-y: auto;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color .15s ease;
}

.notification-item:hover {
  background: var(--hq-hover);
}

.notification-item.is-unread {
  background: var(--hq-selected);
}

.notification-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: transparent;
}

.notification-item.is-unread .notification-dot {
  background: var(--hq-accent);
}

.notification-item-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notification-item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--hq-text);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.notification-item-text {
  font-size: 12px;
  color: var(--hq-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
