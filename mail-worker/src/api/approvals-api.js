import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import permService from '../service/perm-service';
import notificationService from '../service/notification-service';

// Unified approval workflow. Finance approvals additionally require finance:approve;
// every other category requires approvals:approve. Access to a source module never
// implies approval authority.
const CATEGORIES = ['finance', 'document', 'access', 'project', 'procurement', 'operational', 'general'];
const PRIORITIES = ['critical', 'high', 'normal', 'low'];

function normalizeCategory(v) { return CATEGORIES.includes(v) ? v : 'general'; }
function normalizePriority(v) { return PRIORITIES.includes(v) ? v : 'normal'; }
function approvePerm(category) { return category === 'finance' ? 'finance:approve' : 'approvals:approve'; }
function has(keys, k) { return keys.includes('*') || keys.includes(k); }

// Always resolve from the database so role changes and per-user overrides
// take effect immediately (no stale cached permissions).
async function getPermKeys(c, userId) {
	return permService.userPermKeys(c, userId);
}

async function roleName(c, userId) {
	const row = await c.env.db.prepare(
		`SELECT r.name FROM user u LEFT JOIN role r ON r.role_id = u.type WHERE u.user_id = ?`
	).bind(userId).first();
	return row?.name || '';
}

async function logHistory(c, approvalId, actorId, action, fromStatus, toStatus, comment) {
	await c.env.db.prepare(
		`INSERT INTO approval_history (approval_id, actor_id, action, from_status, to_status, comment, create_time) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(approvalId, actorId ?? null, action, fromStatus ?? '', toStatus ?? '', comment ?? '').run();
}

async function getApproval(c, id) {
	return c.env.db.prepare(`SELECT * FROM approvals WHERE id = ? AND is_del = 0`).bind(id).first();
}

async function notifyApprover(c, row) {
	if (!row.approver_id) return;
	await notificationService.notify(c, {
		userId: row.approver_id,
		actorId: row.user_id,
		type: 'approval',
		title: `Approval requested: ${row.title}`,
		body: row.description || '',
		link: `/approvals/${row.id}`,
		eventKey: `approval:request:${row.id}`
	});
}

async function notifyRequester(c, row, statusText) {
	await notificationService.notify(c, {
		userId: row.user_id,
		actorId: row.decided_by,
		type: 'approval',
		title: `Approval ${statusText}: ${row.title}`,
		body: row.decision_comment || '',
		link: `/approvals/${row.id}`,
		eventKey: `approval:decision:${row.id}:${row.status}`
	});
}

app.get('/approvals', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	const {scope = 'inbox', status, category, page = 1, pageSize = 50} = c.req.query();

	const where = ['is_del = 0'];
	const params = [];

	if (scope === 'sent') {
		where.push('user_id = ?'); params.push(userId);
	} else if (scope === 'inbox') {
		const role = await roleName(c, userId);
		where.push('(approver_id = ? OR (approver_id IS NULL AND approver_group = ?))');
		params.push(userId, role);
	} else {
		if (!has(keys, 'approvals:query')) return c.json(result.fail('unauthorized', 403), 403);
	}
	if (status) { where.push('status = ?'); params.push(status); }
	if (category) { where.push('category = ?'); params.push(category); }

	const whereSql = where.join(' AND ');
	const listParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
	const {results} = await c.env.db.prepare(
		`SELECT * FROM approvals WHERE ${whereSql} ORDER BY (status = 'pending') DESC, (priority = 'critical') DESC, submit_time DESC LIMIT ? OFFSET ?`
	).bind(...listParams).all();
	const countRow = await c.env.db.prepare(`SELECT COUNT(*) as cnt FROM approvals WHERE ${whereSql}`).bind(...params).first();

	return c.json(result.ok({list: results, total: countRow?.cnt ?? 0}));
});

app.post('/approvals', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	if (!has(keys, 'approvals:add')) return c.json(result.fail('unauthorized', 403), 403);

	const body = await c.req.json();
	const category = normalizeCategory(body.category);
	const priority = normalizePriority(body.priority);
	const status = body.status === 'pending' ? 'pending' : 'draft';

	const {meta} = await c.env.db.prepare(
		`INSERT INTO approvals (user_id, category, title, description, approver_id, approver_group, source_module, source_type, source_id, priority, due_at, status, submit_time, create_time, update_time)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(
		userId, category, body.title ?? '', body.description ?? '',
		body.approver_id ?? null, body.approver_group ?? '',
		body.source_module ?? '', body.source_type ?? '', body.source_id ?? null,
		priority, body.due_at ?? null, status
	).run();
	const id = meta.last_row_id;
	await logHistory(c, id, userId, 'create', '', status, body.description || '');

	if (status === 'pending') {
		const row = await getApproval(c, id);
		await notifyApprover(c, row);
	}
	return c.json(result.ok({id, status}));
});

app.get('/approvals/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	const id = c.req.param('id');
	const row = await getApproval(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (!has(keys, 'approvals:query') && row.user_id !== userId && row.approver_id !== userId) {
		return c.json(result.fail('unauthorized', 403), 403);
	}
	const history = await c.env.db.prepare(
		`SELECT * FROM approval_history WHERE approval_id = ? ORDER BY create_time ASC, id ASC`
	).bind(id).all();
	return c.json(result.ok({...row, history: history.results || []}));
});

app.post('/approvals/:id/submit', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const row = await getApproval(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (row.user_id !== userId) return c.json(result.fail('unauthorized', 403), 403);
	if (!['draft', 'changes_requested', 'rejected'].includes(row.status)) {
		return c.json(result.fail('invalid transition', 400), 400);
	}
	await c.env.db.prepare(`UPDATE approvals SET status = 'pending', submit_time = CURRENT_TIMESTAMP, update_time = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
	await logHistory(c, id, userId, 'submit', row.status, 'pending', '');
	const updated = await getApproval(c, id);
	await notifyApprover(c, updated);
	return c.json(result.ok({status: 'pending'}));
});

app.post('/approvals/:id/approve', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	const id = c.req.param('id');
	const row = await getApproval(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (row.status !== 'pending') return c.json(result.fail('invalid transition', 400), 400);
	if (row.user_id === userId) return c.json(result.fail('cannot approve your own request', 403), 403);
	if (!has(keys, approvePerm(row.category))) return c.json(result.fail('unauthorized', 403), 403);

	const body = await c.req.json().catch(() => ({}));
	await c.env.db.prepare(
		`UPDATE approvals SET status = 'approved', decision_time = CURRENT_TIMESTAMP, decided_by = ?, decision_comment = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(userId, body.comment ?? '', id).run();
	const updated = await getApproval(c, id);
	await logHistory(c, id, userId, 'approve', 'pending', 'approved', body.comment ?? '');
	await notifyRequester(c, updated, 'approved');
	return c.json(result.ok({status: 'approved'}));
});

app.post('/approvals/:id/reject', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	const id = c.req.param('id');
	const row = await getApproval(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (row.status !== 'pending') return c.json(result.fail('invalid transition', 400), 400);
	if (!has(keys, approvePerm(row.category))) return c.json(result.fail('unauthorized', 403), 403);
	const body = await c.req.json().catch(() => ({}));
	if (!String(body.reason || '').trim()) return c.json(result.fail('reason required', 400), 400);

	await c.env.db.prepare(
		`UPDATE approvals SET status = 'rejected', decision_time = CURRENT_TIMESTAMP, decided_by = ?, decision_comment = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(userId, body.reason, id).run();
	const updated = await getApproval(c, id);
	await logHistory(c, id, userId, 'reject', 'pending', 'rejected', body.reason);
	await notifyRequester(c, updated, 'rejected');
	return c.json(result.ok({status: 'rejected'}));
});

app.post('/approvals/:id/request-changes', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	const id = c.req.param('id');
	const row = await getApproval(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (row.status !== 'pending') return c.json(result.fail('invalid transition', 400), 400);
	if (!has(keys, approvePerm(row.category))) return c.json(result.fail('unauthorized', 403), 403);
	const body = await c.req.json().catch(() => ({}));
	if (!String(body.reason || '').trim()) return c.json(result.fail('reason required', 400), 400);

	await c.env.db.prepare(
		`UPDATE approvals SET status = 'changes_requested', decision_time = CURRENT_TIMESTAMP, decided_by = ?, decision_comment = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(userId, body.reason, id).run();
	await logHistory(c, id, userId, 'request-changes', 'pending', 'changes_requested', body.reason);
	const updated = await getApproval(c, id);
	await notifyRequester(c, updated, 'needs changes');
	return c.json(result.ok({status: 'changes_requested'}));
});

app.post('/approvals/:id/cancel', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const row = await getApproval(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (row.user_id !== userId) return c.json(result.fail('unauthorized', 403), 403);
	if (['approved', 'rejected', 'cancelled'].includes(row.status)) return c.json(result.fail('invalid transition', 400), 400);
	await c.env.db.prepare(`UPDATE approvals SET status = 'cancelled', update_time = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
	await logHistory(c, id, userId, 'cancel', row.status, 'cancelled', '');
	return c.json(result.ok({status: 'cancelled'}));
});

app.post('/approvals/:id/comments', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	const id = c.req.param('id');
	const row = await getApproval(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (!has(keys, 'approvals:query') && row.user_id !== userId && row.approver_id !== userId) {
		return c.json(result.fail('unauthorized', 403), 403);
	}
	const body = await c.req.json().catch(() => ({}));
	if (!String(body.comment || '').trim()) return c.json(result.fail('comment required', 400), 400);
	await logHistory(c, id, userId, 'comment', row.status, row.status, body.comment);
	return c.json(result.ok());
});