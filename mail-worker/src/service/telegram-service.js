import orm from '../entity/orm';
import email from '../entity/email';
import settingService from './setting-service';
import { eq } from 'drizzle-orm';
import jwtUtils from '../utils/jwt-utils';
import { buildTelegramEmailMessages } from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate from '../template/email-html';
import domainUtils from '../utils/domain-uitls';
import constant from '../const/constant';
import attService from './att-service';
import r2Service from './r2-service';
import BizError from '../error/biz-error';
import { buildTelegramInlineKeyboard, normalizeTelegramChatIds, telegramPlainText } from '../utils/telegram-utils';

const TELEGRAM_API = 'https://api.telegram.org';

async function readTelegramResponse(response) {
	let payload = null;
	try { payload = await response.json(); } catch { /* Telegram normally returns JSON. */ }
	if (!response.ok || payload?.ok === false) {
		const description = payload?.description || `HTTP ${response.status}`;
		throw new Error(description);
	}
	return payload?.result ?? null;
}

async function sendTelegramJSON(token, method, body) {
	const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	return readTelegramResponse(response);
}

async function sendTelegramDocument(token, chatId, attachment) {
	const form = new FormData();
	form.append('chat_id', chatId);
	form.append(
		'document',
		new Blob([attachment.content], { type: attachment.mimeType || 'application/octet-stream' }),
		attService.cleanFilename(attachment.filename)
	);
	const response = await fetch(`${TELEGRAM_API}/bot${token}/sendDocument`, {
		method: 'POST',
		body: form
	});
	return readTelegramResponse(response);
}

async function objectToUint8Array(object) {
	if (!object) return null;
	if (object instanceof Uint8Array) return object;
	if (object instanceof ArrayBuffer) return new Uint8Array(object);
	if (ArrayBuffer.isView(object)) return new Uint8Array(object.buffer, object.byteOffset, object.byteLength);
	if (typeof object.arrayBuffer === 'function') return new Uint8Array(await object.arrayBuffer());
	if (object.body) return new Uint8Array(await new Response(object.body).arrayBuffer());
	return null;
}

async function loadStoredAttachments(c, emailId) {
	const rows = await attService.selectByEmailIds(c, [emailId]);
	const result = [];
	for (const row of rows) {
		try {
			const object = await r2Service.getObj(c, row.key);
			const content = await objectToUint8Array(object);
			if (!content?.byteLength) {
				console.warn(`Telegram 附件读取为空 emailId=${emailId} attId=${row.attId}`);
				continue;
			}
			result.push({
				filename: row.filename || 'attachment',
				mimeType: row.mimeType || 'application/octet-stream',
				content
			});
		} catch (error) {
			console.error(`Telegram 附件读取失败 emailId=${emailId} attId=${row.attId}:`, error?.message || error);
		}
	}
	return result;
}

async function sendEmailSummary(token, chatId, htmlText, replyMarkup) {
	const body = {
		chat_id: chatId,
		parse_mode: 'HTML',
		text: htmlText
	};
	if (replyMarkup) body.reply_markup = replyMarkup;
	try {
		return await sendTelegramJSON(token, 'sendMessage', body);
	} catch (firstError) {
		// HTML parse/reply-markup compatibility should never make the whole notification disappear.
		console.warn(`Telegram 富文本消息失败 chat=${chatId}, fallback plain text:`, firstError?.message || firstError);
		return sendTelegramJSON(token, 'sendMessage', {
			chat_id: chatId,
			text: telegramPlainText(htmlText)
		});
	}
}

const telegramService = {

	async getEmailContent(c, params) {
		const { token } = params;
		const result = await jwtUtils.verifyToken(c, token, { purpose: 'telegram-email' });
		if (!result) return emailTextTemplate('Access denied');

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();
		if (!emailRow) return emailTextTemplate('The email does not exist');
		if (emailRow.content) {
			const { r2Domain } = await settingService.query(c);
			return emailHtmlTemplate(emailRow.content || '', r2Domain);
		}
		return emailTextTemplate(emailRow.text || '');
	},

	async sendEmailToBot(c, emailRow) {
		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);
		if (!tgBotToken || !tgChatId) return { sent: 0, failed: 0, attachments: 0 };

		const chatIds = normalizeTelegramChatIds(tgChatId);
		if (!chatIds.length) return { sent: 0, failed: 0, attachments: 0 };

		let viewUrl = '';
		if (customDomain) {
			const jwtToken = await jwtUtils.generateToken(
				c,
				{ purpose: 'telegram-email', emailId: emailRow.emailId },
				Math.min(constant.TOKEN_EXPIRE, 7 * 24 * 60 * 60)
			);
			viewUrl = `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}`;
		}
		// Telegram web_app buttons are private-chat-only. A normal HTTPS URL button works
		// for private chats, groups and channels, including negative chat IDs.
		const replyMarkup = buildTelegramInlineKeyboard(viewUrl, emailRow.code);
		const messageTexts = buildTelegramEmailMessages(emailRow, tgMsgTo, tgMsgFrom, tgMsgText);
		let attachments = [];
		try {
			attachments = await loadStoredAttachments(c, emailRow.emailId);
		} catch (error) {
			// Attachment storage/read failures must not suppress the Telegram text notification.
			console.error(`Telegram 附件列表读取失败 emailId=${emailRow.emailId}:`, error?.message || error);
		}

		let sent = 0;
		let failed = 0;
		let sentAttachments = 0;
		await Promise.all(chatIds.map(async chatId => {
			try {
				for (let index = 0; index < messageTexts.length; index += 1) {
					await sendEmailSummary(
						tgBotToken,
						chatId,
						messageTexts[index],
						index === 0 ? replyMarkup : undefined
					);
				}
				sent += 1;
				for (const attachment of attachments) {
					try {
						await sendTelegramDocument(tgBotToken, chatId, attachment);
						sentAttachments += 1;
					} catch (error) {
						console.error(`Telegram 附件转发失败 chat=${chatId} file=${attachment.filename}:`, error?.message || error);
					}
				}
			} catch (error) {
				failed += 1;
				console.error(`转发 Telegram 失败 chat=${chatId}:`, error?.message || error);
			}
		}));

		return { sent, failed, attachments: sentAttachments };
	},

	async testBot(c) {
		const { tgBotToken, tgChatId } = await settingService.query(c);
		if (!tgBotToken) throw new BizError('请先配置 Telegram Bot Token', 400);
		const chatIds = normalizeTelegramChatIds(tgChatId);
		if (!chatIds.length) throw new BizError('请先配置有效的 Telegram Chat ID', 400);

		let sent = 0;
		const failures = [];
		for (const chatId of chatIds) {
			try {
				await sendTelegramJSON(tgBotToken, 'sendMessage', {
					chat_id: chatId,
					text: 'CloudMail Telegram 测试消息：配置连接正常。'
				});
				sent += 1;
			} catch (error) {
				failures.push(`${chatId}: ${error?.message || error}`);
			}
		}
		if (!sent) throw new BizError(`Telegram 测试失败：${failures[0] || '未知错误'}`, 502);
		return { sent, total: chatIds.length, failed: chatIds.length - sent };
	}
};

export default telegramService;
