<template>
  <div class="fin-panel">
    <header class="fin-head">
      <div>
        <div class="fin-kicker">Who changed what</div>
        <h2>Audit log</h2>
      </div>
      <div class="fin-head-actions">
        <el-button size="small" text circle icon="refresh" title="Refresh" aria-label="Refresh" @click="load" />
      </div>
    </header>

    <section class="fin-card" v-loading="loading">
      <div class="fin-filters">
        <el-input
          v-model="filters.search"
          placeholder="Search record, reason, action…"
          clearable
          style="max-width: 280px"
          @keyup.enter="applyFilters"
          @clear="applyFilters"
        />
        <el-select v-model="filters.entity_type" clearable placeholder="Entity" style="width: 160px" @change="applyFilters">
          <el-option v-for="type in ENTITY_TYPES" :key="type" :label="type" :value="type" />
        </el-select>
        <el-date-picker
          v-model="filters.from"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="From"
          style="width: 150px"
          @change="applyFilters"
        />
        <el-date-picker
          v-model="filters.to"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="To"
          style="width: 150px"
          @change="applyFilters"
        />
        <el-button text @click="resetFilters">Clear</el-button>
        <span class="fin-card-note">{{ total }} event{{ total === 1 ? '' : 's' }}</span>
      </div>

      <el-table v-if="rows.length" :data="rows" size="small" style="width: 100%">
        <el-table-column label="When" min-width="160">
          <template #default="scope">
            <span class="fin-mono">{{ scope.row.create_time }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Who" min-width="150">
          <template #default="scope">{{ scope.row.actor_label }}</template>
        </el-table-column>
        <el-table-column label="What happened" min-width="300">
          <template #default="scope">{{ scope.row.summary }}</template>
        </el-table-column>
        <el-table-column label="Type" min-width="110">
          <template #default="scope">
            <span class="fin-tag">{{ scope.row.entity_type }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Amount" min-width="130" align="right">
          <template #default="scope">{{ scope.row.amount_label || '—' }}</template>
        </el-table-column>
      </el-table>

      <div v-else-if="!loading" class="fin-empty">No audit events match these filters.</div>

      <div v-if="total > rows.length" class="fin-pager">
        <el-button size="small" :disabled="page <= 1" @click="changePage(page - 1)">Previous</el-button>
        <span class="fin-pager-label">Page {{ page }} of {{ pages }}</span>
        <el-button size="small" :disabled="page >= pages" @click="changePage(page + 1)">Next</el-button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { financeAudit } from '@/request/finance.js'

const ENTITY_TYPES = [
  'account', 'account_access', 'transaction', 'transfer', 'funding', 'budget',
  'commitment', 'debt', 'subscription', 'invoice', 'reimbursement', 'advance',
]

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 50

const filters = reactive({ search: '', entity_type: '', from: '', to: '' })

const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function load() {
  loading.value = true
  try {
    const result = await financeAudit({
      page: page.value,
      pageSize,
      search: filters.search || undefined,
      entity_type: filters.entity_type || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    })
    rows.value = result.list || []
    total.value = result.total ?? 0
  } catch (error) {
    ElMessage({ message: error.message || 'Could not load the audit log.', type: 'error', plain: true })
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  page.value = 1
  load()
}

function resetFilters() {
  Object.assign(filters, { search: '', entity_type: '', from: '', to: '' })
  applyFilters()
}

function changePage(next) {
  page.value = next
  load()
}

onMounted(load)
</script>

<style scoped>
.fin-panel {
  display: grid;
  gap: 16px;
  max-width: 1180px;
}

.fin-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.fin-kicker {
  color: var(--hq-muted);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: .04em;
  text-transform: uppercase;
}

.fin-head h2 {
  margin: 2px 0 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -.03em;
}

.fin-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fin-card {
  padding: 14px 16px 16px;
  border: 1px solid var(--hq-border, rgba(148, 163, 184, .2));
  border-radius: 11px;
  background: var(--hq-surface, transparent);
}

.fin-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.fin-card-note {
  color: var(--hq-muted);
  font-size: 11.5px;
}

.fin-mono {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.fin-tag {
  padding: 0 6px;
  border-radius: 8px;
  background: var(--hq-hover);
  color: var(--hq-muted);
  font-size: 10.5px;
  font-weight: 600;
}

.fin-empty {
  padding: 26px 0;
  color: var(--hq-muted);
  font-size: 12.5px;
  text-align: center;
}

.fin-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.fin-pager-label {
  color: var(--hq-muted);
  font-size: 12px;
}
</style>