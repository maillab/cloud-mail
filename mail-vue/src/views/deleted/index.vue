<template>
  <emailScroll type="delete" ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailPermanentDelete"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
  >
    <template #after-reload>
      <Icon v-if="scroll.selectedMailIds?.length > 0" class="icon" icon="uiw:rollback" width="16" height="16" @click="handleRestoreSelected"/>
    </template>
  </emailScroll>
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {emailPermanentDelete, emailList, emailRestore} from "@/request/email.js";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {defineOptions, ref} from "vue";
import {Icon} from "@iconify/vue";
import {useI18n} from "vue-i18n";
import router from "@/router/index.js";

defineOptions({
  name: 'deleted'
})

const {t} = useI18n();
const scroll = ref({})
const emailStore = useEmailStore();
const accountStore = useAccountStore();

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content', params: {mailbox: 'deleted'}})
}

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId
  if (!accountId) return Promise.resolve([])
  return emailList(accountId, 0, emailId, 0, size, 'delete', 0, {})
}

function handleRestore(email) {
  emailRestore([email.emailId]).then(() => {
    scroll.value.deleteEmail([email.emailId])
  })
}

function handleRestoreSelected() {
  const ids = scroll.value.selectedMailIds
  if (!ids?.length) return
  emailRestore(ids).then(() => {
    ElMessage({
      message: t('restoreSuccessMsg'),
      type: 'success',
      plain: true
    })
    scroll.value.deleteEmail(ids)
  })
}

function handlePermanentDelete(email) {
  emailPermanentDelete([email.emailId].join(',')).then(() => {
    scroll.value.deleteEmail([email.emailId])
  })
}
</script>
