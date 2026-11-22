import app from '../hono/hono';
import result from '../model/result';
import userContext from '../security/user-context';
import permService from '../service/perm-service';

const DASHBOARD_VERSION = 1;

// Widget catalog: only widgets backed by real, existing data.
// perm = required permission (null = always available to every employee).
const WIDGET_CATALOG = [
	{id: 'attention', category: 'work', title: 'Needs attention', perm: null, defaultW: 12, defaultH: 4},
	{id: 'my-tasks', category: 'work', title: 'My tasks', perm: 'tasks:query', defaultW: 6, defaultH: 3},
	{id: 'overdue-tasks', category: 'work', title: 'Overdue tasks', perm: 'tasks:query', defaultW: 6, defaultH: 3},
	{id: 'projects', category: 'work', title: 'Project milestones', perm: 'projects:query', defaultW: 6, defaultH: 3},
	{id: 'mail', category: 'communications', title: 'Unread emails', perm: null, defaultW: 6, defaultH: 3},
	{id: 'notifications', category: 'communications', title: 'Internal notifications', perm: 'notifications:query', defaultW: 6, defaultH: 3},
	{id: 'calendar', category: 'schedule', title: "Today's schedule", perm: 'calendar:query', defaultW: 6, defaultH: 4},
	{id: 'notes', category: 'schedule', title: 'Pinned notes', perm: 'notes:query', defaultW: 6, defaultH: 3},
	{id: 'activities', category: 'activity', title: 'My activity', perm: 'activities:query', defaultW: 6, defaultH: 3},
	{id: 'ai', category: 'intelligence', title: 'AI insights', perm: 'ai:use', defaultW: 12, defaultH: 2},
];

const ROLE_DEFAULTS = {
	support: ['attention', 'mail', 'notifications', 'calendar'],
	finance: ['attention', 'my-tasks', 'calendar'],
	growth: ['attention', 'my-tasks', 'projects', 'calendar', 'mail'],
	engineering: ['attention', 'my-tasks', 'overdue-tasks', 'projects', 'calendar'],
	leadership: ['attention', 'notifications', 'calendar', 'activities'],
	operations: ['attention', 'my-tasks', 'calendar', 'notifications', 'mail'],
	admin: ['attention', 'my-tasks', 'calendar', 'mail', 'notes'],
};
const FALLBACK_DEFAULT = ['attention', 'my-tasks', 'calendar', 'mail', 'notifications'];

function roleKey(roleName) {
	const n = String(roleName || '').toLowerCase();
	if (n.includes('support')) return 'support';
	if (n.includes('financ')) return 'finance';
	if (n.includes('growth') || n.includes('market')) return 'growth';
	if (n.includes('engineer') || n.includes('develop')) return 'engineering';
	if (n.includes('lead') || n.includes('owner') || n.includes('manager') || n.includes('director')) return 'leadership';
	if (n.includes('operat')) return 'operations';
	if (n.includes('admin')) return 'admin';
	return null;
}

function clampInt(v, min, max, def) {
	const n = Number(v);
	if (!Number.isFinite(n)) return def;
	return Math.min(max, Math.max(min, Math.round(n)));
}

function layoutFromIds(ids) {
	let y = 0;
	return ids.map(id => {
		const def = WIDGET_CATALOG.find(w => w.id === id);
		if (!def) return null;
		const item = {id, x: 0, y, w: def.defaultW, h: def.defaultH, config: {}};
		y += def.defaultH;
		return item;
	}).filter(Boolean);
}

function allowedCatalog(permKeys) {
	const has = k => permKeys.includes('*') || permKeys.includes(k);
	const allowed = WIDGET_CATALOG.filter(w => !w.perm || has(w.perm)).map(w => w.id);
	return {catalog: WIDGET_CATALOG, allowed};
}

function sanitizeLayout(raw, allowed) {
	if (!Array.isArray(raw)) return [];
	const seen = new Set();
	const out = [];
	for (const item of raw) {
		if (!item || typeof item.id !== 'string') continue;
		if (!allowed.includes(item.id) || seen.has(item.id)) continue;
		seen.add(item.id);
		const def = WIDGET_CATALOG.find(w => w.id === item.id);
		out.push({
			id: item.id,
			x: 0,
			y: 0,
			w: clampInt(item.w, 3, 12, def.defaultW),
			h: clampInt(item.h, 2, 8, def.defaultH),
			config: (item.config && typeof item.config === 'object' && !Array.isArray(item.config)) ? item.config : {}
		});
	}
	return out;
}

async function loadPrefs(c, userId) {
	const row = await c.env.db.prepare(
		`SELECT dashboard_version, layout, density, onboarded FROM dashboard_preferences WHERE user_id = ?`
	).bind(userId).first();
	return row || null;
}

app.get('/dashboard/preferences', async (c) => {
	const userId = userContext.getUserId(c);
	const permKeys = await permService.userPermKeys(c, userId);
	const {catalog, allowed} = allowedCatalog(permKeys);
	const roleRow = await c.env.db.prepare(`SELECT r.name FROM user u LEFT JOIN role r ON r.role_id = u.type WHERE u.user_id = ?`).bind(userId).first();
	const role = roleRow?.name || '';
	const key = roleKey(role);
	const defaultIds = (key && ROLE_DEFAULTS[key]) ? ROLE_DEFAULTS[key] : FALLBACK_DEFAULT;
	const defaultLayout = layoutFromIds(defaultIds.filter(id => allowed.includes(id)));

	const prefs = await loadPrefs(c, userId);
	let layout = defaultLayout;
	let density = 'comfortable';
	let onboarded = false;
	if (prefs) {
		density = prefs.density === 'compact' ? 'compact' : 'comfortable';
		onboarded = prefs.onboarded === 1;
		const stored = JSON.parse(prefs.layout || '[]');
		// Never return widgets the user is no longer authorized for.
		const sanitized = sanitizeLayout(stored, allowed);
		if (sanitized.length) layout = sanitized;
	}

	return c.json(result.ok({
		version: prefs?.dashboard_version ?? DASHBOARD_VERSION,
		density,
		onboarded,
		role,
		layout,
		defaultLayout,
		catalog: catalog.filter(w => allowed.includes(w.id)),
	}));
});

app.put('/dashboard/preferences', async (c) => {
	const userId = userContext.getUserId(c);
	const permKeys = await permService.userPermKeys(c, userId);
	const {allowed} = allowedCatalog(permKeys);
	const body = await c.req.json().catch(() => ({}));
	const layout = sanitizeLayout(body.layout, allowed);
	const density = body.density === 'compact' ? 'compact' : 'comfortable';

	await c.env.db.prepare(
		`INSERT INTO dashboard_preferences (user_id, dashboard_version, layout, density, onboarded, create_time, updated_time)
		 VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET
		   dashboard_version = excluded.dashboard_version,
		   layout = excluded.layout,
		   density = excluded.density,
		   onboarded = 1,
		   updated_time = CURRENT_TIMESTAMP`
	).bind(userId, DASHBOARD_VERSION, JSON.stringify(layout), density).run();

	return c.json(result.ok({version: DASHBOARD_VERSION, layout, density}));
});

app.post('/dashboard/preferences/reset', async (c) => {
	const userId = userContext.getUserId(c);
	const permKeys = await permService.userPermKeys(c, userId);
	const {allowed} = allowedCatalog(permKeys);
	const roleRow = await c.env.db.prepare(`SELECT r.name FROM user u LEFT JOIN role r ON r.role_id = u.type WHERE u.user_id = ?`).bind(userId).first();
	const key = roleKey(roleRow?.name || '');
	const defaultIds = (key && ROLE_DEFAULTS[key]) ? ROLE_DEFAULTS[key] : FALLBACK_DEFAULT;
	const layout = layoutFromIds(defaultIds.filter(id => allowed.includes(id)));

	await c.env.db.prepare(
		`INSERT INTO dashboard_preferences (user_id, dashboard_version, layout, density, onboarded, create_time, updated_time)
		 VALUES (?, ?, ?, 'comfortable', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id) DO UPDATE SET
		   dashboard_version = excluded.dashboard_version,
		   layout = excluded.layout,
		   density = 'comfortable',
		   onboarded = 1,
		   updated_time = CURRENT_TIMESTAMP`
	).bind(userId, DASHBOARD_VERSION, JSON.stringify(layout)).run();

	return c.json(result.ok({layout, density: 'comfortable'}));
});

app.post('/dashboard/preferences/onboard', async (c) => {
	const userId = userContext.getUserId(c);
	await c.env.db.prepare(
		`UPDATE dashboard_preferences SET onboarded = 1, updated_time = CURRENT_TIMESTAMP WHERE user_id = ?`
	).bind(userId).run();
	return c.json(result.ok());
});