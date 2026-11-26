import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, sql, ne, or, lt, desc } from 'drizzle-orm';
import {accountConst, isDel, settingConst} from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import signatureService from './signature-service';
import { normalizeHealthState, normalizeMailboxStatus, normalizeMailboxType } from './mailbox-identity';
import sharedMailboxService from './shared-mailbox-service';

const accountService = {

	async add(c, params, userId) {

		const { addEmailVerify , addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		let { email, token } = params;


		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}


		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelAccount'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		if (email.includes('+')) {
			const baseEmail = emailUtils.getBaseEmail(email);
			const baseAccount = await this.selectByEmailIncludeDel(c, baseEmail);
			if (!baseAccount || baseAccount.userId !== userId) {
				throw new BizError(t('notOwner'));
			}
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.email !== c.env.admin) {

			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId)
				if(userAccountCount >= roleRow.accountCount) throw new BizError(t('accountLimit'), 403);
			}

			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'),403)
			}

		}

		let addVerifyOpen = false

		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true
			await turnstileService.verify(c, token);
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, addVerifyCount);
			if (addVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}


		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= addVerifyCount
		}

		accountRow.addVerifyOpen = addVerifyOpen
		return accountRow;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${email}`).get();
	},

	async list(c, params, userId) {

		let { accountId, size, lastSort } = params;

		accountId = Number(accountId);
		size = Number(size);
		lastSort = Number(lastSort);

		if (size > 30) {
			size = 30;
		}

		if (!accountId) {
			accountId = 0;
		}

		if(Number.isNaN(lastSort)) {
			lastSort = 9999999999;
		}

		const rows = await orm(c).select().from(account).where(
			and(
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL),
					or(
						lt(account.sort, lastSort),
						and(
							eq(account.sort, lastSort),
							gt(account.accountId, accountId)
						)
					))
				)
			.orderBy(desc(account.sort), asc(account.accountId))
			.limit(size)
			.all();
		return rows.map(({signatureImageKey, signatureDeliveryKey, signatureText, signature, signatureEnabled, signatureReplyEnabled, ...row}) => ({
			...row,
			signatureImageUrl: signatureService.imageUrl(c.req.url, signatureImageKey),
			signatureDeliveryUrl: signatureService.imageUrl(c.req.url, signatureDeliveryKey || signatureImageKey),
			signatureText: signatureText || '',
			signature: signature || '',
			signatureEnabled: signatureEnabled ?? 1,
			signatureReplyEnabled: signatureReplyEnabled ?? 1
		}));
	},

	// Mailbox view of the same rows the mail engine already uses: an account is a
	// mailbox, 'personal' when the address belongs to one team member and 'shared'
	// when several members work it. No separate mailbox table, no duplicated mail.
	async listMailboxes(c, userId) {
		const rows = await sharedMailboxService.listForMember(c, userId);
		const personalEmail = await this.personalEmailFor(c, userId);
		return rows.map(row => {
			const type = normalizeMailboxType(row.mailbox_type);
			return this.toMailbox(c, row, type, this.isOwnPersonal(row, personalEmail));
		});
	},

	async listForUser(c, userId) {
		const rows = await orm(c).select().from(account).where(
			and(
				or(
					eq(account.userId, userId),
					sql`EXISTS (SELECT 1 FROM mailbox_member mm WHERE mm.mailbox_id = ${account.accountId} AND mm.user_id = ${userId} AND mm.status = 'active')`
				),
				eq(account.isDel, isDel.NORMAL)
			)
		).all();
		return rows.map(({signatureImageKey, signatureDeliveryKey, signatureText, signature, signatureEnabled, signatureReplyEnabled, ...row}) => ({
			...row,
			signatureImageUrl: signatureService.imageUrl(c.req.url, signatureImageKey),
			// What the mail engine embeds. Falls back to the master for signatures
			// uploaded before derivatives existed.
			signatureDeliveryUrl: signatureService.imageUrl(c.req.url, signatureDeliveryKey || signatureImageKey),
			signatureText: signatureText || '',
			signature: signature || '',
			signatureEnabled: signatureEnabled ?? 1,
			signatureReplyEnabled: signatureReplyEnabled ?? 1
		}));
	},

	toMailbox(c, row, type, isOwn = false) {
		return {
			accountId: row.account_id ?? row.accountId,
			email: row.email,
			name: row.name,
			displayName: row.display_name || row.displayName || row.name || row.email,
			mailboxType: type,
			mailboxStatus: normalizeMailboxStatus(row.mailbox_status ?? row.mailboxStatus),
			inboundState: normalizeHealthState(row.inbound_state ?? row.inboundState),
			outboundState: normalizeHealthState(row.outbound_state ?? row.outboundState),
			healthCheckedAt: row.health_checked_at ?? row.healthCheckedAt ?? null,
			// A mailbox is "yours" only when it is the address you sign in with.
			// Everything else is either your own extra address or a shared one.
			isPersonal: type === 'personal' && isOwn,
			isOwnAddress: isOwn,
			permissions: row.permissions || '',
			unreadCount: Number(row.unread_count) || 0,
			assignedCount: Number(row.assigned_count) || 0
		};
	},

	isOwnPersonal(row, personalEmail) {
		return !personalEmail || String(row.email).toLowerCase() === String(personalEmail).toLowerCase();
	},

	async personalEmailFor(c, userId) {
		const row = await c.env.db.prepare(
			`SELECT email FROM user WHERE user_id = ? AND COALESCE(is_del, 0) = 0`
		).bind(userId).first();
		return row?.email || '';
	},

	// A member's own personal mailbox. Used to answer "which mailbox should be
	// open by default" and "is this signature mine to use here".
	async personalMailboxFor(c, userId) {
		const rows = await this.listForUser(c, userId);
		const email = await this.personalEmailFor(c, userId);
		return rows.find(row => String(row.email).toLowerCase() === String(email).toLowerCase()) || null;
	},

	// Inbound health is derived from what the mail engine actually knows: whether
	// whether a sending channel is configured for this mailbox's domain. A row
	// that exists is never reported as "connected" by itself.
	async refreshHealth(c, accountId) {
		const row = await orm(c).select().from(account).where(eq(account.accountId, Number(accountId))).get();
		if (!row) throw new BizError('Mailbox not found.', 404);

		const { domainList, resendTokens } = await settingService.query(c);
		const domain = emailUtils.getDomain(row.email);
		const inboundState = domainList.includes('@' + domain) ? 'connected' : 'inbound_unavailable';
		// The production worker uses Cloudflare's verified-address forward binding
		// for delivery. Treat it as a real outbound path in mailbox health rather
		// than telling an administrator that a working shared inbox is unavailable.
		const outboundState = (c.env.email || c.env.forward || resendTokens?.[domain]) ? 'connected' : 'outbound_unavailable';

		await orm(c).update(account).set({
			inboundState,
			outboundState,
			healthCheckedAt: new Date().toISOString()
		}).where(eq(account.accountId, row.accountId)).run();

		return { accountId: row.accountId, inboundState, outboundState, healthCheckedAt: new Date().toISOString() };
	},

	// Creating a shared mailbox. The address must be on an already-configured
	// domain: HQ never invents a production address and never stores a provider
	// password, because the mail engine authenticates through the worker's own
	// domain configuration.
	async createSharedMailbox(c, params, userId) {
		const email = String(params.email || '').trim().toLowerCase();
		if (!email || !verifyUtils.isEmail(email)) {
			throw new BizError('Enter a valid mailbox address.', 400);
		}
		const { domainList, addEmail } = await settingService.query(c);
		if (addEmail !== settingConst.addEmail.OPEN) {
			throw new BizError('Adding mailboxes is disabled in company settings.', 403);
		}
		if (!domainList.includes('@' + emailUtils.getDomain(email))) {
			throw new BizError('That domain is not configured for this workspace.', 400);
		}

		const existing = await this.selectByEmailIncludeDel(c, email);
		if (existing) {
			throw new BizError('That address already exists.', 400);
		}

		const displayName = String(params.displayName || '').trim().slice(0, 60)
			|| emailUtils.getName(email);
		const row = await orm(c).insert(account).values({
			email,
			userId,
			name: displayName,
			displayName,
			mailboxType: 'shared',
			mailboxStatus: 'active',
			inboundState: 'unknown',
			outboundState: 'unknown'
		}).returning().get();

		// The creator administers this mailbox, but is not silently made a member
		// of the shared queue: they may add themselves with view rights if needed.
		await sharedMailboxService.grantAdminMembership(c, userId, row.accountId);
		return this.toMailbox(c, row, 'shared', false);
	},

	async updateSharedMailbox(c, params, userId) {
		const accountId = Number(params.accountId);
		if (!Number.isSafeInteger(accountId) || accountId <= 0) {
			throw new BizError('Invalid mailbox.', 400);
		}
		const row = await this.selectById(c, accountId);
		if (!row) throw new BizError('Mailbox not found.', 404);
		if (!sharedMailboxService.isSharedRow(row)) {
			throw new BizError('This address is a personal mailbox.', 400);
		}

		const patch = {};
		if (params.displayName !== undefined) {
			patch.displayName = String(params.displayName || '').trim().slice(0, 60);
			patch.name = patch.displayName;
		}
		if (params.mailboxStatus !== undefined) {
			patch.mailboxStatus = normalizeMailboxStatus(params.mailboxStatus);
		}
		if (!Object.keys(patch).length) {
			throw new BizError('Nothing to update.', 400);
		}

		await orm(c).update(account).set(patch).where(eq(account.accountId, accountId)).run();
		const updated = await this.selectById(c, accountId);
		return this.toMailbox(c, updated, 'shared', false);
	},

	async updateSignature(c, params, userId) {
		const accountId = Number(params.accountId);
		if (!Number.isSafeInteger(accountId) || accountId <= 0) {
			throw new BizError('Invalid account.', 400);
		}
		const accountRow = await this.selectById(c, accountId);
		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError('Account not found.', 404);
		}

		const signatureText = params.signatureText === undefined
			? accountRow.signatureText || ''
			: signatureService.normalizeText(params.signatureText);
		const signature = params.signature === undefined
			? accountRow.signature || ''
			: signatureService.normalizeHtml(params.signature);
		const signatureEnabled = params.signatureEnabled !== undefined
			? (params.signatureEnabled ? 1 : 0)
			: (accountRow.signatureEnabled ?? 1);
		const signatureReplyEnabled = params.signatureReplyEnabled !== undefined
			? (params.signatureReplyEnabled ? 1 : 0)
			: (accountRow.signatureReplyEnabled ?? 1);

		const previousKey = accountRow.signatureImageKey;
		const previousDeliveryKey = accountRow.signatureDeliveryKey;
		let signatureImageKey = previousKey;
		let signatureDeliveryKey = previousDeliveryKey;
		let uploadedKeys = [];
		if (params.signatureImageData) {
			const set = await signatureService.saveImageSet(c, userId, params.signatureImageData);
			uploadedKeys = [set.masterKey, set.deliveryKey === set.masterKey ? null : set.deliveryKey].filter(Boolean);
			signatureImageKey = set.masterKey;
			signatureDeliveryKey = set.deliveryKey;
		} else if (params.removeSignatureImage === true) {
			signatureImageKey = null;
			signatureDeliveryKey = null;
		}

		try {
			await orm(c).update(account).set({
				signatureImageKey,
				signatureDeliveryKey,
				signatureText,
				signature,
				signatureEnabled,
				signatureReplyEnabled
			})
				.where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();
		} catch (error) {
			for (const key of uploadedKeys) {
				await signatureService.deleteImage(c, key);
			}
			throw error;
		}

		if (previousKey && previousKey !== signatureImageKey) {
			await signatureService.deleteImage(c, previousKey);
		}
		if (previousDeliveryKey && previousDeliveryKey !== signatureDeliveryKey) {
			await signatureService.deleteImage(c, previousDeliveryKey);
		}
		return {
			accountId,
			signatureImageUrl: signatureService.imageUrl(c.req.url, signatureImageKey),
			signatureDeliveryKey,
			signatureText,
			signature,
			signatureEnabled,
			signatureReplyEnabled
		};
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);

		if (accountRow.email === user.email) {
			throw new BizError(t('delMyAccount'));
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError(t('noUserAccount'));
		}

		const { syncDelete } = await settingService.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { accountId });
			return;
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountId)))
			.run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		await orm(c).insert(account).values({ ...params }).returning();
	},

	async insertList(c, list) {
		await orm(c).insert(account).values(list).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId,userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId)
		return result;
	},

	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({num: count()}).from(account).where(and(eq(account.userId, userId),eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(sql`${account.email} COLLATE NOCASE = ${email}`).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.userId, userId)).run();
	},

	async setName(c, params, userId) {
		const { name, accountId } = params
		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await orm(c).update(account).set({name}).where(and(eq(account.userId, userId),eq(account.accountId, accountId))).run();
	},

	async allAccount(c, params) {

		let { userId, num, size } = params

		userId = Number(userId)

		num = Number(num)
		size = Number(size)

		if (size > 30) {
			size = 30;
		}

		num = (num - 1) * size;

		const userRow = await userService.selectByIdIncludeDel(c, userId);

		const list = await orm(c).select().from(account).where(and(eq(account.userId, userId),ne(account.email,userRow.email))).limit(size).offset(num);
		const { total } = await orm(c).select({ total: count() }).from(account).where(eq(account.userId, userId)).get();

		return { list, total }
	},

	async physicsDelete(c, params) {
		const { accountId } = params
		await emailService.physicsDeleteByAccountId(c, accountId)
		await orm(c).delete(account).where(eq(account.accountId, accountId)).run();
	},

	async setAllReceive(c, params, userId) {
		let a = null
		const { accountId } = params;
		const accountRow = await this.selectById(c, accountId);
		if (accountRow.userId !== userId) {
			return;
		}
		await orm(c).update(account).set({ allReceive: accountConst.allReceive.CLOSE }).where(eq(account.userId, userId)).run();
		await orm(c).update(account).set({ allReceive: accountRow.allReceive ? 0 : 1 }).where(eq(account.accountId, accountId)).run();
	},

	async setAsTop(c, params, userId) {
		const { accountId } = params;
		const userRow = await userService.selectById(c, userId);
		const mainAccountRow = await accountService.selectByEmailIncludeDel(c, userRow.email);
		let mainSort = mainAccountRow.sort === 0 ? 2 : mainAccountRow.sort + 1;
		await orm(c).update(account).set({ sort: mainSort }).where(eq(account.accountId, mainAccountRow.accountId)).run();
		await orm(c).update(account).set({ sort: mainSort - 1 }).where(and(eq(account.accountId, accountId),eq(account.userId,userId))).run();
	}
};

export default accountService;
