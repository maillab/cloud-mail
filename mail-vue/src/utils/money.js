// Money is integer minor units (cents) everywhere in the API. Formatting and
// parsing happen only here, so a view can never round a balance by accident and
// two views can never disagree about what KES 1,234.50 looks like.

const DEFAULT_CURRENCY = 'KES';

const SYMBOLS = {
  KES: 'KES',
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  UGX: 'UGX',
  TZS: 'TZS',
  RWF: 'RWF',
};

export function minorUnits(currency = DEFAULT_CURRENCY) {
  return 100;
}

// "1250" / "1,250.50" / 1250.5 -> 125050. Anything unparseable becomes 0 so a
// half-typed field never turns into NaN arithmetic downstream.
export function toCents(value, currency = DEFAULT_CURRENCY) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * minorUnits(currency)) : 0;
  }
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * minorUnits(currency));
}

// Cents back to the major unit a number input can hold.
export function toMajor(cents, currency = DEFAULT_CURRENCY) {
  const value = Number(cents) || 0;
  return value / minorUnits(currency);
}

function groupDigits(text) {
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatCents(cents, currency = DEFAULT_CURRENCY) {
  const value = Number(cents) || 0;
  const negative = value < 0;
  const absolute = Math.abs(value);
  const major = Math.floor(absolute / 100);
  const minor = absolute % 100;
  const symbol = SYMBOLS[currency] || currency || DEFAULT_CURRENCY;
  const body = `${groupDigits(String(major))}.${String(minor).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${symbol} ${body}`;
}

// KPI tiles need a short form: KES 1.25M rather than KES 1,250,000.00.
export function formatCentsShort(cents, currency = DEFAULT_CURRENCY) {
  const value = Number(cents) || 0;
  const symbol = SYMBOLS[currency] || currency || DEFAULT_CURRENCY;
  const negative = value < 0;
  const absolute = Math.abs(value) / 100;
  let body;
  if (absolute >= 1_000_000) body = `${trimZero(absolute / 1_000_000)}M`;
  else if (absolute >= 10_000) body = `${trimZero(absolute / 1000)}K`;
  else body = groupDigits(absolute.toFixed(absolute % 1 === 0 ? 0 : 2));
  return `${negative ? '-' : ''}${symbol} ${body}`;
}

function trimZero(value) {
  return String(Number(value.toFixed(2)));
}

// A delta shown next to a balance: "+KES 1,000.00" / "-KES 500.00".
export function formatSignedCents(cents, currency = DEFAULT_CURRENCY) {
  const value = Number(cents) || 0;
  if (value === 0) return formatCents(0, currency);
  return `${value > 0 ? '+' : ''}${formatCents(value, currency)}`;
}

export function formatPercent(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(digits)}%`;
}

export { DEFAULT_CURRENCY, SYMBOLS };