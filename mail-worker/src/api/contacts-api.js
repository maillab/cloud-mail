import app from '../hono/hono';
import result from '../model/result';
import BizError from '../error/biz-error';
import userContext from '../security/user-context';
import scopeService from '../service/scope-service';
import permService from '../service/perm-service';

function normalizeContact(row) {
	if (!row) return row;
	if (typeof row.tags === 'string') {
		try {
			const parsed = JSON.parse(row.tags);
			row.tags = Array.isArray(parsed) ? parsed : [];
		} catch {
			row.tags = row.tags ? [row.tags] : [];
		}
	} else if (!Array.isArray(row.tags)) {
		row.tags = [];
	}
	return row;
}

// Canonical display for an assignee: display name with the @handle in brackets,
// falling back to email. Never a raw internal id in user-facing text.
function assigneeLabel(row) {
	if (!row || !row.assignee_id) return null;
	const name = row.assignee_name || row.assignee_email || '';
	const handle = row.assignee_username ? ` (@${row.assignee_username})` : '';
	return `${name}${handle}`;
}

async function requirePerm(c, key) {
	const userId = userContext.getUserId(c);
	const keys = await permService.userPermKeys(c, userId);
	if (!keys.includes(key) && !keys.includes('*')) {
		throw new BizError('Unauthorized', 403);
	}
	return userId;
}

const ASSIGNEE_SELECT = `
	, u.display_name AS assignee_name
	, u.username AS assignee_username
	, u.email AS assignee_email
	, u.is_del AS assignee_deleted
	, u.status AS assignee_status
`;

const ASSIGNEE_JOIN = `
	LEFT JOIN user u ON u.user_id = crm_contacts.assignee_id
`;

const ORGANIZATION_SELECT = `
	, (SELECT o.name FROM crm_contact_organizations r
	   JOIN crm_organizations o ON o.id = r.organization_id AND o.is_del = 0
	   WHERE r.contact_id = crm_contacts.id AND r.is_del = 0
	   ORDER BY r.is_primary DESC, r.id ASC LIMIT 1) AS organization_name
`;

app.get('/crm/contacts/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const scope = await scopeService.resolveScope(c, userId);

	const filter = scopeService.scopePredicate(scope, userId, 'user_id', {
		assigneeColumn: 'assignee_id',
		table: 'crm_contacts',
		teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
	});

	let sql = `SELECT crm_contacts.* ${ASSIGNEE_SELECT} ${ORGANIZATION_SELECT} FROM crm_contacts ${ASSIGNEE_JOIN} WHERE crm_contacts.id = ? AND crm_contacts.is_del = 0`;
	const params = [id];
	if (filter.clause) {
		sql += ` AND ${filter.clause.replace(/crm_contacts\./g, 'crm_contacts.')}`;
		params.push(...filter.params);
	}

	const row = await c.env.db.prepare(sql).bind(...params).first();
	if (!row) {
		return c.json(result.fail('Contact not found', 404));
	}

	const contact = normalizeContact(row);
	contact.assignee = assigneeLabel(row);
	return c.json(result.ok(contact));
});

app.get('/crm/contacts', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, search, assignee } = c.req.query();

	const scope = await scopeService.resolveScope(c, userId);
	const filter = scopeService.scopePredicate(scope, userId, 'user_id', {
		assigneeColumn: 'assignee_id',
		table: 'crm_contacts',
		teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
	});

	let sql = `SELECT crm_contacts.* ${ASSIGNEE_SELECT} ${ORGANIZATION_SELECT} FROM crm_contacts ${ASSIGNEE_JOIN} WHERE crm_contacts.is_del = 0`;
	const params = [];
	if (filter.clause) {
		sql += ` AND ${filter.clause}`;
		params.push(...filter.params);
	}

	// Assignment filters are applied after the scope predicate, so a member can
	// never use them to reach records outside their authorized scope.
	if (assignee === 'me') {
		sql += ` AND crm_contacts.assignee_id = ?`;
		params.push(userId);
	} else if (assignee === 'unassigned') {
		sql += ` AND crm_contacts.assignee_id IS NULL`;
	} else if (assignee) {
		sql += ` AND crm_contacts.assignee_id = ?`;
		params.push(Number(assignee));
	}

	if (search) {
		sql += ` AND (crm_contacts.name LIKE ? OR crm_contacts.email LIKE ? OR crm_contacts.phone LIKE ?)`;
		const like = `%${search}%`;
		params.push(like, like, like);
	}

	sql += ` ORDER BY crm_contacts.update_time DESC LIMIT ? OFFSET ?`;
	const listParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
	const { results } = await c.env.db.prepare(sql).bind(...listParams).all();

	const countSql = `SELECT COUNT(*) as cnt FROM crm_contacts crm_contacts ${ASSIGNEE_JOIN} WHERE crm_contacts.is_del = 0`
		+ (filter.clause ? ` AND ${filter.clause}` : '')
		+ (assignee === 'me' ? ` AND crm_contacts.assignee_id = ?` : '')
		+ (assignee === 'unassigned' ? ` AND crm_contacts.assignee_id IS NULL` : '')
		+ (assignee && assignee !== 'me' && assignee !== 'unassigned' ? ` AND crm_contacts.assignee_id = ?` : '')
		+ (search ? ` AND (crm_contacts.name LIKE ? OR crm_contacts.email LIKE ? OR crm_contacts.phone LIKE ?)` : '');

	const countParams = [...filter.params];
	if (assignee === 'me' || (assignee && assignee !== 'unassigned')) countParams.push(Number(assignee === 'me' ? userId : assignee));
	if (search) {
		const like = `%${search}%`;
		countParams.push(like, like, like);
	}

	const countRow = await c.env.db.prepare(countSql).bind(...countParams).first();

	const list = (results || []).map(row => {
		const contact = normalizeContact(row);
		contact.assignee = assigneeLabel(row);
		return contact;
	});

	return c.json(result.ok({ list, total: countRow?.cnt ?? 0 }));
});

app.post('/crm/contacts', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const { name, email, phone, company_id, address, tags, source, notes } = body;

	// Created by is the creator; assigned to starts as the creator and can be
	// handed to someone else later.
	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_contacts (user_id, assignee_id, name, email, phone, company_id, address, tags, source, notes, update_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, userId, name ?? '', email ?? null, phone ?? null, company_id ?? null, address ?? null, JSON.stringify(tags ?? []), source ?? 'manual', notes ?? '').run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time) VALUES (?, 'contact', ?, 'create', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, meta.last_row_id, `Created contact ${name ?? ''}`, name ?? '').run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

// Assignment. Requires the explicit assign permission: having edit rights does
// not imply the right to hand work to somebody else.
app.put('/crm/contacts/:id/assignee', async (c) => {
	const actorId = await requirePerm(c, 'contacts:assign');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const assigneeId = body.assignee_id === null || body.assignee_id === '' || body.assignee_id === undefined
		? null
		: Number(body.assignee_id);

	const contact = await c.env.db.prepare(
		`SELECT id, user_id, assignee_id, name FROM crm_contacts WHERE id = ? AND is_del = 0`
	).bind(id).first();

	if (!contact) {
		return c.json(result.fail('Contact not found', 404));
	}

	if (assigneeId !== null) {
		const target = await c.env.db.prepare(
			`SELECT user_id, display_name, username, email FROM user WHERE user_id = ? AND COALESCE(is_del, 0) = 0`
		).bind(assigneeId).first();
		// Suspended or removed members cannot receive work.
		if (!target) {
			throw new BizError('That team member cannot be assigned work.', 400);
		}
	}

	const previous = contact.assignee_id ?? null;
	if (previous === assigneeId) {
		return c.json(result.ok({ id: Number(id), assignee_id: assigneeId }));
	}

	await c.env.db.prepare(
		`UPDATE crm_contacts SET assignee_id = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(assigneeId, id).run();

	const label = async (userId) => {
		if (!userId) return 'nobody';
		const row = await c.env.db.prepare(
			`SELECT display_name, username, email FROM user WHERE user_id = ?`
		).bind(userId).first();
		if (!row) return `member ${userId}`;
		return row.username ? `${row.display_name || row.email} (@${row.username})` : (row.display_name || row.email);
	};

	const [fromLabel, toLabel] = await Promise.all([label(previous), label(assigneeId)]);

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time)
		 VALUES (?, 'contact', ?, 'assign', ?, ?, CURRENT_TIMESTAMP)`
	).bind(
		actorId,
		id,
		`Assigned contact ${contact.name || ''} to ${toLabel}`,
		`${fromLabel} -> ${toLabel}`
	).run();

	return c.json(result.ok({ id: Number(id), assignee_id: assigneeId }));
});

// Update and archive. Both resolve visibility through the same scope predicate as
// the list, so a member can only change records they are allowed to see.
app.put('/crm/contacts/:id', async (c) => {
	const userId = await requirePerm(c, 'contacts:edit');
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));

	const scope = await scopeService.resolveScope(c, userId);
	const filter = scopeService.scopePredicate(scope, userId, 'user_id', {
		assigneeColumn: 'assignee_id',
		table: 'crm_contacts',
		teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
	});

	const where = filter.clause
		? `crm_contacts.id = ? AND crm_contacts.is_del = 0 AND ${filter.clause}`
		: 'crm_contacts.id = ? AND crm_contacts.is_del = 0';
	const existing = await c.env.db.prepare(`SELECT * FROM crm_contacts crm_contacts WHERE ${where}`)
		.bind(id, ...filter.params).first();

	if (!existing) {
		return c.json(result.fail('Contact not found', 404));
	}

	let tags = existing.tags;
	if (Array.isArray(body.tags)) {
		tags = JSON.stringify(body.tags);
	} else if (typeof body.tags === 'string') {
		tags = JSON.stringify(body.tags.split(',').map(tag => tag.trim()).filter(Boolean));
	}

	await c.env.db.prepare(
		`UPDATE crm_contacts SET
			name = COALESCE(?, name),
			email = COALESCE(?, email), phone = COALESCE(?, phone), company_id = COALESCE(?, company_id),
			address = COALESCE(?, address), tags = ?,
			source = COALESCE(?, source), notes = COALESCE(?, notes), update_time = CURRENT_TIMESTAMP
		 WHERE id = ?`
	).bind(
		body.name ?? null,
		body.email ?? null,
		body.phone ?? null,
		body.company_id ?? null,
		body.address ?? null,
		tags,
		body.source ?? null,
		body.notes ?? null,
		id
	).run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time)
		 VALUES (?, 'contact', ?, 'edit', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, id, `Updated contact ${body.name ?? existing.name ?? ''}`, '').run();

	const row = await c.env.db.prepare(
		`SELECT crm_contacts.* ${ASSIGNEE_SELECT} FROM crm_contacts ${ASSIGNEE_JOIN} WHERE crm_contacts.id = ?`
	).bind(id).first();

	return c.json(result.ok(normalizeContact(row || {})));
});

app.delete('/crm/contacts/:id', async (c) => {
	const userId = await requirePerm(c, 'contacts:delete');
	const id = c.req.param('id');

	const scope = await scopeService.resolveScope(c, userId);
	const filter = scopeService.scopePredicate(scope, userId, 'user_id', {
		assigneeColumn: 'assignee_id',
		table: 'crm_contacts',
		teamJoin: 'SELECT team_id FROM user_team WHERE user_id = ?'
	});

	const where = filter.clause
		? `crm_contacts.id = ? AND crm_contacts.is_del = 0 AND ${filter.clause}`
		: 'crm_contacts.id = ? AND crm_contacts.is_del = 0';
	const existing = await c.env.db.prepare(`SELECT id, name FROM crm_contacts crm_contacts WHERE ${where}`)
		.bind(id, ...filter.params).first();

	if (!existing) {
		return c.json(result.fail('Contact not found', 404));
	}

	// Archive, not destroy: the record stays in history and can be restored.
	await c.env.db.prepare(`UPDATE crm_contacts SET is_del = 1, update_time = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();

	await c.env.db.prepare(
		`INSERT INTO crm_activities (user_id, entity_type, entity_id, activity_type, subject, description, create_time)
		 VALUES (?, 'contact', ?, 'delete', ?, ?, CURRENT_TIMESTAMP)`
	).bind(userId, id, `Archived contact ${existing.name ?? ''}`, '').run();

	return c.json(result.ok({ id: Number(id) }));
});
