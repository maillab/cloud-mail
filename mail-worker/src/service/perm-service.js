import orm from '../entity/orm';
import perm from '../entity/perm';
import { eq, and, asc } from 'drizzle-orm';
import rolePerm from '../entity/role-perm';
import user from '../entity/user';
import role from '../entity/role';
import { permConst } from '../const/entity-const';
import { t } from '../i18n/i18n'

const permService = {
	async tree(c) {
		// Build the permission hierarchy recursively instead of assuming that the
		// database only ever has two levels. This keeps Web/iOS role editors stable
		// when a deployment adds third-level groups or migrates older permission rows.
		const rows = await orm(c).select().from(perm).orderBy(asc(perm.sort), asc(perm.permId)).all();
		const nodes = new Map();

		for (const row of rows) {
			nodes.set(row.permId, {
				...row,
				name: t('perms.' + row.name),
				children: []
			});
		}

		const roots = [];
		for (const row of rows) {
			const node = nodes.get(row.permId);
			const parent = row.pid ? nodes.get(row.pid) : null;
			if (parent && parent.permId !== node.permId) parent.children.push(node);
			else roots.push(node);
		}

		return roots;
	},

	async userPermKeys(c, userId) {
		const userPerms = await orm(c).select({permKey: perm.permKey}).from(user)
			.leftJoin(role, eq(role.roleId,user.type))
			.rightJoin(rolePerm, eq(rolePerm.roleId,role.roleId))
			.leftJoin(perm, eq(rolePerm.permId,perm.permId))
			.where(and(eq(user.userId,userId),eq(perm.type,permConst.type.BUTTON)))
			.all();
		return userPerms.map(perm => perm.permKey);
	}
}

export default permService
