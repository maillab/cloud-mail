export function normalizeTelegramChatIds(value, limit = 50) {
	return [...new Set(String(value || '')
		.split(',')
		.map(item => item.trim())
		.filter(item => /^-?\d{1,32}$/.test(item)))]
		.slice(0, Math.max(0, Number(limit) || 0));
}

export function buildTelegramInlineKeyboard(viewUrl, copyText = '') {
	const rows = [];
	const url = String(viewUrl || '').trim();
	if (/^https:\/\//i.test(url)) rows.push([{ text: 'View', url }]);
	const code = String(copyText || '').trim().slice(0, 256);
	if (code) rows.push([{ text: code, copy_text: { text: code } }]);
	return rows.length ? { inline_keyboard: rows } : undefined;
}

export function telegramPlainText(html) {
	return String(html || '')
		.replace(/<\/?(?:b|strong|i|em|code|pre)>/gi, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/&#39;/g, "'")
		.replace(/&quot;/g, '"');
}
