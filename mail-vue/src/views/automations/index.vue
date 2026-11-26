<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / AUTOMATIONS</div>
          <h1>{{ $t('automations') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'automations:add'" type="primary" icon="plus" @click="openDialog()">{{ $t('createRule') }}</el-button>
          <el-button  @click="loadRules" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="module-card">
        <el-table v-if="rules.length" :data="rules" style="width: 100%">
          <el-table-column prop="name" :label="$t('ruleName')" min-width="180" />
          <el-table-column prop="trigger_type" :label="$t('trigger')" min-width="120" />
          <el-table-column prop="action_type" :label="$t('action')" min-width="120" />
          <el-table-column :label="$t('enabled')" min-width="90">
            <template #default="scope">
              <el-tag size="small" :type="scope.row.enabled ? 'success' : 'info'">{{ scope.row.enabled ? $t('enabled') : 'Off' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="$t('actions')" min-width="140" fixed="right">
            <template #default="scope">
              <el-button v-perm="'automations:edit'" size="small" @click="openDialog(scope.row)">{{ $t('edit') }}</el-button>
              <el-button v-perm="'automations:delete'" size="small" type="danger" @click="deleteRule(scope.row.id)">{{ $t('delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>{{ $t('noAutomations') }}</p>
          <el-button v-perm="'automations:add'" type="primary" @click="openDialog()">{{ $t('createRule') }}</el-button>
        </div>
      </el-card>

      <el-dialog v-model="dialogVisible" :title="editingId ? $t('edit') : $t('createRule')" width="480px">
        <el-form label-width="80px">
          <el-form-item :label="$t('ruleName')">
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="$t('trigger')">
            <el-select v-model="form.trigger_type" style="width: 100%">
              <el-option label="manual" value="manual" />
              <el-option label="schedule" value="schedule" />
              <el-option label="event" value="event" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('action')">
            <el-select v-model="form.action_type" style="width: 100%">
              <el-option label="notify" value="notify" />
              <el-option label="create_task" value="create_task" />
              <el-option label="send_email" value="send_email" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('enabled')">
            <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="saveRule">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { automationsList, automationsCreate, automationsUpdate, automationsDelete } from '@/request/automations.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const rules = ref([])
const dialogVisible = ref(false)
const editingId = ref(null)
const form = ref({ name: '', trigger_type: 'manual', action_type: 'notify', enabled: 1 })

async function loadRules() {
  try { rules.value = (await automationsList()).list || [] } catch (e) { ElMessage({ message: e.message || 'Failed.', type: 'error', plain: true }) }
}

function openDialog(row) {
  editingId.value = row?.id ?? null
  form.value = row ? { name: row.name, trigger_type: row.trigger_type, action_type: row.action_type, enabled: row.enabled } : { name: '', trigger_type: 'manual', action_type: 'notify', enabled: 1 }
  dialogVisible.value = true
}

async function saveRule() {
  try {
    if (editingId.value) await automationsUpdate(editingId.value, form.value)
    else await automationsCreate(form.value)
    dialogVisible.value = false
    loadRules()
  } catch (e) { ElMessage({ message: e.message || 'Failed.', type: 'error', plain: true }) }
}

async function deleteRule(id) {
  if (!await confirm('Delete this rule?')) return
  try { await automationsDelete(id); loadRules() } catch (e) { ElMessage({ message: e.message || 'Failed.', type: 'error', plain: true }) }
}

onMounted(loadRules)
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-actions { display: flex; gap: 8px; align-items: center; }
.module-card { min-width: 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: var(--hq-text-secondary); }
</style>