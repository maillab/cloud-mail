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
		// The access drawer requests this catalogue alongside the member preview.
		// Two ORM queries plus translation work made the drawer feel stuck on a
		// busy D1. Read the catalogue once, then build the same tree in memory.
		const { results } = await c.env.db.prepare(
			`SELECT perm_id, pid, perm_key, name, type, sort FROM perm ORDER BY sort ASC, perm_id ASC`
		).all();
		const rows = results || [];
		const pList = rows.filter((row) => Number(row.pid) === 0).map((row) => ({
			permId: row.perm_id, pid: row.pid, permKey: row.perm_key, name: row.name, type: row.type, sort: row.sort
		}));
		const cList = rows.filter((row) => Number(row.pid) !== 0).map((row) => ({
			permId: row.perm_id, pid: row.pid, permKey: row.perm_key, name: row.name, type: row.type, sort: row.sort
		}));

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
	// plus per-user overrides. A full-access override expands to the real keys
	// at read time rather than returning '*', so new capabilities are included
	// automatically while an intentional deny can still take effect.
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
			const rows = overrides.results || [];
			if (rows.some(o => o.effect === 'allow' && o.perm_key === '*')) {
				const all = await c.env.db.prepare(`SELECT perm_key FROM perm WHERE type = ${permConst.type.BUTTON}`).all();
				for (const p of all.results || []) {
					if (p.perm_key) keys.add(p.perm_key);
				}
			}
			for (const o of rows) {
				if (!o.perm_key || o.perm_key === '*') continue;
				if (o.effect === 'deny') keys.delete(o.perm_key);
				else if (o.effect === 'allow') keys.add(o.perm_key);
			}
		} catch (e) {
			// Override table not yet created; role perms still apply.
		}

		return [...keys];
	},

	async userPermKeys(c, userId) {
		// Security resolves the effective access plan before every protected
		// request. Route handlers also need that plan for record-level checks.
		// Reuse the exact result for the lifetime of this request instead of
		// asking D1 to resolve the same roles and overrides a second time.
		const requestCache = c.get?.('permissionKeys');
		if (requestCache?.userId === userId && Array.isArray(requestCache.keys)) {
			return [...requestCache.keys];
		}
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

		const resolved = [...keys];
		c.set?.('permissionKeys', { userId, keys: resolved });
		return [...resolved];
	}
}

export default permService
