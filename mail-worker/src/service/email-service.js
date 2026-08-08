import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst, userConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import fileUtils from '../utils/file-utils';
import { Resend } from 'resend';
import attService from './att-service';
import { parseHTML } from 'linkedom';
import userService from './user-service';
import roleService from './role-service';
import user from '../entity/user';
import starService from './star-service';
import dayjs from 'dayjs';
import kvConst from '../const/kv-const';
import { t } from '../i18n/i18n';
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import { sanitizeEmailHtml } from '../utils/html-utils';
import { normalizeEmailList, toId, toIdList, toInteger, toPageSize, toTrimmedString } from '../utils/input-utils';
import { normalizeEmailCursor, normalizeEmailLatestQuery, normalizeEmailListQuery } from '../utils/email-query-utils';

const emailService = {

	async list(c, params = {}, userId) {
		const uid = toId(userId, 'userId');
		const { accountId, size, timeSort, type, emailId, allReceive: requestedAllReceive } = normalizeEmailListQuery(params);

		let accountRow = null;
		if (accountId > 0) {
			accountRow = await accountService.selectById(c, accountId);
			if (!accountRow || accountRow.userId !== uid) throw new BizError(t('noUserAccount'), 404);
		}
		const allReceive = requestedAllReceive ?? Number(accountRow?.allReceive || 0);

		const baseConditions = [
			allReceive ? eq(1, 1) : eq(email.accountId, accountId),
			eq(email.userId, uid),
			eq(email.type, type),
			eq(email.isDel, isDel.NORMAL),
			eq(account.isDel, isDel.NORMAL)
		];
		const cursorCondition = timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId);
		const query = orm(c)
			.select({ ...email, starId: star.starId })
			.from(email)
			.leftJoin(star, and(eq(star.emailId, email.emailId), eq(star.userId, uid)))
			.leftJoin(account, eq(account.accountId, email.accountId))
			.where(and(cursorCondition, ...baseConditions));
		query.orderBy(timeSort ? asc(email.emailId) : desc(email.emailId));

		const [rawList, totalRow, latestEmail] = await Promise.all([
			query.limit(size).all(),
			orm(c).select({ total: count() }).from(email)
				.leftJoin(account, eq(account.accountId, email.accountId))
				.where(and(...baseConditions)).get(),
			orm(c).select({ ...email }).from(email)
				.leftJoin(account, eq(account.accountId, email.accountId))
				.where(and(...baseConditions))
				.orderBy(desc(email.emailId)).limit(1).get()
		]);
		const list = rawList.map(item => ({ ...item, isStar: item.starId != null ? 1 : 0 }));
		await this.emailAddAtt(c, list);
		return {
			list,
			total: Number(totalRow?.total || 0),
			latestEmail: latestEmail || { emailId: 0, accountId, userId: uid }
		};
	},

	async delete(c, params = {}, userId) {
		const uid = toId(userId, 'userId');
		const emailIdList = toIdList(params.emailIds, { name: 'emailIds', maxItems: 500 });
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(eq(email.userId, uid), inArray(email.emailId, emailIdList))
		).run();
	},

	receive(c, params, cidAttList, r2domain) {
		const data = { ...params };
		data.content = sanitizeEmailHtml(this.imgReplace(data.content, cidAttList, r2domain));
		data.text = String(data.text || '').slice(0, 2_000_000);
		data.subject = String(data.subject || '').slice(0, 998);
		return orm(c).insert(email).values(data).returning().get();
	},

	//邮件发送
	async send(c, params = {}, userId) {
		const uid = toId(userId, 'userId');
		const accountId = toId(params.accountId, 'accountId');
		const sendType = toTrimmedString(params.sendType, { name: 'sendType', max: 32 });
		const replyEmailId = params.emailId ? toId(params.emailId, 'emailId') : 0;
		let receiveEmail = normalizeEmailList(params.receiveEmail, { name: '收件人', required: true, maxItems: 100 });
		let cc = normalizeEmailList(params.cc, { name: '抄送', maxItems: 100 });
		let bcc = normalizeEmailList(params.bcc, { name: '密送', maxItems: 100 });
		const toSet = new Set(receiveEmail);
		cc = cc.filter(address => !toSet.has(address));
		const visibleSet = new Set([...receiveEmail, ...cc]);
		bcc = bcc.filter(address => !visibleSet.has(address));
		const allRecipients = [...receiveEmail, ...cc, ...bcc];
		if (allRecipients.length > 100) throw new BizError('收件人、抄送和密送总数不能超过100', 400);

		let name = toTrimmedString(params.name, { name: '发件人名称', max: 256 });
		const subject = toTrimmedString(params.subject, { name: '邮件主题', required: true, max: 998 });
		const text = typeof params.text === 'string' ? params.text.slice(0, 2_000_000) : '';
		const rawContent = typeof params.content === 'string' ? params.content.slice(0, 2_000_000) : '';
		const attachments = params.attachments === undefined ? [] : params.attachments;
		if (!Array.isArray(attachments)) throw new BizError('附件格式错误', 400);

		const setting = await settingService.query(c);
		const { resendTokens = {}, r2Domain, send, domainList = [] } = setting;
		if (send === settingConst.send.CLOSE) throw new BizError(t('disabledSend'), 403);

		const [userRow, accountRow] = await Promise.all([
			userService.selectById(c, uid),
			accountService.selectById(c, accountId)
		]);
		if (!userRow) throw new BizError(t('authExpired'), 401);
		if (!accountRow) throw new BizError(t('senderAccountNotExist'), 404);
		if (accountRow.userId !== uid) throw new BizError(t('sendEmailNotCurUser'), 403);
		const admin = typeof c.env.admin === 'string' && userRow.email.toLowerCase() === c.env.admin.toLowerCase();
		const roleRow = admin ? null : await roleService.selectById(c, userRow.type);
		if (!admin && !roleRow) throw new BizError(t('roleNotExist'), 403);

		const internalDomains = new Set(domainList.map(item => String(item).replace(/^@/, '').toLowerCase()));
		const allInternal = allRecipients.every(address => internalDomains.has(emailUtils.getDomain(address).toLowerCase()));
		if (!admin) {
			if (roleRow.sendType === 'ban') throw new BizError(t('bannedSend'), 403);
			if (roleRow.sendType === 'internal' && !allInternal) throw new BizError(t('onlyInternalSend'), 403);
			if (!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) throw new BizError(t('noDomainPermSend'), 403);
			if (Number(roleRow.sendCount) > 0) {
				const currentCount = Number(userRow.sendCount || 0);
				if (currentCount >= Number(roleRow.sendCount)) {
					if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
					if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
				}
				if (currentCount + allRecipients.length > Number(roleRow.sendCount)) {
					if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
					if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
				}
			}
		}

		const domain = emailUtils.getDomain(accountRow.email).toLowerCase();
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;
		if (!useCloudflareEmail && !resendToken && !allInternal) throw new BizError(t('noSendProvider'));
		if (!name) name = emailUtils.getName(accountRow.email);

		const { imageDataList: rawImages, html: convertedHtml } = await attService.toImageUrlHtml(c, sanitizeEmailHtml(rawContent), uid);
		let imageDataList = rawImages;
		let html = sanitizeEmailHtml(convertedHtml);
		attService.validateOutgoingAttachments(attachments, imageDataList);

		let replyRow = { messageId: null };
		if (sendType === 'reply') {
			replyRow = await this.selectByIdForUser(c, replyEmailId, uid);
			if (!replyRow) throw new BizError(t('notExistEmailReply'), 404);
		}

		let sendResult = {};
		if (!allInternal) {
			const providerParams = {
				name,
				accountEmail: accountRow.email,
				receiveEmail,
				cc,
				bcc,
				subject,
				text,
				html,
				attachments: [...imageDataList, ...attachments],
				sendType,
				messageId: replyRow.messageId
			};
			sendResult = useCloudflareEmail
				? await this.sendByCloudflareEmail(c, providerParams)
				: await this.sendByResend(resendToken, providerParams);
		}
		const { data, error } = sendResult;
		if (error) throw new BizError(String(error.message || '邮件发送失败').slice(0, 2000));

		imageDataList = imageDataList.map(item => ({ ...item, contentId: `<${String(item.contentId).replace(/^<|>$/g, '')}>` }));
		html = sanitizeEmailHtml(this.imgReplace(html, imageDataList, r2Domain));
		const emailData = {
			sendEmail: accountRow.email,
			name,
			subject,
			content: html,
			text,
			accountId,
			status: allInternal || useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT,
			type: emailConst.type.SEND,
			userId: uid,
			resendEmailId: data?.id || null,
			recipient: JSON.stringify(receiveEmail.map(address => ({ address, name: '' }))),
			cc: JSON.stringify(cc.map(address => ({ address, name: '' }))),
			bcc: JSON.stringify(bcc.map(address => ({ address, name: '' })))
		};
		if (sendType === 'reply') {
			emailData.inReplyTo = replyRow.messageId || '';
			emailData.relation = replyRow.messageId || '';
		}

		const emailResult = await orm(c).insert(email).values(emailData).returning().get();
		await attService.saveArticleAtt(c, imageDataList, uid, accountId, emailResult.emailId);
		await attService.saveSendAtt(c, attachments, uid, accountId, emailResult.emailId);
		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		if (allInternal) await this.HandleOnSiteEmail(c, allRecipients, emailResult, attList);
		if (!admin && Number(roleRow.sendCount) > 0 && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, allRecipients.length, uid);
		}

		const dateStr = dayjs().format('YYYY-MM-DD');
		const countKey = kvConst.SEND_DAY_COUNT + dateStr;
		const currentTotal = Number(await c.env.kv.get(countKey) || 0);
		await c.env.kv.put(countKey, String(currentTotal + allRecipients.length), { expirationTtl: 60 * 60 * 24 });
		return [emailResult];
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.cc?.length > 0) {
			sendForm.cc = [...params.cc];
		}

		if (params.bcc?.length > 0) {
			sendForm.bcc = [...params.bcc];
		}

		if (params.text) {
			sendForm.text = params.text;
		}

		if (params.html) {
			sendForm.html = params.html;
		}

		const attachments = await this.toCloudflareAttachments(params.attachments);
		if (attachments.length > 0) {
			sendForm.attachments = attachments;
		}

		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		const result = await c.env.email.send(sendForm);

		return {
			data: {
				id: result.messageId
			}
		};
	},

	async sendByResend(resendToken, params) {
		const resend = new Resend(resendToken);

		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			to: [...params.receiveEmail],
			subject: params.subject,
			text: params.text,
			html: params.html,
			attachments: await this.toResendAttachments(params.attachments)
		};

		if (params.cc?.length > 0) {
			sendForm.cc = [...params.cc];
		}

		if (params.bcc?.length > 0) {
			sendForm.bcc = [...params.bcc];
		}

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm);
	},

	async toCloudflareAttachments(attachments = []) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);
		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attService.cleanFilename(attachment.filename),
				type: String(attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream').slice(0, 255),
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};
			if (attachment.contentId) item.contentId = String(attachment.contentId).replace(/^<|>$/g, '').slice(0, 255);
			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];
		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) continue;
			const item = {
				filename: attService.cleanFilename(attachment.filename),
				content,
				contentType: String(attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream').slice(0, 255)
			};
			if (attachment.contentId) item.contentId = String(attachment.contentId).replace(/^<|>$/g, '').slice(0, 255);
			result.push(item);
		}
		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];
		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) continue;
			result.push({ ...attachment, content });
		}
		return result;
	},

	async toAttachmentBase64(attachment = {}) {
		let content = attachment.content;
		if (!content) return null;
		if (typeof content === 'string') {
			if (content.startsWith('data:')) content = content.split(',')[1] || '';
			const clean = content.replace(/\s+/g, '');
			if (!clean || clean.length > 14_000_000) throw new BizError('单个附件不能超过10MB', 400);
			try {
				const bytes = fileUtils.base64ToUint8Array(clean);
				if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new BizError('单个附件不能超过10MB', 400);
			} catch (error) {
				if (error?.name === 'BizError') throw error;
				throw new BizError('附件内容不是有效的Base64', 400);
			}
			return clean;
		}
		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) return null;
		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';
		for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment = {}) {
		let content = attachment.content;
		if (!content) return null;
		let buffer;
		if (content instanceof ArrayBuffer) {
			buffer = content;
		} else if (content instanceof Uint8Array) {
			buffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		} else if (typeof content === 'string') {
			if (content.startsWith('data:')) content = content.split(',')[1] || '';
			try { buffer = fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer; }
			catch { throw new BizError('附件内容不是有效的Base64', 400); }
		} else if (ArrayBuffer.isView(content)) {
			buffer = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		} else {
			throw new BizError('附件内容格式错误', 400);
		}
		if (!buffer.byteLength || buffer.byteLength > 10 * 1024 * 1024) throw new BizError('单个附件不能超过10MB', 400);
		return buffer;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList = []) {
		const recipients = [...new Set((receiveEmail || []).map(item => String(item).trim().toLowerCase()).filter(Boolean))];
		if (recipients.length === 0) return;
		const { noRecipient } = await settingService.query(c);
		const recipientConditions = recipients.map(recipient => sql`${account.email} COLLATE NOCASE = ${recipient}`);
		const accountList = await orm(c).select().from(account).where(and(
			or(...recipientConditions),
			eq(account.isDel, isDel.NORMAL)
		)).all();
		const userIds = [...new Set(accountList.map(row => row.userId))];
		const [roleList, activeUsers] = await Promise.all([
			roleService.selectByUserIds(c, userIds),
			userIds.length ? orm(c).select().from(user).where(and(
				inArray(user.userId, userIds),
				eq(user.isDel, isDel.NORMAL),
				eq(user.status, userConst.status.NORMAL)
			)).all() : []
		]);
		const accountMap = new Map(accountList.map(row => [String(row.email).toLowerCase(), row]));
		const userMap = new Map(activeUsers.map(row => [row.userId, row]));
		const roleMap = new Map(roleList.map(row => [row.userId, row]));
		const adminEmail = String(c.env.admin || '').toLowerCase();
		const emailDataList = [];

		for (const recipient of recipients) {
			const emailValues = {
				...sendEmailData,
				emailId: undefined,
				toEmail: recipient,
				toName: emailUtils.getName(recipient),
				type: emailConst.type.RECEIVE,
				status: emailConst.status.RECEIVE,
				bcc: '[]'
			};
			delete emailValues.emailId;
			const accountRow = accountMap.get(recipient);
			const activeUser = accountRow ? userMap.get(accountRow.userId) : null;
			if (accountRow && activeUser) {
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				if (recipient !== adminEmail) {
					const roleRow = roleMap.get(accountRow.userId);
					if (!roleRow) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `Recipient role is unavailable: <${recipient}>`;
					} else if (!roleService.hasAvailDomainPerm(roleRow.availDomain, recipient)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${recipient}> is not authorized to use this domain.`;
					} else if (roleService.isBanEmail(roleRow.banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${recipient}> is disabled from receiving emails.`;
					}
				}
			} else {
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.status = noRecipient === settingConst.noRecipient.CLOSE
					? emailConst.status.BOUNCED
					: emailConst.status.NOONE;
				if (emailValues.status === emailConst.status.BOUNCED) emailValues.message = `Recipient not found: <${recipient}>`;
			}
			emailDataList.push(emailValues);
		}

		const deliverable = emailDataList.filter(row => row.status === emailConst.status.RECEIVE || row.status === emailConst.status.NOONE);
		for (const emailData of deliverable) {
			const emailRow = await orm(c).insert(email).values(emailData).returning().get();
			for (const source of attList) {
				const { attId, ...copy } = source;
				await orm(c).insert(att).values({ ...copy, emailId: emailRow.emailId, accountId: emailRow.accountId, userId: emailRow.userId }).run();
			}
		}

		const bounced = emailDataList.find(row => row.status === emailConst.status.BOUNCED);
		const status = bounced ? emailConst.status.BOUNCED : emailConst.status.DELIVERED;
		const message = bounced ? JSON.stringify({ message: bounced.message }) : '';
		await orm(c).update(email).set({ status, message }).where(eq(email.emailId, sendEmailData.emailId)).run();
	},

	imgReplace(content, cidAttList = [], r2domain) {
		if (!content) return '';
		const { document } = parseHTML(sanitizeEmailHtml(content));
		const objectDomain = domainUtils.toOssDomain(r2domain || '');
		const images = Array.from(document.querySelectorAll('img'));
		const useAtts = [];
		for (const img of images) {
			const src = img.getAttribute('src') || '';
			if (src.startsWith('cid:')) {
				const cid = src.slice(4).replace(/^<|>$/g, '');
				const cidAtt = cidAttList.find(item => String(item.contentId || '').replace(/^<|>$/g, '') === cid);
				if (cidAtt && String(cidAtt.key || '').startsWith('attachments/')) {
					img.setAttribute('src', `{{domain}}${cidAtt.key}`);
					useAtts.push(cidAtt);
				} else {
					img.removeAttribute('src');
				}
			} else if (objectDomain && src.startsWith(`${objectDomain}/attachments/`)) {
				img.setAttribute('src', src.replace(`${objectDomain}/`, '{{domain}}'));
			}
		}
		for (const attachment of useAtts) attachment.type = attConst.type.EMBED;
		return sanitizeEmailHtml(document.toString());
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	selectByIdForUser(c, emailId, userId) {
		return orm(c).select().from(email).where(and(
			eq(email.emailId, emailId),
			eq(email.userId, userId),
			eq(email.isDel, isDel.NORMAL)
		)).get();
	},

	async latest(c, params = {}, userId) {
		const uid = toId(userId, 'userId');
		const { accountId, emailId, allReceive: requestedAllReceive } = normalizeEmailLatestQuery(params);
		let accountRow = null;
		if (accountId > 0) {
			accountRow = await accountService.selectById(c, accountId);
			if (!accountRow || accountRow.userId !== uid) throw new BizError(t('noUserAccount'), 404);
		}
		const allReceive = requestedAllReceive ?? Number(accountRow?.allReceive || 0);
		const list = await orm(c).select({ ...email }).from(email)
			.leftJoin(account, eq(account.accountId, email.accountId))
			.where(and(
				gt(email.emailId, emailId),
				eq(email.userId, uid),
				eq(email.isDel, isDel.NORMAL),
				eq(account.isDel, isDel.NORMAL),
				allReceive ? eq(1, 1) : eq(email.accountId, accountId),
				eq(email.type, emailConst.type.RECEIVE)
			))
			.orderBy(desc(email.emailId))
			.limit(20);
		await this.emailAddAtt(c, list);
		return list;
	},

	async physicsDelete(c, params = {}) {
		const emailIds = toIdList(params.emailIds, { name: 'emailIds', maxItems: 500 });
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		if (!Array.isArray(userIds) || userIds.length === 0) return;
		await attService.removeByUserIds(c, userIds);
		await starService.removeByEmailIds(c, (await orm(c).select({ emailId: email.emailId }).from(email).where(inArray(email.userId, userIds)).all()).map(row => row.emailId));
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	async updateEmailStatus(c, params = {}) {
		const resendEmailId = toTrimmedString(params.resendEmailId, { name: 'resendEmailId', required: true, max: 256 });
		const status = toInteger(params.status, { name: 'status', required: true, min: 0, max: emailConst.status.FAILED });
		const message = typeof params.message === 'string' ? params.message.slice(0, 10_000) : '';
		const current = await orm(c).select({ emailId: email.emailId, status: email.status })
			.from(email).where(eq(email.resendEmailId, resendEmailId)).get();
		if (!current) return null;
		const rank = new Map([
			[emailConst.status.SAVING, 0], [emailConst.status.SENT, 1], [emailConst.status.DELAYED, 2],
			[emailConst.status.DELIVERED, 3], [emailConst.status.BOUNCED, 4],
			[emailConst.status.COMPLAINED, 4], [emailConst.status.FAILED, 4]
		]);
		if ((rank.get(current.status) ?? 0) > (rank.get(status) ?? 0)) return current;
		return orm(c).update(email).set({ status, message })
			.where(eq(email.emailId, current.emailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
		if (!Array.isArray(userIds) || userIds.length === 0) return [];
		const result = await orm(c)
			.select({
				userId: email.userId,
				count: count(email.emailId)
			})
			.from(email)
			.where(and(
				inArray(email.userId, userIds),
				eq(email.type, type),
				eq(email.isDel, del),
				ne(email.status, emailConst.status.SAVING),
			))
			.groupBy(email.userId);
		return result;
	},

	async allList(c, params = {}) {
		const timeSort = toInteger(params.timeSort, { defaultValue: 0, min: 0, max: 1 });
		const size = toPageSize(params.size, { defaultValue: 20, max: 50 });
		// Web 的 /all-mail 第一页历史上固定发送 emailId=0。降序查询时
		// 这个 0 是“从最新一封开始”的哨兵，不是实际数据库游标。
		const emailId = normalizeEmailCursor(params.emailId, { timeSort });
		const type = toTrimmedString(params.type, { name: 'type', max: 16 });
		if (type && !['all', 'send', 'receive', 'delete', 'noone'].includes(type)) throw new BizError('type取值无效', 400);
		const name = toTrimmedString(params.name, { name: 'name', max: 200 });
		const subject = toTrimmedString(params.subject, { name: 'subject', max: 200 });
		const accountEmail = toTrimmedString(params.accountEmail, { name: 'accountEmail', max: 254 });
		const userEmail = toTrimmedString(params.userEmail, { name: 'userEmail', max: 254 });
		const conditions = [];
		if (type === 'send') conditions.push(eq(email.type, emailConst.type.SEND));
		if (type === 'receive') conditions.push(eq(email.type, emailConst.type.RECEIVE));
		if (type === 'delete') conditions.push(eq(email.isDel, isDel.DELETE));
		if (type === 'noone') conditions.push(eq(email.status, emailConst.status.NOONE));
		if (userEmail) conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${`%${userEmail}%`}`);
		if (accountEmail) conditions.push(or(
			sql`${email.toEmail} COLLATE NOCASE LIKE ${`%${accountEmail}%`}`,
			sql`${email.sendEmail} COLLATE NOCASE LIKE ${`%${accountEmail}%`}`
		));
		if (name) conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${`%${name}%`}`);
		if (subject) conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${`%${subject}%`}`);
		conditions.push(ne(email.status, emailConst.status.SAVING));
		const countConditions = [...conditions];
		conditions.unshift(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		const query = orm(c).select({ ...email, userEmail: user.email })
			.from(email).leftJoin(user, eq(email.userId, user.userId)).where(and(...conditions));
		query.orderBy(timeSort ? asc(email.emailId) : desc(email.emailId));
		const [list, totalRow, latestEmail] = await Promise.all([
			query.limit(size).all(),
			orm(c).select({ total: count() }).from(email).leftJoin(user, eq(email.userId, user.userId)).where(and(...countConditions)).get(),
			orm(c).select().from(email).where(and(eq(email.type, emailConst.type.RECEIVE), ne(email.status, emailConst.status.SAVING)))
				.orderBy(desc(email.emailId)).limit(1).get()
		]);
		await this.emailAddAtt(c, list);
		return {
			list,
			total: Number(totalRow?.total || 0),
			latestEmail: latestEmail || { emailId: 0, accountId: 0, userId: 0 }
		};
	},

	async allEmailLatest(c, params = {}) {
		const emailId = toInteger(params.emailId, { name: 'emailId', defaultValue: 0, min: 0, max: Number.MAX_SAFE_INTEGER });
		const list = await orm(c).select({ ...email, userEmail: user.email }).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(gt(email.emailId, emailId), eq(email.type, emailConst.type.RECEIVE), ne(email.status, emailConst.status.SAVING)))
			.orderBy(desc(email.emailId)).limit(20);
		await this.emailAddAtt(c, list);
		return list;
	},

	async emailAddAtt(c, list) {

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attList.filter(attRow => attRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
		}
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.userId, userId)).run();
	},

	async completeReceive(c, status, emailId) {
		return await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();
	},

	async completeReceiveAll(c) {
		await c.env.db.prepare(`
			UPDATE email AS e SET status = ${emailConst.status.RECEIVE}
			WHERE status = ${emailConst.status.SAVING}
			AND EXISTS (
				SELECT 1 FROM account a JOIN user u ON u.user_id = a.user_id
				WHERE a.account_id = e.account_id AND a.is_del = ${isDel.NORMAL}
				AND u.is_del = ${isDel.NORMAL} AND u.status = ${userConst.status.NORMAL}
			)
		`).run();
		await c.env.db.prepare(`
			UPDATE email AS e SET status = ${emailConst.status.NOONE}
			WHERE status = ${emailConst.status.SAVING}
			AND NOT EXISTS (
				SELECT 1 FROM account a JOIN user u ON u.user_id = a.user_id
				WHERE a.account_id = e.account_id AND a.is_del = ${isDel.NORMAL}
				AND u.is_del = ${isDel.NORMAL} AND u.status = ${userConst.status.NORMAL}
			)
		`).run();
	},

	async batchDelete(c, params = {}) {
		const type = toTrimmedString(params.type, { name: 'type', max: 16 });
		if (type && !['left', 'right', 'include', 'exact'].includes(type)) throw new BizError('匹配类型无效', 400);
		const right = type === 'left' || type === 'include';
		const left = type === 'right' || type === 'include';
		const conditions = [];
		for (const [field, column] of [['sendName', email.name], ['subject', email.subject], ['sendEmail', email.sendEmail], ['toEmail', email.toEmail]]) {
			const value = toTrimmedString(params[field], { name: field, max: 254 });
			if (value) conditions.push(like(column, `${left ? '%' : ''}${value}${right ? '%' : ''}`));
		}
		const startTime = toTrimmedString(params.startTime, { name: 'startTime', max: 32 });
		const endTime = toTrimmedString(params.endTime, { name: 'endTime', max: 32 });
		if (startTime || endTime) {
			if (!startTime || !endTime || !dayjs(startTime).isValid() || !dayjs(endTime).isValid()) throw new BizError('时间范围无效', 400);
			if (dayjs(startTime).isAfter(dayjs(endTime))) throw new BizError('开始时间不能晚于结束时间', 400);
			conditions.push(gte(email.createTime, startTime), lte(email.createTime, endTime));
		}
		if (conditions.length === 0) throw new BizError('至少提供一个删除条件', 400);
		const where = conditions.length > 1 ? and(...conditions) : conditions[0];
		const emailIds = (await orm(c).select({ emailId: email.emailId }).from(email).where(where).all()).map(row => row.emailId);
		if (emailIds.length === 0) return;
		for (let index = 0; index < emailIds.length; index += 500) {
			const batch = emailIds.slice(index, index + 500);
			await attService.removeByEmailIds(c, batch);
			await starService.removeByEmailIds(c, batch);
			await orm(c).delete(email).where(inArray(email.emailId, batch)).run();
		}
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params = {}, userId) {
		const uid = toId(userId, 'userId');
		const emailIds = toIdList(params.emailIds, { name: 'emailIds', maxItems: 500 });
		await orm(c).update(email).set({ unread: emailConst.unread.READ })
			.where(and(eq(email.userId, uid), inArray(email.emailId, emailIds))).run();
	},

	// 原来的接口都是列表查询，没有"按 id 查单封邮件"的能力。iOS App 点了推送通知
	// 跳转到具体那封邮件时需要这个（对应 CLOUD_MAIL_PUSH_PATCH.md 的第五步）。
	// star 表照 list() 的写法一起 join 一下，保证返回的字段跟 /email/list 完全一致，
	// 不然从推送点进来的这一封邮件会在 App 里显示成"没加星标"，跟列表页不一致。
	async detail(c, params = {}, userId) {
		const emailId = toId(params.emailId, 'emailId');
		const uid = toId(userId, 'userId');

		const emailRow = await orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, uid)
				)
			)
			.where(and(eq(email.emailId, emailId), eq(email.userId, uid), eq(email.isDel, isDel.NORMAL)))
			.get();

		if (!emailRow) {
			throw new BizError(t('notExist'), 404);
		}

		await this.emailAddAtt(c, [emailRow]);
		return emailRow;
	}
};

export default emailService;
