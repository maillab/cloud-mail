<template>
  <el-dialog v-model="visible" title="Import transactions" width="860px" top="6vh" @closed="reset">
    <div class="imp">
      <section v-if="step === 'upload'" class="imp-step">
        <el-upload
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept=".csv,.xlsx,.xls"
          :on-change="onFile"
        >
          <div class="imp-drop">
            <strong>Drop a CSV or Excel file here</strong>
            <span>or click to choose. Up to 1,000 rows per import.</span>
          </div>
        </el-upload>
        <p class="imp-hint">
          Columns are matched to fields in the next step. Nothing is written until you confirm.
        </p>
      </section>
      <section v-else-if="step === 'map'" class="imp-step">
        <div class="imp-step-head">
          <div>
            <h3>Match your columns</h3>
            <span class="imp-file">{{ fileName }} · {{ headers.length }} columns · {{ rawRows.length }} rows</span>
          </div>
          <el-button text @click="step = 'upload'">Choose another file</el-button>
        </div>
        <div class="imp-map">
          <div v-for="field in FIELDS" :key="field.key" class="imp-map-row">
            <label>{{ field.label }}<span v-if="field.required" class="imp-req"> *</span></label>
            <el-select v-model="mapping[field.key]" clearable filterable placeholder="Ignore" style="width: 100%">
              <el-option v-for="header in headers" :key="header" :label="header" :value="header" />
            </el-select>
          </div>
        </div>
        <div class="imp-actions">
          <span class="imp-note">Required: account, amount, date. Everything else is optional.</span>
          <el-button type="primary" :disabled="!accountMapped" :loading="previewing" @click="runPreview">
            Preview import
          </el-button>
        </div>
      </section>
      <section v-else-if="step === 'preview'" class="imp-step">
        <div class="imp-step-head">
          <div>
            <h3>Review</h3>
            <span class="imp-file">
              {{ summary.new }} new · {{ summary.duplicate }} duplicate · {{ summary.error }} need attention
            </span>
          </div>
          <el-button text @click="step = 'map'">Back to mapping</el-button>
        </div>
        <el-alert
          v-if="summary.error"
          type="warning"
          :closable="false"
          show-icon
          title="Some rows will be skipped"
          description="Rows with errors are listed below and will not be imported."
          style="margin-bottom: 12px"
        />
        <el-table :data="previewRows" size="small" max-height="360" style="width: 100%">
          <el-table-column label="#" width="56" prop="index" />
          <el-table-column label="Status" width="110">
            <template #default="scope">
              <el-tag size="small" :type="statusType(scope.row.status)">{{ scope.row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Date" width="120" prop="date" />
          <el-table-column label="Description" min-width="180" prop="description" />
          <el-table-column label="Amount" width="130" align="right">
            <template #default="scope">{{ money(scope.row.amount_cents) }}</template>
          </el-table-column>
          <el-table-column label="Note" min-width="160">
            <template #default="scope">{{ (scope.row.problems || []).join('; ') }}</template>
          </el-table-column>
        </el-table>
        <div class="imp-actions">
          <span class="imp-note">Only new rows are written. Duplicates and errors are skipped.</span>
          <div class="imp-actions-right">
            <el-button @click="step = 'map'">Back</el-button>
            <el-button type="primary" :loading="committing" :disabled="!summary.new" @click="runCommit">
              Import {{ summary.new }} row{{ summary.new === 1 ? '' : 's' }}
            </el-button>
          </div>
        </div>
      </section>
      <section v-else-if="step === 'done'" class="imp-done">
        <el-result
          icon="success"
          title="Import complete"
          :sub-title="`${result.created} imported, ${result.duplicate} duplicate, ${result.error} skipped.`"
        >
          <template #extra>
            <el-button type="primary" @click="visible = false">Done</el-button>
          </template>
        </el-result>
        <ul v-if="result.failures && result.failures.length" class="imp-failures">
          <li v-for="fail in result.failures" :key="fail.index">Row {{ fail.index }}: {{ fail.reason }}</li>
        </ul>
      </section>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import { financeImportPreview, financeImportCommit } from '@/request/finance.js'
import { formatCents, toCents } from '@/utils/money.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accounts: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'imported'])

const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

// The fields the importer can map. 'account' is resolved from the account name
// in the file to an account_id before preview; the rest pass through.
const FIELDS = [
  { key: 'account', label: 'Account', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'txn_date', label: 'Date', required: true },
  { key: 'type', label: 'Type' },
  { key: 'direction', label: 'Direction' },
  { key: 'description', label: 'Description' },
  { key: 'counterparty', label: 'Counterparty' },
  { key: 'category', label: 'Category' },
  { key: 'method', label: 'Method' },
  { key: 'reference', label: 'Reference' },
  { key: 'fee', label: 'Fee' },
]

const step = ref('upload')
const fileName = ref('')
const headers = ref([])
const rawRows = ref([])
const mapping = reactive({})
const previewing = ref(false)
const committing = ref(false)
const previewRows = ref([])
const summary = reactive({ new: 0, duplicate: 0, error: 0 })
const result = reactive({ created: 0, duplicate: 0, error: 0, failures: [] })

const accountMapped = computed(() => Boolean(mapping.account && mapping.amount && mapping.txn_date))

function reset() {
  step.value = 'upload'
  fileName.value = ''
  headers.value = []
  rawRows.value = []
  Object.keys(mapping).forEach(key => delete mapping[key])
  previewRows.value = []
  Object.assign(summary, { new: 0, duplicate: 0, error: 0 })
  Object.assign(result, { created: 0, duplicate: 0, error: 0, failures: [] })
}

function statusType(status) {
  return { new: 'success', duplicate: 'info', error: 'warning' }[status] || ''
}

async function onFile(file) {
  const raw = file.raw
  if (!raw) return
  fileName.value = raw.name
  try {
    const buffer = await raw.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
    if (!matrix.length) {
      ElMessage({ message: 'That file looks empty.', type: 'warning', plain: true })
      return
    }
    headers.value = matrix[0].map(cell => String(cell).trim())
    rawRows.value = matrix.slice(1).map(cells => {
      const obj = {}
      headers.value.forEach((header, index) => { obj[header] = cells[index] ?? '' })
      return obj
    })
    autoMap()
    step.value = 'map'
  } catch (error) {
    ElMessage({ message: error.message || 'Could not read that file.', type: 'error', plain: true })
  }
}

// Best-effort auto-map by header name so the common case needs no manual work.
function autoMap() {
  const find = (...names) => headers.value.find(h => names.includes(h.toLowerCase().trim()))
  const guess = {
    account: find('account', 'account name'),
    amount: find('amount', 'amount_cents', 'value', 'total'),
    txn_date: find('date', 'txn_date', 'transaction date', 'posted date'),
    type: find('type', 'transaction type'),
    direction: find('direction', 'in/out', 'credit/debit'),
    description: find('description', 'narration', 'details', 'memo', 'particulars'),
    counterparty: find('counterparty', 'payee', 'merchant', 'name'),
    category: find('category'),
    method: find('method', 'payment method'),
    reference: find('reference', 'ref', 'receipt', 'transaction id'),
    fee: find('fee', 'fees', 'charge'),
  }
  Object.entries(guess).forEach(([key, value]) => { if (value) mapping[key] = value })
}

function resolveAccount(value) {
  const needle = String(value ?? '').trim().toLowerCase()
  if (!needle) return null
  const match = props.accounts.find(a =>
    String(a.name).toLowerCase() === needle || String(a.id) === needle)
  return match ? match.id : null
}

function normalizeDate(value) {
  if (!value) return ''
  // Excel serial date (number) -> ISO. XLSX with cellDates gives a Date.
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  const text = String(value).trim()
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`
  return text
}

// Turn mapped raw rows into the row shape the server expects. Account name is
// resolved to an id here; amount is parsed to cents with the same helper the
// rest of the app uses so the file and the UI can never disagree.
function buildRows() {
  return rawRows.value.map(raw => {
    const pick = key => (mapping[key] ? raw[mapping[key]] : '')
    const amount = toCents(pick('amount'))
    const fee = toCents(pick('fee'))
    return {
      account_id: resolveAccount(pick('account')),
      account_name: String(pick('account') ?? ''),
      amount_cents: amount,
      fee_cents: fee,
      txn_date: normalizeDate(pick('txn_date')),
      type: String(pick('type') || 'expense').trim().toLowerCase() || 'expense',
      direction: String(pick('direction') || '').trim().toLowerCase() || undefined,
      description: String(pick('description') ?? '').slice(0, 300),
      counterparty: String(pick('counterparty') ?? '').slice(0, 200),
      category: String(pick('category') ?? '').slice(0, 80),
      method: String(pick('method') ?? '').slice(0, 60),
      reference: String(pick('reference') ?? '').slice(0, 120),
    }
  })
}

async function runPreview() {
  previewing.value = true
  try {
    const rows = buildRows()
    const missingAccount = rows.filter(r => !r.account_id).length
    const response = await financeImportPreview(rows)
    // Surface unresolved account names as errors so the user can fix the mapping.
    const annotated = (response.rows || []).map((row, index) => {
      if (!rows[index].account_id) {
        return { ...row, status: 'error', problems: [`Unknown account "${rows[index].account_name}"`] }
      }
      return row
    })
    previewRows.value = annotated
    summary.new = annotated.filter(r => r.status === 'new').length
    summary.duplicate = annotated.filter(r => r.status === 'duplicate').length
    summary.error = annotated.filter(r => r.status === 'error').length
    if (missingAccount) {
      ElMessage({ message: `${missingAccount} row(s) reference an unknown account.`, type: 'warning', plain: true })
    }
    step.value = 'preview'
  } catch (error) {
    ElMessage({ message: error.message || 'Could not preview the import.', type: 'error', plain: true })
  } finally {
    previewing.value = false
  }
}

async function runCommit() {
  committing.value = true
  try {
    // The server re-validates and de-duplicates; we send the full mapped set and
    // it writes only the new rows. Unresolved accounts are dropped here so the
    // server's own error path stays authoritative for everything else.
    const rows = buildRows().filter(r => r.account_id)
    const response = await financeImportCommit(rows)
    Object.assign(result, {
      created: response.created || 0,
      duplicate: response.duplicate || 0,
      error: response.error || 0,
      failures: response.failures || [],
    })
    step.value = 'done'
    emit('imported', response)
  } catch (error) {
    ElMessage({ message: error.message || 'The import failed.', type: 'error', plain: true })
  } finally {
    committing.value = false
  }
}

const money = cents => formatCents(cents)
</script>

<style scoped>
.imp { display: grid; gap: 16px; }
.imp-step { display: grid; gap: 14px; }
.imp-step-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.imp-step-head h3 { margin: 0; font-size: 15px; font-weight: 650; }
.imp-file { color: var(--hq-muted); font-size: 12px; }
.imp-drop { display: grid; gap: 4px; padding: 6px 0; }
.imp-drop span { color: var(--hq-muted); font-size: 12px; }
.imp-hint { margin: 0; color: var(--hq-muted); font-size: 12px; text-align: center; }
.imp-map { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.imp-map-row { display: grid; gap: 4px; }
.imp-map-row label { font-size: 12px; font-weight: 550; color: var(--hq-text-secondary); }
.imp-req { color: var(--hq-danger, #e5484d); }
.imp-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.imp-actions-right { display: flex; gap: 8px; }
.imp-note { color: var(--hq-muted); font-size: 12px; }
.imp-done { display: grid; gap: 12px; justify-items: center; }
.imp-failures { margin: 0; padding: 0 0 0 18px; max-height: 200px; overflow: auto; color: var(--hq-muted); font-size: 12px; }
</style>