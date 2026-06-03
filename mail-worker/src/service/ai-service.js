import emailUtils from '../utils/email-utils';
import { settingConst } from '../const/entity-const';
import { parseHTML } from 'linkedom';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const TRANSLATION_SEPARATOR = '<<<MAIL_TRANSLATION_SEGMENT_SEPARATOR>>>';
const SKIP_TEXT_TAGS = new Set([
	'HEAD',
	'TITLE',
	'SCRIPT',
	'NOSCRIPT',
	'STYLE',
	'LINK',
	'META',
	'IMG',
	'VIDEO',
	'AUDIO',
	'CANVAS',
	'SOURCE',
	'TRACK',
	'INPUT',
	'TEXTAREA',
	'SELECT',
	'OPTION',
	'PRE',
	'CODE',
	'SVG',
	'MATH'
]);
const MAX_HTML_SEGMENTS = 60;
const MAX_HTML_BATCH_LENGTH = 3600;
const MAX_BATCH_TRANSLATE_LENGTH = 3600;
const MAX_TRANSLATE_TEXT_LENGTH = 4000;
const MAX_INDIVIDUAL_FALLBACK_SEGMENTS = 8;
const MIN_TRANSLATION_MAX_TOKENS = 1024;
const ENABLE_HTML_STRUCTURED_TRANSLATION = true;

function getAi(c) {
	if (!c.env.ai) {
		throw new BizError(t('aiNotConfigured'), 502);
	}
	return c.env.ai;
}

function aiText(value) {
	if (typeof value === 'string') {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map(item => aiText(item?.text || item?.content || item)).filter(Boolean).join('');
	}

	return '';
}

function extractAiContent(result) {
	if (typeof result === 'string') {
		return result;
	}

	if (!result || typeof result !== 'object') {
		return '';
	}

	const directContent = aiText(result.response || result.text || result.content || result.output_text);
	if (directContent) {
		return directContent;
	}

	const choices = Array.isArray(result.choices) ? result.choices : [];
	for (const choice of choices) {
		const choiceContent = aiText(choice?.message?.content || choice?.text || choice?.content);
		if (choiceContent) {
			return choiceContent;
		}
	}

	return '';
}

function estimateLanguage(text) {
	const value = String(text || '')
		.replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
		.replace(/&[a-z]+;/gi, ' ')
		.replace(/\b[A-F0-9]{8,}\b/gi, ' ')
		.replace(/[_{}[\]<>/=\\|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!value) return 'other';

	const cjkCount = (value.match(/[\u3400-\u9FFF]/g) || []).length;
	const latinWords = value.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
	const latinWordCount = latinWords.filter(word => word.length > 1).length;
	const latinLetterCount = latinWords.join('').length;

	if (cjkCount >= 2 && latinLetterCount <= 18) {
		return 'zh';
	}

	if (cjkCount >= 6 && cjkCount >= latinLetterCount * 0.35) {
		return 'zh';
	}

	if (cjkCount >= 14 && cjkCount >= latinLetterCount * 0.18) {
		return 'zh';
	}

	if (latinWordCount >= 3 && cjkCount <= 1) {
		return 'en';
	}

	if (latinWordCount >= 6 && latinLetterCount >= cjkCount * 1.5) {
		return 'en';
	}

	return 'other';
}

function targetLangName(lang) {
	return lang === 'zh' ? 'Simplified Chinese' : 'English';
}

function translationMaxTokens(input) {
	return Math.min(4096, Math.max(MIN_TRANSLATION_MAX_TOKENS, Math.ceil(String(input || '').length * 1.6)));
}

function emailBodyText(email) {
	const htmlText = emailUtils.htmlToText(email.content || email.html || '');
	const text = emailUtils.formatText(email.text || '');
	return htmlText || text;
}

function limitText(text, maxLength = MAX_TRANSLATE_TEXT_LENGTH) {
	const value = String(text || '').trim();
	return value.length > maxLength ? value.slice(0, maxLength).trim() : value;
}

function visibleTextFromEmailLike(email) {
	const subject = email.subject || '';
	const htmlText = emailUtils.htmlToText(email.content || email.html || '');
	const text = emailUtils.formatText(email.text || '');
	return limitText(`${subject}\n${htmlText || text}`);
}

function visibleBodyFromEmailLike(email) {
	return limitText(emailBodyText(email));
}

function normalizeComparableText(text) {
	return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanTextForLanguageStats(text) {
	return String(text || '')
		.replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, ' ')
		.replace(/{{[^}]+}}/g, ' ')
		.replace(/\b[A-F0-9]{8,}\b/gi, ' ');
}

function languageStats(text) {
	const value = cleanTextForLanguageStats(text);
	return {
		cjk: (value.match(/[\u3400-\u9FFF]/g) || []).length,
		latin: (value.match(/[A-Za-z]/g) || []).length
	};
}

function hasTargetLanguage(text, targetLang) {
	const { cjk, latin } = languageStats(text);
	const totalLetters = cjk + latin;

	if (!totalLetters) {
		return false;
	}

	if (targetLang === 'zh') {
		return (cjk >= 4 && cjk >= latin * 0.1) || (cjk >= 1 && totalLetters <= 24);
	}

	return (latin >= 12 && latin >= cjk * 1.2) || (latin >= 1 && totalLetters <= 24 && cjk === 0);
}

function hasMeaningfulBody(text) {
	const { cjk, latin } = languageStats(text);
	return cjk >= 2 || latin >= 12;
}

function isUsefulTranslation(original, translated, targetLang) {
	const originalText = visibleTextFromEmailLike(original);
	const translatedText = visibleTextFromEmailLike(translated);

	if (!normalizeComparableText(translatedText)) {
		return false;
	}

	if (normalizeComparableText(originalText) === normalizeComparableText(translatedText)) {
		return false;
	}

	if (!hasTargetLanguage(translatedText, targetLang)) {
		return false;
	}

	const originalBody = visibleBodyFromEmailLike(original);
	if (hasMeaningfulBody(originalBody)) {
		return hasTargetLanguage(visibleBodyFromEmailLike(translated), targetLang);
	}

	return true;
}

function prepareTranslationText(text) {
	return String(text || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

function tagNameOf(node) {
	return String(node?.tagName || '').toUpperCase();
}

function hasHiddenStyle(element) {
	const style = String(element?.getAttribute?.('style') || '').toLowerCase();
	return /(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/.test(style)
		|| /(?:^|;)\s*visibility\s*:\s*hidden\s*(?:;|$)/.test(style);
}

function isSkippableElement(element) {
	if (!element || element.nodeType !== ELEMENT_NODE) {
		return false;
	}

	const tagName = tagNameOf(element);
	return SKIP_TEXT_TAGS.has(tagName)
		|| element.hasAttribute?.('hidden')
		|| element.getAttribute?.('aria-hidden') === 'true'
		|| element.getAttribute?.('translate') === 'no'
		|| element.classList?.contains('notranslate')
		|| hasHiddenStyle(element);
}

function collectTextNodes(root, limit = MAX_HTML_SEGMENTS) {
	const nodes = [];
	let truncated = false;

	function walk(node, skip = false) {
		if (!node || truncated) return;

		const shouldSkip = skip || isSkippableElement(node);
		if (shouldSkip) {
			return;
		}

		if (node.nodeType === TEXT_NODE) {
			const raw = node.textContent || '';
			const trimmed = raw.replace(/\s+/g, ' ').trim();
			const parentTag = tagNameOf(node.parentNode);
			if (trimmed && !SKIP_TEXT_TAGS.has(parentTag)) {
				if (nodes.length >= limit) {
					truncated = true;
					return;
				}
				nodes.push({ node, raw, text: trimmed });
			}
			return;
		}

		Array.from(node.childNodes || []).forEach(child => walk(child, shouldSkip));
	}

	walk(root);
	return { nodes, truncated };
}

function setTranslatedText(item, translated) {
	const leading = item.raw.match(/^\s*/)?.[0] || '';
	const trailing = item.raw.match(/\s*$/)?.[0] || '';
	item.node.textContent = `${leading}${translated || item.text}${trailing}`;
}

function stripCodeFence(content) {
	return String(content || '').trim()
		.replace(/^```(?:json|markdown|md|text|html)?\s*/i, '')
		.replace(/\s*```$/i, '')
		.trim();
}

function stripModelSections(content) {
	let text = stripCodeFence(content).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
	const patterns = [
		/(?:^|\n)#{1,6}\s*(?:final(?:\s+answer)?|answer|translation|translated\s+text|译文|最终答案|结果)\s*:?\s*(?:\n|$)/ig,
		/(?:^|\n)\s*(?:final(?:\s+answer)?|answer|translation|translated\s+text|译文|最终答案|结果)\s*[:：]\s*/ig
	];
	let markerEnd = -1;

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(text)) !== null) {
			markerEnd = pattern.lastIndex;
		}
	}

	if (markerEnd > -1) {
		text = text.slice(markerEnd);
	}

	return stripCodeFence(text);
}

function cleanTranslationOutput(content) {
	return stripModelSections(content)
		.replace(/^\s*(?:here(?:'s| is)\s+(?:the\s+)?translation|translated\s+text|translation)\s*[:：]\s*/i, '')
		.replace(/^\s*(?:翻译如下|译文)\s*[:：]\s*/i, '')
		.trim();
}

function parseBatchTranslationResult(content, expectedCount) {
	const text = cleanTranslationOutput(content);
	if (!text) {
		return null;
	}

	const parts = [];
	let current = [];
	const lines = text.replace(/\r\n/g, '\n').split('\n');

	for (const line of lines) {
		if (line.trim() === TRANSLATION_SEPARATOR) {
			parts.push(current.join('\n').trim());
			current = [];
		} else {
			current.push(line);
		}
	}
	parts.push(current.join('\n').trim());

	if (parts.length !== expectedCount) {
		return null;
	}

	return parts.map(part => cleanTranslationOutput(part));
}

function batchInputLength(texts) {
	return texts.join(`\n\n${TRANSLATION_SEPARATOR}\n\n`).length;
}

const aiService = {
	async extractCode(c, email, options = {}) {
		if (!this.shouldExtractCode(options.aiCode, options.aiCodeFilter, email)) {
			return '';
		}

		const ai = c.env.ai;

		try {
			const subject = email.subject || '';
			const text = emailUtils.formatText(email.text || '');
			const htmlText = emailUtils.htmlToText(email.html || '');
			const body = (htmlText || text).slice(0, 6000);

			if (!subject && !body) {
				return '';
			}

			const result = await ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct', {
				messages: [
					{
						role: 'system',
						content: 'You extract verification codes from emails. Return only JSON like {"code":"12345678"} or {"code":""}. The code must be 8 characters or fewer and must not contain spaces. If the code is longer than 8 characters or contains spaces, return {"code":""}. Do not explain.'
					},
					{
						role: 'user',
						content: `Subject: ${subject}\n\n${body}`
					}
				],
				temperature: 0,
				max_tokens: 32
			});

			const content = extractAiContent(result);
			const json = JSON.parse(content);
			if (typeof json.code !== 'string') {
				return '';
			}

			if (json.code.length > 8 || /\s/.test(json.code)) {
				return '';
			}

			return json.code;
		} catch (e) {
			console.error('验证码提取失败: ', e);
			return '';
		}
	},

	async detectEmailLanguage(c, email) {
		const subject = email.subject || '';
		const body = emailBodyText(email).slice(0, 6000);

		return estimateLanguage(`${subject}\n${body}`);
	},

	async translateEmail(c, email, targetLang) {
		const subject = email.subject || '';
		const content = email.content || '';
		const text = limitText(emailUtils.formatText(email.text || ''));
		const originalBodyText = emailBodyText(email) || text;
		const bodyText = limitText(originalBodyText);

		if (ENABLE_HTML_STRUCTURED_TRANSLATION && content && originalBodyText.length <= MAX_TRANSLATE_TEXT_LENGTH) {
			try {
				const translatedHtml = await this.translateHtmlEmail(c, subject, content, targetLang);
				if (translatedHtml) {
					return translatedHtml;
				}
			} catch (e) {
				console.error('HTML邮件翻译失败，回退纯文本: ', e);
			}
		}

		return await this.translatePlainEmail(c, subject, bodyText, targetLang);
	},

	async translateHtmlEmail(c, subject, content, targetLang) {
		const hasDocument = /<(?:html|body)(?:\s|>)/i.test(content);
		const wrappedContent = hasDocument ? content : `<!DOCTYPE html><html><body>${content}</body></html>`;
		const { document } = parseHTML(wrappedContent);
		const root = document.body || document;
		const { nodes, truncated } = collectTextNodes(root);
		const segments = nodes.map(item => item.text);
		const texts = [subject, ...segments];

		if (truncated || batchInputLength(texts) > MAX_HTML_BATCH_LENGTH) {
			throw new Error('HTML正文过长，跳过保结构翻译');
		}

		const translatedSegments = await this.translateTextBatch(c, texts, targetLang);
		const [translatedSubject, ...translatedBodySegments] = translatedSegments;
		nodes.forEach((item, index) => setTranslatedText(item, translatedBodySegments[index]));

		const translatedContent = hasDocument ? document.toString() : (document.body?.innerHTML || '');
		const translated = {
			subject: translatedSubject || subject,
			content: translatedContent,
			text: emailUtils.htmlToText(translatedContent)
		};

		if (!isUsefulTranslation({ subject, content }, translated, targetLang)) {
			throw new Error('HTML翻译结果不是目标语言');
		}

		return translated;
	},

	async translatePlainEmail(c, subject, text, targetLang) {
		text = limitText(text);
		const [translatedSubject, translatedText] = await this.translateTextBatch(c, [subject, text], targetLang, {
			maxIndividualFallback: 2
		});
		const translated = {
			subject: translatedSubject || subject,
			content: '',
			text: translatedText || text
		};

		if (translated && isUsefulTranslation({ subject, text }, translated, targetLang)) {
			return translated;
		}

		throw new Error('纯文本翻译结果不可用');
	},

	async translateTextBatch(c, texts, targetLang, options = {}) {
		const results = new Array(texts.length).fill('');
		const entries = texts
			.map((text, index) => ({ index, text: prepareTranslationText(text) }))
			.filter(item => item.text);

		if (!entries.length) {
			return results;
		}

		if (entries.length === 1) {
			results[entries[0].index] = await this.translateText(c, entries[0].text, targetLang);
			return results;
		}

		const maxIndividualFallback = options.maxIndividualFallback ?? MAX_INDIVIDUAL_FALLBACK_SEGMENTS;
		if (entries.length <= maxIndividualFallback) {
			const translatedList = await Promise.all(entries.map(entry => this.translateText(c, entry.text, targetLang)));
			entries.forEach((entry, index) => {
				results[entry.index] = translatedList[index] || entry.text;
			});
			return results;
		}

		const batchText = entries.map(item => item.text).join(`\n\n${TRANSLATION_SEPARATOR}\n\n`);

		if (batchText.length <= MAX_BATCH_TRANSLATE_LENGTH) {
			const translatedBatchText = await this.translateText(c, batchText, targetLang, {
				isBatch: true,
				expectedSegments: entries.length
			});
			const parsed = parseBatchTranslationResult(translatedBatchText, entries.length);
			if (parsed) {
				entries.forEach((entry, index) => {
					results[entry.index] = parsed[index] || entry.text;
				});
				return results;
			}
			console.warn('AI批量翻译分隔符数量不匹配，准备单条回退。');
		}

		if (entries.length > maxIndividualFallback) {
			throw new Error('批量翻译结果无法分割，且片段过多');
		}

		const translatedList = await Promise.all(entries.map(entry => this.translateText(c, entry.text, targetLang)));
		entries.forEach((entry, index) => {
			results[entry.index] = translatedList[index] || entry.text;
		});
		return results;
	},

	async translateText(c, text, targetLang, options = {}) {
		const ai = getAi(c);
		const input = prepareTranslationText(text);
		if (!input) {
			return '';
		}

		const batchRule = options.isBatch
			? `\nIf the input contains standalone separator lines exactly equal to ${TRANSLATION_SEPARATOR}, keep the same separator lines in the output. The output must contain exactly ${options.expectedSegments} translated segments in the same order. Treat the separator as a control marker, not text to translate.`
			: '';

		const result = await ai.run(c.env.ai_model || '@cf/meta/llama-3.1-8b-instruct', {
			messages: [
				{
					role: 'system',
					content: `Translate the user's text to ${targetLangName(targetLang)}. Return only the translated text. Do not include markdown, analysis, notes, labels, JSON, or explanations. Preserve URLs, email addresses, verification codes, product names, placeholders such as {{domain}}, and line breaks.${batchRule}`
				},
				{
					role: 'user',
					content: input
				}
			],
			temperature: 0,
			max_tokens: translationMaxTokens(input)
		});

		const content = extractAiContent(result);
		const translated = cleanTranslationOutput(content);
		if (!translated) {
			console.warn('AI翻译片段返回为空，保留原文片段。');
			return options.isBatch ? '' : input;
		}
		return translated;
	},

	isTranslationUsable(original, translated, targetLang) {
		return isUsefulTranslation(original, translated, targetLang);
	},

	shouldExtractCode(aiCode, aiCodeFilterStr, email) {
		if (aiCode !== settingConst.aiCode.OPEN) {
			return false;
		}

		const filterList = aiCodeFilterStr ? aiCodeFilterStr.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) : [];

		if (filterList.length === 0) {
			return true;
		}

		const fromEmail = (email.from?.address || '').trim().toLowerCase();
		const fromDomain = emailUtils.getDomain(fromEmail).toLowerCase();

		return filterList.some(item => item === fromEmail || item === fromDomain);
	}
};

export {
	TRANSLATION_SEPARATOR,
	cleanTranslationOutput,
	collectTextNodes,
	estimateLanguage,
	parseBatchTranslationResult
};

export default aiService;
