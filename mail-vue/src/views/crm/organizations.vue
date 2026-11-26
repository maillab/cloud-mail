<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>{{ $t('crmOrganizations') }}</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'organizations:add'" type="primary" icon="plus" @click="openOrgDialog">{{ $t('crmNewCompany') }}</el-button>
          <el-button  @click="loadOrganizations" text circle icon="refresh" :aria-label="$t('crmRefresh')" :title="$t('crmRefresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">{{ $t('crmOrganizations') }}</span>
            <el-input
              v-model="search"
              placeholder="Search name, brand, address…"
              clearable
              @update:model-value="debouncedSearch"
            />
            <el-select v-model="typeFilter" :placeholder="$t('crmLeadStatus')" size="small" style="width: 140px">
              <el-option label="All" value="" />
              <el-option label="Organizer" value="organizer" />
              <el-option label="Promoter" value="promoter" />
              <el-option label="Venue" value="venue" />
              <el-option label="Sponsor" value="sponsor" />
              <el-option label="Agency" value="agency" />
              <el-option label="Production Vendor" value="production_vendor" />
              <el-option label="Artist Management" value="artist_management" />
              <el-option label="Supplier" value="supplier" />
              <el-option label="Partner" value="partner" />
            </el-select>
            <el-select v-model="statusFilter" placeholder="Relationship" size="small" style="width: 140px">
              <el-option label="All" value="" />
              <el-option label="Active" value="active" />
              <el-option label="Prospect" value="prospect" />
              <el-option label="Inactive" value="inactive" />
            </el-select>
          </div>
        </template>

        <el-table v-if="organizations.length" :data="organizations" style="width: 100%" @row-dblclick="openOrganization">
          <el-table-column prop="name" label="Name" min-width="200">
            <template #default="scope">{{ scope.row.name }}</template>
          </el-table-column>
          <el-table-column prop="brand_name" label="Brand" min-width="150">
            <template #default="scope">{{ scope.row.brand_name || '—' }}</template>
          </el-table-column>
          <el-table-column prop="organization_type" label="Type" min-width="120">
            <template #default="scope">{{ scope.row.organization_type || '—' }}</template>
          </el-table-column>
          <el-table-column prop="relationship_status" label="Status" min-width="100">
            <template #default="scope">
              <el-tag :type="orgStatusType(scope.row.relationship_status)" size="small">{{ scope.row.relationship_status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="address" label="Address" min-width="180">
            <template #default="scope">{{ scope.row.address || '—' }}</template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="160">
            <template #default="scope">
              <el-button type="text" size="small" @click="openOrganization(scope.row)">Open</el-button>
              <el-button v-perm="'organizations:edit'" type="text" size="small" icon="edit" @click="editOrg(scope.row)" />
              <el-button v-perm="'organizations:delete'" type="text" size="small" icon="delete" @click="deleteOrg(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>{{ $t('crmNoCompanies') }}</p>
          <el-button v-perm="'organizations:add'" type="primary" @click="openOrgDialog">{{ $t('crmAddFirstCompany') }}</el-button>
        </div>
      </el-card>

      <el-dialog v-model="orgDialogVisible" :title="$t('crmNewCompany')" width="560px">
        <el-form :model="orgForm" label-width="120px">
          <el-form-item label="Name" prop="name">
            <el-input v-model="orgForm.name" />
          </el-form-item>
          <el-form-item label="Legal Name" prop="legal_name">
            <el-input v-model="orgForm.legal_name" />
          </el-form-item>
          <el-form-item label="Brand Name" prop="brand_name">
            <el-input v-model="orgForm.brand_name" />
          </el-form-item>
          <el-form-item label="Type" prop="organization_type">
            <el-select v-model="orgForm.organization_type">
              <el-option label="Organizer" value="organizer" />
              <el-option label="Promoter" value="promoter" />
              <el-option label="Venue" value="venue" />
              <el-option label="Sponsor" value="sponsor" />
              <el-option label="Agency" value="agency" />
              <el-option label="Production Vendor" value="production_vendor" />
              <el-option label="Artist Management" value="artist_management" />
              <el-option label="Supplier" value="supplier" />
              <el-option label="Partner" value="partner" />
            </el-select>
          </el-form-item>
          <el-form-item label="Website" prop="website">
            <el-input v-model="orgForm.website" />
          </el-form-item>
          <el-form-item label="Address" prop="address">
            <el-input v-model="orgForm.address" />
          </el-form-item>
          <el-form-item label="Relationship" prop="relationship_status">
            <el-select v-model="orgForm.relationship_status">
              <el-option label="Active" value="active" />
              <el-option label="Prospect" value="prospect" />
              <el-option label="Inactive" value="inactive" />
            </el-select>
          </el-form-item>
          <el-form-item label="Commercial Terms" prop="commercial_terms">
            <el-input v-model="orgForm.commercial_terms" type="textarea" rows="2" />
          </el-form-item>
          <el-form-item label="Relationship owner">
            <el-select v-model="orgForm.assigned_to" clearable filterable placeholder="Choose a team member" style="width:100%">
              <el-option v-for="member in members" :key="member.userId" :label="member.label" :value="member.userId" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="orgDialogVisible = false">{{ $t('crmCancel') }}</el-button>
            <el-button type="primary" :loading="saving" @click="saveOrg">{{ $t('crmSave') }}</el-button>
          </span>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { organizationsList, organizationsCreate, organizationsUpdate, organizationsDelete } from '@/request/organizations.js'
import { useTeamMembers } from '@/composables/use-team-members.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const router = useRouter()
const { members, loadMembers } = useTeamMembers()
const search = ref('')
const typeFilter = ref('')
const statusFilter = ref('')
const organizations = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)

const orgDialogVisible = ref(false)
useCreateIntent(() => openOrgDialog())
const orgForm = ref({
  id: null,
  parent_id: null,
  name: '',
  legal_name: '',
  brand_name: '',
  organization_type: 'partner',
  website: '',
  social_links: '[]',
  address: '',
  relationship_status: 'active',
  commercial_terms: '',
  assigned_to: null,
  created_by: null,
  updated_by: null,
  version: 1
})

const canAdd = computed(() => hasPerm('organizations:add'))
const canEdit = computed(() => hasPerm('organizations:edit'))
const canDelete = computed(() => hasPerm('organizations:delete'))

let searchTimer = null

const debouncedSearch = (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = val
    loadOrganizations()
  }, 300)
}

async function loadOrganizations() {
  loading.value = true
  try {
    const resp = await organizationsList({ page: 1, pageSize: 100, search: search.value || undefined, organization_type: typeFilter.value || undefined, relationship_status: statusFilter.value || undefined })
    organizations.value = resp.list || []
    total.value = resp.total ?? 0
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load organizations.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function orgStatusType(status) {
  const map = { active: 'success', prospect: 'warning', inactive: 'danger' }
  return map[status] || 'info'
}

function openOrgDialog(org = null) {
  if (org) {
    orgForm.value = { ...org }
  } else {
    orgForm.value = { id: null, parent_id: null, name: '', legal_name: '', brand_name: '', organization_type: 'partner', website: '', social_links: '[]', address: '', relationship_status: 'active', commercial_terms: '', assigned_to: null, created_by: null, updated_by: null, version: 1 }
  }
  orgDialogVisible.value = true
}

async function saveOrg() {
  if (!orgForm.value.name.trim()) {
    ElMessage({ message: 'Name is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (orgForm.value.id) {
      await organizationsUpdate(orgForm.value.id, orgForm.value)
    } else {
      await organizationsCreate(orgForm.value)
    }
    orgDialogVisible.value = false
    await loadOrganizations()
    ElMessage({ message: 'Organization saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save organization.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editOrg(org) {
  openOrgDialog(org)
}

function openOrganization(org) {
  router.push({ name: 'crm-organization-detail', params: { id: org.id } })
}

async function deleteOrg(org) {
  if (!await confirm(`Delete organization "${org.name}"?`)) return
  try {
    await organizationsDelete(org.id)
    await loadOrganizations()
    ElMessage({ message: 'Organization deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete organization.', type: 'error', plain: true })
  }
}

onMounted(() => { loadOrganizations(); loadMembers() })
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
