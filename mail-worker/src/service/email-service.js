import orm from '../entity/orm';
import email from '../entity/email';
import { emailListColumns, emailBriefColumns, EMAIL_LIST_TEXT_LEN } from '../lib/email-list-columns';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, notInArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
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
import { t } from '../i18n/i18n'
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";
import { att } from '../entity/att';
import telegramService from './telegram-service';
import pgpService from './pgp-service';
import webhookService from './webhook-service';
import forwardMime from '../utils/forward-mime';

const emailService = {

	async list(c, params, userId) {

		let {
			emailId,
			type,
			accountId,
			size,
			timeSort,
			allReceive,
			full,
			text,
			searchType,
			startDate,
			endDate,
		} = params;

		size = Number(size);
		// type='delete' 是字符串，不要转 Number
		if (type !== 'delete') {
			type = Number(type);
		}
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);
		full = Number(full);

		if (type !== 'delete' && isNaN(type)) {
			type = 0;
		}

		if (isNaN(accountId)) {
			throw new BizError(t('emptyAccountId'));
		}

		if (isNaN(size)) {
			size = 10;
		}

		if (isNaN(full)) {
			full = 1;
		}

		full = full === 1;

		if (size > 50) {
			size = 50;
		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const filters = this.emailListFilters({
			userId,
			accountId,
			type,
			allReceive,
			emailId,
			timeSort,
			text,
			searchType,
			startDate,
			endDate,
		});
		const countFilters = this.emailListFilters({
			userId,
			accountId,
			type,
			allReceive,
			withCursor: false,
			text,
			searchType,
			startDate,
			endDate,
		});
		const columns = full ? emailListColumns : emailBriefColumns;

		const query = orm(c)
			.select({
				...columns,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(and(...filters));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(and(...countFilters))
			.get();

		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
		}).from(email).where(
			and(
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL),
				allReceive ? undefined : eq(email.accountId, accountId)
			))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	toListText(item) {
		const raw = emailUtils.formatText(item.text) || emailUtils.htmlToText(item.content);
		return raw.replace(/\s+/g, ' ').trim().slice(0, EMAIL_LIST_TEXT_LEN);
	},

	applyListText(list) {
		for (const item of list) {
			item.listText = this.toListText(item);
			delete item.text;
			delete item.content;
		}
		return list;
	},

	emailListFilters({
		userId,
		accountId,
		type,
		allReceive,
		emailId,
		timeSort,
		withCursor = true,
		text,
		searchType,
		startDate,
		endDate,
	}) {
		const isDelete = type === 'delete';
		const conditions = [
			eq(email.userId, userId),
			eq(email.isDel, isDelete ? isDel.DELETE : isDel.NORMAL),
			eq(account.isDel, isDel.NORMAL),
		];
		if (!isDelete) {
			conditions.push(eq(email.type, type));
		}
		if (!allReceive) {
			conditions.push(eq(email.accountId, accountId));
		}
		if (withCursor && emailId) {
			conditions.push(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		}

		if (text?.trim() && searchType) {
			const searchText = `%${text.trim()}%`;

			if (searchType === 'subject') {
				conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'content') {
				conditions.push(
					or(
						sql`${email.text} COLLATE NOCASE LIKE ${searchText}`,
						sql`${email.content} COLLATE NOCASE LIKE ${searchText}`,
					)
				);
			}

			if (searchType === 'sender') {
				conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'senderAddress') {
				conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${searchText}`);
			}

			if (searchType === 'recipientAddress') {
				conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${searchText}`);
			}
		}

		if (startDate) {
			conditions.push(gte(email.createTime, startDate));
		}

		if (endDate) {
			conditions.push(lte(email.createTime, endDate));
		}

		return conditions;
	},

	allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor = true }) {
		const conditions = [];

		if (type === 'send') {
			conditions.push(eq(email.type, emailConst.type.SEND));
		}

		if (type === 'receive') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE));
		}

		if (type === 'delete') {
			conditions.push(eq(email.isDel, isDel.DELETE));
		}

		if (type === 'noone') {
			conditions.push(eq(email.status, emailConst.status.NOONE));
		}

		if (userEmail) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${userEmail + '%'}`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${accountEmail + '%'}`,
				)
			);
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${name + '%'}`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject + '%'}`);
		}

		if (withCursor && emailId) {
			conditions.push(timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId));
		}

		return conditions;
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);

		// 删除一律先进回收站（isDel=DELETE），彻底删除走 /email/permanent
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	async restore(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = Array.isArray(emailIds) ? emailIds.map(Number) : String(emailIds).split(',').map(Number);
		await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	async permanentDelete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		const owned = await orm(c).select({ emailId: email.emailId }).from(email)
			.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList)))
			.all();
		const ownedIds = owned.map(row => row.emailId);
		if (ownedIds.length) {
			await this.physicsDelete(c, { emailIds: ownedIds.join(',') });
		}
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	// 发送入口：公共校验、参数准备、渠道选择和结果汇总。
	async send(c, params, userId) {
		let {
			accountId, //发送账号id
			name, //发件人名字
			sendType, //发件类型
			emailId, //邮件id，如果是回复邮件会带
			receiveEmail, //收件人邮箱
			ccEmail = [], //抄送邮箱
			bccEmail = [], //密送邮箱
			text, //邮件纯文本
			content, //邮件内容
			subject, //邮件标题
			pgpEncrypt, //是否 PGP 加密
			attachments = [] //附件
		} = params;

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		//判断是否关闭发件功能
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		//判断接收方是不是全部为站内邮箱
		const allRecipients = [...receiveEmail, ...ccEmail, ...bccEmail];
		const allInternal = allRecipients.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//发件被禁用
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//发件被禁用
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//如果不是管理员，权限设置了发送次数
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + allRecipients.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {
			//用户没有这个域名的使用权限
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		//如果接收方存在站外邮箱，又没有发信服务
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//没有发件人名字自动截取
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//如果是回复邮件
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		const sendParams = {
			name,
			accountEmail: accountRow.email,
			receiveEmail,
			subject,
			text,
			html,
			attachments: [...imageDataList, ...attachments],
			sendType,
			messageId: emailRow.messageId
		};

		// PGP 加密（站内站外都生效；站内收件人看到的也是密文，需用私钥解密）
		if (pgpEncrypt) {
			const plainText = text || pgpService.htmlToText(html);
			const pgpResult = await pgpService.encryptOutgoing(c, allRecipients, plainText, sendParams.attachments);
			sendParams.text = pgpResult.text;
			sendParams.html = undefined;
			sendParams.attachments = pgpResult.attachments;
		}
		sendParams.ccEmail = ccEmail;
		sendParams.bccEmail = bccEmail;

		if (imageDataList.length > 10) {
			throw new BizError(t('imageAttLimit'));
		}
		if (attachments.length > 10) {
			throw new BizError(t('attLimit'));
		}

		// 保存记录：PGP 加密时存密文，否则存原文。
		// 注意：PGP 时 saveHtml 为 undefined，saveSentEmail 里的 imgReplace 会返回 ''，
		// 与 fork 原行为（content 为空、text 存密文）一致。
		const saveText = (pgpEncrypt && sendParams.text !== text) ? sendParams.text : text;
		const saveHtml = (pgpEncrypt && sendParams.html !== html) ? sendParams.html : html;

		const separate = params.manyType === 'divide';
		// sendParams 用于渠道请求，saveParams 保留保存记录所需的账号、权限和附件数据。
		const context = {
			separate, allInternal, useCloudflareEmail, resendToken, sendParams,
			saveParams: {
				accountId, userId, name, subject, text: saveText, html: saveHtml,
				sendEmail: accountRow.email,
				messageId: emailRow.messageId,
				sendType, useCloudflareEmail, roleRow, r2Domain,
				imageDataList, attachments, ccEmail, bccEmail, separate
			}
		};

		// 全部站内收件人走本地投递；存在站外收件人时优先 CF，其次 Resend。
		let deliveries;
		if (allInternal) {
			deliveries = this.sendInternal(c, context);
		} else if (useCloudflareEmail) {
			deliveries = this.sendCloudflare(c, context);
		} else {
			deliveries = this.sendResend(c, context);
		}

		const emailResults = [];
		let sendError = '';

		// 渠道每完成一组发送并保存记录后返回结果，后续发送失败仍保留已完成部分。
		for await (const delivery of deliveries) {
			if (delivery.error) {
				sendError = delivery.error.message;
				break;
			}

			emailResults.push(...delivery.emails);
		}

		if (!separate) {
			if (sendError) throw new BizError(sendError);
			return emailResults;
		}

		// 分开发送只返回尚未完成的收件人，供前端保留并重试。
		const sentRecipients = emailResults.flatMap(item =>
			JSON.parse(item.recipient).map(recipient => recipient.address)
		);
		return {
			emails: emailResults,
			failedRecipients: sendParams.receiveEmail.filter(address => !sentRecipients.includes(address)),
			error: sendError
		};
	},

	// 站内发送：普通发送共用一条发件记录，分开发送则每人一条，再写入站内收件箱。
	async *sendInternal(c, { separate, sendParams, saveParams }) {
		const recipientGroups = separate
			? sendParams.receiveEmail.map(address => [address])
			: [sendParams.receiveEmail];
		for (const receiveEmail of recipientGroups) {
			const emailResult = await this.saveSentEmail(c, { ...saveParams, receiveEmail });
			const emailRowList = await this.HandleOnSiteEmail(c, receiveEmail, emailResult, emailResult.attList);
			await this.forwardOnSiteEmail(c, emailRowList, { sendParams: { ...sendParams, receiveEmail } });
			yield { emails: [emailResult] };
		}
	},

	// CF 发送：普通发送一次提交所有收件人，分开发送逐人调用并保存结果。
	async *sendCloudflare(c, { separate, sendParams, saveParams }) {
		const recipientGroups = separate
			? sendParams.receiveEmail.map(address => [address])
			: [sendParams.receiveEmail];
		for (const receiveEmail of recipientGroups) {
			let result;
			try {
				result = await this.sendByCloudflareEmail(c, { ...sendParams, receiveEmail });
			} catch (error) {
				if (!separate) throw error;
				// 分开发送遇到渠道错误即停止，已成功的记录由入口汇总。
				yield { error: { message: error.message } };
				return;
			}
			const emailResult = await this.saveSentEmail(c, {
				...saveParams, receiveEmail, providerId: result.data.id
			});
			yield { emails: [emailResult] };
		}
	},

	// Resend 分开发送一次最多提交 100 封独立邮件，普通发送仍调用单封接口。
	async *sendResend(c, { separate, resendToken, sendParams, saveParams }) {
		if (separate && sendParams.receiveEmail.length > 100) {
			throw new BizError(t('resendRecipientLimit'));
		}
		// 批量接口不支持附件，包含正文转换得到的内嵌附件。
		if (separate && sendParams.attachments.length > 0) {
			throw new BizError(t('resendSeparateAttachments'));
		}
		let result;
		try {
			result = separate
				? await this.sendBatchByResend(resendToken, sendParams)
				: await this.sendByResend(resendToken, sendParams);
		} catch (error) {
			if (!separate) throw error;
			yield { error: { message: error.message } };
			return;
		}
		if (result.error) {
			yield { error: result.error };
			return;
		}
		// 严格校验模式下，批量返回的邮件 ID 按提交顺序对应各收件人。
		const items = separate
			? sendParams.receiveEmail.map((address, index) => ({
				receiveEmail: [address], id: result.data.data[index].id
			}))
			: [{ receiveEmail: sendParams.receiveEmail, id: result.data?.id }];
		const emails = [];
		for (const item of items) {
			emails.push(await this.saveSentEmail(c, {
				...saveParams, receiveEmail: item.receiveEmail, providerId: item.id
			}));
		}
		yield { emails };
	},

	// 三个渠道共用的发件记录保存：恢复正文图片 URL、保存附件并更新发送计数。
	async saveSentEmail(c, params) {
		const {
			accountId, userId, name, subject, text, html, sendEmail, receiveEmail,
			providerId, messageId, sendType, useCloudflareEmail,
			roleRow, r2Domain, attachments, ccEmail = [], bccEmail = [], separate = false
		} = params;
		const imageDataList = params.imageDataList.map(item => ({
			...item, contentId: `<${item.contentId.replace(/^<|>$/g, '')}>`
		}));
		const emailData = {
			sendEmail, name, subject, text, accountId, userId,
			content: this.imgReplace(html, imageDataList, r2Domain),
			status: useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT,
			type: emailConst.type.SEND,
			resendEmailId: providerId,
			recipient: JSON.stringify(receiveEmail.map(address => ({ address, name: '' }))),
			cc: JSON.stringify(ccEmail),
			bcc: JSON.stringify(bccEmail)
		};
		if (sendType === 'reply') {
			emailData.inReplyTo = messageId;
			emailData.relation = messageId;
		}
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			// 分开发送每组单独计数（仅收件人）；合并发送按全部收件人（含抄送/密送）计数
			const increment = separate
				? receiveEmail.length
				: receiveEmail.length + ccEmail.length + bccEmail.length;
			await userService.incrUserSendCount(c, increment, userId);
		}

		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		if (imageDataList.length > 0) {
			await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailResult.emailId);
		}

		if (attachments?.length > 0) {
			await attService.saveSendAtt(c, attachments, userId, accountId, emailResult.emailId);
		}

		const attList = await attService.selectByEmailIds(c, [emailResult.emailId]);
		emailResult.attList = attList;

		const dateStr = dayjs().format('YYYY-MM-DD');
		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		//记录每天发件次数统计
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return emailResult;
	},

	// 附件已在 Resend 处理器中校验，批量接口为每位收件人构造独立邮件。
	async sendBatchByResend(resendToken, params) {
		const resend = new Resend(resendToken);
		const sendForm = {
			from: `${params.name} <${params.accountEmail}>`,
			subject: params.subject,
			text: params.text,
			html: params.html
		};
		if (params.sendType === 'reply' && params.messageId) {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}
		return resend.batch.send(params.receiveEmail.map(address => ({
			...sendForm, to: [address]
		})), { batchValidation: 'strict' });
	},

	async sendByCloudflareEmail(c, params) {
		const sendForm = {
			from: { email: params.accountEmail, name: params.name },
			to: [...params.receiveEmail],
			subject: params.subject
		};

		if (params.ccEmail?.length > 0) {
			sendForm.cc = [...params.ccEmail];
		}

		if (params.bccEmail?.length > 0) {
			sendForm.bcc = [...params.bccEmail];
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

		if (params.ccEmail?.length > 0) {
			sendForm.cc = [...params.ccEmail];
		}

		if (params.bccEmail?.length > 0) {
			sendForm.bcc = [...params.bccEmail];
		}

		if (params.sendType === 'reply') {
			sendForm.headers = {
				'in-reply-to': params.messageId,
				'references': params.messageId
			};
		}

		return await resend.emails.send(sendForm);
	},

	async toCloudflareAttachments(attachments) {
		const arrayBufferAttachments = await this.toArrayBufferAttachments(attachments);

		return arrayBufferAttachments.map(attachment => {
			const item = {
				content: attachment.content,
				filename: attachment.filename,
				type: attachment.mimeType || attachment.contentType || attachment.type || 'application/octet-stream',
				disposition: attachment.contentId ? 'inline' : 'attachment'
			};

			if (attachment.contentId) {
				item.contentId = attachment.contentId.replace(/^<|>$/g, '');
			}

			return item;
		});
	},

	async toResendAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentBase64(attachment);
			if (!content) {
				continue;
			}

			result.push({
				...attachment,
				content,
				contentType: attachment.contentType || attachment.mimeType || attachment.type || 'application/octet-stream'
			});
		}

		return result;
	},

	async toArrayBufferAttachments(attachments = []) {
		const result = [];

		for (const attachment of attachments) {
			const content = await this.toAttachmentArrayBuffer(attachment);
			if (!content) {
				continue;
			}

			result.push({ ...attachment, content });
		}

		return result;
	},

	async toAttachmentBase64(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return content.replace(/\s+/g, '');
		}

		const arrayBuffer = await this.toAttachmentArrayBuffer(attachment);
		if (!arrayBuffer) {
			return null;
		}

		const bytes = new Uint8Array(arrayBuffer);
		let binary = '';

		for (let i = 0; i < bytes.length; i += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}

		return btoa(binary);
	},

	async toAttachmentArrayBuffer(attachment) {
		let content = attachment.content;

		if (!content) {
			return null;
		}

		if (content instanceof ArrayBuffer) {
			return content;
		}

		if (content instanceof Uint8Array) {
			return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
		}

		if (typeof content === 'string') {
			if (content.startsWith('data:')) {
				content = content.split(',')[1] || content;
			}
			return fileUtils.base64ToUint8Array(content.replace(/\s+/g, '')).buffer;
		}

		return content;
	},

	//处理站内邮件发送
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//查询所有收件人账号信息
		let accountList = await orm(c).select().from(account).where(inArray(sql`${account.email} COLLATE NOCASE`, receiveEmail)).all();

		// 对于含+未精确匹配的收件人，获取基础地址账号
		const plusEmails = receiveEmail.filter(
			e => e.includes('+') && !accountList.some(a => a.email.toLowerCase() === e.toLowerCase())
		);
		const baseAccounts = [];
		if (plusEmails.length > 0) {
			const baseEmails = [...new Set(
				plusEmails.map(e => emailUtils.getBaseEmail(e)).filter(Boolean)
			)];
			const existing = new Set(accountList.map(a => a.email.toLowerCase()));
			const needed = baseEmails.filter(e => !existing.has(e.toLowerCase()));
			if (needed.length > 0) {
				const rows = await orm(c).select().from(account)
					.where(inArray(sql`${account.email} COLLATE NOCASE`, needed)).all();
				baseAccounts.push(...rows);
			}
		}

		// 合并精确匹配和基础地址匹配的账号用于权限查询
		const allAccounts = [...accountList, ...baseAccounts];

		//查询所有收件人权限身份
		const userIds = allAccounts.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//封装数据库准备保存到数据库
		const emailDataList = [];

		for (const email of receiveEmail) {

			//把发件人邮件改成收件
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			let accountRow = allAccounts.find(accountRow => accountRow.email.toLowerCase() === email.toLowerCase());

			// 精确匹配不到时回退到主地址（去掉 +tag）
			if (!accountRow && email.includes('+')) {
				const baseEmail = emailUtils.getBaseEmail(email);
				accountRow = allAccounts.find(accountRow => accountRow.email.toLowerCase() === baseEmail.toLowerCase());
			}

			//如果收件人存在就把邮件信息改成收件人的
			if (accountRow) {

				//设置给收件人保存
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//如果收件人没有这个域名的使用权限和有邮件拦截，就把邮件改为拒收状态
				if (email !== c.env.admin) {

					if (!roleService.hasAvailDomainPerm(availDomain, email)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is not authorized to use this domain.`;
					} else if(roleService.isBanEmail(banEmail, sendEmailData.sendEmail)) {
						emailValues.status = emailConst.status.BOUNCED;
						emailValues.message = `The recipient <${email}> is disabled from receiving emails.`;
					}

				}

				emailDataList.push(emailValues);

			} else {

				//设置无收件人邮件信息
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//如果无人收件关闭改为拒收
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//保存邮件
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);
		const emailRowList = [];

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();
			emailRowList.push(emailRow);

			//设置附件保存
			for (const attRow of attList) {
				const attValues = {...attRow};
				attValues.emailId = emailRow.emailId;
				attValues.accountId = emailRow.accountId;
				attValues.userId = emailRow.userId;
				attValues.attId = null;
				await orm(c).insert(att).values(attValues).run();
			}

		}

		const bouncedEmail = emailDataList.find(emailRow => emailRow.status === emailConst.status.BOUNCED);


		let status = emailConst.status.DELIVERED;
		let message = ''
		//如果有拒收邮件，就把发件人的邮件改成拒收
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

		return emailRowList;
	},

	//站内邮件不经过 email 事件，在这里按转发规则推送
	async forwardOnSiteEmail(c, emailRowList, { sendParams }) {

		const { tgBotStatus, tgChatId, forwardStatus, forwardEmail, webhookStatus, webhookUrl, webhookRetry, webhookSecret, ruleEmail, ruleType } = await settingService.query(c);

		if (ruleType === settingConst.ruleType.RULE) {
			const emails = ruleEmail.split(',');
			emailRowList = emailRowList.filter(emailRow => emails.includes(emailRow.toEmail));
		}

		for (const emailRow of emailRowList) {

			//转发到TG
			if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
				await telegramService.sendEmailToBot(c, emailRow);
			}

			//转发到 Webhook
			if (webhookStatus === settingConst.webhookStatus.OPEN && webhookUrl) {
				await webhookService.sendEmail(c, emailRow, webhookUrl, webhookRetry, webhookSecret);
			}

		}

		//转发到其他邮箱。发件人用站内实际发件人，信头收件人保留原收件人，信封送到已验证地址。
		if (forwardStatus === settingConst.forwardStatus.OPEN && forwardEmail && emailRowList.length > 0) {

			const addresses = forwardEmail.split(',').map(address => address.trim()).filter(Boolean);
			const params = {
				...sendParams,
				attachments: await this.toCloudflareAttachments(sendParams.attachments || []),
				receiveEmail: emailRowList.map(row => ({ address: row.toEmail, name: row.toName || '' })).filter(item => item.address)
			};

			await Promise.all(addresses.map(async address => {

				try {
					const result = await forwardMime.send(c.env.forward, params, address);
					if (result?.error) {
						console.error(`转发邮箱 ${address} 失败：`, result.error);
					}
				} catch (e) {
					console.error(`转发邮箱 ${address} 失败：`, e);
				}

			}));

		}

	},

	imgReplace(content, cidAttList, r2domain) {

		if (!content) {
			return ''
		}

		const { document } = parseHTML(content);

		const images = Array.from(document.querySelectorAll('img'));

		const useAtts = []

		for (const img of images) {

			const src = img.getAttribute('src');
			if (src && src.startsWith('cid:') && cidAttList) {

				const cid = src.replace(/^cid:/, '');
				const attCidIndex = cidAttList.findIndex(cidAtt => cidAtt.contentId.replace(/^<|>$/g, '') === cid);

				if (attCidIndex > -1) {
					const cidAtt = cidAttList[attCidIndex];
					img.setAttribute('src', '{{domain}}' + cidAtt.key);
					useAtts.push(cidAtt)
				}

			}

			r2domain = domainUtils.toOssDomain(r2domain)

			if (src && src.startsWith(r2domain + '/')) {
				img.setAttribute('src', src.replace(r2domain + '/', '{{domain}}'));
			}

		}

		useAtts.forEach(att => {
			att.type = attConst.type.EMBED
		})

		return document.toString();
	},

	selectById(c, emailId) {
		return orm(c).select().from(email).where(
			and(eq(email.emailId, emailId),
				eq(email.isDel, isDel.NORMAL)))
			.get();
	},

	async latest(c, params, userId) {
		let { emailId, accountId, allReceive } = params;
		allReceive = Number(allReceive);

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const list = await orm(c).select({ ...emailListColumns }).from(email)
			.innerJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? undefined : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);
		for (const item of list) {
			item.listText = this.toListText(item);
		}
		return list;
	},

	async physicsDelete(c, params) {
		let { emailIds } = params;
		emailIds = emailIds.split(',').map(Number);
		await attService.removeByEmailIds(c, emailIds);
		await starService.removeByEmailIds(c, emailIds);
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		await orm(c).delete(email).where(inArray(email.userId, userIds)).run();
	},

	updateEmailStatus(c, params) {
		const { status, resendEmailId, message } = params;
		return orm(c).update(email).set({
			status: status,
			message: message
		}).where(eq(email.resendEmailId, resendEmailId)).returning().get();
	},

	async selectUserEmailCountList(c, userIds, type, del = isDel.NORMAL) {
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

	async allList(c, params) {

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort, full } = params;

		size = Number(size);
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		full = Number(full);

		if (type === undefined) {
			type = 'receive';
		}

		if (isNaN(size)) {
			size = 10;
		}

		if (size > 50) {
			size = 50;
		}

		if (isNaN(full)) {
			full = 1;
		}

		full = full === 1;

		const filters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort });
		const countFilters = this.allEmailListFilters({ emailId, name, subject, accountEmail, userEmail, type, timeSort, withCursor: false });
		const columns = full ? emailListColumns : emailBriefColumns;

		const query = orm(c).select({ ...columns, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...filters));

		// count 不搜用户时无需 join user
		const queryCount = userEmail
			? orm(c).select({ total: count() })
				.from(email)
				.leftJoin(user, eq(email.userId, user.userId))
				.where(and(...countFilters))
			: orm(c).select({ total: count() })
				.from(email)
				.where(and(...countFilters));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();
		const totalQuery = queryCount.get();
		const latestEmailQuery = orm(c).select({
			emailId: email.emailId,
			accountId: email.accountId,
			userId: email.userId,
		}).from(email)
			.where(eq(email.type, emailConst.type.RECEIVE))
			.orderBy(desc(email.emailId)).limit(1).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		if (full) {
			await this.emailAddAtt(c, list);
		} else {
			this.applyListText(list);
		}

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: 0,
				userId: 0,
			}
		}

		return { list: list, total: totalRow.total, latestEmail };
	},

	async allEmailLatest(c, params) {

		const { emailId } = params;

		let list = await orm(c).select({ ...emailListColumns, userEmail: user.email }).from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(
				and(
					gt(email.emailId, emailId),
					eq(email.type, emailConst.type.RECEIVE)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		await this.emailAddAtt(c, list);
		for (const item of list) {
			item.listText = this.toListText(item);
		}
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
		// 用 EXISTS 走 status=6 部分索引 + account 主键；避免 IN (SELECT account_id FROM account) 触发全盘扫描
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.RECEIVE}
			 WHERE status = ${emailConst.status.SAVING}
			   AND EXISTS (SELECT 1 FROM account WHERE account.account_id = email.account_id)`
		).run();
		await c.env.db.prepare(
			`UPDATE email
			 SET status = ${emailConst.status.NOONE}
			 WHERE status = ${emailConst.status.SAVING}`
		).run();
	},

	async autoClean(c) {
		const { autoCleanDays, autoCleanExclude } = await settingService.query(c);
		const days = Number(autoCleanDays);

		if (!days || days <= 0) {
			return;
		}

		const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD HH:mm:ss');
		const excludeEmails = String(autoCleanExclude || '')
			.split(/[,，]/)
			.map(item => item.trim())
			.filter(Boolean);

		let excludeUserIds = [];
		if (excludeEmails.length) {
			const rows = await orm(c)
				.select({ userId: user.userId })
				.from(user)
				.where(sql`${user.email} COLLATE NOCASE IN (${sql.join(excludeEmails.map(email => sql`${email}`), sql`, `)})`)
				.all();
			excludeUserIds = rows.map(row => row.userId);
		}

		const batchSize = 95;

		while (true) {
			const conditions = [lt(email.createTime, cutoff)];
			if (excludeUserIds.length) {
				conditions.push(notInArray(email.userId, excludeUserIds));
			}

			const rows = await orm(c)
				.select({ emailId: email.emailId })
				.from(email)
				.where(and(...conditions))
				.limit(batchSize)
				.all();

			if (!rows.length) {
				break;
			}

			const emailIds = rows.map(row => row.emailId);
			await this.physicsDelete(c, { emailIds: emailIds.join(',') });

			if (rows.length < batchSize) {
				break;
			}
		}
	},

	async batchDelete(c, params) {
		let { sendName, sendEmail, toEmail, subject, startTime, endTime, type  } = params

		let right = type === 'left' || type === 'include'
		let left = type === 'include'

		const conditions = []

		if (sendName) {
			conditions.push(like(email.name,`${left ? '%' : ''}${sendName}${right ? '%' : ''}`))
		}

		if (subject) {
			conditions.push(like(email.subject,`${left ? '%' : ''}${subject}${right ? '%' : ''}`))
		}

		if (sendEmail) {
			conditions.push(like(email.sendEmail,`${left ? '%' : ''}${sendEmail}${right ? '%' : ''}`))
		}

		if (toEmail) {
			conditions.push(like(email.toEmail,`${left ? '%' : ''}${toEmail}${right ? '%' : ''}`))
		}

		if (startTime && endTime) {
			conditions.push(gte(email.createTime,`${startTime}`))
			conditions.push(lte(email.createTime,`${endTime}`))
		}

		if (conditions.length === 0) {
			return;
		}

		const emailIdsRow = await orm(c).select({emailId: email.emailId}).from(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).all();

		const emailIds = emailIdsRow.map(row => row.emailId);

		if (emailIds.length === 0){
			return;
		}

		await attService.removeByEmailIds(c, emailIds);

		await orm(c).delete(email).where(conditions.length > 1 ? and(...conditions) : conditions[0]).run();
	},

	async physicsDeleteByAccountId(c, accountId) {
		await attService.removeByAccountId(c, accountId);
		await orm(c).delete(email).where(eq(email.accountId, accountId)).run();
	},

	async read(c, params, userId) {
		const { emailIds } = params;
		await orm(c).update(email).set({ unread: emailConst.unread.READ }).where(and(eq(email.userId, userId), inArray(email.emailId, emailIds)));
	}
};

export default emailService;
