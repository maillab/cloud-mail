import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';

// Per-member tutorial progress.
//
// Tour *definitions* live in the frontend registry (they are UI copy, not data).
// Only progress is persisted, so the company can change a tour without a
// migration and members keep their completion state across versions.

const SETTABLE = new Set(['showOnFirstVisit', 'showGuideButton']);

app.get('/tutorials', async (c) => {
	const userId = userContext.getUserId(c);
	const { results } = await c.env.db.prepare(
		`SELECT tour_id, tour_version, completed_at, dismissed_at
		 FROM tutorial_progress WHERE user_id = ?`
	).bind(userId).all();

	const progress = {};
	for (const row of results || []) {
		progress[row.tour_id] = {
			version: row.tour_version,
			completedAt: row.completed_at,
			dismissedAt: row.dismissed_at
		};
	}

	const prefsRow = await c.env.db.prepare(
		`SELECT channels FROM notification_pref WHERE user_id = ?`
	).bind(userId).first();

	let preferences = {};
	try {
		preferences = prefsRow?.channels ? JSON.parse(prefsRow.channels) : {};
	} catch {
		preferences = {};
	}

	return c.json(result.ok({
		progress,
		preferences: {
			showOnFirstVisit: preferences.tutorials?.showOnFirstVisit !== false,
			showGuideButton: preferences.tutorials?.showGuideButton !== false
		}
	}));
});

app.post('/tutorials/:tourId/complete', async (c) => {
	const userId = userContext.getUserId(c);
	const tourId = String(c.req.param('tourId')).slice(0, 64);
	const body = await c.req.json().catch(() => ({}));
	const version = Number(body.version) || 1;

	await c.env.db.prepare(
		`INSERT INTO tutorial_progress (user_id, tour_id, tour_version, completed_at)
		 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, tour_id, tour_version)
		 DO UPDATE SET completed_at = CURRENT_TIMESTAMP, dismissed_at = NULL`
	).bind(userId, tourId, version).run();

	return c.json(result.ok({ completed: true }));
});

app.post('/tutorials/:tourId/dismiss', async (c) => {
	const userId = userContext.getUserId(c);
	const tourId = String(c.req.param('tourId')).slice(0, 64);
	const body = await c.req.json().catch(() => ({}));
	const version = Number(body.version) || 1;

	await c.env.db.prepare(
		`INSERT INTO tutorial_progress (user_id, tour_id, tour_version, dismissed_at)
		 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, tour_id, tour_version)
		 DO UPDATE SET dismissed_at = CURRENT_TIMESTAMP`
	).bind(userId, tourId, version).run();

	return c.json(result.ok({ dismissed: true }));
});

app.put('/tutorials/preferences', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();

	const row = await c.env.db.prepare(`SELECT channels FROM notification_pref WHERE user_id = ?`)
		.bind(userId).first();

	let channels = {};
	try {
		channels = row?.channels ? JSON.parse(row.channels) : {};
	} catch {
		channels = {};
	}

	channels.tutorials = channels.tutorials || {};
	for (const key of SETTABLE) {
		if (body[key] !== undefined) {
			channels.tutorials[key] = Boolean(body[key]);
		}
	}

	await c.env.db.prepare(
		`INSERT INTO notification_pref (user_id, channels, update_time)
		 VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET channels = excluded.channels, update_time = CURRENT_TIMESTAMP`
	).bind(userId, JSON.stringify(channels)).run();

	return c.json(result.ok({ preferences: channels.tutorials }));
});

app.delete('/tutorials/progress', async (c) => {
	const userId = userContext.getUserId(c);
	const { tourId } = c.req.query();
	if (tourId) {
		await c.env.db.prepare(`DELETE FROM tutorial_progress WHERE user_id = ? AND tour_id = ?`)
			.bind(userId, String(tourId).slice(0, 64)).run();
	} else {
		await c.env.db.prepare(`DELETE FROM tutorial_progress WHERE user_id = ?`).bind(userId).run();
	}
	return c.json(result.ok({ reset: true }));
});

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

app.get('/notifications/preferences', async (c) => {
	const userId = userContext.getUserId(c);
	const row = await c.env.db.prepare(`SELECT channels FROM notification_pref WHERE user_id = ?`)
		.bind(userId).first();

	let channels = {};
	try {
		channels = row?.channels ? JSON.parse(row.channels) : {};
	} catch {
		channels = {};
	}

	return c.json(result.ok(channels.notification || {}));
});

app.put('/notifications/preferences', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json();

	const row = await c.env.db.prepare(`SELECT channels FROM notification_pref WHERE user_id = ?`)
		.bind(userId).first();

	let channels = {};
	try {
		channels = row?.channels ? JSON.parse(row.channels) : {};
	} catch {
		channels = {};
	}

	// Security notifications are never disabled: a member must always be told
	// when their password or authenticator changes.
	channels.notification = { ...(channels.notification || {}), ...body, security: true };

	await c.env.db.prepare(
		`INSERT INTO notification_pref (user_id, channels, update_time)
		 VALUES (?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET channels = excluded.channels, update_time = CURRENT_TIMESTAMP`
	).bind(userId, JSON.stringify(channels)).run();

	return c.json(result.ok(channels.notification));
});

app.post('/notifications/preferences/reset', async (c) => {
	const userId = userContext.getUserId(c);
	await c.env.db.prepare(`DELETE FROM notification_pref WHERE user_id = ?`).bind(userId).run();
	return c.json(result.ok({ reset: true }));
});