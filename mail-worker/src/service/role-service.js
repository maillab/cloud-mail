import role from '../entity/role';
import orm from '../entity/orm';
import { eq, asc, inArray, and } from 'drizzle-orm';
import BizError from '../error/biz-error';
import rolePerm from '../entity/role-perm';
import perm from '../entity/perm';
import { permConst, roleConst } from '../const/entity-const';
import userService from './user-service';
import user from '../entity/user';
import verifyUtils from '../utils/verify-utils';
import { t } from '../i18n/i18n.js';
import emailUtils from '../utils/email-utils';

const roleService = {

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


	},

	async roleList(c) {

		const roleList = await orm(c).select().from(role).orderBy(asc(role.sort)).all();
		const permList = await orm(c).select({ permId: perm.permId, roleId: rolePerm.roleId }).from(rolePerm)
			.leftJoin(perm, eq(perm.permId, rolePerm.permId))
			.where(eq(perm.type, permConst.type.BUTTON)).all();

		roleList.forEach(role => {
			role.banEmail = role.banEmail.split(",").filter(item => item !== "");
			role.availDomain = role.availDomain.split(",").filter(item => item !== "");
			role.permIds = permList.filter(perm => perm.roleId === role.roleId).map(perm => perm.permId);
		});

		return roleList;
	},

	async setRole(c, params) {

		let { name, permIds, roleId, banEmail, availDomain } = params;

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

		await orm(c).update(role).set({...params, banEmail, availDomain}).where(eq(role.roleId, roleId)).run();
		await orm(c).delete(rolePerm).where(eq(rolePerm.roleId, roleId)).run();

		if (permIds.length > 0) {
			const rolePermList = permIds.map(permId => ({ permId, roleId: roleId }));
			await orm(c).insert(rolePerm).values(rolePermList).run();
		}

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
	},

	selectById(c, roleId) {
		return orm(c).select().from(role).where(eq(role.roleId, roleId)).get();
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

	selectByName(c, roleName) {
		return orm(c).select().from(role).where(eq(role.name, roleName)).get();
	},

	selectByUserIds(c, userIds) {

		if (!userIds || userIds.length === 0) {
			return [];
		}

		return orm(c).select({ ...role, userId: user.userId }).from(user).leftJoin(role, eq(role.roleId, user.type)).where(inArray(user.userId, userIds)).all();

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
