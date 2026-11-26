import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import identityService from '../service/identity-service';
import roleService from '../service/role-service';
import permService from '../service/perm-service';
import securityService from '../service/security-service';
import userService from '../service/user-service';
import orm from '../entity/orm';
import user from '../entity/user';
import { eq } from 'drizzle-orm';
import dayjs from 'dayjs';

// ---------------------------------------------------------------------------
// XPass Team directory
//
// The canonical internal directory. Every row is a member of the company, with
// the identity, organisation, role, presence and account state the team page
// needs. External CRM contacts live elsewhere and are not mixed in here.
// ---------------------------------------------------------------------------

app.get('/team/members', async (c) => {
	const { search = '', teamId = '', status = '' } = c.req.query();

	const conditions = [`COALESCE(u.is_del, 0) = 0`];
	const params = [];

	if (search) {
		conditions.push(`(u.display_name LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR u.job_title LIKE ?)`);
		const like = `%${search}%`;
		params.push(like, like, like, like);
	}
	if (teamId) {
		conditions.push(`u.team_id = ?`);
		params.push(Number(teamId));
	}
	if (status !== '') {
		conditions.push(`u.status = ?`);
		params.push(Number(status));
	}

	const where = conditions.join(' AND ');

	const { results } = await c.env.db.prepare(
		`SELECT u.user_id, u.email, u.display_name, u.username, u.job_title, u.phone,
			u.team_id, u.status, u.type, u.mfa_enabled, u.password_change_required,
			u.onboarding_completed_at, u.last_seen_at, u.active_time,
			CASE WHEN u.last_seen_at IS NOT NULL
				AND u.last_seen_at > datetime('now', '-90 seconds') THEN 1 ELSE 0 END AS is_online,
			t.name AS team_name, t.slug AS team_slug
		 FROM user u LEFT JOIN team t ON t.team_id = u.team_id
		 WHERE ${where}
		 ORDER BY COALESCE(NULLIF(u.display_name, ''), u.email) ASC`
	).bind(...params).all();

	const list = [];
	for (const row of results || []) {
		const role = await roleService.selectById(c, row.type);
		list.push({
			userId: row.user_id,
			displayName: row.display_name || row.email.split('@')[0],
			username: row.username || '',
			email: row.email,
			phone: row.phone || '',
			jobTitle: row.job_title || '',
			position: row.job_title || '',
			team: row.team_id ? { id: row.team_id, name: row.team_name, slug: row.team_slug } : null,
			role: role ? { id: role.roleId, name: role.name } : null,
			status: row.status === 0 ? 'active' : 'suspended',
			mfaEnabled: row.mfa_enabled === 1,
			mfaPending: row.mfa_enabled !== 1,
			onboardingComplete: Boolean(row.onboarding_completed_at),
			pendingSetup: !row.onboarding_completed_at,
			passwordChangeRequired: row.password_change_required !== 'none',
			presence: {
				online: row.is_online === 1,
				lastSeenAt: row.last_seen_at || null
			},
			lastLoginAt: row.active_time || null
		});
	}

	return c.json(result.ok(list));
});

// ---------------------------------------------------------------------------
// Advanced account creation
//
// One workflow that does everything a new team member needs: identity,
// organisation, access and security. The temporary password is returned once
// and only to the administrator who created the account.
// ---------------------------------------------------------------------------

app.post('/team/member', async (c) => {
	const body = await c.req.json();
	const actor = userContext.getUserId(c);

	const email = String(body.email || '').trim().toLowerCase();
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new BizError('Enter a valid work email address.');
	}

	const existing = await userService.selectByEmailIncludeDel(c, email);
	if (existing) {
		throw new BizError('A member with that email already exists.');
	}

	const roleId = body.roleId ? Number(body.roleId) : undefined;
	const role = roleId
		? await roleService.selectById(c, roleId)
		: await roleService.selectDefaultRole(c);
	if (!role) {
		throw new BizError('Choose a role for this member.');
	}

	const displayName = identityService.normalizeDisplayName(
		body.displayName ?? body.display_name,
		email.split('@')[0]
	);

	let username = null;
	if (body.username) {
		username = identityService.validateUsername(body.username);
		await identityService.assertUsernameAvailable(c, username);
	}

	const jobTitle = identityService.normalizeJobTitle(body.jobTitle ?? body.position ?? '');
	const phone = body.phone ? identityService.normalizePhone(body.phone) : null;
	const teamId = body.teamId ? Number(body.teamId) : null;

	if (teamId) {
		const team = await c.env.db.prepare(`SELECT team_id FROM team WHERE team_id = ? AND is_active = 1`)
			.bind(teamId).first();
		if (!team) throw new BizError('That team does not exist.');
	}

	const cryptoUtils = (await import('../utils/crypto-utils')).default;
	const { generateTemporaryPassword } = await import('../utils/security-crypto');
	const generated = await generateTemporaryPassword(16);
	const temporaryPassword = body.password || generated;

	const { salt, hash } = await cryptoUtils.hashPassword(temporaryPassword);
	const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

	const { userId } = await orm(c).insert(user).values({
		email,
		password: hash,
		salt,
		type: role.roleId,
		displayName,
		username,
		jobTitle,
		phone,
		teamId,
		passwordChangeRequired: 'admin',
		onboardingStartedAt: now
	}).returning().get();

	// An optional team picker: the member can belong to several teams, with one
	// primary that the directory shows.
	if (teamId) {
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO user_team (user_id, team_id, is_primary) VALUES (?, ?, 1)`
		).bind(userId, teamId).run();
	}

	await userService.updateUserInfo(c, userId, true);

	await securityService.recordEvent(c, {
		userId,
		email,
		kind: 'account',
		outcome: 'created',
		detail: `Account created by ${c.get('user')?.email || 'administrator'} with role ${role.name}`
	});

	return c.json(result.ok({
		userId,
		email,
		displayName,
		temporaryPassword: body.password ? null : temporaryPassword,
		expiresInDays: securityService.inviteTtlDays()
	}));
});

// ---------------------------------------------------------------------------
// Member administration
// ---------------------------------------------------------------------------

app.put('/team/member/:id', async (c) => {
	const targetId = Number(c.req.param('id'));
	const body = await c.req.json();
	const row = await userService.selectById(c, targetId);
	if (!row) throw new BizError('That member does not exist.', 404);

	const patch = {};

	if (body.displayName !== undefined || body.display_name !== undefined) {
		patch.displayName = identityService.normalizeDisplayName(
			body.displayName ?? body.display_name,
			row.displayName || row.email.split('@')[0]
		);
	}

	if (body.username !== undefined) {
		if (!body.username) {
			patch.username = null;
		} else {
			const desired = identityService.validateUsername(body.username);
			await identityService.assertUsernameAvailable(c, desired, targetId);
			patch.username = desired;
		}
	}

	if (body.jobTitle !== undefined || body.position !== undefined) {
		patch.jobTitle = identityService.normalizeJobTitle(body.jobTitle ?? body.position);
	}

	if (body.phone !== undefined) {
		patch.phone = body.phone ? identityService.normalizePhone(body.phone) : null;
	}

	if (body.teamId !== undefined) {
		const teamId = body.teamId ? Number(body.teamId) : null;
		if (teamId) {
			const team = await c.env.db.prepare(`SELECT team_id FROM team WHERE team_id = ? AND is_active = 1`)
				.bind(teamId).first();
			if (!team) throw new BizError('That team does not exist.');
		}
		patch.teamId = teamId;
		await c.env.db.prepare(`UPDATE user_team SET is_primary = 0 WHERE user_id = ?`).bind(targetId).run();
		if (teamId) {
			await c.env.db.prepare(
				`INSERT OR IGNORE INTO user_team (user_id, team_id, is_primary) VALUES (?, ?, 1)`
			).bind(targetId, teamId).run();
			await c.env.db.prepare(
				`UPDATE user_team SET is_primary = 1 WHERE user_id = ? AND team_id = ?`
			).bind(targetId, teamId).run();
		}
	}

	if (body.roleId !== undefined) {
		const roleId = Number(body.roleId);
		const role = await roleService.selectById(c, roleId);
		if (!role) throw new BizError('That role does not exist.');
		patch.type = role.roleId;
	}

	if (Object.keys(patch).length) {
		await orm(c).update(user).set(patch).where(eq(user.userId, targetId)).run();
	}

	await securityService.recordEvent(c, {
		userId: targetId,
		email: row.email,
		kind: 'account',
		outcome: 'updated',
		detail: `Member profile updated by ${c.get('user')?.email || 'administrator'}`
	});

	return c.json(result.ok({ updated: Object.keys(patch) }));
});

app.post('/team/member/:id/teams', async (c) => {
	const targetId = Number(c.req.param('id'));
	const { teamId } = await c.req.json();
	if (!teamId) throw new BizError('Choose a team.');

	const team = await c.env.db.prepare(`SELECT team_id, name FROM team WHERE team_id = ? AND is_active = 1`)
		.bind(Number(teamId)).first();
	if (!team) throw new BizError('That team does not exist.');

	await c.env.db.prepare(
		`INSERT OR IGNORE INTO user_team (user_id, team_id, is_primary) VALUES (?, ?, 0)`
	).bind(targetId, Number(teamId)).run();

	return c.json(result.ok({ added: true }));
});

app.delete('/team/member/:id/teams/:teamId', async (c) => {
	const targetId = Number(c.req.param('id'));
	const teamId = Number(c.req.param('teamId'));
	await c.env.db.prepare(`DELETE FROM user_team WHERE user_id = ? AND team_id = ?`)
		.bind(targetId, teamId).run();
	return c.json(result.ok({ removed: true }));
});

// Suspend or reactivate. Suspension revokes every session immediately: a
// suspended member must not keep a working token.
app.put('/team/member/:id/status', async (c) => {
	const targetId = Number(c.req.param('id'));
	const { status, reason } = await c.req.json();
	const normalized = Number(status);
	if (![0, 1].includes(normalized)) {
		throw new BizError('Unknown account status.');
	}

	const row = await userService.selectById(c, targetId);
	if (!row) throw new BizError('That member does not exist.', 404);

	// A company must never be able to suspend its own last administrator into
	// a state where nobody can manage roles.
	if (normalized !== 0) {
		const permKeys = await permService.userPermKeys(c, targetId);
		if (permKeys.includes('role:set') || permKeys.includes('*')) {
			const admins = await c.env.db.prepare(
				`SELECT COUNT(*) as count FROM user WHERE user_id IN
					(SELECT user_id FROM user_perm_override WHERE perm_key = '*')
				 OR user_id = ?`
			).bind(targetId).first();
			const activeAdmins = await c.env.db.prepare(
				`SELECT COUNT(*) as count FROM user
				 WHERE COALESCE(is_del, 0) = 0 AND status = 0 AND type = 0`
			).first();
			if (activeAdmins?.count <= 1 && admins?.count) {
				throw new BizError('You cannot suspend the last administrator.');
			}
		}
	}

	await userService.setStatus(c, { status: normalized, userId: targetId });

	if (normalized !== 0) {
		await securityService.revokeAllSessions(c, targetId, 'suspended');
	}

	await securityService.recordEvent(c, {
		userId: targetId,
		email: row.email,
		kind: 'account',
		outcome: normalized === 0 ? 'suspended' : 'reactivated',
		detail: normalized === 0
			? `Account suspended by ${c.get('user')?.email || 'administrator'}. Reason: ${reason || 'not given'}`
			: `Account reactivated by ${c.get('user')?.email || 'administrator'}`
	});

	return c.json(result.ok({ status: normalized }));
});

// ---------------------------------------------------------------------------
// Team membership summary used by the team board
// ---------------------------------------------------------------------------

app.get('/team/members/:id/teams', async (c) => {
	const targetId = Number(c.req.param('id'));
	const { results } = await c.env.db.prepare(
		`SELECT t.team_id, t.name, t.slug, ut.is_primary
		 FROM user_team ut JOIN team t ON t.team_id = ut.team_id
		 WHERE ut.user_id = ? ORDER BY ut.is_primary DESC, t.name ASC`
	).bind(targetId).all();
	return c.json(result.ok(results || []));
});

app.get('/team/overview', async (c) => {
	const [{ total }, { online }, { pending }, { suspended }, teamRows] = await Promise.all([
		c.env.db.prepare(`SELECT COUNT(*) as total FROM user WHERE COALESCE(is_del,0) = 0`).first(),
		c.env.db.prepare(
			`SELECT COUNT(*) as online FROM user
			 WHERE COALESCE(is_del,0) = 0 AND last_seen_at > datetime('now', '-90 seconds')`
		).first(),
		c.env.db.prepare(
			`SELECT COUNT(*) as pending FROM user WHERE COALESCE(is_del,0) = 0 AND onboarding_completed_at IS NULL`
		).first(),
		c.env.db.prepare(`SELECT COUNT(*) as suspended FROM user WHERE COALESCE(is_del,0) = 0 AND status <> 0`).first(),
		c.env.db.prepare(
			`SELECT t.team_id, t.name, t.slug,
				(SELECT COUNT(*) FROM user u WHERE u.team_id = t.team_id AND COALESCE(u.is_del,0) = 0) AS member_count
			 FROM team t WHERE t.is_active = 1 ORDER BY t.sort ASC, t.name ASC`
		).all()
	]);

	return c.json(result.ok({
		total: total?.total || 0,
		online: online?.online || 0,
		pendingSetup: pending?.pending || 0,
		suspended: suspended?.suspended || 0,
		teams: teamRows.results || []
	}));
});