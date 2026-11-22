import orm from '../entity/orm';
import perm from '../entity/perm';
import { eq, ne, and, asc } from 'drizzle-orm';
import rolePerm from '../entity/role-perm';
import user from '../entity/user';
import role from '../entity/role';
import { permConst } from '../const/entity-const';
import { t } from '../i18n/i18n'

const permService = {
	async tree(c) {
		const pList = await orm(c).select().from(perm).where(eq(perm.pid, 0)).orderBy(asc(perm.sort)).all();
		const cList = await orm(c).select().from(perm).where(ne(perm.pid, 0)).orderBy(asc(perm.sort)).all();

		cList.forEach(cItem => {
			cItem.name = t('perms.' + cItem.name)
		})

		pList.forEach(pItem => {
			pItem.name = t('perms.' + pItem.name)
			pItem.children = cList.filter(cItem => cItem.pid === pItem.permId)
		})
		return pList;
	},

	// Resolve permissions from the database only: the user's role BUTTON perms
	// plus per-user overrides. Never returns the '*' wildcard, so administrator
	// access is expressed as explicit keys. This keeps deny overrides effective
	// and stops record-level scope checks from being auto-bypassed.
	async resolvePermKeys(c, userId) {
		const {results} = await c.env.db.prepare(`
			SELECT DISTINCT perm.perm_key FROM perm
			INNER JOIN role_perm rp ON perm.perm_id = rp.perm_id
			INNER JOIN user u ON u.type = rp.role_id
			WHERE u.user_id = ? AND perm.type = ${permConst.type.BUTTON}
		`).bind(userId).all();

		const keys = new Set(results.map(p => p.perm_key).filter(Boolean));

		// Per-user overrides are applied on top of the role's permissions.
		try {
			const overrides = await c.env.db.prepare(`SELECT perm_key, effect FROM user_perm_override WHERE user_id = ?`).bind(userId).all();
			for (const o of overrides.results || []) {
				if (o.effect === 'deny') keys.delete(o.perm_key);
				else keys.add(o.perm_key);
			}
		} catch (e) {
			// Override table not yet created; role perms still apply.
		}

		return [...keys];
	},

	async userPermKeys(c, userId) {
		const userRow = await c.env.db.prepare(`SELECT email FROM user WHERE user_id = ?`).bind(userId).first();
		if (!userRow) {
			return [];
		}

		const keys = new Set(await permService.resolvePermKeys(c, userId));

		// The configured administrator receives every permission explicitly
		// instead of a blanket '*' wildcard, so user_perm_override deny rules
		// and record-level confidentiality checks still apply.
		if (userRow.email === c.env.admin) {
			const all = await c.env.db.prepare(`SELECT perm_key FROM perm WHERE type = ${permConst.type.BUTTON}`).all();
			for (const p of all.results || []) {
				if (p.perm_key) keys.add(p.perm_key);
			}
			// Re-apply denies so the administrator grant cannot override them.
			try {
				const denied = await c.env.db.prepare(`SELECT perm_key FROM user_perm_override WHERE user_id = ? AND effect = 'deny'`).bind(userId).all();
				for (const o of denied.results || []) {
					if (o.perm_key) keys.delete(o.perm_key);
				}
			} catch (e) {
				// Override table not yet created; full grant still applies.
			}
		}

		return [...keys];
	}
}

export default permService
