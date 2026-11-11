<template>
  <div class="send" v-show="show">
    <div class="write-box">
      <div class="title">
        <div class="title-left">
          <span class="title-text">
            <Icon icon="hugeicons:quill-write-01" width="28" height="28"/>
          </span>
          <span class="sender">{{ $t('sender') }}:</span>
          <span class="sender-name">{{ form.name }}</span>
          <span class="send-email"><{{ form.sendEmail }}></span>
        </div>
        <div @click="close" style="cursor: pointer;">
          <Icon icon="material-symbols-light:close-rounded" width="22" height="22"/>
        </div>
      </div>
      <div class="container">
        <div class="address-fields">
          <el-input-tag  @add-tag="addTagChange" tag-type="primary" @input="value => updateSuggest('receive', value)" size="large" v-model="form.receiveEmail" >
            <template #prefix>
              <div class="item-title" >{{ $t('recipient') }}</div>
              <el-select
                  ref="mySelect"
                  class="write-select"
                  popper-class="write-select"
                  :show-arrow="false"
                  :no-match-text="' '"
                  :no-data-text="' '"
                  @visible-change="status => suggestStatusChange('receive', status)"
                  @change="value => suggestChange('receive', value)"
              >
                <el-option
                    v-for="item in selectRecipientList"
                    :key="item"
                    :label="item"
                    :value="item"
                    style="color: #999896;"
                />
              </el-select>
            </template>
            <template #suffix>
              <div class="address-actions">
                <button type="button" class="address-toggle" v-if="form.manyType !== 'divide' && !showCc" @click.stop="openCc">CC</button>
                <button type="button" class="address-toggle" v-if="form.manyType !== 'divide' && !showBcc" @click.stop="openBcc">BCC</button>
                <Icon icon="fa7-solid:user-plus" width="20" height="20" class="add-contact" @click.stop="openContacts('receive')" />
              </div>
            </template>
          </el-input-tag>
          <el-input-tag v-if="form.manyType !== 'divide' && showCc" ref="ccInputRef" tag-type="primary" size="large" v-model="form.ccEmail" @input="value => updateSuggest('cc', value)" @add-tag="addCcTag">
            <template #prefix>
              <div class="item-title">{{ $t('cc') }}</div>
              <el-select
                  ref="ccSelectRef"
                  class="write-select"
                  popper-class="write-select"
                  :show-arrow="false"
                  :no-match-text="' '"
                  :no-data-text="' '"
                  @visible-change="status => suggestStatusChange('cc', status)"
                  @change="value => suggestChange('cc', value)"
              >
                <el-option
                    v-for="item in ccSuggestList"
                    :key="item"
                    :label="item"
                    :value="item"
                    style="color: #999896;"
                />
              </el-select>
            </template>
            <template #suffix>
              <div class="address-actions">
                <Icon icon="fa7-solid:user-plus" width="20" height="20" class="add-contact" @click.stop="openContacts('cc')" />
              </div>
            </template>
          </el-input-tag>
          <el-input-tag v-if="form.manyType !== 'divide' && showBcc" ref="bccInputRef" tag-type="primary" size="large" v-model="form.bccEmail" @input="value => updateSuggest('bcc', value)" @add-tag="addBccTag">
            <template #prefix>
              <div class="item-title">{{ $t('bcc') }}</div>
              <el-select
                  ref="bccSelectRef"
                  class="write-select"
                  popper-class="write-select"
                  :show-arrow="false"
                  :no-match-text="' '"
                  :no-data-text="' '"
                  @visible-change="status => suggestStatusChange('bcc', status)"
                  @change="value => suggestChange('bcc', value)"
              >
                <el-option
                    v-for="item in bccSuggestList"
                    :key="item"
                    :label="item"
                    :value="item"
                    style="color: #999896;"
                />
              </el-select>
            </template>
            <template #suffix>
              <div class="address-actions">
                <Icon icon="fa7-solid:user-plus" width="20" height="20" class="add-contact" @click.stop="openContacts('bcc')" />
              </div>
            </template>
          </el-input-tag>
        </div>
        <el-input v-model="form.subject" :placeholder="t('subject')" size="large"  @focus="hideEmptyCcBcc" style="padding-bottom: 4px" />
        <tinyEditor :def-value="defValue" ref="editor" @change="change" @focus="focusChange" />
        <div class="button-item">
          <div class="att-add" @click="chooseFile">
            <Icon icon="iconamoon:attachment-fill" width="24" height="24"/>
          </div>
          <div class="att-clear" @click="clearContent">
            <Icon icon="icon-park-outline:clear-format" width="24" height="24 "/>
          </div>
          <div class="att-list">
            <div class="att-item" v-for="(item,index) in form.attachments" :key="index">
              <Icon v-bind="getIconByName(item.filename)"/>
              <span class="att-filename">{{ item.filename }}</span>
              <span class="att-size">{{ formatBytes(item.size) }}</span>
              <Icon style="cursor: pointer;" icon="material-symbols-light:close-rounded" @click="delAtt(index)"
                    width="22" height="22"/>
            </div>
          </div>
          <div>
            <el-dropdown split-button type="primary" trigger="click" @click="sendEmail" @command="selectSendMode">
              {{ sendButtonLabel }}
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="together">
                    {{ $t(form.sendType === 'forward' ? 'forward' : 'send') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="divide">
                    {{ separateSendLabel }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </div>
    </div>
    <el-dialog top="10vh" v-model="showContacts" @closed="clearSelectContact" :title="t('recentContacts')">
      <el-table class="contacts-table" ref="contactsTabRef" row-key="email" :data="contacts" style="height: 445px" @row-click="toggleContactRow">
        <el-table-column type="selection" width="32" />
        <el-table-column property="email" :label="t('emailAccount')" >
          <template #default="props">
            <div class="email-row">{{ props.row.email }}</div>
          </template>
        </el-table-column>
        <el-table-column width="55" label="" >
          <template #default>
            <div style="display: flex;">
              <Icon icon="mage:user" style="color: var(--el-text-color-primary)" width="22" height="22" color="#606266" />
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="contacts-bottom">
        <el-button type="default" @click="deleteContact">{{t('clear')}}</el-button>
        <el-button type="primary" @click="chooseContact">{{t('selectContacts')}}</el-button>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import tinyEditor from '@/components/tiny-editor/index.vue'
import {h, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, computed} from "vue";
import {Icon} from "@iconify/vue";
import {useUserStore} from "@/store/user.js";
import {emailSend} from "@/request/email.js";
import {isEmail} from "@/utils/verify-utils.js";
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {fileToBase64, formatBytes} from "@/utils/file-utils.js";
import {getIconByName} from "@/utils/icon-utils.js";
import sendPercent from "@/components/send-percent/index.vue"
import {toOssDomain} from "@/utils/convert.js";
import {formatDetailDate} from "@/utils/day.js";
import {useSettingStore} from "@/store/setting.js";
import {userDraftStore} from "@/store/draft.js";
import {useWriterStore} from "@/store/writer.js";
import db from "@/db/db.js";
import dayjs from "dayjs";
import {useI18n} from "vue-i18n";
import router from "@/router/index.js";
import {ElMessageBox} from "element-plus";

defineExpose({
  open,
  openReply,
  openForward,
  openDraft
})

const {t} = useI18n()
const writerStore = useWriterStore();
const draftStore = userDraftStore()
const settingStore = useSettingStore()
const emailStore = useEmailStore();
const accountStore = useAccountStore()
const editor = ref({})
const userStore = useUserStore();
const show = ref(false);
const percent = ref(0)
let percentMessage = null
let sending = false
const defValue = ref('')
const contactsTabRef = ref({})
const showContacts = ref(false)
const contactTarget = ref('receive')
const showCc = ref(false)
const showBcc = ref(false)
const ccInputRef = ref()
const bccInputRef = ref()
const mySelect = ref()
const ccSelectRef = ref()
const bccSelectRef = ref()
const suggestOpen = { receive: false, cc: false, bcc: false }
const backReply = reactive({
  receiveEmail: [],
  subject: '',
  content: '',
  sendType: ''
})
const form = reactive({
  sendEmail: '',
  receiveEmail: [],
  ccEmail: [],
  bccEmail: [],
  accountId: -1,
  name: '',
  subject: '',
  content: '',
  sendType: '',
  manyType: 'together',
  text: '',
  emailId: 0,
  attachments: [],
  draftId: null,
})

const selectRecipientList = ref([])
const ccSuggestList = ref([])
const bccSuggestList = ref([])
const suggestListMap = { receive: selectRecipientList, cc: ccSuggestList, bcc: bccSuggestList }
const suggestSelectMap = { receive: mySelect, cc: ccSelectRef, bcc: bccSelectRef }
const suggestFieldMap = { receive: 'receiveEmail', cc: 'ccEmail', bcc: 'bccEmail' }

const contacts = computed(() => writerStore.sendRecipientRecord.map(item => ({email: item})))
const separateSendLabel = computed(() => t(form.sendType === 'forward' ? 'separateForward' : 'separateSend'))
const sendButtonLabel = computed(() => {
  if (form.manyType === 'divide') return separateSendLabel.value
  if (form.sendType === 'reply') return t('reply')
  if (form.sendType === 'forward') return t('forward')
  return t('send')
})

function clearCcBcc() {
  form.ccEmail = []
  form.bccEmail = []
  showCc.value = false
  showBcc.value = false
}

function selectSendMode(mode) {
  form.manyType = mode
  if (mode === 'divide') {
    clearCcBcc()
  }
}

function targetAddressKey() {
  if (contactTarget.value === 'cc') return 'ccEmail'
  if (contactTarget.value === 'bcc') return 'bccEmail'
  return 'receiveEmail'
}

function openContacts(target = 'receive') {
  contactTarget.value = target
  showContacts.value = true
  nextTick(() => {
    form[targetAddressKey()].forEach(item => {
      if (writerStore.sendRecipientRecord.includes(item)) {
        contactsTabRef.value.toggleRowSelection({email: item});
      }
    })
  })
}

function deleteContact() {
  ElMessageBox.confirm(t('confirmDeletionOfContacts'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
    const key = targetAddressKey()
    form[key] = form[key].filter(item => !contactList.includes(item));
    writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(item => !contactList.includes(item));
  })
}

function chooseContact() {

  const contactList = contactsTabRef.value.getSelectionRows().map(item => item.email);
  const key = targetAddressKey()
  contactList.forEach(item => {
    if (!form[key].includes(item)) {
      form[key].push(item);
    }
  })

  form[key] = form[key].filter(item => {
    return contactList.includes(item) || !writerStore.sendRecipientRecord.includes(item);
  });

  showContacts.value = false
}

function clearSelectContact() {
  contactsTabRef.value.clearSelection();
}

function toggleContactRow(row, column) {
  if (column?.type === 'selection') return
  contactsTabRef.value.toggleRowSelection(row)
}

function toggleSuggest(target) {
  suggestSelectMap[target].value?.toggleMenu()
}

function suggestStatusChange(target, status) {
  suggestOpen[target] = status
}

function suggestChange(target, value) {
  form[suggestFieldMap[target]].push(value)
}

function updateSuggest(target, value) {
  const field = suggestFieldMap[target]
  const list = writerStore.sendRecipientRecord.filter(item => value && !form[field].includes(item) && item.startsWith(value)).slice(0, 10)
  suggestListMap[target].value = list

  if (!suggestOpen[target] && list.length > 0) {
    toggleSuggest(target)
  }

  if (suggestOpen[target] && list.length === 0) {
    toggleSuggest(target)
  }
}

function closeOpenSuggest() {
  for (const target of ['receive', 'cc', 'bcc']) {
    if (suggestOpen[target]) toggleSuggest(target)
  }
}

function addAddressTag(list, val) {
  const emails = Array.from(new Set(
      val.split(/[,，]/).map(item => item.trim()).filter(item => item)
  ));

  list.splice(list.length - 1, 1)

  let has = false
  emails.forEach(email => {
    if (isEmail(email) && !list.includes(email)) {
      list.push(email)
      has = true
    }
  })
  return has
}

function addTagChange(val) {
  if (addAddressTag(form.receiveEmail, val) && suggestOpen.receive) toggleSuggest('receive')
}

function addCcTag(val) {
  if (addAddressTag(form.ccEmail, val) && suggestOpen.cc) toggleSuggest('cc')
}

function addBccTag(val) {
  if (addAddressTag(form.bccEmail, val) && suggestOpen.bcc) toggleSuggest('bcc')
}

function openCc() {
  showCc.value = true
  nextTick(() => ccInputRef.value?.focus?.())
}

function openBcc() {
  showBcc.value = true
  nextTick(() => bccInputRef.value?.focus?.())
}

function hideEmptyCcBcc() {
  if (showCc.value && form.ccEmail.length === 0) {
    showCc.value = false
  }
  if (showBcc.value && form.bccEmail.length === 0) {
    showBcc.value = false
  }
}

function clearContent() {
  hideEmptyCcBcc()
  ElMessageBox.confirm(t('clearContentConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    resetForm()
  })

}

function delAtt(index) {
  form.attachments.splice(index, 1);
}

function chooseFile() {
  hideEmptyCcBcc()
  const doc = document.createElement("input")
  doc.setAttribute("type", "file")
  doc.multiple = true;
  doc.click()
  doc.onchange = async (e) => {

    const fileList = e.target.files;

    for (const file of fileList) {

      const size = file.size
      const filename = file.name
      const contentType = file.type

      const content = await fileToBase64(file)
      form.attachments.push({content, filename, size, contentType})

    }

  }
}

async function sendEmail() {
  hideEmptyCcBcc()

  if (form.receiveEmail.length === 0) {
    ElMessage({
      message: t('emptyRecipientMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.subject) {
    ElMessage({
      message: t('emptySubjectMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  form.content = editor.value.getContent();

  if (!form.content) {
    ElMessage({
      message: t('emptyContentMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (sending) {
    ElMessage({
      message: t('sendingErrorMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  percentMessage = ElMessage({
    message: () => h(sendPercent, {value: percent.value, desc: t('sending')}),
    dangerouslyUseHTMLString: true,
    plain: true,
    duration: 0,
    customClass: 'message-bottom'
  })

  sending = true

  show.value = false

  emailSend(form, (e) => {
    percent.value = Math.round((e.loaded * 98) / e.total)
  }).then(result => {
    const emailList = Array.isArray(result) ? result : result.emails
    const email = emailList[0]
    emailList.forEach(item => {
      emailStore.sendScroll?.addItem(item)
    })

    userStore.refreshUserInfo();
    addRecipientRecord();

    if (result.failedRecipients?.length) {
      form.receiveEmail = result.failedRecipients
      show.value = true
      ElNotification({
        title: t('partialSendMsg', {count: emailList.length, failed: result.failedRecipients.length}),
        type: 'warning',
        message: result.error,
        position: 'bottom-right'
      })
      return
    }

    ElNotification({
      title: t('sendSuccessMsg'),
      type: "success",
      message: h('span', {style: 'color: teal'}, email.subject),
      position: 'bottom-right'
    })

    if (form.draftId) {
      form.subject = ''
      form.content = ''
      form.receiveEmail = []
      draftStore.setDraft = {...toRaw(form)}
    }

    show.value = false
    resetForm();
  }).catch((e) => {
    ElNotification({
      title: t('sendFailMsg'),
      type: e.code === 403 ? 'warning' : 'error',
      message: h('span', {style: 'color: teal'}, e.message),
      position: 'bottom-right'
    })
    if (e.code === 401) {
      localStorage.removeItem('token');
      router.replace('/login');
    }
    show.value = true
    addRecipientRecord();
  }).finally(() => {
    percentMessage.close()
    percent.value = 0
    sending = false
  })
}

function addRecipientRecord() {
  const seen = new Set()
  const addresses = []
  for (const email of [...form.receiveEmail, ...form.ccEmail, ...form.bccEmail]) {
    const key = String(email).trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    addresses.push(email)
  }

  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.filter(
      email => !seen.has(String(email).trim().toLowerCase())
  );

  writerStore.sendRecipientRecord.unshift(...addresses);
  writerStore.sendRecipientRecord = writerStore.sendRecipientRecord.slice(0, 500);
}

function resetForm() {
  form.receiveEmail = []
  form.ccEmail = []
  form.bccEmail = []
  showCc.value = false
  showBcc.value = false
  form.subject = ''
  form.content = ''
  form.manyType = 'together'
  form.attachments = []
  form.sendType = ''
  form.emailId = 0
  form.draftId = null
  backReply.content = ''
  backReply.subject = ''
  backReply.receiveEmail = []
  backReply.sendType = ''
  editor.value.clearEditor()
}

function change(content, text) {
  form.content = content;
  form.text = text
}

function focusChange() {
  closeOpenSuggest()
  hideEmptyCcBcc()
}

function openForward(email) {
  resetForm();

  email.subject = email.subject || ''

  form.subject = email.subject
  form.sendType = 'forward'

  defValue.value = ''

  setTimeout(() => {
    defValue.value = `
      ${formatImage(email.content) || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`}
    `
    open()

    nextTick(() => {
      backReply.content = editor.value.getContent()
      backReply.subject = form.subject
      backReply.receiveEmail = form.receiveEmail
      backReply.sendType = form.sendType
    })

  });
}

function openReply(email) {

  resetForm();

  email.subject = email.subject || ''

  form.receiveEmail.push(email.sendEmail)
  form.subject = (
      email.subject.startsWith('Re:') ||
      email.subject.startsWith('Re：') ||
      email.subject.startsWith('回复：') ||
      email.subject.startsWith('回复:')) ? email.subject : 'Re: ' + email.subject
  form.sendType = 'reply'
  form.emailId = email.emailId

  defValue.value = ''

  setTimeout(() => {
    defValue.value = `
    <div></div>
    <div>
    <br>
        ${formatDetailDate(email.createTime)} ${email.name} &lt${email.sendEmail}&gt ${t('wrote')}:
    </div>
    <blockquote class="mceNonEditable" style="margin: 0 0 0 0.8ex;border-left: 1px solid rgb(204,204,204);padding-left: 1ex;">
      <articl>
          ${formatImage(email.content) || `<pre style="font-family: inherit;word-break: break-word;white-space: pre-wrap;margin: 0">${email.text}</pre>`}
      </article>
    </blockquote>`
    open()

    nextTick(() => {
      backReply.content = editor.value.getContent()
      backReply.subject = form.subject
      backReply.receiveEmail = form.receiveEmail
      backReply.sendType = form.sendType
    })
  })

}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function open() {
  if (!accountStore.currentAccount.email) {
    form.sendEmail = userStore.user.email;
    form.accountId = userStore.user.account.accountId;
    form.name = userStore.user.name;
  } else {
    form.sendEmail = accountStore.currentAccount.email;
    form.accountId = accountStore.currentAccount.accountId;
    form.name = accountStore.currentAccount.name;
  }
  show.value = true;
  editor.value.focus()
}

function openDraft(draft) {
  Object.assign(form, {...draft, manyType: draft.manyType || 'together'})
  form.ccEmail = draft.ccEmail || []
  form.bccEmail = draft.bccEmail || []
  if (form.manyType === 'divide') {
    clearCcBcc()
  }
  showCc.value = form.ccEmail.length > 0
  showBcc.value = form.bccEmail.length > 0
  defValue.value = ''
  setTimeout(() => defValue.value = form.content)
  show.value = true;
  editor.value.focus()
}

const handleKeyDown = (event) => {
  if (event.key === 'Escape') {
    close()
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

function close() {

  closeOpenSuggest();

  if (!form.content) {
    form.content = editor.value.getContent();
  }

  if (form.draftId) {
    draftStore.setDraft = {...toRaw(form)}
    show.value = false
    resetForm()
    return;
  }

  if (!(form.content || form.subject || form.receiveEmail.length > 0 || form.ccEmail.length > 0 || form.bccEmail.length > 0)) {
    show.value = false
    resetForm()
    return;
  }

  if (backReply.sendType === 'reply' || backReply.sendType === 'forward') {
    let subjectFlag = form.subject === backReply.subject
    let contentFlag = editor.value.getContent() === backReply.content
    let receiveFlag = form.receiveEmail.length === 1 && form.receiveEmail[0] === backReply.receiveEmail[0]
    if (backReply.sendType === 'forward' && form.receiveEmail.length === 0) {
      receiveFlag = true;
    }
    if (subjectFlag && contentFlag && receiveFlag) {
      resetForm();
      close()
      return;
    }
  }

  ElMessageBox.confirm(t('saveDraftConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning',
    distinguishCancelAndClose: true
  }).then(async () => {
    const formData = {...toRaw(form)};
    delete formData.draftId
    delete formData.attachments
    formData.createTime = dayjs().utc().format('YYYY-MM-DD HH:mm:ss');
    const draftId = await db.value.draft.add({...formData})
    db.value.att.add({draftId, attachments: toRaw(form.attachments)})
    draftStore.refreshList++
    show.value = false
    await nextTick(() => {
      resetForm()
    })
  }).catch((action) => {
    if (action === 'cancel') {
      show.value = false
      resetForm()
    }
  })

}

</script>
<style>
.write-select .el-select-dropdown__list {
  padding: 4px 4px !important;
}
.write-select .el-select-dropdown__item {
  padding: 0 10px 0 10px;
}

.write-select .el-select-dropdown {
  min-width: 0 !important;
}
</style>
<style scoped lang="scss">
.send {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;

  .write-box {
    background: var(--el-bg-color);
    width: min(1367px, calc(100% - 80px));
    box-shadow: var(--el-box-shadow-light);
    border: 1px solid var(--el-border-color-light);
    transition: var(--el-transition-duration);
    padding: 15px;
    border-radius: 8px;
    display: grid;
    grid-template-rows: auto 1fr;
    overflow: hidden;
    @media (max-width: 1024px) {
      width: 100%;
      height: 100%;
      border-radius: 0;
      border: 0;
      padding-top: 10px;
    }

    @media (min-width: 1025px) {
      height: min(800px, calc(100vh - 60px));
    }

    .title {
      display: flex;
      justify-content: space-between;
      .title-left {
        align-items: center;
        display: grid;
        grid-template-columns: auto auto auto 1fr;
      }

      .title-text {
      }

      .sender {
        margin-left: 8px;
      }

      .sender-name {
        margin-left: 8px;
        font-weight: bold;
      }

      .send-email {
        color: #999896;
        margin-left: 5px;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }


      div {
        display: flex;
        align-items: center;
      }
    }

    .container {
      height: 100%;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 5px;

      .address-fields {
        display: grid;
      }

      :deep(.el-input-tag) {
        padding-right: 0;
        padding-left: 0;
      }

      :deep(.el-input-tag__suffix) {
        padding-right: 5px;
      }
      :deep(.el-input-tag__prefix) {
        padding-left: 5px;
      }

      :deep(.el-input__wrapper) {
        padding-left: 5px;
        padding-right: 5px;
      }

      :deep(.el-input-tag),
      :deep(.el-input__wrapper),
      :deep(.el-input-tag.is-focused),
      :deep(.el-input-tag.is-hovering),
      :deep(.el-input-tag:hover),
      :deep(.el-input__wrapper.is-focus),
      :deep(.el-input__wrapper:hover) {
        box-shadow: none;
        border-radius: 0;
        border-bottom: 1px solid var(--el-border-color-lighter);
      }

      .address-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-right: 3px;
      }

      .address-toggle {
        border: none;
        background: transparent;
        padding: 0;
        color: var(--regular-text-color);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;

        &:hover,
        &:focus {
          color: var(--regular-text-color);
        }
      }

      .item-title {
      }

      .button-item {
        display: grid;
        grid-template-columns: auto auto 1fr auto;

        .att-add {
          cursor: pointer;
        }

        .att-clear {
          cursor: pointer;
          margin-left: 10px;
        }

        .att-list {
          display: grid;
          gap: 5px;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          padding-left: 10px;
          padding-right: 10px;
          max-height: 110px;
          overflow-y: auto;
          @media (max-width: 450px) {
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          }

          .att-item {
            display: grid;
            grid-template-columns: auto 1fr auto auto;
            gap: 5px;
            height: 32px;
            font-size: 14px;
            padding: 4px 5px;
            background: var(--light-ill);
            border-radius: 4px;
            .att-filename {
              white-space: nowrap;
              text-overflow: ellipsis;
              overflow: hidden;
            }
          }
        }
      }
    }
  }

}

.email-row {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.el-dialog) {
  width: 420px !important;
  @media (max-width: 460px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.contacts-bottom {
  display: flex;
  justify-content: end;
  margin-top: 10px;
}

.contacts-table :deep(.el-table__row) {
  cursor: pointer;
}

.add-contact {
  color: var(--regular-text-color)
}

.write-select {
  position: absolute;
  width: 300px;
  left: 60px;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
}

.icon {
  cursor: pointer;
}
</style>
