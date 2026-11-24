import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import permService from '../service/perm-service';
import notificationService from '../service/notification-service';

// Internal requests between employees. Two kinds share a table:
//   action   — the recipient must do something
//   approval — the recipient must approve/reject something
// Status flows are validated per kind; history is written to internal_request_events.
// Internal request types. A type decides which actions exist; the coarse 'kind'
// still drives the transition table below so history and approvals keep working.
const TYPES = {
	action: {
		kind: 'action',
		label: 'Action',
		actions: ['accept', 'start', 'clarify', 'complete', 'decline', 'cancel']
	},
	approval: {
		kind: 'approval',
		label: 'Approval',
		actions: ['approve', 'reject', 'request-changes', 'cancel']
	},
	review: {
		kind: 'action',
		label: 'Review',
		actions: ['accept', 'complete', 'decline', 'cancel']
	},
	information: {
		kind: 'action',
		label: 'Information',
		actions: ['clarify', 'complete', 'cancel']
	},
	access: {
		kind: 'approval',
		label: 'Access',
		actions: ['approve', 'reject', 'request-changes', 'cancel']
	},
	finance: {
		kind: 'approval',
		label: 'Finance',
		actions: ['approve', 'reject', 'request-changes', 'cancel']
	},
	document: {
		kind: 'action',
		label: 'Document',
		actions: ['accept', 'complete', 'decline', 'cancel']
	},
	project: {
		kind: 'action',
		label: 'Project',
		actions: ['accept', 'start', 'complete', 'decline', 'cancel']
	},
	other: {
		kind: 'action',
		label: 'Other',
		actions: ['accept', 'start', 'complete', 'decline', 'cancel']
	}
};

function normalizeType(value, kind) {
	const key = String(value ?? '').trim().toLowerCase();
	if (TYPES[key]) return key;
	return kind === 'approval' ? 'approval' : 'action';
}

function typeOf(row) {
	return normalizeType(row.type, row.kind);
}

function actionsFor(row) {
	const type = TYPES[typeOf(row)] || TYPES.action;
	return type.actions;
}

const PRIORITIES = ['critical', 'high', 'normal', 'low'];
const TERMINAL = new Set(['completed', 'declined', 'cancelled', 'approved', 'rejected']);

const TRANSITIONS = {
	action: {
		accept: ['pending', 'needs_clarification'],
		start: ['pending', 'accepted'],
		clarify: ['pending', 'accepted', 'in_progress'],
		complete: ['pending', 'accepted', 'in_progress', 'needs_clarification'],
		decline: ['pending', 'accepted'],
		cancel: ['pending', 'accepted', 'in_progress', 'needs_clarification']
	},
	approval: {
		approve: ['pending_approval'],
		reject: ['pending_approval'],
		'request-changes': ['pending_approval'],
		cancel: ['pending_approval']
	}
};

const ACT_TO_STATUS = {
	accept: 'accepted',
	start: 'in_progress',
	clarify: 'needs_clarification',
	complete: 'completed',
	decline: 'declined',
	approve: 'approved',
	reject: 'rejected',
	'request-changes': 'changes_requested',
	cancel: 'cancelled'
};

function normalizeKind(v) { return v === 'approval' ? 'approval' : 'action'; }
function normalizePriority(v) { return PRIORITIES.includes(v) ? v : 'normal'; }
function has(keys, k) { return keys.includes('*') || keys.includes(k); }

// Always resolve from the database so role changes and per-user overrides
// take effect immediately (no stale cached permissions).
async function getPermKeys(c, userId) {
	return permService.userPermKeys(c, userId);
}

async function logEvent(c, requestId, actorId, action, fromStatus, toStatus, comment) {
	await c.env.db.prepare(
		`INSERT INTO internal_request_events (request_id, actor_id, action, from_status, to_status, comment, create_time) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(requestId, actorId ?? null, action, fromStatus ?? '', toStatus ?? '', comment ?? '').run();
}

async function getRequest(c, id) {
	return c.env.db.prepare(`SELECT * FROM internal_requests WHERE id = ? AND is_del = 0`).bind(id).first();
}

async function notify(c, {userId, actorId, title, body, link, eventKey}) {
	await notificationService.notify(c, {userId, actorId, type: 'request', title, body, link, eventKey});
}

app.get('/requests', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	if (!has(keys, 'requests:query')) return c.json(result.fail('unauthorized', 403), 403);

	const {scope = 'received', status, kind, type, search, overdue, page = 1, pageSize = 50} = c.req.query();
	const where = ['is_del = 0'];
	const params = [];

	if (scope === 'sent') {
		where.push('sender_id = ?'); params.push(userId);
	} else if (scope === 'team') {
		// Team inbox: requests involving anybody in the member's teams.
		where.push(`(
			sender_id = ?
			OR recipient_id = ?
			OR sender_id IN (SELECT user_id FROM user_team WHERE team_id IN (SELECT team_id FROM user_team WHERE user_id = ?))
			OR recipient_id IN (SELECT user_id FROM user_team WHERE team_id IN (SELECT team_id FROM user_team WHERE user_id = ?))
			OR team_id IN (SELECT team_id FROM user_team WHERE user_id = ?)
		)`);
		params.push(userId, userId, userId, userId, userId);
	} else if (scope === 'history') {
		// Terminal requests stay reachable: nothing is ever removed from history.
		where.push('(sender_id = ? OR recipient_id = ?)');
		params.push(userId, userId);
		if (!status) {
			where.push(`status IN ('completed','approved','declined','rejected','cancelled')`);
		}
	} else if (scope === 'open') {
		where.push('(recipient_id = ? OR sender_id = ?)');
		params.push(userId, userId);
		if (!status) {
			where.push(`status NOT IN ('completed','approved','declined','rejected','cancelled')`);
		}
	} else {
		where.push('recipient_id = ?'); params.push(userId);
	}
	if (status) { where.push('status = ?'); params.push(status); }
	if (kind) { where.push('kind = ?'); params.push(normalizeKind(kind)); }
	if (type) { where.push('type = ?'); params.push(normalizeType(type)); }
	if (search) {
		where.push('(title LIKE ? OR description LIKE ?)');
		const term = `%${String(search).trim()}%`;
		params.push(term, term);
	}
	if (overdue === '1' || overdue === 'true') {
		where.push(`due_date IS NOT NULL AND due_date < CURRENT_TIMESTAMP AND status NOT IN ('completed','declined','cancelled','approved','rejected')`);
	}

	const whereSql = where.join(' AND ');
	const listParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
	const {results} = await c.env.db.prepare(
		`SELECT * FROM internal_requests WHERE ${whereSql} ORDER BY (status IN ('pending','pending_approval')) DESC, (priority = 'critical') DESC, due_date ASC, create_time DESC LIMIT ? OFFSET ?`
	).bind(...listParams).all();
	const countRow = await c.env.db.prepare(`SELECT COUNT(*) as cnt FROM internal_requests WHERE ${whereSql}`).bind(...params).first();
	return c.json(result.ok({list: results, total: countRow?.cnt ?? 0}));
});

app.post('/requests', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	if (!has(keys, 'requests:add')) return c.json(result.fail('unauthorized', 403), 403);

	const body = await c.req.json().catch(() => ({}));
	const recipientId = Number(body.recipient_id);
	if (!recipientId || recipientId === userId) return c.json(result.fail('recipient required', 400), 400);

	const type = normalizeType(body.type, body.kind);
	const kind = TYPES[type].kind;
	const status = kind === 'approval' ? 'pending_approval' : 'pending';

	// Attachments are stored as references, never as uploaded content on the request.
	let attachments = [];
	if (Array.isArray(body.attachments)) {
		attachments = body.attachments
			.map(item => (typeof item === 'string' ? { url: item } : { url: item?.url, name: item?.name }))
			.filter(item => item.url)
			.slice(0, 10);
	}

	const {meta} = await c.env.db.prepare(
		`INSERT INTO internal_requests (sender_id, recipient_id, type, kind, title, description, priority, due_date, team_id, attachments, related_type, related_id, status, create_time, update_time)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(
		userId, recipientId, type, kind, body.title ?? '', body.description ?? '',
		normalizePriority(body.priority), body.due_date ?? null,
		body.team_id ? Number(body.team_id) : null, JSON.stringify(attachments),
		body.related_type ?? '', body.related_id ?? null, status
	).run();
	const id = meta.last_row_id;
	await logEvent(c, id, userId, 'create', '', status, body.description || '');
	await notify(c, {
		userId: recipientId, actorId: userId,
		title: `${kind === 'approval' ? 'Approval' : 'Action'} requested: ${body.title || ''}`,
		body: body.description || '', link: `/requests/${id}`, eventKey: `request:create:${id}`
	});
	return c.json(result.ok({id, status}));
});

app.get('/requests/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	if (!has(keys, 'requests:query')) return c.json(result.fail('unauthorized', 403), 403);
	const id = c.req.param('id');
	const row = await getRequest(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (row.sender_id !== userId && row.recipient_id !== userId) return c.json(result.fail('unauthorized', 403), 403);
	const events = await c.env.db.prepare(
		`SELECT e.*, u.display_name, u.username, u.email
		 FROM internal_request_events e
		 LEFT JOIN user u ON u.user_id = e.actor_id
		 WHERE e.request_id = ? ORDER BY e.create_time ASC, e.id ASC`
	).bind(id).all();

	const history = (events.results || []).map(event => ({
		...event,
		// Human-readable actor label: never a bare internal id in the UI.
		actor: event.actor_id
			? (event.username ? `${event.display_name || event.email} (@${event.username})` : (event.display_name || event.email))
			: null
	}));

	return c.json(result.ok({...row, type: typeOf(row), actions: actionsFor(row), events: history}));
});

app.post('/requests/:id/act', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	const id = c.req.param('id');
	const row = await getRequest(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);

	const body = await c.req.json().catch(() => ({}));
	const action = body.action;
	if (!action) return c.json(result.fail('action required', 400), 400);

	// The type decides which actions exist at all; the transition table then
	// decides whether the action is valid from the current status.
	if (!actionsFor(row).includes(action)) return c.json(result.fail('invalid action for this request type', 400), 400);

	const allowed = TRANSITIONS[row.kind] || {};
	if (!allowed[action]) return c.json(result.fail('invalid action', 400), 400);
	if (!allowed[action].includes(row.status)) return c.json(result.fail('invalid transition', 400), 400);

	const isSender = row.sender_id === userId;
	const isRecipient = row.recipient_id === userId;

	if (action === 'cancel') {
		if (!isSender) return c.json(result.fail('only the sender can cancel', 403), 403);
	} else {
		if (!isRecipient) return c.json(result.fail('only the recipient can act', 403), 403);
		if (!has(keys, 'requests:act')) return c.json(result.fail('unauthorized', 403), 403);
		if (row.kind === 'approval' && ['approve', 'reject', 'request-changes'].includes(action)) {
			// Finance approval requests additionally require finance approval authority.
			const needFinance = (body.category || row.category) === 'finance';
			if (needFinance && !has(keys, 'finance:approve')) return c.json(result.fail('unauthorized', 403), 403);
		}
	}

	const nextStatus = ACT_TO_STATUS[action];
	const reason = action === 'reject' || action === 'decline' || action === 'request-changes'
		? String(body.comment || body.reason || '').trim()
		: '';
	if ((action === 'reject' || action === 'decline' || action === 'request-changes') && !reason) {
		return c.json(result.fail('reason required', 400), 400);
	}

	await c.env.db.prepare(
		`UPDATE internal_requests SET status = ?, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(nextStatus, id).run();
	await logEvent(c, id, userId, action, row.status, nextStatus, body.comment || reason || '');

	const target = action === 'cancel' ? row.recipient_id : row.sender_id;
	await notify(c, {
		userId: target, actorId: userId,
		title: `Request ${nextStatus.replace(/_/g, ' ')}: ${row.title || ''}`,
		body: reason || body.comment || '', link: `/requests/${id}`, eventKey: `request:${action}:${id}`
	});
	return c.json(result.ok({status: nextStatus}));
});

app.post('/requests/:id/events', async (c) => {
	const userId = userContext.getUserId(c);
	const keys = await getPermKeys(c, userId);
	if (!has(keys, 'requests:query')) return c.json(result.fail('unauthorized', 403), 403);
	const id = c.req.param('id');
	const row = await getRequest(c, id);
	if (!row) return c.json(result.fail('not found', 404), 404);
	if (row.sender_id !== userId && row.recipient_id !== userId) return c.json(result.fail('unauthorized', 403), 403);
	const body = await c.req.json().catch(() => ({}));
	if (!String(body.comment || '').trim()) return c.json(result.fail('comment required', 400), 400);
	await logEvent(c, id, userId, 'comment', row.status, row.status, body.comment);
	return c.json(result.ok());
});
