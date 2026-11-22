<template>
  <div class="hq-security">
    <!-- Password ------------------------------------------------------------>
    <div class="card-box">
      <div class="card-head">
        <h4>Password</h4>
        <span class="card-state" :class="passwordStateClass">{{ passwordStateLabel }}</span>
      </div>
      <p class="card-desc">
        Changing your password signs out every other session, so a stolen token cannot outlive it.
      </p>
      <div class="card-actions">
        <el-button plain @click="openPassword">{{ state.passwordChangedAt ? 'Change password' : 'Set a new password' }}</el-button>
      </div>
      <div v-if="state.passwordChangedAt" class="meta-line">
        Last changed {{ formatDate(state.passwordChangedAt) }}
      </div>
    </div>

    <!-- Authenticator ------------------------------------------------------->
    <div class="card-box">
      <div class="card-head">
        <h4>Authenticator app</h4>
        <span class="card-state" :class="mfaStateClass">{{ mfaStateLabel }}</span>
      </div>
      <p class="card-desc">
        XPass requires an authenticator app. It generates a fresh six-digit code every 30 seconds,
        so a stolen password alone is not enough to sign in.
      </p>

      <div v-if="enrolment" class="enrolment">
        <div class="enrolment-grid">
          <div class="qr-panel">
            <img v-if="qrDataUrl" :src="qrDataUrl" alt="Authenticator QR code" />
            <div v-else class="qr-fallback">
              <Icon icon="ph:qr-code" class="qr-icon" />
              <span>Use the setup key</span>
            </div>
          </div>
          <div class="key-panel">
            <label>Setup key</label>
            <div class="key-value">
              <code>{{ enrolment.manualKey }}</code>
              <el-button text @click="copyKey">Copy</el-button>
            </div>
            <div class="field-hint">
              Scan the QR code with Google Authenticator, Microsoft Authenticator, 1Password,
              or any TOTP-compatible app. If you cannot scan, type the key as a manual entry.
            </div>
          </div>
        </div>
        <div class="verify-row">
          <el-input v-model="enrolCode" maxlength="6" class="code-input" placeholder="000000"
                    @keyup.enter="confirmEnrolment" />
          <el-button type="primary" :loading="busy" @click="confirmEnrolment">Verify code</el-button>
        </div>
      </div>

        <div v-else class="card-actions">
        <el-button v-if="!state.mfaEnabled" type="primary" plain :loading="busy" :disabled="!loaded" @click="beginEnrolment">
          Set up authenticator
        </el-button>
        <template v-else>
          <el-button plain :loading="busy" @click="beginEnrolment">Replace authenticator</el-button>
          <el-button text type="danger" :loading="busy" @click="removeEnrolment">Remove</el-button>
        </template>
      </div>

      <div v-if="state.mfaEnabled" class="meta-line">
        Enrolled {{ formatDate(state.mfaEnrolledAt) }}
        <span v-if="state.recoveryCodeCount"> · {{ state.recoveryCodeCount }} recovery codes left</span>
      </div>
    </div>

    <!-- Recovery codes ------------------------------------------------------>
    <div class="card-box">
      <div class="card-head">
        <h4>Recovery codes</h4>
        <span class="card-state" :class="!loaded ? '' : (state.recoveryCodeCount ? 'ok' : 'warn')">
          {{ !loaded ? 'Checking…' : (state.recoveryCodeCount ? `${state.recoveryCodeCount} remaining` : 'None') }}
        </span>
      </div>
      <p class="card-desc">
        Each code signs you in once if you lose your authenticator.
        Regenerating invalidates the old set immediately.
      </p>

      <div v-if="recoveryCodes.length" class="recovery-block">
        <div class="recovery-grid">
          <code v-for="item in recoveryCodes" :key="item">{{ item }}</code>
        </div>
        <div class="card-actions">
          <el-button @click="downloadRecovery">Download</el-button>
          <el-button @click="copyRecovery">Copy all</el-button>
        </div>
      </div>

      <div v-else class="card-actions">
        <el-button plain :disabled="!loaded || !state.mfaEnabled" @click="showRegenerate = true">
          Generate new codes
        </el-button>
      </div>
    </div>

    <!-- Sessions ------------------------------------------------------------>
    <div class="card-box">
      <div class="card-head">
        <h4>Active sessions</h4>
        <span class="card-state">{{ loaded ? `${sessions.length} active` : 'Checking…' }}</span>
      </div>
      <p class="card-desc">
        A session belongs to one device. Revoking it signs that device out immediately.
      </p>

      <div class="session-list">
        <div v-for="item in sessions" :key="item.id" class="session-row">
          <div class="session-device">
            <Icon :icon="deviceIcon(item)" width="16" height="16" />
            <div>
              <div class="session-name">
                {{ item.browser || 'Unknown browser' }}
                <el-tag v-if="item.current" size="small" type="success" effect="plain">This device</el-tag>
              </div>
              <div class="session-meta">
{{ [item.os, item.device, item.ip].filter(Boolean).join(' · ') }}
                <span v-if="item.created_at"> · since {{ formatDate(item.created_at) }}</span>
              </div>
            </div>
          </div>
          <el-button v-if="!item.current" text type="danger" size="small"
                     :loading="busy" @click="revokeOne(item)">
            Sign out
          </el-button>
        </div>
        <div v-if="loaded && !sessions.length" class="empty-line">No active sessions.</div>
      </div>

      <div v-if="sessions.length > 1" class="card-actions">
        <el-button plain :loading="busy" :disabled="!loaded" @click="revokeOthers">Sign out all other devices</el-button>
      </div>
    </div>

    <!-- Login history ------------------------------------------------------->
    <div class="card-box">
      <div class="card-head">
        <h4>Recent security activity</h4>
        <el-button text size="small" :loading="busy" @click="loadAll">Refresh</el-button>
      </div>
      <p class="card-desc">Sign-ins, authenticator changes and password resets on your account.</p>

      <div class="history-list">
        <div v-for="item in history" :key="item.id" class="history-row">
          <span class="history-dot" :class="item.outcome" />
          <span class="history-label">{{ describe(item) }}</span>
          <span class="history-time">{{ formatDate(item.create_time) }}</span>
        </div>
        <div v-if="loaded && !history.length" class="empty-line">Nothing recorded yet.</div>
      </div>
    </div>

    <!-- Password dialog ----------------------------------------------------->

    <el-dialog v-model="passwordOpen" title="Change password" width="420px">
      <el-form label-position="top" @submit.prevent>
        <el-form-item label="Current password">
          <el-input v-model="passwordForm.current" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="New password">
          <el-input v-model="passwordForm.next" type="password" show-password autocomplete="new-password" />
          <div class="field-hint">At least 10 characters. A password manager can generate one for you.</div>
        </el-form-item>
        <el-form-item label="Confirm new password">
          <el-input v-model="passwordForm.confirm" type="password" show-password autocomplete="new-password"
                    @keyup.enter="submitPassword" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordOpen = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" @click="submitPassword">Save password</el-button>
      </template>
    </el-dialog>

    <!-- Regenerate recovery codes ------------------------------------------>

    <el-dialog v-model="showRegenerate" title="Generate new recovery codes" width="420px">
      <p class="dialog-copy">
This replaces every unused code with a new set. Save them before you continue —
        the old codes stop working immediately.
      </p>
      <el-input v-model="regenerateCode" maxlength="6" class="code-input" placeholder="Authenticator code" />
      <template #footer>
        <el-button @click="showRegenerate = false">Cancel</el-button>
        <el-button type="primary" :loading="busy" @click="regenerateRecovery">Generate codes</el-button>
      </template>
    </el-dialog>

    <!-- Remove authenticator ----------------------------------------------->

    <el-dialog v-model="showRemove" title="Remove authenticator" width="420px">
      <p class="dialog-copy">
        Removing the authenticator disables two-step verification on your account.
        XPass policy requires it, so you will be asked to enrol again at your next sign-in.
      </p>
      <el-input v-model="removeCode" maxlength="6" class="code-input" placeholder="Authenticator code" />
      <template #footer>
        <el-button @click="showRemove = false">Cancel</el-button>
        <el-button type="danger" :loading="busy" @click="confirmRemove">Remove</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {computed, onMounted, reactive, ref} from 'vue'
import {ElMessage} from 'element-plus'
import {Icon} from '@iconify/vue'
import {
    changePassword,
    listSessions,
    loginHistory,
    mfaRegenerateRecoveryCodes,
    mfaRemove,
    mfaSetup,
    mfaConfirm,
    revokeOtherSessions,
    revokeSession,
    securityState
} from '@/request/security.js'
import {useUserStore} from '@/store/user.js'

const emit = defineEmits(['changed'])

const userStore = useUserStore()

const state = reactive({
    mfaEnabled: false,
    mfaEnrolledAt: null,
    recoveryCodeCount: 0,
    passwordChangedAt: null,
    passwordChangeRequired: 'none'
})

const sessions = ref([])
const history = ref([])
const busy = ref(false)
const loaded = ref(false)

const passwordOpen = ref(false)
const passwordForm = reactive({current: '', next: '', confirm: ''})

const showRegenerate = ref(false)
const regenerateCode = ref('')

const showRemove = ref(false)
const removeCode = ref('')

const enrolment = ref(null)
const qrDataUrl = ref('')
const enrolCode = ref('')
const recoveryCodes = ref([])

// Nothing about the account's security is claimed until the real state has
// loaded. Before that we show "Checking…" rather than briefly asserting the
// account is unprotected.
const passwordStateLabel = computed(() => !loaded.value ? 'Checking…' : (state.passwordChangedAt ? 'Set' : 'Needs attention'))
const passwordStateClass = computed(() => !loaded.value ? '' : (state.passwordChangedAt ? 'ok' : 'warn'))

const mfaStateLabel = computed(() => !loaded.value ? 'Checking…' : (state.mfaEnabled ? 'Enabled' : 'Required — not set up'))
const mfaStateClass = computed(() => !loaded.value ? '' : (state.mfaEnabled ? 'ok' : 'warn'))

onMounted(loadAll)

async function loadAll() {
    busy.value = true
    try {
        const [security, sessionList, events] = await Promise.all([
            securityState(),
            listSessions().catch(() => []),
            loginHistory(30).catch(() => [])
        ])
        Object.assign(state, security || {})
        if (userStore.user) {
            userStore.user.security = {...(userStore.user.security || {}), ...security}
        }
        sessions.value = sessionList || []
        history.value = events || []
    } catch (e) {
        ElMessage({message: e?.message || 'Could not load security settings.', type: 'error', plain: true})
    } finally {
        busy.value = false
        loaded.value = true
    }
}

// The "Remove" button opens the confirmation dialog; the dialog itself calls
// confirmRemove(). Without this the template referenced an undefined handler.
function removeEnrolment() {
    removeCode.value = ''
    showRemove.value = true
}

function openPassword() {
    passwordForm.current = ''
    passwordForm.next = ''
    passwordForm.confirm = ''
    passwordOpen.value = true
}

async function submitPassword() {
    if (!passwordForm.current || !passwordForm.next) {
        ElMessage({message: 'Enter your current password and a new one.', type: 'warning', plain: true})
        return
    }
    if (passwordForm.next.length < 10) {
        ElMessage({message: 'Choose a password with at least 10 characters.', type: 'warning', plain: true})
        return
    }
    if (passwordForm.next !== passwordForm.confirm) {
        ElMessage({message: 'The two new passwords do not match.', type: 'warning', plain: true})
        return
    }

    busy.value = true
    try {
        await changePassword(passwordForm.current, passwordForm.next)
        ElMessage({message: 'Password changed. Other sessions were signed out.', type: 'success', plain: true})
        passwordOpen.value = false
        await loadAll()
        emit('changed')
    } catch (e) {
        ElMessage({message: e?.message || 'Could not change your password.', type: 'error', plain: true})
    } finally {
        busy.value = false
    }
}

async function beginEnrolment() {
    busy.value = true
    try {
        const data = await mfaSetup()
        enrolment.value = data
        qrDataUrl.value = await renderQr(data.otpauthUri)
    } catch (e) {
        ElMessage({message: e?.message || 'Could not start authenticator setup.', type: 'error', plain: true})
    } finally {
        busy.value = false
    }
}

async function renderQr(uri) {
    try {
        const {toDataURL} = await import('qrcode')
        return await toDataURL(uri, {width: 200, margin: 1})
    } catch {
        return ''
    }
}

async function confirmEnrolment() {
    if (!/^\d{6}$/.test(enrolCode.value)) {
        ElMessage({message: 'Enter the six-digit code from your authenticator.', type: 'warning', plain: true})
        return
    }
    busy.value = true
    try {
        const data = await mfaConfirm(enrolCode.value)
        recoveryCodes.value = data?.recoveryCodes || []
        enrolment.value = null
        enrolCode.value = ''
        ElMessage({
            message: recoveryCodes.value.length
                ? 'Authenticator enabled. Save your recovery codes.'
                : 'Authenticator enabled.',
            type: 'success',
            plain: true
        })
        await loadAll()
    } catch (e) {
        ElMessage({message: e?.message || 'That code is not valid.', type: 'error', plain: true})
    } finally {
        busy.value = false
    }
}

async function regenerateRecovery() {
    if (!/^\d{6}$/.test(regenerateCode.value)) {
        ElMessage({message: 'Enter the six-digit code from your authenticator.', type: 'warning', plain: true})
        return
    }
    busy.value = true
    try {
        const data = await mfaRegenerateRecoveryCodes(regenerateCode.value)
        recoveryCodes.value = data?.recoveryCodes || []
        showRegenerate.value = false
        regenerateCode.value = ''
        ElMessage({message: 'New recovery codes generated. The old ones no longer work.', type: 'success', plain: true})
        await loadAll()
        emit('changed')
    } catch (e) {
        ElMessage({message: e?.message || 'Could not generate codes.', type: 'error', plain: true})
    } finally {
        busy.value = false
    }
}

async function confirmRemove() {
    if (!/^\d{6}$/.test(removeCode.value)) {
        ElMessage({message: 'Enter the six-digit code from your authenticator.', type: 'warning', plain: true})
        return
    }
    busy.value = true
    try {
        await mfaRemove(removeCode.value)
        showRemove.value = false
        removeCode.value = ''
        ElMessage({message: 'Authenticator removed. Enrol again at your next sign-in.', type: 'warning', plain: true})
        await loadAll()
    } catch (e) {
        ElMessage({message: e?.message || 'Could not remove the authenticator.', type: 'error', plain: true})
    } finally {
        busy.value = false
    }
}

async function revokeOne(item) {
    busy.value = true
    try {
        await revokeSession(item.id)
        ElMessage({message: 'Session revoked.', type: 'success', plain: true})
        await loadAll()
        emit('changed')
    } catch (e) {
        ElMessage({message: e?.message || 'Could not revoke that session.', type: 'error', plain: true})
    } finally {
        busy.value = false
    }
}

async function revokeOthers() {
    busy.value = true
    try {
        await revokeOtherSessions()
        ElMessage({message: 'Other sessions signed out.', type: 'success', plain: true})
        await loadAll()
        emit('changed')
    } catch (e) {
        ElMessage({message: e?.message || 'Could not revoke other sessions.', type: 'error', plain: true})
    } finally {
        busy.value = false
    }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text)
        ElMessage({message: 'Copied', type: 'success', plain: true})
    } catch {
        ElMessage({message: 'Could not copy automatically.', type: 'warning', plain: true})
    }
}

function copyKey() {
    copyText(enrolment.value?.manualKey || '')
}

function copyRecovery() {
    copyText(recoveryCodes.value.join('\n'))
}

function downloadRecovery() {
    const blob = new Blob([recoveryCodes.value.join('\n')], {type: 'text/plain'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'xpass-recovery-codes.txt'
    anchor.click()
    URL.revokeObjectURL(url)
}

function deviceIcon(item) {
    const device = String(item?.device || '').toLowerCase()
    if (device.includes('mobile') || device.includes('phone')) return 'ph:device-mobile'
    if (device.includes('tablet')) return 'ph:device-tablet'
    return 'ph:device-laptop'
}

function describe(item) {
    const map = {
        login: item.outcome === 'failure' ? 'Failed sign-in' : 'Signed in',
        mfa: item.outcome === 'failure' ? 'Authenticator code rejected' : 'Authenticator changed',
        recovery: 'Recovery code used',
        password: item.outcome === 'failure' ? 'Password change failed' : 'Password changed',
        session: 'Session revoked',
        account: 'Account status changed',
        invitation: 'Onboarding invitation updated'
    }
    return map[item.kind] || item.kind
}

function formatDate(value) {
    if (!value) return ''
    const date = new Date(String(value).replace(' ', 'T'))
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    })
}

function onPasswordChanged() {
    loadAll()
}

function onRecoveryRegenerated() {
    loadAll()
}

function onSessionsRevoked() {
    loadAll()
}
</script>

<style scoped>
.hq-security {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.card-box {
    background: var(--panel, #14171c);
    border: 1px solid var(--line, #23272e);
    border-radius: 12px;
    padding: 16px 18px;
}

.card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
}

.card-head h4 {
    margin: 0;
    font-size: 14.5px;
    letter-spacing: -0.01em;
}

.card-state {
    font-size: 12px;
    color: var(--text-dim, #9aa3af);
}

.card-state.ok {
    color: #5fd39a;
}

.card-state.warn {
    color: #ffb057;
}

.card-desc {
    font-size: 13px;
    color: var(--text-dim, #9aa3af);
    margin: 0 0 12px;
    line-height: 1.55;
    max-width: 70ch;
}

.card-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.meta-line {
    margin-top: 10px;
    font-size: 12.5px;
    color: var(--text-dim, #9aa3af);
}

.enrolment {
    margin-top: 6px;
}

.enrolment-grid {
    display: grid;
    grid-template-columns: 210px 1fr;
    gap: 18px;
    align-items: start;
    margin-bottom: 14px;
}

.qr-panel {
    background: #fff;
    border-radius: 10px;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 210px;
}

.qr-panel img {
    width: 194px;
    height: 194px;
}

.qr-fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: #5b6472;
    font-size: 12px;
}

.qr-icon {
    font-size: 40px;
}

.key-panel label {
    display: block;
    font-size: 12px;
    color: var(--text-dim, #9aa3af);
    margin-bottom: 6px;
}

.key-value {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.key-value code {
    font-size: 12.5px;
    word-break: break-all;
    background: var(--line, #23272e);
    padding: 6px 10px;
    border-radius: 6px;
}

.field-hint {
    font-size: 12px;
    color: var(--text-dim, #9aa3af);
    margin-top: 8px;
    line-height: 1.5;
}

.verify-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.code-input :deep(input) {
    letter-spacing: 0.4em;
    font-size: 16px;
    text-align: center;
}

.recovery-block {
    margin-top: 4px;
}

.recovery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
    margin-bottom: 12px;
}

.recovery-grid code {
    background: var(--line, #23272e);
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 12.5px;
    letter-spacing: 0.06em;
    text-align: center;
}

.session-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 12px;
}

.session-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line, #23272e);
}

.session-row:last-child {
    border-bottom: none;
}

.session-device {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-dim, #9aa3af);
}

.session-name {
    font-size: 13.5px;
    color: var(--text, #e8eaed);
    display: flex;
    align-items: center;
    gap: 8px;
}

.session-meta {
    font-size: 12px;
    color: var(--text-dim, #9aa3af);
    margin-top: 2px;
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.history-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--line, #23272e);
}

.history-row:last-child {
    border-bottom: none;
}

.history-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-dim, #9aa3af);
    flex: none;
}

.history-dot.success {
    background: #5fd39a;
}

.history-dot.failure {
    background: #ff7b7b;
}

.history-label {
    flex: 1;
    color: var(--text, #e8eaed);
}

.history-time {
    color: var(--text-dim, #9aa3af);
    font-size: 12px;
}

.empty-line {
    font-size: 12.5px;
    color: var(--text-dim, #9aa3af);
    padding: 8px 0;
}

.dialog-copy {
    font-size: 13px;
    color: var(--text-dim, #9aa3af);
    line-height: 1.55;
    margin: 0 0 12px;
}

@media (max-width: 720px) {
    .enrolment-grid {
        grid-template-columns: 1fr;
    }

    .qr-panel {
        min-height: 180px;
    }
}
</style>

