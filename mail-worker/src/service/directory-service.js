import identityService from './identity-service';

// One implementation for both directory routes:
//   GET /user/directory  (profile API, canonical)
//   GET /directory       (legacy picker route, kept for existing callers)
// Identity fields only: no credentials, no permission keys, no phone numbers.
const MAX_PAGE_SIZE = 200;
// A heartbeat is considered "online" for this long. Keep in step with the
// presence endpoint in profile-api.js.
const ONLINE_WINDOW_SECONDS = 90;

function clamp(value, fallback) {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) return fallback;
	return Math.trunc(n);
}

export async function queryDirectory(c, query = {}) {
	const search = typeof query.search === 'string' ? query.search.trim() : '';
	const teamId = clamp(query.team_id, 0);
	const limit = Math.min(clamp(query.pageSize, 50), MAX_PAGE_SIZE);
	const page = clamp(query.page, 1);
	const offset = (page - 1) * limit;

	const conditions = [`COALESCE(u.is_del, 0) = 0`];
	const params = [];

	if (search) {
		conditions.push(`(
			u.display_name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.job_title LIKE ? OR t.name LIKE ?
		)`);
		const like = `%${search}%`;
		params.push(like, like, like, like, like);
	}
	if (teamId) {
		conditions.push(`u.team_id = ?`);
		params.push(teamId);
	}
	const where = conditions.join(' AND ');

	const db = c.env.db;
	const from = `FROM user u LEFT JOIN team t ON t.team_id = u.team_id`;

	const { results } = await db.prepare(
		`SELECT u.user_id, u.display_name, u.username, u.email, u.job_title, u.avatar_key,
			u.team_id, u.last_seen_at,
			CASE WHEN u.last_seen_at IS NOT NULL
				AND u.last_seen_at > datetime('now', '-${ONLINE_WINDOW_SECONDS} seconds')
				THEN 1 ELSE 0 END AS is_online,
			t.name AS team_name, t.slug AS team_slug
		 ${from}
		 WHERE ${where}
		 ORDER BY COALESCE(NULLIF(u.display_name, ''), u.email) ASC
		 LIMIT ? OFFSET ?`
	).bind(...params, limit, offset).all();

	const countRow = await db.prepare(`SELECT COUNT(*) AS cnt ${from} WHERE ${where}`).bind(...params).first();

	const list = (results || []).map(row => {
		const identity = identityService.toIdentity(c, row, {
			team: row.team_id ? { team_id: row.team_id, name: row.team_name, slug: row.team_slug } : null
		});
		delete identity.phone;
		return {
			...identity,
			displayName: row.display_name || row.email.split('@')[0],
			initials: identityService.initialsFor(row.display_name || row.email.split('@')[0]),
			isOnline: row.is_online === 1,
			lastSeenAt: row.last_seen_at || null
		};
	});

	return { list, total: countRow?.cnt ?? 0 };
}

export default { queryDirectory };