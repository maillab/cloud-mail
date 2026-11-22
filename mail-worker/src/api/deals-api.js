import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/crm/deals', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, pipeline_id, status } = c.req.query();

	let sql = `SELECT * FROM crm_deals WHERE user_id = ? AND is_del = 0`;
	const params = [userId];

	if (pipeline_id) {
		sql += ` AND pipeline_id = ?`;
		params.push(pipeline_id);
	}
	if (status) {
		sql += ` AND status = ?`;
		params.push(status);
	}

	sql += ` ORDER BY update_time DESC LIMIT ? OFFSET ?`;
	params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

	const { results } = await c.env.db.prepare(sql).bind(...params).all();
	let countSql = `SELECT COUNT(*) as cnt FROM crm_deals WHERE user_id = ? AND is_del = 0`;
	const countParams = [userId];
	if (pipeline_id) { countSql += ` AND pipeline_id = ?`; countParams.push(pipeline_id); }
	if (status) { countSql += ` AND status = ?`; countParams.push(status); }
	const countRow = await c.env.db.prepare(countSql).bind(...countParams).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.post('/crm/deals', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { pipeline_id, stage_id, contact_id, company_id, title, value_cents, currency, status, expected_close_date } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_deals (user_id, pipeline_id, stage_id, contact_id, company_id, title, value_cents, currency, status, expected_close_date, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, pipeline_id ?? null, stage_id ?? null, contact_id ?? null, company_id ?? null, title ?? '', value_cents ?? 0, currency ?? 'KES', status ?? 'open', expected_close_date ?? null).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/deals/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { pipeline_id, stage_id, contact_id, company_id, title, value_cents, currency, status, expected_close_date } = body;

	await c.env.db.prepare(
		`UPDATE crm_deals SET pipeline_id = COALESCE(?, pipeline_id), stage_id = COALESCE(?, stage_id), contact_id = COALESCE(?, contact_id), company_id = COALESCE(?, company_id), title = COALESCE(?, title), value_cents = COALESCE(?, value_cents), currency = COALESCE(?, currency), status = COALESCE(?, status), expected_close_date = COALESCE(?, expected_close_date), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(pipeline_id ?? null, stage_id ?? null, contact_id ?? null, company_id ?? null, title ?? null, value_cents ?? null, currency ?? null, status ?? null, expected_close_date ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/crm/deals/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_deals SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
