<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>Companies (legacy)</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'companies:add'" type="primary" icon="plus" @click="openCompanyDialog">New company</el-button>
          <el-button  @click="loadCompanies" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">Companies</span>
            <el-input
              v-model="search"
              placeholder="Search name, domain…"
              clearable
              @update:model-value="debouncedSearch"
            />
          </div>
        </template>

        <el-table v-if="companies.length" :data="companies" style="width: 100%">
          <el-table-column prop="name" label="Name" min-width="200">
            <template #default="scope">{{ scope.row.name }}</template>
          </el-table-column>
          <el-table-column prop="domain" label="Domain" min-width="150">
            <template #default="scope">{{ scope.row.domain || '—' }}</template>
          </el-table-column>
          <el-table-column prop="industry" label="Industry" min-width="120">
            <template #default="scope">{{ scope.row.industry || '—' }}</template>
          </el-table-column>
          <el-table-column prop="phone" label="Phone" min-width="130">
            <template #default="scope">{{ scope.row.phone || '—' }}</template>
          </el-table-column>
          <el-table-column prop="website" label="Website" min-width="150">
            <template #default="scope">{{ scope.row.website || '—' }}</template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="140">
            <template #default="scope">
              <el-button v-perm="'companies:edit'" type="text" size="small" icon="edit" @click="editCompany(scope.row)" />
              <el-button v-perm="'companies:delete'" type="text" size="small" icon="delete" @click="deleteCompany(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>No companies yet.</p>
          <el-button v-perm="'companies:add'" type="primary" @click="openCompanyDialog">Add your first company</el-button>
        </div>
      </el-card>

      <el-dialog v-model="companyDialogVisible" title="Company" width="520px">
        <el-form :model="companyForm" label-width="100px">
          <el-form-item label="Name" prop="name">
            <el-input v-model="companyForm.name" />
          </el-form-item>
          <el-form-item label="Domain" prop="domain">
            <el-input v-model="companyForm.domain" />
          </el-form-item>
          <el-form-item label="Industry" prop="industry">
            <el-input v-model="companyForm.industry" />
          </el-form-item>
          <el-form-item label="Address" prop="address">
            <el-input v-model="companyForm.address" />
          </el-form-item>
          <el-form-item label="Phone" prop="phone">
            <el-input v-model="companyForm.phone" />
          </el-form-item>
          <el-form-item label="Website" prop="website">
            <el-input v-model="companyForm.website" />
          </el-form-item>
          <el-form-item label="Notes" prop="notes">
            <el-input v-model="companyForm.notes" type="textarea" rows="3" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="companyDialogVisible = false">Cancel</el-button>
              <el-button type="primary" :loading="saving" @click="saveCompany">Save company</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { companiesList, companiesCreate, companiesUpdate, companiesDelete } from '@/request/companies.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const search = ref('')
const companies = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)

const companyDialogVisible = ref(false)
const companyForm = ref({
  id: null,
  name: '',
  domain: '',
  industry: '',
  address: '',
  phone: '',
  website: '',
  notes: ''
})

const canAdd = computed(() => hasPerm('companies:add'))
const canEdit = computed(() => hasPerm('companies:edit'))
const canDelete = computed(() => hasPerm('companies:delete'))

let searchTimer = null

const debouncedSearch = (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = val
    loadCompanies()
  }, 300)
}

async function loadCompanies() {
  loading.value = true
  try {
    const resp = await companiesList({ page: 1, pageSize: 100, search: search.value || undefined })
    companies.value = resp.list || []
    total.value = resp.total ?? 0
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load companies.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function openCompanyDialog(company = null) {
  if (company) {
    companyForm.value = { ...company }
  } else {
    companyForm.value = { id: null, name: '', domain: '', industry: '', address: '', phone: '', website: '', notes: '' }
  }
  companyDialogVisible.value = true
}

async function saveCompany() {
  if (!companyForm.value.name.trim()) {
    ElMessage({ message: 'Name is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (companyForm.value.id) {
      await companiesUpdate(companyForm.value.id, companyForm.value)
    } else {
      await companiesCreate(companyForm.value)
    }
    companyDialogVisible.value = false
    await loadCompanies()
    ElMessage({ message: 'Company saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save company.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editCompany(company) {
  openCompanyDialog(company)
}

async function deleteCompany(company) {
  if (!await confirm(`Delete company "${company.name}"?`)) return
  try {
    await companiesDelete(company.id)
    await loadCompanies()
    ElMessage({ message: 'Company deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete company.', type: 'error', plain: true })
  }
}
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