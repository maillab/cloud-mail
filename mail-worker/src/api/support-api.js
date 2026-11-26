import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/support', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, status, priority } = c.req.query();

	let sql = `SELECT * FROM support_requests WHERE user_id = ? AND is_del = 0`;
	const params = [userId];

	if (status) {
		sql += ` AND status = ?`;
		params.push(status);
	}
	if (priority) {
		sql += ` AND priority = ?`;
		params.push(priority);
	}

	sql += ` ORDER BY create_time DESC LIMIT ? OFFSET ?`;
	params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

	const { results } = await c.env.db.prepare(sql).bind(...params).all();
	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM support_requests WHERE user_id = ? AND is_del = 0${status ? ' AND status = ?' : ''}${priority ? ' AND priority = ?' : ''}`
	).bind(...params.filter((_, i) => i < params.length - 2)).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

	app.post('/support', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { assignee_id, title, description, status, priority } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO support_requests (user_id, assignee_id, title, description, status, priority, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(userId, assignee_id ?? null, title ?? '', description ?? '', status ?? 'open', priority ?? 'normal').run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time) VALUES (?, 'support_request', ?, 'create', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, meta.last_row_id, `Created support request: ${title ?? ''}`, title ?? '').run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/support/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { assignee_id, title, description, status, priority } = body;

	await c.env.db.prepare(
		`UPDATE support_requests SET assignee_id = ?, title = ?, description = ?, status = ?, priority = ?, update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
	).bind(assignee_id ?? null, title ?? '', description ?? '', status ?? 'open', priority ?? 'normal', id, userId).run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time) VALUES (?, 'support_request', ?, 'edit', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, id, `Updated support request: ${title ?? ''}`, title ?? '').run();

	return c.json(result.ok());
});

app.delete('/support/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE support_requests SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time) VALUES (?, 'support_request', ?, 'delete', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, id, 'Deleted support request', 'Support request removed').run();

	return c.json(result.ok());
});
