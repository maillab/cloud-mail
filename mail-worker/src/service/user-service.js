import BizError from '../error/biz-error';
import accountService from './account-service';
import orm from '../entity/orm';
import user from '../entity/user';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { emailConst, isDel, roleConst, userConst } from '../const/entity-const';
import kvConst from '../const/kv-const';
import KvConst from '../const/kv-const';
import cryptoUtils from '../utils/crypto-utils';
import emailService from './email-service';
import dayjs from 'dayjs';
import permService from './perm-service';
import roleService from './role-service';
import emailUtils from '../utils/email-utils';
import saltHashUtils from '../utils/crypto-utils';
import constant from '../const/constant';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import {oauth} from "../entity/oauth";
import oauthService from './oauth-service';
import { normalizeEmail, toId, toIdList, toInteger, toPageNumber, toPageSize } from '../utils/input-utils';

function isAdminEmail(c, email) {
	return typeof c.env?.admin === 'string' && typeof email === 'string'
		&& email.toLowerCase() === c.env.admin.toLowerCase();
}

async function assertMutableUser(c, userId) {
	const row = await userService.selectByIdIncludeDel(c, userId);
	if (!row) throw new BizError(t('notExistUser'), 404);
	if (isAdminEmail(c, row.email)) throw new BizError('系统管理员账户不可执行此操作', 403);
	return row;
}

const userService = {

	async loginUserInfo(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const [account, roleRow, permKeys] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			isAdminEmail(c, userRow.email) ? Promise.resolve(['*']) : permService.userPermKeys(c, userId)
		]);

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.email = userRow.email;
		user.account = account;
		user.name = account?.name || emailUtils.getName(userRow.email);
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;
		user.isAdmin = isAdminEmail(c, userRow.email);

		if (user.isAdmin) {
			user.role = constant.ADMIN_ROLE
			user.type = 0;
		}

		return user;
	},


	async resetPassword(c, params, userId) {
		const password = params?.password;
		if (typeof password !== 'string' || password.length < 6) throw new BizError(t('pwdMinLength'), 400);
		if (password.length > 30) throw new BizError(t('pwdLengthLimit'), 400);
		const { salt, hash } = await cryptoUtils.hashPassword(password, cryptoUtils.iterationsFromEnv(c.env));
		const uid = toId(userId, 'userId');
		await this.updatePasswordHash(c, uid, hash, salt);
		await c.env.kv.delete(KvConst.AUTH_INFO + uid);
	},

	async updatePasswordHash(c, userId, hash, salt) {
		await orm(c).update(user).set({ password: hash, salt }).where(eq(user.userId, userId)).run();
	},

	async rollbackCreate(c, userId) {
		await orm(c).delete(user).where(eq(user.userId, toId(userId, 'userId'))).run();
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
	},

	selectByEmail(c, email) {
		return orm(c).select().from(user).where(
			and(
				eq(user.email, email),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		const { userId } = await orm(c).insert(user).values({ ...params }).returning().get();
		return userId;
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(user).where(sql`${user.email} COLLATE NOCASE = ${email}`).get();
	},

	selectByIdIncludeDel(c, userId) {
		return orm(c).select().from(user).where(eq(user.userId, userId)).get();
	},

	selectById(c, userId) {
		return orm(c).select().from(user).where(
			and(
				eq(user.userId, userId),
				eq(user.isDel, isDel.NORMAL)))
			.get();
	},

	async delete(c, userId) {
		const uid = toId(userId, 'userId');
		await assertMutableUser(c, uid);
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, uid)).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + uid);
	},

	async physicsDelete(c, params) {
		const userIds = toIdList(params?.userIds, { name: 'userIds', maxItems: 200 });
		for (const userId of userIds) await assertMutableUser(c, userId);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await oauthService.deleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
		await Promise.all(userIds.map(userId => c.env.kv.delete(KvConst.AUTH_INFO + userId)));
	},

	async list(c, params) {

		let { email } = params;
		const size = toPageSize(params.size, { defaultValue: 20, max: 50 });
		const page = toPageNumber(params.num);
		const num = (page - 1) * size;
		const timeSort = toInteger(params.timeSort, { defaultValue: 0, min: 0, max: 1 });
		const status = toInteger(params.status, { defaultValue: -1, min: -1, max: 1 });
		params.isDel = toInteger(params.isDel, { defaultValue: 0, min: 0, max: 1 });
		if (typeof email === 'string') email = email.trim().slice(0, 254);

		const conditions = [];

		if (status > -1) {
			conditions.push(eq(user.status, status));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${'%'+ email + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, params.isDel));
		}


		const query = orm(c).select({
			userId: user.userId,
			email: user.email,
			type: user.type,
			status: user.status,
			createTime: user.createTime,
			activeTime: user.activeTime,
			createIp: user.createIp,
			activeIp: user.activeIp,
			os: user.os,
			browser: user.browser,
			device: user.device,
			sort: user.sort,
			sendCount: user.sendCount,
			regKeyId: user.regKeyId,
			isDel: user.isDel,
			username: oauth.username,
			trustLevel: oauth.trustLevel,
			avatar: oauth.avatar,
			name: oauth.name
		}).from(user).leftJoin(oauth, eq(oauth.userId, user.userId))
			.where(and(...conditions));


		if (timeSort) {
			query.orderBy(asc(user.userId));
		} else {
			query.orderBy(desc(user.userId));
		}

		const list = await query.limit(size).offset(num);

		const { total } = await orm(c)
			.select({ total: count() })
			.from(user)
			.where(and(...conditions)).get();
		const userIds = list.map(user => user.userId);

		const types = [...new Set(list.map(user => user.type))];

		const [emailCounts, delEmailCounts, sendCounts, delSendCounts, accountCounts, delAccountCounts, roleList] = await Promise.all([
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.RECEIVE, isDel.DELETE),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND),
			emailService.selectUserEmailCountList(c, userIds, emailConst.type.SEND, isDel.DELETE),
			accountService.selectUserAccountCountList(c, userIds),
			accountService.selectUserAccountCountList(c, userIds, isDel.DELETE),
			roleService.selectByIdsHasPermKey(c, types,'email:send')
		]);

		const receiveMap = Object.fromEntries(emailCounts.map(item => [item.userId, item.count]));
		const sendMap = Object.fromEntries(sendCounts.map(item => [item.userId, item.count]));
		const accountMap = Object.fromEntries(accountCounts.map(item => [item.userId, item.count]));

		const delReceiveMap = Object.fromEntries(delEmailCounts.map(item => [item.userId, item.count]));
		const delSendMap = Object.fromEntries(delSendCounts.map(item => [item.userId, item.count]));
		const delAccountMap = Object.fromEntries(delAccountCounts.map(item => [item.userId, item.count]));

		for (const user of list) {

			const userId = user.userId;

			user.receiveEmailCount = receiveMap[userId] || 0;
			user.sendEmailCount = sendMap[userId] || 0;
			user.accountCount = accountMap[userId] || 0;

			user.delReceiveEmailCount = delReceiveMap[userId] || 0;
			user.delSendEmailCount = delSendMap[userId] || 0;
			user.delAccountCount = delAccountMap[userId] || 0;

			const roleIndex = roleList.findIndex(roleRow => user.type === roleRow.roleId);
			let sendAction = {};

			if (roleIndex > -1) {
				sendAction.sendType = roleList[roleIndex].sendType;
				sendAction.sendCount = roleList[roleIndex].sendCount;
				sendAction.hasPerm = true;
			} else {
				sendAction.hasPerm = false;
			}

			if (isAdminEmail(c, user.email)) {
				sendAction.sendType = constant.ADMIN_ROLE.sendType;
				sendAction.sendCount = constant.ADMIN_ROLE.sendCount;
				sendAction.hasPerm = true;
				user.type = 0
			}

			user.sendAction = sendAction;
		}

		return { list, total };
	},

	async updateUserInfo(c, userId, recordCreateIp = false) {



		const activeIp = reqUtils.getIp(c);

		const {os, browser, device} = reqUtils.getUserAgent(c);

		const params = {
			os,
			browser,
			device,
			activeIp,
			activeTime: dayjs().format('YYYY-MM-DD HH:mm:ss')
		};

		if (recordCreateIp) {
			params.createIp = activeIp;
		}

		await orm(c)
			.update(user)
			.set(params)
			.where(eq(user.userId, userId))
			.run();
	},

	async setPwd(c, params) {

		const userId = toId(params?.userId, 'userId');
		await assertMutableUser(c, userId);
		await this.resetPassword(c, { password: params?.password }, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
	},

	async setStatus(c, params) {

		const userId = toId(params?.userId, 'userId');
		const status = toInteger(params?.status, { name: 'status', required: true, min: 0, max: 1 });
		await assertMutableUser(c, userId);

		await orm(c)
			.update(user)
			.set({ status })
			.where(eq(user.userId, userId))
			.run();

		if (status === userConst.status.BAN) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
		}
	},

	async setType(c, params) {

		const userId = toId(params?.userId, 'userId');
		const type = toId(params?.type, 'type');
		await assertMutableUser(c, userId);

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);

	},

	async incrUserSendCount(c, quantity, userId) {
		await orm(c).update(user).set({
			sendCount: sql`${user.sendCount}
	  +
	  ${quantity}`
		}).where(eq(user.userId, userId)).run();
	},

	async updateAllUserType(c, type, curType) {
		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.type, curType))
			.run();
	},

	async add(c, params = {}) {
		const email = normalizeEmail(params.email);
		const type = toId(params.type, 'type');
		const password = params.password;
		if (typeof password !== 'string' || password.length < 6) throw new BizError(t('pwdMinLength'), 400);
		if (password.length > 30) throw new BizError(t('pwdLengthLimit'), 400);

		const configuredDomains = Array.isArray(c.env.domain)
			? c.env.domain
			: (() => { try { return JSON.parse(c.env.domain || '[]'); } catch { return []; } })();
		if (!configuredDomains.map(item => String(item).toLowerCase()).includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		const [accountRow, role] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, email),
			roleService.selectById(c, type)
		]);
		if (accountRow?.isDel === isDel.DELETE) throw new BizError(t('isDelUser'));
		if (accountRow) throw new BizError(t('isRegAccount'), 409);
		if (!role) throw new BizError(t('roleNotExist'));
		if (!roleService.hasAvailDomainPerm(role.availDomain, email)) throw new BizError(t('noDomainPermAdd'), 403);

		const { salt, hash } = await saltHashUtils.hashPassword(password, saltHashUtils.iterationsFromEnv(c.env));
		const userId = await this.insert(c, { email, password: hash, salt, type });
		try {
			await accountService.insert(c, { userId, email, name: emailUtils.getName(email) });
		} catch (error) {
			await this.rollbackCreate(c, userId);
			throw error;
		}
		await this.updateUserInfo(c, userId, true);
	},

	async resetDaySendCount(c) {
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		if (roleIds.length === 0) return;
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(user.type, roleIds)).run();
	},

	async resetSendCount(c, params) {
		const userId = toId(params?.userId, 'userId');
		await assertMutableUser(c, userId);
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, userId)).run();
	},

	async restore(c, params) {
		const userId = toId(params?.userId, 'userId');
		const type = toInteger(params?.type, { defaultValue: 0, min: 0, max: 1 });
		await assertMutableUser(c, userId);
		await orm(c)
			.update(user)
			.set({ isDel: isDel.NORMAL })
			.where(eq(user.userId, userId))
			.run();
		const userRow = await this.selectById(c, userId);
		await accountService.restoreByEmail(c, userRow.email);

		if (type) {
			await emailService.restoreByUserId(c, userId);
			await accountService.restoreByUserId(c, userId);
		}

	},

	listByRegKeyId(c, regKeyId) {
		return orm(c)
			.select({email: user.email,createTime: user.createTime})
			.from(user)
			.where(eq(user.regKeyId, regKeyId))
			.orderBy(desc(user.userId))
			.all();
	}
};

export default userService;
