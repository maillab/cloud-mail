<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>People &amp; organizations</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'contacts:add'" type="primary" icon="plus" @click="openContactDialog">New person</el-button>
          <el-button v-perm="'organizations:add'" @click="router.push({ name: 'crm-organizations' })">New organization</el-button>
          <el-button  @click="loadContacts" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">Contacts</span>
            <el-input
              v-model="search"
              placeholder="Search name, email, phone…"
              clearable
              @update:model-value="debouncedSearch"
            />
          </div>
        </template>

        <el-table
          v-if="contacts.length"
          :data="contacts"
          style="width: 100%"
          @row-dblclick="row => openContact(row)"
        >
          <el-table-column prop="name" label="Name" min-width="180">
            <template #default="scope">
              <div class="contact-row">
                <span class="contact-avatar">{{ avatarInitial(scope.row.name) }}</span>
                <div>
                  <div class="contact-name">{{ scope.row.name }}</div>
                  <div class="contact-meta" v-if="scope.row.email">{{ scope.row.email }}</div>
                  <div class="contact-meta" v-if="scope.row.phone">{{ scope.row.phone }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="source" label="Source" min-width="100">
            <template #default="scope">{{ scope.row.source }}</template>
          </el-table-column>
          <el-table-column label="Organization" min-width="160">
            <template #default="scope">{{ scope.row.organization_name || 'Independent contact' }}</template>
          </el-table-column>
          <el-table-column label="Tags" min-width="120">
            <template #default="scope">
              <el-tag
                v-for="tag in (scope.row.tags || [])"
                :key="tag"
                effect="plain"
                size="small"
                >{{ tag }}</el-tag
              >
            </template>
          </el-table-column>
          <el-table-column prop="createTime" label="Created" min-width="150">
            <template #default="scope">{{ formatDate(scope.row.create_time) }}</template>
          </el-table-column>
          <el-table-column label="Assignee" min-width="190">
            <template #default="scope">
              <el-select
                v-if="hasPerm('contacts:assign')"
                :model-value="scope.row.assignee_id ?? null"
                placeholder="Unassigned"
                filterable
                clearable
                size="small"
                :loading="assigningId === scope.row.id"
                style="width: 100%"
                @change="value => assignContact(scope.row, value)"
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
          <el-table-column label="Actions" fixed="right" min-width="140">
            <template #default="scope">
              <el-button v-perm="'contacts:edit'" type="text" size="small" icon="edit" @click="openContact(scope.row)" />
              <el-button v-perm="'contacts:delete'" type="text" size="small" icon="delete" @click="deleteContact(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>No people yet. Add an individual, then optionally link them to an organization.</p>
          <el-button v-perm="'contacts:add'" type="primary" @click="openContactDialog">Add your first person</el-button>
        </div>
      </el-card>

      <el-dialog v-model="contactDialogVisible" title="Contact" width="520px">
        <el-form :model="contactForm" label-width="100px">
          <el-form-item label="Full name" prop="name" required>
            <el-input v-model="contactForm.name" placeholder="e.g. Jane Smith" />
          </el-form-item>
          <el-form-item label="Email" prop="email">
            <el-input v-model="contactForm.email" type="email" />
          </el-form-item>
          <el-form-item label="Phone" prop="phone">
            <el-input v-model="contactForm.phone" placeholder="Include country code" />
          </el-form-item>
          <el-form-item label="Organization">
            <el-select v-model="contactForm.organization_id" placeholder="Independent contact" filterable clearable style="width:100%">
              <el-option v-for="organization in organizations" :key="organization.id" :label="organization.name" :value="organization.id" />
            </el-select>
            <div class="form-hint">Create organizations separately, then link their people here. A person can later be linked to more than one organization.</div>
          </el-form-item>
          <el-form-item v-if="contactForm.organization_id" label="Relationship">
            <el-select v-model="contactForm.organization_role" style="width:100%">
              <el-option label="Primary contact" value="Primary contact" />
              <el-option label="Decision maker" value="Decision Maker" />
              <el-option label="Operations contact" value="Operations contact" />
              <el-option label="Finance contact" value="Finance contact" />
              <el-option label="Partner contact" value="Partner contact" />
            </el-select>
          </el-form-item>
          <el-form-item label="Address" prop="address">
            <el-input v-model="contactForm.address" placeholder="Street, city, country" />
          </el-form-item>
          <el-form-item label="Source" prop="source">
            <el-select v-model="contactForm.source" placeholder="How did you meet this contact?" style="width:100%">
              <el-option label="Manual entry" value="manual" />
              <el-option label="Email" value="email" />
              <el-option label="WhatsApp" value="whatsapp" />
              <el-option label="Social media" value="social_media" />
              <el-option label="Personal referral" value="personal_referral" />
              <el-option label="Public information" value="public_information" />
              <el-option label="Website or inbound form" value="website" />
              <el-option label="Event or networking" value="event_networking" />
              <el-option label="Imported list" value="import" />
            </el-select>
          </el-form-item>
          <el-form-item label="Notes" prop="notes">
            <el-input v-model="contactForm.notes" type="textarea" rows="3" />
          </el-form-item>
          <el-form-item label="Tags" prop="tags">
            <el-input v-model="contactForm.tagsInput" placeholder="Separate tags with commas" />
          </el-form-item>
        </el-form>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="contactDialogVisible = false">Cancel</el-button>
            <el-button v-perm="contactForm.id ? 'contacts:edit' : 'contacts:add'" type="primary" :loading="saving" @click="saveContact">Save contact</el-button>
          </span>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { contactsList, contactsCreate, contactsUpdate, contactsDelete, contactsAssign } from '@/request/contacts.js'
import { organizationsList } from '@/request/organizations.js'
import { contactOrganizationsCreate } from '@/request/contact-organizations.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { useTeamMembers } from '@/composables/use-team-members.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const router = useRouter()
const route = useRoute()
useCreateIntent(() => openContactDialog())

const { members, loadMembers } = useTeamMembers()

const search = ref('')
const contacts = ref([])
const organizations = ref([])
const total = ref(0)
const loading = ref(false)
const saving = ref(false)
const assigningId = ref(null)

const contactDialogVisible = ref(false)
const contactForm = ref({
  id: null,
  name: '',
  email: '',
  phone: '',
  organization_id: null,
  organization_role: 'Primary contact',
  address: '',
  tags: [],
  tagsInput: '',
  source: 'manual',
  notes: ''
})

const canAdd = computed(() => hasPerm('contacts:add'))
const canEdit = computed(() => hasPerm('contacts:edit'))
const canDelete = computed(() => hasPerm('contacts:delete'))

let searchTimer = null

const debouncedSearch = (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    search.value = val
    loadContacts()
  }, 300)
}

async function loadContacts() {
  loading.value = true
  try {
    const [contactsResp, companiesResp] = await Promise.all([
      contactsList({ page: 1, pageSize: 100, search: search.value || undefined }),
      organizationsList({ page: 1, pageSize: 100 })
    ])
    contacts.value = contactsResp.list || []
    organizations.value = companiesResp.list || []
    total.value = contactsResp.total ?? 0
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load contacts.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

// Assignment is a deliberate, permission-gated action: it writes the owner and
// records who handed the contact over, so ownership changes stay auditable.
async function assignContact(contact, assigneeId) {
  const previousId = contact.assignee_id ?? null
  const nextId = assigneeId ?? null
  if (previousId === nextId) return
  assigningId.value = contact.id
  try {
    await contactsAssign(contact.id, nextId)
    contact.assignee_id = nextId
    contact.assignee = nextId
      ? (members.value.find((m) => m.userId === nextId)?.label || 'Assigned')
      : null
    ElMessage({ message: 'Contact reassigned.', type: 'success', plain: true })
  } catch (error) {
    contact.assignee_id = previousId
    await loadContacts()
    ElMessage({ message: error.message || 'Failed to reassign contact.', type: 'error', plain: true })
  } finally {
    assigningId.value = null
  }
}

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString()
}

function avatarInitial(name) {
  return String(name || '?').trim()[0]?.toUpperCase() || '?'
}

function openContact(contact) {
  router.push({ name: 'crm-contact', params: { id: contact.id } })
}

function openContactDialog() {
  contactForm.value = { id: null, name: '', email: '', phone: '', organization_id: null, organization_role: 'Primary contact', address: '', tags: [], tagsInput: '', source: 'manual', notes: '' }
  contactDialogVisible.value = true
}

async function saveContact() {
  if (!contactForm.value.name.trim()) {
    ElMessage({ message: 'Name is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    const tags = contactForm.value.tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    const payload = {
      ...contactForm.value,
      tags,
      tagsInput: undefined,
      organization_id: undefined,
      organization_role: undefined,
    }
    if (contactForm.value.id) {
      await contactsUpdate(contactForm.value.id, payload)
    } else {
      const created = await contactsCreate(payload)
      if (contactForm.value.organization_id && created?.id) {
        await contactOrganizationsCreate({ contact_id: created.id, organization_id: contactForm.value.organization_id, role: contactForm.value.organization_role, is_primary: 1 })
      }
    }
    contactDialogVisible.value = false
    await loadContacts()
    ElMessage({ message: 'Contact saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save contact.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function deleteContact(contact) {
  if (!await confirm(`Delete contact "${contact.name}"?`)) return
  try {
    await contactsDelete(contact.id)
    await loadContacts()
    ElMessage({ message: 'Contact deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete contact.', type: 'error', plain: true })
  }
}

watch(() => route.params.id, (id) => {
  if (id) openContact({ id })
})

onMounted(() => {
  loadContacts()
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
.form-hint { margin-top: 6px; color: var(--hq-muted); font-size: 12px; line-height: 1.4; }
</style>
