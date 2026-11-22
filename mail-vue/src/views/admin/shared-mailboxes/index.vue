<template>
  <div class="sm-page">
    <header class="sm-head">
      <div class="sm-head-copy">
        <div class="eyebrow">ADMINISTRATION</div>
        <h1>{{ $t('sharedMailboxes') }}</h1>
        <p class="sm-sub">Create company inboxes such as support@, add the people who work them, and choose exactly what each person can do.</p>
      </div>
      <el-button v-if="canManage" type="primary" @click="openCreate">
        Set up shared inbox
      </el-button>
    </header>

    <div v-if="loadError" class="sm-load-error" role="alert">
      <Icon icon="fluent:error-circle-20-regular" width="18" height="18" />
      <span>{{ loadError }}</span>
      <el-button size="small" @click="load">Try again</el-button>
    </div>

    <div v-if="!canManage" class="sm-empty">
      <span class="sm-empty-icon"><Icon icon="fluent:lock-closed-20-regular" width="26" height="26" /></span>
      <p class="sm-empty-title">{{ $t('sharedMailboxesNoAccess') }}</p>
      <p class="sm-empty-hint">{{ $t('sharedMailboxesNoAccessHint') }}</p>
    </div>

    <div v-else-if="loading" class="sm-empty">
      <div class="sm-spinner" aria-hidden="true"></div>
      <p class="sm-empty-hint">{{ $t('sharedMailboxesLoading') }}</p>
    </div>

    <div v-else-if="!mailboxes.length" class="sm-empty">
      <span class="sm-empty-icon"><Icon icon="fluent:mail-inbox-all-20-regular" width="26" height="26" /></span>
      <p class="sm-empty-title">Set up your first shared inbox</p>
      <p class="sm-empty-hint">Start with an address such as support@getxpass.net. You become its owner, then add the team who can view, reply, assign, and manage it.</p>
      <el-button type="primary" @click="openCreate">Set up shared inbox</el-button>
    </div>

    <div v-else class="sm-grid">
      <article v-for="box in mailboxes" :key="box.account_id" class="sm-card">
        <div class="sm-card-head">
          <span class="sm-card-icon"><Icon icon="fluent:mail-inbox-20-regular" width="20" height="20" /></span>
          <div class="sm-card-title">
            <div class="sm-email">{{ box.email }}</div>
            <div class="sm-name">{{ box.display_name || box.name || $t('sharedMailboxUnnamed') }}</div>
          </div>
          <el-tag :type="box.mailbox_status === 'active' ? 'success' : 'info'" effect="light" size="small">
            {{ box.mailbox_status === 'active' ? $t('active') : $t('disabled') }}
          </el-tag>
        </div>

        <div class="sm-stats">
          <span class="sm-stat">
            <Icon icon="fluent:people-20-regular" width="14" height="14" />
            {{ box.member_count || 0 }} {{ $t('members') }}
          </span>
          <span class="sm-stat">
            <Icon icon="fluent:mail-unread-20-regular" width="14" height="14" />
            {{ box.unread_count || 0 }} {{ $t('unread') }}
          </span>
        </div>

        <div class="sm-actions">
          <el-button size="small" @click="openMembers(box)">{{ $t('manageMembers') }}</el-button>
          <el-button size="small" plain @click="openRename(box)">{{ $t('rename') }}</el-button>
          <el-button
            size="small"
            plain
            :type="box.mailbox_status === 'active' ? 'warning' : 'success'"
            @click="toggleStatus(box)"
          >{{ box.mailbox_status === 'active' ? $t('disable') : $t('enable') }}</el-button>
          <el-button size="small" text type="danger" @click="deleteMailbox(box)">Delete</el-button>
        </div>
      </article>
    </div>

    <!-- Create dialog -->
    <el-dialog v-model="createVisible" :title="$t('createSharedMailbox')" width="440px">
      <div class="sm-form">
        <label class="sm-field">
          <span class="sm-field-label">Shared inbox address</span>
          <div class="sm-address-field">
            <el-input v-model="createForm.localPart" placeholder="support" maxlength="64" />
            <el-select v-model="createForm.domain" class="sm-domain-select" :disabled="!domains.length">
              <el-option v-for="domain in domains" :key="domain" :label="'@' + domain" :value="domain" />
            </el-select>
          </div>
          <span class="sm-field-hint">Use an address on this workspace's configured domain. It becomes a company inbox, not a new employee account.</span>
        </label>
        <label class="sm-field">
          <span class="sm-field-label">{{ $t('sharedMailboxDisplayName') }}</span>
          <el-input v-model="createForm.displayName" :placeholder="$t('sharedMailboxDisplayNamePlaceholder')" maxlength="60" />
        </label>
        <div class="sm-setup-note">
          <Icon icon="fluent:shield-checkmark-20-regular" width="18" height="18" />
          <span>You will receive full owner access automatically. After creating it, add members and choose what each person can do in the inbox.</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="createVisible = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="creating" :disabled="!sharedAddress" @click="submitCreate">
          {{ $t('create') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Rename dialog -->
    <el-dialog v-model="renameVisible" :title="$t('renameSharedMailbox')" width="420px">
      <div class="sm-form">
        <div class="sm-rename-address">{{ renameForm.email }}</div>
        <label class="sm-field">
          <span class="sm-field-label">{{ $t('sharedMailboxDisplayName') }}</span>
          <el-input v-model="renameForm.displayName" maxlength="60" />
        </label>
      </div>
      <template #footer>
        <el-button @click="renameVisible = false">{{ $t('cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitRename">{{ $t('save') }}</el-button>
      </template>
    </el-dialog>

    <!-- Members drawer -->
    <el-drawer v-model="membersVisible" size="460px" :with-header="false" append-to-body>
      <div class="sm-drawer">
        <div class="sm-drawer-head">
          <div>
            <div class="sm-drawer-title">{{ $t('manageMembers') }}</div>
            <div class="sm-drawer-sub">{{ membersMailbox ? membersMailbox.email : '' }}</div>
          </div>
          <button type="button" class="sm-drawer-close" aria-label="Close" @click="membersVisible = false">
            <Icon icon="fluent:dismiss-20-regular" width="16" height="16" />
          </button>
        </div>

        <!-- Add member -->
        <section class="sm-add">
          <div class="sm-add-title">{{ $t('addMember') }}</div>
          <label class="sm-field">
            <span class="sm-field-label">{{ $t('sharedMailboxSelectUser') }}</span>
            <el-select
              v-model="addUserId"
              filterable
              clearable
              :placeholder="$t('sharedMailboxSelectUserPlaceholder')"
              class="sm-select"
              :loading="usersLoading"
            >
              <el-option
                v-for="u in assignableUsers"
                :key="u.userId"
                :label="u.name || u.email"
                :value="u.userId"
              />
            </el-select>
          </label>
          <div class="sm-perms">
            <span class="sm-field-label">{{ $t('memberPermissions') }}</span>
            <div class="sm-perm-grid">
              <label v-for="perm in MAILBOX_PERMS" :key="perm.key" class="sm-perm">
                <input v-model="addPerms" type="checkbox" :value="perm.key" />
                <span>{{ perm.label }}</span>
              </label>
            </div>
          </div>
          <el-button type="primary" :loading="adding" :disabled="!addUserId" @click="submitAddMember">
            {{ $t('addMember') }}
          </el-button>
        </section>

        <!-- Current members -->
        <section class="sm-members">
          <div class="sm-add-title">{{ $t('members') }} ({{ members.length }})</div>
          <div v-if="membersLoading" class="sm-empty-hint">{{ $t('sharedMailboxesLoading') }}</div>
          <div v-else-if="!members.length" class="sm-empty-hint">{{ $t('sharedMailboxNoMembers') }}</div>
          <ul v-else class="sm-member-list">
            <li v-for="m in members" :key="m.user_id" class="sm-member">
              <div class="sm-member-row">
                <div class="sm-member-id">
                  <span class="sm-member-name">{{ m.display_name || m.username || m.email }}</span>
                  <span class="sm-member-meta">{{ m.username ? '@' + m.username + ' · ' : '' }}{{ m.email }}</span>
                </div>
                <div class="sm-member-actions">
                  <el-button size="small" text @click="startEditMember(m)">{{ $t('edit') }}</el-button>
                  <el-button size="small" text type="danger" @click="submitRemoveMember(m)">{{ $t('remove') }}</el-button>
                </div>
              </div>

              <div v-if="editingUserId === m.user_id" class="sm-member-edit">
                <div class="sm-perm-grid">
                  <label v-for="perm in MAILBOX_PERMS" :key="perm.key" class="sm-perm">
                    <input v-model="editingPerms" type="checkbox" :value="perm.key" />
                    <span>{{ perm.label }}</span>
                  </label>
                </div>
                <div class="sm-member-edit-foot">
                  <el-button size="small" @click="editingUserId = null">{{ $t('cancel') }}</el-button>
                  <el-button size="small" type="primary" :loading="savingMember" @click="submitEditMember(m)">
                    {{ $t('save') }}
                  </el-button>
                </div>
              </div>
              <div v-else class="sm-member-perms">{{ permSummary(m.permissions) }}</div>
            </li>
          </ul>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { useSettingStore } from '@/store/setting.js'
import {
  sharedMailboxAdminList,
  sharedMailboxCreate,
  sharedMailboxUpdate,
  sharedMailboxDelete,
  sharedMailboxMembers,
  sharedMailboxMemberOptions,
  sharedMailboxMemberAdd,
  sharedMailboxMemberUpdate,
  sharedMailboxMemberRemove,
} from '@/request/shared-mailbox.js'

// Mailbox member capabilities, in the words an admin thinks in. The keys match
// the backend's MAILBOX_ACTIONS; only the friendlier, commonly used ones are
// exposed here to keep the picker readable.
const MAILBOX_PERMS = [
  { key: 'view', label: 'View conversations' },
  { key: 'reply', label: 'Reply to customers' },
  { key: 'send', label: 'Send new emails' },
  { key: 'assign', label: 'Assign conversations' },
  { key: 'internal_note', label: 'Add internal notes' },
  { key: 'manage_tags', label: 'Manage tags' },
  { key: 'resolve', label: 'Resolve and reopen' },
  { key: 'configure', label: 'Configure mailbox' },
  { key: 'manage_members', label: 'Manage members' },
]

const settingStore = useSettingStore()

const canManage = computed(() => hasPerm('mailbox:manage'))
const mailboxes = ref([])
const loading = ref(false)
const loadError = ref('')

const domains = computed(() => (settingStore.domainList || [])
  .map(value => String(value || '').trim().replace(/^@+/, ''))
  .filter(Boolean))

// ----- create -----------------------------------------------------------
const createVisible = ref(false)
const creating = ref(false)
const createForm = ref({ localPart: '', domain: '', displayName: '' })
const sharedAddress = computed(() => {
  const localPart = String(createForm.value.localPart || '').trim().replace(/@/g, '')
  const domain = String(createForm.value.domain || '').trim().replace(/^@+/, '')
  return localPart && domain ? `${localPart}@${domain}` : ''
})

function openCreate() {
  createForm.value = { localPart: '', domain: domains.value[0] || '', displayName: '' }
  createVisible.value = true
}

async function submitCreate() {
  if (creating.value) return
  creating.value = true
  try {
    const row = await sharedMailboxCreate({
      email: sharedAddress.value,
      displayName: createForm.value.displayName.trim(),
    })
    ElMessage({ message: 'Shared mailbox created.', type: 'success', plain: true })
    createVisible.value = false
    await load()
    window.dispatchEvent(new Event('mailbox:shared-updated'))
    if (row && row.accountId) openMembers({ account_id: row.accountId, email: row.email })
  } catch {
    // The interceptor already surfaced the backend reason.
  } finally {
    creating.value = false
  }
}

// ----- rename / status --------------------------------------------------
const renameVisible = ref(false)
const saving = ref(false)
const renameForm = ref({ accountId: null, email: '', displayName: '' })

function openRename(box) {
  renameForm.value = { accountId: box.account_id, email: box.email, displayName: box.display_name || box.name || '' }
  renameVisible.value = true
}

async function submitRename() {
  if (saving.value) return
  saving.value = true
  try {
    await sharedMailboxUpdate({ accountId: renameForm.value.accountId, displayName: renameForm.value.displayName.trim() })
    ElMessage({ message: 'Mailbox updated.', type: 'success', plain: true })
    renameVisible.value = false
    await load()
  } catch {
    // surfaced by interceptor
  } finally {
    saving.value = false
  }
}

async function toggleStatus(box) {
  const next = box.mailbox_status === 'active' ? 'disabled' : 'active'
  try {
    await sharedMailboxUpdate({ accountId: box.account_id, mailboxStatus: next })
    box.mailbox_status = next
    ElMessage({ message: next === 'active' ? 'Mailbox enabled.' : 'Mailbox disabled.', type: 'success', plain: true })
  } catch {
    // surfaced by interceptor
  }
}

async function deleteMailbox(box) {
  try {
    const { value } = await ElMessageBox.prompt(
      `This removes ${box.email} from active mailboxes while preserving its message history. Type the full address to confirm.`,
      'Delete shared mailbox',
      { confirmButtonText: 'Delete mailbox', cancelButtonText: 'Cancel', inputPlaceholder: box.email, inputPattern: new RegExp('^' + box.email.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '$', 'i'), inputErrorMessage: `Enter ${box.email} exactly`, type: 'warning' }
    )
    await sharedMailboxDelete(box.account_id, value)
    ElMessage({ message: 'Shared mailbox deleted.', type: 'success', plain: true })
    await load()
    window.dispatchEvent(new Event('mailbox:shared-updated'))
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage({ message: error?.message || 'Could not delete the shared mailbox.', type: 'error', plain: true })
  }
}

// ----- members ----------------------------------------------------------
const membersVisible = ref(false)
const membersMailbox = ref(null)
const members = ref([])
const membersLoading = ref(false)

const users = ref([])
const usersLoading = ref(false)
const addUserId = ref(null)
const addPerms = ref(['view'])
const adding = ref(false)

const editingUserId = ref(null)
const editingPerms = ref([])
const savingMember = ref(false)

const assignableUsers = computed(() => {
  const memberIds = new Set(members.value.map(m => Number(m.user_id)))
  // The member-options endpoint already returns only active company accounts;
  // older UI code also checked a missing `status` field and filtered everyone
  // out, leaving the picker stuck on “No data”.
  return users.value.filter(u => !memberIds.has(Number(u.userId)))
})

async function loadUsers() {
  if (usersLoading.value) return
  usersLoading.value = true
  try {
    const list = await sharedMailboxMemberOptions()
    users.value = Array.isArray(list) ? list : []
  } catch (error) {
    users.value = []
    ElMessage({ message: error.message || 'Could not load team members for this inbox.', type: 'error', plain: true })
  } finally {
    usersLoading.value = false
  }
}

async function openMembers(box) {
  membersMailbox.value = box
  membersVisible.value = true
  members.value = []
  addUserId.value = null
  addPerms.value = ['view']
  await loadMembers()
  await loadUsers()
}

async function loadMembers() {
  if (!membersMailbox.value) return
  membersLoading.value = true
  try {
    const rows = await sharedMailboxMembers(membersMailbox.value.account_id)
    members.value = Array.isArray(rows) ? rows : []
  } catch (error) {
    members.value = []
    ElMessage({ message: error.message || 'Could not load inbox members.', type: 'error', plain: true })
  } finally {
    membersLoading.value = false
  }
}

function permsArray(value) {
  if (Array.isArray(value)) return value
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean)
}

function permSummary(value) {
  const set = new Set(permsArray(value))
  const labels = MAILBOX_PERMS.filter(p => set.has(p.key)).map(p => p.label)
  return labels.length ? labels.join(' · ') : 'No permissions'
}

async function submitAddMember() {
  if (adding.value || !addUserId.value) return
  adding.value = true
  try {
    await sharedMailboxMemberAdd({
      mailboxId: membersMailbox.value.account_id,
      userId: addUserId.value,
      permissions: addPerms.value.slice(),
    })
    ElMessage({ message: 'Member added.', type: 'success', plain: true })
    addUserId.value = null
    addPerms.value = ['view']
    await loadMembers()
  } catch {
    // surfaced by interceptor
  } finally {
    adding.value = false
  }
}

function startEditMember(m) {
  editingUserId.value = m.user_id
  editingPerms.value = permsArray(m.permissions)
}

async function submitEditMember(m) {
  if (savingMember.value) return
  savingMember.value = true
  try {
    await sharedMailboxMemberUpdate({
      mailboxId: membersMailbox.value.account_id,
      userId: m.user_id,
      permissions: editingPerms.value.slice(),
    })
    m.permissions = editingPerms.value.join(',')
    editingUserId.value = null
    ElMessage({ message: 'Permissions updated.', type: 'success', plain: true })
  } catch {
    // surfaced by interceptor
  } finally {
    savingMember.value = false
  }
}

async function submitRemoveMember(m) {
  try {
    await sharedMailboxMemberRemove({ mailboxId: membersMailbox.value.account_id, userId: m.user_id })
    members.value = members.value.filter(x => Number(x.user_id) !== Number(m.user_id))
    ElMessage({ message: 'Member removed.', type: 'success', plain: true })
  } catch {
    // surfaced by interceptor
  }
}

// ----- load -------------------------------------------------------------
async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const rows = await sharedMailboxAdminList()
    mailboxes.value = Array.isArray(rows) ? rows : []
  } catch (error) {
    mailboxes.value = []
    loadError.value = error.message || 'Shared inboxes could not be loaded. Please try again.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (canManage.value) load()
})
</script>

<style scoped>
.sm-page {
  padding: 24px 28px 40px;
  max-width: 1100px;
  margin: 0 auto;
}

.sm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.sm-head-copy .eyebrow {
  color: var(--hq-muted);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .08em;
}

.sm-head h1 {
  margin: 4px 0 0;
  font-size: 22px;
  font-weight: 650;
  color: var(--hq-text);
  letter-spacing: -.01em;
}

.sm-sub {
  margin: 6px 0 0;
  max-width: 560px;
  color: var(--hq-muted);
  font-size: 13px;
  line-height: 1.5;
}

.sm-load-error {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 16px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--hq-danger) 45%, var(--hq-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--hq-danger) 8%, transparent);
  color: var(--hq-danger);
  font-size: 12.5px;
}

.sm-load-error span { flex: 1; }

.sm-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 280px;
  padding: 40px 24px;
  border: 1px dashed var(--hq-border);
  border-radius: 12px;
  color: var(--hq-muted);
  text-align: center;
}

.sm-empty-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 12px;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
}

.sm-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--hq-text);
}

.sm-empty-hint {
  margin: 0;
  max-width: 420px;
  font-size: 13px;
  line-height: 1.55;
}

.sm-spinner {
  width: 26px;
  height: 26px;
  border: 3px solid var(--hq-border);
  border-top-color: var(--hq-accent);
  border-radius: 50%;
  animation: sm-spin .8s linear infinite;
}

@keyframes sm-spin { to { transform: rotate(360deg); } }

.sm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px;
}

.sm-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--hq-border);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .03);
}

.sm-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.sm-card-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
}

.sm-card-title {
  min-width: 0;
  flex: 1;
}

.sm-email {
  overflow: hidden;
  font-size: 14px;
  font-weight: 650;
  color: var(--hq-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sm-name {
  overflow: hidden;
  color: var(--hq-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sm-stats {
  display: flex;
  gap: 16px;
  color: var(--hq-muted);
  font-size: 12.5px;
}

.sm-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--hq-border);
}

.sm-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0;
}

.sm-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sm-field-label {
  color: var(--hq-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
}

.sm-field-hint {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.sm-address-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 148px;
  overflow: hidden;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.sm-address-field :deep(.el-input__wrapper),
.sm-address-field :deep(.el-select__wrapper) {
  box-shadow: none !important;
  background: transparent;
}

.sm-domain-select {
  border-left: 1px solid var(--hq-border);
}

.sm-setup-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 11px;
  border-radius: 8px;
  background: var(--hq-selected);
  color: var(--hq-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.sm-setup-note :deep(svg) {
  flex: 0 0 auto;
  color: var(--hq-accent-strong);
}

.sm-rename-address {
  font-weight: 600;
  color: var(--hq-text);
}

.sm-drawer {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 18px 20px;
  gap: 18px;
}

.sm-drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sm-drawer-title {
  font-size: 16px;
  font-weight: 650;
  color: var(--hq-text);
}

.sm-drawer-sub {
  color: var(--hq-muted);
  font-size: 12.5px;
}

.sm-drawer-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--hq-muted);
  cursor: pointer;
}

.sm-drawer-close:hover {
  background: var(--hq-hover);
  color: var(--hq-text);
}

.sm-add {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid var(--hq-border);
  border-radius: 10px;
  background: var(--hq-surface);
}

.sm-add-title {
  font-size: 13px;
  font-weight: 650;
  color: var(--hq-text);
}

.sm-select {
  width: 100%;
}

.sm-perms {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sm-perm-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}

.sm-perm {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--hq-text-secondary);
  font-size: 12px;
  cursor: pointer;
}

.sm-perm input {
  width: 14px;
  height: 14px;
  accent-color: var(--hq-accent);
}

.sm-members {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

.sm-member-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sm-member {
  padding: 10px 12px;
  border: 1px solid var(--hq-border);
  border-radius: 8px;
}

.sm-member-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.sm-member-id {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.sm-member-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--hq-text);
}

.sm-member-meta {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.sm-member-actions {
  flex: 0 0 auto;
}

.sm-member-perms {
  margin-top: 6px;
  color: var(--hq-muted);
  font-size: 11.5px;
  line-height: 1.45;
}

.sm-member-edit {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--hq-border);
}

.sm-member-edit-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

@media (max-width: 600px) {
  .sm-page { padding: 18px 16px 32px; }
  .sm-head { flex-direction: column; }
  .sm-address-field { grid-template-columns: minmax(0, 1fr) 128px; }
  .sm-perm-grid { grid-template-columns: 1fr; }
}
</style>
