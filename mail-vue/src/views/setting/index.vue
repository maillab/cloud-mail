<template>
  <div class="settings-page">
    <div class="settings-shell">
      <aside class="settings-nav" aria-label="Settings navigation">
        <div class="settings-nav-header">
          <h2>{{ $t('settings') }}</h2>
          <p class="settings-subtitle">Manage your account, signatures, and preferences</p>
        </div>
        <nav class="settings-nav-list">
          <button
            v-for="tab in navTabs"
            :key="tab.id"
            type="button"
            class="nav-tab"
            :class="{ 'is-active': activeTab === tab.id }"
            :aria-current="activeTab === tab.id ? 'page' : undefined"
            @click="activeTab = tab.id"
          >
            <Icon :icon="tab.icon" width="18" height="18" />
            <span>{{ t(tab.label) }}</span>
          </button>
        </nav>
      </aside>

      <main class="settings-content" aria-label="Settings details">
        <el-scrollbar height="100%">
          <div class="settings-content-body">

            <!-- TAB 1: PROFILE -->
            <section v-if="activeTab === 'profile'" class="settings-section">
              <header class="section-header">
                <h3>{{ $t('profile') }}</h3>
                <p>Your company profile and identity details.</p>
              </header>

              <div class="card-box">
                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('username') }}</label>
                    <span class="field-desc">Your display name shown to email recipients and team members.</span>
                  </div>
                  <div class="field-control">
                    <div v-if="editingName" class="inline-edit">
                      <el-input v-model="nameInput" maxlength="50" placeholder="Display name" @keyup.enter="saveName" />
                      <div class="action-buttons">
                        <el-button size="small" type="primary" :loading="savingName" @click="saveName">{{ $t('save') }}</el-button>
                        <el-button size="small" @click="editingName = false">{{ $t('cancel') }}</el-button>
                      </div>
                    </div>
                    <div v-else class="display-value">
                      <span class="val-text">{{ userStore.user.name || 'Not set' }}</span>
                      <button type="button" class="btn-text-link" @click="startEditName">{{ $t('change') }}</button>
                    </div>
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('emailAccount') }}</label>
                    <span class="field-desc">Primary login and notification email address.</span>
                  </div>
                  <div class="field-control">
                    <span class="val-text font-mono">{{ userStore.user.email }}</span>
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">Account Role</label>
                    <span class="field-desc">Permissions assigned to your user account.</span>
                  </div>
                  <div class="field-control">
                    <el-tag :type="userStore.user.type === 0 ? 'warning' : 'info'" size="small">
                      {{ userStore.user.role?.roleName || (userStore.user.type === 0 ? 'Administrator' : 'Employee') }}
                    </el-tag>
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('password') }}</label>
                    <span class="field-desc">Update your login password securely.</span>
                  </div>
                  <div class="field-control">
                    <el-button plain @click="pwdShow = true">{{ $t('changePassword') }}</el-button>
                  </div>
                </div>
              </div>
            </section>

            <!-- TAB 2: MAIL ACCOUNTS -->
            <section v-if="activeTab === 'accounts'" class="settings-section">
              <header class="section-header">
                <h3>{{ $t('mailAccounts') }}</h3>
                <p>Manage sending addresses and mailboxes associated with your user.</p>
              </header>

              <div class="card-box">
                <div class="accounts-header">
                  <span class="accounts-count">{{ accountsList.length }} sending {{ accountsList.length === 1 ? 'address' : 'addresses' }}</span>
                </div>

                <div class="accounts-list">
                  <div v-for="acc in accountsList" :key="acc.accountId" class="account-card">
                    <div class="account-card-info">
                      <div class="account-card-title">
                        <span class="acc-email">{{ acc.email }}</span>
                        <el-tag v-if="acc.accountId === accountStore.currentAccountId" size="small" type="success" effect="light">Active</el-tag>
                        <el-tag v-if="acc.signature || acc.signatureText || acc.signatureImageUrl" size="small" type="info" effect="plain">Custom signature</el-tag>
                      </div>
                      <span class="acc-meta">Display name: {{ acc.name || 'Same as profile' }}</span>
                    </div>
                    <div class="account-card-actions">
                      <el-button size="small" plain @click="editAccountSignature(acc)">Configure signature</el-button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- TAB 3: EMAIL SIGNATURES -->
            <section v-if="activeTab === 'signatures'" class="settings-section">
              <header class="section-header">
                <h3>{{ $t('emailSignatures') }}</h3>
                <p>Create and customize professional branded email signatures for outgoing mail.</p>
              </header>

              <div class="card-box signature-config-card">
                <!-- ACCOUNT SCOPE SELECTOR -->
                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('signatureConfigFor') }}</label>
                    <span class="field-desc">Customize a signature for a specific address or configure the default.</span>
                  </div>
                  <div class="field-control">
                    <el-select v-model="selectedScopeId" class="scope-select" @change="handleScopeChange">
                      <el-option label="Default (All sending addresses)" value="default" />
                      <el-option
                        v-for="acc in accountsList"
                        :key="acc.accountId"
                        :label="`${acc.email} (${acc.name || 'Account'})`"
                        :value="acc.accountId"
                      />
                    </el-select>
                  </div>
                </div>

                <!-- SIGNATURE BEHAVIOR TOGGLES -->
                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('enableAutoSignature') }}</label>
                    <span class="field-desc">Automatically append this signature when opening Compose for new messages.</span>
                  </div>
                  <div class="field-control">
                    <el-switch v-model="sigEnabled" active-color="#ff5500" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('enableReplySignature') }}</label>
                    <span class="field-desc">Include your signature above quoted text when replying or forwarding.</span>
                  </div>
                  <div class="field-control">
                    <el-switch v-model="sigReplyEnabled" active-color="#ff5500" />
                  </div>
                </div>

                <el-divider />

                <!-- BRANDED GRAPHIC ASSET -->
                <div class="signature-form-group">
                  <div class="group-title">
                    <h4>{{ $t('signaturePictureOptional') }}</h4>
                    <p>{{ $t('brandedGraphicNote') }}</p>
                  </div>

                  <input
                    ref="signatureFileInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    class="hidden-file-input"
                    @change="handleSignatureImageSelect"
                  />

                  <div class="image-uploader-box">
                    <div v-if="sigPreviewUrl" class="image-preview-container">
                      <img :src="sigPreviewUrl" alt="Branded signature banner" class="signature-image-preview" />
                      <div class="image-actions">
                        <el-button size="small" @click="signatureFileInput?.click()">Replace image</el-button>
                        <el-button size="small" type="danger" plain @click="removeSelectedImage">{{ $t('removeImage') }}</el-button>
                      </div>
                    </div>
                    <div v-else class="image-upload-empty" @click="signatureFileInput?.click()">
                      <Icon icon="fluent:image-add-24-regular" width="36" height="36" />
                      <span class="upload-title">{{ $t('chooseImage') }}</span>
                      <span class="upload-hint">Upload custom branded XPass banner (PNG, JPG, WEBP, max 2MB)</span>
                    </div>
                  </div>
                </div>

                <!-- SIGNATURE TITLE / PLAIN TEXT FALLBACK -->
                <div class="signature-form-group">
                  <div class="group-title">
                    <h4>{{ $t('signatureTextLabel') }}</h4>
                    <p>{{ $t('signaturePlainTextHelper') }}</p>
                  </div>
                  <el-input
                    v-model="sigText"
                    type="textarea"
                    :rows="3"
                    maxlength="2000"
                    show-word-limit
                    placeholder="e.g. Rodney Adams | Engineering Operations&#10;XPass HQ — https://getxpass.net"
                  />
                </div>

                <!-- HTML FORMATTED SIGNATURE -->
                <div class="signature-form-group">
                  <div class="group-title">
                    <h4>{{ $t('signatureHtmlLabel') }}</h4>
                    <p>{{ $t('signatureHtmlHelper') }}</p>
                  </div>
                  <el-input
                    v-model="sigHtml"
                    type="textarea"
                    :rows="5"
                    maxlength="10000"
                    show-word-limit
                    placeholder="<table style='font-family: sans-serif; font-size: 13px;'>...</table>"
                  />
                </div>

                <!-- LIVE ACCURATE PREVIEW -->
                <div class="signature-form-group preview-group">
                  <div class="preview-header">
                    <h4>{{ $t('signaturePreviewTitle') }}</h4>
                    <el-radio-group v-model="previewMode" size="small">
                      <el-radio-button label="html">Email View</el-radio-button>
                      <el-radio-button label="text">Plain Text</el-radio-button>
                    </el-radio-group>
                  </div>

                  <div class="preview-render-card">
                    <div v-if="previewMode === 'html'" class="html-preview-surface">
                      <div v-if="liveHtmlSignature" v-html="liveHtmlSignature" />
                      <div v-else class="empty-preview-hint">No signature content configured yet. Fill in text, image or HTML above.</div>
                    </div>
                    <pre v-else class="text-preview-surface">{{ livePlainTextSignature || 'No plain text fallback specified.' }}</pre>
                  </div>
                </div>

                <!-- ACTIONS BAR -->
                <div class="signature-actions-bar">
                  <el-button type="primary" :loading="savingSignature" @click="handleSaveSignature">
                    {{ $t('saveSignature') }}
                  </el-button>
                  <el-button plain @click="handleResetSignature">
                    {{ $t('resetSignature') }}
                  </el-button>
                </div>
              </div>
            </section>

            <!-- TAB 4: APPEARANCE -->
            <section v-if="activeTab === 'appearance'" class="settings-section">
              <header class="section-header">
                <h3>{{ $t('appearance') }}</h3>
                <p>Customize the look and feel of XPass HQ for your display preference.</p>
              </header>

              <div class="card-box">
                <div class="form-row appearance-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('themeStyle') }}</label>
                    <span class="field-desc">Select between Light, Dark, or automatically match your operating system appearance.</span>
                  </div>
                  <div class="field-control full-width">
                    <ThemeSelector />
                  </div>
                </div>
              </div>
            </section>

            <!-- TAB 5: NOTIFICATIONS -->
            <section v-if="activeTab === 'notifications'" class="settings-section">
              <header class="section-header">
                <h3>{{ $t('noticeTitle') }}</h3>
                <p>Company-wide bulletins, updates, and system notices.</p>
              </header>

              <div class="card-box">
                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('noticeInfo') }}</label>
                    <span class="field-desc">Review notices and announcements published by XPass leadership.</span>
                  </div>
                  <div class="field-control">
                    <el-button plain @click="uiStore.showNotice()">{{ $t('viewNotice') }}</el-button>
                  </div>
                </div>
              </div>
            </section>

            <!-- TAB 6: SECURITY -->
            <section v-if="activeTab === 'security'" class="settings-section">
              <header class="section-header">
                <h3>{{ $t('security') }}</h3>
                <p>Credential management and account protection status.</p>
              </header>

              <div class="card-box">
                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('securityAuthStatus') }}</label>
                    <span class="field-desc">{{ $t('securityAuthStatusDesc') }}</span>
                  </div>
                  <div class="field-control">
                    <el-tag type="success" effect="plain">Authenticated</el-tag>
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('password') }}</label>
                    <span class="field-desc">Change your password to keep your mailbox protected.</span>
                  </div>
                  <div class="field-control">
                    <el-button plain @click="pwdShow = true">{{ $t('changePassword') }}</el-button>
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">Multi-Factor Authentication (MFA)</label>
                    <span class="field-desc">{{ $t('security2faNotice') }}</span>
                  </div>
                  <div class="field-control">
                    <el-tag type="info">Planned for Identity Sprint</el-tag>
                  </div>
                </div>
              </div>

              <!-- DANGER ZONE -->
              <div v-perm="'my:delete'" class="card-box danger-card">
                <div class="danger-info">
                  <h4>{{ $t('deleteUser') }}</h4>
                  <p>{{ $t('delAccountMsg') }}</p>
                </div>
                <el-button type="danger" plain @click="deleteConfirm">{{ $t('deleteUserBtn') }}</el-button>
              </div>
            </section>

          </div>
        </el-scrollbar>
      </main>
    </div>

    <!-- PASSWORD MODAL -->
    <el-dialog v-model="pwdShow" :title="$t('changePassword')" width="380px">
      <div class="update-pwd-dialog">
        <el-input type="password" :placeholder="$t('newPassword')" v-model="pwdForm.password" show-password autocomplete="off" />
        <el-input type="password" :placeholder="$t('confirmPassword')" v-model="pwdForm.newPwd" show-password autocomplete="off" @keyup.enter="submitPwd" />
      </div>
      <template #footer>
        <el-button @click="pwdShow = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="setPwdLoading" @click="submitPwd">{{ $t('save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, defineOptions, onMounted, reactive, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/store/user.js'
import { useAccountStore } from '@/store/account.js'
import { useUiStore } from '@/store/ui.js'
import router from '@/router/index.js'
import { resetPassword, updateSignature, userDelete } from '@/request/my.js'
import { accountList, accountSetName, accountSetSignature } from '@/request/account.js'
import ThemeSelector from '@/components/theme-selector/index.vue'
import { fileToBase64 } from '@/utils/file-utils.js'
import { sanitizeSignatureHtml } from '@/utils/email-html.js'

defineOptions({
  name: 'setting'
})

const { t } = useI18n()
const userStore = useUserStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()

const activeTab = ref('profile')
const navTabs = [
  { id: 'profile', label: 'profile', icon: 'fluent:person-20-regular' },
  { id: 'accounts', label: 'mailAccounts', icon: 'fluent:mail-multiple-20-regular' },
  { id: 'signatures', label: 'emailSignatures', icon: 'hugeicons:quill-write-01' },
  { id: 'appearance', label: 'appearance', icon: 'fluent:paint-brush-20-regular' },
  { id: 'notifications', label: 'noticeTitle', icon: 'fluent:alert-20-regular' },
  { id: 'security', label: 'security', icon: 'fluent:shield-keyhole-20-regular' },
]

// PROFILE TAB
const editingName = ref(false)
const nameInput = ref('')
const savingName = ref(false)

function startEditName() {
  nameInput.value = userStore.user.name || ''
  editingName.value = true
}

async function saveName() {
  if (!nameInput.value.trim()) {
    ElMessage({ message: t('emptyUserNameMsg'), type: 'error', plain: true })
    return
  }
  savingName.value = true
  const newName = nameInput.value.trim()
  try {
    const accountId = userStore.user.account?.accountId
    if (accountId) {
      await accountSetName(accountId, newName)
    }
    userStore.user.name = newName
    accountStore.changeUserAccountName = newName
    editingName.value = false
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not update display name', type: 'error', plain: true })
  } finally {
    savingName.value = false
  }
}

// ACCOUNTS TAB
const accountsList = ref([])
async function fetchAccounts() {
  try {
    const res = await accountList(null, 50)
    accountsList.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (err) {
    console.error('Failed to load accounts list in settings:', err)
  }
}

onMounted(() => {
  fetchAccounts()
  loadSignatureScope('default')
})

function editAccountSignature(acc) {
  activeTab.value = 'signatures'
  selectedScopeId.value = acc.accountId
  loadSignatureScope(acc.accountId)
}

// SIGNATURES TAB
const selectedScopeId = ref('default')
const sigEnabled = ref(true)
const sigReplyEnabled = ref(true)
const sigText = ref('')
const sigHtml = ref('')
const sigPreviewUrl = ref('')
const sigImageData = ref('')
const removeImageFlag = ref(false)
const signatureFileInput = ref()
const savingSignature = ref(false)
const previewMode = ref('html')

function handleScopeChange(val) {
  loadSignatureScope(val)
}

function loadSignatureScope(scopeId) {
  removeImageFlag.value = false
  sigImageData.value = ''

  if (scopeId === 'default') {
    const user = userStore.user || {}
    const settings = user.signature_settings || {}
    sigEnabled.value = settings.enabled !== false
    sigReplyEnabled.value = settings.replyForward !== false
    sigText.value = user.signature_text || ''
    sigHtml.value = user.signature || ''
    sigPreviewUrl.value = user.signature_image_url || ''
  } else {
    const acc = accountsList.value.find(item => item.accountId === scopeId)
    if (acc) {
      sigEnabled.value = acc.signatureEnabled !== 0
      sigReplyEnabled.value = acc.signatureReplyEnabled !== 0
      sigText.value = acc.signatureText || ''
      sigHtml.value = acc.signature || ''
      sigPreviewUrl.value = acc.signatureImageUrl || ''
    }
  }
}

async function handleSignatureImageSelect(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    ElMessage({ message: t('signatureImageTypeError'), type: 'error', plain: true })
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    ElMessage({ message: t('signatureImageSizeError'), type: 'error', plain: true })
    return
  }

  try {
    const base64 = await fileToBase64(file, true)
    sigImageData.value = base64
    sigPreviewUrl.value = base64
    removeImageFlag.value = false
  } catch (error) {
    ElMessage({ message: 'Could not read image file', type: 'error', plain: true })
  }
}

function removeSelectedImage() {
  sigPreviewUrl.value = ''
  sigImageData.value = ''
  removeImageFlag.value = true
}

const liveHtmlSignature = computed(() => {
  if (sigHtml.value && sigHtml.value.trim()) {
    return sanitizeSignatureHtml(sigHtml.value.trim())
  }
  const text = (sigText.value || '').trim()
  const imgUrl = sigPreviewUrl.value || ''
  if (!text && !imgUrl) return ''

  const textHtml = text ? `<div style="font-size: 13px; color: var(--hq-text); line-height: 1.5; margin-bottom: 8px;">${text.replace(/\r\n?|\n/g, '<br>')}</div>` : ''
  const imgHtml = imgUrl ? `<img src="${imgUrl}" width="260" alt="XPass Signature" style="max-width: 260px; height: auto; display: block; border: 0; border-radius: 4px;" />` : ''
  return `<div class="xpass-user-signature" style="margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--hq-border); font-family: sans-serif;">${textHtml}${imgHtml}</div>`
})

const livePlainTextSignature = computed(() => {
  const text = (sigText.value || '').trim()
  if (!text) return ''
  return `-- \n${text}`
})

async function handleSaveSignature() {
  if (savingSignature.value) return
  savingSignature.value = true

  try {
    if (selectedScopeId.value === 'default') {
      const params = {
        signatureText: sigText.value,
        signature: sigHtml.value,
        signatureSettings: {
          enabled: sigEnabled.value,
          replyForward: sigReplyEnabled.value
        },
        removeSignatureImage: removeImageFlag.value
      }
      if (sigImageData.value) {
        params.signatureImageData = sigImageData.value
      }
      const updatedUser = await updateSignature(params)
      userStore.user = updatedUser
      sigText.value = updatedUser.signature_text || ''
      sigHtml.value = updatedUser.signature || ''
      sigPreviewUrl.value = updatedUser.signature_image_url || ''
      sigImageData.value = ''
      removeImageFlag.value = false
    } else {
      const params = {
        accountId: selectedScopeId.value,
        signatureText: sigText.value,
        signature: sigHtml.value,
        signatureEnabled: sigEnabled.value ? 1 : 0,
        signatureReplyEnabled: sigReplyEnabled.value ? 1 : 0,
        removeSignatureImage: removeImageFlag.value
      }
      if (sigImageData.value) {
        params.signatureImageData = sigImageData.value
      }
      const updatedAccount = await accountSetSignature(params)
      const index = accountsList.value.findIndex(a => a.accountId === selectedScopeId.value)
      if (index > -1) {
        Object.assign(accountsList.value[index], updatedAccount)
      }
      if (accountStore.currentAccountId === selectedScopeId.value) {
        Object.assign(accountStore.currentAccount, updatedAccount)
      }
      sigText.value = updatedAccount.signatureText || ''
      sigHtml.value = updatedAccount.signature || ''
      sigPreviewUrl.value = updatedAccount.signatureImageUrl || ''
      sigImageData.value = ''
      removeImageFlag.value = false
    }

    ElMessage({ message: t('signatureSaveSuccess'), type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || t('signatureSaveFailed'), type: 'error', plain: true })
  } finally {
    savingSignature.value = false
  }
}

function handleResetSignature() {
  ElMessageBox.confirm(t('signatureResetConfirm'), 'Reset Signature', {
    confirmButtonText: 'Clear',
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    sigText.value = ''
    sigHtml.value = ''
    sigPreviewUrl.value = ''
    sigImageData.value = ''
    removeImageFlag.value = true
    handleSaveSignature()
  })
}

// SECURITY & PASSWORD
const pwdShow = ref(false)
const setPwdLoading = ref(false)
const pwdForm = reactive({
  password: '',
  newPwd: ''
})

async function submitPwd() {
  if (setPwdLoading.value) return
  if (!pwdForm.password) {
    ElMessage({ message: t('emptyPwdMsg'), type: 'error', plain: true })
    return
  }
  if (pwdForm.password.length < 6) {
    ElMessage({ message: t('pwdLengthMsg'), type: 'error', plain: true })
    return
  }
  if (pwdForm.password !== pwdForm.newPwd) {
    ElMessage({ message: t('confirmPwdFailMsg'), type: 'error', plain: true })
    return
  }

  setPwdLoading.value = true
  try {
    await resetPassword(pwdForm.password)
    ElMessage({ message: t('saveSuccessMsg'), type: 'success', plain: true })
    pwdShow.value = false
    pwdForm.password = ''
    pwdForm.newPwd = ''
  } catch (error) {
    ElMessage({ message: error.message || 'Could not change password', type: 'error', plain: true })
  } finally {
    setPwdLoading.value = false
  }
}

function deleteConfirm() {
  ElMessageBox.confirm(t('delAccountConfirm'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(async () => {
    await userDelete()
    localStorage.removeItem('token')
    router.replace('/login')
    ElMessage({ message: t('delSuccessMsg'), type: 'success', plain: true })
  })
}
</script>

<style scoped lang="scss">
.settings-page {
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: var(--hq-page);
}

.settings-shell {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  height: 100%;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  overflow: hidden;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.settings-nav {
  padding: 28px 18px 24px;
  border-right: 1px solid var(--hq-border);
  background: var(--hq-surface);
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (max-width: 768px) {
    padding: 16px;
    border-right: 0;
    border-bottom: 1px solid var(--hq-border);
  }
}

.settings-nav-header {
  h2 {
    font-size: 20px;
    font-weight: 700;
    color: var(--hq-text);
    margin: 0 0 4px;
    font-family: var(--hq-font-heading);
  }
  .settings-subtitle {
    font-size: 12px;
    color: var(--hq-muted);
    line-height: 1.4;
    margin: 0;
  }
}

.settings-nav-list {
  display: flex;
  flex-direction: column;
  gap: 4px;

  @media (max-width: 768px) {
    flex-direction: row;
    overflow-x: auto;
    padding-bottom: 4px;
  }
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--hq-radius-md);
  color: var(--hq-text-secondary);
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  cursor: pointer;
  transition: all .15s ease;
  white-space: nowrap;

  &:hover {
    background: var(--hq-hover);
    color: var(--hq-text);
  }

  &.is-active {
    background: var(--hq-selected);
    color: var(--hq-accent);
    font-weight: 600;
  }
}

.settings-content {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--hq-page);
}

.settings-content-body {
  padding: 32px 40px 60px;
  max-width: 860px;

  @media (max-width: 768px) {
    padding: 20px 16px 40px;
  }
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-header {
  h3 {
    font-size: 18px;
    font-weight: 700;
    color: var(--hq-text);
    margin: 0 0 4px;
    font-family: var(--hq-font-heading);
  }
  p {
    font-size: 13px;
    color: var(--hq-text-secondary);
    margin: 0;
  }
}

.card-box {
  background: var(--hq-surface);
  border: 1px solid var(--hq-border);
  border-radius: var(--hq-radius-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, .04);
}

.form-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--hq-border);

  &:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  @media (max-width: 640px) {
    flex-direction: column;
  }
}

.field-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 380px;

  .field-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--hq-text);
  }
  .field-desc {
    font-size: 12px;
    color: var(--hq-muted);
    line-height: 1.4;
  }
}

.field-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;

  &.full-width {
    width: 100%;
    justify-content: flex-start;
  }

  .display-value {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .val-text {
    font-size: 13px;
    color: var(--hq-text);

    &.font-mono {
      font-family: monospace;
      font-size: 12.5px;
    }
  }

  .btn-text-link {
    color: var(--hq-accent);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    padding: 0;

    &:hover {
      text-decoration: underline;
    }
  }

  .inline-edit {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 240px;

    .action-buttons {
      display: flex;
      gap: 6px;
    }
  }
}

.accounts-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--hq-text-secondary);
}

.accounts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.account-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid var(--hq-border);
  border-radius: var(--hq-radius-md);
  background: var(--hq-page);

  .account-card-info {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .account-card-title {
      display: flex;
      align-items: center;
      gap: 8px;

      .acc-email {
        font-weight: 600;
        font-size: 13.5px;
        color: var(--hq-text);
      }
    }

    .acc-meta {
      font-size: 12px;
      color: var(--hq-muted);
    }
  }
}

.signature-config-card {
  gap: 24px;
}

.scope-select {
  width: 280px;

  @media (max-width: 640px) {
    width: 100%;
  }
}

.signature-form-group {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .group-title {
    h4 {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--hq-text);
      margin: 0 0 2px;
    }
    p {
      font-size: 12px;
      color: var(--hq-muted);
      margin: 0;
      line-height: 1.4;
    }
  }
}

.hidden-file-input {
  display: none;
}

.image-uploader-box {
  border: 1px dashed var(--hq-border-strong);
  border-radius: var(--hq-radius-md);
  padding: 16px;
  background: var(--hq-page);
}

.image-upload-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px;
  cursor: pointer;
  color: var(--hq-text-secondary);
  transition: all .15s ease;

  &:hover {
    border-color: var(--hq-accent);
    color: var(--hq-accent);
  }

  .upload-title {
    font-size: 13.5px;
    font-weight: 600;
  }
  .upload-hint {
    font-size: 11.5px;
    color: var(--hq-muted);
  }
}

.image-preview-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;

  .signature-image-preview {
    max-width: 260px;
    max-height: 90px;
    object-fit: contain;
    border-radius: 4px;
    border: 1px solid var(--hq-border);
    background: #ffffff;
  }

  .image-actions {
    display: flex;
    gap: 8px;
  }
}

.preview-group {
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    h4 {
      margin: 0;
      font-size: 13.5px;
      font-weight: 600;
      color: var(--hq-text);
    }
  }
}

.preview-render-card {
  border: 1px solid var(--hq-border);
  border-radius: var(--hq-radius-md);
  padding: 18px;
  background: var(--hq-page);
  min-height: 110px;

  .html-preview-surface {
    font-size: 13px;
    color: var(--hq-text);
  }

  .empty-preview-hint {
    font-size: 12px;
    color: var(--hq-muted);
    font-style: italic;
    padding: 20px 0;
    text-align: center;
  }

  .text-preview-surface {
    font-family: monospace;
    font-size: 12.5px;
    color: var(--hq-text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
    margin: 0;
  }
}

.signature-actions-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
}

.danger-card {
  border-color: var(--hq-danger);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 20px;

  .danger-info {
    h4 {
      font-size: 14px;
      font-weight: 700;
      color: var(--hq-danger);
      margin: 0 0 4px;
    }
    p {
      font-size: 12.5px;
      color: var(--hq-muted);
      margin: 0;
    }
  }
}

.update-pwd-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
