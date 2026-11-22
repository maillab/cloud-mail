import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/crm/tasks', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, status, deal_id, contact_id, assigned_to } = c.req.query();

	const where = [`user_id = ?`, `is_del = 0`];
	const params = [userId];

	if (status) {
		where.push(`status = ?`);
		params.push(status);
	}
	if (deal_id) {
		where.push(`deal_id = ?`);
		params.push(deal_id);
	}
	if (contact_id) {
		where.push(`contact_id = ?`);
		params.push(contact_id);
	}
	if (assigned_to) {
		where.push(`assigned_to = ?`);
		params.push(assigned_to);
	}
	const whereSql = where.join(' AND ');

	const sql = `SELECT * FROM crm_tasks WHERE ${whereSql} ORDER BY due_at ASC, create_time DESC LIMIT ? OFFSET ?`;
	const listParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
	const { results } = await c.env.db.prepare(sql).bind(...listParams).all();
	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM crm_tasks WHERE ${whereSql}`
	).bind(...params).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.post('/crm/tasks', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { deal_id, contact_id, title, description, status, priority, due_at, assigned_to } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_tasks (user_id, deal_id, contact_id, title, description, status, priority, due_at, assigned_to, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, deal_id ?? null, contact_id ?? null, title ?? '', description ?? '', status ?? 'pending', priority ?? 'medium', due_at ?? null, assigned_to ?? null).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/tasks/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { deal_id, contact_id, title, description, status, priority, due_at, assigned_to } = body;

	await c.env.db.prepare(
		`UPDATE crm_tasks SET deal_id = COALESCE(?, deal_id), contact_id = COALESCE(?, contact_id), title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), priority = COALESCE(?, priority), due_at = COALESCE(?, due_at), assigned_to = COALESCE(?, assigned_to), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(deal_id ?? null, contact_id ?? null, title ?? null, description ?? null, status ?? null, priority ?? null, due_at ?? null, assigned_to ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/crm/tasks/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_tasks SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
