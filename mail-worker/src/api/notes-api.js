import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';

const PRIORITIES = ['critical', 'high', 'normal', 'low'];
const SORTABLE = ['update_time', 'create_time', 'priority', 'title'];

function normalizePriority(v) { return PRIORITIES.includes(v) ? v : 'normal'; }

function normalizeLabels(v) {
	if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
	if (typeof v === 'string') {
		try {
			const parsed = JSON.parse(v);
			if (Array.isArray(parsed)) return parsed.map(x => String(x).trim()).filter(Boolean);
		} catch { /* treat as single label */ }
		return v.split(',').map(x => x.trim()).filter(Boolean);
	}
	return [];
}

app.get('/notes', async (c) => {
	const userId = userContext.getUserId(c);
	const { page = 1, pageSize = 50, folder_id, is_pinned, priority, label, related_type, related_id, search, sort = 'update_time' } = c.req.query();

	const where = ['user_id = ?', 'is_del = 0'];
	const params = [userId];
	if (folder_id !== undefined && folder_id !== '') { where.push('folder_id = ?'); params.push(folder_id); }
	if (is_pinned !== undefined) { where.push('is_pinned = ?'); params.push(is_pinned === 'true' ? 1 : 0); }
	if (priority) { where.push('priority = ?'); params.push(normalizePriority(priority)); }
	if (label) { where.push('labels LIKE ?'); params.push(`%"${label}"%`); }
	if (related_type) { where.push('related_type = ?'); params.push(related_type); }
	if (related_id !== undefined && related_id !== '') { where.push('related_id = ?'); params.push(related_id); }
	if (search) { where.push('(title LIKE ? OR content LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

	const whereSql = where.join(' AND ');
	const sortCol = SORTABLE.includes(sort) ? sort : 'update_time';
	const orderBy = sort === 'priority'
		? `is_pinned DESC, CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END ASC, update_time DESC`
		: `is_pinned DESC, ${sortCol} DESC`;

	const listParams = [...params, Number(pageSize), (Number(page) - 1) * Number(pageSize)];
	const { results } = await c.env.db.prepare(
		`SELECT * FROM notes WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
	).bind(...listParams).all();
	const countRow = await c.env.db.prepare(`SELECT COUNT(*) as cnt FROM notes WHERE ${whereSql}`).bind(...params).first();

	return c.json(result.ok({ list: results, total: countRow?.cnt ?? 0 }));
});

app.post('/notes', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json().catch(() => ({}));
	const labels = normalizeLabels(body.labels);
	const { meta } = await c.env.db.prepare(
		`INSERT INTO notes (user_id, folder_id, title, content, is_pinned, priority, reminder_at, labels, related_type, related_id, create_time, update_time)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
	).bind(
		userId, body.folder_id ?? null, body.title ?? '', body.content ?? '',
		body.is_pinned ?? 0, normalizePriority(body.priority), body.reminder_at ?? null,
		JSON.stringify(labels), body.related_type ?? '', body.related_id ?? null
	).run();

	return c.json(result.ok({ id: meta.last_row_id }));
});

app.put('/notes/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const labels = body.labels !== undefined ? normalizeLabels(body.labels) : null;

	await c.env.db.prepare(
		`UPDATE notes SET
			folder_id = COALESCE(?, folder_id),
			title = COALESCE(?, title),
			content = COALESCE(?, content),
			is_pinned = COALESCE(?, is_pinned),
			priority = COALESCE(?, priority),
			reminder_at = ?, reminder_sent = CASE WHEN ? IS NULL THEN reminder_sent ELSE 0 END,
			labels = ?, related_type = ?, related_id = ?,
			update_time = CURRENT_TIMESTAMP
		 WHERE id = ? AND user_id = ? AND is_del = 0`
	).bind(
		body.folder_id ?? null, body.title ?? null, body.content ?? null, body.is_pinned ?? null,
		body.priority !== undefined ? normalizePriority(body.priority) : null,
		body.reminder_at ?? null, body.reminder_at ?? null,
		labels !== null ? JSON.stringify(labels) : null,
		body.related_type ?? null, body.related_id ?? null, id, userId
	).run();

	return c.json(result.ok());
});

app.post('/notes/:id/pin', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	const body = await c.req.json().catch(() => ({}));
	const pinned = body.is_pinned === undefined ? 1 : (body.is_pinned ? 1 : 0);
	await c.env.db.prepare(`UPDATE notes SET is_pinned = ?, update_time = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND is_del = 0`).bind(pinned, id, userId).run();
	return c.json(result.ok());
});

app.delete('/notes/:id', async (c) => {
	const userId = userContext.getUserId(c);
	const id = c.req.param('id');
	await c.env.db.prepare(`UPDATE notes SET is_del = 1 WHERE id = ? AND user_id = ?`).bind(id, userId).run();
	return c.json(result.ok());
});