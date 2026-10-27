<template>
  <div class="folder-settings">
    <h2>Folder management</h2>
    <p>Create and remove your personal mail folders. Removing a folder does not delete its messages.</p>
    <div class="create-row">
      <el-input v-model="name" maxlength="60" placeholder="Folder name" @keyup.enter="createFolder" />
      <el-button type="primary" :loading="saving" @click="createFolder">Create folder</el-button>
    </div>
    <el-table :data="folders" v-loading="loading">
      <el-table-column prop="name" label="Folder" />
      <el-table-column prop="unreadCount" label="Unread" width="120" />
      <el-table-column label="Actions" width="140">
        <template #default="{row}">
          <el-button type="danger" text @click="removeFolder(row)">Delete</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import {onMounted, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {mailboxFolderCreate, mailboxFolderDelete, mailboxFolderList} from '@/request/mailbox.js'

const folders = ref([])
const name = ref('')
const loading = ref(false)
const saving = ref(false)

async function loadFolders() {
  loading.value = true
  try {
    folders.value = await mailboxFolderList()
  } finally {
    loading.value = false
  }
}

async function createFolder() {
  if (!name.value.trim()) {
    ElMessage({message: 'Enter a folder name.', type: 'warning'})
    return
  }
  saving.value = true
  try {
    await mailboxFolderCreate(name.value)
    name.value = ''
    await loadFolders()
    window.dispatchEvent(new Event('mailbox:updated'))
  } finally {
    saving.value = false
  }
}

async function removeFolder(folder) {
  try {
    await ElMessageBox.confirm(
      `Delete the "${folder.name}" folder? Its messages will remain in your mailbox.`,
      'Delete folder',
      {type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel'}
    )
  } catch (action) {
    if (action === 'cancel' || action === 'close') return
    throw action
  }
  await mailboxFolderDelete(folder.folderId)
  await loadFolders()
  window.dispatchEvent(new Event('mailbox:updated'))
}

onMounted(() => loadFolders())
</script>

<style scoped>
.folder-settings {
  height: 100%;
  overflow: auto;
  padding: 24px;
}

.folder-settings h2 {
  margin: 0 0 8px;
}

.folder-settings p {
  color: var(--el-text-color-secondary);
}

.create-row {
  display: flex;
  gap: 12px;
  max-width: 620px;
  margin: 20px 0;
}
</style>
