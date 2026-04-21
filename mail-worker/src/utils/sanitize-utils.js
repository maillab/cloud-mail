import { parseHTML } from 'linkedom';

const DANGEROUS_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link', 'applet'];

export function sanitizeHtml(html) {
	if (!html) return '';

	// Limit size to 500KB
	if (html.length > 500000) {
		html = html.substring(0, 500000);
	}

	const { document } = parseHTML(html);

	// Remove dangerous elements
	DANGEROUS_TAGS.forEach(tag => {
		document.querySelectorAll(tag).forEach(el => el.remove());
	});

	// Remove event handlers and javascript: URLs from all elements
	document.querySelectorAll('*').forEach(el => {
		[...el.attributes].forEach(attr => {
			if (attr.name.startsWith('on') || 
				(attr.value && attr.value.trim().toLowerCase().startsWith('javascript:'))) {
				el.removeAttribute(attr.name);
			}
		});
	});

	return document.toString();
}
