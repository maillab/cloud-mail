import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/crm/companies', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, search } = c.req.query();

	let sql = `SELECT * FROM crm_companies WHERE user_id = ? AND is_del = 0`;
	const params = [userId];

	if (search) {
		sql += ` AND (name LIKE ? OR domain LIKE ?)`;
		const like = `%${search}%`;
		params.push(like, like);
	}

	sql += ` ORDER BY update_time DESC LIMIT ? OFFSET ?`;
	params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

	const { results } = await c.env.db.prepare(sql).bind(...params).all();
	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM crm_companies WHERE user_id = ? AND is_del = 0`
	).bind(userId).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.post('/crm/companies', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { name, domain, industry, address, phone, website, notes } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_companies (user_id, name, domain, industry, address, phone, website, notes, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, name ?? '', domain ?? null, industry ?? null, address ?? null, phone ?? null, website ?? null, notes ?? '').run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/companies/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { name, domain, industry, address, phone, website, notes } = body;

	await c.env.db.prepare(
		`UPDATE crm_companies SET name = COALESCE(?, name), domain = COALESCE(?, domain), industry = COALESCE(?, industry), address = COALESCE(?, address), phone = COALESCE(?, phone), website = COALESCE(?, website), notes = COALESCE(?, notes), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(name ?? null, domain ?? null, industry ?? null, address ?? null, phone ?? null, website ?? null, notes ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/crm/companies/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_companies SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
