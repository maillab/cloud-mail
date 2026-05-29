import { parseHTML } from 'linkedom';

const BLOCK_TAGS = new Set([
	'address',
	'article',
	'aside',
	'blockquote',
	'dd',
	'div',
	'dl',
	'dt',
	'fieldset',
	'figcaption',
	'figure',
	'footer',
	'form',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hr',
	'li',
	'main',
	'nav',
	'ol',
	'p',
	'pre',
	'section',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'tr',
	'ul'
]);
const SKIP_TAGS = new Set(['style', 'script', 'title', 'noscript']);
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
const FULL_LINK_PATTERN = /^(?:https?:\/\/|www\.)\S+$/i;

function escapeTelegramHtml(text = '') {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function escapeTelegramAttribute(text = '') {
	return escapeTelegramHtml(text).replace(/"/g, '&quot;');
}

function normalizeLinkUrl(url = '') {
	const value = url.trim();

	if (!value || /^(?:javascript|data|vbscript):/i.test(value)) {
		return '';
	}

	if (/^www\./i.test(value)) {
		return `https://${value}`;
	}

	if (/^(?:https?:\/\/|mailto:)/i.test(value)) {
		return value;
	}

	return '';
}

function splitTrailingPunctuation(url = '') {
	const match = url.match(/^(.+?)([.,;!?]+)?$/);
	return {
		url: match?.[1] || url,
		trailing: match?.[2] || ''
	};
}

function normalizeTextNode(text = '') {
	return text
		.replace(/[\u200B-\u200F\uFEFF\u034F\u00A0\u3000\u00AD]/g, ' ')
		.replace(/\s+/g, ' ');
}

function formatTelegramHtml(html = '') {
	return html
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n[ \t]+/g, '\n')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function renderTelegramLink(label, href) {
	return `<a href="${escapeTelegramAttribute(href)}">${escapeTelegramHtml(label)}</a>`;
}

function renderPlainTextUrls(text = '') {
	let result = '';
	let lastIndex = 0;

	for (const match of text.matchAll(URL_PATTERN)) {
		const fullMatch = match[0];
		const matchIndex = match.index;
		const { url, trailing } = splitTrailingPunctuation(fullMatch);
		const href = normalizeLinkUrl(url);

		result += escapeTelegramHtml(text.slice(lastIndex, matchIndex));
		result += href
			? `${renderTelegramLink('jump', href)}${escapeTelegramHtml(trailing)}`
			: escapeTelegramHtml(fullMatch);
		lastIndex = matchIndex + fullMatch.length;
	}

	result += escapeTelegramHtml(text.slice(lastIndex));
	return result;
}

function renderTextLineWithLinks(line = '') {
	const referenceMatch = line.match(/^(.*?)\s*\(\s*((?:https?:\/\/|www\.)[^\s()]+)\s*\)\s*$/i);

	if (referenceMatch) {
		const label = referenceMatch[1].trim();
		const href = normalizeLinkUrl(referenceMatch[2]);

		if (label && href) {
			const safeLabel = FULL_LINK_PATTERN.test(label) ? 'jump' : label;
			return renderTelegramLink(safeLabel, href);
		}
	}

	return renderPlainTextUrls(line);
}

const emailUtils = {

	getDomain(email) {
		if (typeof email !== 'string') return '';
		const parts = email.split('@');
		return parts.length === 2 ? parts[1] : '';
	},

	getName(email) {
		if (typeof email !== 'string') return '';
		const parts = email.trim().split('@');
		return parts.length === 2 ? parts[0] : '';
	},

	formatText(text) {
		if (!text) return ''
		return text
			.split('\n')
			.map(line => {
				return line.replace(/[\u200B-\u200F\uFEFF\u034F\u200B-\u200F\u00A0\u3000\u00AD]/g, '')
					.replace(/\s+/g, ' ')
					.trim();
			})
			.join('\n')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	hideFullLinkAddress(text) {
		if (!text) return ''
		return this.formatText(text)
			.replace(/[ \t]*\(\s*(?:https?:\/\/|www\.)[^\n)]*\s*\)/gi, '')
			.replace(/[ \t]*<\s*(?:https?:\/\/|www\.)[^>\n]*>/gi, '')
			.replace(/\b(?:https?:\/\/|www\.)[^\s<>()]+/gi, '')
			.replace(/[ \t]{2,}/g, ' ')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	textToTelegramHtmlLinks(text) {
		const formattedText = this.formatText(text);

		if (!formattedText) {
			return '';
		}

		return formattedText
			.split('\n')
			.map(line => renderTextLineWithLinks(line))
			.join('\n')
			.replace(/\n{3,}/g, '\n')
			.trim();
	},

	htmlToTelegramHtmlLinks(content) {
		if (!content) return ''

		try {
			const wrappedContent = content.includes('<body')
				? content
				: `<!DOCTYPE html><html><body>${content}</body></html>`;
			const { document } = parseHTML(wrappedContent);
			document.querySelectorAll('style, script, title, noscript').forEach(el => el.remove());

			const renderNode = node => {
				if (node.nodeType === 3) {
					return escapeTelegramHtml(normalizeTextNode(node.nodeValue || ''));
				}

				if (node.nodeType !== 1) {
					return '';
				}

				const tagName = node.localName?.toLowerCase() || '';

				if (SKIP_TAGS.has(tagName)) {
					return '';
				}

				if (tagName === 'br') {
					return '\n';
				}

				if (tagName === 'a') {
					const label = this.formatText(node.textContent || '');
					const safeLabel = !label || FULL_LINK_PATTERN.test(label) ? 'jump' : label;
					const href = normalizeLinkUrl(node.getAttribute('href') || '');

					if (!href) {
						return escapeTelegramHtml(safeLabel);
					}

					return renderTelegramLink(safeLabel, href);
				}

				const childHtml = Array.from(node.childNodes || [])
					.map(child => renderNode(child))
					.join('');

				if (tagName === 'li') {
					return `\n- ${formatTelegramHtml(childHtml)}\n`;
				}

				if (BLOCK_TAGS.has(tagName)) {
					return `\n${formatTelegramHtml(childHtml)}\n`;
				}

				return childHtml;
			};

			return formatTelegramHtml(Array.from(document.body.childNodes || [])
				.map(node => renderNode(node))
				.join(''));
		} catch (e) {
			console.error(e)
			return ''
		}
	},

	htmlToText(content) {
		if (!content) return ''
		try {
			const wrappedContent = content.includes('<body')
				? content
				: `<!DOCTYPE html><html><body>${content}</body></html>`;
			const { document } = parseHTML(wrappedContent);
			document.querySelectorAll('style, script, title').forEach(el => el.remove());
			let text = document.body.innerText;
			return this.formatText(text);
		} catch (e) {
			console.error(e)
			return ''
		}
	}
};

export default emailUtils;
