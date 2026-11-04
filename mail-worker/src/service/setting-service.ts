import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import {verifyRecordType} from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import verifyRecordService from './verify-record-service';
import userContext from '../security/user-context';
import domainUtils from '../utils/domain-uitls';
import settingsReader from './settings-reader';
import type { ConfigReadContext, ConfigWriteContext, RequestMetadataContext } from '../types/context';
import type { StoredSettings, SettingsPatch, BackgroundInput, BlacklistInput } from '../types/settings';

function spreadTokens(value: unknown): Record<string, unknown> {
	if (value === null || value === undefined) return {};
	// Object.fromEntries keeps __proto__ as an own property, like object spread.
	const entries: [string, unknown][] = Object.entries(Object(value) as object);
	return Object.fromEntries(entries);
}

function maskTokens(value: unknown) {
	if (value === null || value === undefined) throw new TypeError('Cannot convert undefined or null to object');
	const tokens = Object(value) as Record<string, unknown>;
	Object.keys(tokens).forEach(key => {
		const token = tokens[key];
		let prefix: string | unknown[];
		if (typeof token === 'string') prefix = token.slice(0, 12);
		else if (Array.isArray(token)) prefix = (token as unknown[]).slice(0, 12);
		else if (token === null || token === undefined) throw new TypeError(`Cannot read properties of ${String(token)} (reading 'slice')`);
		else throw new TypeError('settingRow.resendTokens[key].slice is not a function');
		if (typeof value === 'string') throw new TypeError(`Cannot assign to read only property '${key}' of string '${value}'`);
		tokens[key] = `${prefix}******`;
	});
}

const settingService = {

	async refresh(c: ConfigWriteContext) {
		const settingRow = await orm(c).select().from(setting).get();
		if (!settingRow) throw new TypeError("Cannot read properties of undefined (reading 'resendTokens')");
		const tokens: unknown = JSON.parse(settingRow.resendTokens);
		const stored: StoredSettings = Object.assign(settingRow, { resendTokens: tokens });
		c.set('setting', stored);
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(stored));
	},

	async get(c: ConfigReadContext & RequestMetadataContext, showSiteKey = false) {

		const [settingRow, recordList] = await Promise.all([
			await settingsReader.query(c),
			verifyRecordService.selectListByIP(c)
		]);


		if (!showSiteKey) {
			settingRow.siteKey = settingRow.siteKey ? `${settingRow.siteKey.slice(0, 6)}******` : null;
		}

		settingRow.secretKey = settingRow.secretKey ? `${settingRow.secretKey.slice(0, 6)}******` : null;

		maskTokens(settingRow.resendTokens);

		settingRow.s3AccessKey = settingRow.s3AccessKey ? `${settingRow.s3AccessKey.slice(0, 12)}******` : null;
		settingRow.s3SecretKey = settingRow.s3SecretKey ? `${settingRow.s3SecretKey.slice(0, 12)}******` : null;
		settingRow.tgBotToken = settingRow.tgBotToken ? `${settingRow.tgBotToken.slice(0, 20)}******` : null;
		settingRow.hasR2 = !!c.env.r2
		settingRow.hasCfEmail = !!c.env.email

		let regVerifyOpen = false
		let addVerifyOpen = false

		recordList.forEach(row => {
			if (row.type === verifyRecordType.REG) {
				regVerifyOpen = settingRow.regVerifyCount === undefined ? false : row.count >= settingRow.regVerifyCount
			}
			if (row.type === verifyRecordType.ADD) {
				addVerifyOpen = settingRow.addVerifyCount === undefined ? false : row.count >= settingRow.addVerifyCount
			}
		})

		settingRow.regVerifyOpen = regVerifyOpen
		settingRow.addVerifyOpen = addVerifyOpen

		settingRow.storageType = await r2Service.storageType(c);

		return settingRow;
	},

	async set(c: ConfigWriteContext, params: SettingsPatch) {
		const settingData = await settingsReader.query(c);
		const resendTokens = { ...spreadTokens(settingData.resendTokens), ...spreadTokens(params.resendTokens) };
		Object.keys(resendTokens).forEach(domain => {
			if (!resendTokens[domain]) delete resendTokens[domain];
		});

		let emailPrefixFilter = params.emailPrefixFilter;
		if (Array.isArray(emailPrefixFilter)) {
			emailPrefixFilter = emailPrefixFilter + '';
			params.emailPrefixFilter = emailPrefixFilter;
		}

		let aiCodeFilter = params.aiCodeFilter;
		if (Array.isArray(aiCodeFilter)) {
			aiCodeFilter = aiCodeFilter + '';
			params.aiCodeFilter = aiCodeFilter;
		}

		if (params.webhookUrl !== undefined) {
			params.webhookUrl = domainUtils.toOssDomain(params.webhookUrl) || '';
		}

		const serializedTokens = JSON.stringify(resendTokens);
		params.resendTokens = serializedTokens;

		await orm(c).update(setting).set({ ...params, emailPrefixFilter, aiCodeFilter, resendTokens: serializedTokens }).returning().get();
		await this.refresh(c);
	},

	async deleteBackground(c: ConfigWriteContext) {

		const { background } = await settingsReader.query(c);
		if (!background) return

		if (background.startsWith('http')) {
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
			return;
		}

		if (background) {
			await r2Service.delete(c,background)
			await orm(c).update(setting).set({ background: '' }).run();
			await this.refresh(c)
		}
	},

	async setBackground(c: ConfigWriteContext, params: BackgroundInput) {

		let { background } = params

		await this.deleteBackground(c);

		if (background && !background.startsWith('http')) {

			const file = fileUtils.base64ToFile(background)

			const arrayBuffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(arrayBuffer) + fileUtils.getExtFileName(file.name);


			await r2Service.putObj(c, background, arrayBuffer, {
				contentType: file.type,
				cacheControl: `public, max-age=31536000, immutable`,
				contentDisposition: `inline; filename="${file.name}"`
			});

		}

		await orm(c).update(setting).set({ background }).run();
		await this.refresh(c);
		return background;
	},


	async setBlacklist(c: ConfigWriteContext & RequestMetadataContext, params: BlacklistInput) {
		const { blackSubject, blackContent, blackFrom  } = params
		await orm(c).update(setting).set({ blackSubject, blackContent, blackFrom }).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c: ConfigReadContext & RequestMetadataContext) {

		const settingRow = await this.get(c, true);
		const token = await userContext.getToken(c);

		return {
			register: settingRow.register,
			title: settingRow.title,
			manyEmail: settingRow.manyEmail,
			addEmail: settingRow.addEmail,
			autoRefresh: settingRow.autoRefresh,
			addEmailVerify: settingRow.addEmailVerify,
			registerVerify: settingRow.registerVerify,
			send: settingRow.send,
			r2Domain: settingRow.r2Domain,
			siteKey: settingRow.siteKey,
			background: settingRow.background,
			loginOpacity: settingRow.loginOpacity,
			domainList: settingRow.loginDomain === 1 && !token ? [] : settingRow.domainList,
			regKey: settingRow.regKey,
			regVerifyOpen: settingRow.regVerifyOpen,
			addVerifyOpen: settingRow.addVerifyOpen,
			noticeTitle: settingRow.noticeTitle,
			noticeContent: settingRow.noticeContent,
			noticeType: settingRow.noticeType,
			noticeDuration: settingRow.noticeDuration,
			noticePosition: settingRow.noticePosition,
			noticeWidth: settingRow.noticeWidth,
			noticeOffset: settingRow.noticeOffset,
			notice: settingRow.notice,
			loginDomain: settingRow.loginDomain,
			linuxdoClientId: settingRow.linuxdoClientId,
			linuxdoSwitch: settingRow.linuxdoSwitch,
			githubClientId: settingRow.githubClientId,
			githubSwitch: settingRow.githubSwitch,
			googleClientId: settingRow.googleClientId,
			googleSwitch: settingRow.googleSwitch,
			minEmailPrefix: settingRow.minEmailPrefix,
			projectLink: settingRow.projectLink
		};
	},

};

export default settingService;
