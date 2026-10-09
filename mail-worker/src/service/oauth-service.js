import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { eq, inArray, and } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingService from "./setting-service";
import KvConst from "../const/kv-const";
import { v4 as uuidv4 } from 'uuid';
import {t} from '../i18n/i18n';

const oauthService = {

	async bindUser(c, params) {

		const { email, code, bindToken } = params;

		const oauthUserId = bindToken ? await c.env.kv.get(KvConst.OAUTH_BIND + bindToken) : null;

		if (!oauthUserId) {
			throw new BizError(t('oauthBindExpired'));
		}

		// 一次性使用
		await c.env.kv.delete(KvConst.OAUTH_BIND + bindToken);

		const oauthRow = await this.getById(c, oauthUserId);

		if (!oauthRow) {
			throw new BizError(t('oauthBindExpired'));
		}

		let userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);

		userRow = await userService.selectByEmail(c, email);

		orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	// 已登录用户绑定第三方账号：凭 OAuth 回调签发的一次性 bindToken，把
	// 第三方身份关联到当前登录用户。需要 JWT 鉴权。
	async bindCurrentUser(c, params, userId) {

		const { bindToken } = params;

		const oauthUserId = bindToken ? await c.env.kv.get(KvConst.OAUTH_BIND + bindToken) : null;

		if (!oauthUserId) {
			throw new BizError(t('oauthBindExpired'));
		}

		// 一次性使用
		await c.env.kv.delete(KvConst.OAUTH_BIND + bindToken);

		const oauthRow = await this.getById(c, oauthUserId);

		if (!oauthRow) {
			throw new BizError(t('oauthBindExpired'));
		}

		if (oauthRow.userId && oauthRow.userId !== userId) {
			throw new BizError(t('oauthBoundByOther'));
		}

		await orm(c).update(oauth).set({ userId }).where(eq(oauth.oauthUserId, oauthUserId)).run();

		return { userInfo: { ...oauthRow, userId } };
	},

	// 解绑第三方账号
	async unbind(c, platform, userId) {
		await orm(c).update(oauth).set({ userId: 0 })
			.where(and(eq(oauth.platform, platform), eq(oauth.userId, userId))).run();
	},

	// 当前用户已绑定的第三方平台
	async getBindings(c, userId) {
		const rows = await orm(c).select({ platform: oauth.platform }).from(oauth).where(eq(oauth.userId, userId));
		return rows.map(row => row.platform);
	},

	async linuxDoLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'linuxdoSwitch');

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', setting.linuxdoClientId)
		reqParams.append('client_secret', setting.linuxdoClientSecret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', redirectUri)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://connect.linux.do/oauth2/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		})

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText)
		}

		const token = await tokenRes.json()

		const userRes = await fetch('https://connect.linux.do/api/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText)
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.silenced ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'linuxdo';

		return await this.saveAndLogin(c, userInfo)
	},

	async githubLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'githubSwitch');

		const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Accept": "application/json"
			},
			body: JSON.stringify({
				client_id: setting.githubClientId,
				client_secret: setting.githubClientSecret,
				code: code,
				redirect_uri: redirectUri
			})
		});

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText);
		}

		const token = await tokenRes.json();

		if (token.error) {
			throw new BizError(token.error_description || token.error);
		}

		const userRes = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: 'Bearer ' + token.access_token,
				'User-Agent': 'cloud-mail'
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText);
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.id);
		userInfo.username = userInfo.login;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'github';

		return await this.saveAndLogin(c, userInfo);
	},

	async googleLogin(c, params) {

		const { code, redirectUri } = params;

		const setting = await settingService.query(c);
		this.assertEnabled(setting, 'googleSwitch');

		const reqParams = new URLSearchParams()
		reqParams.append('client_id', setting.googleClientId)
		reqParams.append('client_secret', setting.googleClientSecret)
		reqParams.append('code', code)
		reqParams.append('redirect_uri', redirectUri)
		reqParams.append('grant_type', 'authorization_code')

		const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: reqParams.toString()
		});

		if (!tokenRes.ok) {
			throw new BizError(tokenRes.statusText);
		}

		const token = await tokenRes.json();

		const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
			headers: {
				Authorization: 'Bearer ' + token.access_token
			}
		});

		if (!userRes.ok) {
			throw new BizError(userRes.statusText);
		}

		const userInfo = await userRes.json();

		userInfo.oauthUserId = String(userInfo.sub);
		userInfo.username = userInfo.email;
		userInfo.name = userInfo.name;
		userInfo.avatar = userInfo.picture;
		userInfo.platform = 'google';

		return await this.saveAndLogin(c, userInfo);
	},

	async saveAndLogin(c, userInfo) {

		const oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			// 未绑定邮箱：签发一次性 bindToken，证明调用方确实走完了第三方 OAuth 流程。
			// bindUser 只认这个 token，不再信任客户端传来的 oauthUserId，
			// 防止枚举可预测的平台用户 ID 来抢占他人身份、绕过注册开关建号。
			const bindToken = uuidv4();
			await c.env.kv.put(KvConst.OAUTH_BIND + bindToken, String(oauthRow.oauthUserId), { expirationTtl: 600 });
			return { userInfo: oauthRow, token: null, bindToken };
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken };
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo).where(eq(oauth.oauthUserId, userInfo.oauthUserId)).returning().get();
		}

	},

	assertEnabled(setting, switchKey) {
		if (setting[switchKey] !== 0) {
			throw new BizError(t('oauthDisabled'));
		}
	},

	async getById(c, oauthUserId) {
		return await orm(c).select().from(oauth).where(eq(oauth.oauthUserId, oauthUserId)).get();
	},

	async deleteByUserId(c, userId) {
		await this.deleteByUserIds(c, [userId]);
	},

	async deleteByUserIds(c, userIds) {
		await orm(c).delete(oauth).where(inArray(oauth.userId, userIds)).run();
	},

	//定时任务凌晨清除未绑定邮箱的oauth用户
	async clearNoBindOathUser(c) {
		await orm(c).delete(oauth).where(eq(oauth.userId, 0)).run();
	},

}

export default  oauthService
