import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';

// Calendar A — personal/team calendar.
// Access is by explicit visibility/participation/ownership only.
// Administrator status never bypasses confidential record scope.

const VISIBILITIES = ['private', 'team', 'selected', 'company'];
const RESPONSES = ['invited', 'accepted', 'declined', 'tentative'];

function fail(msg) {
	throw new BizError(msg, 400);
}

async function logActivity(c, eventId, userId, action, detail) {
	await c.env.db.prepare(
		`INSERT INTO calendar_event_activity (event_id, user_id, action, detail, create_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(eventId, userId, action, detail || '').run();
}

async function participantsOf(c, eventId) {
	const { results } = await c.env.db.prepare(
		`SELECT user_id, response FROM calendar_event_participants WHERE event_id = ? ORDER BY id ASC`
	).bind(eventId).all();
	return results || [];
}

async function isParticipant(c, eventId, userId) {
	const row = await c.env.db.prepare(
		`SELECT 1 FROM calendar_event_participants WHERE event_id = ? AND user_id = ?`
	).bind(eventId, userId).first();
	return !!row;
}

async function canView(c, event, userId) {
	if (!event) return false;
	if (event.user_id === userId || event.organizer_id === userId) return true;
	if (event.visibility === 'company' || event.visibility === 'team') return true;
	if (event.visibility === 'selected') return isParticipant(c, event.id, userId);
	return false;
}

function canEdit(event, userId) {
	if (!event) return false;
	return event.user_id === userId || event.organizer_id === userId;
}

function visibleWhere(userId) {
	return `(e.user_id = ? OR e.organizer_id = ? OR e.visibility IN ('company','team') OR (e.visibility = 'selected' AND e.id IN (SELECT event_id FROM calendar_event_participants WHERE user_id = ?)))`;
}

app.get('/calendar', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 100, start_time, end_time, from, visibility, scope } = c.req.query();

	const where = ['e.is_del = 0'];
	const params = [];

	if (scope === 'own') {
		where.push('e.user_id = ?');
		params.push(userId);
	} else if (scope === 'invited') {
		where.push('e.user_id <> ?');
		params.push(userId);
		where.push(`(e.visibility IN ('company','team') OR (e.visibility = 'selected' AND e.id IN (SELECT event_id FROM calendar_event_participants WHERE user_id = ?)))`);
		params.push(userId);
	} else {
		where.push(visibleWhere(userId));
		params.push(userId, userId, userId);
	}

	if (from) { where.push('e.start_time >= ?'); params.push(from); }
	if (start_time) { where.push('e.end_time >= ?'); params.push(start_time); }
	if (end_time) { where.push('e.start_time <= ?'); params.push(end_time); }
	if (visibility) { where.push('e.visibility = ?'); params.push(visibility); }

	const whereSql = where.join(' AND ');

	const sql = `SELECT e.* FROM calendar_events e WHERE ${whereSql} ORDER BY e.start_time ASC LIMIT ? OFFSET ?`;
	const listParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
	const { results } = await c.env.db.prepare(sql).bind(...listParams).all();

	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM calendar_events e WHERE ${whereSql}`
	).bind(...params).first();

	const ids = (results || []).map(r => r.id);
	const partMap = {};
	if (ids.length) {
		const { results: parts } = await c.env.db.prepare(
			`SELECT * FROM calendar_event_participants WHERE event_id IN (${ids.map(() => '?').join(',')}) ORDER BY id ASC`
		).bind(...ids).all();
		for (const p of parts || []) {
			(partMap[p.event_id] = partMap[p.event_id] || []).push(p);
		}
	}

	const list = (results || []).map(e => {
		const participants = partMap[e.id] || [];
		const mine = participants.find(p => p.user_id === userId);
		return {
			...e,
			participants,
			participant_count: participants.length,
			my_response: mine ? mine.response : (e.organizer_id === userId ? 'organizer' : '')
		};
	});

	return c.json(result.ok({ list, total: countRow?.cnt ?? 0 }));
});

app.get('/calendar/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const event = await c.env.db.prepare(
		`SELECT * FROM calendar_events WHERE id = ? AND is_del = 0`
	).bind(id).first();

	if (!(await canView(c, event, userId))) {
		throw new BizError('Not found', 404);
	}

	const participants = await participantsOf(c, event.id);
	const { results: activity } = await c.env.db.prepare(
		`SELECT * FROM calendar_event_activity WHERE event_id = ? ORDER BY id DESC LIMIT 50`
	).bind(event.id).all();

	return c.json(result.ok({
		event: {...event, participants},
		participants,
		activity: activity || []
	}));
});

app.post('/calendar', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const title = (body.title || '').trim();
	if (!title) fail('Title is required');
	if (!body.start_time) fail('Start time is required');

	const visibility = VISIBILITIES.includes(body.visibility) ? body.visibility : 'private';
	const participants = Array.isArray(body.participants)
		? [...new Set(body.participants.map(Number).filter(Boolean))]
		: [];
	if (visibility === 'selected' && !participants.length) fail('Selected visibility requires participants');

	const { meta } = await c.env.db.prepare(
		`INSERT INTO calendar_events (user_id, title, description, start_time, end_time, all_day, location, status, timezone, visibility, organizer_id, related_type, related_id, reminder_at, reminder_sent, source, create_time, update_time)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(
		userId, title, body.description || '', body.start_time, body.end_time || null,
		body.all_day ? 1 : 0, body.location || '', body.status || 'scheduled',
		body.timezone || 'UTC', visibility, userId, body.related_type || '',
		body.related_id || null, body.reminder_at || null, body.source || 'personal'
	).run();

	const eventId = meta.last_row_id;
	for (const uid of participants) {
		if (uid === userId) continue;
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO calendar_event_participants (event_id, user_id, response) VALUES (?, ?, 'invited')`
		).bind(eventId, uid).run();
	}
	await logActivity(c, eventId, userId, 'create', visibility);

	return c.json(result.ok({ id: eventId }));
});

app.put('/calendar/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();

	const existing = await c.env.db.prepare(
		`SELECT * FROM calendar_events WHERE id = ? AND is_del = 0`
	).bind(id).first();

	if (!canEdit(existing, userId)) {
		throw new BizError('Not found', 404);
	}

	const visibility = VISIBILITIES.includes(body.visibility) ? body.visibility : existing.visibility;
	const participants = Array.isArray(body.participants)
		? [...new Set(body.participants.map(Number).filter(Boolean))]
		: null;
	if (visibility === 'selected') {
		const list = participants || (await participantsOf(c, existing.id)).map(p => p.user_id);
		if (!list.length) fail('Selected visibility requires participants');
	}

	await c.env.db.prepare(
		`UPDATE calendar_events SET title = ?, description = ?, start_time = ?, end_time = ?, all_day = ?, location = ?, status = ?, timezone = ?, visibility = ?, related_type = ?, related_id = ?, reminder_at = ?, reminder_sent = 0, update_time = CURRENT_TIMESTAMP WHERE id = ?`
	).bind(
		body.title ?? existing.title,
		body.description ?? existing.description,
		body.start_time ?? existing.start_time,
		body.end_time ?? existing.end_time,
		body.all_day ?? existing.all_day,
		body.location ?? existing.location,
		body.status ?? existing.status,
		body.timezone ?? existing.timezone,
		visibility,
		body.related_type ?? existing.related_type,
		body.related_id ?? existing.related_id,
		body.reminder_at ?? existing.reminder_at,
		id
	).run();

	if (participants) {
		await c.env.db.prepare(`DELETE FROM calendar_event_participants WHERE event_id = ?`).bind(id).run();
		for (const uid of participants) {
			if (uid === existing.organizer_id) continue;
			await c.env.db.prepare(
				`INSERT OR IGNORE INTO calendar_event_participants (event_id, user_id, response) VALUES (?, ?, 'invited')`
			).bind(id, uid).run();
		}
	}

	await logActivity(c, id, userId, 'update', visibility);
	return c.json(result.ok());
});

app.delete('/calendar/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const existing = await c.env.db.prepare(
		`SELECT * FROM calendar_events WHERE id = ? AND is_del = 0`
	).bind(id).first();

	if (!canEdit(existing, userId)) {
		throw new BizError('Not found', 404);
	}

	await c.env.db.prepare(`UPDATE calendar_events SET is_del = 1, update_time = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
	await logActivity(c, id, userId, 'cancel', '');
	return c.json(result.ok());
});

app.post('/calendar/:id/participants', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const event = await c.env.db.prepare(
		`SELECT * FROM calendar_events WHERE id = ? AND is_del = 0`
	).bind(id).first();

	if (!canEdit(event, userId)) {
		throw new BizError('Not found', 404);
	}

	const ids = Array.isArray(body.user_ids) ? [...new Set(body.user_ids.map(Number).filter(Boolean))] : [];
	for (const uid of ids) {
		if (uid === event.organizer_id) continue;
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO calendar_event_participants (event_id, user_id, response) VALUES (?, ?, 'invited')`
		).bind(id, uid).run();
	}
	await logActivity(c, id, userId, 'invite', ids.join(','));
	return c.json(result.ok({ participants: await participantsOf(c, id) }));
});

app.post('/calendar/:id/respond', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();
	const response = RESPONSES.includes(body.response) ? body.response : 'invited';

	const event = await c.env.db.prepare(
		`SELECT * FROM calendar_events WHERE id = ? AND is_del = 0`
	).bind(id).first();
	if (!event) throw new BizError('Not found', 404);

	if (event.organizer_id === userId) fail('Organizer cannot respond to own event');

	const participant = await isParticipant(c, id, userId);
	if (!participant && event.visibility !== 'selected') {
		await c.env.db.prepare(
			`INSERT OR IGNORE INTO calendar_event_participants (event_id, user_id, response) VALUES (?, ?, ?)`
		).bind(id, userId, response).run();
	} else {
		await c.env.db.prepare(
			`UPDATE calendar_event_participants SET response = ? WHERE event_id = ? AND user_id = ?`
		).bind(response, id, userId).run();
	}
	await logActivity(c, id, userId, 'respond', response);
	return c.json(result.ok({ response }));
});