<template>
  <el-scrollbar class="module-scroll">
    <div class="module-container">
      <div class="module-header">
        <div class="module-title">
          <div class="module-eyebrow">XPASS HQ / CALENDAR</div>
          <h1>{{ $t('calendar') }}</h1>
        </div>
        <div class="module-actions">
          <el-button v-perm="'calendar:add'" type="primary" icon="plus" @click="openDialog()">{{ $t('createEvent') }}</el-button>
          <el-button  @click="loadEvents" text circle icon="refresh" :aria-label="$t('refresh')" :title="$t('refresh')" />
        </div>
      </div>

      <div class="cal-toolbar">
        <el-radio-group v-model="viewMode" size="small" @change="onViewChange">
          <el-radio-button value="upcoming">{{ $t('viewUpcoming') }}</el-radio-button>
          <el-radio-button value="day">{{ $t('viewDay') }}</el-radio-button>
          <el-radio-button value="week">{{ $t('viewWeek') }}</el-radio-button>
          <el-radio-button value="month">{{ $t('viewMonth') }}</el-radio-button>
        </el-radio-group>
        <div v-if="viewMode !== 'upcoming'" class="cal-nav">
          <el-button size="small" text @click="shiftRange(-1)">‹</el-button>
          <span class="cal-range">{{ rangeLabel }}</span>
          <el-button size="small" text @click="shiftRange(1)">›</el-button>
          <el-button size="small" text @click="goToday">{{ $t('today') }}</el-button>
        </div>
        <div class="cal-filters">
          <el-input v-model="search" :placeholder="$t('search')" clearable size="small" style="width: 180px" />
          <el-select v-model="visibilityFilter" :placeholder="$t('visibility')" clearable size="small" style="width: 140px">
            <el-option v-for="v in VISIBILITIES" :key="v" :label="$t('vis_' + v)" :value="v" />
          </el-select>
        </div>
      </div>

      <el-card class="module-card">
        <p v-if="loading" class="w-state">Loading…</p>
        <p v-else-if="!groups.length" class="w-state">
          {{ $t('noCalendarEntries') }}
          <button class="w-inline" @click="openDialog()">{{ $t('createEvent') }}</button>
        </p>
        <div v-else class="agenda">
          <section v-for="group in groups" :key="group.day" class="agenda-day">
            <div class="agenda-day-label">{{ group.label }}</div>
            <article
              v-for="ev in group.items"
              :key="ev.id"
              class="agenda-item"
              :class="`vis-${ev.visibility}`"
              @click="openDetail(ev)"
            >
              <div class="agenda-time">
                <strong>{{ formatTime(ev.start_time) }}</strong>
                <small v-if="ev.end_time">{{ formatTime(ev.end_time) }}</small>
              </div>
              <div class="agenda-body">
                <div class="agenda-title">
                  {{ ev.title }}
                  <el-tag size="small" :type="visType(ev.visibility)">{{ $t('vis_' + ev.visibility) }}</el-tag>
                  <el-tag v-if="ev.my_response && ev.my_response !== 'organizer'" size="small" :type="respType(ev.my_response)">{{ $t('resp_' + ev.my_response) }}</el-tag>
                </div>
                <div class="agenda-meta">
                  <span v-if="ev.location">{{ ev.location }}</span>
                  <span v-if="ev.participant_count">{{ ev.participant_count }} {{ $t('participants') }}</span>
                  <span v-if="ev.reminder_at">⏰ {{ formatDateTime(ev.reminder_at) }}</span>
                </div>
              </div>
              <div class="agenda-actions" @click.stop>
                <el-button v-if="canEdit(ev)" v-perm="'calendar:edit'" size="small" text @click="openDialog(ev)">{{ $t('edit') }}</el-button>
                <el-button v-if="ev.my_response === 'invited'" v-perm="'calendar:query'" size="small" @click="respond(ev, 'accepted')">{{ $t('accept') }}</el-button>
                <el-button v-if="ev.my_response === 'invited'" v-perm="'calendar:query'" size="small" @click="respond(ev, 'declined')">{{ $t('decline') }}</el-button>
              </div>
            </article>
          </section>
        </div>
      </el-card>

      <el-dialog v-model="dialogVisible" :title="editingId ? $t('edit') : $t('createEvent')" width="560px">
        <el-form label-width="110px">
          <el-form-item :label="$t('noteTitle')">
            <el-input v-model="form.title" />
          </el-form-item>
          <el-form-item :label="$t('requestDescription')">
            <el-input v-model="form.description" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item :label="$t('start')">
            <el-date-picker v-model="form.start_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="$t('end')">
            <el-date-picker v-model="form.end_time" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="$t('timezone')">
            <el-input v-model="form.timezone" placeholder="UTC" />
          </el-form-item>
          <el-form-item :label="$t('crmAddress')">
            <el-input v-model="form.location" :placeholder="$t('locationOrLink')" />
          </el-form-item>
          <el-form-item :label="$t('visibility')">
            <el-select v-model="form.visibility" style="width: 100%">
              <el-option v-for="v in VISIBILITIES" :key="v" :label="$t('vis_' + v)" :value="v" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="form.visibility === 'selected'" :label="$t('participants')">
            <el-select v-model="form.participants" multiple filterable style="width: 100%" :placeholder="$t('selectPeople')">
              <el-option v-for="u in directory" :key="u.user_id" :label="`${u.name} (${u.email})`" :value="u.user_id" />
            </el-select>
          </el-form-item>
          <el-form-item v-else :label="$t('participants')">
            <el-select v-model="form.participants" multiple filterable style="width: 100%" :placeholder="$t('optionalParticipants')">
              <el-option v-for="u in directory" :key="u.user_id" :label="`${u.name} (${u.email})`" :value="u.user_id" />
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('reminder')">
            <el-date-picker v-model="form.reminder_at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ssZ" style="width: 100%" :placeholder="$t('noReminder')" />
          </el-form-item>
          <el-form-item :label="$t('status')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="scheduled" value="scheduled" />
              <el-option label="confirmed" value="confirmed" />
              <el-option label="cancelled" value="cancelled" />
            </el-select>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="dialogVisible = false">{{ $t('cancel') }}</el-button>
          <el-button type="primary" :loading="saving" @click="saveEvent">{{ $t('save') }}</el-button>
        </template>
      </el-dialog>

      <el-drawer v-model="detailVisible" :title="detail?.title || $t('calendar')" direction="rtl" size="420px">
        <div v-if="detail" class="detail">
          <p class="detail-line"><strong>{{ $t('start') }}:</strong> {{ formatDateTime(detail.start_time) }} ({{ detail.timezone }})</p>
          <p v-if="detail.end_time" class="detail-line"><strong>{{ $t('end') }}:</strong> {{ formatDateTime(detail.end_time) }}</p>
          <p v-if="detail.location" class="detail-line"><strong>{{ $t('crmAddress') }}:</strong> {{ detail.location }}</p>
          <p class="detail-line"><strong>{{ $t('visibility') }}:</strong> {{ $t('vis_' + detail.visibility) }}</p>
          <p v-if="detail.description" class="detail-desc">{{ detail.description }}</p>
          <div v-if="detail.participants?.length" class="detail-section">
            <div class="detail-label">{{ $t('participants') }}</div>
            <ul class="resp-list">
              <li v-for="p in detail.participants" :key="p.user_id">
                <span>{{ userName(p.user_id) }}</span>
                <el-tag size="small" :type="respType(p.response)">{{ $t('resp_' + p.response) }}</el-tag>
              </li>
            </ul>
          </div>
          <div class="detail-actions">
            <el-button v-if="canEdit(detail)" v-perm="'calendar:edit'" type="primary" @click="openDialog(detail)">{{ $t('edit') }}</el-button>
            <el-button v-if="canEdit(detail)" v-perm="'calendar:delete'" type="danger" @click="deleteEvent(detail.id)">{{ $t('delete') }}</el-button>
          </div>
        </div>
      </el-drawer>
    </div>
  </el-scrollbar>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { calendarList, calendarGet, calendarCreate, calendarUpdate, calendarDelete, calendarRespond } from '@/request/calendar.js'
import { directoryList } from '@/request/directory.js'
import { useCreateIntent } from '@/composables/useCreateIntent.js'
import { useUserStore } from '@/store/user.js'

const VISIBILITIES = ['private', 'team', 'selected', 'company']
const userStore = useUserStore()
const route = useRoute()
const myId = computed(() => userStore.user?.userId)

const events = ref([])
const directory = ref([])
const loading = ref(false)
const saving = ref(false)
const viewMode = ref('upcoming')
const anchor = ref(new Date())
const search = ref('')
const visibilityFilter = ref('')
const dialogVisible = ref(false)
const detailVisible = ref(false)
const detail = ref(null)
const editingId = ref(null)

const defaultTimezone = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
const blankForm = () => ({ title: '', description: '', start_time: '', end_time: '', location: '', timezone: defaultTimezone.value, visibility: 'private', participants: [], reminder_at: '', status: 'scheduled', all_day: 0 })
const form = ref(blankForm())

useCreateIntent(query => openDialog(null, query.create))

const range = computed(() => {
  const a = new Date(anchor.value)
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (viewMode.value === 'day') {
    const s = startOfDay(a)
    return { from: s, to: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1) }
  }
  if (viewMode.value === 'week') {
    const s = startOfDay(a)
    const dow = (s.getDay() + 6) % 7
    s.setDate(s.getDate() - dow)
    return { from: s, to: new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7) }
  }
  if (viewMode.value === 'month') {
    const s = new Date(a.getFullYear(), a.getMonth(), 1)
    return { from: s, to: new Date(a.getFullYear(), a.getMonth() + 1, 1) }
  }
  return { from: startOfDay(a), to: null }
})

const rangeLabel = computed(() => {
  const { from, to } = range.value
  if (!to) return ''
  const opts = { month: 'short', day: 'numeric' }
  return `${from.toLocaleDateString(undefined, opts)} – ${new Date(to.getTime() - 1).toLocaleDateString(undefined, opts)}`
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return events.value.filter(ev => {
    if (visibilityFilter.value && ev.visibility !== visibilityFilter.value) return false
    if (q && !(`${ev.title} ${ev.location || ''}`.toLowerCase().includes(q))) return false
    return true
  })
})

const groups = computed(() => {
  const map = new Map()
  for (const ev of filtered.value) {
    if (!ev.start_time) continue
    const day = new Date(ev.start_time)
    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
    if (!map.has(key)) map.set(key, { day: key, label: day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), items: [] })
    map.get(key).items.push(ev)
  }
  return [...map.values()]
})

function visType(v) { return ({ private: 'info', team: 'warning', selected: '', company: 'success' })[v] || 'info' }
function respType(r) { return ({ accepted: 'success', declined: 'danger', tentative: 'warning', invited: 'info', organizer: '' })[r] || 'info' }
function userName(id) { const u = directory.value.find(x => x.user_id === id); return u ? u.name : id }
function canEdit(ev) { return ev && (ev.user_id === myId.value || ev.organizer_id === myId.value) }

function formatTime(v) { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }
function formatDateTime(v) { const d = new Date(v); return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }

async function loadEvents() {
  loading.value = true
  try {
    const params = { page: 1, pageSize: 200 }
    const { from, to } = range.value
    if (viewMode.value !== 'upcoming') {
      params.from = from.toISOString()
      if (to) { params.start_time = from.toISOString(); params.end_time = to.toISOString() }
    }
    const resp = await calendarList(params)
    events.value = resp.list || []
  } catch (e) {
    ElMessage({ message: e.message || 'Failed to load calendar.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function onViewChange() { anchor.value = new Date(); loadEvents() }
function shiftRange(dir) {
  const d = new Date(anchor.value)
  if (viewMode.value === 'day') d.setDate(d.getDate() + dir)
  else if (viewMode.value === 'week') d.setDate(d.getDate() + dir * 7)
  else d.setMonth(d.getMonth() + dir)
  anchor.value = d
  loadEvents()
}
function goToday() { anchor.value = new Date(); loadEvents() }

function openDialog(row, mode) {
  editingId.value = row?.id ?? null
  if (row) {
    form.value = { ...blankForm(), ...row, participants: (row.participants || []).map(p => p.user_id) }
  } else {
    const vis = mode === 'team' ? 'team' : 'private'
    form.value = { ...blankForm(), visibility: vis }
  }
  dialogVisible.value = true
}

async function openDetail(ev) {
  detail.value = ev
  detailVisible.value = true
}

async function openById(id) {
  try {
    const resp = await calendarGet(id)
    if (resp.event) { detail.value = resp.event; detailVisible.value = true }
  } catch (e) { /* ignore */ }
}

async function saveEvent() {
  if (!form.value.title.trim()) { ElMessage({ message: 'Title is required.', type: 'warning', plain: true }); return }
  if (!form.value.start_time) { ElMessage({ message: 'Start time is required.', type: 'warning', plain: true }); return }
  saving.value = true
  try {
    if (editingId.value) await calendarUpdate(editingId.value, form.value)
    else await calendarCreate(form.value)
    dialogVisible.value = false
    await loadEvents()
    ElMessage({ message: 'Saved.', type: 'success', plain: true })
  } catch (e) {
    ElMessage({ message: e.message || 'Failed to save event.', type: 'error', plain: true })
  } finally {
    saving.value = false
  }
}

async function respond(ev, response) {
  try {
    await calendarRespond(ev.id, response)
    await loadEvents()
  } catch (e) {
    ElMessage({ message: e.message || 'Failed to respond.', type: 'error', plain: true })
  }
}

async function deleteEvent(id) {
  try {
    await ElMessageBox.confirm('Delete this calendar entry?', 'Confirm', { type: 'warning' })
  } catch { return }
  try {
    await calendarDelete(id)
    detailVisible.value = false
    await loadEvents()
  } catch (e) {
    ElMessage({ message: e.message || 'Failed to delete.', type: 'error', plain: true })
  }
}

async function loadDirectory() {
  try { const resp = await directoryList(); directory.value = resp.list || [] } catch (e) { /* ignore */ }
}

onMounted(() => {
  loadDirectory()
  loadEvents()
  if (route.query.event) openById(route.query.event)
})
</script>

<style scoped>
.module-scroll { height: 100%; background: var(--hq-page); }
.module-container { width: min(1240px, 100%); margin: 0 auto; padding: 28px clamp(20px, 3vw, 42px) 36px; color: var(--hq-text); }
.module-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.module-eyebrow { color: var(--hq-muted); font-size: 11px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.module-title h1 { margin: 4px 0 0; font-size: clamp(24px, 2.4vw, 30px); font-weight: 650; letter-spacing: -.035em; line-height: 1.2; }
.module-actions { display: flex; gap: 8px; align-items: center; }
.module-card { min-width: 0; }
.cal-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
.cal-nav { display: flex; align-items: center; gap: 6px; }
.cal-range { font-size: 13px; font-weight: 600; min-width: 130px; text-align: center; }
.cal-filters { margin-left: auto; display: flex; gap: 8px; }
.w-state { padding: 24px 4px; color: var(--hq-text-secondary); }
.w-inline { border: 0; background: transparent; color: var(--el-color-primary); cursor: pointer; padding: 0; }
.agenda { display: flex; flex-direction: column; gap: 18px; }
.agenda-day-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--hq-muted); margin-bottom: 8px; }
.agenda-item { display: grid; grid-template-columns: 78px 1fr auto; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--hq-border); border-radius: 8px; cursor: pointer; }
.agenda-item:hover { background: var(--hq-hover); }
.agenda-item.vis-private { border-left: 3px solid var(--hq-muted); }
.agenda-item.vis-team { border-left: 3px solid var(--el-color-warning); }
.agenda-item.vis-selected { border-left: 3px solid var(--el-color-primary); }
.agenda-item.vis-company { border-left: 3px solid var(--el-color-success); }
.agenda-time { display: flex; flex-direction: column; font-size: 12px; }
.agenda-title { font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.agenda-meta { display: flex; gap: 12px; flex-wrap: wrap; color: var(--hq-muted); font-size: 12px; margin-top: 3px; }
.agenda-actions { display: flex; gap: 4px; }
.detail-line { margin: 0 0 8px; font-size: 13px; }
.detail-desc { color: var(--hq-text-secondary); font-size: 13px; }
.detail-section { margin-top: 16px; }
.detail-label { font-size: 12px; font-weight: 700; color: var(--hq-muted); margin-bottom: 6px; }
.resp-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.resp-list li { display: flex; justify-content: space-between; font-size: 13px; }
.detail-actions { display: flex; gap: 8px; margin-top: 20px; }

@media (max-width: 640px) {
  .agenda-item {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    gap: 6px;
  }
  .agenda-time { flex-direction: row; gap: 8px; align-items: baseline; }
  .cal-filters { margin-left: 0; width: 100%; flex-wrap: wrap; }
  .module-actions { flex-wrap: wrap; }
}
</style>