<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / XPASS TEAM</div>
          <h1>XPass Team</h1>
          <p class="module-subtitle">
            Everyone with an XPass account, the teams they belong to, and the access their role grants.
          </p>
        </div>
        <div class="module-actions">
          <el-button v-perm="'people:add'" type="primary" icon="plus" @click="openAddMember">Add member</el-button>
          <el-button @click="reload" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-tabs v-model="activeTab" class="people-tabs">
        <el-tab-pane name="members">
          <template #label>
            <span>Members</span>
            <span v-if="directoryTotal" class="tab-count">{{ directoryTotal }}</span>
          </template>

          <div class="directory-toolbar">
            <el-input
              v-model="search"
              placeholder="Search by name, @username, email, position or team"
              clearable
              style="max-width: 420px"
              @update:model-value="debouncedSearch"
            />
            <el-select v-model="teamFilter" placeholder="All teams" clearable style="width: 200px" @change="loadDirectory">
              <el-option v-for="team in teams" :key="team.team_id" :label="team.name" :value="team.team_id" />
            </el-select>
            <span class="directory-count">{{ directoryTotal }} {{ directoryTotal === 1 ? 'member' : 'members' }}</span>
          </div>

          <el-table v-if="members.length" v-loading="directoryLoading" :data="members" style="width: 100%">
            <el-table-column label="Member" min-width="240">
              <template #default="scope">
                <div class="person-cell">
                  <hq-avatar
                    :src="scope.row.avatarUrl"
                    :name="scope.row.displayName"
                    :username="scope.row.username"
                    :size="32"
                    :show-presence="true"
                    :presence="scope.row.isOnline ? 'online' : 'offline'"
                  />
                  <div class="person-copy">
                    <span class="person-name">{{ scope.row.displayName }}</span>
                    <span class="person-handle">{{ scope.row.username ? '@' + scope.row.username : '—' }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="Position" min-width="150">
              <template #default="scope">{{ scope.row.jobTitle || '—' }}</template>
            </el-table-column>
            <el-table-column label="Team" min-width="140">
              <template #default="scope">
                <el-tag v-if="scope.row.team" size="small" effect="plain" type="info">{{ scope.row.team.name }}</el-tag>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="email" :label="$t('crmEmail')" min-width="200" />
            <el-table-column label="Presence" min-width="130">
              <template #default="scope">
                <span class="presence" :class="scope.row.isOnline ? 'is-online' : 'is-offline'">
                  {{ presenceLabel(scope.row) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="Access" width="200" fixed="right">
              <template #default="scope">
                <el-button
                  v-perm="'role:set'"
                  type="text"
                  size="small"
                  @click="openMemberAccess(scope.row)"
                >Permissions</el-button>
                <el-button
                  v-perm="'user:reset-mfa'"
                  type="text"
                  size="small"
                  @click="openMemberSecurity(scope.row)"
                >Security</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-else-if="!directoryLoading" class="empty-state">
            <div class="empty-title">{{ search || teamFilter ? 'No matching members' : 'No members yet' }}</div>
            <p>{{ search || teamFilter
              ? 'Try a different name, @username, team or position.'
              : 'Members appear here once they have an XPass Team account.' }}</p>
            <div v-if="!(search || teamFilter)" class="empty-actions">
              <el-button v-perm="'people:add'" type="primary" icon="plus" @click="openAddMember">Add member</el-button>
            </div>
          </div>
          <div v-else class="loading-state">Loading members…</div>

          <div v-if="directoryTotal > members.length" class="directory-more">
            <el-button text type="primary" @click="loadMore">Load more</el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane name="teams">
          <template #label>
            <span>Teams</span>
            <span v-if="teams.length" class="tab-count">{{ teams.length }}</span>
          </template>

          <div class="section-toolbar">
            <p class="section-hint">Teams group members for ownership and assignment. They never grant access on their own.</p>
            <el-button v-perm="'setting:set'" type="primary" icon="plus" @click="openTeamDialog()">Add team</el-button>
          </div>

          <el-table v-if="teams.length" :data="teams" style="width: 100%">
            <el-table-column prop="name" label="Team" min-width="180" />
            <el-table-column prop="description" label="Purpose" min-width="240">
              <template #default="scope">{{ scope.row.description || '—' }}</template>
            </el-table-column>
            <el-table-column label="Members" min-width="110">
              <template #default="scope">{{ scope.row.member_count || 0 }}</template>
            </el-table-column>
            <el-table-column label="State" min-width="110">
              <template #default="scope">
                <span class="presence" :class="scope.row.is_active ? 'is-online' : 'is-offline'">
                  {{ scope.row.is_active ? 'Active' : 'Archived' }}
                </span>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="empty-state">
            <div class="empty-title">No teams yet</div>
            <p>Teams keep ownership clear when work is assigned or shared.</p>
            <div class="empty-actions">
              <el-button v-perm="'setting:set'" type="primary" icon="plus" @click="openTeamDialog()">Add team</el-button>
            </div>
          </div>
        </el-tab-pane>

        <el-tab-pane name="roles">
          <template #label>
            <span>Roles &amp; permissions</span>
            <span v-if="roles.length" class="tab-count">{{ roles.length }}</span>
          </template>

          <div class="section-toolbar">
            <p class="section-hint">
              A role is the only thing that grants access. Position and team are labels, never permissions.
            </p>
            <el-button v-perm="'role:query'" @click="openRoleBuilder">Open Role Builder</el-button>
          </div>

          <el-table v-if="roles.length" :data="roles" style="width: 100%">
            <el-table-column prop="name" label="Role" min-width="180" />
            <el-table-column prop="description" label="Purpose" min-width="240">
              <template #default="scope">{{ scope.row.description || '—' }}</template>
            </el-table-column>
            <el-table-column label="Members" min-width="110">
              <template #default="scope">{{ scope.row.accountCount || 0 }}</template>
            </el-table-column>
            <el-table-column label="Permissions" min-width="120">
              <template #default="scope">
                {{ (scope.row.permIds || []).length === 0 ? 'None' : (scope.row.permIds || []).length }}
                <span v-if="scope.row.isDefault" class="muted"> · default</span>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="empty-state">
            <div class="empty-title">No roles yet</div>
            <p>Roles are created and edited in the Role Builder.</p>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog v-model="addMemberVisible" title="Add member" width="520px">
      <el-form label-width="110px">
        <el-form-item label="Work email">
          <el-input v-model="addForm.email" placeholder="name@company.com" autocomplete="off" />
        </el-form-item>
        <el-form-item label="Temporary password">
          <el-input v-model="addForm.password" type="password" placeholder="At least 6 characters" show-password />
        </el-form-item>
        <el-form-item label="Role">
          <el-select v-model="addForm.roleId" placeholder="Choose a role" style="width: 100%">
            <el-option v-for="role in roles" :key="role.roleId" :label="role.name" :value="role.roleId" />
          </el-select>
        </el-form-item>
        <el-form-item label="Team">
          <el-select v-model="addForm.teamId" placeholder="No team" clearable style="width: 100%">
            <el-option v-for="team in teams" :key="team.team_id" :label="team.name" :value="team.team_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addMemberVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="addingMember" @click="submitMember">Add member</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="teamDialogVisible" title="Add team" width="460px">
      <el-form label-width="80px">
        <el-form-item label="Name">
          <el-input v-model="teamForm.name" maxlength="60" show-word-limit placeholder="e.g. Partnerships" />
        </el-form-item>
        <el-form-item label="Purpose">
          <el-input v-model="teamForm.description" type="textarea" :rows="3" maxlength="200" show-word-limit
                    placeholder="What this team is responsible for" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="teamDialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="savingTeam" @click="submitTeam">Create team</el-button>
      </template>
    </el-dialog>

    <member-access
      v-model="accessVisible"
      :user-id="accessTarget?.userId ?? accessTarget?.user_id ?? null"
      :user-name="accessTarget?.displayName || accessTarget?.email || 'Member'"
    />

    <member-security
      v-model="securityVisible"
      :user-id="securityTarget?.userId ?? securityTarget?.user_id ?? null"
      :user-name="securityTarget?.displayName || securityTarget?.email || 'Member'"
    />
  </el-scrollbar>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { directoryList, teamList, teamCreate } from '@/request/profile.js'
import { roleRoleList } from '@/request/role.js'
import { userAdd } from '@/request/user.js'
import http from '@/axios/index.js'
import HqAvatar from '@/components/hq-avatar/index.vue'
import MemberAccess from '@/components/member-access/index.vue'
import MemberSecurity from '@/components/member-security/index.vue'
import { useSettingStore } from '@/store/setting.js'
import router from '@/router/index.js'

const settingStore = useSettingStore()

const activeTab = ref('members')
const members = ref([])
const directoryTotal = ref(0)
const directoryLoading = ref(false)
const search = ref('')
const teamFilter = ref('')
const page = ref(1)
const teams = ref([])
const roles = ref([])

const addMemberVisible = ref(false)
const addingMember = ref(false)
const addForm = ref({ email: '', password: '', roleId: null, teamId: null })

const accessVisible = ref(false)
const accessTarget = ref(null)

function openMemberAccess(row) {
  accessTarget.value = row
  accessVisible.value = true
}

const securityVisible = ref(false)
const securityTarget = ref(null)

function openMemberSecurity(row) {
  securityTarget.value = row
  securityVisible.value = true
}

const teamDialogVisible = ref(false)
const savingTeam = ref(false)
const teamForm = ref({ name: '', description: '' })

let searchTimer = null

function debouncedSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    loadDirectory()
  }, 300)
}

function presenceLabel(row) {
  if (row.isOnline) return 'Online now'
  if (row.lastSeenAt) {
    const then = new Date(String(row.lastSeenAt).replace(' ', 'T') + (String(row.lastSeenAt).endsWith('Z') ? '' : 'Z')).getTime()
    if (!Number.isNaN(then)) {
      const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
      if (mins < 1) return 'Last seen just now'
      if (mins < 60) return `Last seen ${mins}m ago`
      if (mins < 1440) return `Last seen ${Math.round(mins / 60)}h ago`
      return `Last seen ${Math.round(mins / 1440)}d ago`
    }
  }
  return 'Offline'
}

async function loadDirectory(reset = true) {
  if (reset) {
    page.value = 1
    members.value = []
  }
  directoryLoading.value = true
  try {
    const resp = await directoryList({
      page: page.value,
      pageSize: 50,
      search: search.value || undefined,
      team_id: teamFilter.value || undefined
    })
    const list = resp.list || []
    members.value = reset ? list : [...members.value, ...list]
    directoryTotal.value = resp.total ?? members.value.length
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load members.', type: 'error', plain: true })
  } finally {
    directoryLoading.value = false
  }
}

async function loadMore() {
  page.value += 1
  await loadDirectory(false)
}

async function loadTeams() {
  try {
    teams.value = await teamList()
  } catch {
    teams.value = []
  }
}

async function loadRoles() {
  try {
    roles.value = await roleRoleList()
  } catch {
    roles.value = []
  }
}

function reload() {
  loadDirectory()
  loadTeams()
  loadRoles()
}

function openRoleBuilder() {
  router.push({ name: 'role' })
}

function openTeamDialog() {
  teamForm.value = { name: '', description: '' }
  teamDialogVisible.value = true
}

async function submitTeam() {
  const name = teamForm.value.name.trim()
  if (!name) {
    ElMessage({ message: 'Team name is required.', type: 'warning', plain: true })
    return
  }
  savingTeam.value = true
  try {
    await teamCreate({ name, description: teamForm.value.description.trim() })
    teamDialogVisible.value = false
    await loadTeams()
    ElMessage({ message: 'Team created.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not create this team.', type: 'error', plain: true })
  } finally {
    savingTeam.value = false
  }
}

function openAddMember() {
  const defaultRole = roles.value.find(role => role.isDefault) || roles.value[0] || null
  addForm.value = {
    email: '',
    password: '',
    roleId: defaultRole ? defaultRole.roleId : null,
    teamId: teamFilter.value || null,
  }
  addMemberVisible.value = true
}

// A new member needs an account first, then the company fields (team, position)
// that belong to administration rather than to the account itself. Both calls
// are made here so one action creates a usable member.
async function submitMember() {
  const email = addForm.value.email.trim()
  const password = addForm.value.password
  if (!email) {
    ElMessage({ message: 'Work email is required.', type: 'warning', plain: true })
    return
  }
  if (!settingStore.domainList.includes(email.split('@')[1] || '')) {
    ElMessage({ message: 'That email domain is not one of the company domains.', type: 'error', plain: true })
    return
  }
  if (!password || password.length < 6) {
    ElMessage({ message: 'The temporary password needs at least 6 characters.', type: 'warning', plain: true })
    return
  }
  addingMember.value = true
  try {
    const created = await userAdd({
      email,
      password,
      type: addForm.value.roleId ?? undefined,
      signatureText: '',
    })
    const newId = Number(created?.userId || created?.user_id || created?.user?.userId) || 0
    if (newId && addForm.value.teamId) {
      // Team is an administration field, so it is set through the assignment
      // route rather than being smuggled into account creation.
      await http.put(`/user/${newId}/assignment`, { teamId: addForm.value.teamId })
    }
    addMemberVisible.value = false
    await loadDirectory()
    await loadTeams()
    ElMessage({ message: 'Member added.', type: 'success', plain: true })
    if (newId) {
      // Take the admin straight into the new member's permissions so specific
      // access can be granted, edited or removed as part of account creation.
      accessTarget.value = { userId: newId, displayName: email }
      accessVisible.value = true
    }
  } catch (error) {
    ElMessage({ message: error.message || 'Could not add this member.', type: 'error', plain: true })
  } finally {
    addingMember.value = false
  }
}

onMounted(() => {
  loadDirectory()
  loadTeams()
  loadRoles()
})
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px; gap: 12px; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-subtitle { margin: 6px 0 0; max-width: 560px; color: var(--hq-muted); font-size: 13px; line-height: 1.5; }
.module-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.people-tabs { margin-top: 4px; }
.tab-count { display: inline-grid; min-width: 18px; height: 18px; margin-left: 6px; padding: 0 5px; place-items: center; border-radius: 9px; background: var(--hq-hover); color: var(--hq-muted); font-size: 11px; font-weight: 600; }
.directory-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.directory-count { color: var(--hq-muted); font-size: 12.5px; }
.directory-more { display: flex; justify-content: center; padding-top: 12px; }
.section-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.section-hint { margin: 0; max-width: 640px; color: var(--hq-muted); font-size: 12.5px; line-height: 1.5; }
.person-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.person-copy { display: grid; min-width: 0; }
.person-name { color: var(--hq-text); font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.person-handle { color: var(--hq-muted); font-size: 12px; }
.presence { font-size: 12px; font-weight: 550; }
.presence.is-online { color: var(--hq-success); }
.presence.is-offline { color: var(--hq-muted); }
.muted { color: var(--hq-muted); }
.loading-state { padding: 48px 0; text-align: center; color: var(--hq-muted); font-size: 13px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; max-width: 540px; margin: 0 auto; padding: 56px 20px; text-align: center; color: var(--hq-text-secondary); }
.empty-title { color: var(--hq-text); font-size: 15px; font-weight: 650; }
.empty-state p { margin: 0; font-size: 13px; line-height: 1.55; }
.empty-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }
</style>