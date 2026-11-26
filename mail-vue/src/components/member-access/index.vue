<template>
  <el-drawer
    v-model="visible"
    :title="title"
    direction="rtl"
    size="520px"
    @closed="reset"
  >
    <div v-loading="loading" class="ma-body">
      <p class="ma-note">
        This person starts with the access plan shown on their profile. Use the controls below only for a direct exception:
        <strong>Use baseline</strong> keeps the plan, <strong>Allow</strong> gives this exact capability, and <strong>Block</strong> removes it for this person.
      </p>

      <div class="ma-filter">
        <el-input v-model="filter" placeholder="Filter permissions" clearable size="small">
          <template #prefix>
            <Icon icon="fluent:search-20-regular" width="14" height="14" />
          </template>
        </el-input>
      </div>

      <div class="ma-global">
        <div class="ma-global-summary">
          <span class="ma-chip ma-chip-allow">{{ summary.allow }} allowed</span>
          <span class="ma-chip ma-chip-deny">{{ summary.deny }} denied</span>
          <span class="ma-chip">{{ summary.inherit }} using baseline</span>
        </div>
        <div class="ma-global-actions">
          <span class="ma-global-label">Set all modules:</span>
          <el-button size="small" @click="applyGlobal('view')">View access</el-button>
          <el-button size="small" @click="applyGlobal('full')">Can manage</el-button>
          <el-button size="small" @click="applyGlobal('deny')">No access</el-button>
          <el-button size="small" text @click="applyGlobal('inherit')">Use baseline</el-button>
        </div>
      </div>

      <div class="ma-groups">
        <div v-for="group in visibleGroups" :key="group.id" class="ma-group">
          <button type="button" class="ma-group-head" @click="toggle(group.id)">
            <Icon :icon="isOpen(group.id) ? 'fluent:chevron-down-12-regular' : 'fluent:chevron-right-12-regular'" width="14" height="14" />
            <span class="ma-group-name">{{ group.label }}</span>
            <span class="ma-group-summary">{{ groupSummary(group) }}</span>
          </button>

          <div class="ma-module-control">
            <span>Whole module</span>
            <el-select :model-value="modulePreset(group)" size="small" style="width: 170px" @change="value => setModulePreset(group, value)">
              <el-option label="Use baseline access" value="inherit" />
              <el-option label="View access" value="view" />
              <el-option label="Can manage" value="full" />
              <el-option label="No access" value="deny" />
              <el-option label="Custom" value="custom" disabled />
            </el-select>
          </div>

          <div v-show="isOpen(group.id)" class="ma-leaves">
            <div v-for="leaf in group.leaves" :key="leaf.perm_id" class="ma-leaf">
              <span class="ma-leaf-label">{{ leaf.label }}</span>
              <el-select v-model="draft[leaf.perm_key]" size="small" style="width: 128px">
                <el-option label="Use baseline" value="inherit" />
                <el-option label="Allow" value="allow" />
                <el-option label="Block" value="deny" />
              </el-select>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!visibleGroups.length" class="ma-empty">
        {{ filter ? 'No permissions match your filter.' : 'There are no permissions to edit.' }}
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">Cancel</el-button>
      <el-button type="primary" :loading="saving" @click="save">Save access</el-button>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { rolePermTree } from '@/request/role.js'
import { accessPreview, setMemberAccess } from '@/request/profile.js'
import { groupPermissions } from '@/perm/permission-labels.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  userId: { type: [Number, String], default: null },
  userName: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const title = computed(() => `Permissions — ${props.userName || 'Member'}`)

const loading = ref(false)
const saving = ref(false)
const groups = ref([])
const draft = reactive({})
const initial = reactive({})
const filter = ref('')
const open = reactive({})

watch(
  () => props.modelValue,
  (value) => {
    if (value) load()
  }
)

async function load() {
  if (!props.userId) return
  loading.value = true
  try {
    const [tree, data] = await Promise.all([rolePermTree(), accessPreview(props.userId)])
    groups.value = groupPermissions(tree || [])
    const overrides = new Map((data?.overrides || []).map((o) => [o.perm_key, o.effect]))
    for (const group of groups.value) {
      for (const leaf of group.leaves) {
        const state = overrides.get(leaf.perm_key) || 'inherit'
        draft[leaf.perm_key] = state
        initial[leaf.perm_key] = state
      }
    }
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load permissions.', type: 'error', plain: true })
    visible.value = false
  } finally {
    loading.value = false
  }
}

function reset() {
  for (const key of Object.keys(draft)) delete draft[key]
  for (const key of Object.keys(initial)) delete initial[key]
  for (const key of Object.keys(open)) delete open[key]
  groups.value = []
  filter.value = ''
}

function isOpen(id) {
  return Boolean(open[id])
}

function toggle(id) {
  open[id] = !open[id]
}

const visibleGroups = computed(() => {
  const needle = filter.value.trim().toLowerCase()
  if (!needle) return groups.value
  return groups.value
    .map((group) => {
      const groupHit = group.label.toLowerCase().includes(needle)
      const leaves = groupHit
        ? group.leaves
        : group.leaves.filter((leaf) =>
            leaf.label.toLowerCase().includes(needle) || leaf.perm_key.toLowerCase().includes(needle))
      return leaves.length ? { ...group, leaves } : null
    })
    .filter(Boolean)
})

function actionPartOf(permKey) {
  const idx = String(permKey || '').indexOf(':')
  return idx === -1 ? '' : String(permKey).slice(idx + 1)
}

function isViewAction(permKey) {
  const action = actionPartOf(permKey)
  return action === 'query' || action === 'view' || action === 'read'
}

const summary = computed(() => {
  let allow = 0
  let deny = 0
  let inherit = 0
  for (const group of groups.value) {
    for (const leaf of group.leaves) {
      const state = draft[leaf.perm_key]
      if (state === 'allow') allow += 1
      else if (state === 'deny') deny += 1
      else inherit += 1
    }
  }
  return { allow, deny, inherit }
})

// Derive a human preset from the current per-permission states so the module
// control shows "View only" / "Full" / "None" / "Inherit" / "Custom".
function modulePreset(group) {
  const leaves = group.leaves
  if (!leaves.length) return 'inherit'
  const total = leaves.length
  let allow = 0
  let deny = 0
  let inherit = 0
  for (const leaf of leaves) {
    const state = draft[leaf.perm_key]
    if (state === 'allow') allow += 1
    else if (state === 'deny') deny += 1
    else inherit += 1
  }
  if (inherit === total) return 'inherit'
  if (allow === total) return 'full'
  if (deny === total) return 'deny'
  const viewLeaves = leaves.filter((leaf) => isViewAction(leaf.perm_key))
  const otherLeaves = leaves.filter((leaf) => !isViewAction(leaf.perm_key))
  const viewOk = viewLeaves.every((leaf) => draft[leaf.perm_key] === 'allow')
  const otherOk = otherLeaves.every((leaf) => draft[leaf.perm_key] === 'deny')
  if (viewOk && otherOk && allow + deny > 0) return 'view'
  return 'custom'
}

function setModulePreset(group, preset) {
  if (preset === 'custom') return
  for (const leaf of group.leaves) {
    if (preset === 'inherit') draft[leaf.perm_key] = 'inherit'
    else if (preset === 'full') draft[leaf.perm_key] = 'allow'
    else if (preset === 'deny') draft[leaf.perm_key] = 'deny'
    else if (preset === 'view') draft[leaf.perm_key] = isViewAction(leaf.perm_key) ? 'allow' : 'deny'
  }
}

function applyGlobal(preset) {
  for (const group of groups.value) setModulePreset(group, preset)
}

function groupSummary(group) {
  const values = group.leaves.map((leaf) => draft[leaf.perm_key])
  const allows = values.filter((v) => v === 'allow').length
  const denies = values.filter((v) => v === 'deny').length
  if (!allows && !denies) return 'Inherited'
  return `${allows} allow · ${denies} deny`
}

async function save() {
  if (!props.userId) return
  saving.value = true
  try {
    const allow = []
    const deny = []
    const inherit = []
    for (const group of groups.value) {
      for (const leaf of group.leaves) {
        const next = draft[leaf.perm_key]
        const prev = initial[leaf.perm_key]
        if (!next || next === prev) continue
        if (next === 'allow') allow.push(leaf.perm_key)
        else if (next === 'deny') deny.push(leaf.perm_key)
        else inherit.push(leaf.perm_key)
      }
    }
    if (allow.length) await setMemberAccess(props.userId, allow, 'allow')
    if (deny.length) await setMemberAccess(props.userId, deny, 'deny')
    if (inherit.length) await setMemberAccess(props.userId, inherit, 'inherit')
    ElMessage({ message: 'Permissions updated.', type: 'success', plain: true })
    visible.value = false
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save permissions.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.ma-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.ma-note {
  margin: 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.ma-filter {
  position: sticky;
  top: 0;
  background: var(--el-bg-color);
  padding-bottom: 4px;
  z-index: 1;
}

.ma-global {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--hq-border);
  border-radius: 10px;
  background: var(--hq-page);
}

.ma-global-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ma-chip {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 11.5px;
  font-weight: 600;
}

.ma-chip-allow {
  background: color-mix(in srgb, #16a34a 16%, transparent);
  color: #15803d;
}

.ma-chip-deny {
  background: color-mix(in srgb, var(--hq-danger) 16%, transparent);
  color: var(--hq-danger);
}

.ma-global-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ma-global-label {
  font-size: 12px;
  color: var(--hq-muted);
  margin-right: 2px;
}

.ma-groups {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ma-group {
  border: 1px solid var(--hq-border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--hq-surface);
}

.ma-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 11px 14px;
  border: 0;
  background: transparent;
  color: var(--hq-text);
  text-align: left;
  cursor: pointer;
}

.ma-group-head:hover {
  background: var(--hq-hover);
}

.ma-group-name {
  font-size: 13px;
  font-weight: 650;
}

.ma-group-summary {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--hq-muted);
}

.ma-module-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--hq-border);
  border-bottom: 1px solid var(--hq-border);
  background: var(--hq-page);
  font-size: 12px;
  color: var(--hq-muted);
}

.ma-leaves {
  display: flex;
  flex-direction: column;
  padding: 6px 14px 10px;
  gap: 2px;
}

.ma-leaf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.ma-leaf-label {
  font-size: 12.5px;
  color: var(--hq-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-empty {
  padding: 40px 20px;
  text-align: center;
  color: var(--hq-muted);
  font-size: 13px;
}
</style>
