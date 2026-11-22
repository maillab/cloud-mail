<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>Opportunities</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'deals:add'" type="primary" icon="plus" @click="openDealDialog">New deal</el-button>
          <el-button  @click="loadDeals" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">Opportunities</span>
            <el-select v-model="statusFilter" placeholder="Status" size="small" style="width: 120px">
              <el-option label="All" value="" />
              <el-option label="Open" value="open" />
              <el-option label="Won" value="won" />
              <el-option label="Lost" value="lost" />
            </el-select>
            <el-select v-model="pipelineFilter" placeholder="Pipeline" size="small" style="width: 160px">
              <el-option label="All pipelines" value="" />
              <el-option v-for="p in pipelines" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </div>
        </template>

        <el-table v-if="deals.length" :data="deals" style="width: 100%">
          <el-table-column prop="title" label="Deal" min-width="200">
            <template #default="scope">{{ scope.row.title }}</template>
          </el-table-column>
          <el-table-column prop="value_cents" label="Value" min-width="120" align="right">
            <template #default="scope">{{ formatMoney(scope.row.value_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="Status" min-width="100">
            <template #default="scope">
              <el-tag :type="statusType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="expected_close_date" label="Expected close" min-width="140">
            <template #default="scope">{{ scope.row.expected_close_date || '—' }}</template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="140">
            <template #default="scope">
              <el-button v-perm="'deals:edit'" type="text" size="small" icon="edit" @click="editDeal(scope.row)" />
              <el-button v-perm="'deals:delete'" type="text" size="small" icon="delete" @click="deleteDeal(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>No deals yet.</p>
          <el-button v-perm="'deals:add'" type="primary" @click="openDealDialog">Add your first deal</el-button>
        </div>
      </el-card>

      <el-dialog v-model="dealDialogVisible" title="Deal" width="560px">
        <el-form :model="dealForm" label-width="110px">
          <el-form-item label="Title" prop="title">
            <el-input v-model="dealForm.title" />
          </el-form-item>
          <el-form-item label="Pipeline" prop="pipeline_id">
            <el-select v-model="dealForm.pipeline_id" placeholder="Select pipeline">
              <el-option v-for="p in pipelines" :key="p.id" :label="p.name" :value="p.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Stage" prop="stage_id">
            <el-select v-model="dealForm.stage_id" placeholder="Select stage">
              <el-option v-for="s in stages" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Contact" prop="contact_id">
            <el-select v-model="dealForm.contact_id" placeholder="Select contact">
              <el-option v-for="c in contacts" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Company" prop="company_id">
            <el-select v-model="dealForm.company_id" placeholder="Select company">
              <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Value (cents)" prop="value_cents">
            <el-input-number v-model="dealForm.value_cents" :min="0" />
          </el-form-item>
          <el-form-item label="Currency" prop="currency">
            <el-select v-model="dealForm.currency">
              <el-option label="KES" value="KES" />
              <el-option label="USD" value="USD" />
              <el-option label="EUR" value="EUR" />
            </el-select>
          </el-form-item>
          <el-form-item label="Status" prop="status">
            <el-select v-model="dealForm.status">
              <el-option label="Open" value="open" />
              <el-option label="Won" value="won" />
              <el-option label="Lost" value="lost" />
            </el-select>
          </el-form-item>
          <el-form-item label="Expected close date" prop="expected_close_date">
            <el-date-picker v-model="dealForm.expected_close_date" type="date" value-format="yyyy-MM-dd" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="dealDialogVisible = false">Cancel</el-button>
              <el-button type="primary" :loading="saving" @click="saveDeal">Save deal</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { dealsList, dealsCreate, dealsUpdate, dealsDelete } from '@/request/deals.js'
import { pipelinesList } from '@/request/pipelines.js'
import { stagesList } from '@/request/stages.js'
import { contactsList } from '@/request/contacts.js'
import { companiesList } from '@/request/companies.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const statusFilter = ref('')
const pipelineFilter = ref('')
const deals = ref([])
const pipelines = ref([])
const stages = ref([])
const contacts = ref([])
const companies = ref([])
const loading = ref(false)
const saving = ref(false)

const dealDialogVisible = ref(false)
useCreateIntent(() => openDealDialog())
const dealForm = ref({
  id: null,
  title: '',
  pipeline_id: null,
  stage_id: null,
  contact_id: null,
  company_id: null,
  value_cents: 0,
  currency: 'KES',
  status: 'open',
  expected_close_date: ''
})

const canAdd = computed(() => hasPerm('deals:add'))
const canEdit = computed(() => hasPerm('deals:edit'))
const canDelete = computed(() => hasPerm('deals:delete'))

async function loadDeals() {
  loading.value = true
  try {
    const resp = await dealsList({ page: 1, pageSize: 100, pipeline_id: pipelineFilter.value || undefined, status: statusFilter.value || undefined })
    deals.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load deals.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function loadReferenceData() {
  const [pResp, cResp, coResp] = await Promise.all([
    pipelinesList({ page: 1, pageSize: 100 }),
    contactsList({ page: 1, pageSize: 100 }),
    companiesList({ page: 1, pageSize: 100 })
  ])
  pipelines.value = pResp.list || []
  contacts.value = cResp.list || []
  companies.value = coResp.list || []
}

async function loadStages(pipelineId) {
  if (!pipelineId) {
    stages.value = []
    return
  }
  const resp = await stagesList({ pipeline_id: pipelineId })
  stages.value = resp || []
}

function formatMoney(cents, currency = 'KES') {
  if (cents == null) return '—'
  const amount = (Number(cents) / 100).toFixed(2)
  return `${currency} ${amount}`
}

function statusType(status) {
  const map = { open: 'primary', won: 'success', lost: 'danger' }
  return map[status] || 'info'
}

function openDealDialog(deal = null) {
  if (deal) {
    dealForm.value = { ...deal }
  } else {
    dealForm.value = { id: null, title: '', pipeline_id: null, stage_id: null, contact_id: null, company_id: null, value_cents: 0, currency: 'KES', status: 'open', expected_close_date: '' }
  }
  dealDialogVisible.value = true
  loadReferenceData()
}

async function saveDeal() {
  if (!dealForm.value.title.trim()) {
    ElMessage({ message: 'Title is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (dealForm.value.id) {
      await dealsUpdate(dealForm.value.id, dealForm.value)
    } else {
      await dealsCreate(dealForm.value)
    }
    dealDialogVisible.value = false
    await loadDeals()
    ElMessage({ message: 'Deal saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save deal.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editDeal(deal) {
  openDealDialog(deal)
}

async function deleteDeal(deal) {
  if (!await confirm(`Delete deal "${deal.title}"?`)) return
  try {
    await dealsDelete(deal.id)
    await loadDeals()
    ElMessage({ message: 'Deal deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete deal.', type: 'error', plain: true })
  }
}

watch(dealForm, (val) => {
  if (val.pipeline_id) loadStages(val.pipeline_id)
}, { deep: true })
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
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--hq-text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: var(--hq-text-secondary);
}

.empty-state p {
  margin-bottom: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>