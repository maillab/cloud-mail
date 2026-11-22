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
import securityService from './security-service';
import preAuthService from '../security/preauth';
import totpUtils from '../utils/totp-utils';

// MFA brute-force budget. A six-digit TOTP has 1,000,000 combinations, so a
// per-member attempt cap in KV blocks sustained guessing. The counter expires.
const MFA_MAX_ATTEMPTS = 5;
const MFA_WINDOW_SECONDS = 300;

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

		let consumedCode = null
		const usingRegKey = regKey !== settingConst.regKey.CLOSE && type

		if (usingRegKey && !await regKeyService.consumeCount(c, code)) {
			if (regKey === settingConst.regKey.OPEN) {
				throw new BizError(t('noRegKeyCount'))
			}
			type = null
			regKeyId = 0
			defType = await this.useDefaultRole(c, email)
		}

		if (usingRegKey && type) {
			consumedCode = code
		}

		let userId

		try {
			userId = await userService.insert(c, { email, regKeyId, password: hash, salt, type: type || defType });
			await accountService.insert(c, { userId: userId, email, name: emailUtils.getName(email) });
		} catch (error) {
			if (consumedCode) {
				await regKeyService.restoreCount(c, consumedCode)
			}
			throw error
		}

		await userService.updateUserInfo(c, userId, true);

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

		if (!toUtc(regKeyRow.expireTime).isAfter(toUtc())) {
			throw new BizError(t('regKeyExpire'));
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async useDefaultRole(c, email) {
		const defaultRole = await roleService.selectDefaultRole(c)
		if (!roleService.hasAvailDomainPerm(defaultRole.availDomain, email)) {
			throw new BizError(t('noDomainPermReg'), 403)
		}
		return defaultRole.roleId
	},

	async handleOpenOptional(c, regKey, code) {

		if (!code) {
			return null
		}

		const regKeyRow = await regKeyService.selectByCode(c, code);

		if (!regKeyRow) {
			return null
		}

		if (regKeyRow.count <= 0 || !toUtc(regKeyRow.expireTime).isAfter(toUtc())) {
			return null
		}

		return { type: regKeyRow.roleId, regKeyId: regKeyRow.regKeyId };
	},

	async login(c, params, noVerifyPwd = false) {

		const { email, password, code, recoveryCode } = params;

		if ((!email || !password) && !noVerifyPwd) {
			throw new BizError(t('emailAndPwdEmpty'));
		}

		const userRow = await userService.selectByEmailIncludeDel(c, email);

		if (!userRow) {
			await this.recordFailure(c, email, 'Unknown account');
			throw new BizError(t('notExistUser'));
		}

		if(userRow.isDel === isDel.DELETE) {
			await this.recordFailure(c, email, 'Account is archived');
			throw new BizError(t('isDelUser'));
		}

		if(userRow.status === userConst.status.BAN) {
			await this.recordFailure(c, email, 'Account is suspended');
			throw new BizError(t('isBanUser'));
		}

		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password) && !noVerifyPwd) {
			await this.recordFailure(c, email, 'Incorrect password');
			throw new BizError(t('IncorrectPwd'));
		}

		// --- Second factor -------------------------------------------------
		// A full session is only issued after the authenticator step. When MFA
		// is enabled and no code was supplied, the server issues a short-lived
		// pre-auth challenge instead of a session. The MFA verify endpoint
		// consumes that challenge and the member's code, so the client never
		// has to re-send the email or password.
		const mfaEnabled = userRow.mfaEnabled === 1;
		let usedRecovery = false;

		if (mfaEnabled && !noVerifyPwd) {
			// If a code was supplied inline (legacy path), verify it now.
			// Otherwise, issue a pre-auth challenge and stop here.
			if (!code && !recoveryCode) {
				const preauth = await preAuthService.issue(c, userRow.userId, 'mfa');
				return {
					preAuthToken: preauth,
					mfaRequired: true,
					mfaEnabled: true,
					onboardingRequired: false,
					// A safe identity hint for the MFA screen; never the secret.
					emailHint: userRow.email
				};
			}

			// Rate-limit: a six-digit code has 1,000,000 combinations, so a
			// modest attempt budget is safe and blocks brute force.
			await this.assertMfaAttemptBudget(c, userRow.userId);

			const secret = await securityService.mfaSecret(c, userRow.userId);

			if (!secret) {
				await this.recordFailure(c, email, 'Authenticator secret unreadable');
				throw new BizError('Your authenticator could not be read. Ask an administrator to reset it.');
			}

			let passed = false;

			if (code && await totpUtils.verifyTotp(secret, code)) {
				passed = true;
			} else if (recoveryCode && await securityService.consumeRecoveryCode(c, userRow.userId, recoveryCode)) {
				passed = true;
				usedRecovery = true;
			}

			if (!passed) {
				await this.recordMfaFailure(c, userRow.userId);
				await securityService.recordEvent(c, {
					userId: userRow.userId,
					email: userRow.email,
					kind: 'mfa',
					outcome: 'failure',
					detail: code ? 'Incorrect authenticator code' : 'Authenticator code required'
				});
				// Re-issue a challenge so the client can retry without re-sending
				// the password. The identity is carried by the challenge token.
				const preauth = await preAuthService.issue(c, userRow.userId, 'mfa');
				throw new BizError('That authenticator code is not valid.', 428, {
					mfaRequired: true,
					mfaEnabled: true,
					preAuthToken: preauth,
					emailHint: userRow.email
				});
			}

			// A correct code clears the attempt budget.
			await this.clearMfaAttempts(c, userRow.userId);

			if (usedRecovery) {
				await securityService.recordEvent(c, {
					userId: userRow.userId,
					email: userRow.email,
					kind: 'recovery',
					outcome: 'success',
					detail: 'Recovery code used to sign in'
				});
			}
		}

		// --- Onboarding ----------------------------------------------------
		// A member who must change their password or has no authenticator yet
		// gets a restricted session. It can reach the onboarding endpoints and
		// nothing else.
		const passwordChangeRequired = userRow.passwordChangeRequired || 'none';
		const needsOnboarding = passwordChangeRequired !== 'none' || !mfaEnabled;
		const scope = needsOnboarding ? 'onboarding' : 'full';

		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c,{ userId: userRow.userId, token: uuid });

		let authInfoRaw = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId);
		let authInfo = authInfoRaw ? JSON.parse(authInfoRaw) : null;

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

		authInfo.scope = scope;
		authInfo.lastLoginAt = dayjs().toISOString();

		await userService.updateUserInfo(c, userRow.userId);

		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });

		await securityService.registerSession(c, { userId: userRow.userId, tokenId: uuid, email: userRow.email });

		await securityService.recordEvent(c, {
			userId: userRow.userId,
			email: userRow.email,
			kind: 'login',
			outcome: 'success',
			detail: mfaEnabled ? 'Signed in with authenticator' : 'Signed in'
		});

		return {
			token: jwt,
			mfaRequired: true,
			mfaEnabled,
			// When the second factor was a recovery code, the member's
			// authenticator may be lost. The client offers a re-enrolment flow
			// so they do not keep spending recovery codes indefinitely.
			usedRecovery,
			reenrollRequired: usedRecovery,
			onboardingRequired: needsOnboarding,
			passwordChangeRequired
		};
	},

	async recordFailure(c, email, detail) {
		await securityService.recordEvent(c, {
			userId: null,
			email,
			kind: 'login',
			outcome: 'failure',
			detail
		});
	},

	// ---------------------------------------------------------------------
	// MFA rate limiting
	//
	// A six-digit TOTP has 1,000,000 combinations, so a per-member attempt
	// budget in KV blocks sustained brute force without ever locking a real
	// member out for long. The counter self-expires.
	// ---------------------------------------------------------------------

	async assertMfaAttemptBudget(c, userId) {
		const key = `mfa:attempts:${userId}`;
		const raw = await c.env.kv.get(key);
		const count = raw ? Number(raw) || 0 : 0;
		if (count >= MFA_MAX_ATTEMPTS) {
			throw new BizError(
				'Too many incorrect codes. Wait a few minutes and try again.',
				429,
				{ retryAfter: MFA_WINDOW_SECONDS }
			);
		}
	},

	async recordMfaFailure(c, userId) {
		const key = `mfa:attempts:${userId}`;
		const raw = await c.env.kv.get(key);
		const count = raw ? Number(raw) || 0 : 0;
		await c.env.kv.put(key, String(count + 1), { expirationTtl: MFA_WINDOW_SECONDS });
	},

	async clearMfaAttempts(c, userId) {
		await c.env.kv.delete(`mfa:attempts:${userId}`);
	},

	// ---------------------------------------------------------------------
	// MFA verify
	//
	// Consumes a pre-auth challenge token (issued after the password stage)
	// plus a TOTP code or recovery code. The member's identity is derived from
	// the challenge server-side, so the client never re-sends the email or
	// password. Returns the same shape as login() on success.
	// ---------------------------------------------------------------------

	async verifyMfa(c, preAuthToken, code, recoveryCode) {
		if (!preAuthToken) {
			throw new BizError('Your sign-in session expired. Please sign in again.', 401, { preAuthExpired: true });
		}

		const userId = await preAuthService.consume(c, preAuthToken);
		if (!userId) {
			throw new BizError('Your sign-in session expired. Please sign in again.', 401, { preAuthExpired: true });
		}

		const userRow = await userService.selectById(c, userId);
		if (!userRow) {
			throw new BizError('Your sign-in session expired. Please sign in again.', 401, { preAuthExpired: true });
		}

		if (userRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelUser'));
		}
		if (userRow.status === userConst.status.BAN) {
			throw new BizError(t('isBanUser'));
		}

		await this.assertMfaAttemptBudget(c, userId);

		const secret = await securityService.mfaSecret(c, userId);
		if (!secret) {
			throw new BizError('Your authenticator could not be read. Ask an administrator to reset it.');
		}

		let usedRecovery = false;
		let passed = false;

		if (code && await totpUtils.verifyTotp(secret, code)) {
			passed = true;
		} else if (recoveryCode && await securityService.consumeRecoveryCode(c, userId, recoveryCode)) {
			passed = true;
			usedRecovery = true;
		}

		if (!passed) {
			await this.recordMfaFailure(c, userId);
			await securityService.recordEvent(c, {
				userId,
				email: userRow.email,
				kind: 'mfa',
				outcome: 'failure',
				detail: code ? 'Incorrect authenticator code' : 'Authenticator code required'
			});
			// Re-issue a challenge so the client can retry without re-sending
			// the password.
			const preauth = await preAuthService.issue(c, userId, 'mfa');
			throw new BizError('That authenticator code is not valid.', 428, {
				mfaRequired: true,
				mfaEnabled: true,
				preAuthToken: preauth,
				emailHint: userRow.email
			});
		}

		await this.clearMfaAttempts(c, userId);

		if (usedRecovery) {
			await securityService.recordEvent(c, {
				userId,
				email: userRow.email,
				kind: 'recovery',
				outcome: 'success',
				detail: 'Recovery code used to sign in'
			});
		}

		// Issue the full session now that MFA is verified.
		return this.issueSession(c, userRow, usedRecovery);
	},

	// Issue a full or onboarding-scope session for a user row. Shared by the
	// password-stage login (no MFA) and the MFA verify endpoint.
	async issueSession(c, userRow, usedRecovery = false) {
		const mfaEnabled = userRow.mfaEnabled === 1;
		const passwordChangeRequired = userRow.passwordChangeRequired || 'none';
		const needsOnboarding = passwordChangeRequired !== 'none' || !mfaEnabled;
		const scope = needsOnboarding ? 'onboarding' : 'full';

		const uuid = uuidv4();
		const jwt = await JwtUtils.generateToken(c, { userId: userRow.userId, token: uuid });

		let authInfoRaw = await c.env.kv.get(KvConst.AUTH_INFO + userRow.userId);
		let authInfo = authInfoRaw ? JSON.parse(authInfoRaw) : null;

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

		authInfo.scope = scope;
		authInfo.lastLoginAt = dayjs().toISOString();

		await userService.updateUserInfo(c, userRow.userId);

		await c.env.kv.put(KvConst.AUTH_INFO + userRow.userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });

		await securityService.registerSession(c, { userId: userRow.userId, tokenId: uuid, email: userRow.email });

		await securityService.recordEvent(c, {
			userId: userRow.userId,
			email: userRow.email,
			kind: 'login',
			outcome: 'success',
			detail: mfaEnabled ? (usedRecovery ? 'Signed in with recovery code' : 'Signed in with authenticator') : 'Signed in'
		});

		return {
			token: jwt,
			mfaRequired: true,
			mfaEnabled,
			usedRecovery,
			reenrollRequired: usedRecovery,
			onboardingRequired: needsOnboarding,
			passwordChangeRequired
		};
	},

	async logout(c, userId) {
		const token = await userContext.getToken(c);
		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
		if (!authInfo) {
			return;
		}
		const index = authInfo.tokens.findIndex(item => item === token);
		if (index > -1) {
			authInfo.tokens.splice(index, 1);
		}
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
		await securityService.touchSession(c, userId, null);
	}

};

export default loginService;
