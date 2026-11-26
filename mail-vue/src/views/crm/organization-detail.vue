<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>{{ organization ? organization.name : $t('crmOrganizationDetail') }}</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'organizations:edit'" type="primary" icon="edit" @click="editOrganization">{{ $t('crmEdit') }}</el-button>
          <el-button v-perm="'organizations:delete'" type="text" icon="delete" @click="deleteOrganization">{{ $t('crmDelete') }}</el-button>
          <el-button icon="arrow-left" @click="goBack">{{ $t('crmBackToOrganizations') }}</el-button>
        </div>
      </div>

      <el-card v-if="organization" class="crm-card detail-card">
        <div class="detail-header">
          <div class="detail-avatar">{{ avatarInitial(organization.name) }}</div>
          <div class="detail-info">
            <h2 class="detail-name">{{ organization.name }}</h2>
            <div class="detail-meta" v-if="organization.legal_name">{{ organization.legal_name }}</div>
            <div class="detail-meta" v-if="organization.brand_name">{{ $t('crmBrand') }}: {{ organization.brand_name }}</div>
            <div class="detail-meta" v-if="organization.organization_type">{{ $t('crmType') }}: {{ organization.organization_type }}</div>
            <div class="detail-meta" v-if="organization.address">{{ organization.address }}</div>
            <div class="detail-meta" v-if="organization.website">{{ organization.website }}</div>
            <el-tag :type="orgStatusType(organization.relationship_status)" size="small">{{ organization.relationship_status }}</el-tag>
          </div>
        </div>

        <el-tabs v-model="activeTab" class="detail-tabs">
          <el-tab-pane :label="$t('crmOverview')" name="overview">
            <div class="detail-grid">
              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmContacts') }}</div>
                </template>
                <div v-if="linkedContacts.length" class="section-content">
                  <div v-for="ct in linkedContacts" :key="ct.id" class="contact-link-row">
                    <span class="contact-name">{{ ct.name }}</span>
                    <span class="contact-role">{{ ct.role || '—' }}</span>
                    <el-button v-perm="'contact-organizations:delete'" type="text" size="small" icon="delete" @click="unlinkContact(ct)" />
                  </div>
                </div>
                <div v-else class="section-content empty">{{ $t('crmNoContactsLinked') }}</div>
                <div v-if="canLinkContact" class="section-actions">
                  <el-button type="primary" size="small" icon="plus" @click="openLinkContactDialog">{{ $t('crmLinkContact') }}</el-button>
                </div>
              </el-card>

              <el-card class="detail-section">
                <template #header>
                  <div class="section-title">{{ $t('crmMetadata') }}</div>
                </template>
                <div class="section-content">
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmLegalName') }}</span>
                    <span class="meta-value">{{ organization.legal_name || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmBrand') }}</span>
                    <span class="meta-value">{{ organization.brand_name || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmType') }}</span>
                    <span class="meta-value">{{ organization.organization_type || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmStatus') }}</span>
                    <span class="meta-value">{{ organization.relationship_status || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmWebsite') }}</span>
                    <span class="meta-value">{{ organization.website || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmAddress') }}</span>
                    <span class="meta-value">{{ organization.address || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmCommercialTerms') }}</span>
                    <span class="meta-value">{{ organization.commercial_terms || '—' }}</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-label">{{ $t('crmCreated') }}</span>
                    <span class="meta-value">{{ formatDate(organization.create_time) }}</span>
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
                  <el-button v-perm="'deals:add'" type="text" size="small" icon="plus" @click="openNewDeal">{{ $t('crmNewDeal') }}</el-button>
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
              </el-table>
              <div v-else class="empty-state">{{ $t('crmNoRelatedDeals') }}</div>
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
              <el-table v-if="orgActivities.length" :data="orgActivities" style="width: 100%">
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

      <el-dialog v-model="editDialogVisible" :title="$t('crmEditOrganization')" width="560px">
        <el-form :model="editForm" label-width="120px">
          <el-form-item :label="$t('crmName')" prop="name">
            <el-input v-model="editForm.name" />
          </el-form-item>
          <el-form-item :label="$t('crmLegalName')" prop="legal_name">
            <el-input v-model="editForm.legal_name" />
          </el-form-item>
          <el-form-item :label="$t('crmBrand')" prop="brand_name">
            <el-input v-model="editForm.brand_name" />
          </el-form-item>
          <el-form-item :label="$t('crmType')" prop="organization_type">
            <el-select v-model="editForm.organization_type">
              <el-option label="Organizer" value="organizer" />
              <el-option label="Promoter" value="promoter" />
              <el-option label="Venue" value="venue" />
              <el-option label="Sponsor" value="sponsor" />
              <el-option label="Agency" value="agency" />
              <el-option label="Partner" value="partner" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmWebsite')" prop="website">
            <el-input v-model="editForm.website" />
          </el-form-item>
          <el-form-item :label="$t('crmAddress')" prop="address">
            <el-input v-model="editForm.address" />
          </el-form-item>
          <el-form-item :label="$t('crmStatus')" prop="relationship_status">
            <el-select v-model="editForm.relationship_status">
              <el-option label="Active" value="active" />
              <el-option label="Prospect" value="prospect" />
              <el-option label="Inactive" value="inactive" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmCommercialTerms')" prop="commercial_terms">
            <el-input v-model="editForm.commercial_terms" type="textarea" rows="2" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="editDialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="saving" @click="saveOrganization">{{ $t('crmSave') }}</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>

      <el-dialog v-model="linkContactDialogVisible" :title="$t('crmLinkContact')" width="520px">
        <el-form :model="linkContactForm" label-width="110px">
          <el-form-item :label="$t('crmContact')" prop="contact_id">
            <el-select v-model="linkContactForm.contact_id" placeholder="Select contact">
              <el-option v-for="c in allContacts" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('crmPosition')" prop="role">
            <el-select v-model="linkContactForm.role">
              <el-option label="Decision Maker" value="Decision Maker" />
              <el-option label="Influencer" value="Influencer" />
              <el-option label="User" value="User" />
              <el-option label="Gatekeeper" value="Gatekeeper" />
              <el-option label="Champion" value="Champion" />
            </el-select>
          </el-form-item>
          <el-form-item label="Primary" prop="is_primary">
            <el-switch v-model="linkContactForm.is_primary" active-text="Yes" inactive-text="No" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="linkContactDialogVisible = false">{{ $t('crmCancel') }}</el-button>
              <el-button type="primary" :loading="linking" @click="linkContact">{{ $t('crmSave') }}</el-button>
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
import { organizationsGet, organizationsUpdate } from '@/request/organizations.js'
import { contactsList } from '@/request/contacts.js'
import { dealsList } from '@/request/deals.js'
import { activitiesList, activitiesCreate } from '@/request/activities.js'
import { contactOrganizationsList, contactOrganizationsCreate, contactOrganizationsDelete } from '@/request/contact-organizations.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const router = useRouter()
const route = useRoute()

const organization = ref(null)
const deals = ref([])
const linkedContacts = ref([])
const allContacts = ref([])
const orgActivities = ref([])

const activeTab = ref('overview')

const editDialogVisible = ref(false)
const linkContactDialogVisible = ref(false)
const activityDialogVisible = ref(false)

const editForm = ref({
  name: '', legal_name: '', brand_name: '', organization_type: 'partner',
  website: '', address: '', relationship_status: 'active', commercial_terms: ''
})

const linkContactForm = ref({
  contact_id: null,
  role: '',
  is_primary: 0
})

const activityForm = ref({
  entity_type: 'organization',
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

const canEdit = computed(() => hasPerm('organizations:edit'))
const canDelete = computed(() => hasPerm('organizations:delete'))
const canLinkContact = computed(() => hasPerm('contact-organizations:add'))
const canAddDeal = computed(() => hasPerm('deals:add'))
const canAddActivity = computed(() => hasPerm('activities:add'))

async function loadOrganization() {
  const id = route.params.id
  if (!id) return
  loading.value = true
  try {
    const [orgResp, contactsResp, dealsResp, activitiesResp, linksResp, allContactsResp] = await Promise.all([
      organizationsGet(id),
      contactsList({ page: 1, pageSize: 200 }),
      dealsList({ page: 1, pageSize: 100 }),
      activitiesList({ page: 1, pageSize: 100, entity_type: 'organization', entity_id: Number(id) }),
      contactOrganizationsList({ organization_id: Number(id) }),
      contactsList({ page: 1, pageSize: 200 })
    ])

    organization.value = orgResp || null

    allContacts.value = allContactsResp.list || []
    deals.value = (dealsResp.list || []).filter(d => String(d.company_id) === String(id))
    orgActivities.value = activitiesResp.list || []

    const links = linksResp || []
    linkedContacts.value = links.map(link => {
      const contact = allContacts.value.find(c => String(c.id) === String(link.contact_id))
      return {
        id: link.contact_id,
        name: contact ? contact.name : 'Unknown',
        role: link.role,
        linkId: link.id,
        isPrimary: link.is_primary
      }
    })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load organization.', type: 'error', plain: true })
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

function orgStatusType(status) {
  const map = { active: 'success', prospect: 'warning', inactive: 'danger' }
  return map[status] || 'info'
}

function goBack() {
  router.push({ name: 'crm-organizations' })
}

function editOrganization() {
  if (!organization.value) return
  editForm.value = {
    name: organization.value.name || '',
    legal_name: organization.value.legal_name || '',
    brand_name: organization.value.brand_name || '',
    organization_type: organization.value.organization_type || 'partner',
    website: organization.value.website || '',
    address: organization.value.address || '',
    relationship_status: organization.value.relationship_status || 'active',
    commercial_terms: organization.value.commercial_terms || ''
  }
  editDialogVisible.value = true
}

async function saveOrganization() {
  saving.value = true
  try {
    await organizationsUpdate(organization.value.id, editForm.value)
    editDialogVisible.value = false
    await loadOrganization()
    ElMessage({ message: 'Organization updated.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to update organization.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function deleteOrganization() {
  if (!organization.value) return
  if (!await confirm(`Delete organization "${organization.value.name}"?`)) return
  try {
    const { organizationsDelete } = await import('@/request/organizations.js')
    await organizationsDelete(organization.value.id)
    goBack()
    ElMessage({ message: 'Organization deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete organization.', type: 'error', plain: true })
  }
}

function openNewDeal() {
  if (!organization.value) return
  router.push({ name: 'crm-deals', query: { company_id: organization.value.id } })
}

function openLinkContactDialog() {
  linkContactDialogVisible.value = true
}

async function linkContact() {
  if (!linkContactForm.value.contact_id) return
  linking.value = true
  try {
    await contactOrganizationsCreate({
      contact_id: linkContactForm.value.contact_id,
      organization_id: Number(organization.value.id),
      role: linkContactForm.value.role || '',
      is_primary: linkContactForm.value.is_primary ? 1 : 0
    })
    linkContactDialogVisible.value = false
    await loadOrganization()
    ElMessage({ message: 'Contact linked.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to link contact.', type: 'error', plain: true })
  } finally {
    linking.value = false
  }
}

async function unlinkContact(ct) {
  if (!await confirm(`Unlink "${ct.name}" from this organization?`)) return
  try {
    await contactOrganizationsDelete(ct.linkId)
    await loadOrganization()
    ElMessage({ message: 'Contact unlinked.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to unlink contact.', type: 'error', plain: true })
  }
}

function openNewActivity() {
  if (!organization.value) return
  activityForm.value = {
    entity_type: 'organization',
    entity_id: Number(organization.value.id),
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
    await loadOrganization()
    ElMessage({ message: 'Activity recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to record activity.', type: 'error', plain: true })
  } finally {
    activitySaving.value = false
  }
}

onMounted(loadOrganization)
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
  min-width: 0;
  overflow: hidden;
  color: var(--hq-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-link-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--hq-border);
  font-size: 13px;
}

.contact-name {
  font-weight: 600;
  color: var(--hq-text);
}

.contact-role {
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
