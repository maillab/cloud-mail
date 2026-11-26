<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>{{ deal ? deal.title : $t('crmDealDetail') }}</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'deals:edit'" type="primary" icon="edit" @click="editDeal">{{ $t('crmEdit') }}</el-button>
          <el-button v-perm="'deals:delete'" type="text" icon="delete" @click="deleteDeal">{{ $t('crmDelete') }}</el-button>
          <el-button icon="arrow-left" @click="goBack">{{ $t('crmBackToDeals') }}</el-button>
        </div>
      </div>

      <el-card v-if="deal" class="crm-card detail-card">
        <div class="detail-header">
          <div class="detail-avatar">{{ deal.status === 'won' ? '🏆' : deal.status === 'lost' ? '💔' : '$' }}</div>
          <div class="detail-info">
            <h2 class="detail-name">{{ deal.title }}</h2>
            <div class="detail-meta">{{ $t('crmValue') }}: {{ formatMoney(deal.value_cents, deal.currency) }}</div>
            <div class="detail-meta">{{ $t('crmStatus') }}: {{ deal.status }}</div>
            <div class="detail-meta">{{ $t('crmPipeline') }}: {{ deal.pipeline_name || '—' }}</div>
            <div class="detail-meta">{{ $t('crmStage') }}: {{ deal.stage_name || '—' }}</div>
            <div class="detail-meta">{{ $t('crmProbability') }}: {{ deal.probability }}%</div>
            <el-tag :type="deal.status === 'won' ? 'success' : deal.status === 'lost' ? 'danger' : 'primary'" size="small">{{ deal.status }}</el-tag>
          </div>
        </div>

        <el-tabs v-model="activeTab" class="detail-tabs">
          <el-tab-pane :label="$t('crmOverview')" name="overview">
            <div class="detail-grid">
              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmDeal') }}</div>
                </template>
                <div class="section-content">
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmExpectedClose') }}</span>
                    <span class="meta-value">{{ deal.expected_close_date ? deal.expected_close_date.slice(0, 10) : '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmNextStep') }}</span>
                    <span class="meta-value">{{ deal.next_step || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmOwner') }}</span>
                    <span class="meta-value">User #{{ deal.assigned_to || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmContact') }}</span>
                    <span class="meta-value">{{ deal.contact_name || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmOrganization') }}</span>
                    <span class="meta-value">{{ deal.company_name || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmDealType') }}</span>
                    <span class="meta-value">{{ deal.deal_type || 'event_onboarding' }}</span>
                  </div>
                </div>
              </el-card>

              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmWinLoss') }}</div>
                </template>
                <div class="section-content">
                  <div class="meta-row" v-if="deal.win_reason">
                    <span class="meta-label">{{ $t('crmWinReason') }}</span>
                    <span class="meta-value">{{ deal.win_reason }}</span>
                  </div>
                  <div class="meta-row" v-if="deal.loss_reason">
                    <span class="meta-label">{{ $t('crmLossReason') }}</span>
                    <span class="meta-value">{{ deal.loss_reason }}</span>
                  </div>
                  <div v-if="!deal.win_reason && !deal.loss_reason" class="empty">{{ $t('crmNoWinLossReason') }}</div>
                </div>
              </el-card>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="$t('crmRelatedTasks')" name="tasks">
            <el-card class="crm-card">
              <template #header>
                <div class="card-header">
                  <span class="card-label">{{ $t('crmRelatedTasks') }}</span>
                  <el-button v-perm="'tasks:add'" type="text" size="small" icon="plus" @click="openNewTask">{{ $t('crmNewTask') }}</el-button>
                </div>
              </template>
              <el-table v-if="tasks.length" :data="tasks" style="width: 100%">
                <el-table-column prop="title" :label="$t('crmTask')" min-width="200">
                  <template #default="scope">{{ scope.row.title }}</template>
                </el-table-column>
                <el-table-column prop="status" :label="$t('crmStatus')" min-width="100">
                  <template #default="scope">
                    <el-tag :type="taskStatusType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="due_at" :label="$t('crmDueDate')" min-width="140">
                  <template #default="scope">{{ scope.row.due_at ? scope.row.due_at.slice(0, 16) : '—' }}</template>
                </el-table-column>
              </el-table>
              <div v-else class="empty-state">{{ $t('crmNoRelatedTasks') }}</div>
            </el-card>
          </el-tab-pane>

          <el-tab-pane :label="$t('crmActivities')" name="activities">
            <el-card class="crm-card">
              <template #header>
                <div class="card-header">
                  <span class="card-label">{{ $t('crmActivities') }}</span>
                  <el-button v-perm="'activities:add'" type="text" size="small" icon="plus" @click="openNewActivity">{{ $t('crmNewActivity') }}</el-button>
                </div>
              </template>
              <el-table v-if="dealActivities.length" :data="dealActivities" style="width: 100%">
                <el-table-column prop="occurred_at" :label="$t('crmDate')" min-width="160">
                  <template #default="scope">{{ scope.row.occurred_at ? scope.row.occurred_at.slice(0, 16) : '—' }}</template>
                </el-table-column>
                <el-table-column prop="activity_type" :label="$t('crmActivityType')" min-width="120">
                  <template #default="scope">{{ scope.row.activity_type }}</template>
                </el-table-column>
                <el-table-column prop="subject" :label="$t('crmActivitySubject')" min-width="200">
                  <template #default="scope">{{ scope.row.subject }}</template>
                </el-table-column>
                <el-table-column prop="description" :label="$t('crmActivityDescription')" min-width="300">
                  <template #default="scope">{{ scope.row.description }}</template>
                </el-table-column>
              </el-table>
              <div v-else class="empty-state">{{ $t('crmNoActivities') }}</div>
            </el-card>
          </el-tab-pane>
        </el-tabs>
      </el-card>

      <el-dialog v-model="editDialogVisible" :title="$t('crmEditDeal')" width="560px">
        <el-form :model="editForm" label-width="110px">
          <el-form-item :label="$t('crmTitle')" prop="title">
            <el-input v-model="editForm.title" />
          </el-form-item>
          <el-form-item :label="$t('crmPipeline')" prop="pipeline_id">
            <el-select v-model="editForm.pipeline_id" placeholder="Select pipeline">
              <el-option v-for="p in pipelines" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmStage')" prop="stage_id">
            <el-select v-model="editForm.stage_id" placeholder="Select stage">
              <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmContact')" prop="contact_id">
            <el-select v-model="editForm.contact_id" placeholder="Select contact">
              <el-option v-for="c in contacts" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmOrganization')" prop="company_id">
            <el-select v-model="editForm.company_id" placeholder="Select organization">
              <el-option v-for="o in organizations" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmDealValue')" prop="value_cents">
            <el-input-number v-model="editForm.value_cents" :min="0" />
          </el-form-item>
          <el-form-item :label="$t('crmCurrency')" prop="currency">
            <el-select v-model="editForm.currency">
              <el-option label="KES" value="KES" />
              <el-option label="USD" value="USD" />
              <el-option label="EUR" value="EUR" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmStatus')" prop="status">
            <el-select v-model="editForm.status">
              <el-option label="Open" value="open" />
              <el-option label="Won" value="won" />
              <el-option label="Lost" value="lost" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmProbability')" prop="probability">
            <el-input-number v-model="editForm.probability" :min="0" :max="100" />
          </el-form-item>
          <el-form-item :label="$t('crmNextStep')" prop="next_step">
            <el-input v-model="editForm.next_step" />
          </el-form-item>
          <el-form-item :label="$t('crmExpectedClose')" prop="expected_close_date">
            <el-date-picker v-model="editForm.expected_close_date" type="date" value-format="yyyy-MM-dd" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="editDialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="saving" @click="saveDeal">{{ $t('crmSave') }}</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>

      <el-dialog v-model="activityDialogVisible" :title="$t('crmNewActivity')" width="560px">
        <el-form :model="activityForm" label-width="110px">
          <el-form-item :label="$t('crmActivityType')" prop="activity_type">
            <el-select v-model="activityForm.activity_type">
              <el-option label="Call" value="call" />
              <el-option label="Email" value="email" />
              <el-option label="Meeting" value="meeting" />
              <el-option label="Note" value="note" />
              <el-option label="WhatsApp" value="whatsapp" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmActivitySubject')" prop="subject">
            <el-input v-model="activityForm.subject" />
          </el-form-item>
          <el-form-item :label="$t('crmActivityDescription')" prop="description">
            <el-input v-model="activityForm.description" type="textarea" rows="3" />
          </el-form-item>
          <el-form-item :label="$t('crmDate')" prop="occurred_at">
            <el-date-picker v-model="activityForm.occurred_at" type="datetime" value-format="yyyy-MM-dd HH:mm:ss" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="activityDialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="activitySaving" @click="createActivity">{{ $t('crmSave') }}</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { dealsList, dealsUpdate } from '@/request/deals.js'
import { tasksList } from '@/request/tasks.js'
import { activitiesList, activitiesCreate } from '@/request/activities.js'
import { pipelinesList } from '@/request/pipelines.js'
import { stagesList } from '@/request/stages.js'
import { contactsList } from '@/request/contacts.js'
import { organizationsList } from '@/request/organizations.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const router = useRouter()
const route = useRoute()

const deal = ref(null)
const tasks = ref([])
const dealActivities = ref([])
const pipelines = ref([])
const stages = ref([])
const contacts = ref([])
const organizations = ref([])

const activeTab = ref('overview')

const editDialogVisible = ref(false)
const activityDialogVisible = ref(false)

const editForm = ref({
  id: null,
  title: '',
  pipeline_id: null,
  stage_id: null,
  contact_id: null,
  company_id: null,
  value_cents: 0,
  currency: 'KES',
  status: 'open',
  probability: 0,
  next_step: '',
  expected_close_date: ''
})

const activityForm = ref({
  entity_type: 'deal',
  entity_id: 0,
  activity_type: 'call',
  subject: '',
  description: '',
  occurred_at: ''
})

const saving = ref(false)
const activitySaving = ref(false)
const loading = ref(false)

const canEdit = computed(() => hasPerm('deals:edit'))
const canDelete = computed(() => hasPerm('deals:delete'))
const canAddTask = computed(() => hasPerm('tasks:add'))
const canAddActivity = computed(() => hasPerm('activities:add'))

async function loadDeal() {
  const id = route.params.id
  if (!id) return
  loading.value = true
  try {
    const [dealResp, tasksResp, activitiesResp, pipelinesResp, stagesResp, contactsResp, orgsResp] = await Promise.all([
      dealsList({ page: 1, pageSize: 1 }),
      tasksList({ page: 1, pageSize: 100, deal_id: Number(id) }),
      activitiesList({ page: 1, pageSize: 100, entity_type: 'deal', entity_id: Number(id) }),
      pipelinesList({ page: 1, pageSize: 100 }),
      stagesList({ pipeline_id: deal.value?.pipeline_id || '' }),
      contactsList({ page: 1, pageSize: 200 }),
      organizationsList({ page: 1, pageSize: 200 })
    ])

    const allDeals = dealResp.list || []
    deal.value = allDeals.find(d => String(d.id) === String(id)) || null

    tasks.value = tasksResp.list || []
    dealActivities.value = activitiesResp.list || []
    pipelines.value = pipelinesResp.list || []
    contacts.value = contactsResp.list || []
    organizations.value = orgsResp.list || []

    if (deal.value?.pipeline_id) {
      const stagesResp = await stagesList({ pipeline_id: deal.value.pipeline_id })
      stages.value = stagesResp || []
    }

    // Enrich deal with names
    if (deal.value) {
      const contact = contacts.value.find(c => String(c.id) === String(deal.value.contact_id))
      const org = organizations.value.find(o => String(o.id) === String(deal.value.company_id))
      const pipeline = pipelines.value.find(p => String(p.id) === String(deal.value.pipeline_id))
      const stage = stages.value.find(s => String(s.id) === String(deal.value.stage_id))
      deal.value.contact_name = contact ? contact.name : '—'
      deal.value.company_name = org ? org.name : '—'
      deal.value.pipeline_name = pipeline ? pipeline.name : '—'
      deal.value.stage_name = stage ? stage.name : '—'
    }
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load deal.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString()
}

function formatMoney(cents, currency = 'KES') {
  if (cents == null) return '—'
  const amount = (Number(cents) / 100).toFixed(2)
  return `${currency} ${amount}`
}

function taskStatusType(status) {
  const map = { pending: 'warning', in_progress: 'info', completed: 'success' }
  return map[status] || 'info'
}

function goBack() {
  router.push({ name: 'crm-deals' })
}

function editDeal() {
  if (!deal.value) return
  editForm.value = {
    id: deal.value.id,
    title: deal.value.title || '',
    pipeline_id: deal.value.pipeline_id || null,
    stage_id: deal.value.stage_id || null,
    contact_id: deal.value.contact_id || null,
    company_id: deal.value.company_id || null,
    value_cents: deal.value.value_cents || 0,
    currency: deal.value.currency || 'KES',
    status: deal.value.status || 'open',
    probability: deal.value.probability || 0,
    next_step: deal.value.next_step || '',
    expected_close_date: deal.value.expected_close_date || ''
  }
  editDialogVisible.value = true
}

async function saveDeal() {
  saving.value = true
  try {
    await dealsUpdate(deal.value.id, editForm.value)
    editDialogVisible.value = false
    await loadDeal()
    ElMessage({ message: 'Opportunity updated.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to update opportunity.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function deleteDeal() {
  if (!deal.value) return
  if (!await confirm(`Delete opportunity "${deal.value.title}"?`)) return
  try {
    const { dealsDelete } = await import('@/request/deals.js')
    await dealsDelete(deal.value.id)
    goBack()
    ElMessage({ message: 'Opportunity deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete opportunity.', type: 'error', plain: true })
  }
}

function openNewTask() {
  if (!deal.value) return
  router.push({ name: 'crm-tasks', query: { deal_id: deal.value.id } })
}

function openNewActivity() {
  if (!deal.value) return
  activityForm.value = {
    entity_type: 'deal',
    entity_id: Number(deal.value.id),
    activity_type: 'call',
    subject: '',
    description: '',
    occurred_at: ''
  }
  activityDialogVisible.value = true
}

async function createActivity() {
  if (!activityForm.value.subject.trim()) {
    ElMessage({ message: 'Subject is required.', type: 'warning', plain: true })
    return
  }
  activitySaving.value = true
  try {
    await activitiesCreate(activityForm.value)
    activityDialogVisible.value = false
    await loadDeal()
    ElMessage({ message: 'Activity recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to record activity.', type: 'error', plain: true })
  } finally {
    activitySaving.value = false
  }
}

watch(() => route.params.id, async () => {
  await loadDeal()
})

onMounted(loadDeal)
</script>

<style scoped>
.crm-scroll {
  height: 100%;
  background: var(--hq-page);
}

.crm-container {
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 28px clamp(20px, 3vw, 42px) 36px;
  color: var(--hq-text);
}

.crm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.crm-eyebrow {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.crm-title h1 {
  margin: 4px 0 0;
  font-size: clamp(24px, 2.4vw, 30px);
  font-weight: 650;
  letter-spacing: -.035em;
  line-height: 1.2;
}

.crm-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.crm-card {
  min-width: 0;
  margin-bottom: 16px;
}

.detail-card {
  margin-bottom: 24px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--hq-border);
  margin-bottom: 24px;
}

.detail-avatar {
  display: grid;
  width: 64px;
  height: 64px;
  place-items: center;
  border-radius: 50%;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-size: 24px;
  font-weight: 700;
}

.detail-info h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -.02em;
}

.detail-meta {
  font-size: 13px;
  color: var(--hq-text-secondary);
  margin: 2px 0;
}

.detail-tabs {
  margin-top: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.detail-section {
  min-width: 0;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--hq-text-secondary);
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 8px;
}

.section-content {
  font-size: 13px;
  color: var(--hq-text);
}

.section-content.empty {
  color: var(--hq-text-secondary);
  font-style: italic;
}

.meta-row {
  display: flex;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 13px;
}

.meta-label {
  color: var(--hq-text-secondary);
  min-width: 80px;
}

.meta-value {
  min-width: 0;
  overflow: hidden;
  color: var(--hq-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  color: var(--hq-text-secondary);
  font-style: italic;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 760px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
