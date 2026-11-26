<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / PROJECTS</div>
          <h1>{{ $t('projects') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'projects:add'" type="primary" icon="plus" @click="openCreate">{{ $t('createProject') }}</el-button>
          <el-button  @click="loadProjects" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="module-card">
        <el-table v-if="projects.length" :data="projects" style="width: 100%">
          <el-table-column prop="name" :label="$t('projectName')" min-width="200">
            <template #default="scope">{{ scope.row.name }}</template>
          </el-table-column>
          <el-table-column prop="description" :label="$t('projectDescription')" min-width="250">
            <template #default="scope">{{ scope.row.description }}</template>
          </el-table-column>
          <el-table-column prop="status" :label="$t('status')" min-width="100">
            <template #default="scope">
              <el-tag size="small" :class="`status-${scope.row.status}`">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="priority" :label="$t('priority')" min-width="100">
            <template #default="scope">{{ scope.row.priority }}</template>
          </el-table-column>
          <el-table-column prop="due_date" :label="$t('dueDate')" min-width="140">
            <template #default="scope">{{ scope.row.due_date ? scope.row.due_date.slice(0, 10) : '—' }}</template>
          </el-table-column>
          <el-table-column :label="$t('actions')" min-width="140" fixed="right">
            <template #default="scope">
              <el-button v-perm="'projects:edit'" size="small" @click="editProject(scope.row)">{{ $t('edit') }}</el-button>
              <el-button v-perm="'projects:delete'" size="small" type="danger" @click="deleteProject(scope.row.id)">{{ $t('delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <div class="empty-title">No projects yet</div>
          <p>A project groups an owner, members, tasks, files and deadlines for one piece of company work — a launch, an event build, a website release.</p>
          <div class="empty-actions">
            <el-button v-perm="'projects:add'" type="primary" icon="plus" @click="openCreate">Create a project</el-button>
          </div>
        </div>
      </el-card>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { projectsList, projectsCreate, projectsUpdate, projectsDelete } from '@/request/projects.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const projects = ref([])
const loading = ref(false)
const createDialog = ref(false)
useCreateIntent(() => openCreate())
const editDialog = ref(false)
const editingId = ref(null)
const form = ref({ name: '', description: '', status: 'active', priority: 'normal', due_date: '', owner_id: '' })

async function loadProjects() {
  loading.value = true
  try {
    const resp = await projectsList({ page: 1, pageSize: 100 })
    projects.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load projects.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function openCreate() {
  form.value = { name: '', description: '', status: 'active', priority: 'normal', due_date: '', owner_id: '' }
  editingId.value = null
  createDialog.value = true
}

async function editProject(row) {
  form.value = { ...row }
  editingId.value = row.id
  editDialog.value = true
}

async function saveProject() {
  try {
    if (editingId.value) {
      await projectsUpdate(editingId.value, form.value)
    } else {
      await projectsCreate(form.value)
    }
    createDialog.value = false
    editDialog.value = false
    loadProjects()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save project.', type: 'error', plain: true })
  }
}

async function deleteProject(id) {
  if (!await confirm('Delete this project?')) return
  try {
    await projectsDelete(id)
    loadProjects()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete project.', type: 'error', plain: true })
  }
}

onMounted(loadProjects)
</script>

<style scoped>
.module-scroll {
  height: 100%;
  background: var(--hq-page);
}

.module-container {
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 28px clamp(20px, 3vw, 42px) 36px;
  color: var(--hq-text);
}

.module-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.module-eyebrow {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.module-title h1 {
  margin: 4px 0 0;
  font-size: clamp(24px, 2.4vw, 30px);
  font-weight: 650;
  letter-spacing: -.035em;
  line-height: 1.2;
}

.module-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.module-card {
  min-width: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 540px;
  margin: 0 auto;
  padding: 56px 20px;
  text-align: center;
  color: var(--hq-text-secondary);
}

.empty-state p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
}

.status-active { color: var(--el-color-success); }
</style>
