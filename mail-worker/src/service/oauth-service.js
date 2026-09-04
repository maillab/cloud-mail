import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { and, eq, inArray } from 'drizzle-orm';
import userService from "./user-service";
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingService from "./setting-service";
import {t} from '../i18n/i18n';

const oauthService = {

	async bindUser(c, params) {

		const { email, oauthUserId, platform, code } = params;

		const oauthRow = await this.getById(c, oauthUserId, platform);

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

	async linuxDoLogin(c, params) {
		return await this.saveAndLogin(c, await this.linuxDoUser(c, params));
	},

	async githubLogin(c, params) {
		return await this.saveAndLogin(c, await this.githubUser(c, params));
	},

	async googleLogin(c, params) {
		return await this.saveAndLogin(c, await this.googleUser(c, params));
	},

	//绑定当前登录用户，和登录流程共用授权码换取用户信息
	async bindCurUser(c, params, userId) {

		const { platform } = params;

		const userInfo = await this.platformUser(c, platform, params);

		const oauthRow = await this.getById(c, userInfo.oauthUserId, platform);

		if (oauthRow && oauthRow.userId && oauthRow.userId !== userId) {
			throw new BizError(t('oauthBindOther'));
		}

		const bindRow = await this.selectByUserIdAndPlatform(c, userId, platform);

		if (bindRow && bindRow.oauthUserId !== userInfo.oauthUserId) {
			throw new BizError(t('oauthBindRepeat'));
		}

		await this.saveUser(c, userInfo);

		return await orm(c).update(oauth).set({ userId })
			.where(this.oauthUserWhere(userInfo.oauthUserId, platform)).returning().get();
	},

	async unbindCurUser(c, params, userId) {

		const { platform } = params;

		const bindRow = await this.selectByUserIdAndPlatform(c, userId, platform);

		if (!bindRow) {
			throw new BizError(t('oauthNotBind'));
		}

		await orm(c).delete(oauth).where(eq(oauth.oauthId, bindRow.oauthId)).run();
	},

	async curUserList(c, userId) {
		return await orm(c).select().from(oauth).where(eq(oauth.userId, userId)).all();
	},

	async selectByUserIdAndPlatform(c, userId, platform) {
		return await orm(c).select().from(oauth).where(and(eq(oauth.userId, userId), eq(oauth.platform, platform))).get();
	},

	async platformUser(c, platform, params) {

		const platformFns = {
			github: this.githubUser,
			google: this.googleUser,
			linuxdo: this.linuxDoUser
		};

		const platformFn = Object.hasOwn(platformFns, platform) ? platformFns[platform] : null;

		if (!platformFn) {
			throw new BizError(t('oauthNotExist'));
		}

		return await platformFn.call(this, c, params);
	},

	async linuxDoUser(c, params) {

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

		return userInfo;
	},

	async githubUser(c, params) {

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

		return userInfo;
	},

	async googleUser(c, params) {

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

		return userInfo;
	},

	async saveAndLogin(c, userInfo) {

		const oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userService.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			return { userInfo: oauthRow, token: null };
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken };
	},

	async saveUser(c, userInfo) {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId, userInfo.platform);

		if (!userInfoRow) {
			return await orm(c).insert(oauth).values(userInfo).returning().get();
		} else {
			return await orm(c).update(oauth).set(userInfo)
				.where(this.oauthUserWhere(userInfo.oauthUserId, userInfo.platform)).returning().get();
		}

	},

	assertEnabled(setting, switchKey) {
		if (setting[switchKey] !== 0) {
			throw new BizError(t('oauthDisabled'));
		}
	},

	//第三方用户id只在各自平台内唯一，不同平台可能撞号，必须带上platform
	async getById(c, oauthUserId, platform) {
		return await orm(c).select().from(oauth).where(this.oauthUserWhere(oauthUserId, platform)).get();
	},

	oauthUserWhere(oauthUserId, platform) {
		const condition = eq(oauth.oauthUserId, oauthUserId);
		return platform ? and(condition, eq(oauth.platform, platform)) : condition;
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
