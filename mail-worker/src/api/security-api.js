import app from '../hono/hono';
import securityService from '../service/security-service';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import dayjs from 'dayjs';
import { eq } from 'drizzle-orm';
import orm from '../entity/orm';
import user from '../entity/user';
import totpUtils from '../utils/totp-utils';

const SESSION_LIMIT_HINT = 'You already have the maximum number of sessions.';

// ---------------------------------------------------------------------------
// Onboarding
//
// A member who still owes a password change or an authenticator holds an
// 'onboarding' scope session. These endpoints are the only things it can reach.
// ---------------------------------------------------------------------------

app.get('/security/onboarding/state', async (c) => {
	const userId = userContext.getUserId(c);
	const state = await securityService.state(c, userId);
	return c.json(result.ok(state));
});

app.post('/security/onboarding/password', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();

	const row = await userService.selectById(c, userId);
	if (!row) {
		throw new BizError(t('authExpired'), 401);
	}

	// The member proves possession of the credential they were issued (or their
	// current password) before replacing it.
	const cryptoUtils = (await import('../utils/crypto-utils')).default;
	if (!await cryptoUtils.verifyPassword(body.currentPassword || '', row.salt, row.password)) {
		throw new BizError('Your current password is not correct.');
	}

	await securityService.adoptPassword(c, userId, body.newPassword);
	return c.json(result.ok({ passwordChanged: true }));
});

app.post('/security/onboarding/finish', async (c) => {
	const userId = userContext.getUserId(c);
	const state = await securityService.state(c, userId);

	if (!state.mfaEnabled) {
		throw new BizError('Enrol your authenticator before finishing setup.');
	}
	if (state.passwordChangeRequired !== 'none') {
		throw new BizError('Change your password before finishing setup.');
	}

	await securityService.markOnboardingComplete(c, userId, c.get('currentTokenId'));
	return c.json(result.ok({ onboardingComplete: true }));
});

// ---------------------------------------------------------------------------
// Authenticator management (self service)
// ---------------------------------------------------------------------------

app.get('/security/state', async (c) => {
	const userId = userContext.getUserId(c);
	return c.json(result.ok(await securityService.state(c, userId)));
});

app.post('/security/mfa/setup', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await userService.selectById(c, userId);
	const data = await securityService.beginEnrolment(c, userId, row.email);
	return c.json(result.ok(data));
});

app.post('/security/mfa/confirm', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await userService.selectById(c, userId);
	const body = await c.req.json();
	const data = await securityService.confirmEnrolment(c, userId, { ...body, email: row.email });
	return c.json(result.ok(data));
});

app.post('/security/mfa/remove', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await userService.selectById(c, userId);
	const body = await c.req.json();
	await securityService.removeEnrolment(c, userId, { ...body, email: row.email });
	return c.json(result.ok());
});

app.post('/security/mfa/recovery/regenerate', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await userService.selectById(c, userId);
	const body = await c.req.json();

	// Regenerating recovery codes is a security-sensitive act: require a live
	// authenticator code so a borrowed session cannot mint new codes.
	const secret = await securityService.mfaSecret(c, userId);
	if (!secret) {
		throw new BizError('Enrol an authenticator first.');
	}
	if (!await totpUtils.verifyTotp(secret, body.code)) {
		throw new BizError('That code is not valid.');
	}

	const codes = await securityService.regenerateRecoveryCodes(c, userId);
	await securityService.recordEvent(c, {
		userId,
		email: row.email,
		kind: 'recovery',
		outcome: 'success',
		detail: 'Recovery codes regenerated'
	});
	await orm(c).update(user)
		.set({ mfaRecoveryGeneratedAt: dayjs().format('YYYY-MM-DD HH:mm:ss') })
		.where(eq(user.userId, userId)).run();
	return c.json(result.ok({ recoveryCodes: codes }));
});

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

app.put('/security/password', async (c) => {
	const userId = userContext.getUserId(c);
	await securityService.changePassword(c, userId, await c.req.json());
	return c.json(result.ok({ passwordChanged: true }));
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

app.get('/security/sessions', async (c) => {
	const userId = userContext.getUserId(c);
	return c.json(result.ok(await securityService.sessions(c, userId)));
});

app.delete('/security/sessions/:id', async (c) => {
	const userId = userContext.getUserId(c);
	await securityService.revokeSession(c, userId, Number(c.req.param('id')));
	return c.json(result.ok());
});

app.delete('/security/sessions', async (c) => {
	const userId = userContext.getUserId(c);
	await securityService.revokeOtherSessions(c, userId, c.get('currentTokenId'));
	return c.json(result.ok());
});

// ---------------------------------------------------------------------------
// Login history
// ---------------------------------------------------------------------------

app.get('/security/login-history', async (c) => {
	const userId = userContext.getUserId(c);
	return c.json(result.ok(await securityService.loginHistory(c, userId, c.req.query('limit'))));
});

// ---------------------------------------------------------------------------
// Administrative actions on another member
// ---------------------------------------------------------------------------

app.post('/user/resetMfa', async (c) => {
	const { userId, reason, forcePasswordChange, stepUpCode } = await c.req.json();
	if (!userId) {
		throw new BizError('A member is required.');
	}
	if (!reason || String(reason).trim().length < 3) {
		throw new BizError('Give a short reason for this reset (for example: member lost their phone).');
	}

	// Step-up: the administrator must prove they are still in control of their
	// own authenticator before they can reset somebody else's. This protects
	// against an unattended admin session being used to strip MFA.
	const adminId = userContext.getUserId(c);
	const adminSecret = await securityService.mfaSecret(c, adminId);
	if (!adminSecret) {
		throw new BizError('Reset your own authenticator first before resetting others.', 428, { mfaRequired: true });
	}
	if (!await totpUtils.verifyTotp(adminSecret, stepUpCode || '')) {
		throw new BizError('Enter the current six-digit code from your authenticator app.', 428, { mfaRequired: true, stepUp: true });
	}

	const row = await userService.selectById(c, userId);
	if (!row) {
		throw new BizError('That member does not exist.', 404);
	}

	// Guard the last security administrator from locking themselves (or the
	// company) out. If the target is an admin who holds a security-admin role,
	// refusing is safer than an unrecoverable state.
	await securityService.assertNotLastSecurityAdmin(c, userId);

	await securityService.adminResetMfa(c, userId, { reason, forcePasswordChange, email: row.email });
	return c.json(result.ok());
});

app.post('/user/resetPassword', async (c) => {
	const { userId, password } = await c.req.json();
	if (!userId) {
		throw new BizError('A member is required.');
	}
	const row = await userService.selectById(c, userId);
	if (!row) {
		throw new BizError('That member does not exist.', 404);
	}
	const issued = await securityService.adminResetPassword(c, userId, { password, email: row.email });
	// The plaintext temporary password is returned exactly once and only to an
	// administrator holding the reset permission.
	return c.json(result.ok({ temporaryPassword: issued }));
});

app.get('/user/:id/security', async (c) => {
	const targetId = Number(c.req.param('id'));
	const [state, sessions, history] = await Promise.all([
		securityService.state(c, targetId),
		securityService.memberSessions(c, targetId),
		securityService.memberLoginHistory(c, targetId)
	]);
	return c.json(result.ok({ state, sessions, history }));
});