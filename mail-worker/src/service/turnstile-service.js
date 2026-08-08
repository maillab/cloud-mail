import BizError from '../error/biz-error';
import settingService from './setting-service';
import { t } from '../i18n/i18n';
import { safeJsonParse, toTrimmedString } from '../utils/input-utils';
import reqUtils from '../utils/req-utils';

function configuredHostnames(c) {
	const raw = c.env.turnstile_hostnames;
	if (!raw) return [];
	const parsed = typeof raw === 'string' && raw.trim().startsWith('[') ? safeJsonParse(raw, []) : String(raw).split(',');
	return Array.isArray(parsed)
		? [...new Set(parsed.map(item => String(item).trim().toLowerCase()).filter(Boolean))]
		: [];
}

const turnstileService = {
	async verify(c, rawToken) {
		const token = toTrimmedString(rawToken, { name: 'Turnstile token', required: true, max: 4096 });
		const settingRow = await settingService.query(c);
		const secret = String(settingRow.secretKey || '').trim();
		if (!secret || secret.includes('******')) throw new BizError('Turnstile 密钥未配置', 503);

		const body = new URLSearchParams({ secret, response: token });
		const ip = reqUtils.getIp(c);
		if (ip && ip !== 'unknown') body.set('remoteip', ip);

		let res;
		try {
			res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body,
				signal: AbortSignal.timeout(8_000)
			});
		} catch {
			throw new BizError('Turnstile 验证服务暂时不可用', 503);
		}

		let result;
		try { result = await res.json(); } catch { throw new BizError('Turnstile 返回格式错误', 503); }
		if (!res.ok || !result?.success) throw new BizError(t('botVerifyFail'), 400);

		const hostnames = configuredHostnames(c);
		if (hostnames.length && !hostnames.includes(String(result.hostname || '').toLowerCase())) {
			throw new BizError('Turnstile hostname 校验失败', 400);
		}
		const expectedAction = String(c.env.turnstile_action || '').trim();
		if (expectedAction && result.action !== expectedAction) throw new BizError('Turnstile action 校验失败', 400);
		return result;
	}
};

export default turnstileService;
