import orm from '../entity/orm';
import email from '../entity/email';
import settingsReader from './settings-reader';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { sql } from 'drizzle-orm';
import jwtUtils from '../utils/jwt-utils';
import emailMsgTemplate from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate from '../template/email-html';
import domainUtils from "../utils/domain-uitls";
import type { ConfigReadContext } from '../types/context';

type ReceivedMail = typeof email.$inferSelect;
type TelegramKeyboardButton = { text: string; web_app?: { url: string }; copy_text?: { text: string } };

const telegramService = {

	async getEmailContent(c: ConfigReadContext, params: { token: string }): Promise<string> {

		const { token } = params

		const result = await jwtUtils.verifyToken(c, token);

		if (!result) {
			return emailTextTemplate('Access denied')
		}

		// Signed JSON remains untrusted. Preserve legacy ID coercion and D1's invalid-parameter errors;
		// this parameterized comparison has the same SQL as eq() and does not authorize normal session claims.
		const emailId = typeof result === 'object' && 'emailId' in result ? result.emailId : undefined;
		const emailRow = await orm(c).select().from(email).where(sql`${email.emailId} = ${emailId}`).get();

		if (emailRow) {

			if (emailRow.content) {
				const { r2Domain } = await settingsReader.query(c);
				return emailHtmlTemplate(emailRow.content || '', r2Domain)
			} else {
				return emailTextTemplate(emailRow.text || '')
			}

		} else {
			return emailTextTemplate('The email does not exist')
		}

	},

	async sendEmailToBot(c: ConfigReadContext, email: ReceivedMail): Promise<void> {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingsReader.query(c);

		if (tgChatId === null || tgChatId === undefined) throw new TypeError(`Cannot read properties of ${tgChatId} (reading 'split')`);
		const tgChatIds = tgChatId.split(',');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: email.emailId })

		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'
		const inlineKeyboard: TelegramKeyboardButton[][] = [
			[
				{
					text: 'View',
					web_app: { url: webAppUrl }
				}
			]
		];

		if (email.code) {
			inlineKeyboard.push([
				{
					text: email.code,
					copy_text: { text: email.code }
				}
			]);
		}

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId,
						parse_mode: 'HTML',
						text: emailMsgTemplate(email, tgMsgTo, tgMsgFrom, tgMsgText),
						reply_markup: {
							inline_keyboard: inlineKeyboard
						}
					})
				});
				if (!res.ok) {
					console.error(`转发 Telegram 失败 status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error(`转发 Telegram 失败:`, e instanceof Error ? e.message : String(e));
			}
		}));

	}

}

export default telegramService
