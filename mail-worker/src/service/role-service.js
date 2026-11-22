import role from '../entity/role';
import orm from '../entity/orm';
import { eq, asc, inArray, and, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import rolePerm from '../entity/role-perm';
import perm from '../entity/perm';
import { permConst, roleConst } from '../const/entity-const';
import userService from './user-service';
import userContext from '../security/user-context';
import { normalizeScope } from './scope-service';
import user from '../entity/user';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n.js';
import emailUtils from '../utils/email-utils';

const roleService = {

	// Access changes are recorded append-only: a role edit rewrites role_perm in
	// place, so without this the "who changed what" trail is lost immediately.
	async recordAudit(c, { roleId, roleName, actorId, action, summary, detail }) {
		try {
			await c.env.db.prepare(
				`INSERT INTO role_audit (role_id, role_name, actor_id, action, summary, detail, create_time)
				 VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
			).bind(roleId ?? null, roleName ?? null, actorId ?? null, action, summary, detail ?? null).run();
		} catch (e) {
			// History must never block a permission change.
		}
	},


	async add(c, params, userId) {

		let { name, permIds, banEmail, availDomain } = params;

		if (!name) {
			throw new BizError(t('emptyRoleName'));
		}

		let roleRow = await orm(c).select().from(role).where(eq(role.name, name)).get();

		const notEmailIndex = banEmail.findIndex(item => (!verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) && item !== "*");

		if (notEmailIndex > -1) {
			throw new BizError(t('notEmail'));
		}

		banEmail = banEmail.join(',');

		availDomain = availDomain.join(',');

		roleRow = await orm(c).insert(role).values({...params, banEmail, availDomain, userId}).returning().get();

		if (permIds.length === 0) {
			return;
		}

		const rolePermList = permIds.map(permId => ({ permId, roleId: roleRow.roleId }));

		await orm(c).insert(rolePerm).values(rolePermList).run();

		await roleService.recordAudit(c, {
			roleId: roleRow.roleId,
			roleName: roleRow.name,
			actorId: userId,
			action: 'create',
			summary: `Created role "${roleRow.name}"`,
			detail: `${permIds.length} permissions granted`
		});


	},

	async roleList(c) {

		const roleList = await orm(c).select().from(role).orderBy(asc(role.sort)).all();
		const permList = await orm(c).select({ permId: perm.permId, roleId: rolePerm.roleId }).from(rolePerm)
			.leftJoin(perm, eq(perm.permId, rolePerm.permId))
			.where(eq(perm.type, permConst.type.BUTTON)).all();

		// Members per role, so the role list can show real headcount instead of a
		// guessed number.
		const memberRows = await c.env.db.prepare(
			`SELECT type, COUNT(*) AS count FROM user WHERE COALESCE(is_del, 0) = 0 GROUP BY type`
		).all();
		const memberCount = new Map((memberRows.results || []).map(row => [row.type, Number(row.count) || 0]));

		roleList.forEach(role => {
			role.banEmail = role.banEmail.split(",").filter(item => item !== "");
			role.availDomain = role.availDomain.split(",").filter(item => item !== "");
			role.permIds = permList.filter(perm => perm.roleId === role.roleId).map(perm => perm.permId);
			role.memberCount = memberCount.get(role.roleId) || 0;
			role.dataScope = role.dataScope || 'own';
		});

		return roleList;
	},

	async setRole(c, params) {

		let { name, permIds, roleId, banEmail, availDomain } = params;

		if (!name) {
			throw new BizError(t('emptyRoleName'));
		}

		// Partial updates (for example a scope-only change) are legitimate: a missing
		// list means "leave as is", never "clear it". Checked before params is stripped.
		const permIdsProvided = Array.isArray(permIds);
		delete params.isDefault
		delete params.permIds
		delete params.roleId

		banEmail = Array.isArray(banEmail) ? banEmail : [];
		availDomain = Array.isArray(availDomain) ? availDomain : [];

		const notEmailIndex = banEmail.findIndex(item => (!verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) && item !== "*")

		if (notEmailIndex > -1) {
			throw new BizError(t('notEmail'));
		}

		banEmail = banEmail.join(',')

		availDomain = availDomain.join(',')

		// Only known role fields are written; unknown keys from the client must not
		// silently reach the row.
		const writable = {};
		for (const field of ['name', 'key', 'description', 'sort', 'sendType', 'sendCount', 'accountCount', 'dataScope', 'banEmailType']) {
			if (params[field] !== undefined) writable[field] = params[field];
		}
		if (writable.dataScope !== undefined) {
			writable.dataScope = normalizeScope(writable.dataScope);
		}

		const existingRole = await orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
		const scopeChanged = existingRole && writable.dataScope && writable.dataScope !== (existingRole.dataScope || 'own');

		await orm(c).update(role).set({...writable, banEmail, availDomain}).where(eq(role.roleId, roleId)).run();

		let previousIds = [];
		let nextIds = [];
		if (permIdsProvided) {
			const previous = await orm(c).select({ permId: rolePerm.permId }).from(rolePerm).where(eq(rolePerm.roleId, roleId)).all();
			previousIds = (previous || []).map(row => row.permId).sort((a, b) => a - b);
			nextIds = [...new Set(permIds)].sort((a, b) => a - b);

			await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();

			if (nextIds.length > 0) {
				const rolePermList = nextIds.map(permId => ({ permId, roleId: roleId }));
				await orm(c).insert(rolePerm).values(rolePermList).run();
			}
		}

		const added = nextIds.filter(id => !previousIds.includes(id));
		const removed = previousIds.filter(id => !nextIds.includes(id));
		if (scopeChanged) {
			await roleService.recordAudit(c, {
				roleId,
				roleName: writable.name || name,
				actorId: userContext.getUserId(c),
				action: 'scope',
				summary: `Changed record scope for "${writable.name || name}"`,
				detail: `${existingRole.dataScope || 'own'} -> ${writable.dataScope}`
			});
		}

		await roleService.recordAudit(c, {
			roleId,
			roleName: name,
			actorId: userContext.getUserId(c),
			action: added.length || removed.length ? 'permissions' : 'edit',
			summary: added.length || removed.length ? `Updated access for "${name}"` : `Updated role "${name}"`,
			detail: added.length || removed.length
				? `+${added.length} / -${removed.length} permissions (total ${nextIds.length})`
				: 'No permission change'
		});

	},

	async delete(c, params) {

		const { roleId } = params;

		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, roleId)).get();

		if (!roleRow) {
			throw new BizError(t('notExist'));
		}

		if (roleRow.isDefault) {
			throw new BizError(t('delDefRole'));
		}

		const defRoleRow = await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();

		await userService.updateAllUserType(c, defRoleRow.roleId, roleId);

		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();
		await orm(c).delete(role).where(eq(role.roleId, roleId)).run();

		await roleService.recordAudit(c, {
			roleId,
			roleName: roleRow.name,
			actorId: userContext.getUserId(c),
			action: 'delete',
			summary: `Deleted role "${roleRow.name}"`,
			detail: `Members moved to "${defRoleRow.name}"`
		});

	},

	roleSelectUse(c) {
		return orm(c).select({ name: role.name, roleId: role.roleId, isDefault: role.isDefault }).from(role).orderBy(asc(role.sort)).all();
	},

	async selectDefaultRole(c) {
		return await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();
	},

	async setDefault(c, params) {
		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, params.roleId)).get();
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}
		await orm(c).update(role).set({ isDefault: 0 }).run();
		await orm(c).update(role).set({ isDefault: 1 }).where(eq(role.roleId, params.roleId)).run();

		await roleService.recordAudit(c, {
			roleId: roleRow.roleId,
			roleName: roleRow.name,
			actorId: userContext.getUserId(c),
			action: 'default',
			summary: `Set "${roleRow.name}" as the default role`
		});
	},

	selectById(c, roleId) {
		return orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
	},

	// Role configuration for a set of mailboxes. Incoming delivery needs the
	// domain and ban rules that belong to each receiving mailbox's owner.
	async selectByUserIds(c, userIds) {
		const ids = [...new Set((userIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
		if (!ids.length) return [];
		const placeholders = ids.map(() => '?').join(',');
		const { results } = await c.env.db.prepare(`
			SELECT u.user_id, r.ban_email, r.avail_domain, r.data_scope
			FROM user u LEFT JOIN role r ON r.role_id = u.type
			WHERE u.user_id IN (${placeholders})
		`).bind(...ids).all();
		return results.map(row => ({
			userId: row.user_id,
			role: { banEmail: row.ban_email, availDomain: row.avail_domain, dataScope: row.data_scope }
		}));
	},

	selectByIdsHasPermKey(c, types, permKey) {
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
		return orm(c).select(role).from(user).leftJoin(role, eq(role.roleId, user.type)).where(eq(user.userId, userId)).get();
	},

	hasAvailDomainPerm(availDomain, email) {

		availDomain = availDomain.split(',').filter(item => item !== '');

		if (availDomain.length === 0) {
			return true
		}

		const availIndex = availDomain.findIndex(item => {
			const domain = emailUtils.getDomain(email.toLowerCase());
			const availDomainItem = item.toLowerCase();
			return domain === availDomainItem
		})

		return availIndex > -1
	},


	// Newest-first access history for the role builder's History tab.
	async history(c, roleId) {
		const conditions = [];
		const params = [];
		if (roleId) { conditions.push('role_id = ?'); params.push(roleId); }
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
		const rows = await c.env.db.prepare(
			`SELECT id, role_id, role_name, actor_id, action, summary, detail, create_time
			 FROM role_audit ${where}
			 ORDER BY id DESC LIMIT 100`
		).bind(...params).all();

		const actorIds = [...new Set((rows.results || []).map(row => row.actor_id).filter(Boolean))];
		const actorNames = new Map();
		if (actorIds.length) {
			const placeholders = actorIds.map(() => '?').join(',');
			const actors = await c.env.db.prepare(
				`SELECT user_id, display_name, username, email FROM user WHERE user_id IN (${placeholders})`
			).bind(...actorIds).all();
			(actors.results || []).forEach(row => {
				actorNames.set(row.user_id, row.username ? `${row.display_name || row.email} (@${row.username})` : (row.display_name || row.email));
			});
		}

		return (rows.results || []).map(row => ({ ...row, actor: actorNames.get(row.actor_id) || null }));
	},

	// Members currently holding a role, with the identity fields the builder needs.
	async members(c, roleId) {
		const rows = await c.env.db.prepare(
			`SELECT u.user_id, u.display_name, u.username, u.email, u.status, u.last_seen_at,
				u.avatar_key
			 FROM user u
			 WHERE u.type = ? AND COALESCE(u.is_del, 0) = 0
			 ORDER BY COALESCE(NULLIF(u.display_name, ''), u.email) ASC`
		).bind(roleId).all();

		return (rows.results || []).map(row => ({
			userId: row.user_id,
			displayName: row.display_name || (row.email ? row.email.split('@')[0] : ''),
			username: row.username,
			email: row.email,
			status: row.status,
			lastSeenAt: row.last_seen_at
		}));
	},

	selectByName(c, roleName) {
		return orm(c).select().from(role).where(eq(role.name, roleName)).get();
	},

	isBanEmail(banEmail, fromEmail) {

		banEmail = banEmail.split(',').filter(item => item !== '');

		if (banEmail.includes('*')) {
			return true;
		}

		for (const item of banEmail) {

			if (verifyUtils.isDomain(item)) {

				const banDomain = item.toLowerCase();
				const receiveDomain = emailUtils.getDomain(fromEmail.toLowerCase());

				if (banDomain === receiveDomain) {
					return true;
				}

			} else {

				if (item.toLowerCase() === fromEmail.toLowerCase()) {

					return true;

				}

			}

		}

		return false;
	}
};

export default roleService;
