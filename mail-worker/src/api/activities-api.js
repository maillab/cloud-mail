import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import scopeService from '../service/scope-service';

app.get('/crm/activities', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, entity_type, entity_id, search } = c.req.query();

// Activity belongs to the record it describes, not only to whoever logged it:
	// a member sees activity for contacts and leads they are allowed to see, plus
	// anything they logged themselves. Scope is applied in SQL, never after the fact.
	const scope = await scopeService.resolveScope(c, userId);

	const conditions = ['is_del = 0'];
	const params = [];

	if (scope === 'company') {
		conditions.push('(user_id = ? OR entity_type IN (\'contact\', \'lead\'))');
		params.push(userId);
	} else {
		// Own entries are always visible; other people's entries only when the
		// underlying record is visible to this member.
		const parts = ['user_id = ?'];
		params.push(userId);

		const contactScope = scopeService.scopePredicate(scope, userId, 'user_id', {
			assigneeColumn: 'assignee_id',
			// No table prefix: the predicate runs inside a subquery aliased as c.
			teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
		});
		if (contactScope.clause) {
			parts.push('EXISTS (SELECT 1 FROM crm_contacts c WHERE c.id = crm_activities.entity_id AND crm_activities.entity_type = \'contact\' AND ' + contactScope.clause + ')');
			params.push(...contactScope.params);
		}

		const leadScope = scopeService.scopePredicate(scope, userId, 'user_id', {
			assigneeColumn: 'assignee_id',
			// No table prefix: the predicate runs inside a subquery aliased as l.
			teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
		});
		if (leadScope.clause) {
			parts.push('EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = crm_activities.entity_id AND crm_activities.entity_type = \'lead\' AND ' + leadScope.clause + ')');
			params.push(...leadScope.params);
		}

		conditions.push('(' + parts.join(' OR ') + ')');
	}

	if (entity_type) {
		conditions.push('entity_type = ?');
		params.push(entity_type);
	}
	if (entity_id) {
		conditions.push('entity_id = ?');
		params.push(entity_id);
	}
	if (search) {
		conditions.push('(subject LIKE ? OR description LIKE ?)');
		params.push(`%${search}%`, `%${search}%`);
	}
	const where = conditions.join(' AND ');

	const sql = `SELECT id, entity_type, entity_id, activity_type, subject, description,
			COALESCE(NULLIF(occurred_at, ''), create_time) AS occurred_at, create_time
		FROM crm_activities WHERE ${where} ORDER BY occurred_at DESC LIMIT ? OFFSET ?`;
	const { results } = await c.env.db.prepare(sql)
		.bind(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)).all();
	const countRow = await c.env.db.prepare(`SELECT COUNT(*) as cnt FROM crm_activities WHERE ${where}`)
		.bind(...params).first();

	const list = results || [];
	await attachEntityNames(c, userId, list);

	return c.json(result.ok({ list, total: countRow?.cnt ?? 0 }));
});

const ENTITY_SOURCES = {
	contact: ['crm_contacts', 'name'],
	organization: ['crm_organizations', 'name'],
	company: ['crm_organizations', 'name'],
	deal: ['crm_deals', 'title'],
	opportunity: ['crm_deals', 'title'],
	task: ['crm_tasks', 'title'],
	event: ['crm_events', 'name'],
	support_request: ['support_requests', 'title']
};

async function attachEntityNames(c, userId, rows) {
	const refs = {};
	for (const row of rows) {
		if (!row.entity_id) continue;
		(refs[row.entity_type] = refs[row.entity_type] || new Set()).add(Number(row.entity_id));
	}

	const names = new Map();
	for (const [type, ids] of Object.entries(refs)) {
		const source = ENTITY_SOURCES[type];
		if (!source) continue;
		const [table, column] = source;
		const idList = [...ids];
		const placeholders = idList.map(() => '?').join(',');
		// Names are resolved for records the member may see, not only for records
		// they created, so an activity row about an assigned record still has a label.
		const { results } = await c.env.db.prepare(
			`SELECT id, ${column} AS label FROM ${table} WHERE id IN (${placeholders}) AND COALESCE(is_del, 0) = 0`
		).bind(...idList).all();
		for (const item of results || []) names.set(`${type}:${item.id}`, item.label);
	}

	for (const row of rows) {
		row.entity_name = names.get(`${row.entity_type}:${row.entity_id}`) || '';
	}
}

app.post('/crm/activities', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { entity_type, entity_id, activity_type, subject, description, occurred_at } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, occurred_at, create_time) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, entity_type ?? '', entity_id ?? 0, activity_type ?? '', subject ?? '', description ?? '', occurred_at ?? null).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.delete('/crm/activities/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	await c.env.db.prepare(`UPDATE crm_activities SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();

	return c.json(result.ok());
});
