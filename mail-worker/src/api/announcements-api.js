import app from '../hono/hono';
import announcementService from '../service/announcement-service';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import securityService from '../service/security-service';

// ---------------------------------------------------------------------------
// Member-facing
// ---------------------------------------------------------------------------

app.get('/announcements', async (c) => {
	const userId = userContext.getUserId(c);
	const [list, unreadCount] = await Promise.all([
		announcementService.listForMember(c, userId),
		announcementService.unreadCount(c, userId)
	]);
	return c.json(result.ok({ list, unreadCount }));
});

app.post('/announcements/:id/read', async (c) => {
	const userId = userContext.getUserId(c);
	await announcementService.markRead(c, Number(c.req.param('id')), userId);
	return c.json(result.ok());
});

app.post('/announcements/:id/ack', async (c) => {
	const userId = userContext.getUserId(c);
	const data = await announcementService.acknowledge(c, Number(c.req.param('id')), userId);
	return c.json(result.ok(data));
});

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

app.get('/announcements/manage', async (c) => {
	const list = await announcementService.listAll(c);
	return c.json(result.ok(list));
});

app.get('/announcements/manage/:id', async (c) => {
	const id = Number(c.req.param('id'));
	const [item, history] = await Promise.all([
		announcementService.get(c, id),
		announcementService.history(c, id)
	]);
	return c.json(result.ok({ item, history }));
});

app.post('/announcements/manage', async (c) => {
	const body = await c.req.json();
	const item = await announcementService.create(c, body, userContext.getUserId(c));
	return c.json(result.ok(item));
});

app.put('/announcements/manage/:id', async (c) => {
	const body = await c.req.json();
	const item = await announcementService.update(c, Number(c.req.param('id')), body, userContext.getUserId(c));
	return c.json(result.ok(item));
});

app.post('/announcements/manage/:id/status', async (c) => {
	const { status } = await c.req.json();
	const item = await announcementService.setStatus(c, Number(c.req.param('id')), status, userContext.getUserId(c));
	return c.json(result.ok(item));
});

app.delete('/announcements/manage/:id', async (c) => {
	await announcementService.remove(c, Number(c.req.param('id')), userContext.getUserId(c));
	return c.json(result.ok());
});

// ---------------------------------------------------------------------------
// Invitations (onboarding links bound to an existing account)
// ---------------------------------------------------------------------------

app.get('/invitations', async (c) => {
	const list = await securityService.listInvitations(c);
	const enriched = [];
	for (const row of list) {
		let name = row.display_name || '';
		if (!name) {
			const userRow = await userService.selectById(c, row.user_id);
			name = userRow?.displayName || userRow?.email || '';
		}
		enriched.push({
			...row,
			display_name: name,
			email: row.email
		});
	}
	return c.json(result.ok(enriched));
});

app.post('/invitations', async (c) => {
	const { userId, ttlDays } = await c.req.json();
	if (!userId) {
		throw new BizError('Choose the team member this invitation is for.');
	}
	const row = await userService.selectById(c, userId);
	if (!row) {
		throw new BizError('That member does not exist.', 404);
	}
	const invite = await securityService.createInvitation(c, userId, ttlDays);
	await securityService.recordEvent(c, {
		userId,
		email: row.email,
		kind: 'invitation',
		outcome: 'created',
		detail: `Onboarding invitation created by ${c.get('user')?.email || 'administrator'}`
	});
	return c.json(result.ok(invite));
});

app.delete('/invitations/:id', async (c) => {
	await securityService.revokeInvitation(c, Number(c.req.param('id')));
	return c.json(result.ok());
});