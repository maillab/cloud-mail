<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>{{ $t('crmContactDetail') }}</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'contacts:edit'" type="primary" icon="edit" @click="editContact">{{ $t('crmEdit') }}</el-button>
          <el-button v-perm="'contacts:delete'" type="text" icon="delete" @click="deleteContact">{{ $t('crmDelete') }}</el-button>
          <el-button icon="arrow-left" @click="goBack">{{ $t('crmBackToContacts') }}</el-button>
        </div>
      </div>

      <el-card v-if="contact" class="crm-card detail-card">
        <div class="detail-header">
          <div class="detail-avatar">{{ avatarInitial(contact.name) }}</div>
          <div class="detail-info">
            <h2 class="detail-name">{{ contact.name }}</h2>
            <div class="detail-meta" v-if="contact.email">{{ contact.email }}</div>
            <div class="detail-meta" v-if="contact.phone">{{ contact.phone }}</div>
            <div class="detail-meta" v-if="contact.address">{{ contact.address }}</div>
            <div class="detail-source">
              <el-tag size="small">{{ contact.source }}</el-tag>
            </div>
          </div>
        </div>

        <el-tabs v-model="activeTab" class="detail-tabs">
          <el-tab-pane :label="$t('crmOverview')" name="overview">
            <div class="detail-grid">
              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmOrganization') }}</div>
                </template>
                <div v-if="linkedOrganizations.length" class="section-content">
                  <div v-for="org in linkedOrganizations" :key="org.id" class="org-link-row">
                    <span class="org-name">{{ org.name }}</span>
                    <span class="org-role">{{ org.role || '—' }}</span>
                    <el-button v-perm="'contact-organizations:delete'" type="text" size="small" icon="delete" @click="unlinkOrganization(org)" />
                  </div>
                </div>
                <div v-else class="section-content empty">{{ $t('crmNoCompanyLinked') }}</div>
                <div v-if="canLinkOrg" class="section-actions">
                  <el-button type="primary" size="small" icon="plus" @click="openLinkOrgDialog">{{ $t('crmLinkOrganization') }}</el-button>
                </div>
              </el-card>

              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmNotes') }}</div>
                </template>
                <div class="section-content">{{ contact.notes || $t('crmNoNotes') }}</div>
              </el-card>

              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmTags') }}</div>
                </template>
                <div class="section-content">
                  <el-tag
                    v-for="tag in contact.tags"
                    :key="tag"
                    effect="plain"
                    size="small"
                    >{{ tag }}</el-tag
                  >
                  <span v-if="!contact.tags?.length" class="empty">{{ $t('crmNoTags') }}</span>
                </div>
              </el-card>

              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmMetadata') }}</div>
                </template>
                <div class="section-content">
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmSource') }}</span>
                    <span class="meta-value">{{ contact.source }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmCreated') }}</span>
                    <span class="meta-value">{{ formatDate(contact.create_time) }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmUpdatedAt') }}</span>
                    <span class="meta-value">{{ formatDate(contact.update_time) }}</span>
                  </div>
                  <div class="meta-row" v-if="contact.assigned_to">
                    <span class="meta-label">{{ $t('crmAssignedTo') }}</span>
                    <span class="meta-value">User #{{ contact.assigned_to }}</span>
                  </div>
                </div>
              </el-card>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="$t('crmRelatedDeals')" name="deals">
            <el-card class="crm-card">
              <template #header>
                <div class="card-header">
                  <span class="card-label">{{ $t('crmRelatedDeals') }}</span>
                  <el-button v-perm="'deals:add'" type="text" size="small" icon="plus" @click="openNewDeal">{{ $t('crmNewDealFromContact') }}</el-button>
                </div>
              </template>
              <el-table v-if="deals.length" :data="deals" style="width: 100%">
                <el-table-column prop="title" :label="$t('crmDeal')" min-width="200">
                  <template #default="scope">{{ scope.row.title }}</template>
                </el-table-column>
                <el-table-column prop="value_cents" :label="$t('crmDealValue')" min-width="120" align="right">
                  <template #default="scope">{{ formatMoney(scope.row.value_cents, scope.row.currency) }}</template>
                </el-table-column>
                <el-table-column prop="status" :label="$t('crmStatus')" min-width="100">
                  <template #default="scope">
                    <el-tag :type="statusType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="expected_close_date" :label="$t('crmExpectedClose')" min-width="140">
                  <template #default="scope">{{ scope.row.expected_close_date ? scope.row.expected_close_date.slice(0, 10) : '—' }}</template>
                </el-table-column>
              </el-table>
              <div v-else class="empty-state">{{ $t('crmNoRelatedDeals') }}</div>
            </el-card>
          </el-tab-pane>

          <el-tab-pane :label="$t('crmRelatedTasks')" name="tasks">
            <el-card class="crm-card">
              <template #header>
                <div class="card-header">
                  <span class="card-label">{{ $t('crmRelatedTasks') }}</span>
                  <el-button v-perm="'tasks:add'" type="text" size="small" icon="plus" @click="openNewTask">{{ $t('crmNewTaskFromContact') }}</el-button>
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
              <el-table v-if="contactActivities.length" :data="contactActivities" style="width: 100%">
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

      <el-dialog v-model="editDialogVisible" :title="$t('crmEditContact')" width="520px">
        <el-form :model="editForm" label-width="100px">
          <el-form-item :label="$t('crmName')" prop="name">
            <el-input v-model="editForm.name" />
          </el-form-item>
          <el-form-item :label="$t('crmEmail')" prop="email">
            <el-input v-model="editForm.email" type="email" />
          </el-form-item>
          <el-form-item :label="$t('crmPhone')" prop="phone">
            <el-input v-model="editForm.phone" />
          </el-form-item>
          <el-form-item :label="$t('crmAddress')" prop="address">
            <el-input v-model="editForm.address" />
          </el-form-item>
          <el-form-item :label="$t('crmSource')" prop="source">
            <el-select v-model="editForm.source">
              <el-option label="Manual" value="manual" />
              <el-option label="Email" value="email" />
              <el-option label="WhatsApp" value="whatsapp" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmNotesLabel')" prop="notes">
            <el-input v-model="editForm.notes" type="textarea" rows="3" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="editDialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="saving" @click="saveContact">{{ $t('crmSave') }}</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>

      <el-dialog v-model="linkOrgDialogVisible" :title="$t('crmLinkOrganization')" width="520px">
        <el-form :model="linkOrgForm" label-width="110px">
          <el-form-item :label="$t('crmOrganization')" prop="organization_id">
            <el-select v-model="linkOrgForm.organization_id" placeholder="Select organization">
              <el-option v-for="o in allOrganizations" :key="o.id" :label="o.name" :value="o.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmPosition')" prop="role">
            <el-select v-model="linkOrgForm.role">
              <el-option label="Decision Maker" value="Decision Maker" />
              <el-option label="Influencer" value="Influencer" />
              <el-option label="User" value="User" />
              <el-option label="Gatekeeper" value="Gatekeeper" />
              <el-option label="Champion" value="Champion" />
            </el-select>
          </el-form-item>
          <el-form-item label="Primary" prop="is_primary">
            <el-switch v-model="linkOrgForm.is_primary" active-text="Yes" inactive-text="No" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="linkOrgDialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="linking" @click="linkOrganization">{{ $t('crmSave') }}</el-button>
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
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { contactsGet, contactsUpdate } from '@/request/contacts.js'
import { dealsList } from '@/request/deals.js'
import { tasksList } from '@/request/tasks.js'
import { activitiesList, activitiesCreate } from '@/request/activities.js'
import { contactOrganizationsList, contactOrganizationsCreate, contactOrganizationsDelete } from '@/request/contact-organizations.js'
import { organizationsList } from '@/request/organizations.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const router = useRouter()
const route = useRoute()

const contact = ref(null)
const deals = ref([])
const tasks = ref([])
const linkedOrganizations = ref([])
const allOrganizations = ref([])
const contactActivities = ref([])

const activeTab = ref('overview')

const editDialogVisible = ref(false)
const linkOrgDialogVisible = ref(false)
const activityDialogVisible = ref(false)

const editForm = ref({
  name: '', email: '', phone: '', address: '', source: 'manual', notes: ''
})

const linkOrgForm = ref({
  organization_id: null,
  role: '',
  is_primary: 0
})

const activityForm = ref({
  entity_type: 'contact',
  entity_id: 0,
  activity_type: 'call',
  subject: '',
  description: '',
  occurred_at: ''
})

const saving = ref(false)
const linking = ref(false)
const activitySaving = ref(false)
const loading = ref(false)

const canEdit = computed(() => hasPerm('contacts:edit'))
const canDelete = computed(() => hasPerm('contacts:delete'))
const canLinkOrg = computed(() => hasPerm('contact-organizations:add'))
const canAddDeal = computed(() => hasPerm('deals:add'))
const canAddTask = computed(() => hasPerm('tasks:add'))
const canAddActivity = computed(() => hasPerm('activities:add'))

async function loadContact() {
  const id = route.params.id
  if (!id) return
  loading.value = true
  try {
    const [contactResp, dealsResp, tasksResp, activitiesResp, orgsResp, allOrgsResp] = await Promise.all([
      contactsGet(id),
      dealsList({ page: 1, pageSize: 100 }),
      tasksList({ page: 1, pageSize: 100 }),
      activitiesList({ page: 1, pageSize: 100, entity_type: 'contact', entity_id: Number(id) }),
      contactOrganizationsList({ contact_id: Number(id) }),
      organizationsList({ page: 1, pageSize: 200 })
    ])

    contact.value = contactResp || null

    deals.value = (dealsResp.list || []).filter(d => String(d.contact_id) === String(id))
    tasks.value = (tasksResp.list || []).filter(t => String(t.contact_id) === String(id))
    contactActivities.value = activitiesResp.list || []
    allOrganizations.value = allOrgsResp.list || []

    const orgLinks = orgsResp || []
    linkedOrganizations.value = orgLinks.map(link => {
      const org = allOrganizations.value.find(o => String(o.id) === String(link.organization_id))
      return {
        id: link.organization_id,
        name: org ? org.name : 'Unknown',
        role: link.role,
        linkId: link.id,
        isPrimary: link.is_primary
      }
    })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load contact.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString()
}

function avatarInitial(name) {
  return String(name || '?').trim()[0]?.toUpperCase() || '?'
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

function taskStatusType(status) {
  const map = { pending: 'warning', in_progress: 'info', completed: 'success' }
  return map[status] || 'info'
}

function goBack() {
  router.push({ name: 'crm-contacts' })
}

function editContact() {
  if (!contact.value) return
  editForm.value = {
    name: contact.value.name || '',
    email: contact.value.email || '',
    phone: contact.value.phone || '',
    address: contact.value.address || '',
    source: contact.value.source || 'manual',
    notes: contact.value.notes || ''
  }
  editDialogVisible.value = true
}

async function saveContact() {
  saving.value = true
  try {
    await contactsUpdate(contact.value.id, editForm.value)
    editDialogVisible.value = false
    await loadContact()
    ElMessage({ message: 'Contact updated.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to update contact.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function deleteContact() {
  if (!contact.value) return
  if (!await confirm(`Delete contact "${contact.value.name}"?`)) return
  try {
    // Import dynamically to avoid circular issues
    const { contactsDelete } = await import('@/request/contacts.js')
    await contactsDelete(contact.value.id)
    goBack()
    ElMessage({ message: 'Contact deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete contact.', type: 'error', plain: true })
  }
}

function openNewDeal() {
  if (!contact.value) return
  router.push({ name: 'crm-deals', query: { contact_id: contact.value.id } })
}

function openNewTask() {
  if (!contact.value) return
  router.push({ name: 'crm-tasks', query: { contact_id: contact.value.id } })
}

function openLinkOrgDialog() {
  linkOrgDialogVisible.value = true
}

async function linkOrganization() {
  if (!linkOrgForm.value.organization_id) return
  linking.value = true
  try {
    await contactOrganizationsCreate({
      contact_id: Number(contact.value.id),
      organization_id: linkOrgForm.value.organization_id,
      role: linkOrgForm.value.role || '',
      is_primary: linkOrgForm.value.is_primary ? 1 : 0
    })
    linkOrgDialogVisible.value = false
    await loadContact()
    ElMessage({ message: 'Organization linked.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to link organization.', type: 'error', plain: true })
  } finally {
    linking.value = false
  }
}

async function unlinkOrganization(org) {
  if (!await confirm(`Unlink "${org.name}" from this contact?`)) return
  try {
    await contactOrganizationsDelete(org.linkId)
    await loadContact()
    ElMessage({ message: 'Organization unlinked.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to unlink organization.', type: 'error', plain: true })
  }
}

function openNewActivity() {
  if (!contact.value) return
  activityForm.value = {
    entity_type: 'contact',
    entity_id: Number(contact.value.id),
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
    await loadContact()
    ElMessage({ message: 'Activity recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to record activity.', type: 'error', plain: true })
  } finally {
    activitySaving.value = false
  }
}

onMounted(loadContact)
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

.detail-source {
  margin-top: 12px;
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

.section-actions {
  margin-top: 12px;
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
  color: var(--hq-text);
}

.org-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--hq-border);
  font-size: 13px;
}

.org-name {
  font-weight: 600;
  color: var(--hq-text);
}

.org-role {
  color: var(--hq-text-secondary);
  font-size: 12px;
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
