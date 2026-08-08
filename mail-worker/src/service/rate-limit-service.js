import BizError from '../error/biz-error';
import reqUtils from '../utils/req-utils';
import { parseBooleanEnv, toInteger } from '../utils/input-utils';

const rateLimitService = {
	async check(c, scope, options = {}) {
		if (parseBooleanEnv(c.env.rate_limit_disabled, false)) return;
		if (!c.env.kv) return;

		const limit = toInteger(options.limit, { defaultValue: 20, min: 1, max: 10000 });
		const windowSeconds = toInteger(options.windowSeconds, { defaultValue: 900, min: 60, max: 86400 });
		const ip = reqUtils.getIp(c);
		const windowId = Math.floor(Date.now() / 1000 / windowSeconds);
		const key = `rate:${scope}:${ip}:${windowId}`;
		const current = Number(await c.env.kv.get(key) || 0);

		if (current >= limit) {
			throw new BizError('请求过于频繁，请稍后再试', 429);
		}

		await c.env.kv.put(key, String(current + 1), { expirationTtl: windowSeconds + 60 });
	}
};

export default rateLimitService;
