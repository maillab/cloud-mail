import role from '../entity/role';
import orm from '../entity/orm';
import { eq, asc, inArray, and, getTableColumns, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import rolePerm from '../entity/role-perm';
import perm from '../entity/perm';
import { permConst, roleConst } from '../const/entity-const';
import userDao from '../dao/user-dao';
import user from '../entity/user';
import verifyUtils from '../utils/verify-utils';
import { tFor } from '../i18n/i18n';
import emailUtils from '../utils/email-utils';
import { boundId, boundIds } from '../lib/bound-id';
import type { EnvContext } from '../types/context';
import type { ScalarId } from '../types/api';
import type { RoleInput, RoleIdInput, RoleListItem } from '../types/admin';

function csv(value: string | null): string {
	if (value === null) throw new TypeError("Cannot read properties of null (reading 'split')");
	return value;
}

const roleService = {

	async add(c: EnvContext, params: RoleInput, userId: ScalarId) {
		const t = tFor(c);

		const { name, permIds } = params;
		let banEmail: string | string[] = params.banEmail;
		let availDomain: string | string[] = params.availDomain;

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

		roleRow = await orm(c).insert(role).values({...params, roleId: params.roleId === undefined ? undefined : boundId(params.roleId), banEmail, availDomain, userId: boundId(userId), key: params.key === undefined ? sql`null` : params.key }).returning().get();

		if (permIds.length === 0) {
			return;
		}
		if (!roleRow) throw new TypeError("Cannot read properties of undefined (reading 'roleId')");

		const rolePermList = permIds.map(permId => ({ permId: boundId(permId), roleId: roleRow.roleId }));

		await orm(c).insert(rolePerm).values(rolePermList).run();


	},

	async roleList(c: EnvContext): Promise<RoleListItem[]> {

		const roleList = await orm(c).select().from(role).orderBy(asc(role.sort)).all();
		const permList = await orm(c).select({ permId: perm.permId, roleId: rolePerm.roleId }).from(rolePerm)
			.leftJoin(perm, eq(perm.permId, rolePerm.permId))
			.where(eq(perm.type, permConst.type.BUTTON)).all();

		return roleList.map(role => {
			const banEmail = role.banEmail.split(",").filter(item => item !== "");
			const availDomain = csv(role.availDomain).split(",").filter(item => item !== "");
			const permIds = permList.filter(perm => perm.roleId === role.roleId).map(perm => perm.permId);
			return Object.assign(role, { banEmail, availDomain, permIds });
		});
	},

	async setRole(c: EnvContext, params: RoleInput & RoleIdInput) {
		const t = tFor(c);

		const { name, permIds, roleId } = params;
		let banEmail: string | string[] = params.banEmail;
		let availDomain: string | string[] = params.availDomain;

		if (!name) {
			throw new BizError(t('emptyRoleName'));
		}

		delete params.isDefault

		const notEmailIndex = banEmail.findIndex(item => (!verifyUtils.isEmail(item) && !verifyUtils.isDomain(item)) && item !== "*")

		if (notEmailIndex > -1) {
			throw new BizError(t('notEmail'));
		}

		banEmail = banEmail.join(',')

		availDomain = availDomain.join(',')

		await orm(c).update(role).set({...params, roleId: boundId(roleId), banEmail, availDomain}).where(eq(role.roleId, boundId(roleId))).run();
		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, boundId(roleId))).run();

		if (permIds.length > 0) {
			const rolePermList = permIds.map(permId => ({ permId: boundId(permId), roleId: boundId(roleId) }));
			await orm(c).insert(rolePerm).values(rolePermList).run();
		}

	},

	async delete(c: EnvContext, params: RoleIdInput) {
		const t = tFor(c);

		const { roleId } = params;

		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, boundId(roleId))).get();

		if (!roleRow) {
			throw new BizError(t('notExist'));
		}

		if (roleRow.isDefault) {
			throw new BizError(t('delDefRole'));
		}

		const defRoleRow = await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();

		if (!defRoleRow) throw new TypeError("Cannot read properties of undefined (reading 'roleId')");
		await userDao.updateAllUserType(c, defRoleRow.roleId, roleId);

		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, boundId(roleId))).run();
		await orm(c).delete(role).where(eq(role.roleId, boundId(roleId))).run();

	},

	roleSelectUse(c: EnvContext) {
		return orm(c).select({ name: role.name, roleId: role.roleId, isDefault: role.isDefault }).from(role).orderBy(asc(role.sort)).all();
	},

	async selectDefaultRole(c: EnvContext) {
		return await orm(c).select().from(role).where(eq(role.isDefault, roleConst.isDefault.OPEN)).get();
	},

	async setDefault(c: EnvContext, params: RoleIdInput) {
		const t = tFor(c);
		const roleRow = await orm(c).select().from(role).where(eq(role.roleId, boundId(params.roleId))).get();
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}
		await orm(c).update(role).set({ isDefault: 0 }).run();
		await orm(c).update(role).set({ isDefault: 1 }).where(eq(role.roleId, boundId(params.roleId))).run();
	},

	selectById(c: EnvContext, roleId: ScalarId) {
		return orm(c).select().from(role).where(eq(role.roleId, boundId(roleId))).get();
	},

	selectByIdsHasPermKey(c: EnvContext, types: (ScalarId | null)[], permKey: string) {
		return orm(c).select({ roleId: role.roleId, sendType: role.sendType, sendCount: role.sendCount }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), inArray(role.roleId, boundIds(types)))).all();
	},

	selectByIdsAndSendType(c: EnvContext, permKey: string, sendType: string) {
		return orm(c).select({ roleId: role.roleId }).from(perm)
			.leftJoin(rolePerm, eq(perm.permId, rolePerm.permId))
			.leftJoin(role, eq(role.roleId, rolePerm.roleId))
			.where(and(eq(perm.permKey, permKey), eq(role.sendType, sendType))).all();
	},

	selectByUserId(c: EnvContext, userId: ScalarId) {
		return orm(c).select(getTableColumns(role)).from(user).leftJoin(role, eq(role.roleId, user.type)).where(eq(user.userId, boundId(userId))).get();
	},

	hasAvailDomainPerm(availDomain: string | null, email: string) {

		const domains = csv(availDomain).split(',').filter(item => item !== '');

		if (domains.length === 0) {
			return true
		}

		const availIndex = domains.findIndex(item => {
			const domain = emailUtils.getDomain(email.toLowerCase());
			const availDomainItem = item.toLowerCase();
			return domain === availDomainItem
		})

		return availIndex > -1
	},

	selectByName(c: EnvContext, roleName: string) {
		return orm(c).select().from(role).where(eq(role.name, roleName)).get();
	},

	selectByUserIds(c: EnvContext, userIds: ScalarId[] | undefined) {

		if (!userIds || userIds.length === 0) {
			return [];
		}

		return orm(c).select({ ...getTableColumns(role), userId: user.userId }).from(user).leftJoin(role, eq(role.roleId, user.type)).where(inArray(user.userId, boundIds(userIds))).all();

	},

	isBanEmail(banEmail: string | null, fromEmail: string | null | undefined) {

		const emails = csv(banEmail).split(',').filter(item => item !== '');

		if (emails.includes('*')) {
			return true;
		}

		for (const item of emails) {

			if (verifyUtils.isDomain(item)) {

				const banDomain = item.toLowerCase();
				const receiveDomain = emailUtils.getDomain(lowerEmail(fromEmail));

				if (banDomain === receiveDomain) {
					return true;
				}

			} else {

				if (item.toLowerCase() === lowerEmail(fromEmail)) {

					return true;

				}

			}

		}

		return false;
	}
};

export default roleService;

function lowerEmail(value: string | null | undefined): string {
	if (value == null) throw new TypeError(`Cannot read properties of ${String(value)} (reading 'toLowerCase')`);
	return value.toLowerCase();
}
