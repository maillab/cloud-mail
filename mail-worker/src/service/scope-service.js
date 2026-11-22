import BizError from '../error/biz-error';

// Record scope policy. A permission says WHAT an employee may do; scope says
// WHICH records. Scope is resolved from the employee's own override first, then
// their role, and defaults to 'own' so a missing policy never widens access.
export const SCOPES = ['own', 'assigned', 'team', 'company'];

export function normalizeScope(value, fallback = 'own') {
	const scope = String(value ?? '').trim().toLowerCase();
	return SCOPES.includes(scope) ? scope : fallback;
}

// Resolved per request on purpose: caching a scope across requests would keep
// stale access after a role change. The lookup is a single indexed read and only
// happens on endpoints that return records.
export async function resolveScope(c, userId) {
	const row = await c.env.db.prepare(
		`SELECT u.data_scope AS user_scope, r.data_scope AS role_scope
		 FROM user u LEFT JOIN role r ON r.role_id = u.type
		 WHERE u.user_id = ?`
	).bind(userId).first();

	return normalizeScope(row?.user_scope ?? row?.role_scope ?? 'own');
}

export function invalidateScope() {
	// Kept for callers that change scope policy; there is no cross-request cache
	// to clear, so this is a no-op today.
}

// Builds a SQL predicate for an ownership column.
//   own       -> records I created, or that are assigned to me when the table has
//                an assignee column (otherwise assignment would hide my own work)
//   assigned  -> assignee = me (falls back to owner when the table has no assignee)
//   team      -> owner is a member of one of my teams
//   company   -> no restriction
// Returns { clause, params } where clause is '' when nothing restricts the query.
export function scopePredicate(scope, userId, ownerColumn = 'user_id', options = {}) {
	const { assigneeColumn = null, table = null, teamJoin = null } = options;
	const alias = table ? `${table}.` : '';

	if (scope === 'company') return { clause: '', params: [] };

	if (scope === 'assigned' && assigneeColumn) {
		const column = `${alias}${assigneeColumn}`;
		return { clause: `${column} = ?`, params: [userId] };
	}

	if (scope === 'team' && teamJoin) {
		return {
			clause: `${alias}${ownerColumn} IN (SELECT user_id FROM user_team WHERE team_id IN (${teamJoin}))`,
			params: [userId]
		};
	}

	if (scope === 'own' && assigneeColumn) {
		return {
			clause: `(${alias}${ownerColumn} = ? OR ${alias}${assigneeColumn} = ?)`,
			params: [userId, userId]
		};
	}

	return { clause: `${alias}${ownerColumn} = ?`, params: [userId] };
}

export function assertScope(c, scope) {
	if (!SCOPES.includes(scope)) {
		throw new BizError(`Unsupported data scope: ${scope}`, 400);
	}
	return scope;
}

export default { SCOPES, resolveScope, invalidateScope, scopePredicate, normalizeScope, assertScope };