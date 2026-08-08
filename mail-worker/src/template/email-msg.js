import emailUtils from '../utils/email-utils';

// Telegram accepts up to 4096 characters for sendMessage. Keep headroom for
// HTML entities and continuation labels while preserving the complete email by
// splitting long bodies across multiple Telegram messages instead of truncating.
const TELEGRAM_MESSAGE_LIMIT = 3900;
const CONTINUATION_HEADER = '<b>邮件正文（续）</b>\n\n';

function escapeHtml(text = '') {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function senderLine(email, tgMsgFrom) {
	if (tgMsgFrom === 'only-name') {
		return `From\u200B：${escapeHtml(email.name || email.sendEmail || '')}`;
	}
	if (tgMsgFrom === 'show') {
		const name = escapeHtml(email.name || '');
		const address = escapeHtml(email.sendEmail || '');
		return `From\u200B：${name}${name && address ? '  ' : ''}${address ? `&lt;${address}&gt;` : ''}`;
	}
	return '';
}

function recipientLine(email, tgMsgTo) {
	if (tgMsgTo !== 'show') return '';
	return `To：\u200B${escapeHtml(email.toEmail || '')}`;
}

function buildHeader(email, tgMsgTo, tgMsgFrom) {
	const parts = [`<b>${escapeHtml(email.subject || '(无主题)')}</b>`];
	const from = senderLine(email, tgMsgFrom);
	const to = recipientLine(email, tgMsgTo);
	if (from) parts.push(from);
	if (to) parts.push(to);
	return parts.join('\n');
}

function escapedLength(value) {
	let length = 0;
	for (const ch of String(value || '')) {
		if (ch === '&') length += 5;      // &amp;
		else if (ch === '<') length += 4; // &lt;
		else if (ch === '>') length += 4; // &gt;
		else length += ch.length;
	}
	return length;
}

function splitPlainTextForHtml(value, maxEncodedLength) {
	const text = String(value || '');
	if (!text) return [];
	const maxLength = Math.max(1, Number(maxEncodedLength) || 1);
	const chunks = [];
	let current = '';
	let currentLength = 0;
	let lastBreakIndex = -1;

	const flush = () => {
		if (!current) return;
		chunks.push(current);
		current = '';
		currentLength = 0;
		lastBreakIndex = -1;
	};

	for (const ch of text) {
		const encoded = escapedLength(ch);
		if (current && currentLength + encoded > maxLength) {
			// Prefer splitting at a newline/space so quoted/forwarded email sections
			// remain readable. Fall back to the exact limit for very long tokens.
			if (lastBreakIndex > Math.floor(current.length * 0.55)) {
				const head = current.slice(0, lastBreakIndex + 1).trimEnd();
				const tail = current.slice(lastBreakIndex + 1).trimStart();
				if (head) chunks.push(head);
				current = tail;
				currentLength = escapedLength(tail);
				lastBreakIndex = -1;
				for (let i = current.length - 1; i >= 0; i -= 1) {
					if (/\s/.test(current[i])) { lastBreakIndex = i; break; }
				}
			} else {
				flush();
			}
		}
		current += ch;
		currentLength += encoded;
		if (/\s/.test(ch)) lastBreakIndex = current.length - 1;
	}
	flush();
	return chunks;
}

/**
 * Build one or more Telegram HTML messages for a received email.
 *
 * The old implementation hard-truncated the body at ~3500 characters, which
 * cut off forwarded/quoted messages. This implementation keeps the exact same
 * visibility settings but sends every body character in ordered chunks.
 */
export function buildTelegramEmailMessages(email, tgMsgTo, tgMsgFrom, tgMsgText) {
	const header = buildHeader(email, tgMsgTo, tgMsgFrom);
	if (tgMsgText !== 'show') return [header];

	const body = emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content) || '';
	if (!body) return [header];

	const firstPrefix = `${header}\n\n`;
	const firstLimit = Math.max(1, TELEGRAM_MESSAGE_LIMIT - firstPrefix.length);
	const firstParts = splitPlainTextForHtml(body, firstLimit);
	if (!firstParts.length) return [header];

	const messages = [`${firstPrefix}${escapeHtml(firstParts.shift())}`];
	let remainder = firstParts.join('\n');

	// The first split used the smaller header-aware budget. Re-split the
	// remaining plain text with the larger continuation budget.
	if (remainder) {
		const continuationLimit = Math.max(1, TELEGRAM_MESSAGE_LIMIT - CONTINUATION_HEADER.length);
		for (const part of splitPlainTextForHtml(remainder, continuationLimit)) {
			messages.push(`${CONTINUATION_HEADER}${escapeHtml(part)}`);
		}
	}
	return messages;
}

// Keep the original default export for any downstream code that imports the
// template directly. It returns the first Telegram message only; production
// forwarding uses buildTelegramEmailMessages so no content is discarded.
export default function emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText) {
	return buildTelegramEmailMessages(email, tgMsgTo, tgMsgFrom, tgMsgText)[0] || '';
}
