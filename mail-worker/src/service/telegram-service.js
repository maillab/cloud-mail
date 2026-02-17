import orm from '../entity/orm';
import email from '../entity/email';
import settingService from './setting-service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);
import { eq } from 'drizzle-orm';
import jwtUtils from '../utils/jwt-utils';
import timezoneUtils from '../utils/timezone-utils';
import emailMsgTemplate, { 
	loginMsgTemplate, 
	registerMsgTemplate, 
	sendEmailMsgTemplate,
	deleteEmailMsgTemplate,
	addAddressMsgTemplate,
	deleteAddressMsgTemplate,
	roleChangeMsgTemplate,
	userStatusChangeMsgTemplate,
	passwordResetMsgTemplate,
	userSelfDeleteMsgTemplate,
	adminDeleteUserMsgTemplate,
	failedLoginMsgTemplate,
	quotaWarningMsgTemplate
} from '../template/email-msg';
import emailTextTemplate from '../template/email-text';
import emailHtmlTemplate from '../template/email-html';
import verifyUtils from '../utils/verify-utils';
import domainUtils from "../utils/domain-uitls";

const telegramService = {

	async getEmailContent(c, params) {

		const { token } = params

		const result = await jwtUtils.verifyToken(c, token);

		if (!result) {
			return emailTextTemplate('Access denied')
		}

		const emailRow = await orm(c).select().from(email).where(eq(email.emailId, result.emailId)).get();

		if (emailRow) {

			if (emailRow.content) {
				const { r2Domain } = await settingService.query(c);
				return emailHtmlTemplate(emailRow.content || '', r2Domain)
			} else {
				return emailTextTemplate(emailRow.text || '')
			}

		} else {
			return emailTextTemplate('The email does not exist')
		}

	},

	// Fungsi helper untuk mengirim pesan ke Telegram
	async sendTelegramMessage(c, message) {
		const { tgBotToken, tgChatId } = await settingService.query(c);

		if (!tgBotToken || !tgChatId) {
			return;
		}

		const tgChatIds = tgChatId.split(',');

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId.trim(),
						parse_mode: 'HTML',
						text: message
					})
				});
				if (!res.ok) {
					console.error(`Failed to send Telegram notification status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error(`Failed to send Telegram notification:`, e.message);
			}
		}));
	},

	// Notifikasi untuk penerimaan email
	async sendEmailToBot(c, emailData) {

		const { tgBotToken, tgChatId, customDomain, tgMsgTo, tgMsgFrom, tgMsgText } = await settingService.query(c);

		if (!tgBotToken || !tgChatId) {
			return;
		}

		const tgChatIds = tgChatId.split(',');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: emailData.emailId })

		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404'

		const senderTimezone = null;

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId.trim(),
						parse_mode: 'HTML',
						text: emailMsgTemplate(emailData, tgMsgTo, tgMsgFrom, tgMsgText, senderTimezone),
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: 'Check',
										web_app: { url: webAppUrl }
									}
								]
							]
						}
					})
				});
				if (!res.ok) {
					console.error(`Failed to forward to Telegram status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error(`Failed to forward to Telegram:`, e.message);
			}
		}));

	},

	// Notifikasi untuk login
	async sendLoginNotification(c, userInfo) {
		const timezone = await timezoneUtils.getTimezone(c, userInfo.activeIp);
		userInfo.timezone = timezone;
		
		const message = loginMsgTemplate(userInfo);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk registrasi
	async sendRegisterNotification(c, userInfo, accountCount, roleInfo = null) {
		const timezone = await timezoneUtils.getTimezone(c, userInfo.createIp);
		userInfo.timezone = timezone;
		
		const message = registerMsgTemplate(userInfo, accountCount, roleInfo);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk pengiriman email (dengan web app preview)
	async sendEmailSentNotification(c, emailInfo, userInfo) {
		const { tgBotToken, tgChatId, customDomain } = await settingService.query(c);

		if (!tgBotToken || !tgChatId) {
			return;
		}

		const tgChatIds = tgChatId.split(',');

		const jwtToken = await jwtUtils.generateToken(c, { emailId: emailInfo.emailId });
		const webAppUrl = customDomain ? `${domainUtils.toOssDomain(customDomain)}/api/telegram/getEmail/${jwtToken}` : 'https://www.cloudflare.com/404';

		const timezone = await timezoneUtils.getTimezone(c, userInfo.activeIp);
		userInfo.timezone = timezone;

		const message = sendEmailMsgTemplate(emailInfo, userInfo);

		await Promise.all(tgChatIds.map(async chatId => {
			try {
				const res = await fetch(`https://api.telegram.org/bot${tgBotToken}/sendMessage`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						chat_id: chatId.trim(),
						parse_mode: 'HTML',
						text: message,
						reply_markup: {
							inline_keyboard: [
								[
									{
										text: 'Check',
										web_app: { url: webAppUrl }
									}
								]
							]
						}
					})
				});
				if (!res.ok) {
					console.error(`Failed to send email sent notification status: ${res.status} response: ${await res.text()}`);
				}
			} catch (e) {
				console.error(`Failed to send email sent notification:`, e.message);
			}
		}));
	},

	// Notifikasi untuk penghapusan email
	async sendEmailDeleteNotification(c, emailIds, userInfo) {
		const timezone = await timezoneUtils.getTimezone(c, userInfo.activeIp);
		userInfo.timezone = timezone;
		
		const message = deleteEmailMsgTemplate(emailIds, userInfo);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk penambahan address
	async sendAddAddressNotification(c, addressInfo, userInfo, totalAddresses) {
		const timezone = await timezoneUtils.getTimezone(c, userInfo.activeIp);
		userInfo.timezone = timezone;
		
		const message = addAddressMsgTemplate(addressInfo, userInfo, totalAddresses);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk penghapusan address
	async sendDeleteAddressNotification(c, addressEmail, userInfo, remainingAddresses) {
		const timezone = await timezoneUtils.getTimezone(c, userInfo.activeIp);
		userInfo.timezone = timezone;
		
		const message = deleteAddressMsgTemplate(addressEmail, userInfo, remainingAddresses);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk perubahan role
	async sendRoleChangeNotification(c, userInfo, oldRole, newRole, changedBy) {
		const timezone = await timezoneUtils.getTimezone(c, changedBy.activeIp);
		changedBy.timezone = timezone;
		
		const message = roleChangeMsgTemplate(userInfo, oldRole, newRole, changedBy);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk perubahan status user
	async sendUserStatusChangeNotification(c, userInfo, oldStatus, newStatus, changedBy) {
		const timezone = await timezoneUtils.getTimezone(c, changedBy.activeIp);
		changedBy.timezone = timezone;
		
		const message = userStatusChangeMsgTemplate(userInfo, oldStatus, newStatus, changedBy);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk password reset
	async sendPasswordResetNotification(c, userInfo) {
		const timezone = await timezoneUtils.getTimezone(c, userInfo.activeIp);
		userInfo.timezone = timezone;
		
		const message = passwordResetMsgTemplate(userInfo);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk user self-delete
	async sendUserSelfDeleteNotification(c, userInfo) {
		const timezone = await timezoneUtils.getTimezone(c, userInfo.activeIp);
		userInfo.timezone = timezone;
		
		const message = userSelfDeleteMsgTemplate(userInfo);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk admin delete user
	async sendAdminDeleteUserNotification(c, deletedUser, adminUser) {
		const timezone = await timezoneUtils.getTimezone(c, adminUser.activeIp);
		adminUser.timezone = timezone;
		
		const message = adminDeleteUserMsgTemplate(deletedUser, adminUser);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk failed login attempts
	async sendFailedLoginNotification(c, email, ip, attempts, device, os, browser) {
		const timezone = await timezoneUtils.getTimezone(c, ip);
		
		const message = failedLoginMsgTemplate(email, ip, attempts, device, os, browser, timezone);
		await this.sendTelegramMessage(c, message);
	},

	// Notifikasi untuk quota warning
	async sendQuotaWarningNotification(c, userInfo, quotaType) {
		const message = quotaWarningMsgTemplate(userInfo, quotaType);
		await this.sendTelegramMessage(c, message);
	}

}

export default telegramService
