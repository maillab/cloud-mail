// Money in XPass Finance is integer minor units (cents).
//
// Every amount that is stored, summed or compared is an integer number of
// cents. The only place a decimal appears is the input boundary and the
// formatter, so a balance can never drift the way 0.1 + 0.2 does.
//
// KES has two minor units, and it is the company's operating currency. A
// currency with no minor unit would use a factor of 1; that is handled here
// rather than in each caller.

const DEFAULT_CURRENCY = 'KES';

const MINOR_UNITS = {
	KES: 100,
	USD: 100,
	EUR: 100,
	GBP: 100,
	UGX: 100,
	TZS: 100,
	RWF: 100,
};

export function minorUnits(currency = DEFAULT_CURRENCY) {
	return MINOR_UNITS[String(currency || DEFAULT_CURRENCY).toUpperCase()] || 100;
}

// "1,234.5" | "1234.5" | 1234.5 -> 123450
// Returns null when the text is not a usable amount, so a caller can reject it
// instead of silently storing zero.
export function toCents(value, currency = DEFAULT_CURRENCY) {
	if (value === null || value === undefined || value === '') return null;
	const factor = minorUnits(currency);
	const raw = String(value).replace(/[^0-9.,-]/g, '').replace(/,/g, '');
	if (!raw || raw === '-' || raw === '.' || raw === '-.') return null;
	const negative = raw.startsWith('-');
	const [whole = '0', fraction = ''] = raw.replace(/^-/, '').split('.');
	const wholePart = Number(whole || 0);
	const fracPart = Number(`${fraction}`.padEnd(2, '0').slice(0, 2) || 0);
	if (!Number.isFinite(wholePart) || !Number.isFinite(fracPart)) return null;
	const cents = Math.round(wholePart * factor) + (factor === 100 ? fracPart : 0);
	return negative ? -cents : cents;
}

// 123450 -> "1,234.50"
export function formatCents(cents, currency = DEFAULT_CURRENCY) {
	const value = Number(cents) || 0;
	const factor = minorUnits(currency);
	const negative = value < 0;
	const absolute = Math.abs(Math.round(value));
	const whole = Math.floor(absolute / factor);
	const fraction = absolute % factor;
	const body = factor === 100
		? `${whole.toLocaleString('en-US')}.${String(fraction).padStart(2, '0')}`
		: `${whole.toLocaleString('en-US')}`;
	return `${negative ? '-' : ''}${body}`;
}

// "KES 1,234.50" - one company style, used by every screen and export.
export function money(cents, currency = DEFAULT_CURRENCY) {
	return `${currency} ${formatCents(cents, currency)}`;
}

// Compact form for dense tables: 1234567 -> "12,345.67" without the code.
export function amount(cents, currency = DEFAULT_CURRENCY) {
	return formatCents(cents, currency);
}

export function sumCents(values) {
	return (values || []).reduce((total, value) => total + (Number(value) || 0), 0);
}

// A percentage that can be negative and is never clamped: an overspend must be
// visible as a negative variance rather than being hidden at zero.
export function percent(part, whole) {
	const base = Number(whole) || 0;
	if (!base) return 0;
	return Math.round(((Number(part) || 0) / base) * 1000) / 10;
}