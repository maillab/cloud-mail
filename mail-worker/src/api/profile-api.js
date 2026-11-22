import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import identityService from '../service/identity-service';
import directoryService from '../service/directory-service';
import permService from '../service/perm-service';
import accessService from '../service/access-service';

// ---------------------------------------------------------------------------
// Self-service identity. Every handler resolves the acting user from the
// verified token and never from request input, so this surface can never be
// used to edit somebody else's profile.
// ---------------------------------------------------------------------------

async function loadSelfRow(c, userId) {
	const row = await c.env.db.prepare(
		`SELECT user_id, email, display_name, username, avatar_key, job_title, phone, team_id
		 FROM user WHERE user_id = ? AND COALESCE(is_del, 0) = 0`
	).bind(userId).first();
	if (!row) throw new BizError('Account not found', 404);
	return row;
}

app.get('/user/identity', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await loadSelfRow(c, userId);
	const team = row.team_id
		? await c.env.db.prepare(`SELECT team_id, name, slug FROM team WHERE team_id = ?`).bind(row.team_id).first()
		: null;

	return c.json(result.ok(identityService.toIdentity(c, row, { team })));
});

app.put('/user/profile', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const row = await loadSelfRow(c, userId);

	// Position and team are company administration fields: a member cannot move
	// themselves between teams or rewrite their own job title. Displaying them is
	// fine; changing them is an administrator action (PUT /user/:id/assignment).
	if (body.jobTitle !== undefined || body.job_title !== undefined) {
		throw new BizError('Your position is set by an administrator.', 403);
	}
	if (body.teamId !== undefined) {
		throw new BizError('Your team is set by an administrator.', 403);
	}

	const displayName = body.displayName === undefined && body.display_name === undefined
		? (row.display_name || row.email.split('@')[0])
		: identityService.normalizeDisplayName(body.displayName ?? body.display_name, row.display_name || row.email.split('@')[0]);

	const jobTitle = row.job_title || '';

	const phone = body.phone === undefined
		? (row.phone || '')
		: identityService.normalizePhone(body.phone);

	let username = row.username;
	if (body.username !== undefined && body.username !== null) {
		// Validate what was typed, not a rewritten version of it: silently
		// changing "has space" to "has-space" would leave the person guessing
		// why their handle is not what they entered.
		const requested = String(body.username).trim();
		if (!requested) {
			// An explicitly empty handle clears it: the field is optional.
			username = null;
		} else {
			const desired = identityService.validateUsername(requested);
			if (desired !== username) {
				await identityService.assertUsernameAvailable(c, desired, userId);
			}
			username = desired;
		}
	}

	const teamId = row.team_id ?? null;

	const avatarKey = await (async () => {
		if (body.avatar === null) {
			await identityService.deleteAvatar(c, row.avatar_key);
			return null;
		}
		if (typeof body.avatar === 'string' && body.avatar) {
			const key = await identityService.saveAvatar(c, userId, body.avatar);
			if (row.avatar_key) await identityService.deleteAvatar(c, row.avatar_key);
			return key;
		}
		return row.avatar_key ?? null;
	})();

	await c.env.db.prepare(
		`UPDATE user SET display_name = ?, username = ?, job_title = ?, phone = ?, team_id = ?,
			avatar_key = ?, update_time = CURRENT_TIMESTAMP
		 WHERE user_id = ?`
	).bind(displayName, username, jobTitle, phone || null, teamId, avatarKey, userId).run();


	const updated = await loadSelfRow(c, userId);
	const team = teamId
		? await c.env.db.prepare(`SELECT team_id, name, slug FROM team WHERE team_id = ?`).bind(teamId).first()
		: null;

	return c.json(result.ok(identityService.toIdentity(c, updated, { team })));
});

app.post('/user/avatar', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const row = await loadSelfRow(c, userId);
	const key = await identityService.saveAvatar(c, userId, body.avatar || body.image);
	await identityService.deleteAvatar(c, row.avatar_key);
	await c.env.db.prepare(
		`UPDATE user SET avatar_key = ?, update_time = CURRENT_TIMESTAMP WHERE user_id = ?`
	).bind(key, userId).run();

	return c.json(result.ok({ avatarUrl: identityService.avatarUrl(c.req.url, key) }));
});

app.delete('/user/avatar', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await loadSelfRow(c, userId);
	await identityService.deleteAvatar(c, row.avatar_key);
	await c.env.db.prepare(
		`UPDATE user SET avatar_key = NULL, update_time = CURRENT_TIMESTAMP WHERE user_id = ?`
	).bind(userId).run();

	return c.json(result.ok());
});

// Presence heartbeat. "Online" is a recent heartbeat, not a websocket, so the
// cost is one guarded row update per employee per minute. Time comparisons stay
// in SQL because D1 stores UTC and the browser's timezone must not shift the
// window.
const PRESENCE_REFRESH_SECONDS = 55;
const PRESENCE_ONLINE_SECONDS = 90;

app.post('/user/presence', async (c) => {
	const userId = userContext.getUserId(c);

	await c.env.db.prepare(
		`UPDATE user SET last_seen_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND (last_seen_at IS NULL OR last_seen_at <= datetime('now', '-${PRESENCE_REFRESH_SECONDS} seconds'))`
	).bind(userId).run();

	const row = await c.env.db.prepare(
		`SELECT last_seen_at FROM user WHERE user_id = ?`
	).bind(userId).first();

	return c.json(result.ok({
		lastSeenAt: row?.last_seen_at || null,
		online: true
	}));
});

// Effective access preview. A member may always read their own access; reading
// somebody else's requires the member-view permission, checked here rather than
// by path so self-service keeps working for every role.
app.get('/user/access', async (c) => {
	const userId = userContext.getUserId(c);
	const requested = Number(c.req.query('userId')) || userId;

	if (requested !== userId) {
		const keys = await permService.userPermKeys(c, userId);
		if (!keys.includes('user:query')) {
			throw new BizError('Unauthorized', 403);
		}
		const target = await c.env.db.prepare(
			`SELECT user_id FROM user WHERE user_id = ? AND COALESCE(is_del, 0) = 0`
		).bind(requested).first();
		if (!target) throw new BizError('Member not found', 404);
	}

	return c.json(result.ok(await accessService.forMember(c, requested)));
});

// Write side of the individual-member access model. Only members who manage
// access (role:set) may change another person's direct overrides. Every change
// is audited, and the caller receives the recomputed effective access back.
app.put('/user/access', async (c) => {
	const actorId = userContext.getUserId(c);
	const actorKeys = await permService.userPermKeys(c, actorId);
	if (!actorKeys.includes('role:set') && !actorKeys.includes('*')) {
		throw new BizError('Unauthorized', 403);
	}
	const body = await c.req.json();
	const targetId = Number(body.userId);
	if (!targetId) {
		throw new BizError('userId is required', 400);
	}
	const effect = String(body.effect || '').trim();
	const permKeys = Array.isArray(body.permKeys) ? body.permKeys : [];
	return c.json(result.ok(await accessService.setMemberOverrides(c, {
		userId: targetId,
		permKeys,
		effect,
		actorId
	})));
});

// Company directory used by employee pickers (requests, assignments, sharing).
// Implementation is shared with the legacy GET /directory route.
app.get('/user/directory', async (c) => {
	const { list, total } = await directoryService.queryDirectory(c, c.req.query());
	return c.json(result.ok({ list, total }));
});

app.get('/setting/teams', async (c) => {
	const { include_archived } = c.req.query();
	const sql = include_archived
		? `SELECT t.*, (SELECT COUNT(*) FROM user u WHERE u.team_id = t.team_id AND COALESCE(u.is_del,0) = 0) AS member_count
		   FROM team t ORDER BY t.is_active DESC, t.sort ASC, t.name ASC`
		: `SELECT t.*, (SELECT COUNT(*) FROM user u WHERE u.team_id = t.team_id AND COALESCE(u.is_del,0) = 0) AS member_count
		   FROM team t WHERE t.is_active = 1 ORDER BY t.sort ASC, t.name ASC`;
	const { results } = await c.env.db.prepare(sql).all();
	return c.json(result.ok(results || []));
});

app.post('/setting/team', async (c) => {
	const body = await c.req.json();
	const name = String(body.name ?? '').trim().slice(0, 60);
	if (!name) throw new BizError('Team name is required.');

	const slug = String(body.slug ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40) || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

	// Archived teams are retired: their names are reusable so a renamed or
	// rebuilt team can take the old name back.
	const duplicate = await c.env.db.prepare(
		`SELECT team_id FROM team WHERE lower(name) = lower(?) AND is_active = 1 LIMIT 1`
	).bind(name).first();
	if (duplicate) throw new BizError('A team with that name already exists.');

	const sortRow = await c.env.db.prepare(`SELECT COALESCE(MAX(sort), 0) AS max_sort FROM team`).first();

	const { meta } = await c.env.db.prepare(
		`INSERT INTO team (name, slug, description, is_active, sort) VALUES (?, ?, ?, 1, ?)`
	).bind(name, slug, String(body.description ?? '').slice(0, 200), (sortRow?.max_sort || 0) + 10).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/setting/team/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const body = await c.req.json();

	const existing = await c.env.db.prepare(`SELECT * FROM team WHERE team_id = ?`).bind(id).first();
	if (!existing) throw new BizError('Team not found', 404);

	const name = body.name === undefined ? existing.name : String(body.name).trim().slice(0, 60);
	if (!name) throw new BizError('Team name is required.');

	if (body.name !== undefined) {
		const duplicate = await c.env.db.prepare(
			`SELECT team_id FROM team WHERE lower(name) = lower(?) AND is_active = 1 AND team_id <> ? LIMIT 1`
		).bind(name, id).first();
		if (duplicate) throw new BizError('A team with that name already exists.');
	}

	await c.env.db.prepare(
		`UPDATE team SET name = ?, description = ?, is_active = ?, sort = ?, update_time = CURRENT_TIMESTAMP WHERE team_id = ?`
	).bind(
		name,
		body.description === undefined ? existing.description : String(body.description).slice(0, 200),
		body.isActive === undefined ? existing.is_active : (body.isActive ? 1 : 0),
		body.sort === undefined ? existing.sort : Number(body.sort),
		id
	).run();

	return c.json(result.ok());
});

app.delete('/setting/team/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const existing = await c.env.db.prepare(`SELECT * FROM team WHERE team_id = ?`).bind(id).first();
	if (!existing) throw new BizError('Team not found', 404);

	const members = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM user WHERE team_id = ? AND COALESCE(is_del, 0) = 0`
	).bind(id).first();

	// Archive rather than delete when people still belong to the team, so no
	// employee is ever silently detached from the company structure.
	await c.env.db.prepare(`UPDATE team SET is_active = 0, update_time = CURRENT_TIMESTAMP WHERE team_id = ?`).bind(id).run();
	await c.env.db.prepare(`UPDATE user_team SET is_primary = 0 WHERE team_id = ?`).bind(id).run();

	return c.json(result.ok({ archived: true, members: members?.cnt ?? 0 }));
});