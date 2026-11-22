import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';

// Calendar B — event industry / event operations calendar.
// Separate from the personal/team calendar (Calendar A).

const VERIFICATION = ['unverified', 'verified', 'rejected'];
const EVENT_STATUS = ['planned', 'confirmed', 'completed', 'cancelled'];

function eventTitle(name) {
	return (name || 'Event').trim();
}

function eventDescription(ev) {
	if (ev.description) return ev.description;
	return ev.organizer ? `CRM event · ${ev.organizer}` : 'CRM event';
}

// Mirror into the creator's personal calendar only (private). Industry events
// are never auto-inserted into every employee's calendar.
async function insertCalendarForEvent(c, userId, ev) {
	const { meta } = await c.env.db.prepare(
		`INSERT INTO calendar_events (user_id, title, description, start_time, end_time, all_day, location, status, visibility, organizer_id, source, create_time, update_time)
		 VALUES (?, ?, ?, ?, ?, 0, ?, 'scheduled', 'private', ?, 'event', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(userId, eventTitle(ev.name), eventDescription(ev), ev.start_time || ev.event_date || null, ev.end_time || null, ev.venue || ev.location || '', userId).run();
	return meta.last_row_id;
}

async function updateCalendarForEvent(c, userId, calId, ev) {
	await c.env.db.prepare(
		`UPDATE calendar_events SET title = ?, description = ?, start_time = ?, end_time = ?, location = ?, status = 'scheduled', update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(eventTitle(ev.name), eventDescription(ev), ev.start_time || ev.event_date || null, ev.end_time || null, ev.venue || ev.location || '', calId, userId).run();
}

async function unlinkCalendar(c, userId, calId) {
	if (!calId) return;
	await c.env.db.prepare(
		`UPDATE calendar_events SET is_del = 1, crm_event_id = 0, update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
	).bind(calId, userId).run();
}

function buildFilters(query) {
	const where = ['user_id = ?', 'is_del = 0'];
	const params = [query.userId];
	if (query.search) {
		where.push('(name LIKE ? OR location LIKE ? OR organizer LIKE ? OR venue LIKE ?)');
		const like = `%${query.search}%`;
		params.push(like, like, like, like);
	}
	if (query.lifecycle) { where.push('lifecycle = ?'); params.push(query.lifecycle); }
	if (query.status) { where.push('status = ?'); params.push(query.status); }
	if (query.verification_status) { where.push('verification_status = ?'); params.push(query.verification_status); }
	if (query.category) { where.push('category = ?'); params.push(query.category); }
	if (query.assigned === 'mine') { where.push('assigned_to = ?'); params.push(query.userId); }
	if (query.from) { where.push('(event_date >= ? OR start_time >= ?)'); params.push(query.from, query.from); }
	return { whereSql: where.join(' AND '), params };
}

app.get('/crm/events', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50 } = c.req.query();
	const { whereSql, params } = buildFilters({ ...c.req.query(), userId });

	const { results } = await c.env.db.prepare(
		`SELECT * FROM crm_events WHERE ${whereSql} ORDER BY COALESCE(start_time, event_date) ASC, update_time DESC LIMIT ? OFFSET ?`
	).bind(...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)).all();

	const countRow = await c.env.db.prepare(
		`SELECT COUNT(*) as cnt FROM crm_events WHERE ${whereSql}`
	).bind(...params).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.post('/crm/events', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const name = (body.name || '').trim();
	if (!name) throw new BizError('Event title is required', 400);

	const status = EVENT_STATUS.includes(body.status) ? body.status : 'planned';
	const verification = VERIFICATION.includes(body.verification_status) ? body.verification_status : 'unverified';

	const { meta } = await c.env.db.prepare(
		`INSERT INTO crm_events (user_id, external_event_id, name, event_date, start_time, end_time, location, venue, organizer, category, lifecycle, status, description, source, source_url, assigned_to, verification_status, last_checked_at, confidence, ai_suggested, venue_partners, sponsors, relationship_notes, related_opportunity_id, created_by, updated_by, update_time)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
	).bind(
		userId, body.external_event_id || '', name, body.event_date || null,
		body.start_time || null, body.end_time || null, body.location || '', body.venue || '',
		body.organizer || '', body.category || '', body.lifecycle || 'planned', status,
		body.description || '', body.source || 'manual', body.source_url || '',
		body.assigned_to || null, verification, body.last_checked_at || null,
		body.confidence || '', body.ai_suggested ? 1 : 0, body.venue_partners || '[]',
		body.sponsors || '[]', body.relationship_notes || '', body.related_opportunity_id || null,
		userId, userId
	).run();
	const eventId = meta.last_row_id;

	let calendarEventId = 0;
	if (body.start_time || body.event_date) {
		calendarEventId = await insertCalendarForEvent(c, userId, { ...body, name });
		await c.env.db.prepare(`UPDATE calendar_events SET crm_event_id = ? WHERE id = ? AND user_id = ?`).bind(eventId, calendarEventId, userId).run();
		await c.env.db.prepare(`UPDATE crm_events SET calendar_event_id = ? WHERE id = ? AND user_id = ?`).bind(calendarEventId, eventId, userId).run();
	}

	return c.json(result.ok({ id: eventId, calendar_event_id: calendarEventId }));
});

app.put('/crm/events/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json();

	const existing = await c.env.db.prepare(
		`SELECT * FROM crm_events WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(id, userId).first();
	if (!existing) throw new BizError('Not found', 404);

	const status = body.status && EVENT_STATUS.includes(body.status) ? body.status : null;
	const verification = body.verification_status && VERIFICATION.includes(body.verification_status) ? body.verification_status : null;

	await c.env.db.prepare(
		`UPDATE crm_events SET external_event_id = COALESCE(?, external_event_id), name = COALESCE(?, name), event_date = COALESCE(?, event_date), start_time = ?, end_time = ?, location = COALESCE(?, location), venue = COALESCE(?, venue), organizer = COALESCE(?, organizer), category = COALESCE(?, category), lifecycle = COALESCE(?, lifecycle), status = COALESCE(?, status), description = COALESCE(?, description), source = COALESCE(?, source), source_url = COALESCE(?, source_url), assigned_to = ?, verification_status = COALESCE(?, verification_status), last_checked_at = ?, confidence = COALESCE(?, confidence), ai_suggested = COALESCE(?, ai_suggested), venue_partners = COALESCE(?, venue_partners), sponsors = COALESCE(?, sponsors), relationship_notes = COALESCE(?, relationship_notes), related_opportunity_id = COALESCE(?, related_opportunity_id), updated_by = COALESCE(?, updated_by), version = version + 1, update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(
		body.external_event_id ?? null, body.name ?? null, body.event_date ?? null,
		body.start_time !== undefined ? body.start_time : existing.start_time,
		body.end_time !== undefined ? body.end_time : existing.end_time,
		body.location ?? null, body.venue ?? null, body.organizer ?? null,
		body.category ?? null, body.lifecycle ?? null, status, body.description ?? null,
		body.source ?? null, body.source_url ?? null,
		body.assigned_to !== undefined ? body.assigned_to : existing.assigned_to,
		verification,
		body.last_checked_at !== undefined ? body.last_checked_at : existing.last_checked_at,
		body.confidence ?? null,
		body.ai_suggested !== undefined ? (body.ai_suggested ? 1 : 0) : existing.ai_suggested,
		body.venue_partners ?? null, body.sponsors ?? null, body.relationship_notes ?? null,
		body.related_opportunity_id ?? null, userId, id, userId
	).run();

	const clearDate = body.event_date === null || body.event_date === '';
	if (clearDate) {
		await c.env.db.prepare(`UPDATE crm_events SET event_date = NULL WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	}

	const merged = {
		name: body.name ?? existing.name,
		event_date: clearDate ? null : (body.event_date ?? existing.event_date),
		start_time: body.start_time !== undefined ? body.start_time : existing.start_time,
		end_time: body.end_time !== undefined ? body.end_time : existing.end_time,
		location: body.location ?? existing.location,
		venue: body.venue ?? existing.venue,
		organizer: body.organizer ?? existing.organizer,
		description: body.description ?? existing.description
	};

	if (merged.start_time || merged.event_date) {
		const calId = existing.calendar_event_id || 0;
		if (calId) {
			await updateCalendarForEvent(c, userId, calId, merged);
		} else {
			const newCalId = await insertCalendarForEvent(c, userId, merged);
			await c.env.db.prepare(`UPDATE calendar_events SET crm_event_id = ? WHERE id = ? AND user_id = ?`).bind(Number(id), newCalId, userId).run();
			await c.env.db.prepare(`UPDATE crm_events SET calendar_event_id = ? WHERE id = ? AND user_id = ?`).bind(newCalId, id, userId).run();
		}
	} else if (existing.calendar_event_id) {
		await unlinkCalendar(c, userId, existing.calendar_event_id);
		await c.env.db.prepare(`UPDATE crm_events SET calendar_event_id = 0 WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	}

	return c.json(result.ok());
});

app.delete('/crm/events/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const existing = await c.env.db.prepare(
		`SELECT calendar_event_id FROM crm_events WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(id, userId).first();
	if (!existing) throw new BizError('Not found', 404);

	await c.env.db.prepare(`UPDATE crm_events SET is_del = 1, calendar_event_id = 0 WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	await unlinkCalendar(c, userId, existing.calendar_event_id || 0);
	return c.json(result.ok());
});

// Import verified event information (manual/CSV/API import). Imported records
// are marked verified only when the caller asserts verification.
app.post('/crm/events/import', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const rows = Array.isArray(body.events) ? body.events : [];
	if (!rows.length) throw new BizError('No events provided', 400);

	const created = [];
	for (const row of rows) {
		const name = (row.name || '').trim();
		if (!name) continue;
		const status = EVENT_STATUS.includes(row.status) ? row.status : 'planned';
		const verification = VERIFICATION.includes(row.verification_status) ? row.verification_status : 'verified';
		const { meta } = await c.env.db.prepare(
			`INSERT INTO crm_events (user_id, name, event_date, start_time, end_time, location, venue, organizer, category, status, description, source, source_url, verification_status, last_checked_at, venue_partners, sponsors, relationship_notes, related_opportunity_id, created_by, updated_by, update_time)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
		).bind(
			userId, name, row.event_date || null, row.start_time || null, row.end_time || null,
			row.location || '', row.venue || '', row.organizer || '', row.category || '', status,
			row.description || '', row.source || 'import', row.source_url || '', verification,
			row.last_checked_at || null, row.venue_partners || '[]', row.sponsors || '[]',
			row.relationship_notes || '', row.related_opportunity_id || null, userId, userId
		).run();
		created.push(meta.last_row_id);
	}

	return c.json(result.ok({ created }));
});

// AI-assisted event discovery: store a reviewable suggestion. This never
// creates an authoritative business record; a human must accept it.
app.post('/crm/events/discover', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();
	const candidates = Array.isArray(body.candidates) ? body.candidates : [];
	if (!candidates.length) throw new BizError('No candidates provided', 400);

	const stored = [];
	for (const cand of candidates) {
		const { meta } = await c.env.db.prepare(
			`INSERT INTO ai_suggestions (user_id, context_type, context_id, suggestion, accepted, create_time) VALUES (?, 'event_discovery', NULL, ?, 0, CURRENT_TIMESTAMP)`
		).bind(userId, JSON.stringify({
			name: cand.name || '',
			organizer: cand.organizer || '',
			start_time: cand.start_time || null,
			venue: cand.venue || '',
			source: cand.source || '',
			source_url: cand.source_url || '',
			confidence: cand.confidence || 'uncertain',
			note: 'Review required before creating an event record.'
		})).run();
		stored.push(meta.last_row_id);
	}

	return c.json(result.ok({ suggestions: stored }));
});