<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / CONNECTIONS</div>
          <h1>Connections</h1>
          <p class="module-subtitle">The services XPass HQ connects to. Set each one up once here; team members never handle these credentials themselves.</p>
        </div>
        <div class="module-actions">
          <el-button text circle icon="refresh" :aria-label="'Refresh'" title="Refresh" :loading="loading" @click="load" />
        </div>
      </div>

      <div v-if="summary.totalCount" class="conn-summary">
        <span class="conn-summary-count">{{ summary.configuredCount }} of {{ summary.totalCount }}</span>
        <span class="conn-summary-label">connections configured</span>
      </div>

      <div v-loading="loading" class="conn-grid">
        <article v-for="item in items" :key="item.provider" class="conn-card">
          <div class="conn-card-head">
            <div class="conn-card-title">
              <span class="conn-card-name">{{ item.name }}</span>
              <el-tag size="small" :type="comingSoonContentFor(item) ? 'info' : statusTagType(item)" effect="plain">{{ comingSoonContentFor(item) ? 'Coming soon' : statusLabel(item) }}</el-tag>
            </div>
            <span class="conn-card-group">{{ item.group }}</span>
          </div>
          <p class="conn-card-purpose">{{ item.purpose }}</p>
          <div class="conn-card-status">
            <span class="conn-status-dot" :class="comingSoonContentFor(item) ? 'is-idle' : statusDotClass(item)"></span>
            <span class="conn-status-text">{{ comingSoonContentFor(item) ? 'Not available yet. This connection is being built.' : statusDetail(item) }}</span>
          </div>
          <div class="conn-card-actions">
            <el-button v-if="!comingSoonContentFor(item)" size="small" :type="primaryType(item)" @click="openDrawer(item)">
              {{ actionLabel(item) }}
            </el-button>
            <span v-else class="conn-soon-note">Coming soon</span>
          </div>
        </article>
      </div>

      <el-empty v-if="!loading && !items.length" description="No connections are available for your account." />
    </div>
  </el-scrollbar>

  <el-drawer
    v-model="drawerVisible"
    :title="active ? active.name : 'Connection'"
    direction="rtl"
    size="460px"
    append-to-body
    class="conn-drawer"
    @closed="resetForm"
  >
    <div v-if="active" class="conn-detail">
      <p class="conn-detail-help">{{ active.help }}</p>

      <el-alert
        v-if="active.lastError"
        type="error"
        :closable="false"
        show-icon
        class="conn-alert"
        :title="active.lastError"
      />

      <el-alert
        v-if="active.managed"
        type="success"
        :closable="false"
        show-icon
        class="conn-alert"
        title="Managed by the XPass deployment"
        description="This delivery service is configured through the secure Cloudflare email binding. There is nothing to paste or verify here."
      />

      <el-form v-else label-position="top" class="conn-form">
        <el-form-item :label="active.identityLabel || 'Identity'">
          <el-input v-model="form.identity" :placeholder="active.identityPlaceholder || ''" clearable />
        </el-form-item>

        <el-form-item v-if="active.requiresSecret" :label="active.secretLabel || 'Credential'">
          <el-input
            v-model="form.secret"
            type="password"
            show-password
            :placeholder="active.secretConfigured ? 'Leave blank to keep the current credential' : 'Enter the credential'"
          />
          <div class="conn-field-hint">{{ active.secretHint }}</div>
        </el-form-item>
      </el-form>

      <div class="conn-meta">
        <div v-if="active.identity" class="conn-meta-row">
          <span class="conn-meta-label">Configured identity</span>
          <span class="conn-meta-value">{{ active.identity }}</span>
        </div>
        <div v-if="active.lastCheckedAt" class="conn-meta-row">
          <span class="conn-meta-label">Last checked</span>
          <span class="conn-meta-value">{{ formatTime(active.lastCheckedAt) }}</span>
        </div>
        <div v-if="active.configuredBy" class="conn-meta-row">
          <span class="conn-meta-label">Configured by</span>
          <span class="conn-meta-value">{{ active.configuredBy }}</span>
        </div>
      </div>

      <div v-if="!active.managed" class="conn-detail-actions">
        <el-button type="primary" :loading="saving" @click="saveConnection">
          {{ active.status === 'not_configured' ? 'Save connection' : 'Save changes' }}
        </el-button>
        <el-button
          v-if="form.identity || active.identity"
          :loading="verifying"
          :disabled="!effectiveIdentity"
          @click="verifyConnection"
        >
          {{ active.status === 'connected' ? 'Re-verify' : 'Verify & connect' }}
        </el-button>
        <el-button
          v-if="active.configured || active.status === 'connected'"
          type="danger"
          plain
          :loading="disconnecting"
          @click="disconnectConnection"
        >
          Disconnect
        </el-button>
      </div>

      <el-alert
        v-if="!active.managed"
        type="info"
        :closable="false"
        show-icon
        class="conn-alert"
        title="Credentials are stored encrypted and are never shown again after saving."
      />
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  connectionsOverview,
  connectionsSave,
  connectionsDisconnect,
  connectionsVerify
} from '@/request/connections.js'
import { comingSoonContent } from '@/features/coming-soon.js'

// Providers that are not actually usable this release are shown as Coming Soon
// instead of offering a Connect button that would only half-configure them.
const COMING_SOON_PROVIDERS = { whatsapp: 'whatsapp', ai_provider: 'xpass-one' }

function comingSoonContentFor(item) {
  const key = COMING_SOON_PROVIDERS[item.provider]
  return key ? comingSoonContent[key] : null
}

const items = ref([])
const summary = reactive({ configuredCount: 0, totalCount: 0 })
const loading = ref(false)

const drawerVisible = ref(false)
const active = ref(null)
const form = reactive({ identity: '', secret: '' })
const saving = ref(false)
const verifying = ref(false)
const disconnecting = ref(false)

const effectiveIdentity = computed(() => (form.identity || active.value?.identity || '').trim())

async function load() {
  loading.value = true
  try {
    const data = await connectionsOverview()
    items.value = data.list || []
    const available = items.value.filter(item => !comingSoonContentFor(item))
    summary.totalCount = available.length
    summary.configuredCount = available.filter(item => item.configured).length
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load connections.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function statusLabel(item) {
  if (item.status === 'connected') return 'Connected'
  if (item.status === 'error') return 'Needs attention'
  if (item.status === 'configured' || item.configured) return 'Configured'
  return 'Not connected'
}

function statusTagType(item) {
  if (item.status === 'connected') return 'success'
  if (item.status === 'error') return 'danger'
  if (item.status === 'configured' || item.configured) return 'warning'
  return 'info'
}

function statusDotClass(item) {
  if (item.status === 'connected') return 'is-connected'
  if (item.status === 'error') return 'is-error'
  if (item.status === 'configured' || item.configured) return 'is-configured'
  return 'is-idle'
}

function statusDetail(item) {
  if (item.status === 'connected') return item.identity ? `Connected as ${item.identity}` : 'Connected'
  if (item.status === 'error') return item.lastError || 'The last check failed. Reconnect to retry.'
  if (item.status === 'configured' || item.configured) return 'Credentials saved. Verify to finish connecting.'
  return 'Not set up yet.'
}

function actionLabel(item) {
  if (item.managed) return 'View status'
  if (item.status === 'connected') return 'Manage'
  if (item.status === 'error') return 'Reconnect'
  if (item.status === 'configured' || item.configured) return 'Finish setup'
  return 'Connect'
}

function primaryType(item) {
  return item.status === 'connected' ? 'default' : 'primary'
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(String(value).replace(' ', 'T') + (String(value).endsWith('Z') ? '' : 'Z'))
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function resetForm() {
  form.identity = ''
  form.secret = ''
  active.value = null
}

function openDrawer(item) {
  if (comingSoonContentFor(item)) return
  active.value = item
  form.identity = item.identity || ''
  form.secret = ''
  drawerVisible.value = true
}

function buildPayload(includeSecret) {
  const payload = {}
  if (form.identity !== '' || active.value?.identity) {
    payload.identity = form.identity.trim()
  }
  if (includeSecret && form.secret) {
    payload.secret = form.secret
  }
  return payload
}

async function saveConnection() {
  if (!active.value) return
  saving.value = true
  try {
    await connectionsSave(active.value.provider, buildPayload(true))
    form.secret = ''
    await load()
    const refreshed = items.value.find(i => i.provider === active.value.provider)
    if (refreshed) active.value = refreshed
    ElMessage({ message: 'Connection saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save this connection.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function verifyConnection() {
  if (!active.value) return
  if (!effectiveIdentity.value) {
    ElMessage({ message: 'Add the identity to verify this connection.', type: 'warning', plain: true })
    return
  }
  verifying.value = true
  try {
    await connectionsVerify(active.value.provider, { identity: effectiveIdentity.value })
    await load()
    const refreshed = items.value.find(i => i.provider === active.value.provider)
    if (refreshed) active.value = refreshed
    ElMessage({ message: 'Connection verified.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Verification failed.', type: 'error', plain: true })
  } finally {
    verifying.value = false
  }
}

async function disconnectConnection() {
  if (!active.value) return
  try {
    await ElMessageBox.confirm(
      `Disconnect ${active.value.name}? Team members will lose access through HQ until it is connected again.`,
      'Disconnect connection',
      { type: 'warning', confirmButtonText: 'Disconnect', cancelButtonText: 'Cancel' }
    )
  } catch {
    return
  }
  disconnecting.value = true
  try {
    await connectionsDisconnect(active.value.provider)
    await load()
    const refreshed = items.value.find(i => i.provider === active.value.provider)
    if (refreshed) active.value = refreshed
    form.identity = ''
    form.secret = ''
    ElMessage({ message: 'Connection removed.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not disconnect.', type: 'error', plain: true })
  } finally {
    disconnecting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-subtitle { margin: 6px 0 0; max-width: 620px; color: var(--hq-muted); font-size: 13px; line-height: 1.5; }
.module-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.conn-summary { display: flex; align-items: baseline; gap: 8px; margin-bottom: 14px; color: var(--hq-muted); }
.conn-summary-count { color: var(--hq-text); font-weight: 650; font-size: 15px; }
.conn-summary-label { font-size: 12.5px; }
.conn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.conn-card { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--hq-border); border-radius: 12px; background: var(--hq-surface, var(--el-bg-color)); }
.conn-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.conn-card-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.conn-card-name { font-size: 15px; font-weight: 650; }
.conn-card-group { color: var(--hq-muted); font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; }
.conn-card-purpose { margin: 0; color: var(--hq-muted); font-size: 12.5px; line-height: 1.5; flex: 1; }
.conn-card-status { display: flex; align-items: center; gap: 8px; }
.conn-status-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.conn-status-dot.is-connected { background: var(--hq-success); }
.conn-status-dot.is-error { background: var(--el-color-danger); }
.conn-status-dot.is-configured { background: var(--el-color-warning); }
.conn-status-dot.is-idle { background: var(--hq-muted); }
.conn-status-text { color: var(--hq-text-secondary); font-size: 12px; }
.conn-card-actions { display: flex; justify-content: flex-end; margin-top: 2px; }
.conn-soon-note { color: var(--hq-muted); font-size: 12px; font-weight: 550; }
.conn-drawer :deep(.el-drawer__body) { padding: 20px 22px; }
.conn-detail { display: flex; flex-direction: column; gap: 14px; }
.conn-detail-help { margin: 0; color: var(--hq-muted); font-size: 13px; line-height: 1.55; }
.conn-alert { margin: 0; }
.conn-form { display: flex; flex-direction: column; gap: 4px; }
.conn-field-hint { color: var(--hq-muted); font-size: 11.5px; line-height: 1.4; margin-top: 2px; }
.conn-meta { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--hq-border); border-radius: 10px; }
.conn-meta-row { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; }
.conn-meta-label { color: var(--hq-muted); }
.conn-meta-value { color: var(--hq-text); font-weight: 550; text-align: right; overflow: hidden; text-overflow: ellipsis; }
.conn-detail-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
