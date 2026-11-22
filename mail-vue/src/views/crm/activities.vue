<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>{{ $t('crmActivities') }}</h1>
        </div>
        <div class="crm-actions">
          <el-button  :loading="loading" @click="loadActivities" text circle icon="refresh" :aria-label="$t('crmRefresh')" :title="$t('crmRefresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">{{ $t('crmActivities') }}</span>
            <div class="card-tools">
              <el-input
                v-model="search"
                :placeholder="$t('crmSearchActivities')"
                clearable
                style="width: 220px"
                @update:model-value="debouncedSearch"
              />
              <el-select v-model="entityTypeFilter" :placeholder="$t('crmActivityType')" clearable style="width: 170px" @change="loadActivities">
                <el-option :label="$t('crmAll')" value="" />
                <el-option label="Contact" value="contact" />
                <el-option label="Organization" value="organization" />
                <el-option label="Opportunity" value="deal" />
                <el-option label="Task" value="task" />
                <el-option label="Event" value="event" />
                <el-option label="Support request" value="support_request" />
              </el-select>
            </div>
          </div>
        </template>

        <el-table v-loading="loading" :data="activities" style="width: 100%">
          <el-table-column :label="$t('crmDate')" min-width="150">
            <template #default="scope">{{ formatDateTime(scope.row.occurred_at) }}</template>
          </el-table-column>
          <el-table-column :label="$t('crmEntity')" min-width="220">
            <template #default="scope">
              <div class="entity-cell">
                <span class="entity-name">{{ entityLabel(scope.row) }}</span>
                <span v-if="!scope.row.entity_name && scope.row.entity_id" class="entity-meta">#{{ scope.row.entity_id }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column :label="$t('crmActivityType')" min-width="130">
            <template #default="scope">
              <el-tag size="small" :type="activityTagType(scope.row.activity_type)" effect="plain">
                {{ activityLabel(scope.row.activity_type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="subject" :label="$t('crmActivitySubject')" min-width="200" show-overflow-tooltip />
          <el-table-column prop="description" :label="$t('crmActivityDescription')" min-width="280" show-overflow-tooltip />
          <template #empty>
            <div class="empty-state">
              <p>{{ $t('crmNoActivities') }}</p>
            </div>
          </template>
        </el-table>
      </el-card>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { activitiesList } from '@/request/activities.js'

const ENTITY_LABELS = {
  contact: 'Contact',
  organization: 'Organization',
  company: 'Organization',
  deal: 'Opportunity',
  opportunity: 'Opportunity',
  task: 'Task',
  event: 'Event',
  support_request: 'Support request'
}

const ACTIVITY_LABELS = {
  create: 'Created',
  edit: 'Updated',
  delete: 'Deleted',
  note: 'Note',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  task: 'Task',
  stage_change: 'Stage changed',
  status_change: 'Status changed',
  follow_up: 'Follow-up'
}

const ACTIVITY_TAG_TYPES = {
  create: 'success',
  edit: 'info',
  delete: 'danger',
  note: 'warning',
  call: 'primary',
  email: 'primary',
  meeting: 'primary'
}

const search = ref('')
const entityTypeFilter = ref('')
const activities = ref([])
const loading = ref(false)

let searchTimer = null

const debouncedSearch = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadActivities(), 300)
}

const entityLabel = (row) => {
  const type = ENTITY_LABELS[row.entity_type] || row.entity_type || 'Activity'
  return row.entity_name ? `${type} · ${row.entity_name}` : type
}

const activityLabel = (type) => ACTIVITY_LABELS[type] || type || '—'

const activityTagType = (type) => ACTIVITY_TAG_TYPES[type] || 'info'

const formatDateTime = (value) => {
  if (!value) return '—'
  const text = String(value)
  return text.length > 16 ? text.slice(0, 16).replace('T', ' ') : text
}

async function loadActivities() {
  loading.value = true
  try {
    const resp = await activitiesList({
      page: 1,
      pageSize: 100,
      search: search.value || undefined,
      entity_type: entityTypeFilter.value || undefined
    })
    activities.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load activities.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

onMounted(loadActivities)
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
  gap: 12px;
  flex-wrap: wrap;
}

.card-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.card-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--hq-text-secondary);
}

.entity-cell {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.entity-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-meta {
  color: var(--hq-muted);
  font-size: 12px;
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
</style>