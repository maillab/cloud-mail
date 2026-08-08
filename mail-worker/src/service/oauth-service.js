import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { oauth } from '../entity/oauth';
import { and, eq, inArray } from 'drizzle-orm';
import userService from './user-service';
import accountService from './account-service';
import loginService from './login-service';
import cryptoUtils from '../utils/crypto-utils';
import jwtUtils from '../utils/jwt-utils';
import rateLimitService from './rate-limit-service';
import { normalizeEmail, parseBooleanEnv, toInteger, toTrimmedString } from '../utils/input-utils';

const OAUTH_STATE_TTL = 600;
const OAUTH_BIND_TTL = 600;

function oauthEnabled(c) {
	return parseBooleanEnv(c.env.linuxdo_switch, false);
}

function requireOauthConfig(c) {
	if (!oauthEnabled(c)) throw new BizError('Linux DO 登录未开启', 403);
	for (const name of ['linuxdo_client_id', 'linuxdo_client_secret', 'linuxdo_callback_url']) {
		if (typeof c.env[name] !== 'string' || !c.env[name].trim()) throw new BizError('Linux DO OAuth 配置不完整', 503);
	}
}

function cleanProviderUser(source) {
	const oauthUserId = toTrimmedString(String(source?.id ?? ''), { name: 'OAuth用户ID', required: true, max: 128 });
	let avatar = toTrimmedString(source?.avatar_url, { name: '头像', max: 2048 });
	if (avatar) {
		try {
			const url = new URL(avatar);
			if (!['https:', 'http:'].includes(url.protocol)) avatar = '';
		} catch { avatar = ''; }
	}
	return {
		oauthUserId,
		username: toTrimmedString(source?.username, { name: '用户名', max: 128 }),
		name: toTrimmedString(source?.name, { name: '名称', max: 256 }),
		avatar,
		active: source?.active ? 0 : 1,
		silenced: source?.silenced ? 0 : 1,
		trustLevel: toInteger(source?.trust_level, { defaultValue: 0, min: 0, max: 100 })
	};
}

const oauthService = {
	async createState(c) {
		requireOauthConfig(c);
		await rateLimitService.check(c, 'oauth-state', { limit: 30, windowSeconds: 900 });
		const state = crypto.randomUUID();
		await c.env.kv.put(`oauth:state:${state}`, '1', { expirationTtl: OAUTH_STATE_TTL });
		return { state, expiresIn: OAUTH_STATE_TTL };
	},

	async verifyState(c, state) {
		if (!parseBooleanEnv(c.env.oauth_state_required, true)) return;
		const normalized = toTrimmedString(state, { name: 'OAuth state', required: true, max: 128 });
		const key = `oauth:state:${normalized}`;
		const exists = await c.env.kv.get(key);
		if (!exists) throw new BizError('OAuth state 无效或已过期', 401);
		await c.env.kv.delete(key);
	},

	async bindUser(c, params = {}) {
		requireOauthConfig(c);
		await rateLimitService.check(c, 'oauth-bind', { limit: 10, windowSeconds: 3600 });
		const bindToken = toTrimmedString(params.bindToken, { name: '绑定凭证', required: true, max: 8192 });
		const payload = await jwtUtils.verifyToken(c, bindToken, { purpose: 'oauth-bind' });
		if (!payload || typeof payload.oauthUserId !== 'string' || typeof payload.nonce !== 'string') {
			throw new BizError('绑定凭证无效或已过期', 401);
		}

		const nonceKey = `oauth:bind:${payload.nonce}`;
		const nonceValue = await c.env.kv.get(nonceKey);
		if (nonceValue !== payload.oauthUserId) throw new BizError('绑定凭证已使用或已过期', 401);
		await c.env.kv.delete(nonceKey);

		const email = normalizeEmail(params.email);
		const code = toTrimmedString(params.code, { name: '注册码', max: 128 });
		const oauthRow = await this.getById(c, payload.oauthUserId);
		if (!oauthRow) throw new BizError('OAuth 用户不存在或已过期', 404);
		if (Number(oauthRow.userId) > 0) throw new BizError('用户已绑定邮箱', 409);

		let createdUserId = 0;
		try {
			await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(20), code }, true);
			const userRow = await userService.selectByEmail(c, email);
			if (!userRow) throw new BizError('邮箱账户创建失败', 500);
			createdUserId = userRow.userId;
			const updated = await orm(c).update(oauth)
				.set({ userId: userRow.userId })
				.where(and(eq(oauth.oauthUserId, payload.oauthUserId), eq(oauth.userId, 0)))
				.returning()
				.get();
			if (!updated) throw new BizError('该 OAuth 用户已被绑定', 409);
			const token = await loginService.login(c, { email }, true);
			return { userInfo: updated, token };
		} catch (error) {
			if (createdUserId) {
				try {
					await accountService.physicsDeleteByUserIds(c, [createdUserId]);
					await userService.rollbackCreate(c, createdUserId);
				} catch (cleanupError) { console.error('OAuth 注册回滚失败', cleanupError); }
			}
			await c.env.kv.put(nonceKey, payload.oauthUserId, { expirationTtl: 120 }).catch(() => {});
			throw error;
		}
	},

	async linuxDoLogin(c, params = {}) {
		requireOauthConfig(c);
		await rateLimitService.check(c, 'oauth-callback', { limit: 20, windowSeconds: 900 });
		const code = toTrimmedString(params.code, { name: 'OAuth code', required: true, max: 2048 });
		await this.verifyState(c, params.state);

		const requestParams = new URLSearchParams({
			client_id: c.env.linuxdo_client_id,
			client_secret: c.env.linuxdo_client_secret,
			code,
			redirect_uri: c.env.linuxdo_callback_url,
			grant_type: 'authorization_code'
		});
		const tokenResponse = await fetch('https://connect.linux.do/oauth2/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: requestParams.toString(),
			signal: AbortSignal.timeout(15_000)
		});
		if (!tokenResponse.ok) throw new BizError('Linux DO OAuth 授权失败', 401);
		const tokenData = await tokenResponse.json();
		if (typeof tokenData?.access_token !== 'string') throw new BizError('Linux DO OAuth 返回无效', 502);

		const userResponse = await fetch('https://connect.linux.do/api/user', {
			headers: { Authorization: `Bearer ${tokenData.access_token}` },
			signal: AbortSignal.timeout(15_000)
		});
		if (!userResponse.ok) throw new BizError('Linux DO 用户信息获取失败', 502);
		const providerUser = cleanProviderUser(await userResponse.json());
		if (providerUser.active !== 0 || providerUser.silenced === 0) throw new BizError('Linux DO 账户当前不可用于登录', 403);
		const minTrustLevel = toInteger(c.env.linuxdo_min_trust_level, { defaultValue: 0, min: 0, max: 100 });
		if (providerUser.trustLevel < minTrustLevel) throw new BizError('Linux DO 信任等级不足', 403);
		const oauthRow = await this.saveUser(c, providerUser);
		const userRow = Number(oauthRow.userId) > 0
			? await userService.selectByIdIncludeDel(c, oauthRow.userId)
			: null;

		if (!userRow) {
			const nonce = crypto.randomUUID();
			await c.env.kv.put(`oauth:bind:${nonce}`, oauthRow.oauthUserId, { expirationTtl: OAUTH_BIND_TTL });
			const bindToken = await jwtUtils.generateToken(c, {
				purpose: 'oauth-bind',
				oauthUserId: oauthRow.oauthUserId,
				nonce
			}, OAUTH_BIND_TTL);
			return { userInfo: oauthRow, token: null, bindToken, bindExpiresIn: OAUTH_BIND_TTL };
		}

		const token = await loginService.login(c, { email: userRow.email }, true);
		return { userInfo: oauthRow, token, bindToken: null };
	},

	async saveUser(c, userInfo) {
		const existing = await this.getById(c, userInfo.oauthUserId);
		if (!existing) return orm(c).insert(oauth).values(userInfo).returning().get();
		return orm(c).update(oauth)
			.set({
				username: userInfo.username,
				name: userInfo.name,
				avatar: userInfo.avatar,
				active: userInfo.active,
				trustLevel: userInfo.trustLevel,
				silenced: userInfo.silenced
			})
			.where(eq(oauth.oauthUserId, userInfo.oauthUserId))
			.returning()
			.get();
	},

	getById(c, oauthUserId) {
		return orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		if (!Array.isArray(userIds) || userIds.length === 0) return;
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	}
};

export default oauthService;
