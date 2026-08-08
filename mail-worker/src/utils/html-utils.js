import { parseHTML } from 'linkedom';

const BLOCKED_TAGS = [
	'script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea',
	'select', 'option', 'meta', 'base', 'link', 'frame', 'frameset', 'applet'
];
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href'];

function isUnsafeUrl(value = '', { allowCid = true, allowDataImage = true } = {}) {
	const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
	if (!normalized) return false;
	if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return true;
	if (normalized.startsWith('data:')) {
		if (allowDataImage && /^data:image\/(png|gif|jpe?g|webp|bmp);base64,/i.test(value.trim())) return false;
		return true;
	}
	if (normalized.startsWith('cid:')) return !allowCid;
	return false;
}

export function sanitizeEmailHtml(html) {
	if (!html || typeof html !== 'string') return '';

	const wrapped = /<html[\s>]/i.test(html)
		? html
		: `<!DOCTYPE html><html><body>${html}</body></html>`;
	const { document } = parseHTML(wrapped);

	document.querySelectorAll(BLOCKED_TAGS.join(',')).forEach(element => element.remove());

	document.querySelectorAll('*').forEach(element => {
		for (const attribute of [...element.attributes]) {
			const name = attribute.name.toLowerCase();
			const value = attribute.value || '';

			if (name.startsWith('on') || name === 'srcdoc') {
				element.removeAttribute(attribute.name);
				continue;
			}

			if (URL_ATTRS.includes(name) && isUnsafeUrl(value)) {
				element.removeAttribute(attribute.name);
				continue;
			}

			if (name === 'style') {
				const cleaned = value
					.replace(/expression\s*\([^)]*\)/gi, '')
					.replace(/url\s*\(\s*['"]?\s*javascript:[^)]*\)/gi, '')
					.replace(/@import/gi, '');
				if (cleaned.trim()) element.setAttribute('style', cleaned);
				else element.removeAttribute('style');
			}
		}

		if (element.tagName?.toLowerCase() === 'a') {
			element.setAttribute('rel', 'noopener noreferrer nofollow');
			element.setAttribute('target', '_blank');
		}
	});

	return document.toString();
}

export function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
