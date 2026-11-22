<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Finance settings</div>
        <h2>Configuration</h2>
      </div>
      <span class="fin-scope">{{ data.canManage ? 'You can edit these lists' : 'Read only' }}</span>
    </header>

    <div v-loading="loading" class="fin-config">
      <section v-for="kind in data.kinds" :key="kind.key" class="fin-card">
        <div class="fin-card-head">
          <h3>{{ kind.label }}</h3>
          <el-button
            v-if="data.canManage"
            text
            size="small"
            icon="plus"
            @click="openCreate(kind.key)"
          >Add</el-button>
        </div>
        <div v-if="!(data.config[kind.key] || []).length" class="fin-empty">
          No {{ kind.label.toLowerCase() }} defined yet.
        </div>
        <ul v-else class="fin-list">
          <li v-for="item in data.config[kind.key]" :key="item.id">
            <span class="fin-list-title">{{ item.name }}</span>
            <div v-if="data.canManage" class="fin-list-actions">
              <el-button text size="small" icon="edit" title="Rename" @click="openEdit(kind.key, item)" />
              <el-button text size="small" icon="delete" type="danger" title="Delete" @click="remove(kind.key, item)" />
            </div>
          </li>
        </ul>
      </section>
    </div>

    <el-dialog v-model="dialog" :title="editing ? 'Edit entry' : 'New entry'" width="420px">
      <el-form label-position="top">
        <el-form-item :label="kindLabel(form.kind)">
          <el-input v-model="form.name" maxlength="80" show-word-limit placeholder="Name" @keyup.enter="save" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="save">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  financeConfig, financeConfigCreate, financeConfigUpdate, financeConfigDelete,
} from '@/request/finance.js'

const loading = ref(false)
const saving = ref(false)
const dialog = ref(false)
const editing = ref(null)

const data = reactive({
  canManage: false,
  kinds: [],
  config: {},
})

const form = reactive({ kind: 'expense', name: '' })

function kindLabel(key) {
  return (data.kinds.find(k => k.key === key) || {}).label || key
}

function openCreate(kind) {
  editing.value = null
  form.kind = kind
  form.name = ''
  dialog.value = true
}

function openEdit(kind, item) {
  editing.value = item
  form.kind = kind
  form.name = item.name
  dialog.value = true
}

async function save() {
  const name = form.name.trim()
  if (!name) {
    ElMessage({ message: 'Give it a name.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (editing.value) {
      await financeConfigUpdate(editing.value.id, { name })
      ElMessage({ message: 'Saved.', type: 'success', plain: true })
    } else {
      await financeConfigCreate({ kind: form.kind, name })
      ElMessage({ message: 'Added.', type: 'success', plain: true })
    }
    dialog.value = false
    await load()
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function remove(kind, item) {
  try {
    await ElMessageBox.confirm(
      `Delete "${item.name}" from ${kindLabel(kind).toLowerCase()}? Existing records keep their value; only the dropdown changes.`,
      'Delete entry',
      { type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel' },
    )
  } catch {
    return
  }
  try {
    await financeConfigDelete(item.id)
    ElMessage({ message: 'Deleted.', type: 'success', plain: true })
    await load()
  } catch (error) {
    ElMessage({ message: error.message || 'Could not delete.', type: 'error', plain: true })
  }
}

async function load() {
  loading.value = true
  try {
    const result = await financeConfig()
    data.canManage = Boolean(result.canManage)
    data.kinds = result.kinds || []
    data.config = result.config || {}
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load configuration.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.fin-panel {
  display: grid;
  gap: 16px;
  max-width: 900px;
}

.fin-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.fin-kicker {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.fin-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -.03em;
}

.fin-scope {
  color: var(--hq-muted);
  font-size: 12px;
}

.fin-config {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.fin-card {
  padding: 14px 16px 16px;
  border: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
  border-radius: 11px;
  background: var(--hq-surface, transparent);
}

.fin-card-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.fin-card-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  color: var(--hq-text-secondary);
}

.fin-empty {
  padding: 10px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
}

.fin-list {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.fin-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--hq-border, rgba(148, 163, 184, .14));
}

.fin-list li:last-child {
  border-bottom: 0;
}

.fin-list-title {
  overflow: hidden;
  color: var(--hq-text);
  font-size: 12.5px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fin-list-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
}
</style>