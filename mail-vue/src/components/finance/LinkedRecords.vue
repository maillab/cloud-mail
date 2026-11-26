<template>
  <section class="lr-block">
    <header class="lr-head">
      <h3 class="lr-title">{{ title }}</h3>
      <el-button
        v-if="editable"
        link
        type="primary"
        size="small"
        @click="pickerOpen = true"
      >Link a record</el-button>
    </header>

    <p v-if="loading" class="lr-empty">Loading links…</p>
    <p v-else-if="!relations.length" class="lr-empty">
      Nothing linked yet. Links explain why money moved.
    </p>
    <ul v-else class="lr-list">
      <li v-for="row in relations" :key="row.id" class="lr-item">
        <span class="lr-type">{{ row.type_label }}</span>
        <span class="lr-kind">{{ row.relation_label }}</span>
        <span class="lr-name">{{ row.label }}</span>
        <span v-if="row.direction === 'in'" class="lr-dir" title="Linked from the other side">incoming</span>
        <el-button
          v-if="editable"
          link
          type="danger"
          size="small"
          @click="remove(row)"
        >Remove</el-button>
      </li>
    </ul>

    <RelationPicker
      v-model="pickerOpen"
      :types="types"
      :source-type="sourceType"
      :source-id="sourceId"
      @linked="load"
    />
  </section>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useConfirm } from '@/composables/use-confirm.js'
import { financeRelationDelete, financeRelations } from '@/request/finance.js'
import RelationPicker from './RelationPicker.vue'

const props = defineProps({
  sourceType: { type: String, required: true },
  sourceId: { type: [Number, String], required: true },
  // Set false where the caller has no edit permission; the section still shows
  // the links it is allowed to see.
  editable: { type: Boolean, default: true },
  title: { type: String, default: 'Linked records' },
  types: { type: Array, default: () => [] },
})

const emit = defineEmits(['changed'])

const { confirmDanger } = useConfirm()
const relations = ref([])
const loading = ref(false)
const pickerOpen = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await financeRelations({
      source_type: props.sourceType,
      source_id: Number(props.sourceId),
    })
    relations.value = data || []
  } catch (error) {
    // A missing permission is a real answer, not a rendering failure: show the
    // section as empty rather than throwing inside a drawer.
    relations.value = []
    if (error?.code && error.code !== 403) {
      ElMessage.error(error.message || 'Could not load linked records.')
    }
  } finally {
    loading.value = false
  }
}

async function remove(row) {
  const ok = await confirmDanger(
    `Remove the link to ${row.label}? The record itself is not deleted.`,
    'Remove link',
  )
  if (!ok) return
  try {
    await financeRelationDelete(row.id)
    ElMessage.success('Link removed.')
    await load()
    emit('changed')
  } catch (error) {
    ElMessage.error(error?.message || 'Could not remove that link.')
  }
}

onMounted(load)
watch(() => [props.sourceType, props.sourceId], load)
</script>

<style scoped>
.lr-block {
  border-top: 1px solid var(--hq-border, #ebeef5);
  padding-top: 12px;
}

.lr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.lr-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--hq-text, #303133);
}

.lr-empty {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--hq-muted, #909399);
}

.lr-list {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.lr-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--hq-border, #f2f3f5);
}

.lr-item:last-child {
  border-bottom: none;
}

.lr-type {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--hq-hover, #f5f7fa);
  color: var(--hq-text-secondary, #606266);
  font-size: 12px;
}

.lr-kind {
  flex: none;
  color: var(--hq-muted, #909399);
  font-size: 12px;
}

.lr-name {
  flex: 1;
  color: var(--hq-text, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lr-dir {
  flex: none;
  font-size: 11px;
  color: var(--hq-muted, #909399);
  border: 1px solid var(--hq-border, #e4e7ed);
  border-radius: 3px;
  padding: 0 4px;
}
</style>