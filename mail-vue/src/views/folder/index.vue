<template>
  <div class="folder-view">
    <div class="folder-heading">
      <h2>{{ title }}</h2>
    </div>
    <emailScroll
      ref="scroll"
      :get-email-list="getEmailList"
      :email-delete="deleteMessages"
      :star-add="starAdd"
      :star-cancel="starCancel"
      :email-read="markRead"
      :mailbox-actions="actions"
      :mailbox-action="applyAction"
      :show-unread="true"
      :type="folderKey === 'sent' || folderKey === 'outbox' ? 'send' : 'email'"
      @jump="jumpContent"
    />
  </div>
</template>

<script setup>
import {computed, onMounted, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useAccountStore} from '@/store/account.js'
import {useEmailStore} from '@/store/email.js'
import {emailDelete, emailList, emailRead} from '@/request/email.js'
import {starAdd, starCancel} from '@/request/star.js'
import {mailboxFolderList, mailboxMove} from '@/request/mailbox.js'
import emailScroll from '@/components/email-scroll/index.vue'
import router from '@/router/index.js'

const route = useRoute()
const accountStore = useAccountStore()
const emailStore = useEmailStore()
const scroll = ref(null)
const customFolders = ref([])

const folderKey = computed(() => String(route.params.folderKey || 'inbox'))
const title = computed(() => {
  if (folderKey.value.startsWith('custom-')) {
    return customFolders.value.find(folder => folder.folderId === Number(folderKey.value.slice(7)))?.name || 'Folder'
  }
  return ({
    'all-unread': 'All unread',
    inbox: 'Inbox',
    sent: 'Sent',
    snoozed: 'Snoozed',
    spam: 'Spam',
    trash: 'Trash',
    archive: 'Archive',
    outbox: 'Outbox',
    newsletter: 'Newsletter',
    notification: 'Notification',
  })[folderKey.value] || 'Folder'
})

const actions = computed(() => {
  const isOutgoing = folderKey.value === 'sent' || folderKey.value === 'outbox'
  const isTrash = folderKey.value === 'trash'
  const systemActions = isTrash
    ? [
      {label: 'Restore to Inbox', value: 'inbox'},
      {label: 'Restore to Sent', value: 'sent'},
      {label: 'Archive', value: 'archive'},
    ]
    : isOutgoing
      ? [
        {label: 'Archive', value: 'archive'},
        {label: 'Move to Trash', value: 'trash'},
      ]
      : [
        {label: 'Move to Inbox', value: 'inbox'},
        {label: 'Archive', value: 'archive'},
        {label: 'Move to Spam', value: 'spam'},
        {label: 'Move to Trash', value: 'trash'},
        {label: 'Snooze for 1 hour', value: 'snooze-hour'},
        {label: 'Snooze until tomorrow', value: 'snooze-tomorrow'},
        {label: 'Mark as Newsletter', value: 'category:newsletter'},
        {label: 'Mark as Notification', value: 'category:notification'},
        {label: 'Mark as Primary', value: 'category:primary'},
      ]
  return [
    ...systemActions,
    ...customFolders.value.map(folder => ({
      label: `Move to ${folder.name}`,
      value: `custom:${folder.folderId}`,
    })),
  ]
})

onMounted(async () => {
  emailStore.emailScroll = scroll
  customFolders.value = await mailboxFolderList()
})

watch(() => route.params.folderKey, () => scroll.value?.refreshList())
watch(() => accountStore.currentAccountId, () => scroll.value?.refreshList())
watch(() => emailStore.searchParams, () => scroll.value?.refreshList(), {deep: true})

function getEmailList(emailId, size, full = true) {
  const account = accountStore.currentAccount
  const accountId = Number(account?.accountId)
  const customFolderId = folderKey.value.startsWith('custom-')
    ? Number(folderKey.value.slice(7))
    : undefined
  const key = customFolderId ? 'custom' : folderKey.value
  return emailStore.fetchList(isFull => emailList(
    accountId,
    account?.allReceive,
    emailId,
    0,
    size,
    key === 'sent' ? 1 : 0,
    isFull,
    {...emailStore.searchParams, folderKey: key, customFolderId}
  ))
}

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/messages')
}

function deleteMessages(ids) {
  return emailDelete(ids, folderKey.value === 'trash').then(result => {
    window.dispatchEvent(new Event('mailbox:updated'))
    return result
  })
}

function markRead(ids) {
  return emailRead(ids).then(result => {
    window.dispatchEvent(new Event('mailbox:updated'))
    return result
  })
}

async function applyAction(ids, action) {
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

<style scoped>
.folder-view {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
}

.folder-heading {
  padding: 8px 18px 0;
}

.folder-heading h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 650;
}
</style>
