import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/projects', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, status } = c.req.query();

	let sql = `SELECT * FROM projects WHERE user_id = ? AND is_del = 0`;
	const params = [userId];

	if (status) {
		sql += ` AND status = ?`;
		params.push(status);
	}

	sql += ` ORDER BY update_time DESC LIMIT ? OFFSET ?`;
	params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

	const { results } = await c.env.db.prepare(sql).bind(...params).all();
	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM projects WHERE user_id = ? AND is_del = 0${status ? ' AND status = ?' : ''}`
	).bind(...params.filter((_, i) => i < params.length - 2)).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.post('/projects', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { name, description, status, priority, due_date, owner_id } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO projects (user_id, name, description, status, priority, due_date, owner_id, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(userId, name ?? '', description ?? '', status ?? 'active', priority ?? 'normal', due_date ?? null, owner_id ?? null).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/projects/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { name, description, status, priority, due_date, owner_id } = body;

	await c.env.db.prepare(
		`UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status), priority = COALESCE(?, priority), due_date = COALESCE(?, due_date), owner_id = COALESCE(?, owner_id), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(name ?? null, description ?? null, status ?? null, priority ?? null, due_date ?? null, owner_id ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/projects/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE projects SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
