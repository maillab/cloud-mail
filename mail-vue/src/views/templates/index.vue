<template>
  <div class="templates-page">
    <div class="page-header">
      <div>
        <h2>Email templates</h2>
        <p>Save reusable subject lines and message content. Use <code v-pre>{{recipient_name}}</code>, <code v-pre>{{company}}</code>, and <code v-pre>{{sender_name}}</code> for personalized values.</p>
      </div>
      <el-button type="primary" @click="startNew">New template</el-button>
    </div>
    <el-table :data="templates" v-loading="loading">
      <el-table-column prop="name" label="Name" />
      <el-table-column prop="subject" label="Subject" />
      <el-table-column label="Actions" width="180">
        <template #default="{row}">
          <el-button text @click="edit(row)">Edit</el-button>
          <el-button type="danger" text @click="remove(row)">Delete</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-dialog v-model="dialogVisible" :title="form.templateId ? 'Edit template' : 'New template'" width="min(720px, 95vw)">
      <el-form label-position="top">
        <el-form-item label="Name">
          <el-input v-model="form.name" maxlength="60" />
        </el-form-item>
        <el-form-item label="Subject">
          <el-input v-model="form.subject" maxlength="500" />
        </el-form-item>
        <el-form-item label="Message content (HTML or plain text)">
          <el-input v-model="form.content" type="textarea" :rows="12" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="save">Save template</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {onMounted, reactive, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {mailboxTemplateDelete, mailboxTemplates, mailboxTemplateSave} from '@/request/mailbox.js'

const templates = ref([])
const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const form = reactive({templateId: 0, name: '', subject: '', content: ''})

async function loadTemplates() {
  loading.value = true
  try {
    templates.value = await mailboxTemplates()
  } finally {
    loading.value = false
  }
}

function startNew() {
  Object.assign(form, {templateId: 0, name: '', subject: '', content: ''})
  dialogVisible.value = true
}

function edit(template) {
  Object.assign(form, template)
  dialogVisible.value = true
}

async function save() {
  if (!form.name.trim()) {
    ElMessage({message: 'Enter a template name.', type: 'warning'})
    return
  }
  saving.value = true
  try {
    await mailboxTemplateSave({...form})
    dialogVisible.value = false
    await loadTemplates()
  } finally {
    saving.value = false
  }
}

async function remove(template) {
  try {
    await ElMessageBox.confirm(
      `Delete the "${template.name}" template?`,
      'Delete template',
      {type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'}
    )
  } catch (action) {
    if (action === 'cancel' || action === 'close') return
    throw action
  }
  await mailboxTemplateDelete(template.templateId)
  await loadTemplates()
}

onMounted(() => loadTemplates())
</script>

<style scoped>
.templates-page {
  height: 100%;
  overflow: auto;
  padding: 24px;
}

.page-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.page-header h2 {
  margin: 0 0 8px;
}

.page-header p {
  margin: 0;
  color: var(--el-text-color-secondary);
}
</style>
