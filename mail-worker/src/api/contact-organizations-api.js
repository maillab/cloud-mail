import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

app.get('/crm/contact-organizations', async (c) => {
	const userId = userContext.getUserId(c);
	const { contact_id, organization_id } = c.req.query();

	const conditions = ['r.user_id = ?', 'r.is_del = 0'];
	const params = [userId];

	if (contact_id) {
		conditions.push('r.contact_id = ?');
		params.push(contact_id);
	}
	if (organization_id) {
		conditions.push('r.organization_id = ?');
		params.push(organization_id);
	}

	const sql = `SELECT r.*,
			c.name AS contact_name,
			o.name AS organization_name
		FROM crm_contact_organizations r
		LEFT JOIN crm_contacts c ON c.id = r.contact_id
		LEFT JOIN crm_organizations o ON o.id = r.organization_id
		WHERE ${conditions.join(' AND ')}
		ORDER BY r.update_time DESC`;

	const { results } = await c.env.db.prepare(sql).bind(...params).all();

	return c.json(result.ok(results));
});

app.post('/crm/contact-organizations', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { contact_id, organization_id, role, is_primary } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_contact_organizations (user_id, contact_id, organization_id, role, is_primary, update_time) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, contact_id, organization_id, role ?? '', is_primary ?? 0).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/contact-organizations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { contact_id, organization_id, role, is_primary } = body;

	await c.env.db.prepare(
		`UPDATE crm_contact_organizations SET contact_id = COALESCE(?, contact_id), organization_id = COALESCE(?, organization_id), role = COALESCE(?, role), is_primary = COALESCE(?, is_primary), update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(contact_id ?? null, organization_id ?? null, role ?? null, is_primary ?? null, id, userId).run();

	return c.json(result.ok());
});

app.delete('/crm/contact-organizations/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_contact_organizations SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
