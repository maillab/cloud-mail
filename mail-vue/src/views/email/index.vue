<template>
  <div class="inbox-workspace">
    <section class="message-column" aria-label="Message list">
      <header class="inbox-heading">
        <div class="inbox-title">
          <div class="eyebrow">MAILBOX</div>
          <h1>Inbox</h1>
          <div v-if="unreadCount" class="inbox-subtitle">{{ unreadCount }} unread</div>
        </div>
        <el-dropdown trigger="click" @command="toggleFilter">
          <button type="button" class="filter-btn" :class="{ active: hasActiveFilter }" aria-label="Filter messages">
            <Icon icon="fluent:filter-16-regular" width="15" height="15" />
            <span>Filter</span>
            <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="unread">
                <span class="filter-option" :class="{ 'is-on': emailStore.searchParams.unreadOnly }">Unread only</span>
              </el-dropdown-item>
              <el-dropdown-item command="starred">
                <span class="filter-option" :class="{ 'is-on': emailStore.searchParams.starredOnly }">Starred only</span>
              </el-dropdown-item>
              <el-dropdown-item command="attachments">
                <span class="filter-option" :class="{ 'is-on': emailStore.searchParams.hasAttachments }">Has attachments</span>
              </el-dropdown-item>
              <el-dropdown-item command="clear" divided>Clear filters</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>
      <emailScroll ref="scroll"
                 :cancel-success="cancelStar"
                 :star-success="addStar"
                 :getEmailList="getEmailList"
                 :emailDelete="deleteMessages"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :email-read="markRead"
                 :mailbox-actions="mailboxActions"
                 :mailbox-action="applyMailboxAction"
                 :selected-email-id="emailStore.contentData.email?.emailId || 0"
                 :highlight-text="emailStore.searchParams.text"
                 :show-unread="true"
                 actionLeft="4px"
                 @jump="jumpContent"
      />
    </section>
    <section class="reading-pane" aria-label="Email reader">
      <ContentView
        v-if="emailStore.contentData.email"
        embedded
        @close="closeReader"
      />
      <div v-else class="reader-empty">
        <span class="reader-empty-icon"><Icon icon="hugeicons:mail-open-01" width="26" height="26" /></span>
        <p class="reader-empty-title">No message selected</p>
        <p class="reader-empty-hint">Choose a conversation from the list to read it here.</p>
      </div>
    </section>
  </div>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {mailboxFolderList, mailboxMove, mailboxCounts} from "@/request/mailbox.js";
import {computed, defineOptions, onMounted, onUnmounted, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import router from "@/router/index.js";
import { useRoute } from 'vue-router'
import ContentView from '@/views/content/index.vue'
import { Icon } from '@iconify/vue'

defineOptions({
  name: 'email'
})

const route = useRoute();
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({})
const isDesktop = ref(window.innerWidth >= 700)
const mailboxActions = ref([
  {label: 'Archive', value: 'archive'},
  {label: 'Move to Spam', value: 'spam'},
  {label: 'Move to Trash', value: 'trash'},
  {label: 'Snooze for 1 hour', value: 'snooze-hour'},
  {label: 'Snooze until tomorrow', value: 'snooze-tomorrow'},
  {label: 'Mark as Newsletter', value: 'category:newsletter'},
  {label: 'Mark as Notification', value: 'category:notification'},
  {label: 'Mark as Primary', value: 'category:primary'},
])
const hasActiveFilter = computed(() =>
  Boolean(emailStore.searchParams.unreadOnly || emailStore.searchParams.starredOnly || emailStore.searchParams.hasAttachments)
)
const activeFilterCount = computed(() =>
  [emailStore.searchParams.unreadOnly, emailStore.searchParams.starredOnly, emailStore.searchParams.hasAttachments].filter(Boolean).length
)
const folderCounts = ref({})
const unreadCount = computed(() => Number(folderCounts.value.unread) || 0)

function loadFolderCounts() {
  mailboxCounts()
    .then(counts => { folderCounts.value = counts || {} })
    .catch(error => console.error('Mailbox counts failed:', error))
}
onMounted(() => {
  emailStore.emailScroll = scroll;
  window.addEventListener('resize', updateDesktopLayout)
  window.addEventListener('mailbox:updated', loadFolderCounts)
  loadFolderCounts()
  latest()
  mailboxFolderList().then(folders => {
    mailboxActions.value.push(...folders.map(folder => ({
      label: `Move to ${folder.name}`,
      value: `custom:${folder.folderId}`,
    })))
  }).catch(error => console.error(error))
})

onUnmounted(() => {
  window.removeEventListener('resize', updateDesktopLayout)
  window.removeEventListener('mailbox:updated', loadFolderCounts)
})

function updateDesktopLayout() {
  isDesktop.value = window.innerWidth >= 700
}

function toggleFilter(key) {
  const params = emailStore.searchParams
  if (key === 'clear') {
    emailStore.setSearchParams({unreadOnly: false, starredOnly: false, hasAttachments: false})
    return
  }
  if (key === 'unread') {
    emailStore.setSearchParams({unreadOnly: !params.unreadOnly})
  } else if (key === 'starred') {
    emailStore.setSearchParams({starredOnly: !params.starredOnly})
  } else if (key === 'attachments') {
    emailStore.setSearchParams({hasAttachments: !params.hasAttachments})
  }
}


watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})

watch(
  () => emailStore.searchParams,
  () => {
    scroll.value.refreshList()
  },
  {deep: true}
)

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  if (!isDesktop.value) router.push('/messages')
}

function closeReader() {
  emailStore.contentData.email = null
  emailStore.contentData.showUnread = false
}

const existIds = new Set();

async function latest() {
  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    if (route.name !== 'email') {
      continue;
    }

    const searchParams = emailStore.searchParams
    if (searchParams.text || searchParams.startDate || searchParams.endDate
      || searchParams.unreadOnly || searchParams.starredOnly || searchParams.hasAttachments) {
      continue
    }

    const latestId = scroll.value.latestEmail?.emailId

    if (!scroll.value.firstLoad && autoRefresh > 1) {
      try {
        const accountId = accountStore.currentAccountId
        const allReceive = scroll.value.latestEmail?.allReceive
        let list = []

        //确保发起请求时最后一个邮件是当前账号的,或者
        if (accountId === scroll.value.latestEmail?.reqAccountId) {
          list = await emailLatest(latestId, accountId, allReceive);
        }

        //确保请求回来后，账号没有切换，时间排序没有改变，全部邮件类型没变
        if (accountId === accountStore.currentAccountId && allReceive === accountStore.currentAccount.allReceive) {
          if (list.length > 0) {
            emailStore.applyFullList(list)

            for (let email of list) {

              email.reqAccountId = accountId;
              email.allReceive = allReceive;

              if (!existIds.has(email.emailId)) {

                existIds.add(email.emailId)
                scroll.value.addItem(email)

                await sleep(50)
              }

            }
            window.dispatchEvent(new Event('mailbox:updated'))

          }

        }
      } catch (e) {
        if (e.code === 401 || e.code === 403) {
          settingStore.settings.autoRefresh = 0;
        }
        console.error(e)
      }
    }
  }
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailStore.fetchList(full =>
    emailList(accountId, allReceive, emailId, 0, size, 0, full, emailStore.searchParams)
  ).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

function markRead(ids) {
  return emailRead(ids).then(result => {
    window.dispatchEvent(new Event('mailbox:updated'))
    return result
  })
}

function deleteMessages(ids) {
  return emailDelete(ids).then(result => {
    window.dispatchEvent(new Event('mailbox:updated'))
    return result
  })
}

async function applyMailboxAction(ids, action) {
  if (action.startsWith('category:')) {
    await mailboxMove(ids, {category: action.slice('category:'.length)})
  } else if (action.startsWith('custom:')) {
    await mailboxMove(ids, {customFolderId: Number(action.slice('custom:'.length))})
  } else if (action === 'snooze-hour' || action === 'snooze-tomorrow') {
    const delay = action === 'snooze-hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    await mailboxMove(ids, 'snoozed', new Date(Date.now() + delay).toISOString())
  } else {
    await mailboxMove(ids, action)
  }
  window.dispatchEvent(new Event('mailbox:updated'))
}

</script>
<style>
.icon {
  cursor: pointer;
}
</style>
<style scoped>
.inbox-workspace {
  display: grid;
  grid-template-columns: minmax(225px, 44%) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}

.message-column {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.inbox-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 70px;
  padding: 12px 18px;
}

.eyebrow {
  margin-bottom: 3px;
  color: var(--el-text-color-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .13em;
}

.inbox-heading h1 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -.025em;
}

.inbox-title {
  min-width: 0;
}

.inbox-subtitle {
  margin-top: 2px;
  color: var(--hq-muted);
  font-size: 11px;
}

.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  flex: 0 0 auto;
  border: 1px solid var(--hq-border);
  border-radius: 7px;
  background: transparent;
  color: var(--hq-text-secondary);
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
}

.filter-btn:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.filter-btn.active {
  border-color: var(--hq-border-strong);
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
}

.filter-btn:focus-visible {
  outline: 2px solid var(--hq-focus);
  outline-offset: 2px;
}

.filter-count {
  display: inline-grid;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  place-items: center;
  border-radius: 8px;
  background: var(--hq-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.filter-option.is-on {
  color: var(--hq-accent-strong);
  font-weight: 600;
}

.reader-empty {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px;
  text-align: center;
  color: var(--hq-muted);
}

.reader-empty-icon {
  display: grid;
  width: 52px;
  height: 52px;
  margin-bottom: 6px;
  place-items: center;
  border: 1px solid var(--hq-border);
  border-radius: 14px;
  background: var(--hq-surface);
  color: var(--hq-text-secondary);
}

.reader-empty-title {
  margin: 0;
  color: var(--hq-text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.reader-empty-hint {
  max-width: 260px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.reading-pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--el-border-color);
}

.reading-pane :deep(.el-empty) {
  height: 100%;
}

@media (min-width: 701px) and (max-width: 900px) {
  .inbox-workspace {
    grid-template-columns: minmax(225px, 46%) minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  .inbox-workspace {
    display: block;
  }

  .message-column {
    height: 100%;
    border-right: 0;
  }

  .reading-pane {
    display: none;
  }

  .filter-btn span:not(.filter-count) {
    display: none;
  }
}

@media (max-width: 480px) {
  .inbox-heading {
    min-height: 64px;
    padding: 10px 14px;
  }
}
</style>
