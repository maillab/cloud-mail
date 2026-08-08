import BizError from '../error/biz-error';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, sql, ne, or, lt, desc, max } from 'drizzle-orm';
import { accountConst, isDel, settingConst } from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import {
	normalizeEmail,
	toId,
	toInteger,
	toPageNumber,
	toPageSize,
	toTrimmedString
} from '../utils/input-utils';

function isAdmin(c, email) {
	return typeof c.env?.admin === 'string' && typeof email === 'string'
		&& email.toLowerCase() === c.env.admin.toLowerCase();
}

const accountService = {
	async add(c, params = {}, userId) {
		const setting = await settingService.query(c);
		const { addEmailVerify, addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = setting;
		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'), 403);
		}

		const email = normalizeEmail(params.email);
		const token = toTrimmedString(params.token, { name: '验证码', max: 4096 });
		const domain = emailUtils.getDomain(email);
		const allowedDomains = (setting.domainList || []).map(item => String(item).replace(/^@/, '').toLowerCase());
		if (!allowedDomains.includes(domain)) throw new BizError(t('notExistDomain'));
		const prefix = emailUtils.getName(email);
		if (prefix.length < Math.max(1, Number(minEmailPrefix) || 1)) {
			throw new BizError(t('minEmailPrefix', { msg: Math.max(1, Number(minEmailPrefix) || 1) }));
		}
		if (prefix.length > 64) throw new BizError(t('emailLengthLimit'));
		if ((Array.isArray(emailPrefixFilter) ? emailPrefixFilter : []).some(value => value && prefix.includes(String(value).toLowerCase()))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let existing = await this.selectByEmailIncludeDel(c, email);
		if (existing?.isDel === isDel.DELETE) throw new BizError(t('isDelAccount'));
		if (existing) throw new BizError(t('isRegAccount'), 409);

		const userRow = await userService.selectById(c, toId(userId, 'userId'));
		if (!userRow) throw new BizError(t('authExpired'), 401);
		const roleRow = await roleService.selectById(c, userRow.type);
		if (!isAdmin(c, userRow.email)) {
			if (!roleRow) throw new BizError(t('roleNotExist'));
			if (Number(roleRow.accountCount) > 0) {
				const currentCount = await this.countUserAccount(c, userId);
				if (currentCount >= Number(roleRow.accountCount)) throw new BizError(t('accountLimit'), 403);
			}
			if (!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) throw new BizError(t('noDomainPermAdd'), 403);
		}

		let addVerifyOpen = false;
		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true;
			await turnstileService.verify(c, token);
		} else if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, Number(addVerifyCount) || 0);
			if (addVerifyOpen) await turnstileService.verify(c, token);
		}

		try {
			existing = await orm(c).insert(account)
				.values({ email, userId, name: prefix })
				.returning()
				.get();
		} catch (error) {
			if (String(error?.message || '').includes('SQLITE_CONSTRAINT')) throw new BizError(t('isRegAccount'), 409);
			throw error;
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = Number(row.count) >= Number(addVerifyCount || 0);
		}
		existing.addVerifyOpen = addVerifyOpen;
		return existing;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${String(email || '').trim()}`).get();
	},

	list(c, params = {}, userId) {
		const accountId = toInteger(params.accountId, { defaultValue: 0, min: 0, max: Number.MAX_SAFE_INTEGER });
		const size = toPageSize(params.size, { defaultValue: 20, max: 30 });
		const lastSort = toInteger(params.lastSort, { defaultValue: 9_999_999_999, min: -9_999_999_999, max: 9_999_999_999 });
		return orm(c).select().from(account).where(
			and(
				eq(account.userId, toId(userId, 'userId')),
				eq(account.isDel, isDel.NORMAL),
				or(
					lt(account.sort, lastSort),
					and(eq(account.sort, lastSort), gt(account.accountId, accountId))
				)
			)
		).orderBy(desc(account.sort), asc(account.accountId)).limit(size).all();
	},

	async delete(c, params, userId) {
		const accountId = toId(params?.accountId, 'accountId');
		const currentUser = await userService.selectById(c, toId(userId, 'userId'));
		const row = await this.selectById(c, accountId);
		if (!currentUser) throw new BizError(t('authExpired'), 401);
		if (!row || row.userId !== currentUser.userId) throw new BizError(t('noUserAccount'), 404);
		if (row.email.toLowerCase() === currentUser.email.toLowerCase()) throw new BizError(t('delMyAccount'));
		await orm(c).update(account).set({ isDel: isDel.DELETE })
			.where(and(eq(account.userId, currentUser.userId), eq(account.accountId, accountId)))
			.run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId), eq(account.isDel, isDel.NORMAL))
		).get();
	},

	async insert(c, params) {
		return orm(c).insert(account).values({ ...params }).returning().get();
	},

	async insertList(c, list) {
		if (!Array.isArray(list) || list.length === 0) return;
		await orm(c).insert(account).values(list).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		if (!Array.isArray(userIds) || userIds.length === 0) return;
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId, userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		if (!Array.isArray(userIds) || userIds.length === 0) return [];
		return orm(c).select({ userId: account.userId, count: count(account.accountId) })
			.from(account)
			.where(and(inArray(account.userId, userIds), eq(account.isDel, del)))
			.groupBy(account.userId);
	},

	async countUserAccount(c, userId) {
		const row = await orm(c).select({ num: count() }).from(account)
			.where(and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL))).get();
		return Number(row?.num || 0);
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({ isDel: isDel.NORMAL }).where(sql`${account.email} COLLATE NOCASE = ${email}`).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({ isDel: isDel.NORMAL }).where(eq(account.userId, userId)).run();
	},

	async setName(c, params, userId) {
		const name = toTrimmedString(params?.name, { name: '名称', max: 30 });
		const accountId = toId(params?.accountId, 'accountId');
		const row = await orm(c).update(account).set({ name })
			.where(and(eq(account.userId, toId(userId, 'userId')), eq(account.accountId, accountId), eq(account.isDel, isDel.NORMAL)))
			.returning()
			.get();
		if (!row) throw new BizError(t('noUserAccount'), 404);
	},

	async allAccount(c, params = {}) {
		const userId = toId(params.userId, 'userId');
		const size = toPageSize(params.size, { defaultValue: 20, max: 30 });
		const page = toPageNumber(params.num);
		const offset = (page - 1) * size;
		const userRow = await userService.selectByIdIncludeDel(c, userId);
		if (!userRow) throw new BizError(t('notExistUser'), 404);
		const condition = and(eq(account.userId, userId), ne(account.email, userRow.email));
		const [list, totalRow] = await Promise.all([
			orm(c).select().from(account).where(condition).limit(size).offset(offset),
			orm(c).select({ total: count() }).from(account).where(condition).get()
		]);
		return { list, total: Number(totalRow?.total || 0) };
	},

	async physicsDelete(c, params = {}) {
		const accountId = toId(params.accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, accountId)).get();
		if (!row) throw new BizError(t('noUserAccount'), 404);
		const owner = await userService.selectByIdIncludeDel(c, row.userId);
		if (!owner) throw new BizError(t('notExistUser'), 404);
		if (row.email.toLowerCase() === owner.email.toLowerCase()) throw new BizError(t('delMyAccount'));
		await emailService.physicsDeleteByAccountId(c, accountId);
		await orm(c).delete(account).where(eq(account.accountId, accountId)).run();
	},

	async setAllReceive(c, params, userId) {
		const accountId = toId(params?.accountId, 'accountId');
		const uid = toId(userId, 'userId');
		const row = await this.selectById(c, accountId);
		if (!row || row.userId !== uid) throw new BizError(t('noUserAccount'), 404);
		const nextValue = row.allReceive ? accountConst.allReceive.CLOSE : 1;
		await c.env.db.batch([
			c.env.db.prepare('UPDATE account SET all_receive = ? WHERE user_id = ?').bind(accountConst.allReceive.CLOSE, uid),
			c.env.db.prepare('UPDATE account SET all_receive = ? WHERE account_id = ? AND user_id = ?').bind(nextValue, accountId, uid)
		]);
		return nextValue;
	},

	async setAsTop(c, params, userId) {
		const accountId = toId(params?.accountId, 'accountId');
		const uid = toId(userId, 'userId');
		const [selected, userRow, maxRow] = await Promise.all([
			this.selectById(c, accountId),
			userService.selectById(c, uid),
			orm(c).select({ value: max(account.sort) }).from(account).where(and(eq(account.userId, uid), eq(account.isDel, isDel.NORMAL))).get()
		]);
		if (!selected || selected.userId !== uid) throw new BizError(t('noUserAccount'), 404);
		if (!userRow) throw new BizError(t('authExpired'), 401);
		const main = await this.selectByEmailIncludeDel(c, userRow.email);
		if (!main || main.userId !== uid) throw new BizError(t('noUserAccount'), 404);
		if (selected.accountId === main.accountId) return;
		const top = Math.max(Number(maxRow?.value || 0), 0) + 2;
		await c.env.db.batch([
			c.env.db.prepare('UPDATE account SET sort = ? WHERE account_id = ? AND user_id = ?').bind(top, main.accountId, uid),
			c.env.db.prepare('UPDATE account SET sort = ? WHERE account_id = ? AND user_id = ?').bind(top - 1, selected.accountId, uid)
		]);
	}
};

export default accountService;
