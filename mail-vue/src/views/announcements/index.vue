<template>
  <div class="announcements-page">
    <header class="page-head">
      <div class="page-head-copy">
        <h1>Announcements</h1>
        <p class="page-sub">Company updates and notices from XPass leadership.</p>
      </div>
      <div class="page-head-actions">
        <span v-if="!manageMode && unreadCount > 0" class="unread-pill">{{ unreadCount }} unread</span>
        <el-button v-if="canManage" @click="toggleManage">{{ manageMode ? 'Member view' : 'Manage' }}</el-button>
        <el-button v-if="canManage && manageMode" type="primary" @click="openCreate">New announcement</el-button>
      </div>
    </header>

    <!-- ADMIN MANAGEMENT -->
    <section v-if="manageMode" class="manage-section">
      <el-table
        v-loading="manageLoading"
        :data="manageList"
        class="manage-table"
        empty-text="No announcements have been created yet."
      >
        <el-table-column prop="title" label="Title" min-width="220">
          <template #default="{ row }">
            <div class="title-cell">
              <span class="title-text">{{ row.title }}</span>
              <span v-if="row.pinned" class="pin-badge">Pinned</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="Status" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)" effect="light">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Priority" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="priorityType(row.priority)" effect="plain">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Published" width="170">
          <template #default="{ row }">
            <span class="date-text">{{ formatDate(row.published_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="260" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button
                v-if="row.status === 'draft' || row.status === 'scheduled'"
                size="small"
                type="primary"
                plain
                @click="setStatus(row, 'published')"
              >Publish</el-button>
              <el-button
                v-if="row.status === 'published'"
                size="small"
                plain
                @click="setStatus(row, 'archived')"
              >Archive</el-button>
              <el-button size="small" plain @click="openEdit(row)">Edit</el-button>
              <el-button size="small" type="danger" plain @click="removeAnnouncement(row)">Delete</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <!-- MEMBER FEED -->
    <section v-else class="feed-section">
      <div v-if="loading" class="state-box">Loading announcements…</div>
      <div v-else-if="memberList.length === 0" class="state-box state-empty">
        <p class="empty-title">No announcements yet</p>
        <p class="empty-sub">When leadership publishes an update, it will appear here.</p>
      </div>
      <div v-else class="feed-list">
        <article
          v-for="item in memberList"
          :key="item.id"
          class="announcement-card"
          :class="{ 'is-unread': !item.readAt }"
          @click="openMember(item)"
        >
          <div class="card-top">
            <span v-if="item.pinned" class="pin-badge">Pinned</span>
            <span class="priority-tag" :class="'priority-' + item.priority">{{ item.priority }}</span>
            <span class="card-date">{{ formatDate(item.publishedAt || item.createdAt) }}</span>
          </div>
          <h3 class="card-title">{{ item.title }}</h3>
          <p class="card-body" :class="{ 'is-clamped': expandedId !== item.id }">{{ item.body }}</p>
          <div class="card-foot">
            <span v-if="!item.readAt" class="unread-marker">
              <span class="unread-dot" aria-hidden="true"></span>Unread
            </span>
            <el-button
              v-if="item.requiresAck && !item.acknowledgedAt"
              size="small"
              type="primary"
              @click.stop="acknowledge(item)"
            >Acknowledge</el-button>
            <span v-else-if="item.acknowledgedAt" class="ack-marker">Acknowledged</span>
            <button
              v-if="expandedId !== item.id"
              type="button"
              class="read-more"
              @click.stop="openMember(item)"
            >Read more</button>
            <button
              v-else
              type="button"
              class="read-more"
              @click.stop="expandedId = ''"
            >Show less</button>
          </div>
        </article>
      </div>
    </section>

    <!-- CREATE / EDIT DIALOG -->
    <el-dialog
      v-model="dialogOpen"
      :title="editingId ? 'Edit announcement' : 'New announcement'"
      width="640px"
      @closed="resetForm"
    >
      <div class="ann-form">
        <div class="form-field">
          <label class="form-label">Title</label>
          <el-input v-model="form.title" maxlength="160" show-word-limit placeholder="e.g. Scheduled maintenance this weekend" />
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Priority</label>
            <el-select v-model="form.priority" class="full-width">
              <el-option label="Normal" value="normal" />
              <el-option label="Important" value="important" />
              <el-option label="Critical" value="critical" />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-label">Publish</label>
            <el-select v-model="form.status" class="full-width">
              <el-option label="Save as draft" value="draft" />
              <el-option label="Publish now" value="published" />
            </el-select>
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Message</label>
          <el-input
            v-model="form.body"
            type="textarea"
            :rows="7"
            maxlength="20000"
            show-word-limit
            placeholder="Write the announcement body. Line breaks are preserved."
          />
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Publish date (optional)</label>
            <el-input v-model="form.publishAt" placeholder="YYYY-MM-DD HH:mm" />
            <span class="form-hint">Leave blank to publish immediately.</span>
          </div>
          <div class="form-field form-toggles">
            <label class="toggle-row">
              <el-switch v-model="form.requiresAck" />
              <span>Require acknowledgement</span>
            </label>
            <label class="toggle-row">
              <el-switch v-model="form.pinned" />
              <span>Pin to the top</span>
            </label>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="dialogOpen = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveAnnouncement">{{ editingId ? 'Save changes' : 'Save announcement' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { hasPerm } from '@/perm/perm.js'
import {
  listAnnouncements,
  acknowledgeAnnouncement,
  markAnnouncementRead,
  manageAnnouncements,
  announcementDetail,
  createAnnouncement,
  updateAnnouncement,
  setAnnouncementStatus,
  deleteAnnouncement
} from '@/request/team.js'

defineOptions({ name: 'announcements' })

const canManage = computed(() => hasPerm('announcement:manage'))
const manageMode = ref(false)

// Member feed
const loading = ref(false)
const memberList = ref([])
const unreadCount = ref(0)
const expandedId = ref('')

// Admin management
const manageLoading = ref(false)
const manageList = ref([])

// Create / edit
const dialogOpen = ref(false)
const saving = ref(false)
const editingId = ref(null)
const form = ref(emptyForm())

function emptyForm() {
  return {
    title: '',
    body: '',
    priority: 'normal',
    status: 'draft',
    publishAt: '',
    requiresAck: false,
    pinned: false
  }
}

function formatDate(value) {
  if (!value) return ''
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('MMM D, YYYY h:mm A') : String(value)
}

function priorityType(priority) {
  if (priority === 'critical') return 'danger'
  if (priority === 'important') return 'warning'
  return 'info'
}

function statusType(status) {
  if (status === 'published') return 'success'
  if (status === 'archived') return 'info'
  if (status === 'scheduled') return 'warning'
  return 'info'
}

async function loadMember() {
  loading.value = true
  try {
    const res = await listAnnouncements()
    memberList.value = res?.list || []
    unreadCount.value = res?.unreadCount ?? 0
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load announcements.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

async function loadManage() {
  manageLoading.value = true
  try {
    manageList.value = await manageAnnouncements() || []
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load announcements.', type: 'error', plain: true })
  } finally {
    manageLoading.value = false
  }
}

function toggleManage() {
  manageMode.value = !manageMode.value
  if (manageMode.value) loadManage()
}

async function openMember(item) {
  expandedId.value = item.id
  if (!item.readAt) {
    try {
      await markAnnouncementRead(item.id)
      item.readAt = dayjs().format('YYYY-MM-DD HH:mm:ss')
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    } catch (error) {
      // Reading is best-effort; never block the feed.
    }
  }
}

async function acknowledge(item) {
  try {
    await acknowledgeAnnouncement(item.id)
    item.acknowledgedAt = dayjs().format('YYYY-MM-DD HH:mm:ss')
    ElMessage({ message: 'Acknowledgement recorded.', type: 'success', plain: true })
  } catch (error) {
    ElMessage({ message: error.message || 'Could not acknowledge this announcement.', type: 'error', plain: true })
  }
}

async function setStatus(row, status) {
  try {
    await setAnnouncementStatus(row.id, status)
    ElMessage({ message: status === 'published' ? 'Announcement published.' : 'Announcement archived.', type: 'success', plain: true })
    await loadManage()
    await loadMember()
  } catch (error) {
    ElMessage({ message: error.message || 'Could not update the announcement.', type: 'error', plain: true })
  }
}

async function removeAnnouncement(row) {
  try {
    await ElMessageBox.confirm(`Delete "${row.title}"? This cannot be undone.`, 'Delete announcement', {
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      type: 'warning'
    })
  } catch (error) {
    return
  }
  try {
    await deleteAnnouncement(row.id)
    ElMessage({ message: 'Announcement deleted.', type: 'success', plain: true })
    await loadManage()
    await loadMember()
  } catch (error) {
    ElMessage({ message: error.message || 'Could not delete the announcement.', type: 'error', plain: true })
  }
}

function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  dialogOpen.value = true
}

async function openEdit(row) {
  editingId.value = row.id
  form.value = emptyForm()
  dialogOpen.value = true
  try {
    const detail = await announcementDetail(row.id)
    const item = detail?.item || {}
    form.value = {
      title: item.title || '',
      body: item.body || '',
      priority: item.priority || 'normal',
      status: item.status === 'published' ? 'published' : 'draft',
      publishAt: item.publish_at ? String(item.publish_at).slice(0, 16) : '',
      requiresAck: Boolean(item.requires_ack),
      pinned: Boolean(item.pinned)
    }
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the announcement.', type: 'error', plain: true })
    dialogOpen.value = false
  }
}

function resetForm() {
  editingId.value = null
  form.value = emptyForm()
}

async function saveAnnouncement() {
  if (saving.value) return
  if (!form.value.title.trim()) {
    ElMessage({ message: 'Give the announcement a title.', type: 'warning', plain: true })
    return
  }
  if (!form.value.body.trim()) {
    ElMessage({ message: 'Write the announcement message.', type: 'warning', plain: true })
    return
  }
  saving.value = true
  const payload = {
    title: form.value.title.trim(),
    body: form.value.body,
    priority: form.value.priority,
    status: form.value.status,
    publishAt: form.value.publishAt || null,
    requiresAck: form.value.requiresAck,
    pinned: form.value.pinned,
    audience: [{ kind: 'all' }]
  }
  try {
    if (editingId.value) {
      await updateAnnouncement(editingId.value, payload)
      if (form.value.status === 'published') {
        await setAnnouncementStatus(editingId.value, 'published')
      }
      ElMessage({ message: 'Announcement updated.', type: 'success', plain: true })
    } else {
      const created = await createAnnouncement(payload)
      if (form.value.status === 'published' && created?.id) {
        await setAnnouncementStatus(created.id, 'published')
      }
      ElMessage({ message: 'Announcement created.', type: 'success', plain: true })
    }
    dialogOpen.value = false
    await loadManage()
    await loadMember()
  } catch (error) {
    ElMessage({ message: error.message || 'Could not save the announcement.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadMember()
})
</script>

<style scoped lang="scss">
.announcements-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 24px 28px 40px;
  overflow-y: auto;
  background: var(--hq-page);
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;

  .page-head-copy h1 {
    margin: 0 0 4px;
    font-size: 22px;
    font-weight: 700;
    color: var(--hq-text);
    letter-spacing: -.02em;
  }

  .page-sub {
    margin: 0;
    font-size: 13px;
    color: var(--hq-text-secondary);
  }

  .page-head-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}

.unread-pill {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--hq-selected);
  color: var(--hq-accent-strong);
  font-size: 12px;
  font-weight: 600;
}

.feed-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.state-box {
  padding: 48px 20px;
  text-align: center;
  color: var(--hq-muted);
  font-size: 13px;
}

.state-empty {
  border: 1px dashed var(--hq-border-strong);
  border-radius: 12px;
  background: var(--hq-surface);

  .empty-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
    color: var(--hq-text);
  }

  .empty-sub {
    margin: 0;
    font-size: 12.5px;
    color: var(--hq-muted);
  }
}

.feed-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.announcement-card {
  padding: 18px 20px;
  border: 1px solid var(--hq-border);
  border-radius: 12px;
  background: var(--hq-surface);
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;

  &:hover {
    border-color: var(--hq-border-strong);
    box-shadow: 0 2px 8px rgba(0, 0, 0, .05);
  }

  &.is-unread {
    border-left: 3px solid var(--hq-accent);
  }

  .card-top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .pin-badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--hq-selected);
    color: var(--hq-accent-strong);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .03em;
  }

  .priority-tag {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: .03em;
  }

  .priority-normal { background: var(--hq-hover); color: var(--hq-text-secondary); }
  .priority-important { background: color-mix(in srgb, var(--hq-warning) 18%, transparent); color: var(--hq-warning); }
  .priority-critical { background: color-mix(in srgb, var(--hq-danger) 16%, transparent); color: var(--hq-danger); }

  .card-date {
    margin-left: auto;
    font-size: 12px;
    color: var(--hq-muted);
  }

  .card-title {
    margin: 0 0 6px;
    font-size: 16px;
    font-weight: 650;
    color: var(--hq-text);
    letter-spacing: -.01em;
  }

  .card-body {
    margin: 0 0 12px;
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--hq-text-secondary);
    white-space: pre-wrap;
    word-break: break-word;

    &.is-clamped {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }

  .card-foot {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .unread-marker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--hq-accent-strong);

    .unread-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--hq-accent);
    }
  }

  .ack-marker {
    font-size: 12px;
    font-weight: 600;
    color: var(--hq-success, #16a34a);
  }

  .read-more {
    margin-left: auto;
    border: 0;
    background: transparent;
    padding: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--hq-accent);
    cursor: pointer;

    &:hover { text-decoration: underline; }
  }
}

.manage-section {
  border: 1px solid var(--hq-border);
  border-radius: 12px;
  background: var(--hq-surface);
  overflow: hidden;
}

.manage-table {
  width: 100%;

  .title-cell {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 550;
    color: var(--hq-text);
  }

  .date-text {
    font-size: 12.5px;
    color: var(--hq-muted);
  }

  .row-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
}

.ann-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--hq-text);
}

.form-hint {
  font-size: 11.5px;
  color: var(--hq-muted);
}

.form-row {
  display: flex;
  gap: 16px;

  @media (max-width: 640px) {
    flex-direction: column;
  }
}

.full-width {
  width: 100%;
}

.form-toggles {
  gap: 10px;
  justify-content: center;
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--hq-text-secondary);
  cursor: pointer;
}
</style>