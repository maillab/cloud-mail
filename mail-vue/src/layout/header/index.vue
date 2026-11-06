<template>
  <div class="header">
    <div class="header-btn">
      <hanburger @click="changeAside"></hanburger>
      <span class="breadcrumb-item">{{ $t(route.meta.title) }}</span>
    </div>
    <div v-perm="'email:send'" class="writer-box" @click="openSend">
      <div class="writer">
        <Icon icon="material-symbols:edit-outline-sharp" width="22" height="22"/>
      </div>
    </div>
    <email-search
      v-if="showInboxSearch"
      :store="emailStore"
      :search-options="inboxSearchOptions"
      class="header-search"
      @search="returnToList('email')"
      @reset="returnToList('email')"
    />
    <email-search
      v-else-if="showSentSearch"
      :store="sendStore"
      :search-options="sentSearchOptions"
      class="header-search"
      @search="returnToList('send')"
      @reset="returnToList('send')"
    />
    <div class="toolbar">
      <el-dropdown v-if="canManage" :teleported="false" trigger="click" placement="bottom-end"
                   popper-class="manage-dropdown">
        <div class="icon-item manage-entry" :title="$t('manage')">
          <Icon icon="akar-icons:dot-grid-fill" width="18" height="18"/>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="item in manageItems" :key="item.name"
                              @click="router.push({name: item.name})">
              <div class="manage-row">
                <Icon :icon="item.icon" width="18" height="18"/>
                <span>{{ $t(item.label) }}</span>
              </div>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <div v-if="uiStore.dark" class="sun-icon icon-item" @click="openDark($event)">
        <Icon icon="mingcute:sun-fill"/>
      </div>
      <div v-else class="dark-icon icon-item" @click="openDark($event)">
        <Icon icon="solar:moon-linear"/>
      </div>
      <div class="notice icon-item" @click="openNotice">
        <Icon icon="streamline-plump:announcement-megaphone"/>
      </div>
      <el-dropdown ref="userDropdownRef" trigger="click" :teleported="false" popper-class="detail-dropdown"
                   @visible-change="userCardVisible = $event">
        <div class="avatar">
          <div class="avatar-text">
            <div>{{ formatName(userStore.user.email) }}</div>
          </div>
          <Icon class="setting-icon" icon="mingcute:down-small-fill" width="24" height="24"/>
        </div>
        <template #dropdown>
          <div class="user-details">
            <div class="card-head">
              <div class="card-avatar">{{ formatName(userStore.user.email) }}</div>
              <div class="card-id">
                <div class="card-name">{{ userStore.user.name }}</div>
                <div class="card-email" @click="copyEmail(userStore.user.email)">
                  {{ userStore.user.email }}
                </div>
              </div>
            </div>
            <div class="card-rows">
              <div class="card-row">
                <span class="row-label">{{ $t('quotaSend') }}</span>
                <span class="row-value">
                  <span v-if="sendCount" class="row-num">{{ sendCount }}</span>
                  <el-tag size="small" effect="plain">{{ sendType }}</el-tag>
                </span>
              </div>
              <div class="card-row">
                <span class="row-label">{{ $t('quotaAccount') }}</span>
                <span class="row-value">
                  <el-tag v-if="settingStore.settings.manyEmail || settingStore.settings.addEmail" size="small" effect="plain">
                    {{ $t('disabled') }}
                  </el-tag>
                  <span v-else-if="accountCount && hasPerm('account:add')" class="row-num">
                    {{ $t('totalUserAccount', {msg: accountCount}) }}
                  </span>
                  <el-tag v-else-if="!accountCount && hasPerm('account:add')" size="small" effect="plain">
                    {{ $t('unlimited') }}
                  </el-tag>
                  <el-tag v-else-if="!hasPerm('account:add')" size="small" effect="plain">
                    {{ $t('unauthorized') }}
                  </el-tag>
                </span>
              </div>
              <div class="card-row">
                <span class="row-label">{{ $t('quotaRole') }}</span>
                <span class="row-value">
                  <el-tag size="small" effect="plain">{{ userStore.user.role.name }}</el-tag>
                </span>
              </div>
            </div>
            <button type="button" class="card-action" :disabled="logoutLoading" @click="clickLogout">
              <Icon icon="fluent:arrow-exit-20-regular" width="18" height="18"/>
              <span>{{ $t('logOut') }}</span>
            </button>
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
import {useUiStore} from "@/store/ui.js";
import {useUserStore} from "@/store/user.js";
import {useRoute} from "vue-router";
import {computed, onBeforeUnmount, onMounted, ref} from "vue";
import {useSettingStore} from "@/store/setting.js";
import {hasPerm} from "@/perm/perm.js"
import {useI18n} from "vue-i18n";
import {setExtend} from "@/utils/day.js"
import {useWriterStore} from "@/store/writer.js"
import emailSearch from '@/components/email-search/index.vue'
import {useEmailStore} from '@/store/email.js'
import {useSendStore} from '@/store/send.js'

const {t} = useI18n();
const route = useRoute();
const settingStore = useSettingStore();
const userStore = useUserStore();
const uiStore = useUiStore();
const writerStore = useWriterStore();
const emailStore = useEmailStore()
const sendStore = useSendStore()
const logoutLoading = ref(false)
const userDropdownRef = ref(null)
const userCardVisible = ref(false)
const outsidePointerEvents = ['mousedown', 'pointerup', 'mouseup', 'click', 'pointercancel']
let blockOutsideClick = false
const inboxSearchOptions = computed(() => [
  {label: t('titleDesc'), type: 'subject'},
  {label: t('searchSummaryContent'), type: 'content'},
  {label: t('sender'), type: 'sender'},
  {label: t('searchSenderAddress'), type: 'senderAddress'},
])
const sentSearchOptions = computed(() => [
  {label: t('titleDesc'), type: 'subject'},
  {label: t('searchSummaryContent'), type: 'content'},
  {label: t('searchRecipientAddress'), type: 'recipientAddress'},
])
const accountPanelShow = computed(() => uiStore.accountShow && hasPerm('account:query'))
const showInboxSearch = computed(() =>
  route.meta.name === 'email' || isMailboxDetail('inbox')
)
const showSentSearch = computed(() =>
  route.meta.name === 'send' || isMailboxDetail('sent')
)

function isMailboxDetail(mailbox) {
  return route.meta.name === 'content' && route.params.mailbox === mailbox
}

function returnToList(listName) {
  if (route.meta.name !== 'content') return
  router.push({name: listName})
}

const MANAGE_ITEMS = [
  {name: 'analysis', icon: 'fluent:data-pie-20-regular', label: 'analytics', perm: 'analysis:query'},
  {name: 'user', icon: 'si:user-alt-2-line', label: 'allUsers', perm: 'user:query'},
  {name: 'all-email', icon: 'fluent:mail-list-28-regular', label: 'allMail', perm: 'all-email:query'},
  {name: 'role', icon: 'fluent:lock-closed-16-regular', label: 'permissions', perm: 'role:query'},
  {name: 'reg-key', icon: 'fluent:fingerprint-20-filled', label: 'inviteCode', perm: 'reg-key:query'},
  {name: 'sys-setting', icon: 'eos-icons:system-ok-outlined', label: 'SystemSettings', perm: 'setting:query'}
]

const permKeys = computed(() => userStore.user?.permKeys || [])

const manageItems = computed(() => {
  return MANAGE_ITEMS.filter(item => permKeys.value.includes('*') || permKeys.value.includes(item.perm))
})

const canManage = computed(() => manageItems.value.length > 0)

const accountCount = computed(() => {
  return userStore.user.role.accountCount
})

const sendType = computed(() => {

  if (settingStore.settings.send === 1) {
    return t('disabled')
  }

  if (!hasPerm('email:send')) {
    return t('unauthorized')
  }

  if (userStore.user.role.sendType === 'ban') {
    return t('sendBanned')
  }

  if (userStore.user.role.sendType === 'internal') {
    return t('sendInternal')
  }

  if (!userStore.user.role.sendCount) {
    return t('unlimited')
  }

  if (userStore.user.role.sendType === 'day') {
    return t('daily')
  }

  if (userStore.user.role.sendType === 'count') {
    return t('total')
  }
})

const sendCount = computed(() => {


  if (!hasPerm('email:send')) {
    return null
  }

  if (userStore.user.role.sendType === 'ban') {
    return null
  }

  if (userStore.user.role.sendType === 'internal') {
    return null
  }

  if (!userStore.user.role.sendCount) {
    return null
  }

  if (settingStore.settings.send === 1) {
    return null
  }

  return userStore.user.sendCount + '/' + userStore.user.role.sendCount
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

function changeLang(lang) {
  setExtend(lang === 'en' ? 'en' : 'zh-cn')
  settingStore.lang = lang
}

function openNotice() {
  uiStore.showNotice()
}

function openDark(e) {

  const nextIsDark = !uiStore.dark
  const root = document.documentElement

  if (!document.startViewTransition) {
    switchDark(nextIsDark, root);
    return
  }

  const x = e.clientX
  const y = e.clientY

  const maxX = Math.max(x, window.innerWidth - x)
  const maxY = Math.max(y, window.innerHeight - y)
  const endRadius = Math.hypot(maxX, maxY)

  // 标记切换目标，供 CSS 选择器使用
  root.setAttribute('data-theme-to', nextIsDark ? 'dark' : 'light')
  root.style.setProperty('--vt-x', `${x}px`)
  root.style.setProperty('--vt-y', `${y}px`)
  root.style.setProperty('--vt-end-radius', `${endRadius + 10}px`)

  const transition = document.startViewTransition(() => {
    switchDark(nextIsDark, root);
  })

  transition.finished.finally(() => {
    // 清理标记
    root.removeAttribute('data-theme-to')
  })
}

function switchDark(nextIsDark, root) {
  root.setAttribute('class', nextIsDark ? 'dark' : '')
  const metaTag = document.getElementById('theme-color-meta');
  const isMobile =  !window.matchMedia("(pointer: fine) and (hover: hover)").matches;
  metaTag.setAttribute('content', nextIsDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#191A23' : '#F1F1F1'));
  uiStore.dark = nextIsDark
}

function openSend() {
  writerStore.startNew()
}

function changeAside() {
  // 窄屏是抽屉，宽屏是「收起成图标栏」
  if (window.innerWidth < 1025) {
    uiStore.asideShow = !uiStore.asideShow
  } else {
    uiStore.asideCollapse = !uiStore.asideCollapse
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

onMounted(() => {
  document.addEventListener('pointerdown', handleUserCardPointerDown, true)
  outsidePointerEvents.forEach(type => {
    document.addEventListener(type, handleUserCardPointerEvent, true)
  })
})

onBeforeUnmount(() => {
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
  width: 288px;
  padding: 6px 0 0;
  font-size: 13px;
  display: flex;
  flex-direction: column;

  .card-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px 16px;
  }

  .card-avatar {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 600;
    color: #ffffff;
    background: var(--el-color-primary);
    user-select: none;
  }

  .card-id {
    min-width: 0;
    flex: 1;
  }

  .card-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .card-email {
    margin-top: 2px;
    font-size: 12.5px;
    color: var(--secondary-text-color);
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

    &:hover {
      color: var(--el-color-primary);
    }
  }

  .card-rows {
    padding: 4px 16px 10px;
    border-top: 1px solid var(--mail-hairline);
  }

  .card-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
  }

  .row-label {
    color: var(--secondary-text-color);
    white-space: nowrap;
  }

  .row-value {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--el-text-color-primary);
    text-align: right;
  }

  .row-num {
    font-variant-numeric: tabular-nums;
  }

  .card-action {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 11px 16px;
    border-top: 1px solid var(--mail-hairline);
    color: var(--el-text-color-regular);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease, color 0.12s ease;

    &:hover {
      background: var(--mail-nav-hover);
      color: var(--el-text-color-primary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
}


.header {
  font-size: 12px;
  display: flex;
  align-items: center;
  height: 100%;
  gap: 8px;
}

/* 上游的搜索框是绝对定位的，这里改成参与 flex 布局，居中放在标题和工具区之间 */
.header-search {
  position: static !important;
  top: auto !important;
  transform: none !important;
  flex: 1 1 0;
  width: auto !important;
  min-width: 0;
  max-width: 460px;
  margin: 0 12px;

  @media (max-width: 767px) {
    flex: 0 0 auto;
    margin: 0 2px;
  }
}

.writer-box {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  .writer {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    color: #ffffff;
    background: var(--el-color-primary);
    transition: background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 18px !important;
      height: 18px !important;
    }

    .writer-text {
      margin-left: 15px;
      font-size: 14px;
      font-weight: bold;;
    }
  }

  &:hover .writer {
    background: var(--el-color-primary-dark-2);
  }
}

.header-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 100%;
  min-width: 0;
  flex-shrink: 0;
}

.breadcrumb-item {
  font-weight: 500;
  font-size: 14px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: end;
  margin-left: auto;
  flex-shrink: 0;
  gap: 6px;
  @media (max-width: 767px) {
    gap: 4px;
  }

  .icon-item {
    align-self: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--regular-text-color);
    transition: background 0.15s ease, color 0.15s ease;

    svg {
      width: 18px !important;
      height: 18px !important;
    }
  }

  .icon-item:hover {
    background: var(--base-fill);
    color: var(--el-text-color-primary);
  }

  .notice {
    margin-right: 2px;
  }

  .avatar {
    display: flex;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    padding-left: 4px;

    .avatar-text {
      background: var(--el-bg-color);
      color: var(--el-text-color-primary);
      height: 30px;
      width: 30px;
      font-size: 13px;
      font-weight: 600;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 8px;
      border: 1px solid var(--mail-hairline-strong);
    }

    .setting-icon {
      position: relative;
      top: 0;
      margin-right: 2px;
      bottom: 10px;
      color: var(--secondary-text-color);
    }
  }

}

.el-tooltip__trigger:first-child:focus-visible {
  outline: unset;
}

/* 管理入口挪到右上角 */
.manage-entry {
  color: var(--regular-text-color);
}

.manage-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13.5px;
}

:deep(.manage-dropdown.el-popper) {
  border-radius: 10px;
}

/* 宽屏用侧边栏里的「写邮件」胶囊按钮，窄屏保留顶栏这个图标按钮 */
@media (min-width: 1025px) {
  .writer-box {
    display: none;
  }
}
</style>
