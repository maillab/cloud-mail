import orm from '../entity/orm';
import email from '../entity/email';
import { attConst, emailConst, isDel, settingConst } from '../const/entity-const';
import { and, desc, eq, gt, inArray, lt, count, asc, sql, ne, or, like, lte, gte } from 'drizzle-orm';
import { star } from '../entity/star';
import settingService from './setting-service';
import accountService from './account-service';
import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
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
import r2Service from './r2-service';
import domainUtils from '../utils/domain-uitls';
import account from "../entity/account";

const emailService = {

	async list(c, params, userId) {

		let { emailId, type, accountId, size, timeSort, allReceive } = params;

		size = Number(size);
		emailId = Number(emailId);
		timeSort = Number(timeSort);
		accountId = Number(accountId);
		allReceive = Number(allReceive);

		if (size > 30) {
			size = 30;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

		if (isNaN(allReceive)) {
			let accountRow = await accountService.selectById(c, accountId);
			allReceive = accountRow.allReceive;
		}

		const query = orm(c)
			.select({
				...email,
				starId: star.starId
			})
			.from(email)
			.leftJoin(
				star,
				and(
					eq(star.emailId, email.emailId),
					eq(star.userId, userId)
				)
			).leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					timeSort ? gt(email.emailId, emailId) : lt(email.emailId, emailId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL)
				)
			);

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = query.limit(size).all();

		const totalQuery = orm(c).select({ total: count() }).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.userId, userId),
					eq(email.type, type),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL)
				)
		).get();

		const latestEmailQuery = orm(c).select().from(email).where(
			and(
				allReceive ? eq(1,1) : eq(email.accountId, accountId),
				eq(email.userId, userId),
				eq(email.type, type),
				eq(email.isDel, isDel.NORMAL)
			))
			.orderBy(desc(email.emailId)).limit(size).get();

		let [list, totalRow, latestEmail] = await Promise.all([listQuery, totalQuery, latestEmailQuery]);

		list = list.map(item => ({
			...item,
			isStar: item.starId != null ? 1 : 0
		}));

		const emailIds = list.map(item => item.emailId);

		const attsList = await attService.selectByEmailIds(c, emailIds);

		list.forEach(emailRow => {
			const atts = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
			emailRow.attList = atts;
		});

		if (!latestEmail) {
			latestEmail = {
				emailId: 0,
				accountId: accountId,
				userId: userId,
			}
		}

		return { list, total: totalRow.total, latestEmail };
	},

	async delete(c, params, userId) {
		const { emailIds } = params;
		const emailIdList = emailIds.split(',').map(Number);
		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(
			and(
				eq(email.userId, userId),
				inArray(email.emailId, emailIdList)))
			.run();
	},

	receive(c, params, cidAttList, r2domain) {
		params.content = this.imgReplace(params.content, cidAttList, r2domain)
		return orm(c).insert(email).values({ ...params }).returning().get();
	},

	async send(c, params, userId) {

		let {
			accountId,
			name,
			sendType,
			emailId,
			receiveEmail,
			manyType,
			text,
			content,
			subject,
			attachments
		} = params;

		const { resendTokens, r2Domain, send } = await settingService.query(c);

		let { imageDataList, html } = await attService.toImageUrlHtml(c, content);

		if (send === settingConst.send.CLOSE) {
			throw new BizError(t('disabledSend'), 403);
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (c.env.admin !== userRow.email && roleRow.sendType === 'ban') {
			throw new BizError(t('bannedSend'), 403);
		}

		if (c.env.admin !== userRow.email && roleRow.sendCount) {

			if (userRow.sendCount >= roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLimit'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLimit'), 403);
			}

			if (userRow.sendCount + receiveEmail.length > roleRow.sendCount) {
				if (roleRow.sendType === 'day') throw new BizError(t('daySendLack'), 403);
				if (roleRow.sendType === 'count') throw new BizError(t('totalSendLack'), 403);
			}

		}


		if (imageDataList.length > 0 && !r2Domain) {
			throw new BizError(t('noOsDomainSendPic'));
		}

		if (imageDataList.length > 0 && !await r2Service.hasOSS(c)) {
			throw new BizError(t('noOsSendPic'));
		}

		if (attachments.length > 0 && !r2Domain) {
			throw new BizError(t('noOsDomainSendAtt'));
		}

		if (attachments.length > 0 && !await r2Service.hasOSS(c)) {
			throw new BizError(t('noOsSendAtt'));
		}

		if (attachments.length > 0 && manyType === 'divide') {
			throw new BizError(t('noSeparateSend'));
		}


		const accountRow = await accountService.selectById(c, accountId);

		if (!accountRow) {
			throw new BizError(t('senderAccountNotExist'));
		}

		if (accountRow.userId !== userId) {
			throw new BizError(t('sendEmailNotCurUser'));
		}

		if (c.env.admin !== userRow.email) {

			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, accountRow.email)) {
				throw new BizError(t('noDomainPermSend'),403)
			}

		}

		if (!name) {
			name = emailUtils.getName(accountRow.email);
		}

		let emailRow = {
			messageId: null
		};

		if (sendType === 'reply') {

			emailRow = await this.selectById(c, emailId);

			if (!emailRow) {
				throw new BizError(t('notExistEmailReply'));
			}

		}

		//把图片标签cid标签切换会通用url
		imageDataList = imageDataList.map(item => ({...item, contentId: `<${item.contentId}>`}))
		html = this.imgReplace(html, imageDataList, r2Domain);

		const emailData = {};
		emailData.sendEmail = accountRow.email;
		emailData.name = name;
		emailData.subject = subject;
		emailData.content = html;
		emailData.text = text;
		emailData.accountId = accountId;
		emailData.type = emailConst.type.SEND;
		emailData.userId = userId;
		emailData.status = emailConst.status.SENT;
		emailData.toEmail = '';
		emailData.toName = '';

		const emailDataList = [];
		const resendEmailList = [];
		const localEmailList = [];

		// 获取本服务的域名列表
		let domainList = c.env.domain;
		if (typeof domainList === 'string') {
			domainList = JSON.parse(domainList);
		}

		// 分离站内邮件和外部邮件
		receiveEmail.forEach(recipientEmail => {
			const recipientDomain = emailUtils.getDomain(recipientEmail);
			if (domainList.includes(recipientDomain)) {
				localEmailList.push(recipientEmail);
			} else {
				resendEmailList.push(recipientEmail);
			}
		});

		// 处理外部邮件发送
		if (resendEmailList.length > 0) {
			const domain = emailUtils.getDomain(accountRow.email);
			const resendToken = resendTokens[domain];

			if (!resendToken) {
				throw new BizError(t('noResendToken'));
			}

			let resendResult = null;
			const resend = new Resend(resendToken);

			//如果是分开发送
			if (manyType === 'divide') {

				let sendFormList = [];

				resendEmailList.forEach(email => {
					const sendForm = {
						from: `${name} <${accountRow.email}>`,
						to: [email],
						subject: subject,
						text: text,
						html: html,
						attachments: [...imageDataList, ...attachments]
					};

					if (sendType === 'reply') {
						sendForm.headers = {
							'in-reply-to': emailRow.messageId,
							'references': emailRow.messageId
						};
					}

					sendFormList.push(sendForm);
				});

				resendResult = await resend.batch.send(sendFormList);

			} else {

				const sendForm = {
					from: `${name} <${accountRow.email}>`,
					to: [...resendEmailList],
					subject: subject,
					text: text,
					html: html,
					attachments: [...imageDataList, ...attachments]
				};

				if (sendType === 'reply') {
					sendForm.headers = {
						'in-reply-to': emailRow.messageId,
						'references': emailRow.messageId
					};
				}

				resendResult = await resend.emails.send(sendForm);

			}

			const { data, error } = resendResult;

			if (error) {
				throw new BizError(error.message);
			}

			// 添加发送记录
				if (manyType === 'divide') {
					resendEmailList.forEach((item, index) => {
						const emailDataItem = { ...emailData };
						emailDataItem.resendEmailId = data.data[index].id;
						emailDataItem.recipient = JSON.stringify([{ address: item, name: '' }]);
						emailDataItem.toEmail = item;
						emailDataItem.toName = '';
						emailDataList.push(emailDataItem);
					});
				} else {
					const emailDataItem = { ...emailData };
					emailDataItem.resendEmailId = data.id;
					emailDataItem.recipient = JSON.stringify(resendEmailList.map(item => ({ address: item, name: '' })));
					emailDataItem.toEmail = resendEmailList.join(',');
					emailDataItem.toName = '';
					emailDataList.push(emailDataItem);
				}
		}

		// 处理站内邮件
		for (const recipientEmail of localEmailList) {
			// 添加发送记录
			const emailDataItem = { ...emailData };
			emailDataItem.recipient = JSON.stringify([{ address: recipientEmail, name: '' }]);
			emailDataItem.toEmail = recipientEmail;
			emailDataItem.toName = '';
			emailDataList.push(emailDataItem);

			// 查找收件人账户
			const recipientAccount = await accountService.selectByEmailIncludeDel(c, recipientEmail);
			
			if (recipientAccount && recipientAccount.isDel === isDel.NORMAL) {
				// 创建收件记录
				const receiveData = {
					name: name,
					sendEmail: accountRow.email,
					toEmail: recipientEmail,
					subject: subject,
					content: html,
					text: text,
					accountId: recipientAccount.accountId,
					userId: recipientAccount.userId,
					type: emailConst.type.RECEIVE,
					status: emailConst.status.RECEIVE,
					recipient: JSON.stringify([{ address: recipientEmail, name: '' }]),
					unread: emailConst.unread.UNREAD,
					toName: ''
				};
				
				if (sendType === 'reply') {
					receiveData.inReplyTo = emailRow.messageId;
					receiveData.relation = emailRow.messageId;
				}
				
				// 插入收件记录
				const receiveEmailRow = await orm(c).insert(email).values(receiveData).returning().get();
				
				// 保存附件到收件记录
				if (imageDataList.length > 0) {
					await attService.saveArticleAtt(c, imageDataList, recipientAccount.userId, recipientAccount.accountId, receiveEmailRow.emailId);
				}
				
				if (attachments?.length > 0 && await r2Service.hasOSS(c)) {
					await attService.saveSendAtt(c, attachments, recipientAccount.userId, recipientAccount.accountId, receiveEmailRow.emailId);
				}
			}
		}

		if (sendType === 'reply') {
			emailDataList.forEach(emailDataItem => {
				emailDataItem.inReplyTo = emailRow.messageId;
				emailDataItem.relation = emailRow.messageId;
			});
		}

		if (roleRow.sendCount) {
			await userService.incrUserSendCount(c, receiveEmail.length, userId);
		}

		const emailRowList = await Promise.all(
			emailDataList.map(async (emailDataItem) => {
				const emailRow = await orm(c).insert(email).values(emailDataItem).returning().get();

				if (imageDataList.length > 0) {
					await attService.saveArticleAtt(c, imageDataList, userId, accountId, emailRow.emailId);
				}

				if (attachments?.length > 0 && await r2Service.hasOSS(c)) {
					await attService.saveSendAtt(c, attachments, userId, accountId, emailRow.emailId);
				}

				const attsList = await attService.selectByEmailIds(c, [emailRow.emailId]);
				emailRow.attList = attsList;

				return emailRow;
			})
		);

		const dateStr = dayjs().format('YYYY-MM-DD');

		let daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		if (!daySendTotal) {
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(receiveEmail.length), { expirationTtl: 60 * 60 * 24 });
		} else  {
			daySendTotal = Number(daySendTotal) + receiveEmail.length
			await c.env.kv.put(kvConst.SEND_DAY_COUNT + dateStr, JSON.stringify(daySendTotal), { expirationTtl: 60 * 60 * 24 });
		}

		return emailRowList;
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

		const list = await orm(c).select({...email}).from(email)
			.leftJoin(
				account,
				eq(account.accountId, email.accountId)
			)
			.where(
				and(
					eq(email.userId, userId),
					eq(email.isDel, isDel.NORMAL),
					eq(account.isDel, isDel.NORMAL),
					allReceive ? eq(1,1) : eq(email.accountId, accountId),
					eq(email.type, emailConst.type.RECEIVE),
					gt(email.emailId, emailId)
				))
			.orderBy(desc(email.emailId))
			.limit(20);

		const emailIds = list.map(item => item.emailId);

		if (emailIds.length > 0) {

			const attsList = await attService.selectByEmailIds(c, emailIds);

			list.forEach(emailRow => {
				const atts = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
				emailRow.attList = atts;
			});
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

		let { emailId, size, name, subject, accountEmail, userEmail, type, timeSort } = params;

		size = Number(size);

		emailId = Number(emailId);
		timeSort = Number(timeSort);

		if (size > 30) {
			size = 30;
		}

		if (!emailId) {

			if (timeSort) {
				emailId = 0;
			} else {
				emailId = 9999999999;
			}

		}

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
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${userEmail} || '%'`);
		}

		if (accountEmail) {
			conditions.push(
				or(
					sql`${email.toEmail} COLLATE NOCASE LIKE ${accountEmail} || '%'`,
					sql`${email.sendEmail} COLLATE NOCASE LIKE ${accountEmail} || '%'`,
				)
			)
		}

		if (name) {
			conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${name} || '%'`);
		}

		if (subject) {
			conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject} || '%'`);
		}

		conditions.push(ne(email.status, emailConst.status.SAVING));

		const countConditions = [...conditions];

		if (timeSort) {
			conditions.push(gt(email.emailId, emailId));
		} else {
			conditions.push(lt(email.emailId, emailId));
		}

		const query = orm(c).select({ ...email, userEmail: user.email })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...conditions));

		const queryCount = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.where(and(...countConditions));

		if (timeSort) {
			query.orderBy(asc(email.emailId));
		} else {
			query.orderBy(desc(email.emailId));
		}

		const listQuery = await query.limit(size).all();
		const totalQuery = await queryCount.get();

		const [list, totalRow] = await Promise.all([listQuery, totalQuery]);

		const emailIds = list.map(item => item.emailId);
		const attsList = await attService.selectByEmailIds(c, emailIds);

		list.forEach(emailRow => {
			const atts = attsList.filter(attsRow => attsRow.emailId === emailRow.emailId);
			emailRow.attList = atts;
		});

		return { list: list, total: totalRow.total };
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
			await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.RECEIVE} WHERE status = ${emailConst.status.SAVING} AND EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
			await c.env.db.prepare(`UPDATE email as e SET status = ${emailConst.status.NOONE} WHERE status = ${emailConst.status.SAVING} AND NOT EXISTS (SELECT 1 FROM account WHERE account_id = e.account_id)`).run();
	},

	async autoDeleteEmails(c) {
		// 获取所有用户的邮件自动删除设置
		const users = await c.env.db.prepare(
			'SELECT user_id, email_auto_delete_days FROM user WHERE email_auto_delete_days > 0'
		).all();

		for (const user of users.results) {
			const { user_id: userId, email_auto_delete_days: days } = user;
			
			// 删除超过设置天数且未星标的邮件
			await c.env.db.prepare(
				`DELETE FROM email 
				 WHERE user_id = ? 
				 AND create_time < DATETIME('now', ? || ' days') 
				 AND email_id NOT IN (SELECT email_id FROM star WHERE user_id = ?)
				 AND is_del = 0`
			).bind(userId, -days, userId).run();
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
