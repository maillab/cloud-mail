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
import scopeService from './scope-service';
import roleService from './role-service';
import emailUtils from '../utils/email-utils';
import saltHashUtils from '../utils/crypto-utils';
import constant from '../const/constant';
import { t } from '../i18n/i18n'
import reqUtils from '../utils/req-utils';
import {oauth} from "../entity/oauth";
import identityService from "./identity-service";
import oauthService from "./oauth-service";
import settingService from './setting-service';
import starService from './star-service';
import signatureService from './signature-service';
import userContext from '../security/user-context';

const userService = {

	async loginUserInfo(c, userId) {

		const userRow = await userService.selectById(c, userId);

		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const [account, roleRow, permKeys, identityRow, dataScope] = await Promise.all([
			accountService.selectByEmailIncludeDel(c, userRow.email),
			roleService.selectById(c, userRow.type),
			permService.userPermKeys(c, userId),
			c.env.db.prepare(
				`SELECT u.display_name, u.username, u.avatar_key, u.job_title, u.phone, u.team_id,
					t.name AS team_name, t.slug AS team_slug
				 FROM user u LEFT JOIN team t ON t.team_id = u.team_id
				 WHERE u.user_id = ?`
			).bind(userId).first(),
			scopeService.resolveScope(c, userId)
		]);
		if (account) {
			account.signatureImageUrl = signatureService.imageUrl(c.req.url, account.signatureImageKey);
			account.signatureText = account.signatureText || '';
			account.signature = account.signature || '';
			account.signatureEnabled = account.signatureEnabled ?? 1;
			account.signatureReplyEnabled = account.signatureReplyEnabled ?? 1;
			delete account.signatureImageKey;
		}

		let signatureSettings = {};
		try {
			signatureSettings = userRow.signatureSettings ? JSON.parse(userRow.signatureSettings) : {};
		} catch {
			signatureSettings = {};
		}

		const user = {};
		user.userId = userRow.userId;
		user.sendCount = userRow.sendCount;
		user.email = userRow.email;
		user.account = account;
		user.name = account?.name || '';
		user.permKeys = permKeys;
		user.role = roleRow;
		user.type = userRow.type;
		user.signature_image_url = signatureService.imageUrl(c.req.url, userRow.signatureImageKey);
		user.signature_delivery_url = signatureService.imageUrl(
			c.req.url,
			userRow.signatureDeliveryKey || userRow.signatureImageKey
		);
		user.signature_text = userRow.signatureText || '';
		user.signature = userRow.signature || '';
		user.signature_settings = {
			enabled: signatureSettings.enabled !== false,
			replyForward: signatureSettings.replyForward !== false,
			defaultAccountId: signatureSettings.defaultAccountId || null
		};

		// Canonical internal identity. This is the single source every module
		// should read for "who is this person": display name and handle exist
		// for local employees, not only for OAuth accounts.
		user.identity = identityService.toIdentity(c, {
			user_id: userRow.userId,
			email: userRow.email,
			display_name: identityRow?.display_name || '',
			username: identityRow?.username || '',
			avatar_key: identityRow?.avatar_key || null,
			job_title: identityRow?.job_title || '',
			phone: identityRow?.phone || ''
		}, {
			team: identityRow?.team_id
				? { team_id: identityRow.team_id, name: identityRow.team_name, slug: identityRow.team_slug }
				: null
		});
		user.identity.initials = identityService.initialsFor(user.identity.displayName || userRow.email);
		if (!user.identity.avatarUrl && userRow.avatarKey) {
			user.identity.avatarUrl = identityService.avatarUrl(c.req.url, userRow.avatarKey);
		}

		user.name = user.identity.displayName || account?.name || '';
		user.username = user.identity.username;
		user.avatar_url = user.identity.avatarUrl;
		// How much company data this employee may see (own/assigned/team/company).
		user.dataScope = dataScope;

		// Security posture. The shell uses this to route a member who still owes
		// setup, and to show the authenticator state on the account surfaces.
		// Only flags and dates travel; the secret never leaves the worker.
		const [activeRecoveryCodes] = await Promise.all([
			c.env.db.prepare(
				`SELECT COUNT(*) as count FROM user_recovery_code WHERE user_id = ? AND used_at IS NULL`
			).bind(userId).first()
		]);
		user.security = {
			mfaEnabled: userRow.mfaEnabled === 1,
			mfaRequired: true,
			mfaEnrolledAt: userRow.mfaEnrolledAt || null,
			recoveryCodeCount: activeRecoveryCodes?.count || 0,
			passwordChangeRequired: userRow.passwordChangeRequired || 'none',
			onboardingComplete: Boolean(userRow.onboardingCompletedAt),
			onboardingRequired: !userRow.onboardingCompletedAt
		};

		if (c.env.admin === userRow.email) {
			user.role = constant.ADMIN_ROLE
			user.type = 0;
		}

		return user;
	},


	async resetPassword(c, params, userId) {

		const { password } = params;

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		await orm(c).update(user).set({ password: hash, salt: salt }).where(eq(user.userId, userId)).run();

		// 个人设置改密：会话列表只留当前 uuid，其它设备下线。管理员改别人密码不走这里。
		if (userContext.getUserId(c) !== userId) {
			return;
		}

		const sessionToken = await userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (!authInfo) {
			return;
		}
		authInfo.tokens = sessionToken ? [sessionToken] : [];
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
	},

	async updateSignature(c, params, userId) {
		const userRow = await this.selectById(c, userId);
		if (!userRow) {
			throw new BizError(t('authExpired'), 401);
		}

		const signatureText = params.signatureText === undefined
			? userRow.signatureText || ''
			: signatureService.normalizeText(params.signatureText);
		const signature = params.signature === undefined
			? userRow.signature || ''
			: signatureService.normalizeHtml(params.signature);
		let signatureSettingsStr = userRow.signatureSettings || '{}';
		if (params.signatureSettings !== undefined) {
			signatureSettingsStr = typeof params.signatureSettings === 'string'
				? params.signatureSettings
				: JSON.stringify(params.signatureSettings);
		}
		const previousKey = userRow.signatureImageKey;
		const previousDeliveryKey = userRow.signatureDeliveryKey;
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
			await orm(c).update(user).set({
				signatureImageKey,
				signatureDeliveryKey,
				signatureText,
				signature,
				signatureSettings: signatureSettingsStr
			})
				.where(eq(user.userId, userId)).run();
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

		return this.loginUserInfo(c, userId);
	},

	selectByEmail(c, email) {
		return orm(c).select().from(user).where(
			and(
				sql`${user.email} COLLATE NOCASE = ${email}`,
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
		const { syncDelete } = await settingService.query(c);
		if (syncDelete === settingConst.syncDelete.OPEN) {
			await this.physicsDelete(c, { userIds: String(userId) });
			await c.env.kv.delete(kvConst.AUTH_INFO + userId)
			return;
		}
		await orm(c).update(user).set({ isDel: isDel.DELETE }).where(eq(user.userId, userId)).run();
		await c.env.kv.delete(kvConst.AUTH_INFO + userId)
	},

	async physicsDelete(c, params) {
		let { userIds } = params;
		userIds = userIds.split(',').map(Number);
		await starService.removeByUserIds(c, userIds);
		await accountService.physicsDeleteByUserIds(c, userIds);
		await oauthService.deleteByUserIds(c, userIds);
		await orm(c).delete(user).where(inArray(user.userId, userIds)).run();
	},

	async list(c, params) {

		let { num, size, email, timeSort, status } = params;

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

		if (status > -1) {
			conditions.push(eq(user.status, status));
			conditions.push(eq(user.isDel, isDel.NORMAL));
		}


		if (email) {
			conditions.push(sql`${user.email} COLLATE NOCASE LIKE ${email + '%'}`);
		}


		if (params.isDel) {
			conditions.push(eq(user.isDel, params.isDel));
		}


		const query = orm(c).select({
			...user,
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

		const list = await query.limit(size).offset(num);
		for (const user of list) {
			delete user.signatureImageKey;
			delete user.signatureText;
			delete user.signature;
		}

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

			if (user.email === c.env.admin) {
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

		const { password, userId } = params;
		await this.resetPassword(c, { password }, userId);
		await c.env.kv.delete(KvConst.AUTH_INFO + userId);
	},

	async setStatus(c, params) {

		const { status, userId } = params;

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

		const { type, userId } = params;

		const roleRow = await roleService.selectById(c, type);

		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		// Capture the previous role first: the change itself is what the access
		// history has to describe, and the row is gone afterwards.
		const current = await orm(c).select({ type: user.type, email: user.email }).from(user).where(eq(user.userId, userId)).get();
		const previousRole = current ? await roleService.selectById(c, current.type) : null;

		await orm(c)
			.update(user)
			.set({ type })
			.where(eq(user.userId, userId))
			.run();

		await roleService.recordAudit(c, {
			roleId: type,
			roleName: roleRow.name,
			actorId: userContext.getUserId(c),
			action: 'member',
			summary: `Changed access for ${current?.email || userId}`,
			detail: `${previousRole ? previousRole.name : 'no role'} -> ${roleRow.name}`
		});

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

	async initAdmin(c) {
		const email = c.env.admin;
		const password = c.env.password;

		if (!email || !password) {
			return;
		}

		const exist = await userService.selectByEmailIncludeDel(c, email);
		if (exist) {
			return;
		}

		const role = await roleService.selectDefaultRole(c);
		const { salt, hash } = await cryptoUtils.hashPassword(password);
		const userId = await userService.insert(c, {
			email,
			password: hash,
			salt,
			type: role?.roleId || 1
		});
		await userService.updateUserInfo(c, userId, true);
		await accountService.insert(c, {
			userId,
			email,
			name: emailUtils.getName(email)
		});
	},

	async add(c, params) {

		let { email, type, password } = params;
		const signatureText = signatureService.normalizeText(params.signatureText);
		const signature = signatureService.normalizeHtml(params.signature);

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

		const userId = await userService.insert(c, { email, password: hash, salt, type, signatureText, signature });
		let signatureImageKey = null;
		try {
			if (params.signatureImageData) {
				signatureImageKey = await signatureService.saveImage(c, userId, params.signatureImageData);
				await orm(c).update(user).set({ signatureImageKey }).where(eq(user.userId, userId)).run();
			}
			await userService.updateUserInfo(c, userId, true);
			await accountService.insert(c, { userId, email, type, name: emailUtils.getName(email) });
		} catch (error) {
			try {
				if (signatureImageKey) {
					await signatureService.deleteImage(c, signatureImageKey);
				}
				await userService.physicsDelete(c, { userIds: String(userId) });
			} catch (cleanupError) {
				console.error('Failed to roll back user creation:', cleanupError);
			}
			throw error;
		}
	},

	async resetDaySendCount(c) {
		// 仅 UTC 0 点执行，便于配合每小时 cron
		if (new Date().getUTCHours() !== 0) {
			return;
		}
		const roleList = await roleService.selectByIdsAndSendType(c, 'email:send', roleConst.sendType.DAY);
		const roleIds = roleList.map(action => action.roleId);
		await orm(c).update(user).set({ sendCount: 0 }).where(inArray(user.type, roleIds)).run();
	},

	async resetSendCount(c, params) {
		await orm(c).update(user).set({ sendCount: 0 }).where(eq(user.userId, params.userId)).run();
	},

	async restore(c, params) {
		const { userId, type } = params
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
