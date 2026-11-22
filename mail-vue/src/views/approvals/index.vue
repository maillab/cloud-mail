<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / APPROVALS</div>
          <h1>{{ $t('approvals') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'approvals:add'" type="primary" icon="plus" @click="openCreate()">{{ $t('newApproval') }}</el-button>
          <el-button  @click="loadList" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-tabs v-model="scope" @tab-change="loadList">
        <el-tab-pane :label="$t('inboxTab')" name="inbox" />
        <el-tab-pane :label="$t('sentTab')" name="sent" />
        <el-tab-pane v-if="canQueryAll" :label="$t('allTab')" name="all" />
      </el-tabs>

      <div class="filter-bar">
        <el-select v-model="status" :placeholder="$t('status')" clearable style="width: 160px" @change="loadList">
          <el-option v-for="s in STATUSES" :key="s" :label="s" :value="s" />
        </el-select>
        <el-select v-model="category" :placeholder="$t('category')" clearable style="width: 180px" @change="loadList">
          <el-option v-for="c in CATEGORIES" :key="c" :label="$t('cat_' + c)" :value="c" />
        </el-select>
      </div>

      <el-card class="module-card">
        <el-table v-if="rows.length" :data="rows" style="width: 100%">
          <el-table-column prop="title" :label="$t('approvalTitle')" min-width="200" />
          <el-table-column :label="$t('category')" min-width="130">
            <template #default="s">{{ $t('cat_' + s.row.category) }}</template>
          </el-table-column>
          <el-table-column :label="$t('priority')" min-width="100">
            <template #default="s"><el-tag size="small" :type="priorityType(s.row.priority)">{{ s.row.priority }}</el-tag></template>
          </el-table-column>
          <el-table-column :label="$t('status')" min-width="120">
            <template #default="s"><el-tag size="small" :type="statusType(s.row.status)">{{ s.row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column :label="$t('requester')" min-width="130">
            <template #default="s">{{ s.row.user_id }}</template>
          </el-table-column>
          <el-table-column :label="$t('approver')" min-width="120">
            <template #default="s">{{ s.row.approver_id || '—' }}</template>
          </el-table-column>
          <el-table-column :label="$t('dueDate')" min-width="140">
            <template #default="s">{{ fmt(s.row.due_at) }}</template>
          </el-table-column>
          <el-table-column :label="$t('actions')" min-width="220" fixed="right">
            <template #default="s">
              <el-button size="small" @click="openDetail(s.row)">{{ $t('view') }}</el-button>
              <template v-if="s.row.status === 'pending' && canAct(s.row)">
                <el-button v-perm="'approvals:approve'" size="small" type="success" @click="approve(s.row)">{{ $t('approve') }}</el-button>
                <el-button v-perm="'approvals:approve'" size="small" type="danger" @click="reject(s.row)">{{ $t('reject') }}</el-button>
                <el-button v-perm="'approvals:approve'" size="small" @click="requestChanges(s.row)">{{ $t('requestChanges') }}</el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state"><p>{{ $t('noApprovals') }}</p></div>
      </el-card>

      <el-dialog v-model="detailVisible" :title="$t('approvalDetail')" width="640px">
        <div v-if="detail">
          <p><strong>{{ $t('approvalTitle') }}:</strong> {{ detail.title }}</p>
          <p><strong>{{ $t('requestDescription') }}:</strong> {{ detail.description || '—' }}</p>
          <p><strong>{{ $t('status') }}:</strong> <el-tag size="small" :type="statusType(detail.status)">{{ detail.status }}</el-tag></p>
          <p><strong>{{ $t('decisionComment') }}:</strong> {{ detail.decision_comment || '—' }}</p>
          <div class="timeline-title">{{ $t('history') }}</div>
          <el-timeline>
            <el-timeline-item v-for="h in detail.history" :key="h.id" :timestamp="fmt(h.create_time)">
              {{ h.action }}<span v-if="h.to_status"> → {{ h.to_status }}</span>
              <span v-if="h.comment">: {{ h.comment }}</span>
            </el-timeline-item>
          </el-timeline>
        </div>
      </el-dialog>

      <el-dialog v-model="createVisible" :title="$t('newApproval')" width="560px">
        <el-form label-width="110px">
          <el-form-item :label="$t('category')">
            <el-select v-model="form.category" style="width: 100%">
              <el-option v-for="c in CATEGORIES" :key="c" :label="$t('cat_' + c)" :value="c" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('approvalTitle')"><el-input v-model="form.title" /></el-form-item>
          <el-form-item :label="$t('requestDescription')"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
          <el-form-item :label="$t('approver')">
            <el-select v-model="form.approver_id" filterable clearable style="width: 100%">
              <el-option v-for="u in directory" :key="u.user_id" :label="`${u.name} (${u.email})`" :value="u.user_id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('priority')">
            <el-select v-model="form.priority" style="width: 100%">
              <el-option v-for="p in PRIORITIES" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('dueDate')"><el-date-picker v-model="form.due_at" type="datetime" style="width: 100%" /></el-form-item>
          <el-form-item :label="$t('submitNow')"><el-switch v-model="form.submit" /></el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="createVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="saveCreate">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { approvalList, approvalGet, approvalCreate, approvalApprove, approvalReject, approvalRequestChanges } from '@/request/approvals.js'
import { directoryList } from '@/request/directory.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'

const STATUSES = ['draft', 'pending', 'approved', 'rejected', 'changes_requested', 'cancelled']
const CATEGORIES = ['finance', 'document', 'access', 'project', 'procurement', 'operational', 'general']
const PRIORITIES = ['critical', 'high', 'normal', 'low']

const scope = ref('inbox')
const status = ref('')
const category = ref('')
const rows = ref([])
const directory = ref([])
const detail = ref(null)
const detailVisible = ref(false)
const createVisible = ref(false)
useCreateIntent(() => openCreate())
const form = ref({})

const canQueryAll = computed(() => hasPerm('approvals:query'))

function fmt(v) { return v ? String(v).slice(0, 16) : '—' }
function statusType(s) { return ({ pending: 'warning', approved: 'success', rejected: 'danger', changes_requested: 'warning' })[s] || 'info' }
function priorityType(p) { return ({ critical: 'danger', high: 'warning' })[p] || 'info' }

async function loadList() {
  try {
    const params = { scope: scope.value, page: 1, pageSize: 100 }
    if (status.value) params.status = status.value
    if (category.value) params.category = category.value
    const resp = await approvalList(params)
    rows.value = resp.list || []
  } catch (e) { /* interceptor surfaces the message */ }
}

async function loadDirectory() {
  try { const resp = await directoryList(); directory.value = resp.list || [] } catch (e) { /* ignore */ }
}

function openCreate() {
  form.value = { category: 'general', title: '', description: '', approver_id: null, priority: 'normal', due_at: null, submit: true }
  createVisible.value = true
}

async function saveCreate() {
  try {
    await approvalCreate({ ...form.value, status: form.value.submit ? 'pending' : 'draft' })
    createVisible.value = false
    ElMessage.success('Approval created.')
    loadList()
  } catch (e) { /* ignore */ }
}

async function openDetail(row) {
  try { detail.value = await approvalGet(row.id); detailVisible.value = true } catch (e) { /* ignore */ }
}

function canAct(row) {
  // Only the assigned approver (or group) may decide; requester is blocked server-side.
  return row.status === 'pending'
}

async function approve(row) {
  try {
    const { value } = await ElMessageBox.prompt('Optional comment', 'Approve', { inputType: 'textarea' })
    await approvalApprove(row.id, { comment: value || '' })
    ElMessage.success('Approved.')
    loadList()
  } catch (e) { if (e !== 'cancel' && e !== 'close') { /* ignore */ } }
}

async function reject(row) {
  try {
    const { value } = await ElMessageBox.prompt('Reason for rejection', 'Reject', { inputType: 'textarea', inputValidator: v => !!v || 'Reason required' })
    await approvalReject(row.id, { reason: value })
    ElMessage.success('Rejected.')
    loadList()
  } catch (e) { /* ignore */ }
}

async function requestChanges(row) {
  try {
    const { value } = await ElMessageBox.prompt('What needs to change?', 'Request changes', { inputType: 'textarea', inputValidator: v => !!v || 'Reason required' })
    await approvalRequestChanges(row.id, { reason: value })
    ElMessage.success('Changes requested.')
    loadList()
  } catch (e) { /* ignore */ }
}

onMounted(() => { loadDirectory(); loadList() })
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-actions { display: flex; gap: 8px; align-items: center; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 16px; }
.module-card { min-width: 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--hq-text-secondary); }
.timeline-title { margin: 16px 0 8px; font-weight: 650; }
</style>