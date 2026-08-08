import orm from '../entity/orm';
import { deviceToken } from '../entity/device-token';
import { eq, desc, inArray } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { toId, toTrimmedString } from '../utils/input-utils';

const MAX_TOKENS_PER_USER = 10;

function normalizeToken(value) {
	const token = toTrimmedString(value, { name: '设备令牌', required: true, max: 256 }).toLowerCase();
	if (!/^[0-9a-f]{32,256}$/.test(token) || token.length % 2 !== 0) throw new BizError('设备令牌格式无效', 400);
	return token;
}

const deviceTokenService = {
	async register(c, userId, value) {
		const uid = toId(userId, 'userId');
		const token = normalizeToken(value);
		await c.env.db.prepare(`
			INSERT INTO device_token (user_id, device_token, platform, create_time)
			VALUES (?, ?, 'ios', CURRENT_TIMESTAMP)
			ON CONFLICT(device_token) DO UPDATE SET
				user_id = excluded.user_id,
				platform = 'ios',
				create_time = CURRENT_TIMESTAMP
		`).bind(uid, token).run();

		const current = await orm(c).select({ tokenId: deviceToken.tokenId }).from(deviceToken)
			.where(eq(deviceToken.userId, uid)).orderBy(desc(deviceToken.tokenId)).all();
		const stale = current.slice(MAX_TOKENS_PER_USER).map(item => item.tokenId);
		if (stale.length) await orm(c).delete(deviceToken).where(inArray(deviceToken.tokenId, stale)).run();
	},

	async unregisterAllByUserId(c, userId) {
		await orm(c).delete(deviceToken).where(eq(deviceToken.userId, toId(userId, 'userId'))).run();
	},

	async removeToken(c, value) {
		let token;
		try { token = normalizeToken(value); } catch { return; }
		await orm(c).delete(deviceToken).where(eq(deviceToken.deviceToken, token)).run();
	},

	async listByUserId(c, userId) {
		return orm(c).select().from(deviceToken).where(eq(deviceToken.userId, toId(userId, 'userId'))).all();
	}
};

export default deviceTokenService;
