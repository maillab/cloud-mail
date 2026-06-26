export function htmlToVisibleText(html = '') {
	let text = String(html);

	text = text
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
		.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, ' ')
		.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, ' ')
		.replace(/<([a-z0-9-]+)\b(?=[^>]*\b(?:hidden|style=["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)))[^>]*>[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<(img|iframe|object|embed|video|audio|source|link|meta)[^>]*>/gi, ' ')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|tr|li|table|blockquote|section|article|h[1-6])>/gi, '\n')
		.replace(/<[^>]+>/g, ' ');

	return decodeHtmlEntities(text)
		.replace(/[\u200B-\u200F\uFEFF\u034F\u00A0\u3000\u00AD]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function hasRenderableHtml(html = '') {
	const content = String(html || '');
	if (!content.trim()) {
		return false;
	}

	if (htmlToVisibleText(content)) {
		return true;
	}

	return /<(img|iframe|object|embed|video|audio|svg|canvas)\b/i.test(content);
}

export function formatEmailBody(email = {}) {
	if (hasRenderableHtml(email.content)) {
		return {
			type: 'html',
			value: email.content || ''
		};
	}

	return {
		type: 'text',
		value: email.text || ''
	};
}

export function isCalendarAttachment(attachment = {}) {
	const mimeType = String(attachment.mimeType || attachment.contentType || '').toLowerCase();
	const filename = String(attachment.filename || '').toLowerCase();
	return mimeType.includes('text/calendar') || mimeType.includes('application/ics') || filename.endsWith('.ics');
}

export function attachmentDisplayName(attachment = {}) {
	const filename = String(attachment.filename || '').trim();
	if (filename && !['null', 'undefined'].includes(filename.toLowerCase())) {
		return filename;
	}
	return isCalendarAttachment(attachment) ? 'calendar.ics' : 'attachment';
}

export function attachmentDownloadUrl(attachment = {}, baseUrl = import.meta.env?.VITE_BASE_URL || '/api') {
	const key = String(attachment.key || '')
		.split('/')
		.map(segment => encodeURIComponent(segment))
		.join('/');
	const base = String(baseUrl || '/api').replace(/\/$/, '');
	const filename = encodeURIComponent(attachmentDisplayName(attachment));
	return `${base}/oss/${key}?filename=${filename}`;
}

function decodeHtmlEntities(text) {
	const value = String(text);

	if (typeof document !== 'undefined') {
		const textarea = document.createElement('textarea');
		textarea.innerHTML = value;
		return textarea.value;
	}

	return value
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/g, "'");
}
