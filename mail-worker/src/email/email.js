import PostalMime from 'postal-mime';
import emailService from '../service/email-service';
import accountService from '../service/account-service';
import settingService from '../service/setting-service';
import attService from '../service/att-service';
import constant from '../const/constant';
import fileUtils from '../utils/file-utils';
import { emailConst, isDel, settingConst, userConst } from '../const/entity-const';
import emailUtils from '../utils/email-utils';
import roleService from '../service/role-service';
import userService from '../service/user-service';
import telegramService from '../service/telegram-service';
import aiService from '../service/ai-service';
import deviceTokenService from '../service/device-token-service';
import apnsService from '../service/apns-service';
import verifyUtils from '../utils/verify-utils';

const MAX_RAW_BYTES = 35 * 1024 * 1024;
const MAX_ADDRESS_ITEMS = 100;

function normalizeAddress(value) {
	const address = String(value || '').trim().toLowerCase();
	return verifyUtils.isEmail(address) ? address : '';
}

function normalizeAddressObjects(list) {
	if (!Array.isArray(list)) return [];
	const result = [];
	const seen = new Set();
	for (const item of list.slice(0, MAX_ADDRESS_ITEMS)) {
		const address = normalizeAddress(item?.address);
		if (!address || seen.has(address)) continue;
		seen.add(address);
		result.push({ address, name: String(item?.name || '').trim().slice(0, 256) });
	}
	return result;
}

async function readRawMessage(raw) {
	const reader = raw.getReader();
	const chunks = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
		total += bytes.byteLength;
		if (total > MAX_RAW_BYTES) throw new Error('MESSAGE_TOO_LARGE');
		chunks.push(bytes);
	}
	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return merged.buffer;
}

export async function email(message, env, ctx) {
	const context = { env };
	try {
		const setting = await settingService.query(context);
		const {
			receive, tgChatId, tgBotStatus, forwardStatus, forwardEmail,
			ruleEmail, ruleType, r2Domain, noRecipient,
			blackSubject, blackContent, blackFrom, aiCode, aiCodeFilter
		} = setting;
		if (receive === settingConst.receive.CLOSE) {
			message.setReject('Service suspended');
			return;
		}

		const recipient = normalizeAddress(message.to);
		if (!recipient) {
			message.setReject('Invalid recipient');
			return;
		}

		let raw;
		try {
			raw = await readRawMessage(message.raw);
		} catch (error) {
			if (error?.message === 'MESSAGE_TOO_LARGE') {
				message.setReject('Message too large');
				return;
			}
			throw error;
		}
		const parsed = await PostalMime.parse(raw);
		const sender = normalizeAddress(parsed.from?.address || message.from);
		if (!sender) {
			message.setReject('Invalid sender');
			return;
		}
		parsed.from = { address: sender, name: String(parsed.from?.name || '').trim().slice(0, 256) };
		parsed.subject = String(parsed.subject || '').slice(0, 998);
		parsed.text = String(parsed.text || '').slice(0, 2_000_000);
		parsed.html = String(parsed.html || '').slice(0, 2_000_000);

		if (checkBlock(blackSubject, blackContent, blackFrom, parsed)) {
			message.setReject('Message rejected');
			return;
		}

		const accountRow = await accountService.selectByEmailIncludeDel(context, recipient);
		let userRow = null;
		if (accountRow) {
			if (accountRow.isDel !== isDel.NORMAL) {
				message.setReject('Recipient unavailable');
				return;
			}
			userRow = await userService.selectByIdIncludeDel(context, accountRow.userId);
			if (!userRow || userRow.isDel !== isDel.NORMAL || userRow.status !== userConst.status.NORMAL) {
				message.setReject('Recipient unavailable');
				return;
			}
		}
		if (!accountRow && noRecipient === settingConst.noRecipient.CLOSE) {
			message.setReject('Recipient not found');
			return;
		}

		const isAdmin = userRow && String(userRow.email || '').toLowerCase() === String(env.admin || '').toLowerCase();
		if (accountRow && !isAdmin) {
			const roleRow = await roleService.selectByUserId(context, accountRow.userId);
			if (!roleRow) {
				message.setReject('Recipient role unavailable');
				return;
			}
			if (!roleService.hasAvailDomainPerm(roleRow.availDomain, recipient)) {
				message.setReject('The recipient is not authorized to use this domain.');
				return;
			}
			if (roleService.isBanEmail(roleRow.banEmail, sender)) {
				message.setReject('The recipient is disabled from receiving emails.');
				return;
			}
		}

		let to = normalizeAddressObjects(parsed.to);
		if (!to.some(item => item.address === recipient)) to.push({ address: recipient, name: emailUtils.getName(recipient) });
		to = to.slice(0, MAX_ADDRESS_ITEMS);
		const cc = normalizeAddressObjects(parsed.cc);
		const bcc = normalizeAddressObjects(parsed.bcc);
		const toName = to.find(item => item.address === recipient)?.name || '';
		const code = await aiService.extractCode(context, parsed, { aiCode, aiCodeFilter });

		const attachments = [];
		const cidAttachments = [];
		for (const item of Array.isArray(parsed.attachments) ? parsed.attachments : []) {
			const content = item.content instanceof Uint8Array ? item.content : new Uint8Array(item.content || []);
			const filename = attService.cleanFilename(item.filename);
			const attachment = {
				...item,
				filename,
				mimeType: String(item.mimeType || 'application/octet-stream').slice(0, 255),
				content,
				key: constant.ATTACHMENT_PREFIX + await fileUtils.getBuffHash(content) + fileUtils.getExtFileName(filename),
				size: content.byteLength
			};
			attachments.push(attachment);
			if (attachment.contentId) cidAttachments.push(attachment);
		}
		try {
			attService.validateIncomingAttachments(attachments);
		} catch (error) {
			message.setReject(error.message || 'Attachments rejected');
			return;
		}

		const params = {
			toEmail: recipient,
			toName,
			sendEmail: sender,
			name: parsed.from.name || emailUtils.getName(sender),
			subject: parsed.subject,
			code,
			content: parsed.html,
			text: parsed.text,
			cc: JSON.stringify(cc),
			bcc: JSON.stringify(bcc),
			recipient: JSON.stringify(to),
			inReplyTo: String(parsed.inReplyTo || '').slice(0, 998),
			relation: String(parsed.references || '').slice(0, 4000),
			messageId: String(parsed.messageId || '').slice(0, 998),
			userId: accountRow ? accountRow.userId : 0,
			accountId: accountRow ? accountRow.accountId : 0,
			isDel: isDel.DELETE,
			status: emailConst.status.SAVING
		};

		let emailRow = await emailService.receive(context, params, cidAttachments, r2Domain);
		for (const attachment of attachments) {
			attachment.emailId = emailRow.emailId;
			attachment.userId = emailRow.userId;
			attachment.accountId = emailRow.accountId;
		}
		try {
			await attService.addAtt(context, attachments);
		} catch (error) {
			try { await emailService.physicsDelete(context, { emailIds: String(emailRow.emailId) }); } catch (cleanupError) { console.error('接收邮件回滚失败', cleanupError); }
			message.setReject('Attachment storage failed');
			return;
		}
		emailRow = await emailService.completeReceive(context, accountRow ? emailConst.status.RECEIVE : emailConst.status.NOONE, emailRow.emailId);

		const ruleRecipients = String(ruleEmail || '').split(',').map(normalizeAddress).filter(Boolean);
		const shouldForward = ruleType !== settingConst.ruleType.RULE || ruleRecipients.includes(recipient);
		const backgroundTasks = [];
		if (shouldForward && tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
			backgroundTasks.push(telegramService.sendEmailToBot(context, emailRow));
		}
		if (shouldForward && forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail) {
			const targets = [...new Set(String(forwardEmail).split(',').map(normalizeAddress).filter(Boolean))].slice(0, 20);
			for (const target of targets) {
				try { await message.forward(target); }
				catch (error) { console.error(`转发邮箱 ${target} 失败`, error); }
			}
		}
		if (emailRow.userId) {
			backgroundTasks.push((async () => {
				const tokens = await deviceTokenService.listByUserId(context, emailRow.userId);
				if (tokens.length) await apnsService.pushNewMail(context, tokens.map(item => item.deviceToken), emailRow);
			})());
		}
		if (backgroundTasks.length) ctx.waitUntil(Promise.allSettled(backgroundTasks));
	} catch (error) {
		console.error('邮件接收异常', error);
		throw error;
	}
}

function splitBlacklist(value) {
	return String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

function checkBlock(blackSubjectStr, blackContentStr, blackFromStr, email) {
	const subject = String(email.subject || '').toLowerCase();
	const html = String(email.html || '').toLowerCase();
	const text = String(email.text || '').toLowerCase();
	const from = String(email.from?.address || '').toLowerCase();
	const fromDomain = emailUtils.getDomain(from).toLowerCase();
	if (splitBlacklist(blackSubjectStr).some(item => subject.includes(item))) return true;
	if (splitBlacklist(blackContentStr).some(item => html.includes(item) || text.includes(item))) return true;
	return splitBlacklist(blackFromStr).some(item => item === from || item === fromDomain);
}
