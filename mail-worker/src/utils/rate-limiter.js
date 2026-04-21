import BizError from '../error/biz-error';

const rateLimiter = {
	async check(c, key, maxAttempts, windowSeconds) {
		const kvKey = `RATE:${key}`;
		const count = Number(await c.env.kv.get(kvKey)) || 0;

		if (count >= maxAttempts) {
			throw new BizError('Too many attempts. Try again later.', 429);
		}

		await c.env.kv.put(kvKey, String(count + 1), { expirationTtl: windowSeconds });
	},

	async reset(c, key) {
		await c.env.kv.delete(`RATE:${key}`);
	}
};

export default rateLimiter;
