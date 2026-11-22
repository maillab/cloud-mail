import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/crm/stages', async (c) => {
	const userId = userContext.getUserId(c);
	const { pipeline_id } = c.req.query();

	let sql = `SELECT * FROM crm_stages WHERE user_id = ? AND is_del = 0`;
	const params = [userId];

	if (pipeline_id) {
		sql += ` AND pipeline_id = ?`;
		params.push(pipeline_id);
	}

	sql += ` ORDER BY position ASC`;

	const { results } = await c.env.db.prepare(sql).bind(...params).all();

	return c.json(result.ok(results));
});

app.post('/crm/stages', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { pipeline_id, name, slug, position, color, is_won, is_lost } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_stages (pipeline_id, user_id, name, slug, position, color, is_won, is_lost, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(pipeline_id, userId, name ?? '', slug ?? '', position ?? 1000, color ?? null, is_won ?? 0, is_lost ?? 0).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/stages/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { name, slug, position, color, is_won, is_lost } = body;

	await c.env.db.prepare(
		`UPDATE crm_stages SET name = COALESCE(?, name), slug = COALESCE(?, slug), position = COALESCE(?, position), color = COALESCE(?, color), is_won = COALESCE(?, is_won), is_lost = COALESCE(?, is_lost), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(name, slug, position, color, is_won, is_lost, id, userId).run();

	return c.json(result.ok());
});

app.delete('/crm/stages/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_stages SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
