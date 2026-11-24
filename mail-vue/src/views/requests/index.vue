<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / REQUESTS</div>
          <h1>{{ $t('internalRequests') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'requests:add'" type="primary" icon="plus" @click="openCreate()">{{ $t('newRequest') }}</el-button>
          <el-button  @click="loadList" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-tabs v-model="scope" @tab-change="onScopeChange">
        <el-tab-pane name="received">
          <template #label>
            <span>Assigned to me<el-badge v-if="waitingCount" :value="waitingCount" :max="99" class="tab-badge" /></span>
          </template>
        </el-tab-pane>
        <el-tab-pane :label="'Sent by me'" name="sent" />
        <el-tab-pane label="Team" name="team" />
        <el-tab-pane label="Open" name="open" />
        <el-tab-pane label="History" name="history" />
      </el-tabs>

      <div class="filter-bar">
        <el-select v-model="type" placeholder="Type" clearable style="width: 150px" @change="loadList">
          <el-option v-for="option in TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-input
          v-model="search"
          placeholder="Search requests"
          clearable
          style="width: 220px"
          @keyup.enter="loadList"
          @clear="loadList"
        />
        <el-select v-model="kind" :placeholder="$t('kind')" clearable style="width: 130px" @change="loadList">
          <el-option :label="$t('kindAction')" value="action" />
          <el-option :label="$t('kindApproval')" value="approval" />
        </el-select>
        <el-select v-model="status" :placeholder="$t('status')" clearable style="width: 170px" @change="loadList">
          <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
        </el-select>
        <el-checkbox v-model="overdue" @change="loadList">{{ $t('overdueOnly') }}</el-checkbox>
      </div>

      <el-card class="module-card">
        <el-table v-if="rows.length" :data="rows" style="width: 100%">
          <el-table-column prop="title" :label="$t('requestTitle')" min-width="200" />
          <el-table-column label="Type" min-width="120">
            <template #default="s">{{ typeLabel(s.row) }}</template>
          </el-table-column>
          <el-table-column :label="$t('counterpart')" min-width="120">
            <template #default="s">{{ userName(s.row.sender_id) }} → {{ userName(s.row.recipient_id) }}</template>
          </el-table-column>
          <el-table-column :label="$t('priority')" min-width="100">
            <template #default="s"><el-tag size="small" :type="priorityType(s.row.priority)">{{ s.row.priority }}</el-tag></template>
          </el-table-column>
          <el-table-column :label="$t('status')" min-width="140">
            <template #default="s"><el-tag size="small" :type="statusType(s.row.status)">{{ s.row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column :label="$t('dueDate')" min-width="140">
            <template #default="s">{{ fmt(s.row.due_date) }}</template>
          </el-table-column>
          <el-table-column :label="$t('actions')" min-width="230" fixed="right">
            <template #default="s">
              <el-button size="small" @click="openDetail(s.row)">{{ $t('view') }}</el-button>
              <template v-if="isRecipient(s.row) && s.row.kind === 'action' && openAction(s.row.status)">
                <el-button v-perm="'requests:act'" size="small" type="success" @click="act(s.row, 'accept')">{{ $t('accept') }}</el-button>
                <el-button v-perm="'requests:act'" size="small" @click="act(s.row, 'start')">{{ $t('start') }}</el-button>
                <el-button v-perm="'requests:act'" size="small" type="primary" @click="act(s.row, 'complete')">{{ $t('complete') }}</el-button>
                <el-button v-perm="'requests:act'" size="small" type="danger" @click="decline(s.row)">{{ $t('decline') }}</el-button>
              </template>
              <template v-if="isRecipient(s.row) && s.row.kind === 'approval' && s.row.status === 'pending_approval'">
                <el-button v-perm="'requests:act'" size="small" type="success" @click="act(s.row, 'approve')">{{ $t('approve') }}</el-button>
                <el-button v-perm="'requests:act'" size="small" type="danger" @click="actWithReason(s.row, 'reject')">{{ $t('reject') }}</el-button>
              </template>
              <!-- Approval authorises spending; the commitment reserves the
                   budget. Paying is a separate Finance action. -->
              <el-button
                v-if="s.row.category === 'finance' && s.row.status === 'approved'"
                v-perm="'finance.budgets:create'"
                size="small"
                type="primary"
                @click="openCommit(s.row)"
              >Commit to budget</el-button>
              <el-button v-if="isSender(s.row) && canCancel(s.row.status)" v-perm="'requests:act'" size="small" @click="act(s.row, 'cancel')">{{ $t('cancel') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <div class="empty-title">{{ emptyTitle }}</div>
          <p>{{ emptyBody }}</p>
        </div>
      </el-card>

      <el-dialog v-model="detailVisible" :title="$t('requestDetail')" width="640px">
        <div v-if="detail">
          <p><strong>{{ $t('requestTitle') }}:</strong> {{ detail.title }}</p>
          <p><strong>{{ $t('requestDescription') }}:</strong> {{ detail.description || '—' }}</p>
          <p><strong>{{ $t('status') }}:</strong> <el-tag size="small" :type="statusType(detail.status)">{{ detail.status }}</el-tag></p>
          <div class="timeline-title">{{ $t('history') }}</div>
          <el-timeline>
            <el-timeline-item v-for="h in detail.events" :key="h.id" :timestamp="fmt(h.create_time)">
              <strong v-if="h.actor">{{ h.actor }}</strong> {{ humanAction(h.action) }}<span v-if="h.to_status"> → {{ h.to_status }}</span>
              <span v-if="h.comment">: {{ h.comment }}</span>
            </el-timeline-item>
          </el-timeline>
          <el-input v-model="comment" type="textarea" :rows="2" :placeholder="$t('addComment')" style="margin-top: 12px" />
          <el-button type="primary" size="small" style="margin-top: 8px" @click="addComment">{{ $t('addComment') }}</el-button>
        </div>
      </el-dialog>

      <el-dialog v-model="createVisible" class="request-dialog" :title="$t('newRequest')" width="560px" :close-on-click-modal="false">
        <el-form label-width="110px">
          <el-form-item :label="$t('recipient')">
            <el-select v-model="form.recipient_id" filterable style="width: 100%" placeholder="Choose a team member" :loading="directoryLoading">
              <el-option
                v-for="u in directory"
                :key="u.userId"
                :label="personLabel(u)"
                :value="u.userId"
                :disabled="Number(u.userId) === Number(myId)"
              >
                <span class="person-option">
                  <hq-avatar :src="u.avatarUrl" :name="u.displayName" :username="u.username" :size="22" />
                  <span class="person-option-name">{{ u.displayName }}</span>
                  <span v-if="u.username" class="person-option-handle">@{{ u.username }}</span>
                  <span v-if="u.team" class="person-option-team">{{ u.team.name }}</span>
                </span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('kind')">
            <el-select v-model="form.kind" style="width: 100%">
              <el-option :label="$t('kindAction')" value="action" />
              <el-option :label="$t('kindApproval')" value="approval" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('requestTitle')"><el-input v-model="form.title" /></el-form-item>
          <el-form-item :label="$t('requestDescription')"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
          <el-form-item :label="$t('priority')">
            <el-select v-model="form.priority" style="width: 100%">
              <el-option v-for="p in PRIORITIES" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="Team">
          <el-select v-model="form.team_id" placeholder="Optional" clearable filterable style="width: 100%">
            <el-option v-for="team in teams" :key="team.team_id" :label="team.name" :value="team.team_id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('dueDate')"><el-date-picker v-model="form.due_date" type="datetime" style="width: 100%" /></el-form-item>
        <el-form-item label="Related record">
          <div class="related-row">
            <el-select v-model="form.related_type" placeholder="Module" clearable style="width: 150px">
              <el-option v-for="option in RELATED_TYPES" :key="option" :label="option" :value="option" />
            </el-select>
            <el-input v-model="related_id" placeholder="Record id" style="width: 140px" />
          </div>
        </el-form-item>
        <el-form-item label="Attachments">
          <el-input v-model="attachmentUrl" placeholder="https://… (one link at a time)">
            <template #append>
              <el-button @click="addAttachment">Add</el-button>
            </template>
          </el-input>
          <div v-if="form.attachments && form.attachments.length" class="attachment-list">
            <el-tag
              v-for="(file, index) in form.attachments"
              :key="file.url"
              closable
              size="small"
              @close="removeAttachment(index)"
            >{{ file.name || file.url }}</el-tag>
          </div>
        </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="creating" @click="saveCreate">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="commitVisible" title="Commit to a budget" width="520px">
        <p v-if="commitRequest" class="commit-copy">
          <strong>{{ commitRequest.title }}</strong><br />
          Approval authorises this spend; committing reserves it against a budget.
          Money does not move until a payment is recorded in Finance.
        </p>
        <el-form label-width="110px">
          <el-form-item label="Budget" required>
            <el-select v-model="commitForm.budget_id" filterable placeholder="Which budget pays for this" style="width: 100%">
              <el-option
                v-for="budget in commitBudgets"
                :key="budget.id"
                :label="`${budget.name} · ${formatCents(budget.available_cents)} available`"
                :value="budget.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="Amount" required>
            <el-input-number
              v-model="commitForm.amount"
              :precision="2"
              :min="0"
              :step="100"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="Note">
            <el-input v-model="commitForm.notes" type="textarea" :rows="2" maxlength="500" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="commitVisible = false">Cancel</el-button>
          <el-button type="primary" :loading="committing" @click="saveCommit">Commit</el-button>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '@/store/user.js'
import { teamList } from '@/request/profile.js'
import { requestList, requestGet, requestCreate, requestAct, requestComment } from '@/request/requests.js'
import { directoryList } from '@/request/directory.js'
import { financeBudgets, financeRequestCommitment } from '@/request/finance.js'
import { formatCents } from '@/utils/money.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import HqAvatar from '@/components/hq-avatar/index.vue'

const PRIORITIES = ['critical', 'high', 'normal', 'low']
const ACTION_STATUSES = ['pending', 'accepted', 'in_progress', 'needs_clarification', 'completed', 'declined', 'cancelled']
const APPROVAL_STATUSES = ['pending_approval', 'approved', 'rejected', 'changes_requested', 'cancelled']

const userStore = useUserStore()
const route = useRoute()
const myId = computed(() => userStore.user?.userId)

const ACTION_TEXT = {
	create: 'created this request',
	comment: 'commented',
	accept: 'accepted',
	start: 'started work',
	clarify: 'requested clarification',
	complete: 'completed',
	decline: 'declined',
	cancel: 'cancelled',
	approve: 'approved',
	reject: 'rejected',
	'request-changes': 'requested changes'
}

function humanAction(action) {
	return ACTION_TEXT[action] || String(action || 'updated').replace(/_/g, ' ')
}

const scope = ref('received')
const kind = ref('')
const type = ref('')
const search = ref('')
const teams = ref([])
const attachmentUrl = ref('')
const relatedId = ref('')
const status = ref('')
const overdue = ref(false)
const rows = ref([])
const directory = ref([])
const directoryLoading = ref(false)
const detail = ref(null)
const detailVisible = ref(false)
const comment = ref('')
const createVisible = ref(false)
const creating = ref(false)
const commitVisible = ref(false)
const committing = ref(false)
const commitBudgets = ref([])
const commitRequest = ref(null)
const commitForm = ref({ budget_id: null, amount: 0, notes: '' })
useCreateIntent(() => openCreate())
const form = ref({})

const TYPE_OPTIONS = [
	{ value: 'action', label: 'Action', description: 'Action — someone needs to do something' },
	{ value: 'approval', label: 'Approval', description: 'Approval — a decision is required' },
	{ value: 'review', label: 'Review', description: 'Review — check something and sign off' },
	{ value: 'information', label: 'Information', description: 'Information — answer a question' },
	{ value: 'access', label: 'Access', description: 'Access — grant or change permissions' },
	{ value: 'finance', label: 'Finance', description: 'Finance — money movement or sign-off' },
	{ value: 'document', label: 'Document', description: 'Document — produce or file a document' },
	{ value: 'project', label: 'Project', description: 'Project — project work' },
	{ value: 'other', label: 'Other', description: 'Other — anything else' }
]

const RELATED_TYPES = ['invoice', 'contact', 'lead', 'deal', 'document', 'project', 'task', 'event', 'conversation']

const TERMINAL = ['completed', 'approved', 'declined', 'rejected', 'cancelled']

const typeLabelValue = (row) => (TYPE_OPTIONS.find(option => option.value === (row.type || row.kind)) || TYPE_OPTIONS[0]).label

const typeLabel = typeLabelValue

const waitingCount = computed(() => rows.value.filter(row => row.recipient_id === myId.value && openAction(row.status)).length)

const emptyTitle = computed(() => {
	if (scope.value === 'history') return 'No finished requests yet'
	if (scope.value === 'sent') return 'You have not sent any requests'
	if (scope.value === 'team') return 'No team requests yet'
	if (scope.value === 'open') return 'Nothing open'
	return 'Nothing waiting on you'
})

const emptyBody = computed(() => {
	if (scope.value === 'history') return 'Completed, approved and declined requests stay here permanently, with the full timeline of who did what.'
	if (scope.value === 'open') return 'Open requests across the team appear here until they are completed, approved or declined.'
	return 'Requests assigned to you appear here. Finished requests never disappear — they move to History.'
})

function onScopeChange() {
	status.value = ''
	loadList()
}

function onFormTypeChange() {
	// The type decides which actions exist, so the composer reflects it immediately.
}

function addAttachment() {
	const url = attachmentUrl.value.trim()
	if (!url) return
	form.value.attachments = [...(form.value.attachments || []), { url, name: url.split('/').pop() }]
	attachmentUrl.value = ''
}

function removeAttachment(index) {
	form.value.attachments = (form.value.attachments || []).filter((item, i) => i !== index)
}

const statusOptions = computed(() => kind.value === 'approval' ? APPROVAL_STATUSES : kind.value === 'action' ? ACTION_STATUSES : [...ACTION_STATUSES, ...APPROVAL_STATUSES])

function fmt(v) { return v ? String(v).slice(0, 16) : '—' }
function personLabel(u) {
  if (!u) return ''
  return u.username ? `${u.displayName} (@${u.username})` : `${u.displayName} <${u.email}>`
}
function userName(id) {
  const u = directory.value.find(x => Number(x.userId) === Number(id))
  if (!u) return id
  return u.username ? `${u.displayName} (@${u.username})` : u.displayName
}
function isRecipient(row) { return row.recipient_id === myId.value }
function isSender(row) { return row.sender_id === myId.value }
function openAction(s) { return ['pending', 'accepted', 'in_progress', 'needs_clarification'].includes(s) }
function canCancel(s) { return ['pending', 'pending_approval', 'accepted', 'in_progress'].includes(s) }
function statusType(s) { return ({ pending: 'warning', pending_approval: 'warning', accepted: '', in_progress: '', needs_clarification: 'warning', completed: 'success', approved: 'success', rejected: 'danger', declined: 'danger', changes_requested: 'warning', cancelled: 'info' })[s] || 'info' }
function priorityType(p) { return ({ critical: 'danger', high: 'warning' })[p] || 'info' }

async function loadList() {
  try {
    const params = { scope: scope.value, page: 1, pageSize: 100 }
    if (kind.value) params.kind = kind.value
    if (type.value) params.type = type.value
    if (search.value) params.search = search.value
    if (status.value) params.status = status.value
    if (overdue.value) params.overdue = '1'
    const resp = await requestList(params)
    rows.value = resp.list || []
  } catch (e) { /* interceptor surfaces the message */ }
}

async function loadTeams() {
	try {
		teams.value = await teamList() || []
	} catch {
		teams.value = []
	}
}

async function loadDirectory() {
  directoryLoading.value = true
  try {
    const resp = await directoryList({ page: 1, pageSize: 200 })
    directory.value = resp.list || []
  } catch (e) {
    directory.value = []
  } finally {
    directoryLoading.value = false
  }
}

// An approved finance request becomes a budget reservation, never a payment.
async function openCommit(row) {
  commitRequest.value = row
  Object.assign(commitForm.value, { budget_id: null, amount: 0, notes: '' })
  commitVisible.value = true
  try {
    const result = await financeBudgets()
    commitBudgets.value = result.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load budgets.', type: 'error', plain: true })
  }
}

async function saveCommit() {
  if (!commitForm.value.budget_id) {
    ElMessage({ message: 'Choose the budget this is charged to.', type: 'warning', plain: true })
    return
  }
  committing.value = true
  try {
    await financeRequestCommitment(commitRequest.value.id, {
      budget_id: commitForm.value.budget_id,
      amount_cents: Math.round((Number(commitForm.value.amount) || 0) * 100),
      notes: commitForm.value.notes,
    })
    commitVisible.value = false
    await loadList()
    ElMessage({ message: 'Reserved against the budget. Nothing has been paid.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not commit this request.', type: 'error', plain: true })
  } finally {
    committing.value = false
  }
}

function openCreate() {
  form.value = { recipient_id: null, kind: 'action', type: 'action', title: '', description: '', priority: 'normal', due_date: null, team_id: null, related_type: '', attachments: [] }
  attachmentUrl.value = ''
  relatedId.value = ''
  if (!directory.value.length && !directoryLoading.value) loadDirectory()
  createVisible.value = true
}

async function saveCreate() {
  const recipientId = Number(form.value.recipient_id)
  const title = String(form.value.title || '').trim()
  if (!recipientId) {
    ElMessage({ message: 'Choose the team member who should receive this request.', type: 'warning', plain: true })
    return
  }
  if (!title) {
    ElMessage({ message: 'Add a clear request title.', type: 'warning', plain: true })
    return
  }
  creating.value = true
  try {
    await requestCreate({
      ...form.value,
      recipient_id: recipientId,
      title,
      description: String(form.value.description || '').trim(),
      related_id: relatedId.value ? Number(relatedId.value) : null
    })
    createVisible.value = false
    ElMessage.success('Request created.')
    await loadList()
  } catch (e) { /* the HTTP layer presents the server message */
  } finally {
    creating.value = false
  }
}

async function openDetail(row) {
  comment.value = ''
  try { detail.value = await requestGet(row.id); detailVisible.value = true } catch (e) { /* ignore */ }
}

async function act(row, action, extra = {}) {
  try {
    await requestAct(row.id, { action, ...extra })
    ElMessage.success('Updated.')
    if (detail.value && detail.value.id === row.id) openDetail(row)
    loadList()
  } catch (e) { /* ignore */ }
}

async function actWithReason(row, action) {
  try {
    const { value } = await ElMessageBox.prompt('Reason', 'Reject', { inputType: 'textarea', inputValidator: v => !!v || 'Reason required' })
    await act(row, action, { reason: value })
  } catch (e) { /* ignore */ }
}

async function decline(row) {
  try {
    const { value } = await ElMessageBox.prompt('Reason for declining', 'Decline', { inputType: 'textarea', inputValidator: v => !!v || 'Reason required' })
    await act(row, 'decline', { comment: value })
  } catch (e) { /* ignore */ }
}

async function addComment() {
  if (!comment.value.trim() || !detail.value) return
  try {
    await requestComment(detail.value.id, { comment: comment.value })
    comment.value = ''
    openDetail(detail.value)
  } catch (e) { /* ignore */ }
}

onMounted(async () => {
  await Promise.all([loadDirectory(), loadTeams(), loadList()])
  if (route.params.id) await openDetail({ id: Number(route.params.id) })
})
</script>

<style scoped>
.tab-badge {
  margin-left: 6px;
}

.related-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-actions { display: flex; gap: 8px; align-items: center; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 12px 0 16px; }
.module-card { min-width: 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; max-width: 540px; margin: 0 auto; padding: 56px 20px; text-align: center; color: var(--hq-text-secondary); }
.empty-title { color: var(--hq-text); font-size: 15px; font-weight: 650; }
.empty-state p { margin: 0; font-size: 13px; line-height: 1.55; }
.empty-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }
.timeline-title { margin: 16px 0 8px; font-weight: 650; }

.commit-copy {
  margin: 0 0 12px;
  color: var(--hq-text-secondary);
  font-size: 12.5px;
  line-height: 1.55;
}

.person-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.person-option-name {
  color: var(--hq-text);
  font-weight: 550;
}

.person-option-handle {
  color: var(--hq-muted);
  font-size: 12px;
}

.person-option-team {
  margin-left: auto;
  color: var(--hq-muted);
  font-size: 12px;
}

:deep(.request-dialog .el-dialog__body) {
  max-height: min(65vh, 680px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

@media (max-width: 640px) {
  .module-container { padding: 20px 16px 28px; }
  .module-header { align-items: flex-start; gap: 10px; }
  .filter-bar > * { width: 100% !important; }
  .related-row { flex-direction: column; }
  .related-row > * { width: 100% !important; }
  :deep(.request-dialog) { width: calc(100vw - 24px) !important; margin-top: 5vh !important; }
  :deep(.request-dialog .el-dialog__body) { max-height: calc(100svh - 190px); }
  :deep(.request-dialog .el-form-item__label) { float: none; display: block; width: auto !important; text-align: left; line-height: 1.3; margin-bottom: 6px; }
  :deep(.request-dialog .el-form-item__content) { margin-left: 0 !important; }
}
</style>
