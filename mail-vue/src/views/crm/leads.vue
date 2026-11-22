<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>Leads</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'leads:add'" type="primary" icon="plus" @click="openLeadDialog">New lead</el-button>
          <el-button  @click="loadLeads" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">Sales leads</span>
            <el-input
              v-model="search"
              placeholder="Search name, email, phone, company…"
              clearable
              @update:model-value="debouncedSearch"
            />
            <el-select v-model="statusFilter" placeholder="Status" size="small" style="width: 120px">
              <el-option label="All" value="" />
              <el-option label="New" value="new" />
              <el-option label="Contacted" value="contacted" />
              <el-option label="Qualified" value="qualified" />
              <el-option label="Converted" value="converted" />
              <el-option label="Lost" value="lost" />
            </el-select>
          </div>
        </template>

        <el-table v-if="leads.length" :data="leads" style="width: 100%">
          <el-table-column prop="name" label="Name" min-width="180">
            <template #default="scope">
              <div class="contact-row">
                <span class="contact-avatar">{{ avatarInitial(scope.row.name) }}</span>
                <div>
                  <div class="contact-name">{{ scope.row.name }}</div>
                  <div class="contact-meta" v-if="scope.row.email">{{ scope.row.email }}</div>
                  <div class="contact-meta" v-if="scope.row.phone">{{ scope.row.phone }}</div>
                  <div class="contact-meta" v-if="scope.row.company">{{ scope.row.company }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="source" label="Source" min-width="100">
            <template #default="scope">{{ scope.row.source }}</template>
          </el-table-column>
          <el-table-column prop="status" label="Status" min-width="100">
            <template #default="scope">
              <el-tag :type="leadStatusType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Assignee" min-width="190">
            <template #default="scope">
              <el-select
                v-if="hasPerm('leads:assign')"
                :model-value="scope.row.assignee_id ?? null"
                placeholder="Unassigned"
                filterable
                clearable
                size="small"
                :loading="assigningId === scope.row.id"
                style="width: 100%"
                @change="value => assignLead(scope.row, value)"
              >
                <el-option
                  v-for="member in members"
                  :key="member.userId"
                  :label="member.label"
                  :value="member.userId"
                />
              </el-select>
              <span v-else>{{ scope.row.assignee || 'Unassigned' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="value_cents" label="Value" min-width="120" align="right">
            <template #default="scope">{{ formatMoney(scope.row.value_cents, scope.row.currency) }}</template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="160">
            <template #default="scope">
              <el-button v-perm="'leads:edit'" type="text" size="small" icon="edit" @click="openLeadDialog(scope.row)" />
              <el-button v-perm="'leads:delete'" type="text" size="small" icon="delete" @click="deleteLead(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>No leads yet.</p>
          <el-button v-perm="'leads:add'" type="primary" @click="openLeadDialog">Add your first lead</el-button>
        </div>
      </el-card>

      <el-dialog v-model="leadDialogVisible" title="Lead" width="560px">
        <el-form :model="leadForm" label-width="110px">
          <el-form-item label="Name" prop="name">
            <el-input v-model="leadForm.name" />
          </el-form-item>
          <el-form-item label="Email" prop="email">
            <el-input v-model="leadForm.email" type="email" />
          </el-form-item>
          <el-form-item label="Phone" prop="phone">
            <el-input v-model="leadForm.phone" />
          </el-form-item>
          <el-form-item label="Company" prop="company">
            <el-input v-model="leadForm.company" />
          </el-form-item>
          <el-form-item label="Source" prop="source">
            <el-select v-model="leadForm.source">
              <el-option label="Manual" value="manual" />
              <el-option label="Email" value="email" />
              <el-option label="WhatsApp" value="whatsapp" />
              <el-option label="Referral" value="referral" />
              <el-option label="Website" value="website" />
            </el-select>
          </el-form-item>
          <el-form-item label="Status" prop="status">
            <el-select v-model="leadForm.status">
              <el-option label="New" value="new" />
              <el-option label="Contacted" value="contacted" />
              <el-option label="Qualified" value="qualified" />
              <el-option label="Converted" value="converted" />
              <el-option label="Lost" value="lost" />
            </el-select>
          </el-form-item>
          <el-form-item label="Value (cents)" prop="value_cents">
            <el-input-number v-model="leadForm.value_cents" :min="0" />
          </el-form-item>
          <el-form-item label="Currency" prop="currency">
            <el-select v-model="leadForm.currency">
              <el-option label="KES" value="KES" />
              <el-option label="USD" value="USD" />
              <el-option label="EUR" value="EUR" />
            </el-select>
          </el-form-item>
          <el-form-item label="Assigned to" prop="assigned_to">
            <el-input v-model="leadForm.assigned_to" placeholder="User ID" />
          </el-form-item>
          <el-form-item label="Notes" prop="notes">
            <el-input v-model="leadForm.notes" type="textarea" rows="3" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="leadDialogVisible = false">Cancel</el-button>
              <el-button type="primary" :loading="saving" @click="saveLead">Save lead</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { leadsList, leadsCreate, leadsUpdate, leadsDelete, leadsAssign } from '@/request/leads.js'
import { useTeamMembers } from '@/composables/use-team-members.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const search = ref('')
const statusFilter = ref('')
const leads = ref([])
const { members, loadMembers } = useTeamMembers()
const assigningId = ref(null)
const total = ref(0)
const loading = ref(false)
const saving = ref(false)

const leadDialogVisible = ref(false)
useCreateIntent(() => openLeadDialog())
const leadForm = ref({
  id: null,
  name: '',
  email: '',
  phone: '',
  company: '',
  source: 'manual',
  status: 'new',
  value_cents: 0,
  currency: 'KES',
  notes: '',
  assigned_to: null
})

const canAdd = computed(() => hasPerm('leads:add'))
const canEdit = computed(() => hasPerm('leads:edit'))
const canDelete = computed(() => hasPerm('leads:delete'))

let searchTimer = null

const debouncedSearch = (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = val
    loadLeads()
  }, 300)
}


// Ownership changes are permission-gated and go through the dedicated endpoint so
// the backend can record who handed the lead over and when.
async function assignLead(lead, assigneeId) {
  const previousId = lead.assignee_id ?? null
  const nextId = assigneeId ?? null
  if (previousId === nextId) return
  assigningId.value = lead.id
  try {
    await leadsAssign(lead.id, nextId)
    lead.assignee_id = nextId
    lead.assignee = nextId
      ? (members.value.find((m) => m.userId === nextId)?.label || 'Assigned')
      : null
    ElMessage({ message: 'Lead reassigned.', type: 'success', plain: true })
  } catch (error) {
    lead.assignee_id = previousId
    await loadLeads()
    ElMessage({ message: error.message || 'Failed to reassign lead.', type: 'error', plain: true })
  } finally {
    assigningId.value = null
  }
}

async function loadLeads() {
  loading.value = true
  try {
    const resp = await leadsList({ page: 1, pageSize: 100, search: search.value || undefined, status: statusFilter.value || undefined })
    leads.value = resp.list || []
    total.value = resp.total ?? 0
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load leads.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function avatarInitial(name) {
  return String(name || '?').trim()[0]?.toUpperCase() || '?'
}

function formatMoney(cents, currency = 'KES') {
  if (cents == null) return '—'
  const amount = (Number(cents) / 100).toFixed(2)
  return `${currency} ${amount}`
}

function leadStatusType(status) {
  const map = { new: 'info', contacted: 'warning', qualified: 'primary', converted: 'success', lost: 'danger' }
  return map[status] || 'info'
}

function openLeadDialog(lead = null) {
  if (lead) {
    leadForm.value = { ...lead }
  } else {
    leadForm.value = { id: null, name: '', email: '', phone: '', company: '', source: 'manual', status: 'new', value_cents: 0, currency: 'KES', notes: '', assigned_to: null }
  }
  leadDialogVisible.value = true
}

async function saveLead() {
  if (!leadForm.value.name.trim()) {
    ElMessage({ message: 'Name is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (leadForm.value.id) {
      await leadsUpdate(leadForm.value.id, leadForm.value)
    } else {
      await leadsCreate(leadForm.value)
    }
    leadDialogVisible.value = false
    await loadLeads()
    ElMessage({ message: 'Lead saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save lead.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function deleteLead(lead) {
  if (!await confirm(`Delete lead "${lead.name}"?`)) return
  try {
    await leadsDelete(lead.id)
    await loadLeads()
    ElMessage({ message: 'Lead deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete lead.', type: 'error', plain: true })
  }
}

onMounted(() => {
  loadLeads()
  loadMembers()
})
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

.contact-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.contact-avatar {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 50%;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-size: 12px;
  font-weight: 700;
}

.contact-name {
  font-weight: 600;
  color: var(--hq-text);
}

.contact-meta {
  font-size: 11px;
  color: var(--hq-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
