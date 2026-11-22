<template>
  <el-drawer v-model="visible" size="480px" :with-header="false" append-to-body>
    <div class="ms-drawer">
      <div class="ms-drawer-head">
        <div>
          <div class="ms-drawer-title">Member Security</div>
          <div class="ms-drawer-sub">{{ userName }}</div>
        </div>
        <button type="button" class="ms-drawer-close" aria-label="Close" @click="visible = false">
          <Icon icon="fluent:dismiss-20-regular" width="16" height="16" />
        </button>
      </div>

      <div v-if="loading" class="ms-loading">Loading…</div>
      <div v-else-if="!state" class="ms-empty">Could not load security state.</div>
      <div v-else class="ms-content">
        <!-- MFA status -->
        <section class="ms-section">
          <h3 class="ms-section-title">Authenticator</h3>
          <div class="ms-row">
            <span class="ms-label">MFA status</span>
            <el-tag :type="state.mfaEnabled ? 'success' : 'info'" size="small">
              {{ state.mfaEnabled ? 'Enabled' : 'Not enrolled' }}
            </el-tag>
          </div>
          <div v-if="state.mfaEnrolledAt" class="ms-row">
            <span class="ms-label">Enrolled</span>
            <span class="ms-value">{{ formatDate(state.mfaEnrolledAt) }}</span>
          </div>
          <div v-if="state.mfaEnabled" class="ms-row">
            <span class="ms-label">Recovery codes</span>
            <span class="ms-value">{{ state.recoveryCodeCount }} remaining</span>
          </div>
        </section>

        <!-- Onboarding -->
        <section class="ms-section">
          <h3 class="ms-section-title">Onboarding</h3>
          <div class="ms-row">
            <span class="ms-label">Status</span>
            <el-tag :type="state.onboardingComplete ? 'success' : 'warning'" size="small">
              {{ state.onboardingComplete ? 'Complete' : 'Pending' }}
            </el-tag>
          </div>
          <div v-if="state.passwordChangeRequired && state.passwordChangeRequired !== 'none'" class="ms-row">
            <span class="ms-label">Password change</span>
            <span class="ms-value">{{ state.passwordChangeRequired }}</span>
          </div>
        </section>

        <!-- Reset authenticator -->
        <section v-if="canResetMfa" class="ms-section ms-danger">
          <h3 class="ms-section-title">Reset authenticator</h3>
          <p class="ms-hint">
            This removes the member's authenticator and recovery codes, revokes all sessions,
            and forces a password change on next sign-in. The member will enrol a new authenticator.
          </p>
          <label class="ms-field">
            <span class="ms-field-label">Reason (audit log)</span>
            <el-input v-model="mfaReason" type="textarea" :rows="2" placeholder="Why is this reset needed?" maxlength="500" />
          </label>
          <label class="ms-field">
            <span class="ms-field-label">Your authenticator code (step-up)</span>
            <el-input v-model="mfaStepUp" placeholder="6-digit code from your app" maxlength="6" />
          </label>
          <label class="ms-check">
            <input v-model="mfaForcePassword" type="checkbox" />
            <span>Force password change on next sign-in</span>
          </label>
          <el-button type="danger" :loading="mfaSaving" :disabled="!mfaReason.trim() || mfaStepUp.length !== 6" @click="resetMfa">
            Reset authenticator
          </el-button>
        </section>

        <!-- Reset password -->
        <section v-if="canResetPassword" class="ms-section">
          <h3 class="ms-section-title">Reset password</h3>
          <p class="ms-hint">
            Generates a temporary password the member must change on next sign-in.
            The password is shown once — copy it somewhere safe.
          </p>
          <el-button :loading="pwdSaving" @click="resetPassword">Generate temporary password</el-button>
          <div v-if="tempPassword" class="ms-temp-pwd">
            <span class="ms-label">Temporary password (shown once):</span>
            <code>{{ tempPassword }}</code>
          </div>
        </section>

        <!-- Sessions -->
        <section class="ms-section">
          <h3 class="ms-section-title">Active sessions ({{ sessions.length }})</h3>
          <div v-if="!sessions.length" class="ms-hint">No active sessions.</div>
          <div v-for="s in sessions" :key="s.id" class="ms-session">
            <div class="ms-session-main">
              <Icon icon="fluent:laptop-20-regular" width="14" height="14" />
              <span>{{ [s.os, s.device, s.ip].filter(Boolean).join(' · ') || 'Unknown device' }}</span>
            </div>
            <span class="ms-session-date">{{ s.created_at ? formatDate(s.created_at) : '' }}</span>
          </div>
        </section>

        <!-- Login history -->
        <section class="ms-section">
          <h3 class="ms-section-title">Recent sign-ins</h3>
          <div v-if="!history.length" class="ms-hint">No sign-in history.</div>
          <div v-for="(h, i) in history.slice(0, 8)" :key="i" class="ms-history-row">
            <Icon :icon="h.outcome === 'success' ? 'fluent:checkmark-circle-20-regular' : 'fluent:error-circle-20-regular'" width="14" height="14" />
            <span class="ms-history-detail">{{ h.detail || h.kind }}</span>
            <span class="ms-history-date">{{ h.create_time ? formatDate(h.create_time) : '' }}</span>
          </div>
        </section>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { userSecurityGet, userResetMfa, userResetPassword } from '@/request/security.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  userId: { type: [Number, String], default: null },
  userName: { type: String, default: 'Member' },
})

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const emit = defineEmits(['update:modelValue'])

const canResetMfa = computed(() => hasPerm('user:reset-mfa'))
const canResetPassword = computed(() => hasPerm('user:reset-password'))

const loading = ref(false)
const state = ref(null)
const sessions = ref([])
const history = ref([])

const mfaReason = ref('')
const mfaStepUp = ref('')
const mfaForcePassword = ref(true)
const mfaSaving = ref(false)

const pwdSaving = ref(false)
const tempPassword = ref('')

function formatDate(d) {
  if (!d) return ''
  try {
    const date = new Date(d)
    return date.toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return d }
}

async function load() {
  if (!props.userId) return
  loading.value = true
  state.value = null
  sessions.value = []
  history.value = []
  tempPassword.value = ''
  mfaReason.value = ''
  mfaStepUp.value = ''
  try {
    const data = await userSecurityGet(props.userId)
    state.value = data?.state || null
    sessions.value = data?.sessions || []
    history.value = data?.history || []
  } catch {
    // surfaced by interceptor
  } finally {
    loading.value = false
  }
}

async function resetMfa() {
  if (mfaSaving.value) return
  mfaSaving.value = true
  try {
    await userResetMfa(props.userId, mfaReason.value, mfaStepUp.value, mfaForcePassword.value)
    ElMessage({ message: 'Authenticator reset. The member will enrol a new one on next sign-in.', type: 'success', plain: true })
    mfaReason.value = ''
    mfaStepUp.value = ''
    await load()
  } catch {
    // interceptor surfaces the reason
  } finally {
    mfaSaving.value = false
  }
}

async function resetPassword() {
  if (pwdSaving.value) return
  pwdSaving.value = true
  try {
    // Omit the password so the backend generates a secure random one.
    const res = await userResetPassword(props.userId)
    tempPassword.value = res?.temporaryPassword || '(check audit log)'
    ElMessage({ message: 'Temporary password generated. Copy it now — it is shown only once.', type: 'success', plain: true })
  } catch {
    // interceptor surfaces the reason
  } finally {
    pwdSaving.value = false
  }
}

watch(() => props.modelValue, (v) => {
  if (v) load()
})

watch(() => props.userId, (v) => {
  if (v && props.modelValue) load()
})
</script>

<style scoped>
.ms-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 18px 20px;
  gap: 18px;
  overflow-y: auto;
}

.ms-drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.ms-drawer-title {
  font-size: 16px;
  font-weight: 650;
  color: var(--hq-text, #1a1a1a);
}

.ms-drawer-sub {
  color: var(--hq-muted, #6b6b6b);
  font-size: 12.5px;
}

.ms-drawer-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-muted, #6b6b6b);
  cursor: pointer;
}
.ms-drawer-close:hover { background: var(--hq-hover, #f0f0f0); color: var(--hq-text, #1a1a1a); }

.ms-loading, .ms-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--hq-muted, #6b6b6b);
  font-size: 13px;
}

.ms-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ms-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--hq-border, #e7e2dc);
  border-radius: 10px;
  background: var(--hq-surface, #fff);
}

.ms-section.ms-danger {
  border-color: rgba(220, 38, 38, 0.25);
  background: rgba(220, 38, 38, 0.03);
}

.ms-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--hq-text, #1a1a1a);
}

.ms-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
}

.ms-label { color: var(--hq-muted, #6b6b6b); }
.ms-value { color: var(--hq-text, #1a1a1a); font-weight: 500; }

.ms-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--hq-muted, #6b6b6b);
}

.ms-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ms-field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--hq-text-secondary, #4a4a4a);
}

.ms-check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--hq-text-secondary, #4a4a4a);
  cursor: pointer;
}

.ms-temp-pwd {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--hq-selected, #fff1e8);
}
.ms-temp-pwd code {
  font-size: 14px;
  font-weight: 650;
  color: var(--hq-accent, #ff5500);
  user-select: all;
}

.ms-session {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--hq-border, #e7e2dc);
  font-size: 12px;
}
.ms-session:last-child { border-bottom: none; }
.ms-session-main {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--hq-text, #1a1a1a);
}
.ms-session-date { color: var(--hq-muted, #6b6b6b); font-size: 11px; }

.ms-history-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--hq-border, #e7e2dc);
  font-size: 12px;
}
.ms-history-row:last-child { border-bottom: none; }
.ms-history-detail { flex: 1; color: var(--hq-text, #1a1a1a); }
.ms-history-date { color: var(--hq-muted, #6b6b6b); font-size: 11px; }
</style>