import verifyUtils from '../utils/verify-utils.js';
import emailUtils from '../utils/email-utils.js';

export const FORWARD_STATUS = { PENDING: 0, ACTIVE: 1, DISABLED: 2, FAILED: 3 };

export const FORWARD_LIMITS = {
	maxTargets: 3,
	codeTtlMs: 1800000,
	maxCodeFails: 5,
	maxSendFails: 10,
	targetCooldownSec: 60,
	dailyVerifyLimit: 10,
	lastErrorMaxLen: 500
};

export function normalizeEmail(str) {
	return typeof str === 'string' ? str.trim().toLowerCase() : '';
}

export function validateTarget({ target, accountEmail, domainList, existingTargets }) {
	const email = normalizeEmail(target);

	if (!verifyUtils.isEmail(email)) {
		return 'notEmail';
	}

	const domain = '@' + emailUtils.getDomain(email);
	if ((domainList || []).some(d => normalizeEmail(d) === domain)) {
		return 'forwardTargetInternal';
	}

	if (email === normalizeEmail(accountEmail)) {
		return 'forwardTargetSelf';
	}

	const existing = (existingTargets || []).map(normalizeEmail);

	if (existing.length >= FORWARD_LIMITS.maxTargets) {
		return 'forwardTargetLimit';
	}

	if (existing.includes(email)) {
		return 'forwardTargetExists';
	}

	return null;
}

export function genVerifyCode() {
	const buf = new Uint32Array(1);
	globalThis.crypto.getRandomValues(buf);
	return String(buf[0] % 1000000).padStart(6, '0');
}

export function checkVerifyCode(row, input, nowMs) {
	if (!row.verifyCode) return 'invalid';
	if (row.verifyFailCount >= FORWARD_LIMITS.maxCodeFails) return 'invalid';
	if (nowMs > Date.parse(row.verifyExpireTime)) return 'invalid';
	return String(input ?? '').trim() === row.verifyCode ? 'ok' : 'wrong';
}

export function afterWrongCode(row) {
	const verifyFailCount = row.verifyFailCount + 1;
	return {
		verifyFailCount,
		verifyCode: verifyFailCount >= FORWARD_LIMITS.maxCodeFails ? '' : row.verifyCode
	};
}

export function afterSendFailure(row, message) {
	const failCount = row.failCount + 1;
	return {
		failCount,
		status: failCount >= FORWARD_LIMITS.maxSendFails ? FORWARD_STATUS.FAILED : row.status,
		lastError: String(message ?? '').slice(0, FORWARD_LIMITS.lastErrorMaxLen)
	};
}

export function pickChannel({ hasCfEmail, resendTokens, accountEmail }) {
	if (hasCfEmail) return { type: 'cloudflare' };
	const domain = emailUtils.getDomain(normalizeEmail(accountEmail));
	const token = resendTokens?.[domain];
	if (token) return { type: 'resend', token };
	return null;
}

export function canUseForward({ isAdmin, permKeys, sendType }) {
	// 管理员绕过角色权限和发信类型检查
	if (isAdmin) return true;
	if (sendType === 'ban' || sendType === 'internal') return false;
	return (permKeys || []).includes('account:forward');
}

export function isForwardedMail(rawHeaders) {
	return (rawHeaders || []).some(h => h.key === 'x-cloudmail-forwarded');
}

export function sanitizeDisplayName(name) {
	if (typeof name !== 'string') return '';
	return name
		.replace(/[",<>;:\\@()[\]\r\n]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function buildForwardParams({ accountEmail, target, subject, html, text, fromAddress, fromName, attachments }) {
	const params = {
		accountEmail,
		name: sanitizeDisplayName(fromName) || fromAddress || emailUtils.getName(accountEmail),
		receiveEmail: [target],
		subject: subject || '(no subject)',
		html,
		text,
		attachments,
		headers: {
			'X-CloudMail-Forwarded': '1',
			'X-CloudMail-Forwarded-For': accountEmail
		}
	};
	if (fromAddress) {
		params.replyTo = fromAddress;
	}
	return params;
}
