import type { UserListQuery, AddUserInput, PasswordInput, UserIdInput, NewUser, SendAction, UserListPage } from '../types/user';
import userDao from '../dao/user-dao';
import { boundId } from '../lib/bound-id';
import { requiredRow } from '../lib/required-row';
import type { EnvContext, RequestMetadataContext } from '../types/context';
import type { ScalarId } from '../types/api';
import BizError from '../error/biz-error';
import accountService from './account-service';
import orm from '../entity/orm';
import user from '../entity/user';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { emailConst, isDel, roleConst, settingConst, userConst } from '../const/entity-const';
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
import { tFor } from '../i18n/i18n'
import reqUtils from '../utils/req-utils';
import {oauth} from "../entity/oauth";
import oauthDao from "../dao/oauth-dao";
import settingsReader from './settings-reader';
import starDao from '../dao/star-dao';

const userService = {

	async loginUserInfo(c: EnvContext, userId: ScalarId) {
		const t = tFor(c);

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const [account, roleRow, permKeys] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			userRow.email === c.env.admin ? Promise.resolve(['*']) : permService.userPermKeys(c, userId)
		]);

		const user = {
			userId: userRow.userId, sendCount: userRow.sendCount, email: userRow.email,
			account, name: requiredRow(account, 'name').name, permKeys,
			role: roleRow as typeof roleRow | typeof constant.ADMIN_ROLE, type: userRow.type
		};

		if (c.env.admin === userRow.email) {
			user.role = constant.ADMIN_ROLE
			user.type = 0;
		}

		return user;
	},


	async resetPassword(c: EnvContext, params: PasswordInput, userId: ScalarId) {
		const t = tFor(c);

		const { password } = params;

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		await orm(c).update(user).set({ password: hash, salt: salt }).where(eq(user.userId, boundId(userId))).run();
	},

	selectByEmail: userDao.selectByEmail,

	insert: userDao.insert,

	selectByEmailIncludeDel: userDao.selectByEmailIncludeDel,

	selectByIdIncludeDel: userDao.selectByIdIncludeDel,

	selectById: userDao.selectById,

	async delete(c: EnvContext, userId: ScalarId) {
		const { syncDelete } = await settingsReader.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { userIds: String(userId) });
			await c.env.kv.delete(kvConst.AUTH_INFO + userId)
			return;
		}
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, boundId(userId))).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + userId)
	},

	async physicsDelete(c: EnvContext, params: { userIds: string }) {
		const userIds = params.userIds.split(',').map(Number);
		await starDao.removeByUserIds(c, userIds);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await oauthDao.deleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
	},

	async list(c: EnvContext, params: UserListQuery, _userId?: number): Promise<UserListPage> {

		const { email, status } = params;
		let { num, size, timeSort } = { num: Number(params.num), size: Number(params.size), timeSort: Number(params.timeSort) };

		size = Number(size);
		num = Number(num);
		timeSort = Number(timeSort);
		params.isDel = Number(params.isDel);

		if (isNaN(size)) {
			size = 50;
		}

		if (isNaN(num)) {
			num = 1;
		}

		if (size > 50) {
			size = 50;
		}

		num = (num - 1) * size;

		const conditions = [];

		if (Number(status) > -1) {
			conditions.push(eq(user.status, boundId(status)));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${email + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, boundId(params.isDel)));
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
			name: oauth.name,
			platform: oauth.platform
		}).from(user).leftJoin(oauth, eq(oauth.userId, user.userId))
			.where(and(...conditions));


		if (timeSort) {
			query.orderBy(asc(user.userId));
		} else {
			query.orderBy(desc(user.userId));
		}

		const rows = await query.limit(size).offset(num);

		const { total } = requiredRow(await orm(c)
			.select({ total: count() })
			.from(user)
			.where(and(...conditions)).get(), 'total');
		const userIds = rows.map(user => user.userId);

		const types = [...new Set(rows.map(user => user.type))];

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

		const list = rows.map(user => {
			const userId = user.userId;
			const roleIndex = roleList.findIndex(roleRow => user.type === roleRow.roleId);
			const sendAction: SendAction = { hasPerm: false };

			if (roleIndex > -1) {
				sendAction.sendType = roleList[roleIndex].sendType;
				sendAction.sendCount = roleList[roleIndex].sendCount;
				sendAction.hasPerm = true;
			} else {
				sendAction.hasPerm = false;
			}

			let type = user.type;
			if (user.email === c.env.admin) {
				sendAction.sendType = constant.ADMIN_ROLE.sendType;
				sendAction.sendCount = constant.ADMIN_ROLE.sendCount;
				sendAction.hasPerm = true;
				type = 0;
			}

			return {
				...user,
				type,
				receiveEmailCount: receiveMap[userId] || 0,
				sendEmailCount: sendMap[userId] || 0,
				accountCount: accountMap[userId] || 0,
				delReceiveEmailCount: delReceiveMap[userId] || 0,
				delSendEmailCount: delSendMap[userId] || 0,
				delAccountCount: delAccountMap[userId] || 0,
				sendAction,
			};
		});

		return { list, total };
	},

	async updateUserInfo(c: RequestMetadataContext, userId: ScalarId, recordCreateIp = false) {



		const activeIp = reqUtils.getIp(c);

		const {os, browser, device} = reqUtils.getUserAgent(c);

		const params: Partial<NewUser> = {
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
			.where(eq(user.userId, boundId(userId)))
			.run();
	},

	async setPwd(c: EnvContext, params: PasswordInput & UserIdInput) {

		const { password, userId } = params;
		await this.resetPassword(c, { password }, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
	},

	async setStatus(c: EnvContext, params: UserIdInput & { status: number }) {

		const { status, userId } = params;

		await orm(c)
			.update(user)
			.set({ status })
			.where(eq(user.userId, boundId(userId)))
			.run();

		if (status === userConst.status.BAN) {
			await c.env.kv.delete(KvConst.AUTH_INFO + userId);
		}
	},

	async setType(c: EnvContext, params: UserIdInput & { type: number }) {
		const t = tFor(c);

		const { type, userId } = params;

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, boundId(userId)))
			.run();

	},

	incrUserSendCount: userDao.incrUserSendCount,

	updateAllUserType: userDao.updateAllUserType,

	async add(c: RequestMetadataContext, params: AddUserInput) {
		const t = tFor(c);

		const { email, password } = params;
		let { type } = params;

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		let role;
		if (type === undefined) {
			role = await roleService.selectDefaultRole(c);
			type = role?.roleId;
		} else {
			role = await roleService.selectById(c, type);
		}

		if (!role) {
			throw new BizError(t('roleNotExist'));
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, { email, password: hash, salt, type });

		await userService.updateUserInfo(c, userId, true);

		await accountService.insert(c, { userId: userId, email, type, name: emailUtils.getName(email) });
	},

	async resetDaySendCount(c: EnvContext) {
		// 仅 UTC 0 点执行，便于配合每小时 cron
		if (new Date().getUTCHours() !== 0) {
			return;
		}
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(sql`${user.type}`, roleIds)).run();
	},

	async resetSendCount(c: EnvContext, params: UserIdInput) {
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, boundId(params.userId))).run();
	},

	async restore(c: EnvContext, params: UserIdInput & { type?: number }) {
		const { userId, type } = params
		await orm(c)
			.update(user)
			.set({ isDel: isDel.NORMAL })
			.where(eq(user.userId, boundId(userId)))
			.run();
		const userRow = requiredRow(await this.selectById(c, userId), 'email');
		await accountService.restoreByEmail(c, userRow.email);

		if (type) {
			await emailService.restoreByUserId(c, userId);
			await accountService.restoreByUserId(c, userId);
		}

	},

	listByRegKeyId: userDao.listByRegKeyId
};

export default userService;
