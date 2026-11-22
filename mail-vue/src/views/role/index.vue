<template>
  <el-scrollbar class="access-scroll">
    <div class="access-container">
      <div class="access-header">
        <div>
          <div class="access-eyebrow">XPASS HQ / ACCESS</div>
          <h1>Access control</h1>
          <p class="access-sub">
            See what everyone can do, and fine-tune each person's access. A baseline provides a reusable starting point; direct access lets you grant or deny specific permissions for each individual.
          </p>
        </div>
        <div class="access-actions">
          <el-button v-perm="'role:add'" type="primary" icon="plus" @click="openCreate">New baseline</el-button>
          <el-button text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" @click="refresh" />
        </div>
      </div>

      <el-tabs v-model="activeTab" class="access-tabs">
        <el-tab-pane name="people">
          <template #label>
            <span>People &amp; access</span>
          </template>

          <div class="people-toolbar">
            <el-input v-model="peopleSearch" placeholder="Search people" clearable size="small" style="max-width: 280px" />
            <el-select v-model="peopleRoleFilter" placeholder="All baselines" clearable size="small" style="width: 180px">
              <el-option v-for="role in roles" :key="role.roleId" :label="role.name" :value="role.roleId" />
            </el-select>
            <el-button v-perm="'role:add'" type="primary" size="small" icon="plus" @click="openCreate">New baseline</el-button>
          </div>

          <el-table v-if="filteredPeople.length" v-loading="peopleLoading" :data="filteredPeople" style="width: 100%">
            <el-table-column label="Person" min-width="240">
              <template #default="scope">
                <div class="member-cell">
                  <hq-avatar :name="scope.row.displayName" :username="scope.row.username" :size="30" />
                  <div class="member-copy">
                    <span class="member-name">{{ scope.row.displayName }}</span>
                    <span class="member-handle">{{ scope.row.email }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Access baseline" min-width="160">
              <template #default="scope">
                <el-tag size="small" effect="plain">{{ scope.row.roleName }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Record scope" min-width="150">
              <template #default="scope">{{ scopeLabel(scope.row.dataScope) }}</template>
            </el-table-column>
            <el-table-column label="Permissions" width="120" align="right">
              <template #default="scope">{{ (scope.row.permIds || []).length }}</template>
            </el-table-column>
            <el-table-column label="Access" width="240" fixed="right">
              <template #default="scope">
                <el-button v-perm="'role:query'" type="text" size="small" @click="openAccessView(scope.row)">View access</el-button>
                <el-button v-perm="'role:set'" type="text" size="small" @click="openMemberAccess(scope.row)">Edit permissions</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-else-if="!peopleLoading" class="empty-state">
            <p>No people found.</p>
          </div>
        </el-tab-pane>

        <el-tab-pane :label="`Baselines`" name="overview">
          <el-card>
            <el-table v-if="roles.length" v-loading="loading" :data="roles" style="width: 100%">
              <el-table-column label="Access baseline" min-width="200">
                <template #default="scope">
                  <div class="role-name">
                    <span>{{ scope.row.name }}</span>
                    <el-tag v-if="scope.row.isDefault" size="small" effect="plain">Default</el-tag>
                  </div>
                  <div v-if="scope.row.description" class="role-desc">{{ scope.row.description }}</div>
                </template>
              </el-table-column>
              <el-table-column label="Data scope" min-width="170">
                <template #default="scope">
                  <el-select
                    v-if="hasPerm('role:set')"
                    :model-value="scope.row.dataScope || 'own'"
                    size="small"
                    :loading="savingScopeId === scope.row.roleId"
                    style="width: 100%"
                    @change="value => changeScope(scope.row, value)"
                  >
                    <el-option v-for="item in SCOPES" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                  <span v-else>{{ scopeLabel(scope.row.dataScope) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Members" width="110" align="right">
                <template #default="scope">{{ scope.row.memberCount ?? 0 }}</template>
              </el-table-column>
              <el-table-column label="Permissions" width="120" align="right">
                <template #default="scope">{{ (scope.row.permIds || []).length }}</template>
              </el-table-column>
              <el-table-column label="Actions" fixed="right" min-width="200">
                <template #default="scope">
                  <el-button v-perm="'role:set'" type="text" size="small" @click="openPermissions(scope.row)">Permissions</el-button>
                  <el-button v-perm="'role:query'" type="text" size="small" @click="openMembers(scope.row)">Members</el-button>
                  <el-button v-perm="'role:query'" type="text" size="small" @click="openPreview(scope.row)">Preview</el-button>
                  <el-button
                    v-if="!scope.row.isDefault"
                    v-perm="'role:set'"
                    type="text"
                    size="small"
                    @click="setDefault(scope.row)"
                  >Make default</el-button>
                  <el-button
                    v-if="!scope.row.isDefault"
                    v-perm="'role:delete'"
                    type="text"
                    size="small"
                    class="danger-text"
                    @click="removeRole(scope.row)"
                  >Delete</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-else class="empty-state">
              <p>No roles yet.</p>
            </div>
          </el-card>
        </el-tab-pane>

        <el-tab-pane :label="`Permissions`" name="permissions">
          <el-card v-if="editingRole">
            <div class="perm-head">
              <div>
                <div class="perm-title">{{ editingRole.name }}</div>
                <div class="perm-sub">Editing this baseline. Changes apply to everyone assigned to it unless you give them direct access.</div>
              </div>
              <div class="perm-head-actions">
                <el-input v-model="filterText" placeholder="Filter permissions" clearable style="width: 220px" />
                <el-button :loading="savingPerms" type="primary" @click="savePermissions">Save changes</el-button>
              </div>
            </div>

            <div class="perm-groups">
              <div v-for="group in permissionGroups" :key="group.id" class="perm-group">
                <div class="perm-group-head">
                  <el-checkbox
                    :model-value="groupAllChecked(group)"
                    :indeterminate="groupIndeterminate(group)"
                    @change="value => toggleGroup(group, value)"
                  >{{ group.label }}</el-checkbox>
                  <span class="perm-group-count">{{ groupCount(group) }}</span>
                </div>
                <div class="perm-options">
                  <el-checkbox
                    v-for="leaf in group.leaves"
                    :key="leaf.perm_id"
                    :model-value="draftPerms.includes(leaf.perm_id)"
                    @change="value => toggleLeaf(leaf, value)"
                  >
                    <span class="perm-label">{{ leaf.label }}</span>
                  </el-checkbox>
                </div>
              </div>
            </div>
            <div v-if="!permissionGroups.length" class="empty-state">
              <p>No permissions match.</p>
            </div>
          </el-card>
          <el-card v-else class="empty-state">
            <p>Select a baseline to edit its permissions.</p>
            <el-button type="primary" @click="activeTab = 'overview'">Back to baselines</el-button>
          </el-card>
        </el-tab-pane>

        <el-tab-pane :label="`Members`" name="members">
          <el-card v-if="editingRole">
            <div class="perm-head">
              <div>
                <div class="perm-title">{{ editingRole.name }} members</div>
                <div class="perm-sub">Changing a member's baseline takes effect at their next request. Direct access still applies immediately.</div>
              </div>
            </div>
            <el-table v-if="members.length" v-loading="membersLoading" :data="members" style="width: 100%">
              <el-table-column label="Member" min-width="220">
                <template #default="scope">
                  <div class="member-cell">
                    <hq-avatar :name="scope.row.displayName" :username="scope.row.username" :size="28" />
                    <div>
                      <div class="member-name">{{ scope.row.displayName }}</div>
                      <div class="member-handle">{{ scope.row.username ? '@' + scope.row.username : scope.row.email }}</div>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="email" label="Email" min-width="200" />
              <el-table-column label="Access baseline" min-width="190">
                <template #default="scope">
                  <el-select
                    v-if="hasPerm('user:set-type')"
                    :model-value="scope.row.userId === currentUserId ? null : editingRole.roleId"
                    placeholder="—"
                    size="small"
                    style="width: 100%"
                    @change="value => changeMemberRole(scope.row, value)"
                  >
                    <el-option v-for="role in roles" :key="role.roleId" :label="role.name" :value="role.roleId" />
                  </el-select>
                  <span v-else>{{ editingRole.name }}</span>
                </template>
              </el-table-column>
              <el-table-column label="Direct access" width="140" fixed="right">
                <template #default="scope">
                  <el-button
                    v-perm="'role:set'"
                    type="text"
                    size="small"
                    @click="openMemberAccess(scope.row)"
                  >Edit access</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-else class="empty-state">
              <p>No members hold this role.</p>
            </div>
          </el-card>
          <el-card v-else class="empty-state">
            <p>Select a baseline to see its members.</p>
          </el-card>
        </el-tab-pane>

        <el-tab-pane :label="`History`" name="history">
          <el-card>
            <div class="perm-head">
              <div>
                <div class="perm-title">Access history</div>
                <div class="perm-sub">Every permission, scope and membership change, newest first.</div>
              </div>
              <el-select v-model="historyRoleId" placeholder="All baselines" clearable style="width: 220px" @change="loadHistory">
                <el-option v-for="role in roles" :key="role.roleId" :label="role.name" :value="role.roleId" />
              </el-select>
            </div>
            <el-table v-if="history.length" :data="history" style="width: 100%">
              <el-table-column label="When" width="170">
                <template #default="scope">{{ formatTime(scope.row.create_time) }}</template>
              </el-table-column>
              <el-table-column prop="summary" label="Change" min-width="240" />
              <el-table-column prop="detail" label="Detail" min-width="200" />
              <el-table-column label="By" min-width="160">
                <template #default="scope">{{ scope.row.actor || '—' }}</template>
              </el-table-column>
            </el-table>
            <div v-else class="empty-state">
              <p>No access changes recorded yet.</p>
            </div>
          </el-card>
        </el-tab-pane>

        <el-tab-pane :label="`Access preview`" name="access">
          <el-card v-if="editingRole">
            <div class="perm-head">
              <div>
                <div class="perm-title">What this role can do</div>
                <div class="perm-sub">
                  Generated from the role's stored permissions and record scope. Nothing is assumed.
                </div>
              </div>
              <el-select v-model="previewRoleId" placeholder="Choose a role" style="width: 220px" @change="loadPreview">
                <el-option v-for="role in roles" :key="role.roleId" :label="role.name" :value="role.roleId" />
              </el-select>
            </div>

            <div v-loading="previewLoading">
              <div class="preview-scope">
                <span class="preview-scope-label">Record scope</span>
                <span class="preview-scope-value">{{ scopeLabel(preview.scope) }}</span>
                <span class="preview-scope-note">{{ preview.scopeNote }}</span>
              </div>

              <div class="preview-columns">
                <div class="preview-col">
                  <div class="preview-col-head can">Can</div>
                  <ul v-if="preview.can.length" class="preview-list">
                    <li v-for="(item, index) in preview.can" :key="'can' + index">
                      <span class="preview-area">{{ item.areaLabel }}</span>
                      {{ item.phrase }}
                    </li>
                  </ul>
                  <p v-else class="preview-empty">No permissions granted.</p>
                </div>
                <div class="preview-col">
                  <div class="preview-col-head cannot">Cannot</div>
                  <ul v-if="preview.cannot.length" class="preview-list">
                    <li v-for="(item, index) in preview.cannot" :key="'cannot' + index">{{ item.phrase }}</li>
                  </ul>
                  <p v-else class="preview-empty">Nothing is blocked by this baseline.</p>
                </div>
              </div>

              <div class="preview-areas">
                <div v-for="area in preview.areas.filter(a => a.accessible)" :key="area.key" class="preview-area-row">
                  <span class="preview-area-name">{{ area.label }}</span>
                  <span class="preview-area-scope" v-if="area.scopePhrase">({{ area.scopePhrase }})</span>
                  <span class="preview-area-summary">{{ area.actions.filter(a => a.allowed).map(a => a.phrase).join('; ') }}</span>
                </div>
              </div>
            </div>
          </el-card>
          <el-card v-else class="empty-state">
            <p>Choose a baseline to preview its effective access.</p>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="createVisible" title="New access baseline" width="520px">
      <el-form :model="createForm" label-width="120px">
        <el-form-item label="Name">
          <el-input v-model="createForm.name" placeholder="e.g. Finance read only" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="createForm.description" type="textarea" rows="2" />
        </el-form-item>
        <el-form-item label="Data scope">
          <el-select v-model="createForm.dataScope" style="width: 100%">
            <el-option v-for="item in SCOPES" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="creating" @click="createRole">Create baseline</el-button>
      </template>
    </el-dialog>

    <member-access
      v-model="memberAccessVisible"
      :user-id="memberAccessTarget?.userId ?? memberAccessTarget?.user_id ?? null"
      :user-name="memberAccessTarget?.displayName || memberAccessTarget?.email || 'Member'"
    />

    <el-drawer v-model="accessVisible" :title="accessTitle" direction="rtl" size="480px">
      <div v-loading="accessLoading" class="member-access-view">
        <p class="access-view-note">
          What {{ accessTarget?.displayName || accessTarget?.email || 'this person' }} can do, based on their access baseline and any individual adjustments.
        </p>
        <div v-if="accessData" class="preview-columns">
          <div class="preview-col">
            <div class="preview-col-head can">Can</div>
            <ul v-if="accessData.can && accessData.can.length" class="preview-list">
              <li v-for="(item, index) in accessData.can" :key="'can' + index">
                <span class="preview-area">{{ item.areaLabel }}</span> {{ item.phrase }}
              </li>
            </ul>
            <p v-else class="preview-empty">No permissions granted.</p>
          </div>
          <div class="preview-col">
            <div class="preview-col-head cannot">Cannot</div>
            <ul v-if="accessData.cannot && accessData.cannot.length" class="preview-list">
              <li v-for="(item, index) in accessData.cannot" :key="'cannot' + index">{{ item.phrase }}</li>
            </ul>
            <p v-else class="preview-empty">Nothing is blocked.</p>
          </div>
        </div>
      </div>
    </el-drawer>
  </el-scrollbar>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { useUserStore } from '@/store/user.js'
import { useConfirm } from '@/composables/use-confirm.js'
import {
  roleAccessPreview,
  roleAdd,
  roleDelete,
  roleHistory,
  roleMembers,
  rolePermTree,
  roleRoleList,
  roleSet,
  roleSetDef
} from '@/request/role.js'
import { userSetType } from '@/request/user.js'
import { accessPreview } from '@/request/profile.js'
import { groupPermissions } from '@/perm/permission-labels.js'
import MemberAccess from '@/components/member-access/index.vue'
import hqAvatar from '@/components/hq-avatar/index.vue'

const { confirm } = useConfirm()
const userStore = useUserStore()
const currentUserId = userStore.user.userId

const SCOPES = [
  { value: 'own', label: 'Only my records' },
  { value: 'assigned', label: 'Only assigned to me' },
  { value: 'team', label: 'My team' },
  { value: 'company', label: 'Whole company' }
]

const activeTab = ref('people')
const roles = ref([])
const tree = ref([])
const loading = ref(false)
const editingRole = ref(null)
const savingScopeId = ref(null)

const draftPerms = ref([])
const savingPerms = ref(false)
const filterText = ref('')

const members = ref([])
const membersLoading = ref(false)

const history = ref([])
const previewRoleId = ref(null)
const previewLoading = ref(false)
const preview = reactive({ scope: 'own', scopeNote: '', can: [], cannot: [], areas: [] })
const historyRoleId = ref(null)

const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({ name: '', description: '', dataScope: 'own' })

// Member-centric access: click a person to view or edit their permissions.
const memberAccessVisible = ref(false)
const memberAccessTarget = ref(null)
const accessVisible = ref(false)
const accessLoading = ref(false)
const accessTarget = ref(null)
const accessData = ref(null)

const accessTitle = computed(() => {
  const m = accessTarget.value
  return `Access — ${m?.displayName || m?.email || 'Member'}`
})

// People & access tab data (built from roles + their members).
const people = ref([])
const peopleLoading = ref(false)
const peopleSearch = ref('')
const peopleRoleFilter = ref('')

const filteredPeople = computed(() => {
  const needle = peopleSearch.value.trim().toLowerCase()
  return people.value.filter((person) => {
    if (peopleRoleFilter.value && person.roleId !== peopleRoleFilter.value) return false
    if (!needle) return true
    return `${person.displayName || ''} ${person.email || ''} ${person.username || ''} ${person.roleName || ''}`
      .toLowerCase()
      .includes(needle)
  })
})

function openMemberAccess(member) {
  memberAccessTarget.value = member
  memberAccessVisible.value = true
}

async function openAccessView(member) {
  accessTarget.value = member
  accessData.value = null
  accessVisible.value = true
  accessLoading.value = true
  try {
    accessData.value = await accessPreview(member.userId)
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load access.', type: 'error', plain: true })
    accessVisible.value = false
  } finally {
    accessLoading.value = false
  }
}

async function loadPeople() {
  peopleLoading.value = true
  try {
    const roleList = await roleRoleList()
    roles.value = roleList || []
    const rows = []
    for (const role of roleList || []) {
      let members = []
      try {
        members = await roleMembers(role.roleId) || []
      } catch {
        members = []
      }
      for (const member of members) {
        rows.push({
          userId: member.userId ?? member.user_id,
          displayName: member.displayName,
          username: member.username,
          email: member.email,
          roleId: role.roleId,
          roleName: role.name,
          dataScope: role.dataScope || 'own',
          permIds: role.permIds || []
        })
      }
    }
    people.value = rows
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load people.', type: 'error', plain: true })
  } finally {
    peopleLoading.value = false
  }
}

const scopeLabel = (value) => SCOPES.find((item) => item.value === value)?.label || 'Only my records'

async function refresh() {
  loading.value = true
  try {
    await loadPeople()
    if (editingRole.value) {
      const next = roles.value.find((role) => role.roleId === editingRole.value.roleId)
      if (next) editingRole.value = next
    }
    await Promise.all([loadTree(), loadHistory()])
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load access baselines.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function loadTree() {
  try {
    tree.value = await rolePermTree() || []
  } catch {
    tree.value = []
  }
}

async function loadHistory() {
  try {
    history.value = await roleHistory(historyRoleId.value) || []
  } catch {
    history.value = []
  }
}

function leavesOf(group) {
  return Array.isArray(group.leaves) ? group.leaves : []
}

const permissionGroups = computed(() => {
  const groups = groupPermissions(tree.value)
  const needle = filterText.value.trim().toLowerCase()
  if (!needle) return groups
  return groups
    .map((group) => {
      const groupHit = group.label.toLowerCase().includes(needle)
      const leaves = groupHit
        ? group.leaves
        : group.leaves.filter((leaf) => `${leaf.label} ${leaf.perm_key}`.toLowerCase().includes(needle))
      return leaves.length ? { ...group, leaves } : null
    })
    .filter(Boolean)
})

function groupAllChecked(group) {
  const leaves = leavesOf(group)
  return leaves.length > 0 && leaves.every((leaf) => draftPerms.value.includes(leaf.perm_id))
}

function groupIndeterminate(group) {
  const leaves = leavesOf(group)
  const checked = leaves.filter((leaf) => draftPerms.value.includes(leaf.perm_id)).length
  return checked > 0 && checked < leaves.length
}

function groupCount(group) {
  const leaves = leavesOf(group)
  const checked = leaves.filter((leaf) => draftPerms.value.includes(leaf.perm_id)).length
  return `${checked}/${leaves.length}`
}

function toggleLeaf(leaf, value) {
  if (value) {
    if (!draftPerms.value.includes(leaf.perm_id)) draftPerms.value.push(leaf.perm_id)
  } else {
    draftPerms.value = draftPerms.value.filter((id) => id !== leaf.perm_id)
  }
}

function toggleGroup(group, value) {
  const ids = leavesOf(group).map((leaf) => leaf.perm_id)
  if (value) {
    draftPerms.value = [...new Set([...draftPerms.value, ...ids])]
  } else {
    draftPerms.value = draftPerms.value.filter((id) => !ids.includes(id))
  }
}

function openCreate() {
  createForm.name = ''
  createForm.description = ''
  createForm.dataScope = 'own'
  createVisible.value = true
}

async function createRole() {
  if (!createForm.name.trim()) {
    ElMessage({ message: 'A baseline name is required.', type: 'warning', plain: true })
    return
  }
  creating.value = true
  try {
    await roleAdd({
      name: createForm.name.trim(),
      description: createForm.description,
      dataScope: createForm.dataScope,
      permIds: [],
      banEmail: [],
      availDomain: [],
      sort: 0,
      sendType: 'count',
      sendCount: 0,
      accountCount: 0
    })
    createVisible.value = false
    await refresh()
    ElMessage({ message: 'Access baseline created.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to create access baseline.', type: 'error', plain: true })
  } finally {
    creating.value = false
  }
}

async function changeScope(role, value) {
  if ((role.dataScope || 'own') === value) return
  const previous = role.dataScope || 'own'
  savingScopeId.value = role.roleId
  try {
    await roleSet({ roleId: role.roleId, name: role.name, dataScope: value })
    role.dataScope = value
    await loadHistory()
    ElMessage({ message: 'Record scope updated.', type: 'success', plain: true })
  } catch (error) {
    role.dataScope = previous
    ElMessage({ message: error.message || 'Failed to update scope.', type: 'error', plain: true })
  } finally {
    savingScopeId.value = null
  }
}

function openPermissions(role) {
  editingRole.value = role
  draftPerms.value = [...(role.permIds || [])]
  activeTab.value = 'permissions'
}

async function savePermissions() {
  if (!editingRole.value) return
  const role = editingRole.value
  savingPerms.value = true
  try {
    await roleSet({
      roleId: role.roleId,
      name: role.name,
      description: role.description,
      dataScope: role.dataScope || 'own',
      permIds: draftPerms.value,
      banEmail: role.banEmail || [],
      availDomain: role.availDomain || []
    })
    role.permIds = [...draftPerms.value]
    await loadHistory()
    ElMessage({ message: 'Permissions saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save permissions.', type: 'error', plain: true })
  } finally {
    savingPerms.value = false
  }
}

const SCOPE_NOTES = {
  own: 'Each member sees the records they created and the records assigned to them.',
  assigned: 'Each member sees only the records assigned to them.',
  team: 'Each member sees records belonging to members of their team.',
  company: 'Every member of this role sees all company records in these areas.'
}

function resetPreview() {
  preview.scope = 'own'
  preview.scopeNote = SCOPE_NOTES.own
  preview.can = []
  preview.cannot = []
  preview.areas = []
}

async function loadPreview(roleId) {
  const id = roleId || previewRoleId.value
  if (!id) return
  previewLoading.value = true
  try {
    const data = await roleAccessPreview(id)
    preview.scope = data.scope || 'own'
    preview.scopeNote = SCOPE_NOTES[preview.scope] || SCOPE_NOTES.own
    preview.can = data.can || []
    preview.cannot = data.cannot || []
    preview.areas = data.areas || []
  } catch (error) {
    resetPreview()
    ElMessage({ message: error.message || 'Failed to build the access preview.', type: 'error', plain: true })
  } finally {
    previewLoading.value = false
  }
}

function openPreview(role) {
  editingRole.value = role
  previewRoleId.value = role.roleId
  activeTab.value = 'access'
  loadPreview(role.roleId)
}

async function openMembers(role) {
  editingRole.value = role
  activeTab.value = 'members'
  membersLoading.value = true
  try {
    members.value = await roleMembers(role.roleId) || []
  } catch (error) {
    members.value = []
    ElMessage({ message: error.message || 'Failed to load members.', type: 'error', plain: true })
  } finally {
    membersLoading.value = false
  }
}

async function changeMemberRole(member, roleId) {
  try {
    await userSetType({ userId: member.userId, type: roleId })
    const role = roles.value.find((item) => item.roleId === roleId)
    await openMembers(editingRole.value)
    await refresh()
    await loadHistory()
    ElMessage({ message: `Moved to ${role ? role.name : 'the new baseline'}.`, type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to change access baseline.', type: 'error', plain: true })
  }
}

async function setDefault(role) {
  try {
    await roleSetDef(role.roleId)
    await refresh()
    ElMessage({ message: 'Default access baseline updated.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to set default access baseline.', type: 'error', plain: true })
  }
}

async function removeRole(role) {
  if (!await confirm(`Delete access baseline "${role.name}"? Its members move to the default baseline.`)) return
  try {
    await roleDelete(role.roleId)
    if (editingRole.value?.roleId === role.roleId) {
      editingRole.value = null
      activeTab.value = 'overview'
    }
    await refresh()
    ElMessage({ message: 'Access baseline deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete access baseline.', type: 'error', plain: true })
  }
}

function formatTime(value) {
  if (!value) return '—'
  return new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z').toLocaleString()
}

onMounted(refresh)
</script>

<style scoped>
.access-scroll {
  height: 100%;
  background: var(--hq-page);
}

.access-container {
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 28px clamp(20px, 3vw, 42px) 36px;
  color: var(--hq-text);
}

.access-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.access-eyebrow {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.access-header h1 {
  margin: 4px 0 0;
  font-size: clamp(24px, 2.4vw, 30px);
  font-weight: 650;
  letter-spacing: -.035em;
  line-height: 1.2;
}

.access-sub {
  margin: 6px 0 0;
  color: var(--hq-muted);
  font-size: 13px;
  max-width: 62ch;
}

.access-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.role-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.role-desc,
.member-handle {
  color: var(--hq-muted);
  font-size: 12px;
}

.danger-text {
  color: var(--el-color-danger);
}

.perm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.perm-title {
  font-size: 15px;
  font-weight: 650;
}

.perm-sub {
  margin-top: 2px;
  color: var(--hq-muted);
  font-size: 12px;
}

.perm-head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.perm-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.perm-group {
  border: 1px solid var(--hq-border, var(--el-border-color-lighter));
  border-radius: 10px;
  padding: 12px 14px;
}

.perm-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.perm-group-count {
  color: var(--hq-muted);
  font-size: 12px;
}

.perm-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.perm-label {
  margin-right: 8px;
}

.perm-key {
  color: var(--hq-muted);
  font-size: 11px;
}

.member-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.member-copy {
  display: grid;
  min-width: 0;
}

.people-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.member-access-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.access-view-note {
  margin: 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.member-name {
  font-weight: 600;
}

.preview-scope {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  margin-bottom: 16px;
  border: 1px solid var(--hq-border, var(--el-border-color-lighter));
  border-radius: 10px;
}

.preview-scope-label {
  color: var(--hq-muted);
  font-size: 12px;
}

.preview-scope-value {
  font-weight: 650;
}

.preview-scope-note {
  color: var(--hq-muted);
  font-size: 12px;
}

.preview-columns {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.preview-col-head {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .04em;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.preview-col-head.can {
  color: var(--el-color-success);
}

.preview-col-head.cannot {
  color: var(--hq-muted);
}

.preview-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.preview-area {
  color: var(--hq-muted);
  margin-right: 6px;
}

.preview-empty {
  color: var(--hq-muted);
  font-size: 13px;
  margin: 0;
}

.preview-areas {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-top: 1px solid var(--hq-border, var(--el-border-color-lighter));
  padding-top: 12px;
}

.preview-area-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
}

.preview-area-name {
  font-weight: 600;
  min-width: 150px;
}

.preview-area-scope,
.preview-area-summary {
  color: var(--hq-muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  color: var(--hq-muted);
}

.member-access-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
}

.member-access-note {
  margin: 0 0 6px;
  color: var(--hq-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.member-access-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 0;
  border-bottom: 1px solid var(--hq-border);
}

.member-access-row:last-child {
  border-bottom: 0;
}

.member-access-module {
  font-size: 13px;
  font-weight: 550;
  color: var(--hq-text);
}
</style>
