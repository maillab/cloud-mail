import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/notifications', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, is_read } = c.req.query();

	const countParams = [userId];
	let countSql = `SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ?`;
	if (is_read !== undefined) {
		countSql += ` AND is_read = ?`;
		countParams.push(is_read === 'true' ? 1 : 0);
	}
	const countRow = await c.env.db.prepare(countSql).bind(...countParams).first();
	const unreadRow = Number(page) === 1
		? await c.env.db.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0`).bind(userId).first()
		: null;

	let sql = `SELECT * FROM notifications WHERE user_id = ?`;
	const params = [userId];
	if (is_read !== undefined) {
		sql += ` AND is_read = ?`;
		params.push(is_read === 'true' ? 1 : 0);
	}
	sql += ` ORDER BY create_time DESC LIMIT ? OFFSET ?`;
	params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

	const { results } = await c.env.db.prepare(sql).bind(...params).all();

	return c.json(result.ok({
		list: results,
		total: countRow?.cnt ?? 0,
		unread: unreadRow ? (unreadRow.cnt ?? 0) : undefined
	}));
});

app.post('/notifications', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { actor_user_id, type, title, body: bodyText, link, event_key } = body;

	// Idempotent: the same logical event (event_key) is delivered only once per user.
	if (event_key) {
		const existing = await c.env.db.prepare(
			`SELECT id FROM notifications WHERE user_id = ? AND event_key = ? LIMIT 1`
		).bind(userId, event_key).first();
		if (existing) return c.json(result.ok({ id: existing.id, deduped: true }));
	}

	const { meta } = await c.env.db.prepare(
		`INSERT INTO notifications (user_id, actor_user_id, type, title, body, link, event_key, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, actor_user_id ?? null, type ?? 'info', title ?? '', bodyText ?? '', link ?? '', event_key ?? '').run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/notifications/read-all', async (c) => {
	const userId = userContext.getUserId(c);
	await c.env.db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`).bind(userId).run();
	return c.json(result.ok());
});

app.put('/notifications/:id/read', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});

app.delete('/notifications/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
