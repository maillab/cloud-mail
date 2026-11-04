import type { AccountListQuery, AccountIdInput, AccountRow, PageQuery } from '../types/user';
import accountDao from '../dao/account-dao';
import { boundId } from '../lib/bound-id';
import { requiredRow } from '../lib/required-row';
import { stringList } from '../lib/string-list';
import type { EnvContext, RequestMetadataContext } from '../types/context';
import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userDao from '../dao/user-dao';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, ne, or, lt, desc } from 'drizzle-orm';
import {accountConst, isDel, settingConst} from '../const/entity-const';
import settingsReader from './settings-reader';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { tFor } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';

const accountService = {

	async add(c: RequestMetadataContext, params: { email: string; token?: string }, userId: number) {
		const t = tFor(c);

		const { addEmailVerify , addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingsReader.query(c);

		const { email, token } = params;


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

		if (emailUtils.getName(email).length < Number(minEmailPrefix)) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (stringList(emailPrefixFilter, 'emailPrefixFilter', 'some').some(content => emailUtils.getName(email).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let accountRow: (AccountRow & { addVerifyOpen?: boolean }) | undefined = await this.selectByEmailIncludeDel(c, email);

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

		const userRow = requiredRow(await userDao.selectById(c, userId), 'type');
		const roleRow = requiredRow(await roleService.selectById(c, userRow.type), 'accountCount');

		if (userRow.email !== c.env.admin) {

			if (Number(roleRow.accountCount) > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId)
				if(userAccountCount >= Number(roleRow.accountCount)) throw new BizError(t('accountLimit'), 403);
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
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, Number(addVerifyCount));
			if (addVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}


		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= Number(addVerifyCount)
		}

		accountRow.addVerifyOpen = addVerifyOpen
		return accountRow;
	},

	selectByEmailIncludeDel: accountDao.selectByEmailIncludeDel,

	list(c: EnvContext, params: AccountListQuery, userId: number) {

		let { accountId, size, lastSort } = { accountId: Number(params.accountId), size: Number(params.size), lastSort: Number(params.lastSort) };

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

		return orm(c).select().from(account).where(
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
	},

	async delete(c: EnvContext, params: AccountIdInput, userId: number) {
		const t = tFor(c);

		const { accountId } = params;

		const user = requiredRow(await userDao.selectById(c, userId), 'email');
		const accountRow = requiredRow(await this.selectById(c, accountId), 'email');

		if (accountRow.email === user.email) {
			throw new BizError(t('delMyAccount'));
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError(t('noUserAccount'));
		}

		const { syncDelete } = await settingsReader.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { accountId });
			return;
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, boundId(accountId))))
			.run();
	},

	selectById: accountDao.selectById,

	insert: accountDao.insert,

	insertList: accountDao.insertList,

	async physicsDeleteByUserIds(c: EnvContext, userIds: number[]) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId,userIds)).run();
	},

	selectUserAccountCountList: accountDao.selectUserAccountCountList,

	countUserAccount: accountDao.countUserAccount,

	restoreByEmail: accountDao.restoreByEmail,

	restoreByUserId: accountDao.restoreByUserId,

	async setName(c: EnvContext, params: AccountIdInput & { name: string }, userId: number) {
		const t = tFor(c);
		const { name, accountId } = params
		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await orm(c).update(account).set({name}).where(and(eq(account.userId, userId),eq(account.accountId, boundId(accountId)))).run();
	},

	async allAccount(c: EnvContext, params: PageQuery) {

		let { userId, num, size } = { userId: Number(params.userId), num: Number(params.num), size: Number(params.size) }

		userId = Number(userId)

		num = Number(num)
		size = Number(size)

		if (size > 30) {
			size = 30;
		}

		num = (num - 1) * size;

		const userRow = requiredRow(await userDao.selectByIdIncludeDel(c, userId), 'email');

		const list = await orm(c).select().from(account).where(and(eq(account.userId, userId),ne(account.email,userRow.email))).limit(size).offset(num);
		const { total } = requiredRow(await orm(c).select({ total: count() }).from(account).where(eq(account.userId, userId)).get(), 'total');

		return { list, total }
	},

	async physicsDelete(c: EnvContext, params: AccountIdInput) {
		const { accountId } = params
		await emailService.physicsDeleteByAccountId(c, accountId)
		await orm(c).delete(account).where(eq(account.accountId, boundId(accountId))).run();
	},

	async setAllReceive(c: EnvContext, params: AccountIdInput, userId: number) {
				const { accountId } = params;
		const accountRow = requiredRow(await this.selectById(c, accountId), 'email');
		if (accountRow.userId !== userId) {
			return;
		}
		await orm(c).update(account).set({ allReceive: accountConst.allReceive.CLOSE }).where(eq(account.userId, userId)).run();
		await orm(c).update(account).set({ allReceive: accountRow.allReceive ? 0 : 1 }).where(eq(account.accountId, boundId(accountId))).run();
	},

	async setAsTop(c: EnvContext, params: AccountIdInput, userId: number) {
		const { accountId } = params;
		const userRow = requiredRow(await userDao.selectById(c, userId), 'type');
		const mainAccountRow = requiredRow(await accountService.selectByEmailIncludeDel(c, userRow.email), 'sort');
		const mainSort = mainAccountRow.sort === 0 ? 2 : mainAccountRow.sort + 1;
		await orm(c).update(account).set({ sort: mainSort }).where(eq(account.email, userRow.email )).run();
		await orm(c).update(account).set({ sort: mainSort - 1 }).where(and(eq(account.accountId, boundId(accountId)),eq(account.userId,userId))).run();
	}
};

export default accountService;
