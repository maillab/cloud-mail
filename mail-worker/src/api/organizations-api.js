import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/crm/organizations', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, search, organization_type, relationship_status } = c.req.query();

	let sql = `SELECT * FROM crm_organizations WHERE is_del = 0`;
	const params = [];

	if (search) {
		sql += ` AND (name LIKE ? OR legal_name LIKE ? OR brand_name LIKE ? OR address LIKE ?)`;
		const like = `%${search}%`;
		params.push(like, like, like, like);
	}
	if (organization_type) {
		sql += ` AND organization_type = ?`;
		params.push(organization_type);
	}
	if (relationship_status) {
		sql += ` AND relationship_status = ?`;
		params.push(relationship_status);
	}

	sql += ` ORDER BY update_time DESC LIMIT ? OFFSET ?`;
	params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));

	const { results } = await c.env.db.prepare(sql).bind(...params).all();
	let countSql = `SELECT COUNT(*) as cnt FROM crm_organizations WHERE is_del = 0`;
	const countParams = [];
	if (search) {
		countSql += ` AND (name LIKE ? OR legal_name LIKE ? OR brand_name LIKE ? OR address LIKE ?)`;
		const like = `%${search}%`;
		countParams.push(like, like, like, like);
	}
	if (organization_type) { countSql += ` AND organization_type = ?`; countParams.push(organization_type); }
	if (relationship_status) { countSql += ` AND relationship_status = ?`; countParams.push(relationship_status); }
	const countRow = await c.env.db.prepare(countSql).bind(...countParams).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.get('/crm/organizations/:id', async (c) => {
	const row = await c.env.db.prepare(`SELECT * FROM crm_organizations WHERE id = ? AND is_del = 0`)
		.bind(c.req.param('id')).first();
	if (!row) return c.json(result.fail('Organization not found', 404), 404);
	return c.json(result.ok(row));
});

app.post('/crm/organizations', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { parent_id, name, legal_name, brand_name, organization_type, website, social_links, address, relationship_status, commercial_terms, assigned_to, created_by } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_organizations (user_id, parent_id, name, legal_name, brand_name, organization_type, website, social_links, address, relationship_status, commercial_terms, assigned_to, created_by, updated_by, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, parent_id ?? null, name ?? '', legal_name ?? '', brand_name ?? '', organization_type ?? 'partner', website ?? '', social_links ?? '[]', address ?? '', relationship_status ?? 'active', commercial_terms ?? '', assigned_to ?? null, created_by ?? userId, created_by ?? userId).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/organizations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { parent_id, name, legal_name, brand_name, organization_type, website, social_links, address, relationship_status, commercial_terms, assigned_to, updated_by, version } = body;

	await c.env.db.prepare(
		`UPDATE crm_organizations SET parent_id = COALESCE(?, parent_id), name = COALESCE(?, name), legal_name = COALESCE(?, legal_name), brand_name = COALESCE(?, brand_name), organization_type = COALESCE(?, organization_type), website = COALESCE(?, website), social_links = COALESCE(?, social_links), address = COALESCE(?, address), relationship_status = COALESCE(?, relationship_status), commercial_terms = COALESCE(?, commercial_terms), assigned_to = COALESCE(?, assigned_to), updated_by = COALESCE(?, updated_by), version = version + 1, update_time = CURRENT_TIMESTAMP WHERE id = ? AND is_del = 0`
	).bind(parent_id ?? null, name ?? null, legal_name ?? null, brand_name ?? null, organization_type ?? null, website ?? null, social_links ?? null, address ?? null, relationship_status ?? null, commercial_terms ?? null, assigned_to ?? null, updated_by ?? null, id).run();

	return c.json(result.ok());
});

app.delete('/crm/organizations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_organizations SET is_del = 1 WHERE id = ?`).bind(id).run();

	return c.json(result.ok());
});
