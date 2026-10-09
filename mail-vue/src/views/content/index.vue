<template>
  <div class="box">
    <div class="header-actions">
      <Icon class="icon" icon="material-symbols-light:arrow-back-ios-new" width="20" height="20" @click="handleBack"/>
      <Icon v-perm="'email:delete'" class="icon" icon="uiw:delete" width="16" height="16" @click="handleDelete"/>
      <span class="star" v-if="emailStore.contentData.showStar">
        <Icon class="icon" @click="changeStar" v-if="email.isStar" icon="fluent-color:star-16" width="20" height="20"/>
        <Icon class="icon" @click="changeStar" v-else icon="solar:star-line-duotone" width="18" height="18"/>
      </span>
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openReply" icon="la:reply" width="21" height="21" />
      <Icon class="icon" v-if="emailStore.contentData.showReply" v-perm="'email:send'"  @click="openForward" icon="iconoir:arrow-up-right" width="20" height="20" />
    </div>
    <div></div>
    <el-scrollbar class="scrollbar">
      <div class="container">
        <div class="email-title">
          <Icon v-if="pgpSource" icon="mdi:lock" width="18" height="18" class="pgp-lock" :title="$t('pgpEncryptedMail')"/>
          {{ email.subject }}
        </div>
        <div class="content">
          <div class="email-info">
            <div>
              <div class="send"><span class="send-source">{{$t('from')}}</span>
                <div class="send-name">
                  <span class="send-name-title">{{ email.name }}</span>
                  <span><{{ email.sendEmail }}></span>
                </div>
              </div>
              <div class="receive"><span class="source">{{$t('recipient')}}</span><span class="receive-email">{{  formateReceive(email.recipient) }}</span></div>
              <div class="receive" v-if="hasAddrList(email.cc)"><span class="source">{{$t('cc')}}</span><span class="receive-email">{{ formatAddrList(email.cc) }}</span></div>
              <div class="receive" v-if="hasAddrList(email.bcc)"><span class="source">{{$t('bcc')}}</span><span class="receive-email">{{ formatAddrList(email.bcc) }}</span></div>
              <div class="date">
                <div>{{ formatDetailDate(email.createTime) }}</div>
              </div>
            </div>
            <el-alert v-if="email.status === 3" :closable="false" :title="toMessage(email.message)" class="email-msg" type="error" show-icon />
            <el-alert v-if="email.status === 4" :closable="false" :title="$t('complained')" class="email-msg" type="warning" show-icon />
            <el-alert v-if="email.status === 5" :closable="false" :title="$t('delayed')" class="email-msg" type="warning" show-icon />
          </div>
          <el-scrollbar class="htm-scrollbar" :class="!email.attList?.length ? 'bottom-distance' : ''">
            <ShadowHtml class="shadow-html" :html="formatImage(email.content)" v-if="email.content && !pgpSource" />
            <div v-else-if="pgpSource" class="pgp-decrypt-box">
              <pre v-if="decryptedText" class="email-text">{{ decryptedText }}</pre>
              <div v-else class="pgp-encrypted-tip">
                <Icon icon="mdi:lock" width="30" height="30"/>
                <div>{{ $t('pgpEncryptedMail') }}</div>
                <el-button type="primary" :loading="decryptLoading" @click="decryptMail">{{ $t('pgpDecrypt') }}</el-button>
              </div>
            </div>
            <pre v-else class="email-text" >{{email.text}}</pre>
          </el-scrollbar>
          <div class="att" v-if="email.attList?.length > 0">
            <div class="att-title">
              <span>{{$t('attachments')}}</span>
              <span>{{$t('attCount',{total: email.attList.length})}}</span>
            </div>
            <div class="att-box">

              <div class="att-item" v-for="att in email.attList" :key="att.attId">
                <div class="att-icon" @click="showImage(att.key)">
                  <Icon v-bind="getIconByName(att.filename)" />
                </div>
                <div class="att-name" @click="showImage(att.key)">
                  {{ att.filename }}
                </div>
                <div class="att-size">{{ formatBytes(att.size) }}</div>
                <div class="opt-icon att-icon">
                  <Icon v-if="isImage(att.filename)" icon="hugeicons:view" width="22" height="22" @click="showImage(att.key)"/>
                  <a v-if="!isPgpFile(att.filename)" :href="cvtR2Url(att.key)" download>
                    <Icon icon="system-uicons:push-down" width="22" height="22"/>
                  </a>
                  <Icon v-else icon="system-uicons:push-down" width="22" height="22" @click="decryptAttachment(att)" style="cursor: pointer" :title="$t('pgpDecrypt')"/>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
    <el-image-viewer
        v-if="showPreview"
        :url-list="srcList"
        show-progress
        @close="showPreview = false"
    />
    <el-dialog v-model="passphraseDialogVisible" :title="$t('pgpPassphrase')" width="380" :close-on-click-modal="false" @close="cancelPassphrase">
      <div style="margin-bottom: 10px">{{ $t('pgpPassphrasePlaceholder') }}</div>
      <el-input v-model="passphraseInput" type="password" show-password @keyup.enter="confirmPassphrase"/>
      <div style="margin-top: 12px">
        <el-checkbox v-model="passphraseRemember">{{ $t('pgpRememberPassphrase') }}</el-checkbox>
      </div>
      <template #footer>
        <el-button @click="cancelPassphrase">{{ $t('cancel') }}</el-button>
        <el-button type="primary" @click="confirmPassphrase">{{ $t('confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import ShadowHtml from '@/components/shadow-html/index.vue'
import {computed, reactive, ref, watch, onMounted, onUnmounted} from "vue";
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {emailDelete, emailRead} from "@/request/email.js";
import {Icon} from "@iconify/vue";
import {useEmailStore} from "@/store/email.js";
import {useAccountStore} from "@/store/account.js";
import {formatDetailDate} from "@/utils/day.js";
import {starAdd, starCancel} from "@/request/star.js";
import {getExtName, formatBytes} from "@/utils/file-utils.js";
import {cvtR2Url,toOssDomain} from "@/utils/convert.js";
import {getIconByName} from "@/utils/icon-utils.js";
import {useSettingStore} from "@/store/setting.js";
import {allEmailDelete} from "@/request/all-email.js";
import {useUiStore} from "@/store/ui.js";
import {useI18n} from "vue-i18n";
import {EmailUnreadEnum} from "@/enums/email-enum.js";
import {isPgpMessage, hasPrivateKey, decryptText, decryptBinary} from "@/utils/pgp-utils.js";

const uiStore = useUiStore();
const settingStore = useSettingStore();
const accountStore = useAccountStore();
const emailStore = useEmailStore();
const router = useRouter()
const email = computed(() => emailStore.contentData.email || {
  emailId: 0,
  attList: [],
  content: '',
  text: '',
  recipient: '[]',
})
const showPreview = ref(false)
const srcList = reactive([])
const decryptedText = ref('')
const decryptLoading = ref(false)

const pgpSource = computed(() => {
  if (isPgpMessage(email.value.text)) return email.value.text
  if (isPgpMessage(email.value.content)) return email.value.content
  return null
})

watch(() => email.value?.emailId, () => {
  decryptedText.value = ''
  decryptLoading.value = false
})

function isPgpFile(filename) {
  return /\.pgp$/i.test(filename || '')
}

const passphraseDialogVisible = ref(false)
const passphraseInput = ref('')
const passphraseRemember = ref(false)
let passphraseResolver = null

function askPassphrase() {
  passphraseInput.value = ''
  passphraseRemember.value = false
  passphraseDialogVisible.value = true
  return new Promise((resolve, reject) => {
    passphraseResolver = {resolve, reject}
  })
}

function confirmPassphrase() {
  passphraseDialogVisible.value = false
  passphraseResolver?.resolve({passphrase: passphraseInput.value || '', remember: passphraseRemember.value})
  passphraseResolver = null
}

function cancelPassphrase() {
  passphraseDialogVisible.value = false
  passphraseResolver?.reject(new Error('cancel'))
  passphraseResolver = null
}

const passphraseCache = reactive({})

function getStoredPassphrase(emailId) {
  if (passphraseCache[emailId]) {
    return passphraseCache[emailId]
  }
  try {
    return sessionStorage.getItem('pgp-pp-' + emailId) || null
  } catch {
    return null
  }
}

function setStoredPassphrase(emailId, passphrase) {
  passphraseCache[emailId] = passphrase
  try {
    sessionStorage.setItem('pgp-pp-' + emailId, passphrase)
  } catch {
  }
}

function clearStoredPassphrase(emailId) {
  delete passphraseCache[emailId]
  try {
    sessionStorage.removeItem('pgp-pp-' + emailId)
  } catch {
  }
}

async function decryptWithPassphrase(fn) {
  const emailId = email.value?.emailId
  const cached = emailId ? getStoredPassphrase(emailId) : null
  if (cached) {
    try {
      return await fn(cached)
    } catch (e) {
      if (e.code === 'BAD_PASSPHRASE') {
        if (emailId) {
          clearStoredPassphrase(emailId)
        }
      } else {
        throw e
      }
    }
  }
  try {
    return await fn()
  } catch (e) {
    if (e.code === 'NEED_PASSPHRASE') {
      const {passphrase, remember} = await askPassphrase()
      const result = await fn(passphrase)
      if (remember && emailId) {
        setStoredPassphrase(emailId, passphrase)
      }
      return result
    }
    throw e
  }
}

function handlePgpError(e) {
  console.warn('pgp decrypt fail', e)
  let msg = t('pgpDecryptFail')
  if (e.code === 'BAD_PASSPHRASE') {
    msg = t('pgpWrongPassphrase')
  }
  ElMessage({
    message: msg,
    type: 'error',
    plain: true,
  })
}

async function decryptMail() {
  if (decryptLoading.value || !pgpSource.value) return
  if (!hasPrivateKey()) {
    ElMessage({
      message: t('pgpNoPrivateKey'),
      type: 'warning',
      plain: true,
    })
    return
  }
  decryptLoading.value = true
  try {
    decryptedText.value = await decryptWithPassphrase((passphrase) => decryptText(pgpSource.value, passphrase))
  } catch (e) {
    if (e?.message !== 'cancel' && e?.action !== 'cancel') {
      handlePgpError(e)
    }
  } finally {
    decryptLoading.value = false
  }
}

async function decryptAttachment(att) {
  if (!hasPrivateKey()) {
    ElMessage({
      message: t('pgpNoPrivateKey'),
      type: 'warning',
      plain: true,
    })
    return
  }
  const loading = ElMessage({
    message: t('pgpDecrypting'),
    type: 'info',
    plain: true,
    duration: 0,
  })
  try {
    const res = await fetch(cvtR2Url(att.key))
    const armored = await res.text()
    const data = await decryptWithPassphrase((passphrase) => decryptBinary(armored, passphrase))
    const blob = new Blob([data], {type: 'application/octet-stream'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (att.filename || 'file').replace(/\.pgp$/i, '')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  } catch (e) {
    if (e?.message !== 'cancel' && e?.action !== 'cancel') {
      handlePgpError(e)
    }
  } finally {
    loading.close()
  }
}

const { t } = useI18n()
watch(() => accountStore.currentAccountId, () => {
  handleBack()
})

let readRequesting = false

function tryMarkRead() {
  if (!emailStore.contentData.showUnread || readRequesting) return
  const current = email.value
  if (!current?.emailId || current.unread !== EmailUnreadEnum.UNREAD) return

  // 等详情数据就绪（detailMap 已写入，或正文已有内容）再标已读
  const full = emailStore.detailMap[current.emailId]
  const detailReady = !!full || !!(current.content || current.text)
  if (!detailReady) return

  readRequesting = true
  const emailId = current.emailId
  current.unread = EmailUnreadEnum.READ
  if (emailStore.detailMap[emailId]) {
    emailStore.detailMap[emailId].unread = EmailUnreadEnum.READ
  }
  emailStore.markListRead(emailId)
  emailRead([emailId]).finally(() => {
    readRequesting = false
  })
}

watch(
  () => [
    email.value?.emailId,
    email.value?.content,
    email.value?.text,
    emailStore.detailMap[email.value?.emailId]
  ],
  () => tryMarkRead(),
  { flush: 'post' }
)

onMounted(() => {
  tryMarkRead()
  window.addEventListener('keydown', handleKeyDown);
})

onUnmounted(() => {
  emailStore.contentData.showUnread = false;
  readRequesting = false
  window.removeEventListener('keydown', handleKeyDown);
})

function handleKeyDown(event) {
  if (event.key !== 'Escape') return;
  if (showPreview.value) return;
  if (document.querySelector('.el-message-box')) return;
  const writeBox = document.querySelector('.write-box');
  if (writeBox && writeBox.offsetParent !== null) return;
  handleBack();
}

function openReply() {
  uiStore.writerRef.openReply(email.value)
}

function openForward() {
  uiStore.writerRef.openForward(email.value)
}

function toMessage(message) {
  return  message ? JSON.parse(message).message : '';
}

function formatImage(content) {
  content = content || '';
  const domain = settingStore.settings.r2Domain;
  return  content.replace(/{{domain}}/g, toOssDomain(domain) + '/');
}

function showImage(key) {
  if (!isImage(key)) return;
  const url = cvtR2Url(key)
  srcList.length = 0
  srcList.push(url)
  showPreview.value = true
}

function isImage(filename) {
  return ['png', 'jpg', 'jpeg', 'bmp', 'gif','jfif'].includes(getExtName(filename))
}

function formateReceive(recipient) {
  if (!recipient) return ''
  recipient = JSON.parse(recipient)
  return recipient.map(item => item.address).join(', ')
}

function parseAddrList(val) {
  if (!val) return []
  try {
    const arr = JSON.parse(val)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function hasAddrList(val) {
  return parseAddrList(val).length > 0
}

function formatAddrList(val) {
  return parseAddrList(val).join(', ')
}

function changeStar() {
  if (email.value.isStar) {
    email.value.isStar = 0;
    starCancel(email.value.emailId).then(() => {
      email.value.isStar = 0;
      emailStore.cancelStarEmailId = email.value.emailId
      setTimeout(() => emailStore.cancelStarEmailId = 0)
      emailStore.starScroll?.deleteEmail([email.value.emailId])
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 1;
    })
  } else {
    email.value.isStar = 1;
    starAdd(email.value.emailId).then(() => {
      email.value.isStar = 1;
      emailStore.addStarEmailId = email.value.emailId
      setTimeout(() => emailStore.addStarEmailId = 0)
      emailStore.starScroll?.addItem(email.value)
    }).catch((e) => {
      console.error(e)
      email.value.isStar = 0;
    })
  }
}

const handleBack = () => {
  router.back()
}

const handleDelete = () => {
  ElMessageBox.confirm(t('delEmailConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    if (emailStore.contentData.delType === 'logic') {
      emailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    } else  {

      allEmailDelete(email.value.emailId).then(() => {
        ElMessage({
          message: t('delSuccessMsg'),
          type: 'success',
          plain: true,
        })
        emailStore.deleteIds = [email.value.emailId]
      })
    }

    router.back()
  })
}
</script>
<style scoped lang="scss">
.box {
  height: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px 8px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  font-size: 18px;
  .star {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 21px;
  }
  .icon {
    cursor: pointer;
  }
}


.scrollbar {
  height: calc(100% - 38px);
  width: 100%;
}

.container {
  font-size: 14px;
  padding-left: 20px;
  padding-right: 20px;
  padding-top: 10px;
  @media (max-width: 1023px) {
    padding-left: 15px;
    padding-right: 15px;
  }

  .email-title {
    font-size: 20px;
    font-weight: bold;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pgp-lock {
    color: #22c55e;
    flex: 0 0 auto;
  }

  .htm-scrollbar {
  }

  .content {
    display: flex;
    flex-direction: column;

    .att {
      margin-top: 30px;
      margin-bottom: 30px;
      border: 1px solid var(--light-border-color);
      padding: 14px;
      border-radius: 6px;
      width: fit-content;
      .att-box {
        min-width: min(410px,calc(100vw - 60px));
        max-width: 600px;
        display: grid;
        gap: 12px;
        grid-template-rows: 1fr;
      }

      .att-title {
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        span:first-child {
          font-weight: bold;
        }
      }

      .att-item {
        cursor: pointer;
        div {
          align-self: center;
        }
        background: var(--light-ill);
        padding: 5px 7px;
        border-radius: 4px;
        align-self: start;
        display: grid;
        grid-template-columns: auto 1fr auto auto;
        .att-icon {
          display: grid;
        }

        .att-size {
          color: var(--secondary-text-color);
        }

        .att-name {
          margin-left: 8px;
          margin-right: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          word-break: break-all;
        }

        .att-image {
          width: 60px;
          height: 60px;
          object-fit: contain;
        }

        .opt-icon {
          padding-left: 10px;
          color: var(--secondary-text-color);
          align-items: center;
          display: flex;
          gap: 8px;
          cursor: pointer;
          a {
            color: var(--secondary-text-color);
            align-items: center;
            display: flex;
          }
        }
      }
    }

    .email-info {

      border-bottom: 1px solid var(--light-border-color);
      margin-bottom: 20px;
      padding-bottom: 8px;
      @media (max-width: 1024px) {
        margin-bottom: 15px;
      }
      .date {
        color: var(--regular-text-color);
        margin-bottom: 6px;
      }

      .email-msg {
        max-width: 400px;
        width: fit-content;
        margin-bottom: 15px;
      }

      .send {
        display: flex;
        margin-bottom: 6px;

        .send-name {
          color: var(--regular-text-color);
          display: flex;
          flex-wrap: wrap;
        }

        .send-name-title {
          padding-right: 5px;
        }
      }

      .receive {
        margin-bottom: 6px;
        display: flex;
        .receive-email {
          max-width: 700px;
          word-break: break-word;
        }
        span:nth-child(2) {
          color: var(--regular-text-color);
        }
      }

      .send-source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }

      .source {
        white-space: nowrap;
        font-weight: bold;
        padding-right: 10px;
      }
    }
  }
}

.shadow-html::after  {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--message-block-color); /* 半透明黑色蒙层 */
  pointer-events: none; /* 不影响点击 */
}

.email-text {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.pgp-decrypt-box {
  .pgp-encrypted-tip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 20px;
    color: var(--regular-text-color);
  }
}

.bottom-distance {
  margin-bottom: 30px;
}


</style>
