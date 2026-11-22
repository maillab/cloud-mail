// Human-readable labels for finance enums. The backend stores short machine
// values ('posted', 'draft', 'submitted'); these maps turn them into words a
// person reads. Unknown values fall back to a title-cased version so nothing
// ever shows a raw snake_case string.

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || '—'
}

const STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Pending',
  submitted: 'Submitted',
  reviewed: 'Reviewed',
  approved: 'Approved',
  rejected: 'Rejected',
  posted: 'Posted',
  void: 'Void',
  voided: 'Voided',
  cancelled: 'Cancelled',
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
  paid: 'Paid',
  unpaid: 'Unpaid',
  partial: 'Partial',
  overdue: 'Overdue',
  sent: 'Sent',
  issued: 'Issued',
  received: 'Received',
  planned: 'Planned',
  committed: 'Committed',
  settled: 'Settled',
  open: 'Open',
  closed: 'Closed',
}

const TYPE_LABELS = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  funding: 'Funding',
  reimbursement: 'Reimbursement',
  advance: 'Advance',
  payment: 'Payment',
  charge: 'Charge',
  adjustment: 'Adjustment',
  opening: 'Opening balance',
}

const DIRECTION_LABELS = {
  in: 'Money in',
  out: 'Money out',
  issued: 'Issued',
  vendor: 'Vendor',
}

const ACCOUNT_TYPE_LABELS = {
  bank: 'Bank account',
  cash: 'Cash',
  mobile_money: 'Mobile money',
  card: 'Card',
  savings: 'Savings',
  petty_cash: 'Petty cash',
}

const PAYMENT_METHOD_LABELS = {
  bank_transfer: 'Bank transfer',
  card: 'Card',
  cash: 'Cash',
  mobile_money: 'Mobile money',
  cheque: 'Cheque',
  direct_debit: 'Direct debit',
  standing_order: 'Standing order',
}

export function statusLabel(value) {
  return STATUS_LABELS[value] || titleCase(value)
}

export function typeLabel(value) {
  return TYPE_LABELS[value] || titleCase(value)
}

export function directionLabel(value) {
  return DIRECTION_LABELS[value] || titleCase(value)
}

export function accountTypeLabel(value) {
  return ACCOUNT_TYPE_LABELS[value] || titleCase(value)
}

export function paymentMethodLabel(value) {
  return PAYMENT_METHOD_LABELS[value] || titleCase(value)
}

export function humanize(value) {
  return titleCase(value)
}