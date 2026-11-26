<template>
  <div class="pv">
    <div v-if="loading" class="pv-status">Loading invoice…</div>
    <div v-else-if="error" class="pv-status pv-error">
      <h1>Invoice not available</h1>
      <p>{{ error }}</p>
    </div>
    <article v-else-if="invoice" class="pv-sheet">
      <header class="pv-head">
        <div class="pv-brand">
          <img v-if="logo" :src="logo" alt="XPass" class="pv-logo" />
          <span v-else class="pv-logo-text">XPass</span>
        </div>
        <div class="pv-title">
          <h1>Invoice</h1>
          <span class="pv-number">{{ invoice.invoice_number }}</span>
        </div>
      </header>

      <section class="pv-meta">
        <div>
          <span class="pv-label">Billed to</span>
          <strong>{{ invoice.client_name || '—' }}</strong>
        </div>
        <div>
          <span class="pv-label">Issued</span>
          <strong>{{ invoice.issue_date || '—' }}</strong>
        </div>
        <div>
          <span class="pv-label">Due</span>
          <strong>{{ invoice.due_date || '—' }}</strong>
        </div>
        <div>
          <span class="pv-label">Status</span>
          <strong class="pv-status-pill">{{ statusLabel(invoice.status) }}</strong>
        </div>
      </section>

      <table class="pv-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="pv-right">Qty</th>
            <th class="pv-right">Rate</th>
            <th class="pv-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in invoice.items" :key="index">
            <td>{{ item.description }}</td>
            <td class="pv-right">{{ item.quantity }}</td>
            <td class="pv-right">{{ money(item.rate_cents) }}</td>
            <td class="pv-right">{{ money(item.amount_cents) }}</td>
          </tr>
          <tr v-if="!invoice.items || !invoice.items.length">
            <td colspan="4" class="pv-empty">No line items.</td>
          </tr>
        </tbody>
      </table>

      <section class="pv-totals">
        <div class="pv-total-row">
          <span>Subtotal</span>
          <span>{{ money(invoice.subtotal_cents) }}</span>
        </div>
        <div v-if="invoice.tax_cents" class="pv-total-row">
          <span>Tax</span>
          <span>{{ money(invoice.tax_cents) }}</span>
        </div>
        <div class="pv-total-row pv-grand">
          <span>Total</span>
          <span>{{ money(invoice.total_cents) }}</span>
        </div>
        <div v-if="invoice.paid_cents" class="pv-total-row">
          <span>Paid</span>
          <span>{{ money(invoice.paid_cents) }}</span>
        </div>
        <div v-if="invoice.balance_cents" class="pv-total-row pv-balance">
          <span>Balance due</span>
          <span>{{ money(invoice.balance_cents) }}</span>
        </div>
      </section>

      <footer class="pv-foot">
        <span>{{ invoice.currency }}</span>
        <button type="button" class="pv-print" @click="print">Print / Save as PDF</button>
      </footer>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { publicInvoice } from '@/request/finance.js'
import { formatCents } from '@/utils/money.js'

const route = useRoute()
const loading = ref(true)
const error = ref('')
const invoice = ref(null)

// Keep the print output on the company's own currency formatting. The public
// payload always carries a currency code, defaulting to KES if absent.
const logo = computed(() => invoice.value?.brand_logo || '')

const STATUS_LABELS = {
  draft: 'Draft', sent: 'Sent', viewed: 'Viewed', partial: 'Partially paid',
  paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
}
function statusLabel(status) {
  return STATUS_LABELS[status] || status || '—'
}

function money(cents) {
  return formatCents(cents, invoice.value?.currency)
}

function print() {
  window.print()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    invoice.value = await publicInvoice(route.params.token)
    if (!invoice.value) error.value = 'This link may have expired or been revoked.'
  } catch (e) {
    error.value = e?.message || 'This invoice link is not available.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.pv {
  min-height: 100vh;
  padding: 32px 16px;
  background: var(--hq-page, #f5f5f5);
  display: flex;
  justify-content: center;
}

.pv-status {
  color: var(--hq-muted, #6b6b6b);
  font-size: 14px;
  padding-top: 40px;
}

.pv-error {
  text-align: center;
}

.pv-error h1 {
  font-size: 20px;
  margin: 0 0 8px;
}

.pv-sheet {
  width: 100%;
  max-width: 760px;
  background: #fff;
  color: #1a1a1a;
  padding: 40px 48px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, .08);
  border-radius: 8px;
}

.pv-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 2px solid #eee;
  padding-bottom: 20px;
}

.pv-logo {
  height: 34px;
}

.pv-logo-text {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -.02em;
}

.pv-title {
  text-align: right;
}

.pv-title h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
}

.pv-number {
  color: #666;
  font-size: 13px;
}

.pv-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  margin: 24px 0;
}

.pv-meta > div {
  display: grid;
  gap: 4px;
}

.pv-label {
  color: #888;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.pv-meta strong {
  font-size: 14px;
}

.pv-status-pill {
  display: inline-block;
  width: fit-content;
  padding: 2px 10px;
  border-radius: 10px;
  background: #f0f0f0;
  font-size: 12px;
}

.pv-table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0 24px;
}

.pv-table th {
  text-align: left;
  padding: 8px 0;
  border-bottom: 1px solid #e2e2e2;
  font-size: 12px;
  color: #666;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.pv-table td {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}

.pv-right {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pv-empty {
  color: #999;
  text-align: center;
}

.pv-totals {
  margin-left: auto;
  max-width: 300px;
  display: grid;
  gap: 6px;
}

.pv-total-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.pv-grand {
  border-top: 1px solid #e2e2e2;
  padding-top: 8px;
  font-size: 16px;
  font-weight: 700;
}

.pv-balance {
  font-weight: 700;
}

.pv-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 36px;
  padding-top: 16px;
  border-top: 1px solid #eee;
  color: #888;
  font-size: 12px;
}

.pv-print {
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
}

.pv-print:hover {
  background: #f7f7f7;
}

@media print {
  .pv {
    padding: 0;
    background: #fff;
  }
  .pv-sheet {
    max-width: none;
    box-shadow: none;
    padding: 0;
  }
  .pv-print {
    display: none;
  }
}
</style>