import KvConst from '../const/kv-const';
import setting from '../entity/setting';
import orm from '../entity/orm';
import { verifyRecordType } from '../const/entity-const';
import fileUtils from '../utils/file-utils';
import r2Service from './r2-service';
import constant from '../const/constant';
import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import jwtUtils from '../utils/jwt-utils';
import verifyUtils from '../utils/verify-utils';
import {
	assertEnum,
	isMaskedSecret,
	parseBooleanEnv,
	safeJsonParse,
	toInteger,
	toStringList,
	toTrimmedString
} from '../utils/input-utils';

const PERSISTED_KEYS = new Set([
	'register', 'receive', 'title', 'manyEmail', 'addEmail', 'autoRefresh', 'addEmailVerify',
	'registerVerify', 'regVerifyCount', 'addVerifyCount', 'send', 'r2Domain', 'secretKey',
	'siteKey', 'regKey', 'background', 'tgBotToken', 'tgChatId', 'tgBotStatus', 'forwardEmail',
	'forwardStatus', 'ruleEmail', 'ruleType', 'loginOpacity', 'resendTokens', 'noticeTitle',
	'noticeContent', 'noticeType', 'noticeDuration', 'noticePosition', 'noticeOffset', 'noticeWidth',
	'notice', 'noRecipient', 'loginDomain', 'bucket', 'region', 'endpoint', 's3AccessKey',
	's3SecretKey', 'forcePathStyle', 'customDomain', 'tgMsgFrom', 'tgMsgTo', 'tgMsgText',
	'minEmailPrefix', 'emailPrefixFilter', 'blackSubject', 'blackContent', 'blackFrom', 'aiCode',
	'aiCodeFilter'
]);

const BINARY_KEYS = new Set([
	'register', 'receive', 'manyEmail', 'addEmail', 'send', 'tgBotStatus', 'forwardStatus',
	'ruleType', 'notice', 'noRecipient', 'loginDomain', 'forcePathStyle', 'aiCode'
]);
const TRISTATE_KEYS = new Set(['addEmailVerify', 'registerVerify', 'regKey']);
const SECRET_KEYS = new Set(['secretKey', 'siteKey', 'tgBotToken', 's3AccessKey', 's3SecretKey']);
const LIST_TEXT_KEYS = new Set([
	'tgChatId', 'forwardEmail', 'ruleEmail', 'emailPrefixFilter', 'blackSubject', 'blackContent',
	'blackFrom', 'aiCodeFilter'
]);
const TEXT_LIMITS = {
	title: 200,
	r2Domain: 2048,
	background: 4096,
	bucket: 255,
	region: 128,
	endpoint: 2048,
	customDomain: 2048,
	noticeTitle: 300,
	noticeContent: 20_000,
	noticeType: 64,
	noticePosition: 64
 };

function normalizeConfigUrl(value, { name, allowHttp = true } = {}) {
	const raw = toTrimmedString(value, { name, max: 2048 });
	if (!raw) return '';
	const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
	let parsed;
	try { parsed = new URL(candidate); } catch { throw new BizError(`${name}格式错误`, 400); }
	if (!['https:', ...(allowHttp ? ['http:'] : [])].includes(parsed.protocol)) throw new BizError(`${name}仅支持HTTP(S)`, 400);
	if (parsed.username || parsed.password) throw new BizError(`${name}不能包含用户名或密码`, 400);
	const hostname = parsed.hostname.toLowerCase();
	if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '0.0.0.0' || hostname === '::1' ||
		/^127\./.test(hostname) || /^169\.254\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
		throw new BizError(`${name}不能指向本地或私有网络`, 400);
	}
	return raw.replace(/\/$/, '');
}

function clone(value) {
	if (typeof structuredClone === 'function') return structuredClone(value);
	return JSON.parse(JSON.stringify(value));
}

function mask(value, prefixLength) {
	if (!value) return value || '';
	return `${String(value).slice(0, prefixLength)}******`;
}

function parseDomains(c) {
	let domains = c.env.domain;
	if (!domains) throw new BizError(t('noDomainVariable'));
	if (typeof domains === 'string') {
		domains = safeJsonParse(domains);
		if (!Array.isArray(domains)) throw new BizError(t('notJsonDomain'));
	}
	if (!Array.isArray(domains) || domains.length === 0) throw new BizError(t('noDomainVariable'));
	const normalized = [...new Set(domains.map(item => String(item).trim().toLowerCase()).filter(Boolean))];
	if (normalized.some(domain => !verifyUtils.isDomain(domain))) throw new BizError(t('notJsonDomain'));
	return normalized;
}

async function hasAuthenticatedSession(c) {
	const payload = await jwtUtils.verifyToken(c, c.req.header(constant.TOKEN_HEADER));
	if (!payload || !payload.userId || !payload.token) return false;
	const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + payload.userId, { type: 'json' });
	return !!authInfo && Array.isArray(authInfo.tokens) && authInfo.tokens.includes(payload.token);
}

function normalizeResendTokens(currentTokens, incoming) {
	if (incoming === undefined) return currentTokens;
	if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
		throw new BizError('Resend Token 格式错误', 400);
	}
	const result = { ...(currentTokens || {}) };
	for (const [rawDomain, rawToken] of Object.entries(incoming)) {
		const domain = String(rawDomain).trim().toLowerCase();
		if (!verifyUtils.isDomain(domain)) throw new BizError(`Resend 域名无效: ${domain}`, 400);
		if (rawToken === '' || rawToken === null) {
			delete result[domain];
			continue;
		}
		if (isMaskedSecret(rawToken)) continue;
		result[domain] = toTrimmedString(rawToken, { name: 'Resend Token', required: true, max: 512 });
	}
	if (Object.keys(result).length > 100) throw new BizError('Resend Token 数量不能超过100', 400);
	return result;
}

function normalizeSettingValue(key, value) {
	if (BINARY_KEYS.has(key)) return toInteger(value, { name: key, required: true, min: 0, max: 1 });
	if (TRISTATE_KEYS.has(key)) return toInteger(value, { name: key, required: true, min: 0, max: 2 });
	if (key === 'autoRefresh') return assertEnum(toInteger(value, { name: key, required: true, min: 0, max: 60 }), [0, 3, 5, 10, 15, 20], { name: key });
	if (key === 'regVerifyCount' || key === 'addVerifyCount') return toInteger(value, { name: key, required: true, min: 1, max: 100_000 });
	if (key === 'minEmailPrefix') return toInteger(value, { name: key, required: true, min: 1, max: 20 });
	if (key === 'noticeDuration') return toInteger(value, { name: key, required: true, min: 0, max: 86_400_000 });
	if (key === 'noticeOffset') return toInteger(value, { name: key, required: true, min: -10_000, max: 10_000 });
	if (key === 'noticeWidth') return toInteger(value, { name: key, required: true, min: 0, max: 10_000 });
	if (key === 'loginOpacity') {
		const number = Number(value);
		if (!Number.isFinite(number) || number < 0 || number > 1) throw new BizError('loginOpacity必须在0到1之间', 400);
		return Math.round(number * 100) / 100;
	}
	if (key === 'r2Domain') return normalizeConfigUrl(value, { name: 'R2访问域名', allowHttp: false });
	if (key === 'customDomain') return normalizeConfigUrl(value, { name: '自定义域名', allowHttp: false });
	if (key === 'endpoint') return normalizeConfigUrl(value, { name: 'S3 Endpoint', allowHttp: true });
	if (key === 'tgMsgFrom') return assertEnum(value, ['show', 'hide', 'only-name'], { name: key });
	if (key === 'tgMsgTo' || key === 'tgMsgText') return assertEnum(value, ['show', 'hide'], { name: key });
	if (LIST_TEXT_KEYS.has(key)) {
		return toStringList(value, { name: key, maxItems: 500, maxItemLength: 512 }).join(',');
	}
	return toTrimmedString(value, { name: key, max: TEXT_LIMITS[key] || 4096 });
}

const settingService = {
	async refresh(c) {
		const row = await orm(c).select().from(setting).get();
		if (!row) throw new BizError('数据库未初始化 Database not initialized.');
		row.resendTokens = safeJsonParse(row.resendTokens, {});
		if (!row.resendTokens || typeof row.resendTokens !== 'object' || Array.isArray(row.resendTokens)) row.resendTokens = {};
		c.set?.('setting', clone(row));
		await c.env.kv.put(KvConst.SETTING, JSON.stringify(row));
		return row;
	},

	async query(c) {
		let cached = c.get?.('setting');
		if (!cached) cached = await c.env.kv.get(KvConst.SETTING, { type: 'json' });
		if (!cached) throw new BizError('数据库未初始化 Database not initialized.');
		const row = clone(cached);
		row.resendTokens = row.resendTokens && typeof row.resendTokens === 'object' && !Array.isArray(row.resendTokens)
			? row.resendTokens
			: safeJsonParse(row.resendTokens, {});
		row.domainList = parseDomains(c).map(item => `@${item}`);
		row.projectLink = parseBooleanEnv(c.env.project_link, true);
		row.linuxdoClientId = c.env.linuxdo_client_id || '';
		row.linuxdoCallbackUrl = c.env.linuxdo_callback_url || '';
		row.linuxdoSwitch = parseBooleanEnv(c.env.linuxdo_switch, false);
		row.emailPrefixFilter = String(row.emailPrefixFilter || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
		c.set?.('setting', clone(row));
		return row;
	},

	async get(c, showSiteKey = false) {
		const [source, recordList] = await Promise.all([
			this.query(c),
			verifyRecordService.selectListByIP(c)
		]);
		const row = clone(source);
		if (!showSiteKey) row.siteKey = mask(row.siteKey, 6);
		row.secretKey = mask(row.secretKey, 6);
		row.resendTokens = Object.fromEntries(Object.entries(row.resendTokens || {}).map(([domain, token]) => [domain, mask(token, 12)]));
		row.s3AccessKey = mask(row.s3AccessKey, 12);
		row.s3SecretKey = mask(row.s3SecretKey, 12);
		row.tgBotToken = mask(row.tgBotToken, 20);
		row.hasR2 = !!c.env.r2;
		row.hasCfEmail = !!c.env.email;
		row.regVerifyOpen = false;
		row.addVerifyOpen = false;
		for (const record of Array.isArray(recordList) ? recordList : []) {
			if (record.type === verifyRecordType.REG) row.regVerifyOpen = Number(record.count) >= Number(row.regVerifyCount);
			if (record.type === verifyRecordType.ADD) row.addVerifyOpen = Number(record.count) >= Number(row.addVerifyCount);
		}
		row.storageType = await r2Service.storageType(c);
		return row;
	},

	async set(c, params = {}) {
		if (!params || typeof params !== 'object' || Array.isArray(params)) throw new BizError('设置参数格式错误', 400);
		const current = await this.query(c);
		const update = {};
		for (const [key, value] of Object.entries(params)) {
			if (!PERSISTED_KEYS.has(key) || key === 'background' || key === 'resendTokens') continue;
			if (SECRET_KEYS.has(key) && isMaskedSecret(value)) continue;
			update[key] = normalizeSettingValue(key, value);
		}
		if (Object.prototype.hasOwnProperty.call(params, 'resendTokens')) {
			update.resendTokens = JSON.stringify(normalizeResendTokens(current.resendTokens, params.resendTokens));
		}
		if (Object.keys(update).length === 0) return;
		await orm(c).update(setting).set(update).run();
		await this.refresh(c);
	},

	async deleteBackground(c) {
		const { background } = await this.query(c);
		if (!background) return;
		if (!String(background).startsWith('http')) await r2Service.delete(c, background);
		await orm(c).update(setting).set({ background: '' }).run();
		await this.refresh(c);
	},

	async setBackground(c, params = {}) {
		let background = toTrimmedString(params.background, { name: '背景', max: 15_000_000 });
		const current = await this.query(c);
		const oldBackground = String(current.background || '');
		let uploadedKey = '';

		if (background && /^https?:\/\//i.test(background)) {
			background = normalizeConfigUrl(background, { name: '背景图片链接', allowHttp: true });
		} else if (background) {
			const file = fileUtils.base64ToFile(background);
			if (!file.type?.startsWith('image/')) throw new BizError('背景文件必须是图片', 400);
			if (file.size > 10 * 1024 * 1024) throw new BizError('背景图片不能超过10MB', 400);
			const buffer = await file.arrayBuffer();
			background = constant.BACKGROUND_PREFIX + await fileUtils.getBuffHash(buffer) + fileUtils.getExtFileName(file.name);
			uploadedKey = background;
			if (background !== oldBackground) {
				await r2Service.putObj(c, background, buffer, {
					contentType: file.type,
					cacheControl: 'public, max-age=31536000, immutable',
					contentDisposition: 'inline'
				});
			}
		}

		try {
			await orm(c).update(setting).set({ background }).run();
			await this.refresh(c);
		} catch (error) {
			if (uploadedKey && uploadedKey !== oldBackground) await r2Service.delete(c, uploadedKey).catch(() => {});
			throw error;
		}
		if (oldBackground && oldBackground !== background && !/^https?:\/\//i.test(oldBackground)) {
			await r2Service.delete(c, oldBackground).catch(error => console.warn('删除旧背景失败', error?.message || error));
		}
		return background;
	},

	async setBlacklist(c, params = {}) {
		const update = {};
		for (const key of ['blackSubject', 'blackContent', 'blackFrom']) {
			update[key] = normalizeSettingValue(key, params[key]);
		}
		await orm(c).update(setting).set(update).run();
		await this.refresh(c);
		return this.get(c);
	},

	async websiteConfig(c) {
		const row = await this.get(c, true);
		const authenticated = await hasAuthenticatedSession(c);
		return {
			register: row.register,
			title: row.title,
			manyEmail: row.manyEmail,
			addEmail: row.addEmail,
			autoRefresh: row.autoRefresh,
			addEmailVerify: row.addEmailVerify,
			registerVerify: row.registerVerify,
			send: row.send,
			r2Domain: row.r2Domain,
			siteKey: row.siteKey,
			background: row.background,
			loginOpacity: row.loginOpacity,
			domainList: row.loginDomain === 1 && !authenticated ? [] : row.domainList,
			regKey: row.regKey,
			regVerifyOpen: row.regVerifyOpen,
			addVerifyOpen: row.addVerifyOpen,
			noticeTitle: row.noticeTitle,
			noticeContent: row.noticeContent,
			noticeType: row.noticeType,
			noticeDuration: row.noticeDuration,
			noticePosition: row.noticePosition,
			noticeWidth: row.noticeWidth,
			noticeOffset: row.noticeOffset,
			notice: row.notice,
			loginDomain: row.loginDomain,
			linuxdoClientId: row.linuxdoClientId,
			linuxdoCallbackUrl: row.linuxdoCallbackUrl,
			linuxdoSwitch: row.linuxdoSwitch,
			minEmailPrefix: row.minEmailPrefix,
			projectLink: row.projectLink
		};
	}
};

export default settingService;
