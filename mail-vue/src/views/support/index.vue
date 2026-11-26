<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / SUPPORT</div>
          <h1>{{ $t('support') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'support:add'" type="primary" icon="plus" @click="openDialog()">{{ $t('createRequest') }}</el-button>
          <el-button  @click="loadRequests" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="module-card">
        <el-table v-if="requests.length" :data="requests" style="width: 100%">
          <el-table-column prop="title" :label="$t('requestTitle')" min-width="200" />
          <el-table-column prop="status" :label="$t('status')" min-width="110">
            <template #default="scope"><el-tag size="small">{{ scope.row.status }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="priority" :label="$t('priority')" min-width="100" />
          <el-table-column prop="create_time" :label="$t('crmCreated')" min-width="150">
            <template #default="scope">{{ scope.row.create_time ? scope.row.create_time.slice(0, 16) : '—' }}</template>
          </el-table-column>
          <el-table-column :label="$t('actions')" min-width="140" fixed="right">
            <template #default="scope">
              <el-button v-perm="'support:edit'" size="small" @click="openDialog(scope.row)">{{ $t('edit') }}</el-button>
              <el-button v-perm="'support:delete'" size="small" type="danger" @click="deleteRequest(scope.row.id)">{{ $t('delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>{{ $t('noRequests') }}</p>
          <el-button v-perm="'support:add'" type="primary" @click="openDialog()">{{ $t('createRequest') }}</el-button>
        </div>
      </el-card>

      <el-dialog v-model="dialogVisible" :title="editingId ? $t('edit') : $t('createRequest')" width="520px">
        <el-form label-width="90px">
          <el-form-item :label="$t('requestTitle')">
            <el-input v-model="form.title" />
          </el-form-item>
          <el-form-item :label="$t('requestDescription')">
            <el-input v-model="form.description" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="$t('status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="open" value="open" />
              <el-option label="in_progress" value="in_progress" />
              <el-option label="resolved" value="resolved" />
              <el-option label="closed" value="closed" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('priority')">
            <el-select v-model="form.priority" style="width: 100%">
              <el-option label="low" value="low" />
              <el-option label="normal" value="normal" />
              <el-option label="high" value="high" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="saveRequest">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { supportList, supportCreate, supportUpdate, supportDelete } from '@/request/support.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const requests = ref([])
const dialogVisible = ref(false)
const editingId = ref(null)
const form = ref({ title: '', description: '', status: 'open', priority: 'normal', assignee_id: null })

async function loadRequests() {
  try {
    const resp = await supportList({ page: 1, pageSize: 100 })
    requests.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load requests.', type: 'error', plain: true })
  }
}

function openDialog(row) {
  editingId.value = row?.id ?? null
  form.value = row ? { ...row } : { title: '', description: '', status: 'open', priority: 'normal', assignee_id: null }
  dialogVisible.value = true
}

async function saveRequest() {
  try {
    if (editingId.value) await supportUpdate(editingId.value, form.value)
    else await supportCreate(form.value)
    dialogVisible.value = false
    loadRequests()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save request.', type: 'error', plain: true })
  }
}

async function deleteRequest(id) {
  if (!await confirm('Delete this request?')) return
  try {
    await supportDelete(id)
    loadRequests()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete request.', type: 'error', plain: true })
  }
}

onMounted(loadRequests)
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
.empty-state p { margin-bottom: 12px; }
</style>