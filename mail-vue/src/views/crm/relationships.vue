<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>{{ $t('crmRelationships') }}</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'contact-organizations:add'" type="primary" icon="plus" @click="openDialog">{{ $t('crmLinkContact') }}</el-button>
          <el-button  @click="loadRelationships" text circle icon="refresh" :aria-label="$t('crmRefresh')" :title="$t('crmRefresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">{{ $t('crmRelationships') }}</span>
            <el-select v-model="contactFilter" :placeholder="$t('crmContact')" size="small" style="width: 160px">
              <el-option label="All" value="" />
              <el-option v-for="c in contacts" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-select v-model="orgFilter" :placeholder="$t('crmCompany')" size="small" style="width: 160px">
              <el-option label="All" value="" />
              <el-option v-for="o in organizations" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </div>
        </template>

        <el-table v-if="relationships.length" :data="relationships" style="width: 100%">
          <el-table-column prop="contact_name" label="Contact" min-width="200">
            <template #default="scope">{{ scope.row.contact_name || scope.row.contact_id }}</template>
          </el-table-column>
          <el-table-column prop="organization_name" label="Organization" min-width="200">
            <template #default="scope">{{ scope.row.organization_name || scope.row.organization_id }}</template>
          </el-table-column>
          <el-table-column prop="role" label="Role" min-width="140">
            <template #default="scope">{{ scope.row.role || '—' }}</template>
          </el-table-column>
          <el-table-column prop="is_primary" label="Primary" min-width="100">
            <template #default="scope">
              <el-tag :type="scope.row.is_primary ? 'success' : 'info'" size="small">{{ scope.row.is_primary ? 'Yes' : 'No' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="160">
            <template #default="scope">
              <el-button v-perm="'contact-organizations:edit'" type="text" size="small" icon="edit" @click="editRelationship(scope.row)" />
              <el-button v-perm="'contact-organizations:delete'" type="text" size="small" icon="delete" @click="deleteRelationship(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>{{ $t('crmNoRelationships') }}</p>
          <el-button v-perm="'contact-organizations:add'" type="primary" @click="openDialog">{{ $t('crmLinkFirstContact') }}</el-button>
        </div>
      </el-card>

      <el-dialog v-model="dialogVisible" :title="$t('crmLinkContact')" width="560px">
        <el-form :model="form" label-width="120px">
          <el-form-item label="Contact" prop="contact_id">
            <el-select v-model="form.contact_id" placeholder="Select contact">
              <el-option v-for="c in contacts" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Organization" prop="organization_id">
            <el-select v-model="form.organization_id" placeholder="Select organization">
              <el-option v-for="o in organizations" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Role" prop="role">
            <el-select v-model="form.role">
              <el-option label="Decision Maker" value="Decision Maker" />
              <el-option label="Influencer" value="Influencer" />
              <el-option label="User" value="User" />
              <el-option label="Gatekeeper" value="Gatekeeper" />
              <el-option label="Champion" value="Champion" />
            </el-select>
          </el-form-item>
          <el-form-item label="Primary" prop="is_primary">
            <el-switch v-model="form.is_primary" active-text="Yes" inactive-text="No" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="dialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="saving" @click="save">{{ $t('crmSave') }}</el-button>
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
import { contactOrganizationsList, contactOrganizationsCreate, contactOrganizationsUpdate, contactOrganizationsDelete } from '@/request/contact-organizations.js'
import { contactsList } from '@/request/contacts.js'
import { organizationsList } from '@/request/organizations.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const contactFilter = ref('')
const orgFilter = ref('')
const relationships = ref([])
const contacts = ref([])
const organizations = ref([])
const loading = ref(false)
const saving = ref(false)

const dialogVisible = ref(false)
const form = ref({
  id: null,
  contact_id: null,
  organization_id: null,
  role: '',
  is_primary: 0
})

let reloadTimer = null

async function loadRelationships() {
  loading.value = true
  try {
    const resp = await contactOrganizationsList({ contact_id: contactFilter.value || undefined, organization_id: orgFilter.value || undefined })
    relationships.value = resp || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load relationships.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function loadReferenceData() {
  const [cResp, oResp] = await Promise.all([
    contactsList({ page: 1, pageSize: 200 }),
    organizationsList({ page: 1, pageSize: 200 })
  ])
  contacts.value = cResp.list || []
  organizations.value = oResp.list || []
}

function openDialog(rel = null) {
  if (rel) {
    form.value = { ...rel }
  } else {
    form.value = { id: null, contact_id: null, organization_id: null, role: '', is_primary: 0 }
  }
  dialogVisible.value = true
}

async function save() {
  if (!form.value.contact_id || !form.value.organization_id) {
    ElMessage({ message: 'Contact and organization are both required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (form.value.id) {
      await contactOrganizationsUpdate(form.value.id, form.value)
    } else {
      await contactOrganizationsCreate(form.value)
    }
    dialogVisible.value = false
    await loadRelationships()
    ElMessage({ message: 'Relationship saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save relationship.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editRelationship(rel) {
  openDialog(rel)
}

async function deleteRelationship(rel) {
  if (!await confirm(`Remove relationship "${rel.contact_name || rel.contact_id}" -> "${rel.organization_name || rel.organization_id}"?`)) return
  try {
    await contactOrganizationsDelete(rel.id)
    await loadRelationships()
    ElMessage({ message: 'Relationship removed.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to remove relationship.', type: 'error', plain: true })
  }
}

onMounted(() => {
  loadReferenceData()
  loadRelationships()
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
