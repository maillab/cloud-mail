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
import signatureService from './signature-service';
import webhookService from './webhook-service';
import forwardMime from '../utils/forward-mime';
import sharedMailboxService from './shared-mailbox-service';
import { isPersonalMailbox, isSharedMailbox } from './mailbox-identity';

// A signature belongs to the member's personal mailbox. Shared addresses send as
// the company, so a member's personal sign-off must never appear there.
function isPersonalSender(accountRow, userRow) {
	if (!accountRow || !userRow) return false;
	if (!isPersonalMailbox(accountRow.mailboxType ?? accountRow.mailbox_type)) return false;
	return String(accountRow.email || '').toLowerCase() === String(userRow.email || '').toLowerCase();
}

function mailboxTypeOf(accountRow) {
	return String(accountRow?.mailboxType ?? accountRow?.mailbox_type ?? 'personal').trim().toLowerCase();
}

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
			folderKey,
			customFolderId,
			unreadOnly,
			starredOnly,
			hasAttachments,
		} = params;

		size = Number(size);
		type = Number(type);
		emailId = Number(emailId) || 0;
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);
		full = Number(full);

		if (isNaN(type)) {
			type = 0;
		}

		if (isNaN(accountId)) {
			throw new BizError(t('emptyAccountId'));
		}

		if (folderKey === 'custom'
			&& (!Number.isSafeInteger(Number(customFolderId)) || Number(customFolderId) <= 0)) {
			throw new BizError('Invalid folder.', 400);
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
			folderKey,
			customFolderId,
			unreadOnly,
			starredOnly,
			hasAttachments,
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
			folderKey,
			customFolderId,
			unreadOnly,
			starredOnly,
			hasAttachments,
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
		}).from(email)
			.innerJoin(account, eq(account.accountId, email.accountId))
			.where(and(...countFilters))
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
		folderKey,
		customFolderId,
		unreadOnly,
		starredOnly,
		hasAttachments,
	}) {
		const conditions = [
			eq(email.userId, userId),
			eq(account.isDel, isDel.NORMAL),
		];
		const folder = folderKey || (type === emailConst.type.SEND ? 'sent' : 'inbox');
		if (folder === 'trash') {
			conditions.push(or(eq(email.mailboxFolder, 'trash'), eq(email.isDel, isDel.DELETE)));
		} else {
			conditions.push(eq(email.isDel, isDel.NORMAL));
		}
		if (folder === 'sent') {
			conditions.push(eq(email.type, emailConst.type.SEND), eq(email.mailboxFolder, 'sent'));
		} else if (folder === 'all-unread') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE), eq(email.unread, emailConst.unread.UNREAD));
			conditions.push(ne(email.mailboxFolder, 'trash'));
		} else if (folder === 'archive' || folder === 'spam' || folder === 'trash') {
			conditions.push(eq(email.mailboxFolder, folder));
		} else if (folder === 'snoozed') {
			conditions.push(sql`${email.snoozedUntil} IS NOT NULL AND julianday(${email.snoozedUntil}) > julianday('now')`);
		} else if (folder === 'newsletter' || folder === 'notification') {
			conditions.push(eq(email.type, emailConst.type.RECEIVE), eq(email.category, folder));
			conditions.push(ne(email.mailboxFolder, 'trash'));
		} else if (folder === 'outbox') {
			conditions.push(eq(email.type, emailConst.type.SEND), inArray(email.status, [emailConst.status.DELAYED, emailConst.status.SAVING]));
		} else if (customFolderId) {
			conditions.push(ne(email.mailboxFolder, 'trash'));
			conditions.push(sql`EXISTS (
				SELECT 1 FROM email_folder
				WHERE email_folder.email_id = ${email.emailId}
					AND email_folder.user_id = ${userId}
					AND email_folder.folder_id = ${Number(customFolderId)}
			)`);
		} else {
			conditions.push(eq(email.type, emailConst.type.RECEIVE), eq(email.mailboxFolder, 'inbox'));
			conditions.push(sql`(${email.snoozedUntil} IS NULL OR julianday(${email.snoozedUntil}) <= julianday('now'))`);
		}
		if (!allReceive) {
			conditions.push(eq(email.accountId, accountId));
		}
		if (unreadOnly === 'true' || unreadOnly === true) {
			conditions.push(eq(email.type, emailConst.type.RECEIVE), eq(email.unread, emailConst.unread.UNREAD));
		}
		if (starredOnly === 'true' || starredOnly === true) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM star
				WHERE star.email_id = ${email.emailId}
					AND star.user_id = ${userId}
			)`);
		}
		if (hasAttachments === 'true' || hasAttachments === true) {
			conditions.push(sql`EXISTS (
				SELECT 1 FROM attachments
				WHERE attachments.email_id = ${email.emailId}
					AND attachments.user_id = ${userId}
					AND attachments.type = ${attConst.type.ATT}
			)`);
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
		const { syncDelete } = await settingService.query(c);

		if (params.permanent === 'true' || syncDelete === settingConst.syncDelete.OPEN) {
			const owned = await orm(c).select({ emailId: email.emailId }).from(email)
				.where(and(eq(email.userId, userId), inArray(email.emailId, emailIdList)))
				.all();
			const ownedIds = owned.map(row => row.emailId);
			if (ownedIds.length) {
				await this.physicsDelete(c, { emailIds: ownedIds.join(',') });
			}
			return;
		}

		await orm(c).update(email).set({ mailboxFolder: 'trash', snoozedUntil: null }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
		const placeholders = emailIdList.map(() => '?').join(',');
		await c.env.db.prepare(
			`DELETE FROM email_folder WHERE user_id = ? AND email_id IN (${placeholders})`
		).bind(userId, ...emailIdList).run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	// å‘é€å…¥å£ï¼šå…¬å…±æ ¡éªŒã€å‚æ•°å‡†å¤‡ã€æ¸ é“é€‰æ‹©å’Œç»“æžœæ±‡æ€»ã€‚
	async send(c, params, userId) {
		let {
			accountId, //å‘é€è´¦å·id
			name, //å‘ä»¶äººåå­—
			sendType, //å‘ä»¶ç±»åž‹
			emailId, //é‚®ä»¶idï¼Œå¦‚æžœæ˜¯å›žå¤é‚®ä»¶ä¼šå¸¦
			receiveEmail, //æ”¶ä»¶äººé‚®ç®±
			text, //é‚®ä»¶çº¯æ–‡æœ¬
			content, //é‚®ä»¶å†…å®¹
			subject, //é‚®ä»¶æ ‡é¢˜
			attachments = [], //é™„ä»¶
			signatureIncluded = false
		} = params;

		const { resendTokens, r2Domain, send, domainList } = await settingService.query(c);

		//åˆ¤æ–­æ˜¯å¦å…³é—­å‘ä»¶åŠŸèƒ½
		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const accountRow = await accountService.selectById(c, accountId);
		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}
		// Two legitimate senders: your own address, or a shared mailbox you are an
		// active member of with send rights. Nothing else — the sender is derived
		// from stored membership, never from what the client asks for.
		const ownsAccount = accountRow.userId === userId;
		let mailboxAccess = null;
		if (!ownsAccount) {
			mailboxAccess = await sharedMailboxService.assertAccess(c, userId, accountId, 'send');
		}
		if (sendType === 'reply' && params.emailId) {
			// Replying to a message must not let a member pull the conversation
			// into a mailbox they cannot see.
			const source = await c.env.db.prepare(
				`SELECT e.account_id, a.mailbox_type FROM email e JOIN account a ON a.account_id = e.account_id WHERE e.email_id = ? AND e.is_del = 0`
			).bind(Number(params.emailId)).first();
			if (!source) throw new BizError(t('notExistEmailReply'));
			if (!isPersonalMailbox(source.mailbox_type)) {
				await sharedMailboxService.assertAccess(c, userId, source.account_id, 'view');
			}
		}
		const senderEmail = accountRow.email;

		let userSigSettings = {};
		try {
			userSigSettings = userRow.signatureSettings ? JSON.parse(userRow.signatureSettings) : {};
		} catch {
			userSigSettings = {};
		}
		// A personal signature belongs to the member's own mailbox only. A shared
		// company address sends under the mailbox identity, so the personal
		// signature is never applied there — sending "Kind regards, Rodney" from
		// support@ is exactly the leak this prevents.
		const sendingFromPersonal = isPersonalSender(accountRow, userRow);
		const accountHasSignature = sendingFromPersonal
			&& Boolean(accountRow.signature || accountRow.signatureText || accountRow.signatureImageKey);
		const signatureProfile = accountHasSignature ? accountRow : (sendingFromPersonal ? userRow : null);
		const isSigEnabled = Boolean(signatureProfile)
			&& (accountRow.signatureEnabled ?? 1) === 1
			&& (userSigSettings.enabled !== false);
		const isReply = sendType === 'reply' || sendType === 'forward';
		const isReplyAllowed = !isReply || (Boolean(signatureProfile)
			&& (accountRow.signatureReplyEnabled ?? 1) === 1
			&& (userSigSettings.replyForward !== false));

		const alreadyHasSignature = Boolean(content && content.includes('xpass-user-signature'));
		if (isSigEnabled && isReplyAllowed && !alreadyHasSignature && signatureIncluded !== true) {
			const signatureHtml = signatureService.html(signatureProfile, c.req.url);
			if (signatureHtml) {
				content = `${content || ''}${signatureHtml}`;
				const plainSig = signatureService.plainText(signatureProfile);
				if (plainSig && (!text || !text.includes(plainSig))) {
					text = `${text || ''}\n\n--\n${plainSig}`;
				}
			}
		}
		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);
		const roleRow = await roleService.selectById(c, userRow.type);

		const recipientList = Array.isArray(receiveEmail)
			? receiveEmail
			: (typeof receiveEmail === 'string' && receiveEmail ? [receiveEmail] : []);
		if (!recipientList.length) {
			throw new BizError(t('noRecipient'), 400);
		}

		//åˆ¤æ–­æŽ¥æ”¶æ–¹æ˜¯ä¸æ˜¯å…¨éƒ¨ä¸ºç«™å†…é‚®ç®±
		const allInternal = recipientList.every(email => {
			const domain = '@' + emailUtils.getDomain(email);
			return domainList.includes(domain);
		});

		if (c.env.admin !== userRow.email) {

			//å‘ä»¶è¢«ç¦ç”¨
			if (roleRow.sendType === 'ban') {
				throw new BizError(t('bannedSend'), 403);
			}

			//å‘ä»¶è¢«ç¦ç”¨
			if (roleRow.sendType === 'internal' && !allInternal) {
				throw new BizError(t('onlyInternalSend'), 403);
			}

		}

		//å¦‚æžœä¸æ˜¯ç®¡ç†å‘˜ï¼Œæƒé™è®¾ç½®äº†å‘é€æ¬¡æ•°
		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + recipientList.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}

		if (c.env.admin !== userRow.email) {
			//ç”¨æˆ·æ²¡æœ‰è¿™ä¸ªåŸŸåçš„ä½¿ç”¨æƒé™
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		const domain = emailUtils.getDomain(accountRow.email);
		const resendToken = resendTokens[domain];
		const useCloudflareEmail = !!c.env.email;

		//å¦‚æžœæŽ¥æ”¶æ–¹å­˜åœ¨ç«™å¤–é‚®ç®±ï¼Œåˆæ²¡æœ‰å‘ä¿¡æœåŠ¡
		if (!useCloudflareEmail && !resendToken && !allInternal) {
			throw new BizError(t('noSendProvider'));
		}

		//æ²¡æœ‰å‘ä»¶äººåå­—è‡ªåŠ¨æˆªå–
		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		//å¦‚æžœæ˜¯å›žå¤é‚®ä»¶
		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		const sendParams = {
			name,
			accountEmail: accountRow.email,
			receiveEmail: recipientList,
			subject,
			text,
			html,
			attachments: [...imageDataList, ...attachments],
			sendType,
			messageId: emailRow.messageId
		};

		if (imageDataList.length > 10) {
			throw new BizError(t('imageAttLimit'));
		}
		if (attachments.length > 10) {
			throw new BizError(t('attLimit'));
		}

		const separate = params.manyType === 'divide';
		// sendParams ç”¨äºŽæ¸ é“è¯·æ±‚ï¼ŒsaveParams ä¿ç•™ä¿å­˜è®°å½•æ‰€éœ€çš„è´¦å·ã€æƒé™å’Œé™„ä»¶æ•°æ®ã€‚
		const context = {
			separate, allInternal, useCloudflareEmail, resendToken, sendParams,
			saveParams: {
				accountId, userId, name, subject, text, html,
				sendEmail: accountRow.email,
				messageId: emailRow.messageId,
				sendType, useCloudflareEmail, roleRow, r2Domain,
				imageDataList, attachments,
				// The message this send answers, so the shared conversation it
				// belongs to can be updated instead of opened twice.
				parentEmailId: sendType === 'reply' ? Number(params.emailId) || null : null,
				mailboxType: mailboxTypeOf(accountRow)
			}
		};

		// å…¨éƒ¨ç«™å†…æ”¶ä»¶äººèµ°æœ¬åœ°æŠ•é€’ï¼›å­˜åœ¨ç«™å¤–æ”¶ä»¶äººæ—¶ä¼˜å…ˆ CFï¼Œå…¶æ¬¡ Resendã€‚
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

		// æ¸ é“æ¯å®Œæˆä¸€ç»„å‘é€å¹¶ä¿å­˜è®°å½•åŽè¿”å›žç»“æžœï¼ŒåŽç»­å‘é€å¤±è´¥ä»ä¿ç•™å·²å®Œæˆéƒ¨åˆ†ã€‚
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

		// åˆ†å¼€å‘é€åªè¿”å›žå°šæœªå®Œæˆçš„æ”¶ä»¶äººï¼Œä¾›å‰ç«¯ä¿ç•™å¹¶é‡è¯•ã€‚
		const sentRecipients = emailResults.flatMap(item =>
			JSON.parse(item.recipient).map(recipient => recipient.address)
		);
		return {
			emails: emailResults,
			failedRecipients: sendParams.receiveEmail.filter(address => !sentRecipients.includes(address)),
			error: sendError
		};
	},

	// ç«™å†…å‘é€ï¼šæ™®é€šå‘é€å…±ç”¨ä¸€æ¡å‘ä»¶è®°å½•ï¼Œåˆ†å¼€å‘é€åˆ™æ¯äººä¸€æ¡ï¼Œå†å†™å…¥ç«™å†…æ”¶ä»¶ç®±ã€‚
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

	// CF å‘é€ï¼šæ™®é€šå‘é€ä¸€æ¬¡æäº¤æ‰€æœ‰æ”¶ä»¶äººï¼Œåˆ†å¼€å‘é€é€äººè°ƒç”¨å¹¶ä¿å­˜ç»“æžœã€‚
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
				// åˆ†å¼€å‘é€é‡åˆ°æ¸ é“é”™è¯¯å³åœæ­¢ï¼Œå·²æˆåŠŸçš„è®°å½•ç”±å…¥å£æ±‡æ€»ã€‚
				yield { error: { message: error.message } };
				return;
			}
			const emailResult = await this.saveSentEmail(c, {
				...saveParams, receiveEmail, providerId: result.data.id
			});
			yield { emails: [emailResult] };
		}
	},

	// Resend åˆ†å¼€å‘é€ä¸€æ¬¡æœ€å¤šæäº¤ 100 å°ç‹¬ç«‹é‚®ä»¶ï¼Œæ™®é€šå‘é€ä»è°ƒç”¨å•å°æŽ¥å£ã€‚
	async *sendResend(c, { separate, resendToken, sendParams, saveParams }) {
		if (separate && sendParams.receiveEmail.length > 100) {
			throw new BizError(t('resendRecipientLimit'));
		}
		// æ‰¹é‡æŽ¥å£ä¸æ”¯æŒé™„ä»¶ï¼ŒåŒ…å«æ­£æ–‡è½¬æ¢å¾—åˆ°çš„å†…åµŒé™„ä»¶ã€‚
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
		// ä¸¥æ ¼æ ¡éªŒæ¨¡å¼ä¸‹ï¼Œæ‰¹é‡è¿”å›žçš„é‚®ä»¶ ID æŒ‰æäº¤é¡ºåºå¯¹åº”å„æ”¶ä»¶äººã€‚
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

	// ä¸‰ä¸ªæ¸ é“å…±ç”¨çš„å‘ä»¶è®°å½•ä¿å­˜ï¼šæ¢å¤æ­£æ–‡å›¾ç‰‡ URLã€ä¿å­˜é™„ä»¶å¹¶æ›´æ–°å‘é€è®¡æ•°ã€‚
	async saveSentEmail(c, params) {
		const {
			accountId, userId, name, subject, text, html, sendEmail, receiveEmail,
			providerId, messageId, sendType, useCloudflareEmail,
			roleRow, r2Domain, attachments
		} = params;
		const imageDataList = params.imageDataList.map(item => ({
			...item, contentId: `<${item.contentId.replace(/^<|>$/g, '')}>`
		}));
		const emailData = {
			sendEmail, name, subject, text, accountId, userId,
			content: this.imgReplace(html, imageDataList, r2Domain),
			mailboxFolder: 'sent',
			status: useCloudflareEmail ? emailConst.status.DELIVERED : emailConst.status.SENT,
			type: emailConst.type.SEND,
			resendEmailId: providerId,
			recipient: JSON.stringify(receiveEmail.map(address => ({ address, name: '' })))
		};
		if (sendType === 'reply') {
			emailData.inReplyTo = messageId;
			emailData.relation = messageId;
		}
		if (roleRow.sendCount && roleRow.sendType !== 'internal') {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		const emailResult = await orm(c).insert(email).values(emailData).returning().get();

		// A send from a shared mailbox is recorded on the conversation it answers.
		// The service decides whether this is a reply on an existing thread or
		// the start of a new one; here we only pass the parent message so the
		// assignee, tags and history of the thread are preserved.
		if (isSharedMailbox(params.mailboxType)) {
			try {
				const parentEmailId = Number(params.parentEmailId) || null;
				await sharedMailboxService.registerOutgoing(
					c,
					emailResult.emailId,
					accountId,
					parentEmailId,
					userId,
					emailResult.subject || ''
				);
			} catch (error) {
				console.error('Shared mailbox conversation update failed:', error);
			}
		}

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

		//è®°å½•æ¯å¤©å‘ä»¶æ¬¡æ•°ç»Ÿè®¡
		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return emailResult;
	},

	// é™„ä»¶å·²åœ¨ Resend å¤„ç†å™¨ä¸­æ ¡éªŒï¼Œæ‰¹é‡æŽ¥å£ä¸ºæ¯ä½æ”¶ä»¶äººæž„é€ ç‹¬ç«‹é‚®ä»¶ã€‚
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

	//å¤„ç†ç«™å†…é‚®ä»¶å‘é€
	async HandleOnSiteEmail(c, receiveEmail, sendEmailData, attList) {

		const { noRecipient  } = await settingService.query(c);

		//æŸ¥è¯¢æ‰€æœ‰æ”¶ä»¶äººè´¦å·ä¿¡æ¯
		let accountList = await orm(c).select().from(account).where(inArray(sql`${account.email} COLLATE NOCASE`, receiveEmail)).all();

		// å¯¹äºŽå«+æœªç²¾ç¡®åŒ¹é…çš„æ”¶ä»¶äººï¼ŒèŽ·å–åŸºç¡€åœ°å€è´¦å·
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

		// åˆå¹¶ç²¾ç¡®åŒ¹é…å’ŒåŸºç¡€åœ°å€åŒ¹é…çš„è´¦å·ç”¨äºŽæƒé™æŸ¥è¯¢
		const allAccounts = [...accountList, ...baseAccounts];

		//æŸ¥è¯¢æ‰€æœ‰æ”¶ä»¶äººæƒé™èº«ä»½
		const userIds = allAccounts.map(accountRow => accountRow.userId);
		let roleList = await roleService.selectByUserIds(c, userIds);

		//å°è£…æ•°æ®åº“å‡†å¤‡ä¿å­˜åˆ°æ•°æ®åº“
		const emailDataList = [];

		for (const email of receiveEmail) {

			//æŠŠå‘ä»¶äººé‚®ä»¶æ”¹æˆæ”¶ä»¶
			const emailValues = {...sendEmailData}
			emailValues.status = emailConst.status.RECEIVE;
			emailValues.type = emailConst.type.RECEIVE;
			emailValues.mailboxFolder = 'inbox';
			emailValues.category = emailUtils.classifyIncomingEmail(sendEmailData.sendEmail);
			emailValues.toEmail = email;
			emailValues.toName = emailUtils.getName(email);
			emailValues.emailId = null;

			let accountRow = allAccounts.find(accountRow => accountRow.email.toLowerCase() === email.toLowerCase());

			// ç²¾ç¡®åŒ¹é…ä¸åˆ°æ—¶å›žé€€åˆ°ä¸»åœ°å€ï¼ˆåŽ»æŽ‰ +tagï¼‰
			if (!accountRow && email.includes('+')) {
				const baseEmail = emailUtils.getBaseEmail(email);
				accountRow = allAccounts.find(accountRow => accountRow.email.toLowerCase() === baseEmail.toLowerCase());
			}

			//å¦‚æžœæ”¶ä»¶äººå­˜åœ¨å°±æŠŠé‚®ä»¶ä¿¡æ¯æ”¹æˆæ”¶ä»¶äººçš„
			if (accountRow) {

				//è®¾ç½®ç»™æ”¶ä»¶äººä¿å­˜
				emailValues.userId = accountRow.userId;
				emailValues.accountId = accountRow.accountId;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.RECEIVE;

				const roleRow = roleList.find(roleRow => roleRow.userId === accountRow.userId);

				let { banEmail, availDomain } = roleRow;

				//å¦‚æžœæ”¶ä»¶äººæ²¡æœ‰è¿™ä¸ªåŸŸåçš„ä½¿ç”¨æƒé™å’Œæœ‰é‚®ä»¶æ‹¦æˆªï¼Œå°±æŠŠé‚®ä»¶æ”¹ä¸ºæ‹’æ”¶çŠ¶æ€
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

				//è®¾ç½®æ— æ”¶ä»¶äººé‚®ä»¶ä¿¡æ¯
				emailValues.userId = 0;
				emailValues.accountId = 0;
				emailValues.type = emailConst.type.RECEIVE;
				emailValues.status = emailConst.status.NOONE;

				//å¦‚æžœæ— äººæ”¶ä»¶å…³é—­æ”¹ä¸ºæ‹’æ”¶
				if (noRecipient === settingConst.noRecipient.CLOSE) {
					emailValues.status = emailConst.status.BOUNCED;
					emailValues.message = `Recipient not found: <${email}>`;
				}

				emailDataList.push(emailValues);

			}

		}

		//ä¿å­˜é‚®ä»¶
		const receiveEmailList = emailDataList.filter(emailRow => emailRow.status === emailConst.status.RECEIVE || emailRow.status === emailConst.status.NOONE);
		const emailRowList = [];

		for (const emailData of receiveEmailList) {

			const emailRow = await orm(c).insert(email).values(emailData).returning().get();
			emailRowList.push(emailRow);

			//è®¾ç½®é™„ä»¶ä¿å­˜
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
		//å¦‚æžœæœ‰æ‹’æ”¶é‚®ä»¶ï¼Œå°±æŠŠå‘ä»¶äººçš„é‚®ä»¶æ”¹æˆæ‹’æ”¶
		if (bouncedEmail) {
			const messageJson = { message: bouncedEmail.message };
			message = JSON.stringify(messageJson);
			status = emailConst.status.BOUNCED;
		}

		await orm(c).update(email).set({ status, message: message }).where(eq(email.emailId, sendEmailData.emailId)).run();

		return emailRowList;
	},

	//ç«™å†…é‚®ä»¶ä¸ç»è¿‡ email äº‹ä»¶ï¼Œåœ¨è¿™é‡ŒæŒ‰è½¬å‘è§„åˆ™æŽ¨é€
	async forwardOnSiteEmail(c, emailRowList, { sendParams }) {

		const { tgBotStatus, tgChatId, forwardStatus, forwardEmail, webhookStatus, webhookUrl, webhookRetry, webhookSecret, ruleEmail, ruleType } = await settingService.query(c);

		if (ruleType === settingConst.ruleType.RULE) {
			const emails = ruleEmail.split(',');
			emailRowList = emailRowList.filter(emailRow => emails.includes(emailRow.toEmail));
		}

		for (const emailRow of emailRowList) {

			//è½¬å‘åˆ°TG
			if (tgBotStatus === settingConst.tgBotStatus.OPEN && tgChatId) {
				await telegramService.sendEmailToBot(c, emailRow);
			}

			//è½¬å‘åˆ° Webhook
			if (webhookStatus === settingConst.webhookStatus.OPEN && webhookUrl) {
				await webhookService.sendEmail(c, emailRow, webhookUrl, webhookRetry, webhookSecret);
			}

		}

		//è½¬å‘åˆ°å…¶ä»–é‚®ç®±ã€‚å‘ä»¶äººç”¨ç«™å†…å®žé™…å‘ä»¶äººï¼Œä¿¡å¤´æ”¶ä»¶äººä¿ç•™åŽŸæ”¶ä»¶äººï¼Œä¿¡å°é€åˆ°å·²éªŒè¯åœ°å€ã€‚
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
						console.error(`è½¬å‘é‚®ç®± ${address} å¤±è´¥ï¼š`, result.error);
					}
				} catch (e) {
					console.error(`è½¬å‘é‚®ç®± ${address} å¤±è´¥ï¼š`, e);
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

			const ossDomain = domainUtils.toOssDomain(r2domain);
			if (ossDomain && src && src.startsWith(ossDomain + '/')) {
				img.setAttribute('src', src.replace(ossDomain + '/', '{{domain}}'));
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
					eq(email.type, emailConst.type.RECEIVE),
					eq(email.mailboxFolder, 'inbox'),
					sql`(${email.snoozedUntil} IS NULL OR julianday(${email.snoozedUntil}) <= julianday('now'))`
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
		const placeholders = emailIds.map(() => '?').join(',');
		await c.env.db.prepare(`DELETE FROM email_folder WHERE email_id IN (${placeholders})`)
			.bind(...emailIds).run();
		await orm(c).delete(email).where(inArray(email.emailId, emailIds)).run();
	},

	async physicsDeleteUserIds(c, userIds) {
		await attService.removeByUserIds(c, userIds);
		const placeholders = userIds.map(() => '?').join(',');
		await c.env.db.prepare(`DELETE FROM email_folder WHERE user_id IN (${placeholders})`)
			.bind(...userIds).run();
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

		// count ä¸æœç”¨æˆ·æ—¶æ— éœ€ join user
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

	// Finds the message this inbound mail answers, if it is one we already hold.
	// Replies are threaded by the RFC headers; when the header is missing the
	// subject is matched with its Re:/Fwd: prefix stripped, which is how mail
	// clients that drop headers still group a thread.
	async resolveThreadParent(c, row) {
		const candidates = [];
		if (row.inReplyTo) candidates.push(String(row.inReplyTo));
		if (row.messageId) candidates.push(String(row.messageId));
		if (row.relation) candidates.push(String(row.relation));
		for (const value of candidates) {
			if (!value) continue;
			const match = await c.env.db.prepare(
				`SELECT email_id FROM email
				 WHERE account_id = ? AND is_del = 0 AND message_id = ? LIMIT 1`
			).bind(row.accountId, value).first();
			if (match) return match.email_id;
		}
		if (row.subject) {
			const subject = String(row.subject).replace(/^((re|fw|fwd)\s*:\s*)+/i, '').trim();
			if (subject) {
				const match = await c.env.db.prepare(
					`SELECT email_id FROM email
					 WHERE account_id = ? AND is_del = 0 AND email_id <> ? AND subject LIKE ? AND type = 1
					 ORDER BY email_id DESC LIMIT 1`
				).bind(row.accountId, row.emailId, `%${subject}`).first();
				if (match) return match.email_id;
			}
		}
		return null;
	},

	async completeReceive(c, status, emailId) {
		const row = await orm(c).update(email).set({
			isDel: isDel.NORMAL,
			status: status
		}).where(eq(email.emailId, emailId)).returning().get();

		// Inbound mail to a shared company address starts a workflow conversation:
		// the message row stays the message, the conversation row is the work.
		// A reply to a thread we already opened lands on that thread, so the
		// member who owns it and the tags it carries survive the reply.
		if (row && status === emailConst.status.RECEIVE) {
			try {
				const accountRow = await c.env.db.prepare(
					`SELECT mailbox_type FROM account WHERE account_id = ?`
				).bind(row.accountId).first();
				if (accountRow && isSharedMailbox(accountRow.mailbox_type)) {
					const parentEmailId = await this.resolveThreadParent(c, row);
					await sharedMailboxService.registerIncoming(
						c, row.emailId, row.accountId, parentEmailId, null, row.subject || ''
					);
				}
			} catch (error) {
				// A conversation failure must never lose the message itself.
				console.error('Shared mailbox conversation registration failed:', error);
			}
		}
		return row;
	},

	async completeReceiveAll(c) {
		// ç”¨ EXISTS èµ° status=6 éƒ¨åˆ†ç´¢å¼• + account ä¸»é”®ï¼›é¿å… IN (SELECT account_id FROM account) è§¦å‘å…¨ç›˜æ‰«æ
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
			.split(/[,ï¼Œ]/)
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
