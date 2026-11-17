// 公开对象（/oss、/attachments、/static）的响应头。
// 只允许栅格图 inline；SVG/HTML 等一律当附件，并加 nosniff + CSP sandbox。
// 内嵌附件保存、读取共用 4 小时。
export const ATT_CACHE_CONTROL = 'public, max-age=14400';

const SAFE_INLINE_TYPES = new Set([
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/bmp',
	'image/x-icon',
	'image/vnd.microsoft.icon'
]);

export function mimeTypeOf(contentType) {
	if (!contentType) {
		return '';
	}
	return String(contentType).split(';')[0].trim().toLowerCase();
}

export function isSafeInlineAtt(contentType) {
	return SAFE_INLINE_TYPES.has(mimeTypeOf(contentType));
}

export function isDangerousAttType(contentType) {
	const type = mimeTypeOf(contentType);
	return /svg|html|xml|javascript|ecmascript/.test(type);
}

export function publicFileHeaders({ contentType, contentDisposition } = {}) {
	const type = mimeTypeOf(contentType);
	const safeInline = SAFE_INLINE_TYPES.has(type);
	return {
		'Content-Type': isDangerousAttType(type) || !type
			? 'application/octet-stream'
			: contentType,
		'Content-Disposition': safeInline
			? (contentDisposition || 'inline')
			: toAttachmentDisposition(contentDisposition),
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': 'sandbox',
		'Cache-Control': ATT_CACHE_CONTROL
	};
}

function toAttachmentDisposition(disposition) {
	if (!disposition) {
		return 'attachment';
	}
	const value = String(disposition);
	if (/^\s*inline\b/i.test(value)) {
		return value.replace(/^\s*inline/i, 'attachment');
	}
	if (/^\s*attachment\b/i.test(value)) {
		return value;
	}
	return `attachment; ${value}`;
}
