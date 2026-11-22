import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/automations', async (c) => {
	const userId = userContext.getUserId(c);
	const { results } = await c.env.db.prepare(
		`SELECT * FROM automation_rules WHERE user_id = ? AND is_del = 0 ORDER BY create_time DESC`
	).bind(userId).all();
	return c.json(result.ok({ list: results, total: results.length }));
});

app.post('/automations', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { name, trigger_type, trigger_config, action_type, action_config, enabled } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO automation_rules (user_id, name, trigger_type, trigger_config, action_type, action_config, enabled, create_time, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(userId, name ?? '', trigger_type ?? 'manual', JSON.stringify(trigger_config ?? {}), action_type ?? 'notify', JSON.stringify(action_config ?? {}), enabled === false ? 0 : 1).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/automations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { name, trigger_type, trigger_config, action_type, action_config, enabled } = body;

	await c.env.db.prepare(
		`UPDATE automation_rules SET name = COALESCE(?, name), trigger_type = COALESCE(?, trigger_type), trigger_config = COALESCE(?, trigger_config), action_type = COALESCE(?, action_type), action_config = COALESCE(?, action_config), enabled = COALESCE(?, enabled), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(name ?? null, trigger_type ?? null, trigger_config ? JSON.stringify(trigger_config) : null, action_type ?? null, action_config ? JSON.stringify(action_config) : null, enabled ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/automations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	await c.env.db.prepare(`UPDATE automation_rules SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	return c.json(result.ok());
});