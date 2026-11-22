<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / NOTES</div>
          <h1>{{ $t('notes') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'notes:add'" type="primary" icon="plus" @click="openDialog()">{{ $t('createNote') }}</el-button>
          <el-button  @click="loadNotes" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <div class="note-toolbar">
        <el-input v-model="search" :placeholder="$t('search')" clearable style="width: 240px" @input="onFilter" />
        <el-select v-model="priority" :placeholder="$t('priority')" clearable style="width: 150px" @change="onFilter">
          <el-option v-for="p in PRIORITIES" :key="p" :label="p" :value="p" />
        </el-select>
        <el-select v-model="sort" style="width: 170px" @change="onFilter">
          <el-option :label="$t('sortUpdated')" value="update_time" />
          <el-option :label="$t('sortCreated')" value="create_time" />
          <el-option :label="$t('sortPriority')" value="priority" />
          <el-option :label="$t('sortTitle')" value="title" />
        </el-select>
      </div>

      <el-card class="module-card">
        <div v-if="notes.length" class="notes-grid">
          <div v-for="note in notes" :key="note.id" class="note-card" :class="{ 'is-pinned': note.is_pinned }">
            <div class="note-head">
              <strong>{{ note.title || '—' }}</strong>
              <div class="note-actions">
                <el-button v-perm="'notes:edit'" size="small" link @click="togglePin(note)">{{ note.is_pinned ? $t('unpin') : $t('pin') }}</el-button>
                <el-button v-perm="'notes:edit'" size="small" link @click="openDialog(note)">{{ $t('edit') }}</el-button>
                <el-button v-perm="'notes:delete'" size="small" link type="danger" @click="deleteNote(note.id)">{{ $t('delete') }}</el-button>
              </div>
            </div>
            <p class="note-body">{{ note.content }}</p>
            <div class="note-meta">
              <el-tag v-if="note.priority && note.priority !== 'normal'" size="small" :type="priorityType(note.priority)">{{ note.priority }}</el-tag>
              <el-tag v-for="label in parseLabels(note.labels)" :key="label" size="small" type="info">{{ label }}</el-tag>
            </div>
            <span v-if="note.reminder_at" class="note-date">{{ $t('reminder') }}: {{ fmt(note.reminder_at) }}</span>
            <span class="note-date">{{ note.update_time ? note.update_time.slice(0, 16) : '' }}</span>
          </div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-title">No notes yet</div>
          <p>Capture decisions, research and reminders here. Notes stay private to you unless you share them, and any note can become a task or a request.</p>
          <div class="empty-actions">
            <el-button v-perm="'notes:add'" type="primary" icon="plus" @click="openDialog()">Write a note</el-button>
          </div>
        </div>
      </el-card>

      <el-dialog v-model="dialogVisible" :title="editingId ? $t('edit') : $t('createNote')" width="560px">
        <el-form label-width="90px">
          <el-form-item :label="$t('noteTitle')">
            <el-input v-model="form.title" />
          </el-form-item>
          <el-form-item :label="$t('content')">
            <el-input v-model="form.content" type="textarea" :rows="8" />
          </el-form-item>
          <el-form-item :label="$t('priority')">
            <el-select v-model="form.priority" style="width: 100%">
              <el-option v-for="p in PRIORITIES" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('labels')">
            <el-select v-model="form.labels" multiple filterable allow-create default-first-option style="width: 100%" />
          </el-form-item>
          <el-form-item :label="$t('reminder')">
            <el-date-picker v-model="form.reminder_at" type="datetime" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="$t('pin')">
            <el-switch v-model="form.is_pinned" :active-value="1" :inactive-value="0" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" @click="saveNote">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { notesList, notesCreate, notesUpdate, notesDelete, notesPin } from '@/request/notes.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'

import { useConfirm } from '@/composables/use-confirm.js'

const { confirm } = useConfirm()
const PRIORITIES = ['critical', 'high', 'normal', 'low']

const notes = ref([])
const search = ref('')
const priority = ref('')
const sort = ref('update_time')
const dialogVisible = ref(false)
useCreateIntent(() => openDialog())
const editingId = ref(null)
const form = ref({})

function parseLabels(v) {
  try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a : [] } catch { return [] }
}
function fmt(v) { return v ? String(v).slice(0, 16) : '' }
function priorityType(p) { return ({ critical: 'danger', high: 'warning', low: 'info' })[p] || '' }

function onFilter() { loadNotes() }

async function loadNotes() {
  try {
    const params = { page: 1, pageSize: 100, sort: sort.value }
    if (search.value) params.search = search.value
    if (priority.value) params.priority = priority.value
    const resp = await notesList(params)
    notes.value = resp.list || []
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to load notes.', type: 'error', plain: true })
  }
}

function openDialog(note) {
  editingId.value = note?.id ?? null
  form.value = note
    ? { ...note, labels: parseLabels(note.labels) }
    : { title: '', content: '', is_pinned: 0, priority: 'normal', labels: [], reminder_at: null, folder_id: null }
  dialogVisible.value = true
}

async function saveNote() {
  try {
    if (editingId.value) await notesUpdate(editingId.value, form.value)
    else await notesCreate(form.value)
    dialogVisible.value = false
    loadNotes()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to save note.', type: 'error', plain: true })
  }
}

async function togglePin(note) {
  try {
    await notesPin(note.id, note.is_pinned ? 0 : 1)
    loadNotes()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to update note.', type: 'error', plain: true })
  }
}

async function deleteNote(id) {
  if (!await confirm('Delete this note?')) return
  try {
    await notesDelete(id)
    loadNotes()
  } catch (error) {
    ElMessage({ message: error.message || 'Failed to delete note.', type: 'error', plain: true })
  }
}

onMounted(loadNotes)
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-actions { display: flex; gap: 8px; align-items: center; }
.note-toolbar { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; }
.module-card { min-width: 0; }
.notes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.note-card { display: flex; flex-direction: column; gap: 6px; padding: 14px; border: 1px solid var(--hq-border); border-radius: 8px; background: var(--hq-surface); }
.note-card.is-pinned { border-left: 3px solid var(--hq-accent); }
.note-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.note-actions { display: flex; gap: 2px; flex-shrink: 0; }
.note-body { margin: 0; color: var(--hq-text-secondary); font-size: 13px; white-space: pre-wrap; }
.note-meta { display: flex; flex-wrap: wrap; gap: 4px; }
.note-date { color: var(--hq-muted); font-size: 11px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; max-width: 540px; margin: 0 auto; padding: 56px 20px; text-align: center; color: var(--hq-text-secondary); }
.empty-title { color: var(--hq-text); font-size: 15px; font-weight: 650; }
.empty-state p { margin: 0; font-size: 13px; line-height: 1.55; }
.empty-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }
</style>