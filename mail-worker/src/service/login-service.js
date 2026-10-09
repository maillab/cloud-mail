import BizError from '../error/biz-error';
import userService from './user-service';
import emailUtils from '../utils/email-utils';
import { isDel, settingConst, userConst } from '../const/entity-const';
import JwtUtils from '../utils/jwt-utils';
import { v4 as uuidv4 } from 'uuid';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import userContext from '../security/user-context';
import verifyUtils from '../utils/verify-utils';
import accountService from './account-service';
import settingService from './setting-service';
import saltHashUtils from '../utils/crypto-utils';
import cryptoUtils from '../utils/crypto-utils';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import regKeyService from './reg-key-service';
import dayjs from 'dayjs';
import { toUtc } from '../utils/date-uitil';
import { t } from '../i18n/i18n.js';
import verifyRecordService from './verify-record-service';
import reqUtils from '../utils/req-utils';
import totpService from './totp-service';

const loginService = {

	async register(c, params, oauth = false) {

		const { email, password, token, code } = params;

		let { regKey, register, registerVerify, regVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c)

		if (oauth) {
			registerVerify = settingConst.registerVerify.CLOSE;
			register = settingConst.register.OPEN;
		}

		if (register === settingConst.register.CLOSE) {
			throw new BizError(t('regDisabled'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content)))  {
			throw new BizError(t('banEmailPrefix'));
		}

		if (emailUtils.getName(email).length > 64) {
			throw new BizError(t('emailLengthLimit'));
		}

		if (password.length > 30) {
			throw new BizError(t('pwdLengthLimit'));
		}

		if (password.length < 6) {
			throw new BizError(t('pwdMinLength'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notEmailDomain'));
		}

		let type = null;
		let regKeyId = 0

		if (regKey === settingConst.regKey.OPEN) {
			const result = await this.handleOpenRegKey(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		if (regKey === settingConst.regKey.OPTIONAL) {
			const result = await this.handleOpenOptional(c, regKey, code)
			type = result?.type
			regKeyId = result?.regKeyId
		}

		const accountRow = await accountService.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		let defType = null

		if (!type) {
			const roleRow = await roleService.selectDefaultRole(c);
			defType = roleRow.roleId
		}


		const roleRow = await roleService.selectById(c, type || defType);

		if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {

			if (type) {
				throw new BizError(t('noDomainPermRegKey'),403)
			}

			if (defType) {
				throw new BizError(t('noDomainPermReg'),403)
			}

		}

		let regVerifyOpen = false

		if (registerVerify === settingConst.registerVerify.OPEN) {
			regVerifyOpen = true
			await turnstileService.verify(c,token)
		}

		if (registerVerify === settingConst.registerVerify.COUNT) {
			regVerifyOpen = await verifyRecordService.isOpenRegVerify(c, regVerifyCount);
			if (regVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}

		const { salt, hash } = await saltHashUtils.hashPassword(password);

		const userId = await userService.insert(c, { email, regKeyId,password: hash, salt, type: type || defType });

		await accountService.insert(c, { userId: userId, email, name: emailUtils.getName(email) });

		await userService.updateUserInfo(c, userId, true);

		if (regKey !== settingConst.regKey.CLOSE && type) {
			await regKeyService.reduceCount(c, code, 1);
		}

		if (registerVerify === settingConst.registerVerify.COUNT && !regVerifyOpen) {
			const row = await verifyRecordService.increaseRegCount(c);
			return {regVerifyOpen: row.count >= regVerifyCount}
		}

		return {regVerifyOpen}

	},

	async registerVerify() {

	},

	async handleOpenRegKey(c, regKey, code) {

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			throw new BizError(t('notExistRegKey'));
		}

		if (regKeyRow.count <= 0) {
			throw new BizError(t('noRegKeyCount'));
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (expireTime.isBefore(today)) {
			throw new BizError(t('regKeyExpire'));
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async handleOpenOptional(c, regKey, code) {

		if (!code) {
			return null
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			return null
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (regKeyRow.count <= 0 || expireTime.isBefore(today)) {
			return null
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async login(c, params, noVerifyPwd = false) {

		const { email, password } = params;

		if ((!email || !password) && !noVerifyPwd) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!userRow) {
			throw new BizError(t('notExistUser'));
		}

		if(userRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}

		if(userRow.status === userConst.status.BAN) {
			throw new BizError(t('isBanUser'));
		}

		// 防爆破：同一 IP + 邮箱 15 分钟内失败 5 次则锁定
		if (!noVerifyPwd) {
			await this.checkLoginRateLimit(c, email);
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password) && !noVerifyPwd) {
			await this.recordLoginFail(c, email);
			throw new BizError(t('IncorrectPwd'));
		}

		if (!noVerifyPwd) {
			await this.clearLoginFail(c, email);
		}

		// 老哈希（单轮 SHA-256）透明升级到 PBKDF2：仅密码登录成功时执行，失败不影响登录
		if (!noVerifyPwd && cryptoUtils.needsRehash(userRow.password)) {
			try {
				await userService.resetPassword(c, { password }, userRow.userId);
			} catch (e) {
				console.warn(`密码哈希升级失败：${e.message}`);
			}
		}

		// TOTP 两步验证：密码登录且已启用 → 返回预授权票据，前端进入第二步验码
		//（passkey / oauth 走 noVerifyPwd，不受影响）
		if (!noVerifyPwd && userRow.totpEnabled) {
			const preAuthToken = uuidv4();
			await c.env.kv.put(KvConst.TOTP_PREAUTH + preAuthToken,
				JSON.stringify({ userId: userRow.userId, attempts: 0 }),
				{ expirationTtl: 300 });
			return { needTotp: true, preAuthToken };
		}

		return await this.finishLogin(c, userRow);
	},

	// 登录第二步：校验预授权票据 + TOTP 码/恢复码，通过后签发正式 JWT
	async verifyTotpLogin(c, params) {
		const { preAuthToken, code, recoveryCode } = params || {};
		const key = KvConst.TOTP_PREAUTH + preAuthToken;
		const pre = await c.env.kv.get(key, { type: 'json' });
		if (!pre) {
			throw new BizError(t('totpPreAuthExpired'));
		}
		if (pre.attempts >= 5) {
			await c.env.kv.delete(key);
			throw new BizError(t('tooManyLoginAttempts'));
		}
		const userRow = await userService.selectById(c, pre.userId);
		if (!userRow || userRow.isDel === isDel.DELETE || userRow.status === userConst.status.BAN) {
			await c.env.kv.delete(key);
			throw new BizError(t('authExpired'));
		}
		let ok = false;
		if (recoveryCode) {
			ok = await totpService.useRecoveryCode(c, userRow.userId, recoveryCode);
		} else {
			ok = await totpService.verifyCode(c, userRow.userId, code);
		}
		if (!ok) {
			pre.attempts += 1;
			await c.env.kv.put(key, JSON.stringify(pre), { expirationTtl: 300 });
			throw new BizError(t('totpCodeInvalid'));
		}
		await c.env.kv.delete(key);
		return await this.finishLogin(c, userRow);
	},

	// 签发 JWT + 会话落 KV（密码登录 / TOTP 第二步 / passkey / oauth 共用）
	async finishLogin(c, userRow) {
		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c,{ userId: userRow.userId, token: uuid });

		let authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId, { type: 'json' });

		if (authInfo && (authInfo.user.email === userRow.email)) {

			if (authInfo.tokens.length > 10) {
				authInfo.tokens.shift();
			}

			authInfo.tokens.push(uuid);

		} else {

			authInfo = {
				tokens: [],
				user: userRow,
				refreshTime: dayjs().toISOString()
			};

			authInfo.tokens.push(uuid);

		}

		await userService.updateUserInfo(c, userRow.userId);

		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		return jwt;
	},

	async verifyPassword(c, params) {

		const { password } = params;

		const userRow = await userService.selectById(c, userContext.getUserId(c));

		if (!userRow || !password || !await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) {
			throw new BizError(t('IncorrectPwd'));
		}
	},

	// 登录防爆破：按 IP + 邮箱计数，15 分钟内失败 5 次锁定
	loginFailKey(c, email) {
		return KvConst.LOGIN_FAIL + reqUtils.getIp(c) + ':' + String(email || '').toLowerCase();
	},

	async checkLoginRateLimit(c, email) {
		const count = parseInt(await c.env.kv.get(this.loginFailKey(c, email)) || '0', 10);
		if (count >= 5) {
			throw new BizError(t('tooManyLoginAttempts'));
		}
	},

	async recordLoginFail(c, email) {
		const key = this.loginFailKey(c, email);
		const count = parseInt(await c.env.kv.get(key) || '0', 10) + 1;
		await c.env.kv.put(key, String(count), { expirationTtl: 900 });
	},

	async clearLoginFail(c, email) {
		await c.env.kv.delete(this.loginFailKey(c, email));
	},

	async logout(c, userId) {
		const token =userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		const index = authInfo.tokens.findIndex(item => item === token);
		authInfo.tokens.splice(index, 1);
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo));
	}

};

export default loginService;
