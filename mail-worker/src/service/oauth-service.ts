import jwtUtils from "../utils/jwt-utils";
import BizError from "../error/biz-error";
import orm from "../entity/orm";
import {oauth} from "../entity/oauth";
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import userDao from '../dao/user-dao';
import oauthDao from '../dao/oauth-dao';
import loginService from "./login-service";
import cryptoUtils from "../utils/crypto-utils";
import settingsReader from "./settings-reader";
import { t, tFor } from '../i18n/i18n';
import oauthClient, { jsonProperty, setJsonProperty } from '../integrations/oauth-client';
import type { DatabaseContext, HttpContext } from '../types/context';
import type { OAuthBindRequest, OAuthCodeRequest, OAuthLoginResult, OAuthRow } from '../types/oauth';
import { requiredRow } from '../lib/required-row';

type OAuthValues = Partial<Record<keyof typeof oauth.$inferInsert, SQL>>;

function profileValues(profile: unknown): OAuthValues {
	// Provider fields remain unknown until bound. A SQL parameter with the same
	// column encoder retains the original SQL/value semantics without claiming
	// that arbitrary third-party values are strings or normalizing them.
	if (profile === null || profile === undefined) throw new TypeError('Cannot convert undefined or null to object');
	const fields = typeof profile === 'object' ? profile as Record<string, unknown> : {};
	const columns = getTableColumns(oauth);
	const values: OAuthValues = {};
	for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
		if (fields[key] !== undefined) values[key] = sql`${sql.param(fields[key], columns[key])}`;
	}
	return values;
}

const oauthService = {

	async bindUser(c: HttpContext, params: OAuthBindRequest): Promise<OAuthLoginResult> {

		const { email, setupToken, code } = params;
		const proof: unknown = await jwtUtils.verifyToken(c, setupToken || "");
		if (!proof || jsonProperty(proof, 'purpose') !== "oauth-setup" || !jsonProperty(proof, 'exp') || Number(jsonProperty(proof, 'exp')) <= Math.floor(Date.now() / 1000)) {
			throw new BizError("账号设置会话已失效，请重新登录");
		}

		const oauthRow = await orm(c).select().from(oauth).where(eq(oauth.oauthId, sql`${sql.param(jsonProperty(proof, 'oauthId'), oauth.oauthId)}`)).get();
		if (!oauthRow || oauthRow.platform !== jsonProperty(proof, 'platform') || oauthRow.oauthUserId !== jsonProperty(proof, 'subject')) {
			throw new BizError("账号设置会话无效，请重新登录");
		}
		const setting = await settingsReader.query(c);
		this.assertEnabled(setting, oauthRow.platform + "Switch", tFor(c));

		let userRow = await userDao.selectByIdIncludeDel(c, oauthRow.userId);

		if (userRow) {
			throw new BizError('用户已绑定有邮箱')
		}

		await loginService.register(c, { email, password: cryptoUtils.genRandomPwd(), code }, true);

		userRow = requiredRow(await userDao.selectByEmail(c, email), 'userId');

		await orm(c).update(oauth).set({ userId: userRow.userId }).where(eq(oauth.oauthId, oauthRow.oauthId)).run();
		const jwtToken = await loginService.login(c, { email, password: null }, true);

		return { userInfo: oauthRow, token: jwtToken}
	},

	async linuxDoLogin(c: HttpContext, params: OAuthCodeRequest): Promise<OAuthLoginResult> {
		const { code, redirectUri } = params;

		const setting = await settingsReader.query(c);
		this.assertEnabled(setting, 'linuxdoSwitch', tFor(c));

		const userInfo: unknown = await oauthClient.linuxdo({ clientId: setting.linuxdoClientId, clientSecret: setting.linuxdoClientSecret }, { code, redirectUri });
		setJsonProperty(userInfo, 'oauthUserId', String(jsonProperty(userInfo, 'id')));
		userInfo.active = userInfo.active ? 0 : 1;
		userInfo.silenced = userInfo.silenced ? 0 : 1;
		userInfo.trustLevel = userInfo.trust_level;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'linuxdo';

		return await this.saveAndLogin(c, userInfo)
	},

	async githubLogin(c: HttpContext, params: OAuthCodeRequest): Promise<OAuthLoginResult> {
		const { code, redirectUri } = params;

		const setting = await settingsReader.query(c);
		this.assertEnabled(setting, 'githubSwitch', tFor(c));

		const userInfo: unknown = await oauthClient.github({ clientId: setting.githubClientId, clientSecret: setting.githubClientSecret }, { code, redirectUri });
		setJsonProperty(userInfo, 'oauthUserId', String(jsonProperty(userInfo, 'id')));
		userInfo.username = userInfo.login;
		userInfo.avatar = userInfo.avatar_url;
		userInfo.platform = 'github';

		return await this.saveAndLogin(c, userInfo);
	},

	async googleLogin(c: HttpContext, params: OAuthCodeRequest): Promise<OAuthLoginResult> {
		const { code, redirectUri } = params;

		const setting = await settingsReader.query(c);
		this.assertEnabled(setting, 'googleSwitch', tFor(c));

		const userInfo: unknown = await oauthClient.google({ clientId: setting.googleClientId, clientSecret: setting.googleClientSecret }, { code, redirectUri });
		if (!jsonProperty(userInfo, 'sub')) throw new BizError("Google 身份验证失败");
		setJsonProperty(userInfo, 'oauthUserId', String(jsonProperty(userInfo, 'sub')));
		userInfo.username = userInfo.email;
		userInfo.name = userInfo.name;
		userInfo.avatar = userInfo.picture;
		userInfo.platform = 'google';

		return await this.saveAndLogin(c, userInfo);
	},

	async saveAndLogin(c: HttpContext, userInfo: Record<string, unknown>): Promise<OAuthLoginResult> {

		const oauthRow = await this.saveUser(c, userInfo);
		const userRow = await userDao.selectByIdIncludeDel(c, oauthRow.userId);

		if (!userRow) {
			const setupToken = await jwtUtils.generateToken(c, { purpose: "oauth-setup", oauthId: oauthRow.oauthId, platform: oauthRow.platform, subject: oauthRow.oauthUserId }, 900);
			return { userInfo: oauthRow, token: null, setupToken, expiresAt: Date.now() + 900000 };
		}

		const JwtToken = await loginService.login(c, { email: userRow.email, password: null }, true);
		return { userInfo: oauthRow, token: JwtToken };
	},

	async saveUser(c: DatabaseContext, userInfo: Record<string, unknown>): Promise<OAuthRow> {

		const userInfoRow = await this.getById(c, userInfo.oauthUserId, userInfo.platform);

		if (!userInfoRow) {
			if (Array.isArray(userInfo)) {
				return await orm(c).insert(oauth).values(userInfo.map(profileValues)).returning().get();
			}
			return await orm(c).insert(oauth).values(profileValues(userInfo)).returning().get();
		} else {
			return await orm(c).update(oauth).set(profileValues(userInfo)).where(eq(oauth.oauthId, userInfoRow.oauthId)).returning().get();
		}

	},

	assertEnabled(setting: Record<string, unknown>, switchKey: string, translate: (key: string) => string = t): void {
		if (setting[switchKey] !== 0) {
			throw new BizError(translate('oauthDisabled'));
		}
	},

	async getById(c: DatabaseContext, oauthUserId: unknown, platform: unknown): Promise<OAuthRow | undefined> {
		return await orm(c).select().from(oauth).where(and(eq(oauth.oauthUserId, sql`${sql.param(oauthUserId, oauth.oauthUserId)}`), eq(oauth.platform, sql`${sql.param(platform, oauth.platform)}`))).get();
	},

	deleteByUserId: oauthDao.deleteByUserId,
	deleteByUserIds: oauthDao.deleteByUserIds,
	clearNoBindOathUser: oauthDao.clearNoBindOathUser,

}

export default  oauthService
