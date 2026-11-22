import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import BizError from '../error/biz-error';
import permService from '../service/perm-service';

// Per-member tutorial progress.
//
// Tour *definitions* live in the frontend registry (they are UI copy, not data).
// Only progress is persisted, so the company can change a tour without a
// migration and members keep their completion state across versions.

const SETTABLE = new Set(['showOnFirstVisit', 'showGuideButton']);

// A stable, short fingerprint of a member's effective access. Sorted + joined
// so the same set of keys always yields the same hash; used to detect when an
// administrator grants or removes access between sessions.
function accessHash(keys) {
	const normalized = [...new Set((keys || []).filter(Boolean))].sort().join('|');
	let h = 5381;
	for (let i = 0; i < normalized.length; i++) {
		h = ((h << 5) + h + normalized.charCodeAt(i)) >>> 0;
	}
	return `v1-${h.toString(36)}-${normalized.length}`;
}

async function guideState(c, userId) {
	const row = await c.env.db.prepare(
		`SELECT ack_access_hash, ack_perms, first_tour_completed FROM member_guide WHERE user_id = ?`
	).bind(userId).first();
	const keys = await permService.userPermKeys(c, userId);
	let ackPerms = [];
	try {
		ackPerms = row?.ack_perms ? JSON.parse(row.ack_perms) : [];
	} catch {
		ackPerms = [];
	}
	return {
		accessHash: accessHash(keys),
		ackAccessHash: row?.ack_access_hash || null,
		ackPerms,
		firstTourCompleted: (row?.first_tour_completed || 0) === 1,
	};
}

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

	const guide = await guideState(c, userId);

	return c.json(result.ok({
		progress,
		guide,
		preferences: {
			showOnFirstVisit: preferences.tutorials?.showOnFirstVisit !== false,
			showGuideButton: preferences.tutorials?.showGuideButton !== false
		}
	}));
});

// Acknowledge the current effective-access version. Called after the member
// has seen (and completed or dismissed) any access-change tour, so the same
// grant is not re-announced on the next session.
app.post('/tutorials/access/ack', async (c) => {
	const userId = userContext.getUserId(c);
	const body = await c.req.json().catch(() => ({}));
	const hash = String(body.accessHash || '').slice(0, 64);
	const perms = Array.isArray(body.perms) ? body.perms.filter(k => typeof k === 'string').slice(0, 500) : [];
	await c.env.db.prepare(
		`INSERT INTO member_guide (user_id, ack_access_hash, ack_perms, update_time)
		 VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET ack_access_hash = excluded.ack_access_hash, ack_perms = excluded.ack_perms, update_time = CURRENT_TIMESTAMP`
	).bind(userId, hash, JSON.stringify(perms)).run();
	return c.json(result.ok({ acked: true }));
});

// Mark the first-workspace tour complete. Idempotent.
app.post('/tutorials/first-complete', async (c) => {
	const userId = userContext.getUserId(c);
	await c.env.db.prepare(
		`INSERT INTO member_guide (user_id, first_tour_completed, update_time)
		 VALUES (?, 1, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET first_tour_completed = 1, update_time = CURRENT_TIMESTAMP`
	).bind(userId).run();
	return c.json(result.ok({ completed: true }));
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
		// A full reset also re-arms the access-change tour: clear the
		// acknowledged version so the next session re-announces current access.
		await c.env.db.prepare(
			`INSERT INTO member_guide (user_id, ack_access_hash, ack_perms, first_tour_completed, update_time)
			 VALUES (?, NULL, NULL, 0, CURRENT_TIMESTAMP)
			 ON CONFLICT(user_id) DO UPDATE SET ack_access_hash = NULL, ack_perms = NULL, first_tour_completed = 0, update_time = CURRENT_TIMESTAMP`
		).bind(userId).run();
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