<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>{{ $t('crmEvents') }}</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'events:add'" type="primary" icon="plus" @click="openEventDialog">{{ $t('crmNewEvent') }}</el-button>
          <el-button v-perm="'events:add'" icon="upload" @click="openImport">{{ $t('upload') }}</el-button>
          <el-button  @click="loadEvents" text circle icon="refresh" :aria-label="$t('crmRefresh')" :title="$t('crmRefresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">{{ $t('crmEvents') }}</span>
            <el-input
              v-model="search"
              placeholder="Search event name, location, organizer…"
              clearable
              @update:model-value="debouncedSearch"
            />
            <el-select v-model="lifecycleFilter" placeholder="Lifecycle" size="small" style="width: 140px">
              <el-option label="All" value="" />
              <el-option label="Planned" value="planned" />
              <el-option label="Live" value="live" />
              <el-option label="Completed" value="completed" />
              <el-option label="Cancelled" value="cancelled" />
            </el-select>
          </div>
        </template>

        <el-table v-if="events.length" :data="events" style="width: 100%">
          <el-table-column prop="name" label="Event Name" min-width="220">
            <template #default="scope">{{ scope.row.name }}</template>
          </el-table-column>
          <el-table-column prop="event_date" label="Date" min-width="140">
            <template #default="scope">{{ scope.row.event_date ? scope.row.event_date.split('T')[0] : '—' }}</template>
          </el-table-column>
          <el-table-column prop="location" label="Location" min-width="160">
            <template #default="scope">{{ scope.row.location || '—' }}</template>
          </el-table-column>
          <el-table-column prop="organizer" label="Organizer" min-width="160">
            <template #default="scope">{{ scope.row.organizer || '—' }}</template>
          </el-table-column>
          <el-table-column prop="lifecycle" label="Lifecycle" min-width="120">
            <template #default="scope">
              <el-tag :type="lifecycleType(scope.row.lifecycle)" size="small">{{ scope.row.lifecycle }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="category" label="Category" min-width="110">
            <template #default="scope">{{ scope.row.category || '—' }}</template>
          </el-table-column>
          <el-table-column prop="verification_status" label="Verification" min-width="120">
            <template #default="scope">
              <el-tag :type="verifType(scope.row.verification_status)" size="small">{{ scope.row.verification_status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="assigned_to" label="Assigned" min-width="110">
            <template #default="scope">{{ userName(scope.row.assigned_to) }}</template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="160">
            <template #default="scope">
              <el-button v-perm="'events:edit'" type="text" size="small" icon="edit" @click="editEvent(scope.row)" />
              <el-button v-perm="'events:delete'" type="text" size="small" icon="delete" @click="deleteEvent(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>{{ $t('crmNoEvents') }}</p>
          <el-button v-perm="'events:add'" type="primary" @click="openEventDialog">{{ $t('crmAddFirstEvent') }}</el-button>
        </div>
      </el-card>

      <el-dialog v-model="eventDialogVisible" :title="$t('crmNewEvent')" width="620px">
        <el-form :model="eventForm" label-width="130px">
          <el-form-item label="Name" prop="name">
            <el-input v-model="eventForm.name" />
          </el-form-item>
          <el-form-item label="Event Date" prop="event_date">
            <el-input v-model="eventForm.event_date" type="date" />
          </el-form-item>
          <el-form-item label="Location" prop="location">
            <el-input v-model="eventForm.location" />
          </el-form-item>
          <el-form-item label="Organizer" prop="organizer">
            <el-input v-model="eventForm.organizer" />
          </el-form-item>
          <el-form-item label="Lifecycle" prop="lifecycle">
            <el-select v-model="eventForm.lifecycle">
              <el-option label="Planned" value="planned" />
              <el-option label="Live" value="live" />
              <el-option label="Completed" value="completed" />
              <el-option label="Cancelled" value="cancelled" />
            </el-select>
          </el-form-item>
          <el-form-item label="Category">
            <el-input v-model="eventForm.category" />
          </el-form-item>
          <el-form-item label="Venue">
            <el-input v-model="eventForm.venue" />
          </el-form-item>
          <el-form-item label="Start">
            <el-date-picker v-model="eventForm.start_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" style="width: 100%" />
          </el-form-item>
          <el-form-item label="End">
            <el-date-picker v-model="eventForm.end_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" style="width: 100%" />
          </el-form-item>
          <el-form-item label="Status">
            <el-select v-model="eventForm.status">
              <el-option label="Planned" value="planned" />
              <el-option label="Confirmed" value="confirmed" />
              <el-option label="Completed" value="completed" />
              <el-option label="Cancelled" value="cancelled" />
            </el-select>
          </el-form-item>
          <el-form-item label="Verification">
            <el-select v-model="eventForm.verification_status">
              <el-option label="Unverified" value="unverified" />
              <el-option label="Verified" value="verified" />
              <el-option label="Rejected" value="rejected" />
            </el-select>
          </el-form-item>
          <el-form-item label="Source">
            <el-input v-model="eventForm.source" placeholder="manual / import / ai" />
          </el-form-item>
          <el-form-item label="Source URL">
            <el-input v-model="eventForm.source_url" />
          </el-form-item>
          <el-form-item label="Assigned">
            <el-select v-model="eventForm.assigned_to" clearable placeholder="Unassigned" style="width: 100%">
              <el-option v-for="u in directory" :key="u.user_id" :label="`${u.name} (${u.email})`" :value="u.user_id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Description">
            <el-input v-model="eventForm.description" type="textarea" rows="2" />
          </el-form-item>
          <el-form-item label="Relationship Notes" prop="relationship_notes">
            <el-input v-model="eventForm.relationship_notes" type="textarea" rows="2" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="eventDialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="saving" @click="saveEvent">{{ $t('crmSave') }}</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>

      <el-dialog v-model="importVisible" title="Import verified events" width="560px">
        <p class="import-hint">Paste a JSON array. Each item may include name, organizer, venue, category, start_time, source, source_url, verification_status.</p>
        <el-input v-model="importText" type="textarea" :rows="8" placeholder='[{"name":"Industry Expo","organizer":"Acme","venue":"Hall 1","category":"expo"}]' />
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="importVisible = false">{{ $t('crmCancel') }}</el-button>
            <el-button type="primary" :loading="importing" @click="runImport">{{ $t('upload') }}</el-button>
          </span>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { eventsList, eventsCreate, eventsUpdate, eventsDelete, eventsImport } from '@/request/events.js'
import { directoryList } from '@/request/directory.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const search = ref('')
const lifecycleFilter = ref('')
const events = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const importVisible = ref(false)
const importText = ref('')
const importing = ref(false)
const directory = ref([])

const eventDialogVisible = ref(false)
useCreateIntent(() => openEventDialog())
const eventForm = ref({
  id: null,
  external_event_id: '',
  name: '',
  event_date: '',
  location: '',
  organizer: '',
  lifecycle: 'planned',
  venue_partners: '[]',
  sponsors: '[]',
  relationship_notes: '',
  related_opportunity_id: null,
  created_by: null,
  updated_by: null,
  version: 1,
  category: '',
  venue: '',
  start_time: '',
  end_time: '',
  description: '',
  source: 'manual',
  source_url: '',
  status: 'planned',
  assigned_to: null,
  verification_status: 'unverified'
})

const canAdd = computed(() => hasPerm('events:add'))
const canEdit = computed(() => hasPerm('events:edit'))
const canDelete = computed(() => hasPerm('events:delete'))

let searchTimer = null

const debouncedSearch = (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = val
    loadEvents()
  }, 300)
}

async function loadEvents() {
  loading.value = true
  try {
    const resp = await eventsList({ page: 1, pageSize: 100, search: search.value || undefined, lifecycle: lifecycleFilter.value || undefined })
    events.value = resp.list || []
    total.value = resp.total ?? 0
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load events.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function lifecycleType(lifecycle) {
  const map = { planned: 'info', live: 'success', completed: 'primary', cancelled: 'danger' }
  return map[lifecycle] || 'info'
}

function verifType(v) {
  return ({ verified: 'success', rejected: 'danger', unverified: 'info' })[v] || 'info'
}

function userName(id) {
  const u = directory.value.find(x => x.user_id === id)
  return u ? u.name : (id ? '#' + id : '—')
}

function openImport() {
  importText.value = ''
  importVisible.value = true
}

async function runImport() {
  let rows
  try {
    rows = JSON.parse(importText.value)
  } catch (e) {
    ElMessage({ message: 'Invalid JSON.', type: 'error', plain: true })
    return
  }
  if (!Array.isArray(rows) || !rows.length) {
    ElMessage({ message: 'Provide a non-empty array.', type: 'warning', plain: true })
    return
  }
  importing.value = true
  try {
    const r = await eventsImport(rows)
    importVisible.value = false
    await loadEvents()
    ElMessage({ message: `Imported ${r.created?.length || 0} event(s).`, type: 'success', plain: true })
  } catch (e) {
    ElMessage({ message: e.message || 'Import failed.', type: 'error', plain: true })
  } finally {
    importing.value = false
  }
}

async function loadDirectory() {
  try { const r = await directoryList(); directory.value = r.list || [] } catch (e) { /* ignore */ }
}

function openEventDialog(event = null) {
  if (event) {
    eventForm.value = { ...event }
  } else {
    eventForm.value = {
      id: null, external_event_id: '', name: '', event_date: '', location: '', organizer: '',
      lifecycle: 'planned', venue_partners: '[]', sponsors: '[]', relationship_notes: '',
      related_opportunity_id: null, created_by: null, updated_by: null, version: 1,
      category: '', venue: '', start_time: '', end_time: '', description: '', source: 'manual',
      source_url: '', status: 'planned', assigned_to: null, verification_status: 'unverified'
    }
  }
  eventDialogVisible.value = true
}

async function saveEvent() {
  if (!eventForm.value.name.trim()) {
    ElMessage({ message: 'Event name is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (eventForm.value.id) {
      await eventsUpdate(eventForm.value.id, eventForm.value)
    } else {
      await eventsCreate(eventForm.value)
    }
    eventDialogVisible.value = false
    await loadEvents()
    ElMessage({ message: 'Event saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save event.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editEvent(event) {
  openEventDialog(event)
}

async function deleteEvent(event) {
  if (!await confirm(`Delete event "${event.name}"?`)) return
  try {
    await eventsDelete(event.id)
    await loadEvents()
    ElMessage({ message: 'Event deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete event.', type: 'error', plain: true })
  }
}

onMounted(() => { loadDirectory(); loadEvents() })
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

.import-hint {
  margin: 0 0 10px;
  color: var(--hq-text-secondary);
  font-size: 13px;
}
</style>
