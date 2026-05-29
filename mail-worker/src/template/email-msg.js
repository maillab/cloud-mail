import emailUtils from '../utils/email-utils';

const TELEGRAM_MESSAGE_LIMIT = 3500;
const TRUNCATED_SUFFIX = '...';

function escapeHtml(text = '') {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function truncateText(text, maxLength) {
	if (!text || text.length <= maxLength) {
		return text || '';
	}

	if (maxLength <= TRUNCATED_SUFFIX.length) {
		return TRUNCATED_SUFFIX.slice(0, maxLength);
	}

	let truncated = text.slice(0, maxLength - TRUNCATED_SUFFIX.length);
	const lastTagStart = truncated.lastIndexOf('<');
	const lastTagEnd = truncated.lastIndexOf('>');

	if (lastTagStart > lastTagEnd) {
		truncated = truncated.slice(0, lastTagStart);
	}

	const openLinkCount = (truncated.match(/<a\b[^>]*>/gi) || []).length;
	const closeLinkCount = (truncated.match(/<\/a>/gi) || []).length;

	if (openLinkCount > closeLinkCount) {
		truncated += '</a>';
	}

	return truncated + TRUNCATED_SUFFIX;
}

function getEmailText(email, tgMsgLink) {
	if (tgMsgLink === 'hide') {
		return emailUtils.textToTelegramHtmlLinks(email.text)
			|| emailUtils.htmlToTelegramHtmlLinks(email.content);
	}

	return escapeHtml(emailUtils.formatText(email.text) || emailUtils.htmlToText(email.content));
}

export default function emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText, tgMsgLink = 'show') {

	let template = `<b>${escapeHtml(email.subject || '')}</b>`

		if (tgMsgFrom === 'only-name') {
			template += `

From\u200B：${escapeHtml(email.name || '')}`
		}

		if (tgMsgFrom === 'show') {
			template += `

From\u200B：${escapeHtml(email.name || '')}  &lt;${escapeHtml(email.sendEmail || '')}&gt;`
		}

		if(tgMsgTo === 'show' && tgMsgFrom === 'hide') {
			template += `

To：\u200B${escapeHtml(email.toEmail || '')}`

		} else if(tgMsgTo === 'show') {
		template += `
To：\u200B${escapeHtml(email.toEmail || '')}`
	}

	const text = getEmailText(email, tgMsgLink);

	if(tgMsgText === 'show') {
		const prefix = `${template}

`;
		const maxTextLength = Math.max(0, TELEGRAM_MESSAGE_LIMIT - prefix.length);
		template += `

${truncateText(text, maxTextLength)}`
	}

	return template;

}
