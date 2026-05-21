export function normalizeEmailAddress(email) {
	return String(email ?? '').trim().toLowerCase();
}

export function parseEmailList(value, { normalize = false } = {}) {
	const items = Array.isArray(value)
		? value
		: String(value ?? '').split(/[,\uFF0C]/);

	const emails = items
		.map(item => String(item ?? '').trim())
		.filter(Boolean)
		.map(item => normalize ? normalizeEmailAddress(item) : item);

	return Array.from(new Set(emails));
}

export function emailListIncludes(value, email) {
	const normalizedEmail = normalizeEmailAddress(email);
	if (!normalizedEmail) return false;
	return parseEmailList(value, { normalize: true }).includes(normalizedEmail);
}
