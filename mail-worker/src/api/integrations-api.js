import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

// Integration Manager: credentials are entered at runtime and NEVER returned by the API.
// Only metadata (provider, name, status) is exposed to the client.

app.get('/integrations', async (c) => {
	const userId = userContext.getUserId(c);
	const { results } = await c.env.db.prepare(
		`SELECT id, user_id, provider, name, status, create_time, update_time FROM integration_registry WHERE user_id = ? AND is_del = 0 ORDER BY create_time DESC`
	).bind(userId).all();
	return c.json(result.ok({ list: results, total: results.length }));
});

app.post('/integrations', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { provider, name, status } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO integration_registry (user_id, provider, name, status, credential_meta, create_time, update_time) VALUES (?, ?, ?, ?, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(userId, provider ?? '', name ?? '', status ?? 'disabled').run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/integrations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { provider, name, status } = body;

	await c.env.db.prepare(
		`UPDATE integration_registry SET provider = COALESCE(?, provider), name = COALESCE(?, name), status = COALESCE(?, status), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(provider ?? null, name ?? null, status ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/integrations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	await c.env.db.prepare(`UPDATE integration_registry SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	return c.json(result.ok());
});