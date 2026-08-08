import BizError from '../error/biz-error';
import orm from '../entity/orm';
import { v4 as uuidv4 } from 'uuid';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import cryptoUtils from '../utils/crypto-utils';
import emailUtils from '../utils/email-utils';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import reqUtils from '../utils/req-utils';
import dayjs from 'dayjs';
import { isDel, roleConst } from '../const/entity-const';
import email from '../entity/email';
import userService from './user-service';
import KvConst from '../const/kv-const';
import rateLimitService from './rate-limit-service';
import {
	normalizeEmail,
	toInteger,
	toPageNumber,
	toPageSize,
	toTrimmedString
} from '../utils/input-utils';

function configuredDomains(c) {
	if (Array.isArray(c.env.domain)) return c.env.domain.map(item => String(item).toLowerCase());
	try {
		const parsed = JSON.parse(c.env.domain || '[]');
		return Array.isArray(parsed) ? parsed.map(item => String(item).toLowerCase()) : [];
	} catch {
		return [];
	}
}

const publicService = {
	async emailList(c, params = {}) {
		const page = toPageNumber(params.num);
		const size = toPageSize(params.size, { defaultValue: 20, max: 100 });
		const offset = (page - 1) * size;
		const conditions = [];
		const contains = (value, name, max = 512) => {
			const normalized = toTrimmedString(value, { name, max });
			return normalized ? `%${normalized.replace(/[%_]/g, '\\$&')}%` : '';
		};

		const toEmail = contains(params.toEmail, '收件人', 254);
		const sendEmail = contains(params.sendEmail, '发件人', 254);
		const sendName = contains(params.sendName, '发件人名称', 256);
		const subject = contains(params.subject, '主题', 512);
		const content = contains(params.content, '正文', 2000);
		if (toEmail) conditions.push(sql`${email.toEmail} COLLATE NOCASE LIKE ${toEmail} ESCAPE '\\'`);
		if (sendEmail) conditions.push(sql`${email.sendEmail} COLLATE NOCASE LIKE ${sendEmail} ESCAPE '\\'`);
		if (sendName) conditions.push(sql`${email.name} COLLATE NOCASE LIKE ${sendName} ESCAPE '\\'`);
		if (subject) conditions.push(sql`${email.subject} COLLATE NOCASE LIKE ${subject} ESCAPE '\\'`);
		if (content) conditions.push(sql`${email.content} COLLATE NOCASE LIKE ${content} ESCAPE '\\'`);
		if (params.type !== undefined && params.type !== null && params.type !== '') {
			conditions.push(eq(email.type, toInteger(params.type, { name: 'type', min: 0, max: 1 })));
		}
		if (params.isDel !== undefined && params.isDel !== null && params.isDel !== '') {
			conditions.push(eq(email.isDel, toInteger(params.isDel, { name: 'isDel', min: 0, max: 1 })));
		}

		let query = orm(c).select({
			emailId: email.emailId,
			sendEmail: email.sendEmail,
			sendName: email.name,
			subject: email.subject,
			toEmail: email.toEmail,
			toName: email.toName,
			type: email.type,
			createTime: email.createTime,
			content: email.content,
			text: email.text,
			isDel: email.isDel
		}).from(email);
		if (conditions.length) query = query.where(and(...conditions));
		query = params.timeSort === 'asc' ? query.orderBy(asc(email.emailId)) : query.orderBy(desc(email.emailId));
		return query.limit(size).offset(offset);
	},

	async addUser(c, params = {}) {
		if (!Array.isArray(params.list)) throw new BizError('list格式错误', 400);
		if (params.list.length === 0) return;
		if (params.list.length > 100) throw new BizError('单次最多导入100个用户', 400);

		const domains = configuredDomains(c);
		const roleList = await roleService.roleSelectUse(c);
		const defaultRole = roleList.find(row => row.isDefault === roleConst.isDefault.OPEN);
		if (!defaultRole) throw new BizError(t('roleNotExist'));
		const roleByName = new Map(roleList.map(row => [row.name, row]));
		const seen = new Set();
		const preparedRows = [];

		for (const source of params.list) {
			if (!source || typeof source !== 'object' || Array.isArray(source)) throw new BizError('用户数据格式错误', 400);
			const normalizedEmail = normalizeEmail(source.email);
			if (seen.has(normalizedEmail)) throw new BizError(`导入列表存在重复邮箱: ${normalizedEmail}`, 409);
			seen.add(normalizedEmail);
			if (!domains.includes(emailUtils.getDomain(normalizedEmail))) throw new BizError(t('notEmailDomain'));

			const password = source.password === undefined || source.password === null || source.password === ''
				? cryptoUtils.genRandomPwd()
				: toTrimmedString(source.password, { name: '密码', required: true, max: 30 });
			if (password.length < 6) throw new BizError(t('pwdMinLength'), 400);
			const roleName = toTrimmedString(source.roleName, { name: '角色名称', max: 100 });
			const selectedRole = roleName ? roleByName.get(roleName) : defaultRole;
			if (!selectedRole) throw new BizError(`角色不存在: ${roleName}`, 400);
			if (!roleService.hasAvailDomainPerm(selectedRole.availDomain, normalizedEmail)) {
				throw new BizError(`角色无权使用域名: ${normalizedEmail}`, 403);
			}
			const { salt, hash } = await cryptoUtils.hashPassword(password, cryptoUtils.iterationsFromEnv(c.env));
			preparedRows.push({ email: normalizedEmail, salt, hash, roleId: selectedRole.roleId });
		}

		const activeIp = reqUtils.getIp(c);
		const { os, browser, device } = reqUtils.getUserAgent(c);
		const activeTime = dayjs().format('YYYY-MM-DD HH:mm:ss');
		const statements = [];
		for (const row of preparedRows) {
			statements.push(c.env.db.prepare(`
				INSERT INTO user (email, password, salt, type, os, browser, active_ip, create_ip, device, active_time, create_time)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).bind(row.email, row.hash, row.salt, row.roleId, os, browser, activeIp, activeIp, device, activeTime, activeTime));
			statements.push(c.env.db.prepare(`
				INSERT INTO account (email, name, user_id)
				SELECT ?, ?, user_id FROM user WHERE email = ? COLLATE NOCASE
			`).bind(row.email, emailUtils.getName(row.email), row.email));
		}

		try {
			await c.env.db.batch(statements);
		} catch (error) {
			if (String(error?.message || '').includes('SQLITE_CONSTRAINT')) throw new BizError(t('emailExistDatabase'), 409);
			throw error;
		}
	},

	async genToken(c, params) {
		await rateLimitService.check(c, 'public-token', {
			limit: Number(c.env.public_token_rate_limit) || 5,
			windowSeconds: 900
		});
		await this.verifyUser(c, params);
		const uuid = uuidv4();
		const ttl = toInteger(c.env.public_token_ttl, { defaultValue: 900, min: 60, max: 86400 });
		await c.env.kv.put(KvConst.PUBLIC_KEY, uuid, { expirationTtl: ttl });
		return { token: uuid, expiresIn: ttl };
	},

	async verifyUser(c, params = {}) {
		const email = normalizeEmail(params.email);
		const password = toTrimmedString(params.password, { name: '密码', required: true, max: 30 });
		if (typeof c.env.admin !== 'string' || email !== c.env.admin.toLowerCase()) throw new BizError(t('notAdmin'), 403);
		const userRow = await userService.selectByEmailIncludeDel(c, email);
		if (!userRow || userRow.isDel === isDel.DELETE) throw new BizError(t('notExistUser'));
		if (!await cryptoUtils.verifyPassword(password, userRow.salt, userRow.password)) throw new BizError(t('IncorrectPwd'), 401);
	}
};

export default publicService;
