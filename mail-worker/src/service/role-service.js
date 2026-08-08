import role from '../entity/role';
import orm from '../entity/orm';
import { eq, asc, inArray, and, ne, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import rolePerm from '../entity/role-perm';
import perm from '../entity/perm';
import { permConst, roleConst } from '../const/entity-const';
import user from '../entity/user';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n.js';
import emailUtils from '../utils/email-utils';
import { toId, toIdList, toInteger, toStringList, toTrimmedString } from '../utils/input-utils';

function configuredDomains(c) {
	let domains = c.env.domain;
	if (typeof domains === 'string') {
		try { domains = JSON.parse(domains); } catch { domains = []; }
	}
	return new Set((Array.isArray(domains) ? domains : []).map(item => String(item).trim().toLowerCase()).filter(Boolean));
}

function normalizeRole(c, params = {}) {
	const name = toTrimmedString(params.name, { name: '身份名称', required: true, max: 64 });
	const description = toTrimmedString(params.description, { name: '身份描述', max: 500 });
	const sort = toInteger(params.sort, { name: 'sort', defaultValue: 0, min: -100_000, max: 100_000 });
	const sendType = toTrimmedString(params.sendType, { name: 'sendType', required: true, max: 16 });
	if (!['count', 'day', 'ban', 'internal'].includes(sendType)) throw new BizError('sendType取值无效', 400);
	const sendCount = toInteger(params.sendCount, { name: 'sendCount', defaultValue: 0, min: 0, max: 100_000 });
	const accountCount = toInteger(params.accountCount, { name: 'accountCount', defaultValue: 0, min: 0, max: 100_000 });
	const permIds = params.permIds === undefined || (Array.isArray(params.permIds) && params.permIds.length === 0)
		? []
		: toIdList(params.permIds, { name: 'permIds', maxItems: 500 });
	const banEmail = toStringList(params.banEmail, { name: '邮件黑名单', maxItems: 500, maxItemLength: 254 })
		.map(item => item.toLowerCase());
	for (const item of banEmail) {
		if (item !== '*' && !verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) throw new BizError(t('notEmail'), 400);
	}
	const allowed = configuredDomains(c);
	const availDomain = toStringList(params.availDomain, { name: '可用域名', maxItems: 100, maxItemLength: 253 })
		.map(item => item.replace(/^@/, '').toLowerCase());
	for (const domain of availDomain) {
		if (!verifyUtils.isDomain(domain) || (allowed.size && !allowed.has(domain))) throw new BizError(`无效或未配置的域名: ${domain}`, 400);
	}
	return {
		name, description, sort, sendType, sendCount, accountCount,
		permIds, banEmail: [...new Set(banEmail)], availDomain: [...new Set(availDomain)]
	};
}

async function validatePermissionIds(c, permIds) {
	if (!permIds.length) return;
	const rows = await orm(c).select({ permId: perm.permId }).from(perm).where(inArray(perm.permId, permIds)).all();
	if (rows.length !== permIds.length) throw new BizError('权限列表包含不存在的权限', 400);
}

const roleService = {
	async add(c, params = {}, userId) {
		const data = normalizeRole(c, params);
		await validatePermissionIds(c, data.permIds);
		const duplicate = await orm(c).select().from(role).where(sql`${role.name} COLLATE NOCASE = ${data.name}`).get();
		if (duplicate) throw new BizError('身份名称已存在', 409);
		const roleRow = await orm(c).insert(role).values({
			name: data.name,
			key: `role-${crypto.randomUUID()}`,
			description: data.description,
			banEmail: data.banEmail.join(','),
			availDomain: data.availDomain.join(','),
			sort: data.sort,
			isDefault: roleConst.isDefault.CLOSE,
			sendType: data.sendType,
			sendCount: data.sendCount,
			accountCount: data.accountCount,
			userId: toId(userId, 'userId')
		}).returning().get();
		try {
			if (data.permIds.length) await orm(c).insert(rolePerm).values(data.permIds.map(permId => ({ permId, roleId: roleRow.roleId }))).run();
		} catch (error) {
			await orm(c).delete(role).where(eq(role.roleId, roleRow.roleId)).run();
			throw error;
		}
	},

	async roleList(c) {
		const [roleList, permList] = await Promise.all([
			orm(c).select().from(role).orderBy(asc(role.sort)).all(),
			orm(c).select({ permId: perm.permId, roleId: rolePerm.roleId }).from(rolePerm)
				.leftJoin(perm, eq(perm.permId, rolePerm.permId))
				.where(eq(perm.type, permConst.type.BUTTON)).all()
		]);
		for (const item of roleList) {
			item.banEmail = String(item.banEmail || '').split(',').map(value => value.trim()).filter(Boolean);
			item.availDomain = String(item.availDomain || '').split(',').map(value => value.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
			item.permIds = [...new Set(permList.filter(row => row.roleId === item.roleId).map(row => row.permId))];
		}
		return roleList;
	},

	async setRole(c, params = {}) {
		const roleId = toId(params.roleId, 'roleId');
		const current = await this.selectById(c, roleId);
		if (!current) throw new BizError(t('roleNotExist'), 404);
		const data = normalizeRole(c, params);
		await validatePermissionIds(c, data.permIds);
		const duplicate = await orm(c).select().from(role).where(and(
			sql`${role.name} COLLATE NOCASE = ${data.name}`,
			ne(role.roleId, roleId)
		)).get();
		if (duplicate) throw new BizError('身份名称已存在', 409);
		const statements = [
			c.env.db.prepare(`UPDATE role SET name = ?, description = ?, ban_email = ?, avail_domain = ?, sort = ?, send_type = ?, send_count = ?, account_count = ? WHERE role_id = ?`)
				.bind(data.name, data.description, data.banEmail.join(','), data.availDomain.join(','), data.sort, data.sendType, data.sendCount, data.accountCount, roleId),
			c.env.db.prepare('DELETE FROM role_perm WHERE role_id = ?').bind(roleId),
			...data.permIds.map(permId => c.env.db.prepare('INSERT INTO role_perm (role_id, perm_id) VALUES (?, ?)').bind(roleId, permId))
		];
		await c.env.db.batch(statements);
	},

	async delete(c, params = {}) {
		const roleId = toId(params.roleId, 'roleId');
		const roleRow = await this.selectById(c, roleId);
		if (!roleRow) throw new BizError(t('notExist'), 404);
		if (roleRow.isDefault === roleConst.isDefault.OPEN) throw new BizError(t('delDefRole'), 400);
		const defaultRole = await this.selectDefaultRole(c);
		if (!defaultRole || defaultRole.roleId === roleId) throw new BizError('默认身份不可用，无法删除', 409);
		await c.env.db.batch([
			c.env.db.prepare('UPDATE user SET type = ? WHERE type = ?').bind(defaultRole.roleId, roleId),
			// Invite codes encode a specific role grant. Keeping them after that role
			// disappears creates broken registrations with a blank/invalid role. Remove
			// those codes rather than silently changing their authorization semantics.
			c.env.db.prepare('DELETE FROM reg_key WHERE role_id = ?').bind(roleId),
			c.env.db.prepare('DELETE FROM role_perm WHERE role_id = ?').bind(roleId),
			c.env.db.prepare('DELETE FROM role WHERE role_id = ? AND is_default = 0').bind(roleId)
		]);
	},

	roleSelectUse(c) {
		return orm(c).select({ name: role.name, roleId: role.roleId, isDefault: role.isDefault }).from(role).orderBy(asc(role.sort)).all();
	},

	selectDefaultRole(c) {
		return orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();
	},

	async setDefault(c, params = {}) {
		const roleId = toId(params.roleId, 'roleId');
		const roleRow = await this.selectById(c, roleId);
		if (!roleRow) throw new BizError(t('roleNotExist'), 404);
		await c.env.db.batch([
			c.env.db.prepare('UPDATE role SET is_default = 0'),
			c.env.db.prepare('UPDATE role SET is_default = 1 WHERE role_id = ?').bind(roleId)
		]);
	},

	selectById(c, roleId) {
		return orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
	},

	selectByIdsHasPermKey(c, types, permKey) {
		if (!Array.isArray(types) || types.length === 0) return [];
		return orm(c).select({ roleId: role.roleId, sendType: role.sendType, sendCount: role.sendCount }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), inArray(role.roleId, types))).all();
	},

	selectByIdsAndSendType(c, permKey, sendType) {
		return orm(c).select({ roleId: role.roleId }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), eq(role.sendType, sendType))).all();
	},

	selectByUserId(c, userId) {
		return orm(c).select({ ...role }).from(user).leftJoin(role, eq(role.roleId, user.type)).where(eq(user.userId, userId)).get();
	},

	hasAvailDomainPerm(availDomain, email) {
		const list = String(availDomain || '').split(',').map(item => item.trim().replace(/^@/, '').toLowerCase()).filter(Boolean);
		if (!list.length) return true;
		const domain = emailUtils.getDomain(String(email || '').toLowerCase());
		return !!domain && list.includes(domain);
	},

	selectByName(c, roleName) {
		return orm(c).select().from(role).where(sql`${role.name} COLLATE NOCASE = ${String(roleName || '').trim()}`).get();
	},

	selectByUserIds(c, userIds) {
		if (!Array.isArray(userIds) || userIds.length === 0) return [];
		return orm(c).select({ ...role, userId: user.userId }).from(user)
			.leftJoin(role, eq(role.roleId, user.type)).where(inArray(user.userId, userIds)).all();
	},

	isBanEmail(banEmail, fromEmail) {
		const list = String(banEmail || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
		if (list.includes('*')) return true;
		const email = String(fromEmail || '').toLowerCase();
		const domain = emailUtils.getDomain(email);
		return list.some(item => verifyUtils.isDomain(item) ? item === domain : item === email);
	}
};

export default roleService;
