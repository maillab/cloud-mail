<template>
  <el-scrollbar class="crm-scroll">
    <div class="crm-container">
      <div class="crm-header">
        <div class="crm-title">
          <div class="crm-eyebrow">XPASS HQ / CRM</div>
          <h1>Pipelines</h1>
        </div>
        <div class="crm-actions">
          <el-button v-perm="'pipelines:add'" type="primary" icon="plus" @click="openPipelineDialog">New pipeline</el-button>
          <el-button  @click="loadPipelines" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <el-card class="crm-card">
        <template #header>
          <div class="card-header">
            <span class="card-label">Sales pipelines</span>
          </div>
        </template>

        <el-table v-if="pipelines.length" :data="pipelines" style="width: 100%">
          <el-table-column prop="name" label="Name" min-width="200">
            <template #default="scope">{{ scope.row.name }}</template>
          </el-table-column>
          <el-table-column prop="slug" label="Slug" min-width="150">
            <template #default="scope">{{ scope.row.slug || '—' }}</template>
          </el-table-column>
          <el-table-column prop="description" label="Description" min-width="200">
            <template #default="scope">{{ scope.row.description || '—' }}</template>
          </el-table-column>
          <el-table-column prop="position" label="Position" min-width="100">
            <template #default="scope">{{ scope.row.position }}</template>
          </el-table-column>
          <el-table-column label="Stages" min-width="100">
            <template #default="scope">
              <el-button
                v-perm="'stages:query'"
                type="text"
                size="small"
                @click="viewStages(scope.row)"
                >View stages</el-button
              >
            </template>
          </el-table-column>
          <el-table-column label="Actions" fixed="right" min-width="140">
            <template #default="scope">
              <el-button v-perm="'pipelines:edit'" type="text" size="small" icon="edit" @click="editPipeline(scope.row)" />
              <el-button v-perm="'pipelines:delete'" type="text" size="small" icon="delete" @click="deletePipeline(scope.row)" />
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="empty-state">
          <p>No pipelines yet.</p>
          <el-button v-perm="'pipelines:add'" type="primary" @click="openPipelineDialog">Add your first pipeline</el-button>
        </div>
      </el-card>

      <el-dialog v-model="pipelineDialogVisible" title="Pipeline" width="520px">
        <el-form :model="pipelineForm" label-width="100px">
          <el-form-item label="Name" prop="name">
            <el-input v-model="pipelineForm.name" />
          </el-form-item>
          <el-form-item label="Slug" prop="slug">
            <el-input v-model="pipelineForm.slug" placeholder="url-friendly-slug" />
          </el-form-item>
          <el-form-item label="Description" prop="description">
            <el-input v-model="pipelineForm.description" />
          </el-form-item>
          <el-form-item label="Position" prop="position">
            <el-input-number v-model="pipelineForm.position" :min="0" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="pipelineDialogVisible = false">Cancel</el-button>
              <el-button type="primary" :loading="saving" @click="savePipeline">Save pipeline</el-button>
            </span>
          </template>
        </el-form>
      </el-dialog>

      <el-dialog v-model="stagesDialogVisible" :title="`Stages — ${selectedPipeline?.name}`" width="600px">
        <div class="stages-dialog">
          <el-table :data="stages" style="width: 100%">
            <el-table-column prop="name" label="Name" min-width="200">
              <template #default="scope">{{ scope.row.name }}</template>
            </el-table-column>
            <el-table-column prop="slug" label="Slug" min-width="150">
              <template #default="scope">{{ scope.row.slug || '—' }}</template>
            </el-table-column>
            <el-table-column prop="position" label="Position" min-width="100">
              <template #default="scope">{{ scope.row.position }}</template>
            </el-table-column>
            <el-table-column prop="color" label="Color" min-width="100">
              <template #default="scope">{{ scope.row.color || '—' }}</template>
            </el-table-column>
            <el-table-column label="Type" min-width="100">
              <template #default="scope">
                <span>{{ scope.row.is_won ? 'Won' : scope.row.is_lost ? 'Lost' : 'Open' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="Actions" fixed="right" min-width="140">
              <template #default="scope">
                <el-button v-perm="'pipelines:edit'" type="text" size="small" icon="edit" @click="editStage(scope.row)" />
                <el-button v-perm="'pipelines:delete'" type="text" size="small" icon="delete" @click="deleteStage(scope.row)" />
              </template>
            </el-table-column>
          </el-table>
          <el-button v-perm="'stages:add'" type="primary" size="small" icon="plus" @click="openStageDialog">New stage</el-button>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="stagesDialogVisible = false">Close</el-button>
          </span>
        </template>
      </el-dialog>

      <el-dialog v-model="stageDialogVisible" title="Stage" width="520px">
        <el-form :model="stageForm" label-width="100px">
          <el-form-item label="Name" prop="name">
            <el-input v-model="stageForm.name" />
          </el-form-item>
          <el-form-item label="Slug" prop="slug">
            <el-input v-model="stageForm.slug" />
          </el-form-item>
          <el-form-item label="Position" prop="position">
            <el-input-number v-model="stageForm.position" :min="0" />
          </el-form-item>
          <el-form-item label="Color" prop="color">
            <el-input v-model="stageForm.color" placeholder="#3b82f6" />
          </el-form-item>
          <el-form-item label="Is won" prop="is_won">
            <el-switch v-model="stageForm.is_won" active-text="Yes" inactive-text="No" />
          </el-form-item>
          <el-form-item label="Is lost" prop="is_lost">
            <el-switch v-model="stageForm.is_lost" active-text="Yes" inactive-text="No" />
          </el-form-item>
          <template #footer>
            <span class="dialog-footer">
              <el-button @click="stageDialogVisible = false">Cancel</el-button>
              <el-button type="primary" :loading="saving" @click="saveStage">Save stage</el-button>
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
import { pipelinesList, pipelinesCreate, pipelinesUpdate, pipelinesDelete } from '@/request/pipelines.js'
import { stagesList, stagesCreate, stagesUpdate, stagesDelete } from '@/request/stages.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const search = ref('')
const pipelines = ref([])
const stages = ref([])
const selectedPipeline = ref(null)
const loading = ref(false)
const saving = ref(false)

const pipelineDialogVisible = ref(false)
const pipelineForm = ref({
  id: null,
  name: '',
  slug: '',
  description: '',
  position: 1000
})

const stagesDialogVisible = ref(false)
const stageDialogVisible = ref(false)
const stageForm = ref({
  id: null,
  pipeline_id: null,
  name: '',
  slug: '',
  position: 1000,
  color: null,
  is_won: 0,
  is_lost: 0
})

const canAddPipeline = computed(() => hasPerm('pipelines:add'))
const canEditPipeline = computed(() => hasPerm('pipelines:edit'))
const canDeletePipeline = computed(() => hasPerm('pipelines:delete'))
const canAddStage = computed(() => hasPerm('pipelines:add'))

async function loadPipelines() {
  loading.value = true
  try {
    const resp = await pipelinesList({ page: 1, pageSize: 100 })
    pipelines.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load pipelines.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function viewStages(pipeline) {
  selectedPipeline.value = pipeline
  try {
    const resp = await stagesList({ pipeline_id: pipeline.id })
    stages.value = resp || []
    stagesDialogVisible.value = true
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load stages.', type: 'error', plain: true })
  }
}

function openPipelineDialog(pipeline = null) {
  if (pipeline) {
    pipelineForm.value = { ...pipeline }
  } else {
    pipelineForm.value = { id: null, name: '', slug: '', description: '', position: 1000 }
  }
  pipelineDialogVisible.value = true
}

async function savePipeline() {
  if (!pipelineForm.value.name.trim()) {
    ElMessage({ message: 'Name is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (pipelineForm.value.id) {
      await pipelinesUpdate(pipelineForm.value.id, pipelineForm.value)
    } else {
      await pipelinesCreate(pipelineForm.value)
    }
    pipelineDialogVisible.value = false
    await loadPipelines()
    ElMessage({ message: 'Pipeline saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save pipeline.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editPipeline(pipeline) {
  openPipelineDialog(pipeline)
}

async function deletePipeline(pipeline) {
  if (!await confirm(`Delete pipeline "${pipeline.name}"?`)) return
  try {
    await pipelinesDelete(pipeline.id)
    await loadPipelines()
    ElMessage({ message: 'Pipeline deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete pipeline.', type: 'error', plain: true })
  }
}

function openStageDialog(stage = null) {
  if (stage) {
    stageForm.value = { ...stage }
  } else {
    stageForm.value = {
      id: null,
      pipeline_id: selectedPipeline.value?.id || null,
      name: '',
      slug: '',
      position: 1000,
      color: null,
      is_won: 0,
      is_lost: 0
    }
  }
  stageDialogVisible.value = true
}

async function saveStage() {
  if (!stageForm.value.name.trim()) {
    ElMessage({ message: 'Name is required.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  try {
    if (stageForm.value.id) {
      await stagesUpdate(stageForm.value.id, stageForm.value)
    } else {
      await stagesCreate(stageForm.value)
    }
    stageDialogVisible.value = false
    if (selectedPipeline.value) {
      const resp = await stagesList({ pipeline_id: selectedPipeline.value.id })
      stages.value = resp || []
    }
    ElMessage({ message: 'Stage saved.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save stage.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

function editStage(stage) {
  openStageDialog(stage)
}

async function deleteStage(stage) {
  if (!await confirm(`Delete stage "${stage.name}"?`)) return
  try {
    await stagesDelete(stage.id)
    if (selectedPipeline.value) {
      const resp = await stagesList({ pipeline_id: selectedPipeline.value.id })
      stages.value = resp || []
    }
    ElMessage({ message: 'Stage deleted.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete stage.', type: 'error', plain: true })
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

.stages-dialog {
  margin-bottom: 16px;
}
</style>