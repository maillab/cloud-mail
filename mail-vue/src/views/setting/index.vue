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
                <div class="identity-head">
                  <hq-avatar :src="identity.avatarUrl" :name="identity.displayName" :username="identity.username" :size="56" />
                  <div class="identity-head-copy">
                    <div class="identity-name">{{ identity.displayName || 'Not set' }}</div>
                    <div class="identity-handle">{{ identity.username ? '@' + identity.username : 'No username yet' }}</div>
                    <div class="identity-meta">
                      {{ identity.jobTitle || 'No job title' }}
                      <span v-if="identity.team"> · {{ identity.team.name }}</span>
                    </div>
                  </div>
                  <div class="identity-head-actions">
                    <el-button size="small" :loading="avatarSaving" @click="pickAvatar">Change photo</el-button>
                    <el-button v-if="identity.avatarUrl" size="small" text type="danger" @click="removeAvatar">Remove</el-button>
                    <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden-file" @change="onAvatarChange" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">Display name</label>
                    <span class="field-desc">How you appear across HQ: people, requests, decisions, tasks and audit history.</span>
                  </div>
                  <div class="field-control">
                    <el-input v-model="identityForm.displayName" maxlength="80" placeholder="e.g. Rodney" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">Username</label>
                    <span class="field-desc">Your @handle. Used for mentions, assignments and audit history.</span>
                  </div>
                  <div class="field-control">
                    <el-input v-model="identityForm.username" maxlength="24" placeholder="e.g. rodney">
                      <template #prepend>@</template>
                    </el-input>
                    <div v-if="identityError" class="field-error">{{ identityError }}</div>
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">Position</label>
                    <span class="field-desc">Your position is set by an administrator. Ask them to change it.</span>
                  </div>
                  <div class="field-control">
                    <el-input :model-value="identity.jobTitle" disabled placeholder="Not set" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">Work phone</label>
                    <span class="field-desc">Optional. Only visible to you on your own profile.</span>
                  </div>
                  <div class="field-control">
                    <el-input v-model="identityForm.phone" maxlength="20" placeholder="+2547…" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">Team</label>
                    <span class="field-desc">Team membership is managed by an administrator.</span>
                  </div>
                  <div class="field-control">
                    <el-input :model-value="identity.team ? identity.team.name : ''" disabled placeholder="Not in a team" />
                  </div>
                </div>

                <div class="identity-actions">
                  <el-button type="primary" :loading="savingIdentity" @click="saveIdentity">Save identity</el-button>
                  <el-button :disabled="savingIdentity" @click="resetIdentityForm">Reset</el-button>
                </div>
              </div>

              <div class="card-box">
                <div class="form-row">
                  <div class="field-info">
                    <label class="field-label">{{ $t('username') }}</label>
                    <span class="field-desc">Your mail display name shown to email recipients.</span>
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
                      {{ userStore.user.role?.roleName || (userStore.user.type === 0 ? 'Administrator' : 'Team member') }}
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

            <!-- TAB 4: NOTIFICATIONS -->
            <section v-if="activeTab === 'notifications'" class="settings-section">
              <header class="section-header">
                <h3>{{ $t('noticeTitle') }}</h3>
                <p>Choose how XPass HQ keeps you informed. Security alerts are always on.</p>
              </header>

              <div class="card-box">
                <div v-loading="notifLoading" class="pref-list">
                  <div class="pref-row">
                    <div class="field-info">
                      <label class="field-label">{{ $t('notifEmail') }}</label>
                      <span class="field-desc">{{ $t('notifEmailDesc') }}</span>
                    </div>
                    <div class="field-control">
                      <el-switch v-model="notifPrefs.email" :disabled="notifSaving" />
                    </div>
                  </div>
                  <div class="pref-row">
                    <div class="field-info">
                      <label class="field-label">{{ $t('notifInApp') }}</label>
                      <span class="field-desc">{{ $t('notifInAppDesc') }}</span>
                    </div>
                    <div class="field-control">
                      <el-switch v-model="notifPrefs.inApp" :disabled="notifSaving" />
                    </div>
                  </div>
                  <div class="pref-row">
                    <div class="field-info">
                      <label class="field-label">{{ $t('notifDigest') }}</label>
                      <span class="field-desc">{{ $t('notifDigestDesc') }}</span>
                    </div>
                    <div class="field-control">
                      <el-switch v-model="notifPrefs.digest" :disabled="notifSaving" />
                    </div>
                  </div>
                  <div class="pref-row is-locked">
                    <div class="field-info">
                      <label class="field-label">{{ $t('notifSecurity') }}</label>
                      <span class="field-desc">{{ $t('notifSecurityDesc') }}</span>
                    </div>
                    <div class="field-control">
                      <el-switch :model-value="true" disabled />
                    </div>
                  </div>
                </div>
                <div class="pref-actions">
                  <el-button type="primary" :loading="notifSaving" @click="saveNotifPrefs">{{ $t('save') }}</el-button>
                  <el-button plain @click="resetNotifPrefs">{{ $t('reset') }}</el-button>
                  <el-button plain @click="uiStore.showNotice()">{{ $t('viewNotice') }}</el-button>
                </div>
              </div>

              <!-- TOUR PREFERENCES -->
              <div class="card-box">
                <header class="section-header">
                  <h3>{{ $t('tourPreferences') }}</h3>
                  <p>{{ $t('tourPreferencesDesc') }}</p>
                </header>
                <div class="pref-list">
                  <div class="pref-row">
                    <div class="field-info">
                      <label class="field-label">{{ $t('tourAutoStart') }}</label>
                      <span class="field-desc">{{ $t('tourAutoStartDesc') }}</span>
                    </div>
                    <div class="field-control">
                      <el-switch v-model="tutorialPrefs.showOnFirstVisit" @change="saveTutorialPrefs" />
                    </div>
                  </div>
                </div>
                <div class="pref-actions">
                  <el-button v-for="tour in availableTours" :key="tour.id" plain @click="startTour(tour.id)">
                    {{ tour.title }}
                  </el-button>
                  <el-button plain type="danger" @click="resetAllTours">{{ $t('reset') }}</el-button>
                </div>
              </div>
            </section>

            <!-- TAB 6: SECURITY -->
            <section v-if="activeTab === 'security'" class="settings-section">
              <header class="section-header">
                <h3>Security</h3>
                <p>Your password, authenticator, recovery codes and active sessions.</p>
              </header>

              <hq-security-panel @changed="onSecurityChanged" />

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
import { computed, defineOptions, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/store/user.js'
import { loginUserInfo } from '@/request/my.js'
import { useAccountStore } from '@/store/account.js'
import { useUiStore } from '@/store/ui.js'
import router from '@/router/index.js'
import { resetPassword, updateSignature, userDelete } from '@/request/my.js'
import { accountList, accountSetName, accountSetSignature } from '@/request/account.js'
import { fileToBase64 } from '@/utils/file-utils.js'
import HqAvatar from '@/components/hq-avatar/index.vue'
import HqSecurityPanel from '@/components/hq-security/index.vue'
import { identityGet, identityUpdate, avatarUpload, avatarRemove, teamList } from '@/request/profile.js'
import { sanitizeSignatureHtml } from '@/utils/email-html.js'
import { notificationsPreferencesGet, notificationsPreferencesSet, notificationsPreferencesReset } from '@/request/notifications.js'
import { useTutorialStore } from '@/store/tutorial.js'

defineOptions({
  name: 'setting'
})

const { t } = useI18n()
const route = useRoute()
const userStore = useUserStore()
const accountStore = useAccountStore()
const uiStore = useUiStore()

const activeTab = ref('profile')
const navTabs = [
  { id: 'profile', label: 'profile', icon: 'fluent:person-20-regular' },
  { id: 'accounts', label: 'mailAccounts', icon: 'fluent:mail-multiple-20-regular' },
  { id: 'signatures', label: 'emailSignatures', icon: 'hugeicons:quill-write-01' },
  { id: 'notifications', label: 'noticeTitle', icon: 'fluent:alert-20-regular' },
  { id: 'security', label: 'security', icon: 'fluent:shield-keyhole-20-regular' },
]

function applyTabFromRoute() {
  const requested = route.query.tab
  if (typeof requested === 'string' && navTabs.some(tab => tab.id === requested)) {
    activeTab.value = requested
  }
}
applyTabFromRoute()
watch(() => route.query.tab, applyTabFromRoute)

// SECURITY TAB
// The panel loads and owns its own data; the settings page only needs to
// refresh the cached identity so the header reflects a changed display name.
function onSecurityChanged() {
  loginUserInfo().then(user => {
    if (user) userStore.user = user
  }).catch(() => {})
}

// NOTIFICATION PREFERENCES TAB
// Channel toggles the member controls. Security is always on (server-enforced),
// so it is shown locked rather than as a mutable switch.
const notifLoading = ref(false)
const notifSaving = ref(false)
const notifPrefs = reactive({ email: true, inApp: true, digest: false })

async function loadNotifPrefs() {
  notifLoading.value = true
  try {
    const prefs = await notificationsPreferencesGet()
    notifPrefs.email = prefs?.email !== false
    notifPrefs.inApp = prefs?.inApp !== false
    notifPrefs.digest = prefs?.digest === true
  } catch {
    // keep defaults; the panel still works if the read fails
  } finally {
    notifLoading.value = false
  }
}

async function saveNotifPrefs() {
  if (notifSaving.value) return
  notifSaving.value = true
  try {
    await notificationsPreferencesSet({
      email: notifPrefs.email,
      inApp: notifPrefs.inApp,
      digest: notifPrefs.digest,
    })
    ElMessage({ message: 'Notification preferences saved.', type: 'success', plain: true })
  } catch {
    // interceptor surfaces the reason
  } finally {
    notifSaving.value = false
  }
}

async function resetNotifPrefs() {
  try {
    await notificationsPreferencesReset()
    notifPrefs.email = true
    notifPrefs.inApp = true
    notifPrefs.digest = false
    ElMessage({ message: 'Notification preferences reset.', type: 'success', plain: true })
  } catch {
    // interceptor surfaces the reason
  }
}

// TOUR PREFERENCES
const tutorialStore = useTutorialStore()
const tutorialPrefs = reactive({ showOnFirstVisit: true })
const availableTours = computed(() => tutorialStore.availableTours)

async function saveTutorialPrefs() {
  await tutorialStore.savePreferences({ showOnFirstVisit: tutorialPrefs.showOnFirstVisit })
}

function startTour(tourId) {
  tutorialStore.startTour(tourId)
}

async function resetAllTours() {
  await tutorialStore.resetAll()
  ElMessage({ message: 'Tour progress reset.', type: 'success', plain: true })
}

// PROFILE TAB
const editingName = ref(false)
const nameInput = ref('')
const savingName = ref(false)

// INTERNAL IDENTITY
const identity = ref({ userId: null, displayName: '', username: '', email: '', avatarUrl: '', jobTitle: '', phone: '', team: null })
const identityForm = ref({ displayName: '', username: '', jobTitle: '', phone: '', teamId: null })
const identityError = ref('')
const savingIdentity = ref(false)
const avatarSaving = ref(false)
const avatarInput = ref(null)
const teams = ref([])

function resetIdentityForm() {
  identityError.value = ''
  identityForm.value = {
    displayName: identity.value.displayName || '',
    username: identity.value.username || '',
    jobTitle: identity.value.jobTitle || '',
    phone: identity.value.phone || '',
    teamId: identity.value.team?.id ?? null
  }
}

async function loadIdentity() {
  try {
    const data = await identityGet()
    if (data) {
      identity.value = {
        userId: data.userId,
        displayName: data.displayName || '',
        username: data.username || '',
        email: data.email || '',
        avatarUrl: data.avatarUrl || '',
        jobTitle: data.jobTitle || '',
        phone: data.phone || '',
        team: data.team || null
      }
      resetIdentityForm()
    }
  } catch (error) {
    identityError.value = error.message || 'Could not load your identity.'
  }
}

async function loadTeams() {
  try {
    teams.value = await teamList()
  } catch {
    teams.value = []
  }
}

async function saveIdentity() {
  identityError.value = ''
  savingIdentity.value = true
  try {
    const data = await identityUpdate({
      displayName: identityForm.value.displayName,
      username: identityForm.value.username,
      phone: identityForm.value.phone
    })
    identity.value = {
      ...identity.value,
      displayName: data.displayName || '',
      username: data.username || '',
      jobTitle: data.jobTitle || '',
      phone: data.phone || '',
      team: data.team || null
    }
    resetIdentityForm()
    await userStore.refreshUserInfo()
    ElMessage({ message: 'Identity updated.', type: 'success', plain: true })
  } catch (error) {
    identityError.value = error.message || 'Could not save your identity.'
    ElMessage({ message: identityError.value, type: 'error', plain: true })
  } finally {
    savingIdentity.value = false
  }
}

function pickAvatar() {
  avatarInput.value?.click()
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

async function onAvatarChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    ElMessage({ message: 'Choose a PNG, JPG or WEBP image.', type: 'warning', plain: true })
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    ElMessage({ message: 'Profile photo must be 2 MB or smaller.', type: 'warning', plain: true })
    return
  }
  avatarSaving.value = true
  try {
    const dataUrl = await readAsDataUrl(file)
    const result = await avatarUpload(dataUrl)
    identity.value = { ...identity.value, avatarUrl: result?.avatarUrl || identity.value.avatarUrl }
    await userStore.refreshUserInfo()
    ElMessage({ message: 'Profile photo updated.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not upload that image.', type: 'error', plain: true })
  } finally {
    avatarSaving.value = false
  }
}

async function removeAvatar() {
  avatarSaving.value = true
  try {
    await avatarRemove()
    identity.value = { ...identity.value, avatarUrl: '' }
    await userStore.refreshUserInfo()
    ElMessage({ message: 'Profile photo removed.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not remove that image.', type: 'error', plain: true })
  } finally {
    avatarSaving.value = false
  }
}

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
  loadIdentity()
  loadTeams()
  loadNotifPrefs()
  tutorialStore.load().then(() => { tutorialPrefs.showOnFirstVisit = tutorialStore.preferences.showOnFirstVisit })
})

watch(activeTab, (tab) => {
  if (tab === 'notifications') {
    loadNotifPrefs()
    tutorialStore.load().then(() => { tutorialPrefs.showOnFirstVisit = tutorialStore.preferences.showOnFirstVisit })
  }
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

.pref-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border-bottom: 1px solid var(--hq-border);

  &:first-child { padding-top: 0; }
  &:last-child { padding-bottom: 0; border-bottom: none; }

  &.is-locked .field-label {
    color: var(--hq-muted);
  }

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
}

.pref-actions {
  display: flex;
  gap: 8px;
  padding-top: 8px;
  flex-wrap: wrap;
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
    background: var(--hq-surface);
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

.appearance-static {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--hq-surface);
  color: var(--hq-text-secondary);
  font-size: 13px;
  font-weight: 550;
}

.appearance-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #050403;
  box-shadow: inset 0 0 0 3px #ff5500;
}

.identity-head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--hq-border);
}

.identity-head-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.identity-name {
  color: var(--hq-text);
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -.01em;
}

.identity-handle {
  color: var(--hq-accent);
  font-size: 12.5px;
  font-weight: 550;
}

.identity-meta {
  color: var(--hq-muted);
  font-size: 12.5px;
}

.identity-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.hidden-file {
  display: none;
}

.identity-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 14px;
  border-top: 1px solid var(--hq-border);
  margin-top: 6px;
}

.field-error {
  margin-top: 6px;
  color: var(--hq-danger);
  font-size: 12px;
}</style>
