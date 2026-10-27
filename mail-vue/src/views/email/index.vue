<template>
  <div class="inbox-workspace">
    <section class="message-column" aria-label="Message list">
      <header class="inbox-heading">
        <div>
          <div class="eyebrow">MAILBOX</div>
          <h1>Inbox</h1>
        </div>
        <span class="account-label">{{ accountStore.currentAccount?.email || '' }}</span>
      </header>
      <nav class="inbox-filters" aria-label="Filter inbox">
        <button
          v-for="filter in inboxFilters"
          :key="filter.key"
          type="button"
          :class="{ active: activeFilter === filter.key }"
          :aria-pressed="activeFilter === filter.key"
          @click="setInboxFilter(filter.key)"
        >{{ filter.label }}</button>
      </nav>
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
      <el-empty v-else description="Select an email to read" />
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
import {mailboxFolderList, mailboxMove} from "@/request/mailbox.js";
import {computed, defineOptions, onMounted, onUnmounted, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import router from "@/router/index.js";
import { useRoute } from 'vue-router'
import ContentView from '@/views/content/index.vue'

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
const inboxFilters = [
  {key: 'all', label: 'All'},
  {key: 'unread', label: 'Unread'},
  {key: 'starred', label: 'Starred'},
  {key: 'attachments', label: 'Attachments'},
]
const activeFilter = computed(() => {
  const params = emailStore.searchParams
  if (params.unreadOnly) return 'unread'
  if (params.starredOnly) return 'starred'
  if (params.hasAttachments) return 'attachments'
  return 'all'
})
onMounted(() => {
  emailStore.emailScroll = scroll;
  window.addEventListener('resize', updateDesktopLayout)
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
})

function updateDesktopLayout() {
  isDesktop.value = window.innerWidth >= 700
}

function setInboxFilter(filter) {
  emailStore.setSearchParams({
    unreadOnly: filter === 'unread',
    starredOnly: filter === 'starred',
    hasAttachments: filter === 'attachments',
  })
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
  grid-template-columns: minmax(220px, 42%) minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--el-bg-color);
}

.message-column {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
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

.account-label {
  max-width: 52%;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inbox-filters {
  display: flex;
  gap: 5px;
  padding: 0 14px 10px;
  border-bottom: 1px solid var(--el-border-color);
}

.inbox-filters button {
  min-height: 29px;
  padding: 0 11px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--el-text-color-secondary);
  font-size: 11px;
  font-weight: 550;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease, border-color .15s ease;
}

.inbox-filters button:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}

.inbox-filters button.active {
  border-color: var(--el-border-color);
  background: #252321;
  color: #fff;
}

.inbox-filters button.active:hover {
  background: #383431;
  color: #fff;
  color: var(--el-text-color-primary);
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
}

@media (max-width: 480px) {
  .inbox-heading {
    min-height: 64px;
    padding: 10px 14px;
  }

  .inbox-filters {
    gap: 2px;
    padding: 0 10px 10px;
  }

  .inbox-filters button {
    padding: 0 9px;
  }
}
</style>
