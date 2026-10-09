<template>
  <emailScroll type="delete" ref="scroll"
               :allow-star="false"
               :getEmailList="getEmailList"
               :emailDelete="emailPermanentDelete"
               @jump="jumpContent"
               actionLeft="6px"
               :show-account-icon="false"
  />
</template>

<script setup>
import emailScroll from "@/components/email-scroll/index.vue"
import {emailPermanentDelete, emailList, emailRestore} from "@/request/email.js";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {defineOptions, ref} from "vue";
import router from "@/router/index.js";

defineOptions({
  name: 'deleted'
})

const scroll = ref({})
const emailStore = useEmailStore();
const accountStore = useAccountStore();

function jumpContent(email) {
  emailStore.contentData.email = emailStore.toContentEmail(email)
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push('/mail')
}

function getEmailList(emailId, size) {
  const accountId = accountStore.currentAccountId
  if (!accountId) return Promise.resolve([])
  return emailList(accountId, 0, emailId, 0, size, 'delete', 0, null)
}

function handleRestore(email) {
  emailRestore([email.emailId]).then(() => {
    scroll.value.deleteEmail([email.emailId])
  })
}

function handlePermanentDelete(email) {
  emailPermanentDelete([email.emailId].join(',')).then(() => {
    scroll.value.deleteEmail([email.emailId])
  })
}
</script>
