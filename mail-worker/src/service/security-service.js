import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import dayjs from 'dayjs';
import { eq } from 'drizzle-orm';
import orm from '../entity/orm';
import user from '../entity/user';
import KvConst from '../const/kv-const';
import constant from '../const/constant';
import { userConst } from '../const/entity-const';
import reqUtils from '../utils/req-utils';
import userService from './user-service';
import {
	buildOtpAuthUri,
	formatSecretForManualEntry,
	generateSecret,
	isValidSecret,
	verifyTotp
} from '../utils/totp-utils';
import {
	decryptSecret,
	encryptSecret,
	generateRecoveryCodes,
	hashToken
} from '../utils/security-crypto';

// How long an invitation or an unused temporary credential stays valid.
const INVITE_TTL_DAYS = 7;

// Recovery codes are shown to the member as groups of five characters, but the
// member may type them back in lower case, with spaces, or without the hyphen.
// Both sides hash the same normalised form.
function normalizeRecoveryCode(value) {
	return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

const securityService = {

	// ---------------------------------------------------------------------
	// Encryption
	// ---------------------------------------------------------------------

	secretKey(c) {
		return c.env.jwt_secret;
	},

	async encrypt(c, plaintext) {
		return encryptSecret(plaintext, this.secretKey(c));
	},

	async decrypt(c, payload) {
		if (!payload) return null;
		try {
			return await decryptSecret(payload, this.secretKey(c));
		} catch (error) {
			// A value that cannot be decrypted was written under a different
			// deployment key. Treat it as absent so the member is asked to
			// enrol again rather than being locked out silently.
			console.error('Failed to decrypt stored secret', error);
			return null;
		}
	},

	// ---------------------------------------------------------------------
	// Account security state
	// ---------------------------------------------------------------------

	async state(c, userId) {
		const row = await orm(c).select().from(user).where(eq(user.userId, userId)).get();
		if (!row) {
			throw new BizError(t('authExpired'), 401);
		}

		const [activeCodes, sessionCount, pendingInvite] = await Promise.all([
			c.env.db.prepare(
				`SELECT COUNT(*) as count FROM user_recovery_code WHERE user_id = ? AND used_at IS NULL`
			).bind(userId).first(),
			c.env.db.prepare(
				`SELECT COUNT(*) as count FROM user_session WHERE user_id = ? AND revoked_at IS NULL`
			).bind(userId).first(),
			c.env.db.prepare(
				`SELECT id, expires_at FROM invitation WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`
			).bind(userId).first()
		]);

		const mfaRequired = await this.isMfaRequired(c);
		const mfaEnrolled = row.mfaEnabled === 1;

		return {
			mfaEnabled: mfaEnrolled,
			mfaRequired,
			mfaEnrolledAt: row.mfaEnrolledAt || null,
			recoveryCodeCount: activeCodes?.count || 0,
			recoveryGeneratedAt: row.mfaRecoveryGeneratedAt || null,
			passwordChangeRequired: row.passwordChangeRequired || 'none',
			passwordChangedAt: row.passwordChangedAt || null,
			onboardingCompletedAt: row.onboardingCompletedAt || null,
			activeSessionCount: sessionCount?.count || 0,
			hasPendingInvitation: Boolean(pendingInvite),
			invitationExpiresAt: pendingInvite?.expires_at || null,
			// The member cannot finish onboarding until these are all true.
			onboardingComplete: !mfaRequired || (mfaEnrolled && row.passwordChangeRequired !== 'login')
		};
	},

	async isMfaRequired() {
		// XPass policy: an authenticator is mandatory for every member. The
		// company-level toggle lives in settings but defaults to required, and
		// the backend treats it as required unless an administrator has
		// explicitly turned it off.
		return true;
	},

	async mfaSecret(c, userId) {
		const row = await orm(c).select({ mfaSecretEnc: user.mfaSecretEnc }).from(user)
			.where(eq(user.userId, userId)).get();
		if (!row?.mfaSecretEnc) return null;
		return this.decrypt(c, row.mfaSecretEnc);
	},

	async hasMfa(c, userId) {
		return Boolean(await this.mfaSecret(c, userId));
	},

	// ---------------------------------------------------------------------
	// Enrolment (self service, during onboarding or from Security settings)
	// ---------------------------------------------------------------------

	async beginEnrolment(c, userId, email) {
		const existing = await this.mfaSecret(c, userId);
		if (existing) {
			// Re-enrolment must be deliberate: a fresh secret invalidates the
			// member's current authenticator. The caller shows the new secret
			// and requires a code before the old one stops working.
			throw new BizError('An authenticator is already enrolled. Remove it before enrolling a new one.', 409);
		}

		const secret = generateSecret(20);
		const uri = buildOtpAuthUri(secret, email);

		await orm(c).update(user).set({
			mfaSecretEnc: await this.encrypt(c, secret)
		}).where(eq(user.userId, userId)).run();

		return {
			secret,
			manualKey: formatSecretForManualEntry(secret),
			otpauthUri: uri
		};
	},

	async confirmEnrolment(c, userId, params) {
		const { code } = params;
		const secret = await this.mfaSecret(c, userId);
		if (!secret) {
			throw new BizError('Start authenticator setup first.', 409);
		}
		if (!await verifyTotp(secret, code)) {
			await this.recordEvent(c, {
				userId,
				email: params.email || '',
				kind: 'mfa',
				outcome: 'failure',
				detail: 'Incorrect authenticator code during enrolment'
			});
			throw new BizError('That code is not valid. Check your authenticator and try again.');
		}

		const codes = await this.regenerateRecoveryCodes(c, userId);

		await orm(c).update(user).set({
			mfaEnabled: 1,
			mfaEnrolledAt: dayjs().format('YYYY-MM-DD HH:mm:ss'),
			mfaRecoveryGeneratedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(user.userId, userId)).run();

		await this.recordEvent(c, {
			userId,
			email: params.email || '',
			kind: 'mfa',
			outcome: 'success',
			detail: 'Authenticator enrolled'
		});

		return { recoveryCodes: codes };
	},

	async removeEnrolment(c, userId, params) {
		const secret = await this.mfaSecret(c, userId);
		if (!secret) {
			throw new BizError('There is no authenticator to remove.');
		}
		if (!await verifyTotp(secret, params.code)) {
			await this.recordEvent(c, {
				userId,
				email: params.email || '',
				kind: 'mfa',
				outcome: 'failure',
				detail: 'Incorrect authenticator code while removing enrolment'
			});
			throw new BizError('That code is not valid.');
		}

		await orm(c).update(user).set({
			mfaEnabled: 0,
			mfaSecretEnc: null,
			mfaEnrolledAt: null
		}).where(eq(user.userId, userId)).run();

		await c.env.db.prepare(`DELETE FROM user_recovery_code WHERE user_id = ?`).bind(userId).run();

		await this.recordEvent(c, {
			userId,
			email: params.email || '',
			kind: 'mfa',
			outcome: 'success',
			detail: 'Authenticator removed'
		});
	},

	// ---------------------------------------------------------------------
	// Recovery codes
	// ---------------------------------------------------------------------

	async regenerateRecoveryCodes(c, userId) {
		const plain = await generateRecoveryCodes(10);
		await c.env.db.prepare(`DELETE FROM user_recovery_code WHERE user_id = ?`).bind(userId).run();
		for (const code of plain) {
			// Hashed in the same normalised form the member will type back:
			// case-insensitive, separators ignored. Hashing the formatted value
			// instead would make every code fail at redemption.
			await c.env.db.prepare(
				`INSERT INTO user_recovery_code (user_id, code_hash) VALUES (?, ?)`
			).bind(userId, await hashToken(normalizeRecoveryCode(code))).run();
		}
		return plain;
	},

	async consumeRecoveryCode(c, userId, code) {
		const clean = normalizeRecoveryCode(code);
		if (clean.length < 8) {
			return false;
		}
		const hash = await hashToken(clean);
		// Atomic compare-and-mark: the UPDATE only succeeds if the row is still
		// unused, so two concurrent requests with the same code cannot both win.
		const result = await c.env.db.prepare(
			`UPDATE user_recovery_code SET used_at = CURRENT_TIMESTAMP
			 WHERE user_id = ? AND used_at IS NULL AND code_hash = ?`
		).bind(userId, hash).run();
		return Boolean(result?.meta?.changes) && result.meta.changes > 0;
	},

	async recoveryCodeCount(c, userId) {
		const row = await c.env.db.prepare(
			`SELECT COUNT(*) as count FROM user_recovery_code WHERE user_id = ? AND used_at IS NULL`
		).bind(userId).first();
		return row?.count || 0;
	},

	// ---------------------------------------------------------------------
	// Sign-in history and sessions
	// ---------------------------------------------------------------------

	async recordEvent(c, { userId, email, kind, outcome, detail = '' }) {
		const ip = reqUtils.getIp(c);
		const { os, browser } = reqUtils.getUserAgent(c);
		try {
			await c.env.db.prepare(
				`INSERT INTO user_login_event (user_id, email, kind, outcome, detail, ip, user_agent)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`
			).bind(
				userId || null,
				email || '',
				kind,
				outcome,
				String(detail).slice(0, 500),
				ip || '',
				`${browser || ''} ${os || ''}`.trim()
			).run();
		} catch (error) {
			// History is a convenience, not a gate: never fail a sign-in because
			// the history insert failed.
			console.error('Failed to record login event', error);
		}
	},

	async registerSession(c, { userId, tokenId, email }) {
		const ip = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		await c.env.db.prepare(
			`INSERT INTO user_session (user_id, token_id, device, os, browser, ip, user_agent)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		).bind(
			userId,
			tokenId,
			device || '',
			os || '',
			browser || '',
			ip || '',
			c.req.header('user-agent') || ''
		).run();
	},

	async sessions(c, userId) {
		const rows = await c.env.db.prepare(
			`SELECT id, token_id, device, os, browser, ip, created_at, last_seen_at
			 FROM user_session WHERE user_id = ? AND revoked_at IS NULL
			 ORDER BY created_at DESC`
		).bind(userId).all();
		const currentToken = c.get('currentTokenId') || null;
		return (rows.results || []).map(row => ({
			...row,
			current: row.token_id === currentToken
		}));
	},

	async revokeSession(c, userId, sessionId) {
		await c.env.db.prepare(
			`UPDATE user_session SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'revoked_by_user'
			 WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
		).bind(sessionId, userId).run();
		await this.forgetToken(c, userId, sessionId);
	},

	async revokeOtherSessions(c, userId, keepTokenId) {
		const rows = await c.env.db.prepare(
			`SELECT id, token_id FROM user_session WHERE user_id = ? AND revoked_at IS NULL`
		).bind(userId).all();
		for (const row of rows.results || []) {
			if (row.token_id === keepTokenId) continue;
			await c.env.db.prepare(
				`UPDATE user_session SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'revoked_by_user'
				 WHERE id = ?`
			).bind(row.id).run();
			await this.forgetToken(c, userId, row.token_id);
		}
	},

	async revokeAllSessions(c, userId, reason = 'revoked_by_user') {
		const rows = await c.env.db.prepare(
			`SELECT id, token_id FROM user_session WHERE user_id = ? AND revoked_at IS NULL`
		).bind(userId).all();
		for (const row of rows.results || []) {
			await c.env.db.prepare(
				`UPDATE user_session SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = ? WHERE id = ?`
			).bind(reason, row.id).run();
			await this.forgetToken(c, userId, row.token_id);
		}
	},

	// Drop a single token from the KV session record. Used when one device is
	// signed out without touching the others.
	async forgetToken(c, userId, tokenId) {
		if (!tokenId) return;
		try {
			const raw = await c.env.kv.get(KvConst.AUTH_INFO + userId);
			if (!raw) return;
			const authInfo = JSON.parse(raw);
			const index = authInfo.tokens.findIndex(item => item === tokenId);
			if (index > -1) {
				authInfo.tokens.splice(index, 1);
				await c.env.kv.put(
					KvConst.AUTH_INFO + userId,
					JSON.stringify(authInfo),
					{ expirationTtl: constant.TOKEN_EXPIRE }
				);
			}
		} catch (error) {
			console.error('Failed to forget session token', error);
		}
	},

	async loginHistory(c, userId, limit = 50) {
		const rows = await c.env.db.prepare(
			`SELECT id, kind, outcome, detail, ip, user_agent, create_time
			 FROM user_login_event WHERE user_id = ? ORDER BY id DESC LIMIT ?`
		).bind(userId, Math.min(Number(limit) || 50, 200)).all();
		return rows.results || [];
	},

	async memberLoginHistory(c, userId, limit = 50) {
		const rows = await c.env.db.prepare(
			`SELECT id, kind, outcome, detail, ip, create_time
			 FROM user_login_event WHERE user_id = ? ORDER BY id DESC LIMIT ?`
		).bind(userId, Math.min(Number(limit) || 50, 200)).all();
		return rows.results || [];
	},

	async memberSessions(c, userId) {
		const rows = await c.env.db.prepare(
			`SELECT id, device, os, browser, ip, created_at, last_seen_at
			 FROM user_session WHERE user_id = ? AND revoked_at IS NULL
			 ORDER BY created_at DESC`
		).bind(userId).all();
		return rows.results || [];
	},

	// ---------------------------------------------------------------------
	// Password
	// ---------------------------------------------------------------------

	async changePassword(c, userId, params) {
		const { currentPassword, newPassword } = params;

		const row = await orm(c).select().from(user).where(eq(user.userId, userId)).get();
		if (!row) {
			throw new BizError(t('authExpired'), 401);
		}

		const cryptoUtils = (await import('../utils/crypto-utils')).default;
		if (!await cryptoUtils.verifyPassword(currentPassword, row.salt, row.password)) {
			throw new BizError('Your current password is not correct.');
		}

		await this.adoptPassword(c, userId, newPassword);
		// A password change invalidates every other session: a stolen token
		// must not survive the owner regaining control of the account.
		await this.revokeAllSessions(c, userId, 'password_changed');
	},

	async adoptPassword(c, userId, newPassword) {
		if (!newPassword || newPassword.length < 10) {
			throw new BizError('Choose a password with at least 10 characters.');
		}
		if (newPassword.length > 200) {
			throw new BizError('That password is too long.');
		}
		const cryptoUtils = (await import('../utils/crypto-utils')).default;
		const { salt, hash } = await cryptoUtils.hashPassword(newPassword);
		await orm(c).update(user).set({
			password: hash,
			salt,
			passwordChangeRequired: 'none',
			passwordChangedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(user.userId, userId)).run();

		await this.recordEvent(c, {
			userId,
			email: '',
			kind: 'password',
			outcome: 'success',
			detail: 'Password changed'
		});
	},

	// ---------------------------------------------------------------------
	// Administrative actions on another member
	// ---------------------------------------------------------------------

	async adminResetPassword(c, targetUserId, params) {
		const tempPassword = params.password || null;
		if (tempPassword && (tempPassword.length < 10 || tempPassword.length > 200)) {
			throw new BizError('A temporary password must be between 10 and 200 characters.');
		}
		const cryptoUtils = (await import('../utils/crypto-utils')).default;
		const { salt, hash } = await cryptoUtils.hashPassword(tempPassword || (await cryptoUtils.genRandomPwd(16)));
		await orm(c).update(user).set({
			password: hash,
			salt,
			passwordChangeRequired: 'admin',
			passwordChangedAt: null
		}).where(eq(user.userId, targetUserId)).run();

		await this.revokeAllSessions(c, targetUserId, 'password_reset_by_admin');
		await this.recordEvent(c, {
			userId: targetUserId,
			email: params.email || '',
			kind: 'password',
			outcome: 'success',
			detail: 'Password reset by administrator'
		});
		return tempPassword;
	},

	async adminResetMfa(c, targetUserId, params) {
		await orm(c).update(user).set({
			mfaEnabled: 0,
			mfaSecretEnc: null,
			mfaEnrolledAt: null,
			mfaRecoveryGeneratedAt: null,
			passwordChangeRequired: params.forcePasswordChange === false ? 'none' : 'login'
		}).where(eq(user.userId, targetUserId)).run();

		await c.env.db.prepare(`DELETE FROM user_recovery_code WHERE user_id = ?`).bind(targetUserId).run();
		await this.revokeAllSessions(c, targetUserId, 'mfa_reset_by_admin');
		await this.recordEvent(c, {
			userId: targetUserId,
			email: params.email || '',
			kind: 'mfa',
			outcome: 'success',
			detail: `Authenticator reset by administrator. Reason: ${params.reason || 'not given'}`
		});
	},

	async markOnboardingComplete(c, userId, tokenId) {
		await orm(c).update(user).set({
			onboardingCompletedAt: dayjs().format('YYYY-MM-DD HH:mm:ss')
		}).where(eq(user.userId, userId)).run();

		// The session that finished onboarding must become a normal session, or
		// the member would be stuck behind the onboarding gate with a token that
		// can no longer reach the product.
		try {
			const raw = await c.env.kv.get(KvConst.AUTH_INFO + userId);
			if (raw) {
				const authInfo = JSON.parse(raw);
				authInfo.scope = 'full';
				if (tokenId) {
					const index = authInfo.tokens.findIndex(item => item === tokenId);
					if (index === -1) authInfo.tokens.push(tokenId);
				}
				authInfo.onboardingCompletedAt = dayjs().toISOString();
				await c.env.kv.put(
					KvConst.AUTH_INFO + userId,
					JSON.stringify(authInfo),
					{ expirationTtl: constant.TOKEN_EXPIRE }
				);
			}
		} catch (error) {
			// A KV failure must not block onboarding: the member simply signs in
			// again, which issues a full-scope session.
			console.error('Failed to upgrade onboarding session scope', error);
		}
	},

	async touchSession(c, userId, tokenId) {
		try {
			await c.env.db.prepare(
				`UPDATE user_session SET last_seen_at = CURRENT_TIMESTAMP WHERE token_id = ?`
			).bind(tokenId).run();
		} catch (error) {
			// Non-critical bookkeeping.
		}
	},

	// Refuse a security reset that would leave the company with no recovery
	// administrator. This is a last-line guard, not a policy replacement: the
	// real check is that the caller holds user:reset-mfa.
	async assertNotLastSecurityAdmin(c, targetUserId) {
		const target = await userService.selectById(c, targetUserId);
		if (!target || target.type !== 0) {
			// Only administrator-type accounts are counted as security admins.
			return;
		}
		const adminCount = await c.env.db.prepare(
			`SELECT COUNT(*) as count FROM user WHERE type = 0 AND (is_del IS NULL OR is_del = 0) AND status != ?`
		).bind(userConst.status.BAN).first();
		const remaining = (adminCount?.count || 0) - 1;
		if (remaining < 1) {
			throw new BizError(
				'This is the last administrator account. Add another administrator before resetting this one.'
			);
		}
	},

	async touchSession(c, userId, tokenId) {
		try {
			await c.env.db.prepare(
				`UPDATE user_session SET last_seen_at = CURRENT_TIMESTAMP WHERE token_id = ?`
			).bind(tokenId).run();
		} catch (error) {
			// Non-critical bookkeeping.
		}
	},

	async isSessionRevoked(c, userId, tokenId) {
		const row = await c.env.db.prepare(
			`SELECT id FROM user_session WHERE token_id = ? AND revoked_at IS NOT NULL LIMIT 1`
		).bind(tokenId).first();
		return Boolean(row);
	},

	// ---------------------------------------------------------------------
	// Invitations
	// ---------------------------------------------------------------------

	async createInvitation(c, userId, ttlDays = INVITE_TTL_DAYS) {
		const token = (await import('../utils/security-crypto')).generateInvitationToken;
		const raw = await token();
		const expires = dayjs().add(ttlDays, 'day').format('YYYY-MM-DD HH:mm:ss');
		await c.env.db.prepare(
			`INSERT INTO invitation (user_id, token_hash, expires_at, created_by)
			 VALUES (?, ?, ?, ?)`
		).bind(userId, await hashToken(raw), expires, c.get('user')?.userId || null).run();
		return { token: raw, expiresAt: expires, ttlDays };
	},

	async listInvitations(c) {
		const rows = await c.env.db.prepare(
			`SELECT i.id, i.user_id, i.status, i.expires_at, i.created_at, i.accepted_at,
				u.email, u.display_name
			 FROM invitation i LEFT JOIN user u ON u.user_id = i.user_id
			 ORDER BY i.id DESC`
		).all();
		return rows.results || [];
	},

	async revokeInvitation(c, invitationId) {
		await c.env.db.prepare(
			`UPDATE invitation SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP
			 WHERE id = ? AND status = 'pending'`
		).bind(invitationId).run();
	},

	inviteTtlDays() {
		return INVITE_TTL_DAYS;
	}
};

export default securityService;