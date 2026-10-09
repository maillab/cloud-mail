<template>
  <div class="box">
    <div class="container">
      <div class="title">{{$t('profile')}}</div>
      <div class="item">
        <div>{{$t('avatar')}}</div>
        <div class="avatar-row">
          <div class="avatar-preview">
            <img v-if="userStore.user.avatar" :src="userStore.user.avatar" class="avatar-img" />
            <div v-else class="avatar-text">{{ formatName(userStore.user.email) }}</div>
          </div>
          <el-upload
            :show-file-list="false"
            :before-upload="beforeAvatarUpload"
            accept="image/*"
          >
            <el-button type="primary" size="small">{{$t('changeAvatar')}}</el-button>
          </el-upload>
          <el-button v-if="userStore.user.avatar" size="small" @click="removeAvatar">{{$t('removeAvatar')}}</el-button>
        </div>
      </div>
      <div class="item">
        <div>{{$t('username')}}</div>
        <div>
          <span v-if="setNameShow" class="edit-name-input">
            <el-input v-model="accountName"  ></el-input>
            <span class="edit-name" @click="setName">
             {{$t('save')}}
            </span>
          </span>
          <span v-else class="user-name">
            <span >{{ userStore.user.name }}</span>
            <span class="edit-name" @click="showSetName">
             {{$t('change')}}
            </span>
          </span>
        </div>
      </div>
      <div class="item">
        <div>{{$t('emailAccount')}}</div>
        <div>{{ userStore.user.email }}</div>
      </div>
      <div class="item">
        <div>{{$t('password')}}</div>
        <div>
          <el-button type="primary" @click="pwdShow = true">{{$t('changePwdBtn')}}</el-button>
        </div>
      </div>
      <div class="item">
        <div>{{$t('passkey')}}</div>
        <div>
          <el-button type="primary" @click="openPasskey">{{$t('passkeyManage')}}</el-button>
        </div>
      </div>
      <div class="item">
        <div>{{$t('pgpPrivateKey')}}</div>
        <div>
          <el-button type="primary" @click="openPgpKey">{{$t('pgpManageKey')}}</el-button>
        </div>
      </div>
      <div class="item">
        <div>{{$t('totp')}}</div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <el-button type="primary" @click="openTotp">{{$t('totpManage')}}</el-button>
          <span v-if="totpEnabled" style="color: var(--el-color-success); font-size: 13px;">{{$t('totpEnabled')}}</span>
          <span v-else style="color: var(--el-text-color-secondary); font-size: 13px;">{{$t('totpDisabled')}}</span>
        </div>
      </div>
      <div class="item" v-if="oauthProviders.length > 0">
        <div>{{$t('oauthBind')}}</div>
        <div class="oauth-bind-list">
          <div v-for="p in oauthProviders" :key="p.key" class="oauth-bind-item">
            <span class="oauth-bind-label">{{ p.label }}</span>
            <span v-if="boundPlatforms.includes(p.key)" class="oauth-bound">{{$t('bound')}}</span>
            <el-button v-if="boundPlatforms.includes(p.key)" link type="danger" @click="confirmUnbindOAuth(p)">{{$t('unbind')}}</el-button>
            <el-button v-else type="primary" size="small" @click="startBindOAuth(p.key)">{{$t('bind')}}</el-button>
          </div>
        </div>
      </div>
    </div>
    <div class="language">
      <div class="title">{{$t('language')}}</div>
      <el-select
          :model-value="langSelect"
          class="language-select"
          placeholder="Select"
          @change="changeLang"
      >
        <el-option label="中文" value="zh" @pointerdown.prevent.stop="changeLang('zh')"/>
        <el-option label="繁體中文" value="zh-TW" @pointerdown.prevent.stop="changeLang('zh-TW')"/>
        <el-option label="English" value="en" @pointerdown.prevent.stop="changeLang('en')"/>
        <el-option label="日本語" value="ja" @pointerdown.prevent.stop="changeLang('ja')"/>
        <el-option label="한국어" value="ko" @pointerdown.prevent.stop="changeLang('ko')"/>
      </el-select>
    </div>
    <div class="del-email" v-perm="'my:delete'">
      <div class="title">{{$t('deleteUser')}}</div>
      <div style="color: var(--regular-text-color);">
        {{$t('delAccountMsg')}}
      </div>
      <div>
        <el-button type="primary" @click="deleteConfirm">{{$t('deleteUserBtn')}}</el-button>
      </div>
    </div>
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="340">
      <div class="update-pwd">
        <el-input type="password" :placeholder="$t('currentPassword')" v-model="form.currentPassword" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('newPassword')" v-model="form.password" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="form.newPwd" autocomplete="off" @keyup.enter="submitPwd"/>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{$t('save')}}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="verifyShow" :title="$t('passkeyVerifyTitle')" width="340" @closed="verifyPwdForm.password = ''">
      <div class="update-pwd">
        <div style="color: var(--regular-text-color); margin-bottom: 12px;">{{ $t(verifyDescKey) }}</div>
        <el-input type="password" :placeholder="$t('password')" v-model="verifyPwdForm.password" autocomplete="off" show-password @keyup.enter="submitVerify"/>
        <el-button type="primary" :loading="verifyPwdLoading" @click="submitVerify">{{$t('confirm')}}</el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="passkeyShow" :title="$t('passkeyManage')" width="420">
      <div class="passkey-list" v-loading="passkeyLoading">
        <el-empty v-if="!passkeyLoading && passkeys.length === 0" :description="$t('passkeyEmpty')"/>
        <div v-for="item in passkeys" :key="item.passkeyId" class="passkey-item">
          <div class="passkey-info">
            <div class="passkey-name">{{ item.name || $t('passkey') }}</div>
            <div class="passkey-time">{{ $t('passkeyCreatedAt') }}: {{ formatTime(item.createTime) }}</div>
            <div class="passkey-time" v-if="item.lastUsedTime">{{ $t('passkeyLastUsed') }}: {{ formatTime(item.lastUsedTime) }}</div>
          </div>
          <el-button type="danger" size="small" @click="delPasskey(item)">{{$t('delete')}}</el-button>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" :loading="passkeyAddLoading" @click="addPasskey">{{$t('passkeyAdd')}}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="totpEnrollShow" :title="$t('totpEnrollTitle')" width="380" @closed="resetTotpEnroll">
      <div v-loading="totpLoading" class="totp-box">
        <template v-if="totpStep === 1">
          <div class="totp-qr-wrap">
            <QrcodeVue :value="totpUri" :size="200" level="M"/>
          </div>
          <div class="totp-secret-row">
            <span class="totp-secret">{{ totpSecret }}</span>
            <el-button size="small" @click="copyText(totpSecret)">{{$t('copy')}}</el-button>
          </div>
          <div class="totp-hint">{{ $t('totpScanHint') }}</div>
          <el-button type="primary" @click="totpStep = 2" style="width: 100%; margin-top: 12px;">{{$t('nextStep')}}</el-button>
        </template>
        <template v-else-if="totpStep === 2">
          <div class="totp-hint">{{ $t('totpVerifyHint') }}</div>
          <el-input v-model="totpCode" :placeholder="$t('totpPlaceholder')" maxlength="6"
                    inputmode="numeric" autocomplete="one-time-code" class="totp-code-input"
                    @keyup.enter="confirmTotpEnroll"/>
          <el-button type="primary" :loading="totpLoading" @click="confirmTotpEnroll" style="width: 100%; margin-top: 12px;">{{$t('totpEnableBtn')}}</el-button>
        </template>
        <template v-else>
          <div class="totp-hint">{{ $t('totpRecoveryHint') }}</div>
          <div class="totp-recovery-list">
            <div v-for="c in recoveryCodes" :key="c" class="totp-recovery-code">{{ c }}</div>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 12px;">
            <el-button @click="copyText(recoveryCodes.join('\n'))" style="flex: 1;">{{$t('copy')}}</el-button>
            <el-button type="primary" @click="totpEnrollShow = false" style="flex: 1;">{{$t('totpSaved')}}</el-button>
          </div>
        </template>
      </div>
    </el-dialog>
    <el-dialog v-model="totpManageShow" :title="$t('totpManage')" width="380">
      <div class="totp-box">
        <div class="totp-status-row">
          <span>{{ $t('totp') }}</span>
          <span style="color: var(--el-color-success);">{{$t('totpEnabled')}}</span>
        </div>
        <div class="totp-hint">{{ $t('totpManageHint') }}</div>
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <el-button @click="regenRecoveryCodes" style="flex: 1;">{{$t('totpRegenRecovery')}}</el-button>
          <el-button type="danger" @click="disableTotp" style="flex: 1;">{{$t('totpDisable')}}</el-button>
        </div>
      </div>
    </el-dialog>
    <el-dialog v-model="totpRecoveryShow" :title="$t('totpRecoveryTitle')" width="380">
      <div class="totp-box">
        <div class="totp-hint">{{ $t('totpRecoveryHint') }}</div>
        <div class="totp-recovery-list">
          <div v-for="c in recoveryCodes" :key="c" class="totp-recovery-code">{{ c }}</div>
        </div>
        <div style="display: flex; gap: 10px; margin-top: 12px;">
          <el-button @click="copyText(recoveryCodes.join('\n'))" style="flex: 1;">{{$t('copy')}}</el-button>
          <el-button type="primary" @click="totpRecoveryShow = false" style="flex: 1;">{{$t('confirm')}}</el-button>
        </div>
      </div>
    </el-dialog>
    <el-dialog v-model="pgpKeyShow" :title="$t('pgpManageKey')" width="440">
      <div v-loading="pgpKeyLoading" class="pgp-key-box">
        <template v-if="pgpKeyInfo">
          <div class="pgp-key-row">
            <span class="pgp-key-label">{{ $t('pgpFingerprint') }}</span>
            <span class="pgp-fingerprint">{{ pgpKeyInfo.fingerprint }}</span>
          </div>
          <div class="pgp-key-row">
            <span class="pgp-key-label">{{ $t('pgpUserId') }}</span>
            <span>{{ pgpKeyInfo.userIDs.join(', ') }}</span>
          </div>
          <div class="pgp-key-row" v-if="pgpKeyInfo.needsPassphrase">
            <el-tag type="warning">{{ $t('pgpNeedPassphrase') }}</el-tag>
          </div>
          <el-button type="danger" @click="delPgpKey" style="margin-top: 12px">{{ $t('pgpDeleteKey') }}</el-button>
        </template>
        <template v-else>
          <div class="pgp-tip">{{ $t('pgpImportTip') }}</div>
          <el-input v-model="pgpArmored" type="textarea" :rows="8" :placeholder="$t('pgpKeyPlaceholder')" class="pgp-textarea"/>
          <el-button type="primary" :loading="pgpImportLoading" @click="importPgpKey" style="margin-top: 12px; width: 100%">{{ $t('pgpImportKey') }}</el-button>
        </template>
      </div>
    </el-dialog>
  </div>
</template>
<script setup>
import {reactive, ref, defineOptions, computed} from 'vue'
import {ElMessageBox} from "element-plus";
import {resetPassword, userDelete, verifyPassword, updateAvatar} from "@/request/my.js";
import {useUserStore} from "@/store/user.js";
import router from "@/router/index.js";
import {accountSetName} from "@/request/account.js";
import {useAccountStore} from "@/store/account.js";
import {useI18n} from "vue-i18n";
import {useSettingStore} from "@/store/setting.js";
import {startRegistration, browserSupportsWebAuthn} from '@simplewebauthn/browser';
import {parsePrivateKey, savePrivateKey, removePrivateKey, privateKeyInfo} from "@/utils/pgp-utils.js";
import {passkeyList, passkeyDelete, passkeyRegisterOptions, passkeyRegisterVerify} from "@/request/passkey.js";
import {totpEnroll, totpConfirm, totpDisable, totpStatus, totpRegenRecoveryCodes} from "@/request/totp.js";
import {oauthBindings, oauthUnbind} from "@/request/ouath.js";
import QrcodeVue from 'qrcode.vue'
import {tzDayjs} from "@/utils/day.js";

const { t } = useI18n()
const accountStore = useAccountStore()
const settingStore = useSettingStore()
const userStore = useUserStore();
const setPwdLoading = ref(false)
const setNameShow = ref(false)
const accountName = ref(null)
const langSelect = ref(settingStore.lang)

defineOptions({
  name: 'setting'
})

function showSetName() {
  accountName.value = userStore.user.name
  setNameShow.value = true
}

function formatName(email) {
  if (!email) return '?'
  return email.charAt(0).toUpperCase()
}

function beforeAvatarUpload(file) {
  // 压缩到 200x200，转 base64
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const size = 200
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      // 居中裁剪为正方形
      const minDim = Math.min(img.width, img.height)
      const sx = (img.width - minDim) / 2
      const sy = (img.height - minDim) / 2
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      updateAvatar(dataUrl).then(() => {
        userStore.user.avatar = dataUrl
        ElMessage({ message: t('avatarUpdated'), type: 'success', plain: true })
      })
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
  return false // 阻止自动上传
}

function removeAvatar() {
  updateAvatar('').then(() => {
    userStore.user.avatar = ''
    ElMessage({ message: t('avatarRemoved'), type: 'success', plain: true })
  })
}

function setName() {

  if (!accountName.value) {
    ElMessage({
      message: t('emptyUserNameMsg'),
      type: 'error',
      plain: true,
    })
    return;
  }

  setNameShow.value = false
  let name = accountName.value

  if (name === userStore.user.name) {
    return
  }

  userStore.user.name = accountName.value

  accountSetName(userStore.user.account.accountId,name).then(() => {
    ElMessage({
      message: t('saveSuccessMsg'),
      type: 'success',
      plain: true,
    })

    accountStore.changeUserAccountName = name

  }).catch(() => {
    userStore.user.name = name
  })
}

function changeLang(lang) {
  let setting = {}
  try {
    setting = JSON.parse(localStorage.getItem('setting') || '{}')
  } catch (e) {
    setting = {}
  }
  localStorage.setItem('setting', JSON.stringify({...setting, lang}))
  window.location.reload()
}

const pwdShow = ref(false)
const verifyShow = ref(false)
const verifyPwdLoading = ref(false)
const verifyPwdForm = reactive({password: ''})
const verifyDescKey = ref('passkeyVerifyDesc')
let verifyAction = null
const passkeyShow = ref(false)
const passkeyLoading = ref(false)
const passkeyAddLoading = ref(false)
const passkeys = ref([])
const form = reactive({
  currentPassword: '',
  password: '',
  newPwd: '',
})

const deleteConfirm = () => {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    userDelete().then(() => {
      localStorage.removeItem('token');
      router.replace('/login');
      ElMessage({
        message: t('delSuccessMsg'),
        type: 'success',
        plain: true,
      })
    })
  })
}


function formatTime(time) {
  return time ? tzDayjs(time).format('YYYY-MM-DD HH:mm') : ''
}

function openPasskey() {
  verifyDescKey.value = 'passkeyVerifyDesc'
  verifyAction = () => {
    passkeyShow.value = true
    refreshPasskeys()
  }
  verifyShow.value = true
}

function submitVerify() {
  if (verifyPwdLoading.value || !verifyPwdForm.password) return
  verifyPwdLoading.value = true
  verifyPassword(verifyPwdForm.password).then(() => {
    verifyShow.value = false
    if (verifyAction) verifyAction()
    verifyAction = null
  }).finally(() => {
    verifyPwdLoading.value = false
  })
}

function refreshPasskeys() {
  passkeyLoading.value = true
  passkeyList().then(list => {
    passkeys.value = list || []
  }).finally(() => {
    passkeyLoading.value = false
  })
}

async function addPasskey() {

  if (passkeyAddLoading.value) return

  if (!browserSupportsWebAuthn()) {
    ElMessage({
      message: t('passkeyNotSupported'),
      type: 'error',
      plain: true,
    })
    return
  }

  let name = ''

  try {
    const {value} = await ElMessageBox.prompt(t('passkeyNamePlaceholder'), t('passkeyName'), {
      confirmButtonText: t('confirm'),
      cancelButtonText: t('cancel'),
      inputPlaceholder: t('passkeyNamePlaceholder'),
    })
    name = value || ''
  } catch (e) {
    return
  }

  passkeyAddLoading.value = true

  try {
    const options = await passkeyRegisterOptions()
    const attestation = await startRegistration({optionsJSON: options})
    await passkeyRegisterVerify(attestation, name)
    ElMessage({
      message: t('passkeyAddSuccess'),
      type: 'success',
      plain: true,
    })
    refreshPasskeys()
  } catch (e) {
    // 用户主动取消不打扰，其他错误由 axios 拦截器统一提示
    if (e?.name !== 'NotAllowedError') {
      console.warn('passkey register fail', e)
    }
  } finally {
    passkeyAddLoading.value = false
  }
}

function delPasskey(item) {
  ElMessageBox.confirm(t('passkeyDeleteConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    passkeyDelete(item.passkeyId).then(() => {
      ElMessage({
        message: t('passkeyDeleteSuccess'),
        type: 'success',
        plain: true,
      })
      refreshPasskeys()
    })
  })
}

const pgpKeyShow = ref(false)
const pgpKeyLoading = ref(false)
const pgpImportLoading = ref(false)
const pgpKeyInfo = ref(null)
const pgpArmored = ref('')

function openPgpKey() {
  verifyDescKey.value = 'pgpVerifyDesc'
  verifyAction = () => {
    pgpKeyShow.value = true
    refreshPgpKeyInfo()
  }
  verifyShow.value = true
}

// ---- TOTP 两步验证 ----
const totpEnabled = ref(false)
const totpEnrollShow = ref(false)
const totpManageShow = ref(false)
const totpRecoveryShow = ref(false)
const totpStep = ref(1)
const totpSecret = ref('')
const totpUri = ref('')
const totpCode = ref('')
const recoveryCodes = ref([])
const totpLoading = ref(false)

totpStatus().then(data => {
  totpEnabled.value = data.enabled
}).catch(() => {})

function openTotp() {
  verifyDescKey.value = 'totpVerifyDesc'
  verifyAction = () => {
    totpStatus().then(data => {
      totpEnabled.value = data.enabled
      if (data.enabled) {
        totpManageShow.value = true
      } else {
        startTotpEnroll()
      }
    })
  }
  verifyShow.value = true
}

function startTotpEnroll() {
  totpLoading.value = true
  totpEnroll().then(data => {
    totpSecret.value = data.secret
    totpUri.value = data.otpauthUri
    totpStep.value = 1
    totpCode.value = ''
    totpEnrollShow.value = true
  }).finally(() => {
    totpLoading.value = false
  })
}

function confirmTotpEnroll() {
  const code = totpCode.value.replace(/\D/g, '')
  if (code.length !== 6) {
    ElMessage({ message: t('totpCodeInvalid'), type: 'error', plain: true })
    return
  }
  totpLoading.value = true
  totpConfirm(code).then(data => {
    recoveryCodes.value = data.recoveryCodes
    totpStep.value = 3
    totpEnabled.value = true
  }).finally(() => {
    totpLoading.value = false
  })
}

function regenRecoveryCodes() {
  ElMessageBox.confirm(t('totpRegenConfirm'), t('totpRegenRecovery'), { type: 'warning' }).then(() => {
    totpRegenRecoveryCodes().then(data => {
      recoveryCodes.value = data.recoveryCodes
      totpManageShow.value = false
      totpRecoveryShow.value = true
    })
  }).catch(() => {})
}

function disableTotp() {
  verifyDescKey.value = 'totpVerifyDesc'
  verifyAction = () => {
    totpDisable().then(() => {
      totpEnabled.value = false
      totpManageShow.value = false
      ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
    })
  }
  verifyShow.value = true
}

function resetTotpEnroll() {
  totpStep.value = 1
  totpSecret.value = ''
  totpUri.value = ''
  totpCode.value = ''
}

// ---- OAuth 第三方账号绑定 ----
const boundPlatforms = ref([])

const oauthProviders = computed(() => {
  const allProviders = [
    { key: 'google', label: 'Google' },
    { key: 'github', label: 'GitHub' },
    { key: 'linuxdo', label: 'LinuxDo' },
  ]
  return allProviders.filter(p => settingStore.settings[p.key + 'Switch'] === 0)
})

function refreshOAuthBindings() {
  oauthBindings().then(data => {
    boundPlatforms.value = data || []
  }).catch(() => {})
}

refreshOAuthBindings()

function startBindOAuth(provider) {
  verifyDescKey.value = 'oauthVerifyDesc'
  verifyAction = () => {
    doStartBindOAuth(provider)
  }
  verifyShow.value = true
}

function doStartBindOAuth(provider) {
  const clientId = settingStore.settings[provider + 'ClientId']
  const redirectUri = encodeURIComponent(window.location.origin + '/login')
  sessionStorage.setItem('oauthProvider', provider)
  sessionStorage.setItem('oauthBindMode', '1')
  const authorizeUrls = {
    linuxdo: `https://connect.linux.do/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
    github: `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=user:email&state=${provider}`,
    google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=openid+profile+email&state=${provider}`,
  }
  window.location.href = authorizeUrls[provider]
}

function confirmUnbindOAuth(p) {
  ElMessageBox.confirm(t('unbindConfirm', { msg: p.label }), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    oauthUnbind(p.key).then(() => {
      ElMessage({ message: t('unbindSuccessMsg'), type: 'success', plain: true })
      refreshOAuthBindings()
    })
  }).catch(() => {})
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage({ message: t('copySuccessMsg'), type: 'success', plain: true })
  }).catch(() => {
    ElMessage({ message: t('copyFailMsg'), type: 'error', plain: true })
  })
}

async function refreshPgpKeyInfo() {
  pgpKeyLoading.value = true
  try {
    pgpKeyInfo.value = await privateKeyInfo()
  } catch (e) {
    console.warn('pgp key info fail', e)
    pgpKeyInfo.value = null
  } finally {
    pgpKeyLoading.value = false
  }
}

async function importPgpKey() {
  if (pgpImportLoading.value) return
  if (!pgpArmored.value.includes('PGP PRIVATE KEY')) {
    ElMessage({
      message: t('pgpInvalidKey'),
      type: 'error',
      plain: true,
    })
    return
  }
  pgpImportLoading.value = true
  try {
    const info = await parsePrivateKey(pgpArmored.value)
    savePrivateKey(info.armored)
    pgpArmored.value = ''
    ElMessage({
      message: t('pgpImportSuccess'),
      type: 'success',
      plain: true,
    })
    refreshPgpKeyInfo()
  } catch (e) {
    console.warn('pgp import fail', e)
    ElMessage({
      message: t('pgpInvalidKey'),
      type: 'error',
      plain: true,
    })
  } finally {
    pgpImportLoading.value = false
  }
}

function delPgpKey() {
  ElMessageBox.confirm(t('pgpDeleteConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    removePrivateKey()
    pgpKeyInfo.value = null
    ElMessage({
      message: t('pgpDeleteSuccess'),
      type: 'success',
      plain: true,
    })
  })
}

function submitPwd() {
  if (setPwdLoading.value) return

  if (!form.currentPassword) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (!form.password) {
    ElMessage({
      message: t('emptyPwdMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password.length < 6) {
    ElMessage({
      message: t('pwdLengthMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  if (form.password !== form.newPwd) {
    ElMessage({
      message: t('confirmPwdFailMsg'),
      type: 'error',
      plain: true,
    })
    return
  }

  setPwdLoading.value = true
  resetPassword(form.currentPassword, form.password).then(() => {
    ElMessage({
      message: t('pwdChanged'),
      type: 'success',
      plain: true,
    })
    pwdShow.value = false
    setPwdLoading.value = false
    form.currentPassword = ''
    form.password = ''
    form.newPwd = ''
  }).catch(() => {
    setPwdLoading.value = false
  })

}

</script>
<style scoped lang="scss">
.box {
  padding: 40px 40px;

  @media (max-width: 767px) {
    padding: 30px 30px;
  }

  .avatar-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .avatar-preview {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--el-color-primary-light-8);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-text {
      font-size: 20px;
      font-weight: bold;
      color: var(--el-color-primary);
    }
  }

  .update-pwd {
    display: flex;
    flex-direction: column;
    gap: 15px;
  }

  .title {
    font-size: 18px;
    font-weight: bold;
  }

  .container {
    font-size: 14px;
    display: grid;
    gap: 20px;
    margin-bottom: 40px;

    .item {
      display: grid;
      grid-template-columns: 50px 1fr;
      gap: 140px;
      position: relative;
      > div:first-child {
        white-space: nowrap;
      }
      .oauth-bind-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .oauth-bind-item {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .oauth-bind-label {
        font-size: 13px;
        min-width: 60px;
      }
      .oauth-bound {
        font-size: 13px;
        color: var(--el-color-success);
      }
      .user-name {
        display: grid;
        grid-template-columns: auto 1fr;
        span:first-child {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      }

      .edit-name-input {
        position: absolute;
        bottom: -6px;
        .el-input {
          width: min(200px,calc(100vw - 222px));
        }
      }

      .edit-name {
        color: #4dabff;
        padding-left: 10px;
        cursor: pointer;
      }

      @media (max-width: 767px) {
        gap: 70px;
      }

      div:first-child {
        font-weight: bold;
      }

      div:last-child {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
  }

  .language {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-bottom: 40px;

    .language-select {
      width: 100px;
    }
  }

  .del-email {
    font-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .passkey-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 120px;
    max-height: 50vh;
    overflow-y: auto;

    .passkey-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--el-border-color-light);
      border-radius: 6px;

      .passkey-info {
        min-width: 0;

        .passkey-name {
          font-weight: bold;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .passkey-time {
          font-size: 12px;
          color: var(--regular-text-color);
        }
      }
    }
  }

  .pgp-key-box {
    min-height: 120px;

    .pgp-tip {
      font-size: 13px;
      color: var(--regular-text-color);
      margin-bottom: 10px;
      line-height: 1.6;
    }

    .pgp-textarea {
      :deep(.el-textarea__inner) {
        font-family: monospace;
        font-size: 12px;
      }
    }

    .totp-box {
      .totp-qr-wrap {
        display: flex;
        justify-content: center;
        padding: 12px;
        background: #fff;
        border-radius: 8px;
        margin-bottom: 12px;
      }

      .totp-secret-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .totp-secret {
        flex: 1;
        font-family: monospace;
        font-size: 13px;
        word-break: break-all;
        background: var(--el-fill-color-light);
        padding: 8px;
        border-radius: 6px;
      }

      .totp-hint {
        font-size: 13px;
        color: var(--regular-text-color);
        line-height: 1.6;
        margin-bottom: 12px;
      }

      .totp-code-input {
        :deep(.el-input__inner) {
          text-align: center;
          font-size: 20px;
          letter-spacing: 8px;
        }
      }

      .totp-recovery-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 4px;
      }

      .totp-recovery-code {
        font-family: monospace;
        font-size: 14px;
        text-align: center;
        background: var(--el-fill-color-light);
        padding: 8px 4px;
        border-radius: 6px;
      }

      .totp-status-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid var(--el-border-color-lighter);
        margin-bottom: 12px;
      }
    }

    .pgp-key-row {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
      font-size: 13px;
      align-items: baseline;

      .pgp-key-label {
        color: var(--regular-text-color);
        white-space: nowrap;
      }

      .pgp-fingerprint {
        font-family: monospace;
        word-break: break-all;
      }
    }
  }
}
</style>
