<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>Tasks</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'tasks:add'" type="primary" icon="plus" @click="openTaskDialog">New task</el-button>
          <el-button  @click="loadTasks" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">Tasks</span>
            <el-select v-model="statusFilter" placeholder="Status" size="small" style="width: 120px">
              <el-option label="All" value="" />
              <el-option label="Pending" value="pending" />
              <el-option label="In progress" value="in_progress" />
              <el-option label="Completed" value="completed" />
            </el-select>
          </div>
        </template>

        <el-table v-if="tasks.length" :data="tasks" style="width: 100%">
          <el-table-column prop="title" label="Title" min-width="200">
            <template #default="scope">{{ scope.row.title }}</template>
          </el-table-column>
          <el-table-column prop="description" label="Description" min-width="250">
            <template #default="scope">{{ scope.row.description || '—' }}</template>
          </el-table-column>
          <el-table-column prop="status" label="Status" min-width="110">
            <template #default="scope">
              <el-tag :type="taskStatusType(scope.row.status)" size="small">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="priority" label="Priority" min-width="100">
            <template #default="scope">{{ scope.row.priority }}</template>
          </el-table-column>
          <el-table-column prop="due_at" label="Due" min-width="140">
            <template #default="scope">{{ scope.row.due_at || '—' }}</template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="140">
            <template #default="scope">
              <el-button v-perm="'tasks:edit'" type="text" size="small" icon="edit" @click="editTask(scope.row)" />
              <el-button v-perm="'tasks:delete'" type="text" size="small" icon="delete" @click="deleteTask(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>No tasks yet.</p>
          <el-button v-perm="'tasks:add'" type="primary" @click="openTaskDialog">Add your first task</el-button>
        </div>
      </el-card>

      <el-dialog v-model="taskDialogVisible" title="Task" width="560px">
        <el-form :model="taskForm" label-width="110px">
          <el-form-item label="Title" prop="title">
            <el-input v-model="taskForm.title" />
          </el-form-item>
          <el-form-item label="Description" prop="description">
            <el-input v-model="taskForm.description" type="textarea" rows="3" />
          </el-form-item>
          <el-form-item label="Deal" prop="deal_id">
            <el-select v-model="taskForm.deal_id" placeholder="Select deal">
              <el-option v-for="d in deals" :key="d.id" :label="d.title" :value="d.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Contact" prop="contact_id">
            <el-select v-model="taskForm.contact_id" placeholder="Select contact">
              <el-option v-for="c in contacts" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="Status" prop="status">
            <el-select v-model="taskForm.status">
              <el-option label="Pending" value="pending" />
              <el-option label="In progress" value="in_progress" />
              <el-option label="Completed" value="completed" />
            </el-select>
          </el-form-item>
          <el-form-item label="Priority" prop="priority">
            <el-select v-model="taskForm.priority">
              <el-option label="Low" value="low" />
              <el-option label="Medium" value="medium" />
              <el-option label="High" value="high" />
            </el-select>
          </el-form-item>
          <el-form-item label="Due date" prop="due_at">
            <el-date-picker v-model="taskForm.due_at" type="datetime" value-format="yyyy-MM-dd HH:mm:ss" />
          </el-form-item>
          <el-form-item label="Assigned to" prop="assigned_to">
            <el-input v-model="taskForm.assigned_to" placeholder="User ID" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="taskDialogVisible = false">Cancel</el-button>
              <el-button type="primary" :loading="saving" @click="saveTask">Save task</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { hasPerm } from '@/perm/perm.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { tasksList, tasksCreate, tasksUpdate, tasksDelete } from '@/request/tasks.js'
import { dealsList } from '@/request/deals.js'
import { contactsList } from '@/request/contacts.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const statusFilter = ref('')
const tasks = ref([])
const deals = ref([])
const contacts = ref([])
const loading = ref(false)
const saving = ref(false)

const taskDialogVisible = ref(false)
useCreateIntent(() => openTaskDialog())
const taskForm = ref({
  id: null,
  title: '',
  description: '',
  deal_id: null,
  contact_id: null,
  status: 'pending',
  priority: 'medium',
  due_at: '',
  assigned_to: null
})

const canAdd = computed(() => hasPerm('tasks:add'))
const canEdit = computed(() => hasPerm('tasks:edit'))
const canDelete = computed(() => hasPerm('tasks:delete'))

async function loadTasks() {
  loading.value = true
  try {
    const resp = await tasksList({ page: 1, pageSize: 100, status: statusFilter.value || undefined })
    tasks.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load tasks.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function loadReferenceData() {
  const [dResp, cResp] = await Promise.all([
    dealsList({ page: 1, pageSize: 100 }),
    contactsList({ page: 1, pageSize: 100 })
  ])
  deals.value = dResp.list || []
  contacts.value = cResp.list || []
}

function taskStatusType(status) {
  const map = { pending: 'warning', in_progress: 'info', completed: 'success' }
  return map[status] || 'info'
}

function openTaskDialog(task = null) {
  if (task) {
    taskForm.value = { ...task }
  } else {
    taskForm.value = { id: null, title: '', description: '', deal_id: null, contact_id: null, status: 'pending', priority: 'medium', due_at: '', assigned_to: null }
  }
  taskDialogVisible.value = true
  loadReferenceData()
}

async function saveTask() {
  if (!taskForm.value.title.trim()) {
    ElMessage({ message: 'Title is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (taskForm.value.id) {
      await tasksUpdate(taskForm.value.id, taskForm.value)
    } else {
      await tasksCreate(taskForm.value)
    }
    taskDialogVisible.value = false
    await loadTasks()
    ElMessage({ message: 'Task saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save task.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editTask(task) {
  openTaskDialog(task)
}

async function deleteTask(task) {
  if (!await confirm(`Delete task "${task.title}"?`)) return
  try {
    await tasksDelete(task.id)
    await loadTasks()
    ElMessage({ message: 'Task deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete task.', type: 'error', plain: true })
  }
}
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