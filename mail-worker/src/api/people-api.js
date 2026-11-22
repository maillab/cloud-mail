import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/people', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50 } = c.req.query();

	const { results } = await c.env.db.prepare(
		`SELECT * FROM people WHERE user_id = ? AND is_del = 0 ORDER BY name ASC LIMIT ? OFFSET ?`
	).bind(userId, Number(pageSize), (Number(page) - 1) * Number(pageSize)).all();

	return c.json(result.ok({ list: results, total: results.length }));
});

app.post('/people', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { name, email, phone, role, department, manager_id } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO people (user_id, name, email, phone, role, department, manager_id, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(userId, name ?? '', email ?? null, phone ?? null, role ?? '', department ?? null, manager_id ?? null).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/people/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { name, email, phone, role, department, manager_id } = body;

	await c.env.db.prepare(
		`UPDATE people SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), role = COALESCE(?, role), department = COALESCE(?, department), manager_id = COALESCE(?, manager_id), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(name ?? null, email ?? null, phone ?? null, role ?? null, department ?? null, manager_id ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/people/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE people SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
