import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

// AI assistance: suggestions only — never auto-executes. Stored in ai_suggestions for audit.

// Provider connection status. No provider is configured in this deployment, so
// the frontend shows an accurate connection-required state instead of faking work.
app.get('/ai/status', async (c) => {
	const configured = false;
	return c.json(result.ok({
		configured,
		provider: null,
		capabilities: [],
		note: configured ? '' : 'No AI provider configured.'
	}));
});

app.get('/ai/suggestions', async (c) => {
	const userId = userContext.getUserId(c);
	const { results } = await c.env.db.prepare(
		`SELECT * FROM ai_suggestions WHERE user_id = ? ORDER BY create_time DESC LIMIT 50`
	).bind(userId).all();
	return c.json(result.ok({ list: results }));
});

app.post('/ai/suggest', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { context_type, context_id, suggestion } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO ai_suggestions (user_id, context_type, context_id, suggestion, accepted, create_time) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`
	).bind(userId, context_type ?? 'generic', context_id ?? null, suggestion ?? '').run();

	return c.json(result.ok({ id: meta.last_row_id, suggestion: suggestion ?? '', auto_execute: false }));
});

app.put('/ai/suggestions/:id/accept', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	await c.env.db.prepare(`UPDATE ai_suggestions SET accepted = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	return c.json(result.ok());
});