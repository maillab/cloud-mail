import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import scopeService from '../service/scope-service';
import permService from '../service/perm-service';

function assigneeLabel(row) {
	if (!row || !row.assignee_id) return null;
	const name = row.assignee_name || row.assignee_email || '';
	const handle = row.assignee_username ? ` (@${row.assignee_username})` : '';
	return `${name}${handle}`;
}

const ASSIGNEE_SELECT = `
	, u.display_name AS assignee_name
	, u.username AS assignee_username
	, u.email AS assignee_email
`;

const ASSIGNEE_JOIN = `LEFT JOIN user u ON u.user_id = crm_leads.assignee_id`;

app.get('/crm/leads', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, status, search, assignee } = c.req.query();

	const scope = await scopeService.resolveScope(c, userId);
	const filter = scopeService.scopePredicate(scope, userId, 'user_id', {
		assigneeColumn: 'assignee_id',
		table: 'crm_leads',
		teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
	});

	let sql = `SELECT crm_leads.* ${ASSIGNEE_SELECT} FROM crm_leads ${ASSIGNEE_JOIN} WHERE crm_leads.is_del = 0`;
	const params = [];
	if (filter.clause) { sql += ` AND ${filter.clause}`; params.push(...filter.params); }

	if (status) { sql += ` AND crm_leads.status = ?`; params.push(status); }
	if (assignee === 'me') { sql += ` AND crm_leads.assignee_id = ?`; params.push(userId); }
	else if (assignee === 'unassigned') { sql += ` AND crm_leads.assignee_id IS NULL`; }
	else if (assignee) { sql += ` AND crm_leads.assignee_id = ?`; params.push(Number(assignee)); }

	if (search) {
		sql += ` AND (crm_leads.name LIKE ? OR crm_leads.email LIKE ? OR crm_leads.phone LIKE ? OR crm_leads.company LIKE ?)`;
		const like = `%${search}%`;
		params.push(like, like, like, like);
	}

	sql += ` ORDER BY crm_leads.update_time DESC LIMIT ? OFFSET ?`;
	const listParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
	const { results } = await c.env.db.prepare(sql).bind(...listParams).all();

	let countSql = `SELECT COUNT(*) as cnt FROM crm_leads crm_leads ${ASSIGNEE_JOIN} WHERE crm_leads.is_del = 0`;
	const countParams = [...filter.params];
	if (filter.clause) countSql += ` AND ${filter.clause}`;
	if (status) { countSql += ` AND crm_leads.status = ?`; countParams.push(status); }
	if (assignee === 'me') { countSql += ` AND crm_leads.assignee_id = ?`; countParams.push(userId); }
	else if (assignee === 'unassigned') { countSql += ` AND crm_leads.assignee_id IS NULL`; }
	else if (assignee) { countSql += ` AND crm_leads.assignee_id = ?`; countParams.push(Number(assignee)); }
	if (search) {
		countSql += ` AND (crm_leads.name LIKE ? OR crm_leads.email LIKE ? OR crm_leads.phone LIKE ? OR crm_leads.company LIKE ?)`;
		const like = `%${search}%`;
		countParams.push(like, like, like, like);
	}
	const countRow = await c.env.db.prepare(countSql).bind(...countParams).first();

	const list = (results || []).map(row => ({ ...row, assignee: assigneeLabel(row) }));
	return c.json(result.ok({ list, total: countRow?.cnt ?? 0 }));
});

// Assignment needs the explicit assign permission; view or edit rights are not
// enough to hand a lead to another member.
app.put('/crm/leads/:id/assignee', async (c) => {
	const keys = await permService.userPermKeys(c, userContext.getUserId(c));
	if (!keys.includes('leads:assign') && !keys.includes('*')) {
		throw new BizError('Unauthorized', 403);
	}
	const actorId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const assigneeId = body.assignee_id === null || body.assignee_id === '' || body.assignee_id === undefined
		? null
		: Number(body.assignee_id);

	const lead = await c.env.db.prepare(
		`SELECT id, user_id, assignee_id, name FROM crm_leads WHERE id = ? AND is_del = 0`
	).bind(id).first();
	if (!lead) return c.json(result.fail('Lead not found', 404));

	if (assigneeId !== null) {
		const target = await c.env.db.prepare(
			`SELECT user_id FROM user WHERE user_id = ? AND COALESCE(is_del, 0) = 0`
		).bind(assigneeId).first();
		if (!target) throw new BizError('That team member cannot be assigned work.', 400);
	}

	await c.env.db.prepare(
		`UPDATE crm_leads SET assignee_id = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(assigneeId, id).run();

	const label = async (memberId) => {
		if (!memberId) return 'nobody';
		const row = await c.env.db.prepare(`SELECT display_name, username, email FROM user WHERE user_id = ?`).bind(memberId).first();
		if (!row) return `member ${memberId}`;
		return row.username ? `${row.display_name || row.email} (@${row.username})` : (row.display_name || row.email);
	};
	const [fromLabel, toLabel] = await Promise.all([label(lead.assignee_id ?? null), label(assigneeId)]);

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time)
		 VALUES (?, 'lead', ?, 'assign', ?, ?, CURRENT_TIMESTAMP)`
	).bind(actorId, id, `Assigned lead ${lead.name || ''} to ${toLabel}`, `${fromLabel} -> ${toLabel}`).run();

	return c.json(result.ok({ id: Number(id), assignee_id: assigneeId }));
});

// Detail read, resolved through the same scope predicate as the list so a lead
// assigned to a member is readable by them even when somebody else created it.
function leadScopeFilter(scope, userId) {
	return scopeService.scopePredicate(scope, userId, 'user_id', {
		assigneeColumn: 'assignee_id',
		table: 'crm_leads',
		teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
	});
}

app.get('/crm/leads/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	const scope = await scopeService.resolveScope(c, userId);
	const filter = scopeService.scopePredicate(scope, userId, 'user_id', {
		assigneeColumn: 'assignee_id',
		table: 'crm_leads',
		teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
	});

	const where = filter.clause
		? `crm_leads.id = ? AND crm_leads.is_del = 0 AND ${filter.clause}`
		: 'crm_leads.id = ? AND crm_leads.is_del = 0';

	const row = await c.env.db.prepare(
		`SELECT crm_leads.* ${ASSIGNEE_SELECT} FROM crm_leads ${ASSIGNEE_JOIN} WHERE ${where}`
	).bind(id, ...filter.params).first();

	if (!row) {
		return c.json(result.fail('Lead not found', 404));
	}

	return c.json(result.ok({ ...row, assignee: assigneeLabel(row) }));
});

app.post('/crm/leads', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { name, email, phone, company, source, status, value_cents, currency, notes, assigned_to } = body;

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_leads (user_id, name, email, phone, company, source, status, value_cents, currency, notes, assigned_to, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, name ?? '', email ?? null, phone ?? null, company ?? null, source ?? 'manual', status ?? 'new', value_cents ?? 0, currency ?? 'KES', notes ?? '', assigned_to ?? null).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/crm/leads/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const { name, email, phone, company, source, status, value_cents, currency, notes, assigned_to } = body;

	const scope = await scopeService.resolveScope(c, userId);
	const filter = leadScopeFilter(scope, userId);
	const where = filter.clause
		? `crm_leads.id = ? AND crm_leads.is_del = 0 AND ${filter.clause}`
		: 'crm_leads.id = ? AND crm_leads.is_del = 0';
	const existing = await c.env.db.prepare(`SELECT id, name FROM crm_leads crm_leads WHERE ${where}`)
		.bind(id, ...filter.params).first();

	if (!existing) {
		return c.json(result.fail('Lead not found', 404));
	}

	await c.env.db.prepare(
		`UPDATE crm_leads SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), company = COALESCE(?, company), source = COALESCE(?, source), status = COALESCE(?, status), value_cents = COALESCE(?, value_cents), currency = COALESCE(?, currency), notes = COALESCE(?, notes), assigned_to = COALESCE(?, assigned_to), update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(name ?? null, email ?? null, phone ?? null, company ?? null, source ?? null, status ?? null, value_cents ?? null, currency ?? null, notes ?? null, assigned_to ?? null, id).run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time)
		 VALUES (?, 'lead', ?, 'edit', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, id, `Updated lead ${name ?? existing.name ?? ''}`, '').run();

	return c.json(result.ok());
});

app.delete('/crm/leads/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');

	const scope = await scopeService.resolveScope(c, userId);
	const filter = leadScopeFilter(scope, userId);
	const where = filter.clause
		? `crm_leads.id = ? AND crm_leads.is_del = 0 AND ${filter.clause}`
		: 'crm_leads.id = ? AND crm_leads.is_del = 0';
	const existing = await c.env.db.prepare(`SELECT id, name FROM crm_leads crm_leads WHERE ${where}`)
		.bind(id, ...filter.params).first();

	if (!existing) {
		return c.json(result.fail('Lead not found', 404));
	}

	await c.env.db.prepare(`UPDATE crm_leads SET is_del = 1, update_time = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time)
		 VALUES (?, 'lead', ?, 'delete', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, id, `Archived lead ${existing.name ?? ''}`, '').run();

	return c.json(result.ok({ id: Number(id) }));
});
