<template>
  <el-dialog
    :model-value="modelValue"
    title="Link a record"
    width="560px"
    :close-on-click-modal="false"
    append-to-body
    @update:model-value="close"
    @open="open"
  >
    <div class="lr-picker">
      <div class="lr-picker-filters">
        <el-select
          v-model="typeKey"
          placeholder="What kind of record?"
          class="lr-picker-type"
          @change="onTypeChange"
        >
          <el-option
            v-for="option in typeOptions"
            :key="option.key"
            :label="option.label"
            :value="option.key"
          />
        </el-select>
        <el-input
          v-model="keyword"
          placeholder="Search by name or number"
          clearable
          @input="onKeywordInput"
        />
      </div>

      <div v-loading="loading" class="lr-picker-results">
        <p v-if="!loading && !results.length" class="lr-picker-empty">
          No matching {{ typeLabel.toLowerCase() }}. Try a different search.
        </p>
        <ul v-else class="lr-picker-list">
          <li
            v-for="row in results"
            :key="`${row.type}-${row.id}`"
            class="lr-picker-item"
            :class="{ 'is-selected': selected && selected.id === row.id && selected.type === row.type }"
            @click="selected = row"
          >
            <span class="lr-picker-radio" :class="{ 'is-on': selected && selected.id === row.id && selected.type === row.type }" />
            <span class="lr-picker-name">{{ row.label }}</span>
            <span class="lr-picker-meta">{{ row.type_label }}</span>
          </li>
        </ul>
      </div>

      <div class="lr-picker-foot">
        <el-select v-model="relation" class="lr-picker-kind" placeholder="Relationship">
          <el-option v-for="kind in kinds" :key="kind.key" :label="kind.label" :value="kind.key" />
        </el-select>
        <el-input v-model="note" placeholder="Note (optional)" maxlength="200" />
      </div>
    </div>

    <template #footer>
      <div class="lr-picker-actions">
        <el-button @click="close">Cancel</el-button>
        <el-button type="primary" :disabled="!selected || saving" :loading="saving" @click="submit">
          Link record
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  financeRelationCreate, financeRelationKinds, financeRelationSearch, financeRelationTypes,
} from '@/request/finance.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  // Restrict the picker to these target types; empty means every type the
  // caller may link to, as decided by the server.
  types: { type: Array, default: () => [] },
  // The record being linked from, so it never appears in its own candidate list.
  sourceType: { type: String, default: '' },
  sourceId: { type: [Number, String], default: null },
})

const emit = defineEmits(['update:modelValue', 'linked'])

const typeOptions = ref([])
const kinds = ref([])
const typeKey = ref('')
const keyword = ref('')
const results = ref([])
const selected = ref(null)
const relation = ref('related')
const note = ref('')
const loading = ref(false)
const saving = ref(false)

let searchTimer = null
let searchToken = 0

const typeLabel = computed(
  () => typeOptions.value.find((option) => option.key === typeKey.value)?.label || 'record',
)

function close() {
  emit('update:modelValue', false)
}

async function open() {
  selected.value = null
  keyword.value = ''
  note.value = ''
  relation.value = 'related'
  results.value = []
  typeKey.value = ''
  try {
    const [types, kindList] = await Promise.all([financeRelationTypes(), financeRelationKinds()])
    const allowed = props.types || []
    typeOptions.value = (types || []).filter(
      (option) => option.key !== props.sourceType && (!allowed.length || allowed.includes(option.key)),
    )
    kinds.value = kindList || []
    typeKey.value = typeOptions.value[0]?.key || ''
    await runSearch()
  } catch (error) {
    ElMessage.error(error?.message || 'Could not load the record picker.')
  }
}

function onTypeChange() {
  selected.value = null
  results.value = []
  runSearch()
}

function onKeywordInput() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => runSearch(), 300)
}

async function runSearch() {
  if (!typeKey.value) {
    results.value = []
    return
  }
  const token = ++searchToken
  loading.value = true
  try {
    const data = await financeRelationSearch({
      types: typeKey.value,
      q: keyword.value || '',
      limit: 20,
    })
    if (token !== searchToken) return
    results.value = (data || []).filter(
      (row) => !(row.type === props.sourceType && String(row.id) === String(props.sourceId)),
    )
  } catch (error) {
    if (token === searchToken) ElMessage.error(error?.message || 'Search failed.')
    results.value = []
  } finally {
    if (token === searchToken) loading.value = false
  }
}

async function submit() {
  if (!selected.value) return
  saving.value = true
  try {
    await financeRelationCreate({
      source_type: props.sourceType,
      source_id: Number(props.sourceId),
      target_type: selected.value.type,
      target_id: Number(selected.value.id),
      relation: relation.value || 'related',
      note: note.value || '',
    })
    ElMessage.success(`Linked ${selected.value.label}.`)
    emit('linked')
    close()
  } catch (error) {
    ElMessage.error(error?.message || 'Could not create that link.')
  } finally {
    saving.value = false
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) open()
  },
)
</script>

<style scoped>
.lr-picker-filters {
  display: flex;
  gap: 8px;
}

.lr-picker-type {
  width: 200px;
  flex: none;
}

.lr-picker-results {
  margin-top: 12px;
  min-height: 180px;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--hq-border, #e4e7ed);
  border-radius: 6px;
}

.lr-picker-empty {
  margin: 0;
  padding: 24px 12px;
  text-align: center;
  color: var(--hq-muted, #909399);
  font-size: 13px;
}

.lr-picker-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.lr-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--hq-border, #f0f2f5);
}

.lr-picker-item:last-child {
  border-bottom: none;
}

.lr-picker-item:hover {
  background: var(--hq-hover, #f5f7fa);
}

.lr-picker-item.is-selected {
  background: var(--hq-selected, #ecf5ff);
}

.lr-picker-radio {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid var(--hq-border, #dcdfe6);
  flex: none;
}

.lr-picker-radio.is-on {
  border: 4px solid var(--hq-accent-strong, #409eff);
}

.lr-picker-name {
  flex: 1;
  font-size: 13px;
  color: var(--hq-text, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lr-picker-meta {
  font-size: 12px;
  color: var(--hq-muted, #909399);
  flex: none;
}

.lr-picker-foot {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.lr-picker-kind {
  width: 170px;
  flex: none;
}

.lr-picker-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>