<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / DOCUMENTS</div>
          <h1>{{ $t('documents') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'documents:add'" type="primary" icon="plus" @click="openUpload">{{ $t('upload') }}</el-button>
          <el-button v-perm="'documents:add'" icon="folder-add" @click="showFolderDialog = true">{{ $t('createFolder') }}</el-button>
          <el-button  @click="reload" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <div class="docs-layout">
        <aside class="folder-panel">
          <div class="folder-panel-head">{{ $t('documents') }}</div>
          <button class="folder-item" :class="{ 'is-active': activeFolder === null }" type="button" @click="selectFolder(null)">All</button>
          <button
            v-for="folder in folders"
            :key="folder.id"
            class="folder-item"
            :class="{ 'is-active': activeFolder === folder.id }"
            type="button"
            @click="selectFolder(folder.id)"
          >
            <Icon icon="fluent:folder-20-regular" width="16" height="16" />
            <span>{{ folder.name }}</span>
          </button>
        </aside>

        <el-card class="file-panel">
          <el-table v-if="documents.length" :data="documents" style="width: 100%">
            <el-table-column prop="name" :label="$t('fileName')" min-width="220" />
            <el-table-column :label="$t('crmOwner')" min-width="130">
              <template #default="scope">
                <span class="muted">{{ scope.row.owner_name || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="content_type" :label="$t('crmType')" min-width="140" />
            <el-table-column :label="$t('folder')" min-width="140">
              <template #default="scope">
                <el-tag v-if="folderLabel(scope.row.folder_id)" size="small" effect="plain" type="info">{{ folderLabel(scope.row.folder_id) }}</el-tag>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column :label="$t('size')" min-width="100">
              <template #default="scope">{{ formatSize(scope.row.size_bytes) }}</template>
            </el-table-column>
            <el-table-column prop="create_time" :label="$t('crmCreated')" min-width="150">
              <template #default="scope">{{ scope.row.create_time ? scope.row.create_time.slice(0, 16) : '—' }}</template>
            </el-table-column>
            <el-table-column :label="$t('actions')" min-width="160" fixed="right">
              <template #default="scope">
                <el-button size="small" @click="downloadDoc(scope.row)">{{ $t('download') }}</el-button>
                <el-button v-if="scope.row.can_delete" v-perm="'documents:delete'" size="small" type="danger" @click="deleteDoc(scope.row.id)">{{ $t('delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="empty-state">
            <div class="empty-title">No documents yet</div>
            <p>Company files you upload appear here. Upload agreements, research, and event paperwork so the team can find them without searching chat threads or Drive.</p>
            <div class="empty-actions">
              <el-button v-perm="'documents:add'" type="primary" icon="plus" @click="openUpload">Upload a document</el-button>
              <el-button v-perm="'documents:add'" icon="folder" @click="showFolderDialog = true">Create a folder</el-button>
            </div>
          </div>
        </el-card>
      </div>

      <el-dialog v-model="showFolderDialog" :title="$t('createFolder')" width="400px">
        <el-input v-model="folderName" :placeholder="$t('folderName')" />
        <template #footer>
          <el-button @click="showFolderDialog = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="createFolder">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="showUpload" :title="$t('upload')" width="440px">
        <el-upload
          drag
          :auto-upload="false"
          :limit="1"
          :on-change="onFileChange"
          :file-list="fileList"
        >
          <Icon icon="fluent:arrow-upload-20-regular" width="32" height="32" />
        </el-upload>
        <div class="upload-folder">
          <span class="upload-folder-label">{{ $t('folder') }}</span>
          <el-select v-model="uploadFolderId" placeholder="No folder" clearable style="flex: 1">
            <el-option v-for="folder in folders" :key="folder.id" :label="folder.name" :value="folder.id" />
          </el-select>
        </div>
        <template #footer>
          <el-button @click="showUpload = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :disabled="!pendingFile" @click="doUpload">{{ $t('upload') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { useConfirm } from '@/composables/use-confirm.js'
import {
  documentFoldersList, documentFoldersCreate,
  documentsList, documentsUpload, documentsDelete
} from '@/request/documents.js'

const { confirm } = useConfirm()

const folders = ref([])
const documents = ref([])
const activeFolder = ref(null)
const showFolderDialog = ref(false)
const showUpload = ref(false)
useCreateIntent(query => { if (query.create === 'folder') showFolderDialog.value = true; else showUpload.value = true })
const folderName = ref('')
const pendingFile = ref(null)
const fileList = ref([])
const uploadFolderId = ref(null)

function openUpload() {
  uploadFolderId.value = activeFolder.value ?? null
  showUpload.value = true
}

function folderLabel(id) {
  if (id === undefined || id === null || id === '') return ''
  const folder = folders.value.find((f) => String(f.id) === String(id))
  return folder ? folder.name : ''
}

async function reload() {
  await Promise.all([loadFolders(), loadDocuments()])
}

async function loadFolders() {
  try {
    const resp = await documentFoldersList()
    folders.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load folders.', type: 'error', plain: true })
  }
}

async function loadDocuments() {
  try {
    const resp = await documentsList({ folder_id: activeFolder.value })
    documents.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load documents.', type: 'error', plain: true })
  }
}

function selectFolder(id) {
  activeFolder.value = id
  loadDocuments()
}

async function createFolder() {
  if (!folderName.value.trim()) return
  try {
    await documentFoldersCreate({ name: folderName.value })
    folderName.value = ''
    showFolderDialog.value = false
    loadFolders()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to create folder.', type: 'error', plain: true })
  }
}

function onFileChange(file) {
  pendingFile.value = file.raw
  fileList.value = [file]
}

async function doUpload() {
  if (!pendingFile.value) return
  try {
    await documentsUpload(pendingFile.value, uploadFolderId.value)
    pendingFile.value = null
    fileList.value = []
    showUpload.value = false
    loadDocuments()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to upload.', type: 'error', plain: true })
  }
}

function downloadDoc(row) {
  const base = import.meta.env.VITE_BASE_URL || ''
  window.open(`${base}/documents/${row.id}/download`, '_blank')
}

async function deleteDoc(id) {
  if (!await confirm('Delete this document?')) return
  try {
    await documentsDelete(id)
    loadDocuments()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete.', type: 'error', plain: true })
  }
}

function formatSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(reload)
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-actions { display: flex; gap: 8px; align-items: center; }
.docs-layout { display: grid; grid-template-columns: 220px 1fr; gap: 16px; }
.folder-panel { padding: 10px; border: 1px solid var(--hq-border); border-radius: 10px; background: var(--hq-surface); }
.folder-panel-head { padding: 6px 8px 10px; color: var(--hq-muted); font-size: 11px; font-weight: 650; text-transform: uppercase; }
.folder-item { display: flex; width: 100%; align-items: center; gap: 8px; padding: 8px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--hq-text-secondary); font-size: 13px; text-align: left; cursor: pointer; }
.folder-item:hover { background: var(--hq-hover); color: var(--hq-text); }
.folder-item.is-active { background: var(--hq-selected); color: var(--hq-accent-strong); font-weight: 600; }
.file-panel { min-width: 0; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; max-width: 520px; margin: 0 auto; padding: 56px 20px; text-align: center; color: var(--hq-text-secondary); }
.empty-title { color: var(--hq-text); font-size: 15px; font-weight: 650; }
.empty-state p { margin: 0; font-size: 13px; line-height: 1.55; }
.empty-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }
.upload-folder { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.upload-folder-label { font-size: 12.5px; color: var(--hq-text-secondary); white-space: nowrap; }
.muted { color: var(--hq-muted); }
@media (max-width: 767px) { .docs-layout { grid-template-columns: 1fr; } }
</style>