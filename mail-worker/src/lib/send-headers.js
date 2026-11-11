export function buildSendHeaders(params) {
	const headers = { ...(params.headers || {}) };
	if (params.sendType === 'reply' && params.messageId) {
		headers['in-reply-to'] = params.messageId;
		headers['references'] = params.messageId;
	}
	return Object.keys(headers).length > 0 ? headers : undefined;
}

export function formatFromAddress(name, email) {
	const cleaned = String(name ?? '').replace(/[\\"]/g, '').trim();
	return cleaned ? `"${cleaned}" <${email}>` : email;
}
