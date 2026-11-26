<template>
    <div class="onboarding-shell">
        <div class="onboarding-card">
            <div class="onboarding-head">
                <div class="brand-mark">
                    <img src="/xpass-mark.png" alt="" />
                </div>
                <h1>Secure your XPass HQ account</h1>
                <p>XPass requires an authenticator app before you can access company tools.</p>
            </div>

            <ol class="stepper">
                <li v-for="(step, index) in steps" :key="step.key"
                    :class="{active: index === current, done: index < current}">
                    <span class="step-index">{{ index + 1 }}</span>
                    <span class="step-name">{{ step.label }}</span>
                </li>
            </ol>

            <!-- Step 1: password ------------------------------------------------ -->
            <section v-if="current === 0" class="step-body">
                <h2>Choose a new password</h2>
                <p class="muted">
                    Your account was issued a temporary credential. Set your own password before continuing.
                </p>

                <el-form label-position="top" @submit.prevent>
                    <el-form-item label="Current password">
                        <el-input v-model="password.current" type="password" show-password
                                  autocomplete="current-password" placeholder="The password you just used" />
                    </el-form-item>
                    <el-form-item label="New password">
                        <el-input v-model="password.next" type="password" show-password
                                  autocomplete="new-password" placeholder="At least 10 characters" />
                        <div class="field-hint">
                            Use a password manager. Longer phrases are stronger than short complex ones.
                        </div>
                    </el-form-item>
                    <el-form-item label="Confirm new password">
                        <el-input v-model="password.confirm" type="password" show-password
                                  autocomplete="new-password" @keyup.enter="submitPassword" />
                    </el-form-item>
                </el-form>
            </section>

            <!-- Step 2: authenticator ------------------------------------------- -->
            <section v-else-if="current === 1" class="step-body">
                <div v-if="reenroll" class="reenroll-note">
                    <Icon icon="fluent:arrow-repeat-all-20-regular" width="18" height="18" />
                    <div>
                        <strong>Your authenticator is being re-enrolled.</strong>
                        <span>You signed in with a recovery code, which means your previous authenticator may be lost.
                        Set up a new one now so you can sign in normally from here on. Your old codes no longer work.</span>
                    </div>
                </div>
                <h2>Set up your authenticator</h2>
                <p class="muted">
                    Scan the QR code with your authenticator app, then enter the six-digit code it shows.
                    Works with Google Authenticator, Microsoft Authenticator, 1Password and any
                    TOTP-compatible app.
                </p>

                <div v-if="enrolment" class="enrolment-grid">
                    <div class="qr-panel">
                        <img v-if="qrDataUrl" :src="qrDataUrl" alt="Authenticator QR code for XPass HQ" />
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
                            If you cannot scan the QR code, type this key into your authenticator app
                            as a manual entry (time-based, 6 digits, 30 seconds).
                        </div>
                        <label class="otpauth-label">Or open in your app</label>
                        <a class="otpauth-link" :href="enrolment.otpauthUri">Open authenticator</a>
                    </div>
                </div>
                <div v-else class="enrolment-empty">
                    <Icon icon="ph:qr-code" class="qr-icon" />
                    <p class="muted">Could not load the QR code. Use the button below to try again.</p>
                    <el-button @click="startEnrolment">Retry setup</el-button>
                </div>

                <el-form label-position="top" @submit.prevent>
                    <el-form-item label="Authenticator code">
                        <el-input ref="codeInput" v-model="code.value" maxlength="6" class="code-input"
                                  placeholder="000000" inputmode="numeric" autocomplete="one-time-code"
                                  @keyup.enter="submitCode" />
                    </el-form-item>
                </el-form>
                <div v-if="code.error" class="inline-error">{{ code.error }}</div>
            </section>

            <!-- Step 3: recovery codes ------------------------------------------ -->
            <section v-else-if="current === 2" class="step-body">
                <h2>Save your recovery codes</h2>
                <p class="muted">
                    Each code signs you in once if you lose your authenticator.
                    Store them somewhere safe — they are shown only now.
                </p>

                <div class="recovery-grid">
                    <code v-for="item in recoveryCodes" :key="item">{{ item }}</code>
                </div>

                <div class="recovery-actions">
                    <el-button @click="downloadRecoveryCodes">Download as text</el-button>
                    <el-button @click="copyRecoveryCodes">Copy all</el-button>
                </div>

                <el-checkbox v-model="recoverySaved">
                    I have saved these codes somewhere only I can access.
                </el-checkbox>
            </section>

            <!-- Step 4: finish -------------------------------------------------- -->
            <section v-else class="step-body">
                <div class="complete-panel">
                    <Icon icon="mdi:check-circle" class="complete-icon" />
                    <h2>You are ready</h2>
                    <p class="muted">
                        Your account is protected. Company tools unlock once you continue.
                    </p>
                </div>
            </section>

            <div v-if="error" class="inline-error">{{ error }}</div>

            <footer class="onboarding-foot">
                <el-button v-if="current > 0" text @click="goBack">Back</el-button>
                <span class="spacer" />
                <el-button v-if="current < 3" type="primary" :loading="busy" @click="advance">
                    {{ advanceLabel }}
                </el-button>
                <el-button v-else type="primary" :loading="busy" @click="finish">
                    Enter XPass HQ
                </el-button>
            </footer>
        </div>
    </div>
</template>

<script setup>
import {computed, nextTick, onMounted, reactive, ref} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage} from 'element-plus'
import {Icon} from '@iconify/vue'
import {
    onboardingChangePassword,
    onboardingFinish,
    onboardingState,
    mfaConfirm,
    mfaSetup
} from '@/request/security.js'

const router = useRouter()

// A recovery code was used at sign-in, so the authenticator may be lost. The
// login flow sets this flag; we surface a short re-enrolment note so the member
// understands why they are setting up an authenticator again.
const reenroll = ref(false)

const steps = [
    {key: 'password', label: 'Password'},
    {key: 'authenticator', label: 'Authenticator'},
    {key: 'recovery', label: 'Recovery codes'},
    {key: 'done', label: 'Ready'}
]

const current = ref(0)
const busy = ref(false)
const error = ref('')
const enrolment = ref(null)
const qrDataUrl = ref('')
const codeInput = ref(null)
const recoveryCodes = ref([])
const recoverySaved = ref(false)

const password = reactive({current: '', next: '', confirm: ''})
const code = reactive({value: '', error: ''})

const advanceLabel = computed(() => {
    return ['Continue', 'Verify code', 'Finish setup'][current.value] || 'Continue'
})

const state = reactive({
    passwordChangeRequired: 'none',
    mfaEnabled: false
})

onMounted(() => {
  // Read the re-enrolment flag set by the login flow when a recovery code was
  // used. Clear it so a refresh does not keep showing the note.
  reenroll.value = sessionStorage.getItem('xpass:reenroll') === '1'
  if (reenroll.value) sessionStorage.removeItem('xpass:reenroll')
  loadState()
})

async function loadState() {
    try {
        const data = await onboardingState()
        Object.assign(state, data || {})
        if (data?.passwordChangeRequired === 'none') {
            if (data.mfaEnabled) {
                // Password set and authenticator enrolled: only the final
                // confirmation remains. Show Ready so the member can enter HQ.
                // This also recovers a refresh that happened mid-flow, so the
                // member is never stranded on an empty recovery-codes screen.
                current.value = 3
                recoverySaved.value = true
            } else {
                current.value = 1
                await startEnrolment()
            }
        }
        // else: current stays 0 (password step) for a member who must set one.
    } catch (e) {
        // No onboarding session: nothing to do here.
        router.replace('/login')
    }
}

async function startEnrolment() {
    error.value = ''
    try {
        const data = await mfaSetup()
        enrolment.value = data
        await renderQr(data.otpauthUri)
        await nextTick()
        if (codeInput.value && typeof codeInput.value.focus === 'function') {
            codeInput.value.focus()
        }
    } catch (e) {
        // Surface the real reason instead of silently leaving a blank panel.
        // A failed setup must not strand the member on an unclickable screen.
        error.value = e?.message || 'Could not start authenticator setup. Try again.'
    }
}

// The QR code is generated locally from the otpauth URI. A tiny inline encoder
// keeps this working offline and avoids sending the secret anywhere.
async function renderQr(uri) {
    try {
        const {toDataURL} = await import('qrcode')
        qrDataUrl.value = await toDataURL(uri, {width: 220, margin: 1})
    } catch {
        qrDataUrl.value = ''
    }
}

async function submitPassword() {
    if (!password.current || !password.next) {
        error.value = 'Enter your current password and a new one.'
        return
    }
    if (password.next.length < 10) {
        error.value = 'Choose a password with at least 10 characters.'
        return
    }
    if (password.next !== password.confirm) {
        error.value = 'The two new passwords do not match.'
        return
    }

    busy.value = true
    error.value = ''
    try {
        await onboardingChangePassword(password.current, password.next)
        password.current = ''
        password.next = ''
        password.confirm = ''
        current.value = 1
        await startEnrolment()
    } catch (e) {
        error.value = e?.message || 'Could not change your password.'
    } finally {
        busy.value = false
    }
}

async function submitCode() {
    // Guard: if enrolment never started, there is no secret to confirm against.
    // Re-trigger setup instead of letting the member click Verify into a wall.
    if (!enrolment.value) {
        await startEnrolment()
        if (!enrolment.value) return
    }

    if (!/^\d{6}$/.test(code.value)) {
        code.error = 'Enter the six-digit code from your authenticator app.'
        return
    }

    busy.value = true
    error.value = ''
    code.error = ''
    try {
        const data = await mfaConfirm(code.value)
        recoveryCodes.value = data?.recoveryCodes || []
        code.value = ''
        current.value = 2
    } catch (e) {
        code.error = e?.message || "That code isn't valid. Try the newest code from your app."
    } finally {
        busy.value = false
    }
}

function advance() {
    error.value = ''
    code.error = ''
    if (current.value === 0) {
        submitPassword()
    } else if (current.value === 1) {
        submitCode()
    } else if (current.value === 2) {
        // Recovery codes step: require the member to confirm they saved the
        // codes before moving to Ready. Without this guard the member could
        // reach Ready with the Enter HQ button disabled and no way back.
        if (!recoverySaved.value) {
            error.value = 'Please confirm you have saved your recovery codes before continuing.'
            return
        }
        current.value = 3
    } else {
        finish()
    }
}

function goBack() {
    error.value = ''
    code.error = ''
    current.value = Math.max(0, current.value - 1)
}

async function finish() {
    // Defence in depth: never finish without the recovery codes confirmed.
    // Reaching Ready normally guarantees this, but a stale/edge state must not
    // silently strand the member.
    if (!recoverySaved.value) {
        current.value = 2
        error.value = 'Please save your recovery codes and confirm before entering HQ.'
        return
    }

    busy.value = true
    error.value = ''
    try {
        await onboardingFinish()
        // Refresh the identity so the router guard sees onboardingComplete=true
        // before we navigate. Without this, the guard redirects back here.
        const { loginUserInfo } = await import('@/request/my.js')
        const { useUserStore } = await import('@/store/user.js')
        const { permsToRouter } = await import('@/perm/perm.js')
        const user = await loginUserInfo()
        if (user) {
            const userStore = useUserStore()
            userStore.user = user
            const routers = permsToRouter(user.permKeys || [])
            routers.forEach(routerData => {
                router.addRoute('layout', routerData)
            })
        }
        ElMessage({message: 'Your account is secure. Welcome to XPass HQ.', type: 'success'})
        await router.replace({name: 'overview'})
    } catch (e) {
        error.value = e?.message || 'Could not finish setup. Please try again.'
    } finally {
        busy.value = false
    }
}

function copyKey() {
    copyText(enrolment.value?.manualKey || '')
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text)
        ElMessage({message: 'Copied', type: 'success', plain: true})
    } catch {
        ElMessage({message: 'Could not copy automatically.', type: 'warning', plain: true})
    }
}

function copyRecoveryCodes() {
    copyText(recoveryCodes.value.join('\n'))
}

function downloadRecoveryCodes() {
    const blob = new Blob([recoveryCodes.value.join('\n')], {type: 'text/plain'})
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'xpass-recovery-codes.txt'
    anchor.click()
    URL.revokeObjectURL(url)
}
</script>

<style scoped>
/* The app root (html, body, #app) is overflow:hidden, so this shell must be
   its own scroll container. Without this, step 2 (QR + setup key + code input
   + footer) is taller than the viewport on small screens and the footer
   button cannot be reached. */
.onboarding-shell {
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
    box-sizing: border-box;
    background: radial-gradient(1200px 600px at 50% -10%, rgba(255, 138, 61, 0.10), transparent 70%), var(--bg, #0b0d10);
}

.onboarding-card {
    /* auto margins centre the card when it fits and collapse to 0 when it is
       taller than the viewport, so the shell scrolls instead of clipping. */
    margin: auto;
    width: 100%;
    max-width: 720px;
    background: var(--panel, #14171c);
    border: 1px solid var(--line, #23272e);
    border-radius: 16px;
    padding: 28px 30px 22px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}

.onboarding-head {
    text-align: center;
    margin-bottom: 20px;
}

.brand-mark img {
    width: 34px;
    height: 34px;
    object-fit: contain;
}

.onboarding-head h1 {
    font-size: 20px;
    margin: 10px 0 6px;
    letter-spacing: -0.01em;
}

.onboarding-head p {
    margin: 0 auto;
    max-width: 46ch;
    font-size: 13.5px;
    color: var(--text-dim, #9aa3af);
}

.stepper {
    list-style: none;
    display: flex;
    gap: 8px;
    padding: 0;
    margin: 0 0 22px;
}

.stepper li {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text-dim, #9aa3af);
    border-bottom: 2px solid transparent;
    padding-bottom: 8px;
}

.stepper li.active {
    color: var(--text, #e8eaed);
    border-bottom-color: var(--orange, #ff8a3d);
}

.stepper li.done {
    color: var(--text, #e8eaed);
}

.step-index {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11.5px;
    background: var(--line, #23272e);
}

.stepper li.active .step-index,
.stepper li.done .step-index {
    background: var(--orange, #ff8a3d);
    color: #14171c;
}

.step-body h2 {
    font-size: 15.5px;
    margin: 0 0 6px;
}

.reenroll-note {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 0 0 16px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--el-color-warning, #d98a1c) 30%, transparent);
    border-radius: 9px;
    background: color-mix(in srgb, var(--el-color-warning, #d98a1c) 10%, transparent);
    color: var(--text-dim, #9aa3af);
    font-size: 12.5px;
    line-height: 1.5;
}

.reenroll-note strong {
    display: block;
    margin-bottom: 2px;
    color: var(--el-text-color-primary, #1a1a1a);
    font-size: 13px;
}

.reenroll-note span {
    display: block;
}

.reenroll-note :deep(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
    color: var(--el-color-warning, #d98a1c);
}

.muted {
    color: var(--text-dim, #9aa3af);
    font-size: 13px;
    margin: 0 0 18px;
}

.enrolment-grid {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 20px;
    align-items: start;
    margin-bottom: 18px;
}

.qr-panel {
    background: #fff;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 240px;
}

.qr-panel img {
    width: 220px;
    height: 220px;
}

.qr-fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: #5b6472;
    font-size: 12.5px;
}

.qr-icon {
    font-size: 44px;
}

.enrolment-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 28px 16px;
    background: var(--line, #23272e);
    border-radius: 10px;
    color: #b2a49a;
    margin-bottom: 18px;
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
    font-size: 13px;
    word-break: break-all;
    background: var(--line, #23272e);
    padding: 6px 10px;
    border-radius: 6px;
}

.otpauth-label {
    margin-top: 14px;
}

.otpauth-link {
    font-size: 13px;
    color: var(--orange, #ff8a3d);
}

.field-hint {
    font-size: 12px;
    color: var(--text-dim, #9aa3af);
    margin-top: 8px;
    line-height: 1.5;
}

.code-input :deep(input) {
    letter-spacing: 0.4em;
    font-size: 18px;
    text-align: center;
}

.recovery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
}

.recovery-grid code {
    background: var(--line, #23272e);
    padding: 8px 10px;
    border-radius: 6px;
    font-size: 13px;
    letter-spacing: 0.06em;
    text-align: center;
}

.recovery-actions {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
}

.complete-panel {
    text-align: center;
    padding: 22px 0 10px;
}

.complete-icon {
    font-size: 44px;
    color: var(--orange, #ff8a3d);
}

.complete-panel h2 {
    margin-top: 10px;
}

.inline-error {
    background: rgba(255, 92, 92, 0.12);
    border: 1px solid rgba(255, 92, 92, 0.4);
    color: #ff9b9b;
    padding: 9px 12px;
    border-radius: 8px;
    font-size: 13px;
    margin: 8px 0;
}

.onboarding-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 22px;
    padding-top: 16px;
    border-top: 1px solid var(--line, #23272e);
}

.spacer {
    flex: 1;
}

@media (max-width: 720px) {
    .enrolment-grid {
        grid-template-columns: 1fr;
    }

    .qr-panel {
        min-height: 200px;
    }

    .step-name {
        display: none;
    }
}
</style>


