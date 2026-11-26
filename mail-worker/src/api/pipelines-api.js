import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/crm/pipelines', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50 } = c.req.query();

	const { results } = await c.env.db.prepare(
		`SELECT * FROM crm_pipelines WHERE user_id = ? AND is_del = 0 ORDER BY position ASC LIMIT ? OFFSET ?`
	).bind(userId, Number(pageSize), (Number(page) - 1) * Number(pageSize)).all();

	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM crm_pipelines WHERE user_id = ? AND is_del = 0`
	).bind(userId).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.post('/crm/pipelines', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { name, slug, description, position } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_pipelines (user_id, name, slug, description, position, update_time) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, name ?? '', slug ?? '', description ?? '', position ?? 1000).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/pipelines/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { name, slug, description, position } = body;

	await c.env.db.prepare(
		`UPDATE crm_pipelines SET name = COALESCE(?, name), slug = COALESCE(?, slug), description = COALESCE(?, description), position = COALESCE(?, position), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(name, slug, description, position, id, userId).run();

	return c.json(result.ok());
});

app.delete('/crm/pipelines/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_pipelines SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
