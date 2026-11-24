<template>
  <div ref="searchRef" class="all-email-search">
    <div class="search-placeholder" @click="openSearch">
      <Icon icon="bytesize:search" width="20" height="20"/>
      <span class="search-placeholder-text" :class="{ 'has-search-text': savedSearchSummary }" :title="savedSearchSummary">
        {{ savedSearchSummary || t('searchMail') }}
      </span>
    </div>
    <el-button
      class="mobile-search-button"
      size="default"
      :aria-label="t('searchMail')"
      :aria-expanded="visible"
      @click="openSearch"
    >
      <el-icon :size="20">
        <Icon icon="bytesize:search"/>
      </el-icon>
    </el-button>
    <Transition name="search-panel-fade" @after-enter="focusInputOnDesktop">
      <div v-if="visible" class="search-panel-shell" @click.stop>
        <el-card class="search-panel" shadow="always">
          <div class="search-input">
            <el-input
              ref="inputRef"
              v-model="searchText"
              autocomplete="off"
              :placeholder="searchPlaceholder"
              @keyup.enter="handleSearch"
            />
          </div>
          <div class="search-content">
            <div class="search-content-title">{{ t('searchType') }}</div>
            <el-radio-group v-model="searchType" class="search-options" :aria-label="t('searchType')">
              <el-radio-button
                v-for="option in searchOptions"
                :key="option.type"
                :value="option.type"
              >
                {{ option.label }}
              </el-radio-button>
            </el-radio-group>
            <div class="search-content-title search-type-title">{{ t('mailStatus') }}</div>
            <el-radio-group v-model="mailStatus" class="search-options" :aria-label="t('mailStatus')">
              <el-radio-button
                v-for="option in statusOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </el-radio-button>
            </el-radio-group>
            <div class="search-date-range">
              <div class="search-date-field">
                <div class="search-date-label">{{ t('searchDateFrom') }}</div>
                <el-date-picker
                  v-model="startDate"
                  type="date"
                  :editable="false"
                  value-format="YYYY-MM-DD"
                  :placeholder="t('searchStartDate')"
                />
              </div>
              <div class="search-date-field">
                <div class="search-date-label">{{ t('searchDateTo') }}</div>
                <el-date-picker
                  v-model="endDate"
                  type="date"
                  :editable="false"
                  value-format="YYYY-MM-DD"
                  :placeholder="t('searchEndDate')"
                  :disabled-date="disableEndDate"
                />
              </div>
            </div>
          </div>
          <div class="search-actions">
            <el-button @click="handleReset">{{ t('reset') }}</el-button>
            <el-button type="primary" @click="handleSearch">{{ t('search') }}</el-button>
          </div>
        </el-card>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {Icon} from '@iconify/vue'
import {useI18n} from 'vue-i18n'
import {useAllEmailStore} from '@/store/all-email.js'
import {useUiStore} from '@/store/ui.js'

const {t} = useI18n()
const emit = defineEmits(['search', 'reset'])
const route = useRoute()
const uiStore = useUiStore()
const allEmailStore = useAllEmailStore()
let alignFrame = 0
let listObserver = null

const searchOptions = computed(() => [
  {label: t('subject'), type: 'subject'},
  {label: t('sender'), type: 'sender'},
  {label: t('searchSenderAddress'), type: 'senderAddress'},
  {label: t('user'), type: 'user'},
  {label: t('selectEmail'), type: 'account'},
])

const statusOptions = computed(() => [
  {label: t('all'), value: 'all'},
  {label: t('received'), value: 'receive'},
  {label: t('sent'), value: 'send'},
  {label: t('selectDeleted'), value: 'delete'},
  {label: t('noRecipientTitle'), value: 'noone'},
])

const searchRef = ref(null)
const inputRef = ref(null)
const searchText = ref('')
const searchType = ref('subject')
const mailStatus = ref('all')
const startDate = ref('')
const endDate = ref('')
const visible = ref(false)
const selectedSearchOption = computed(() =>
  searchOptions.value.find(option => option.type === searchType.value)
)
const savedSearchSummary = computed(() => {
  const params = allEmailStore.searchParams
  const parts = []
  const text = params.text?.trim()
  const fieldKeys = {
    subject: 'searchSummarySubject',
    sender: 'searchSummarySender',
    senderAddress: 'searchSummarySenderAddress',
    user: 'searchSummaryUser',
    account: 'searchSummaryAccount',
  }

  if (text) {
    parts.push(`${t(fieldKeys[params.type] || fieldKeys.subject)}:${text}`)
  }
  if (params.status && params.status !== 'all') {
    parts.push(statusOptions.value.find(option => option.value === params.status)?.label || '')
  }
  if (params.startDate && params.endDate) {
    parts.push(`${formatSummaryDate(params.startDate)} ${t('searchSummaryRange')} ${formatSummaryDate(params.endDate)}`)
  } else if (params.startDate) {
    parts.push(`${t('searchSummaryAfter')}:${formatSummaryDate(params.startDate)}`)
  } else if (params.endDate) {
    parts.push(`${t('searchSummaryBefore')}:${formatSummaryDate(params.endDate)}`)
  }
  return parts.filter(Boolean).join('\u00a0\u00a0')
})
const searchPlaceholder = computed(() =>
  t('searchMailBy', {field: selectedSearchOption.value?.label || t('subject')})
)

watch(startDate, value => {
  if (value && endDate.value && endDate.value < value) {
    endDate.value = ''
  }
})

function openSearch() {
  if (visible.value) {
    closeSearch()
    return
  }

  restoreSavedSearch()
  visible.value = true
}

function focusInput() {
  inputRef.value?.focus()
}

function focusInputOnDesktop() {
  if (!window.matchMedia('(max-width: 1024px)').matches) {
    focusInput()
  }
}

function disableEndDate(date) {
  if (!startDate.value) return false

  const start = new Date(`${startDate.value}T00:00:00`)
  return date < start
}

function closeSearch() {
  visible.value = false
  restoreSavedSearch()
}

function restoreSavedSearch() {
  const params = allEmailStore.searchParams
  searchText.value = params.text || ''
  searchType.value = searchOptions.value.some(option => option.type === params.type)
    ? params.type
    : 'subject'
  mailStatus.value = statusOptions.value.some(option => option.value === params.status)
    ? params.status
    : 'all'
  startDate.value = toLocalSearchDate(params.startDate)
  endDate.value = toLocalSearchDate(params.endDate)
}

function toLocalSearchDate(dateValue) {
  if (!dateValue) return ''

  const date = new Date(`${dateValue.replace(' ', 'T')}Z`)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatSummaryDate(dateValue) {
  return toLocalSearchDate(dateValue)
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape' && visible.value) {
    closeSearch()
  }
}

function handleDocumentClick(event) {
  const target = event.target
  const isDatePickerPopup = target?.closest?.(
    '.el-picker__popper, .el-picker-panel'
  )

  if (
    !visible.value
    || searchRef.value?.contains(target)
    || isDatePickerPopup
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  closeSearch()
}

function formatSearchDate(dateValue, endOfDay = false) {
  if (!dateValue) return ''

  const [year, month, day] = dateValue.split('-').map(Number)
  const localDate = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
  )

  return localDate.toISOString().slice(0, 19).replace('T', ' ')
}

function handleSearch() {
  allEmailStore.setSearchParams({
    text: searchText.value.trim(),
    type: searchType.value,
    status: mailStatus.value,
    startDate: formatSearchDate(startDate.value),
    endDate: formatSearchDate(endDate.value, true),
  })
  emit('search')
  closeSearch()
}

function handleReset() {
  searchText.value = ''
  searchType.value = 'subject'
  mailStatus.value = 'all'
  startDate.value = ''
  endDate.value = ''
  allEmailStore.setSearchParams({
    text: '',
    type: 'subject',
    status: 'all',
    startDate: '',
    endDate: '',
  })
  emit('reset')
  closeSearch()
}

function subjectAnchor() {
  return document.querySelector('.email-row.all-email .email-subject')
    || document.querySelector('.email-row.all-email .email-text-skeleton')
}

function alignSearch() {
  const el = searchRef.value
  if (!el) return
  if (window.matchMedia('(max-width: 767px)').matches) {
    el.style.left = ''
    el.style.marginLeft = ''
    el.style.width = ''
    return
  }

  const anchor = subjectAnchor()
  const header = el.offsetParent
  if (!anchor || !header || typeof header.getBoundingClientRect !== 'function') return

  const paddingLeft = parseFloat(getComputedStyle(anchor).paddingLeft) || 0
  const skeletonOffset = anchor.classList.contains('email-text-skeleton') && window.innerWidth >= 1367 ? 5 : 0
  const left = Math.round(
    anchor.getBoundingClientRect().left + paddingLeft + skeletonOffset - header.getBoundingClientRect().left
  ) - 5
  const preferred = window.innerWidth <= 1080 ? 400 : 450
  const width = Math.max(220, Math.min(preferred, header.clientWidth - left - 80))
  el.style.marginLeft = '0'
  el.style.left = `${left}px`
  el.style.width = `${width}px`
}

function scheduleAlign() {
  if (alignFrame) return
  alignFrame = requestAnimationFrame(() => {
    alignFrame = 0
    alignSearch()
  })
}

watch(() => uiStore.accountShow, () => {
  scheduleAlign()
  setTimeout(scheduleAlign, 150)
})

watch(() => route.fullPath, () => {
  scheduleAlign()
  setTimeout(scheduleAlign, 50)
})

onMounted(() => {
  document.addEventListener('click', handleDocumentClick, true)
  document.addEventListener('keydown', handleDocumentKeydown, true)
  scheduleAlign()
  setTimeout(scheduleAlign, 50)
  setTimeout(scheduleAlign, 300)
  window.addEventListener('resize', scheduleAlign)
  const main = document.querySelector('.main-container')
  if (main && typeof ResizeObserver !== 'undefined') {
    listObserver = new ResizeObserver(() => scheduleAlign())
    listObserver.observe(main)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick, true)
  document.removeEventListener('keydown', handleDocumentKeydown, true)
  window.removeEventListener('resize', scheduleAlign)
  listObserver?.disconnect()
  if (alignFrame) cancelAnimationFrame(alignFrame)
})
</script>

<style lang="scss" scoped>
.all-email-search {
  position: absolute;
  left: -1;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: min(450px, calc(100% - 20px));
  height: 36px;
  @media (max-width: 1080px) {
    width: min(400px, calc(100% - 20px));
  }
}

@media (min-width: 768px) {
  .all-email-search.account-show {
    left: 259px;
  }
}

.search-placeholder {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  text-align: left;
  white-space: nowrap;
  cursor: text;
  position: relative;
  z-index: 0;
}

.search-placeholder-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
}

.search-placeholder-text.has-search-text {
  color: var(--el-text-color-primary);
}

.mobile-search-button {
  display: none;
}

@media (max-width: 767px) {
  .all-email-search {
    position: static;
    transform: none;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .search-placeholder {
    display: none;
  }

  .mobile-search-button {
    display: inline-flex;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    box-shadow: none;
    --el-button-bg-color: transparent;
    --el-button-border-color: transparent;
    --el-button-hover-bg-color: transparent;
    --el-button-hover-border-color: transparent;
    --el-button-active-bg-color: transparent;
    --el-button-active-border-color: transparent;
    --el-button-outline-color: transparent;
  }

  .all-email-search .search-panel-shell {
    top: calc(100% + 8px);
    left: 50%;
    right: auto;
    width: min(450px, calc(100vw - 30px));
    translate: -50% 0;
  }
}

.search-panel-shell {
  position: absolute;
  top: -4px;
  left: 0;
  z-index: 1001;
  width: 100%;
  box-sizing: border-box;
  background: var(--el-bg-color-overlay);
}

.search-panel {
  width: 100%;
  height: auto;
  min-height: 0;
  box-sizing: border-box;
  --el-card-bg-color: var(--el-bg-color-overlay);
  background-color: var(--el-card-bg-color) !important;
  border-radius: 6px !important;
  border: 1px solid var(--el-border-color) !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
  overflow: hidden;
  isolation: isolate;
}

.search-panel :deep(.el-card__body) {
  position: relative;
  z-index: 1;
  padding: 3px;
  background-color: var(--el-card-bg-color) !important;
}

.search-panel-fade-enter-active,
.search-panel-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.search-panel-fade-enter-from,
.search-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.search-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 25px;
  padding-bottom: 15px;
  padding-right: 15px;
}

.search-content {
  padding: 20px 15px 0;
}

.search-content-title {
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: var(--el-text-color-primary);
  width: 100%;
  text-align: left !important;
}

.search-type-title {
  margin-top: 20px;
}

.search-options {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
  margin-top: 8px;
  min-width: 0;
  max-width: 100%;
}

.search-options :deep(.el-radio-button .el-radio-button__inner) {
  border-radius: var(--el-border-radius-base);
}

.search-options :deep(.el-radio-button.is-active .el-radio-button__inner) {
  box-shadow: none;
  outline-color: var(--el-color-primary);
}

.search-date-range {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.search-date-field {
  flex: 1;
  min-width: 0;
}

.search-date-label {
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 700;
  line-height: 20px;
  color: var(--el-text-color-primary);
  text-align: left;
}

.search-date-field :deep(.el-date-editor) {
  width: 100%;
}

.search-input {
  --el-input-bg-color: var(--el-bg-color-overlay);
  margin: 4px -3px 0;
  padding: 0 8px 6px;
  border-bottom: solid 1px var(--el-border-color);
}

.search-input :deep(.el-input__wrapper),
.search-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: none !important;
}

.search-input :deep(.el-input__inner::placeholder) {
  font-size: 15px;
}
</style>
