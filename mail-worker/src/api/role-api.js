import app from '../hono/hono';
import roleService from '../service/role-service';
import userContext from '../security/user-context';
import result from '../model/result';
import permService from '../service/perm-service';
import accessService from '../service/access-service';

app.post('/role/add', async (c) => {
	await roleService.add(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok());
});

app.put('/role/setDefault', async (c) => {
	await roleService.setDefault(c, await c.req.json());
	return c.json(result.ok());
});

app.put('/role/set', async (c) => {
	await roleService.setRole(c, await c.req.json());
	return c.json(result.ok());
});

app.get('/role/tree', async (c) => {
	const tree = await permService.tree(c);
	return c.json(result.ok(tree));
});

app.delete('/role/delete', async (c) => {
	await roleService.delete(c, c.req.query());
	return c.json(result.ok());
});

app.get('/role/list', async (c) => {
	const roleList = await roleService.roleList(c);
	return c.json(result.ok(roleList));
});

// One fast directory payload for the People & access screen. Keep this
// separate from role/list: baselines and people are different projections and
// neither screen should trigger N+1 member requests for the other.
app.get('/role/people', async (c) => {
	return c.json(result.ok(await roleService.peopleWithAccess(c)));
});

// Access history and membership back the role builder's History and Members tabs.
app.get('/role/history', async (c) => {
	const roleId = Number(c.req.query('roleId')) || 0;
	const list = await roleService.history(c, roleId);
	return c.json(result.ok(list));
});

app.get('/role/members', async (c) => {
	const roleId = Number(c.req.query('roleId'));
	if (!roleId) {
		return c.json(result.ok([]));
	}
	const list = await roleService.members(c, roleId);
	return c.json(result.ok(list));
});

// Preview of what a role definition would grant, resolved from the stored grants.
app.get('/role/access', async (c) => {
	const roleId = Number(c.req.query('roleId'));
	if (!roleId) return c.json(result.fail('roleId is required', 400));
	return c.json(result.ok(await accessService.forRole(c, roleId)));
});

app.get('/role/selectUse', async (c) => {
	const roleList = await roleService.roleSelectUse(c);
	return c.json(result.ok(roleList));
});

// Company administration of a member's identity: role, team and position are
// set here, never by the member. Every change is written to the access history.
app.put('/user/:id/assignment', async (c) => {
	const actorId = userContext.getUserId(c);
	const keys = await permService.userPermKeys(c, actorId);
	const targetId = Number(c.req.param('id'));
	const body = await c.req.json().catch(() => ({}));

	const target = await c.env.db.prepare(
		`SELECT user_id, email, display_name, type, team_id, job_title FROM user WHERE user_id = ? AND COALESCE(is_del, 0) = 0`
	).bind(targetId).first();
	if (!target) return c.json(result.fail('Member not found', 404), 404);

	const changes = [];

	if (body.roleId !== undefined) {
		if (!keys.includes('user:set-type') && !keys.includes('*')) {
			return c.json(result.fail('unauthorized', 403), 403);
		}
		const roleId = Number(body.roleId);
		const roleRow = await c.env.db.prepare(`SELECT role_id, name FROM role WHERE role_id = ?`).bind(roleId).first();
		if (!roleRow) throw new BizError('That role does not exist.', 400);
		if (roleRow.role_id !== target.type) {
			await c.env.db.prepare(`UPDATE user SET type = ? WHERE user_id = ?`).bind(roleRow.role_id, targetId).run();
			changes.push(`role ${target.type} -> ${roleRow.role_id}`);
			await roleService.recordAudit(c, {
				roleId: roleRow.role_id,
				roleName: roleRow.name,
				actorId,
				action: 'member',
				summary: `Set the role for ${target.email}`,
				detail: `role ${target.type} -> ${roleRow.role_id}`
			});
		}
	}

	if (body.teamId !== undefined) {
		if (!keys.includes('setting:set') && !keys.includes('*')) {
			return c.json(result.fail('unauthorized', 403), 403);
		}
		const teamId = body.teamId === null || body.teamId === '' ? null : Number(body.teamId);
		if (teamId) {
			const team = await c.env.db.prepare(`SELECT team_id FROM team WHERE team_id = ? AND is_active = 1`).bind(teamId).first();
			if (!team) throw new BizError('That team does not exist.', 400);
		}
		await c.env.db.prepare(`UPDATE user SET team_id = ? WHERE user_id = ?`).bind(teamId, targetId).run();
		await c.env.db.prepare(`DELETE FROM user_team WHERE user_id = ? AND is_primary = 1`).bind(targetId).run();
		if (teamId) {
			await c.env.db.prepare(
				`INSERT INTO user_team (user_id, team_id, is_primary) VALUES (?, ?, 1)`
			).bind(targetId, teamId).run();
		}
		changes.push(`team ${target.team_id ?? 'none'} -> ${teamId ?? 'none'}`);
		await roleService.recordAudit(c, {
			roleId: target.type,
			roleName: null,
			actorId,
			action: 'member',
			summary: `Changed the team for ${target.email}`,
			detail: `team ${target.team_id ?? 'none'} -> ${teamId ?? 'none'}`
		});
	}

	if (body.jobTitle !== undefined) {
		if (!keys.includes('user:set-type') && !keys.includes('*')) {
			return c.json(result.fail('unauthorized', 403), 403);
		}
		const jobTitle = String(body.jobTitle ?? '').trim().slice(0, 80) || null;
		await c.env.db.prepare(`UPDATE user SET job_title = ? WHERE user_id = ?`).bind(jobTitle, targetId).run();
		changes.push(`position ${target.job_title ?? 'none'} -> ${jobTitle ?? 'none'}`);
		await roleService.recordAudit(c, {
			roleId: target.type,
			roleName: null,
			actorId,
			action: 'member',
			summary: `Changed the position for ${target.email}`,
			detail: `position ${target.job_title ?? 'none'} -> ${jobTitle ?? 'none'}`
		});
	}

	const updated = await c.env.db.prepare(
		`SELECT u.user_id, u.email, u.display_name, u.username, u.job_title, u.team_id, r.name AS role_name, r.role_id
		 FROM user u LEFT JOIN role r ON r.role_id = u.type WHERE u.user_id = ?`
	).bind(targetId).first();

	return c.json(result.ok({ changes, member: updated || null }));
});

