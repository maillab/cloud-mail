import permService from './perm-service';
import scopeService from './scope-service';
import roleService from './role-service';
import BizError from '../error/biz-error';

// Effective access is derived from the resolved permission set (role grants plus
// per-user overrides) and the resolved record scope. Nothing here is stored: it is
// a projection of what the security layer already enforces, so the preview cannot
// drift from actual behaviour.

const SCOPE_PHRASE = {
	own: 'only their own records',
	assigned: 'only records assigned to them',
	team: 'records belonging to their team',
	company: 'all company records'
};

// Each entry describes one area and the actions the model can resolve. The
// permission keys are the ones the API actually checks; the phrases are the only
// place human language is attached, and they are chosen per action.
const AREAS = [
	{
		key: 'mail',
		label: 'Mail',
		actions: [
			{ key: 'view', perm: 'email:query', allow: 'View mail in authorized mailboxes', deny: 'View mail' },
			{ key: 'send', perm: 'email:send', allow: 'Send mail from authorized mailboxes', deny: 'Send mail' },
			{ key: 'delete', perm: 'email:delete', allow: 'Delete mail', deny: 'Delete mail' }
		]
	},
	{
		key: 'contacts',
		label: 'CRM → Contacts',
		scope: true,
		actions: [
			{ key: 'view', perm: 'contacts:query', allow: 'View contacts', deny: 'View contacts' },
			{ key: 'add', perm: 'contacts:add', allow: 'Create contacts', deny: 'Create contacts' },
			{ key: 'edit', perm: 'contacts:edit', allow: 'Edit contacts', deny: 'Edit contacts' },
			{ key: 'assign', perm: 'contacts:assign', allow: 'Assign contacts to other members', deny: 'Assign contacts' },
			{ key: 'delete', perm: 'contacts:delete', allow: 'Delete contacts', deny: 'Delete contacts' }
		]
	},
	{
		key: 'leads',
		label: 'CRM → Leads',
		scope: true,
		actions: [
			{ key: 'view', perm: 'leads:query', allow: 'View leads', deny: 'View leads' },
			{ key: 'add', perm: 'leads:add', allow: 'Create leads', deny: 'Create leads' },
			{ key: 'edit', perm: 'leads:edit', allow: 'Edit leads', deny: 'Edit leads' },
			{ key: 'assign', perm: 'leads:assign', allow: 'Assign leads to other members', deny: 'Assign leads' },
			{ key: 'delete', perm: 'leads:delete', allow: 'Delete leads', deny: 'Delete leads' }
		]
	},
	{
		key: 'companies',
		label: 'CRM → Companies',
		scope: true,
		actions: [
			{ key: 'view', perm: 'companies:query', allow: 'View companies', deny: 'View companies' },
			{ key: 'add', perm: 'companies:add', allow: 'Create companies', deny: 'Create companies' },
			{ key: 'edit', perm: 'companies:edit', allow: 'Edit companies', deny: 'Edit companies' },
			{ key: 'delete', perm: 'companies:delete', allow: 'Delete companies', deny: 'Delete companies' }
		]
	},
	{
		key: 'organizations',
		label: 'CRM → Organizations',
		actions: [
			{ key: 'view', perm: 'organizations:query', allow: 'View organizations', deny: 'View organizations' },
			{ key: 'add', perm: 'organizations:add', allow: 'Create organizations', deny: 'Create organizations' },
			{ key: 'edit', perm: 'organizations:edit', allow: 'Edit organizations', deny: 'Edit organizations' },
			{ key: 'delete', perm: 'organizations:delete', allow: 'Delete organizations', deny: 'Delete organizations' }
		]
	},
	{
		key: 'deals',
		label: 'CRM → Deals',
		actions: [
			{ key: 'view', perm: 'deals:query', allow: 'View deals', deny: 'View deals' },
			{ key: 'add', perm: 'deals:add', allow: 'Create deals', deny: 'Create deals' },
			{ key: 'edit', perm: 'deals:edit', allow: 'Edit deals', deny: 'Edit deals' },
			{ key: 'delete', perm: 'deals:delete', allow: 'Delete deals', deny: 'Delete deals' }
		]
	},
	{
		key: 'activities',
		label: 'CRM → Activities',
		actions: [
			{ key: 'view', perm: 'activities:query', allow: 'View activity history', deny: 'View activity history' },
			{ key: 'add', perm: 'activities:add', allow: 'Log activities', deny: 'Log activities' }
		]
	},
	{
		key: 'finance',
		label: 'Finance',
		actions: [
			{ key: 'view', perm: 'finance:view', allow: 'View finance records', deny: 'View finance records' },
			{ key: 'edit', perm: 'finance:edit', allow: 'Create and edit finance records', deny: 'Edit finance records' },
			{ key: 'approve', perm: 'finance:approve', allow: 'Approve finance records', deny: 'Approve finance records' }
		]
	},
	{
		key: 'projects',
		label: 'Projects',
		actions: [
			{ key: 'view', perm: 'projects:query', allow: 'View projects', deny: 'View projects' },
			{ key: 'add', perm: 'projects:add', allow: 'Create projects', deny: 'Create projects' },
			{ key: 'edit', perm: 'projects:edit', allow: 'Edit projects', deny: 'Edit projects' },
			{ key: 'delete', perm: 'projects:delete', allow: 'Delete projects', deny: 'Delete projects' }
		]
	},
	{
		key: 'tasks',
		label: 'Tasks',
		actions: [
			{ key: 'view', perm: 'tasks:query', allow: 'View tasks', deny: 'View tasks' },
			{ key: 'add', perm: 'tasks:add', allow: 'Create tasks', deny: 'Create tasks' },
			{ key: 'edit', perm: 'tasks:edit', allow: 'Edit tasks', deny: 'Edit tasks' },
			{ key: 'delete', perm: 'tasks:delete', allow: 'Delete tasks', deny: 'Delete tasks' }
		]
	},
	{
		key: 'documents',
		label: 'Documents',
		actions: [
			{ key: 'view', perm: 'documents:query', allow: 'View documents', deny: 'View documents' },
			{ key: 'add', perm: 'documents:add', allow: 'Upload documents', deny: 'Upload documents' },
			{ key: 'edit', perm: 'documents:edit', allow: 'Edit documents', deny: 'Edit documents' },
			{ key: 'delete', perm: 'documents:delete', allow: 'Delete documents', deny: 'Delete documents' }
		]
	},
	{
		key: 'notes',
		label: 'Notes',
		actions: [
			{ key: 'view', perm: 'notes:query', allow: 'View notes', deny: 'View notes' },
			{ key: 'add', perm: 'notes:add', allow: 'Create notes', deny: 'Create notes' },
			{ key: 'edit', perm: 'notes:edit', allow: 'Edit notes', deny: 'Edit notes' },
			{ key: 'delete', perm: 'notes:delete', allow: 'Delete notes', deny: 'Delete notes' }
		]
	},
	{
		key: 'calendar',
		label: 'Calendar',
		actions: [
			{ key: 'view', perm: 'calendar:query', allow: 'View the company calendar', deny: 'View the calendar' },
			{ key: 'add', perm: 'calendar:add', allow: 'Create calendar events', deny: 'Create calendar events' },
			{ key: 'edit', perm: 'calendar:edit', allow: 'Edit calendar events', deny: 'Edit calendar events' }
		]
	},
	{
		key: 'requests',
		label: 'Requests',
		actions: [
			{ key: 'view', perm: 'requests:query', allow: 'View requests', deny: 'View requests' },
			{ key: 'add', perm: 'requests:add', allow: 'Raise requests', deny: 'Raise requests' },
			{ key: 'act', perm: 'requests:act', allow: 'Act on requests sent to them', deny: 'Act on requests' }
		]
	},
	{
		key: 'approvals',
		label: 'Approvals',
		actions: [
			{ key: 'view', perm: 'approvals:query', allow: 'View approval requests', deny: 'View approvals' },
			{ key: 'approve', perm: 'approvals:approve', allow: 'Approve or decline', deny: 'Approve requests' }
		]
	},
	{
		key: 'support',
		label: 'Support',
		actions: [
			{ key: 'view', perm: 'support:query', allow: 'View support conversations', deny: 'View support' },
			{ key: 'add', perm: 'support:add', allow: 'Reply to support conversations', deny: 'Reply to support' },
			{ key: 'edit', perm: 'support:edit', allow: 'Manage support conversations', deny: 'Manage support' }
		]
	},
	{
		key: 'automations',
		label: 'Automations',
		actions: [
			{ key: 'view', perm: 'automations:query', allow: 'View automations', deny: 'View automations' },
			{ key: 'edit', perm: 'automations:edit', allow: 'Change automations', deny: 'Change automations' }
		]
	},
	{
		key: 'whatsapp',
		label: 'WhatsApp',
		actions: [
			{ key: 'send', perm: 'whatsapp:send', allow: 'Send WhatsApp messages', deny: 'Send WhatsApp messages' }
		]
	},
	{
		key: 'people',
		label: 'Team directory',
		actions: [
			{ key: 'view', perm: 'people:query', allow: 'View the team directory', deny: 'View the team directory' },
			{ key: 'add', perm: 'people:add', allow: 'Add external people', deny: 'Add external people' }
		]
	},
	{
		key: 'analysis',
		label: 'Reports',
		actions: [
			{ key: 'view', perm: 'analysis:query', allow: 'View reports', deny: 'View reports' }
		]
	},
	{
		key: 'roles',
		label: 'Roles & access',
		actions: [
			{ key: 'view', perm: 'role:query', allow: 'View roles, members and access history', deny: 'View roles' },
			{ key: 'edit', perm: 'role:set', allow: 'Change role permissions and record scope', deny: 'Change role permissions' },
			{ key: 'add', perm: 'role:add', allow: 'Create roles', deny: 'Create roles' },
			{ key: 'delete', perm: 'role:delete', allow: 'Delete roles', deny: 'Delete roles' }
		]
	},
	{
		key: 'members',
		label: 'Members',
		actions: [
			{ key: 'view', perm: 'user:query', allow: 'View member accounts', deny: 'View members' },
			{ key: 'add', perm: 'user:add', allow: 'Create member accounts', deny: 'Create members' },
			{ key: 'setType', perm: 'user:set-type', allow: 'Change a member\'s role', deny: 'Change roles' },
			{ key: 'setStatus', perm: 'user:set-status', allow: 'Suspend or restore a member', deny: 'Change member status' },
			{ key: 'delete', perm: 'user:delete', allow: 'Delete member accounts', deny: 'Delete members' }
		]
	}
];

function buildModel(keys, scope) {
	const granted = new Set(keys);
	const areas = AREAS.map(area => {
		const actions = area.actions.map(action => ({
			key: action.key,
			allowed: granted.has(action.perm),
			phrase: granted.has(action.perm) ? action.allow : action.deny
		}));
		const view = actions.find(action => action.key === 'view');
		return {
			key: area.key,
			label: area.label,
			accessible: view ? view.allowed : actions.some(action => action.allowed),
			scope: area.scope ? scope : null,
			scopePhrase: area.scope ? SCOPE_PHRASE[scope] || SCOPE_PHRASE.own : null,
			actions
		};
	});

	const can = [];
	const cannot = [];
	for (const area of areas) {
		for (const action of area.actions) {
			if (!action.allowed) continue;
			let phrase = action.phrase;
			if (area.scope && (action.key === 'view' || action.key === 'edit')) {
				phrase = `${action.phrase} (${SCOPE_PHRASE[scope] || SCOPE_PHRASE.own})`;
			}
			can.push({ area: area.key, areaLabel: area.label, action: action.key, phrase });
		}
	}
	for (const area of areas) {
		const view = area.actions.find(action => action.key === 'view');
		if (view && !view.allowed) {
			cannot.push({ area: area.key, areaLabel: area.label, phrase: `Access ${area.label}` });
		}
	}

	const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
	const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);
	const scopeText = SCOPE_PHRASE[scope] || SCOPE_PHRASE.own;

	const summaries = areas
		.filter(area => area.accessible)
		.map(area => {
			const allowed = area.actions.filter(action => action.allowed);

			if (area.key === 'finance' && allowed.length === 1 && allowed[0].key === 'view') {
				return 'View Finance records. Cannot create, edit, approve or delete them.';
			}

			if (area.scope && allowed.some(action => ['view', 'edit'].includes(action.key))) {
				const manage = allowed.some(action => ['add', 'edit'].includes(action.key));
				const noun = area.label.replace(/^CRM → /, 'CRM ');
				return `${manage ? 'View and manage' : 'View'} ${noun} — ${scopeText}.`;
			}

			const verbs = allowed.map(action => lowerFirst(action.phrase));
			if (verbs.length === 1) return `${capitalize(verbs[0])}.`;
			return `${capitalize(verbs.slice(0, -1).join(', '))} and ${verbs[verbs.length - 1]}.`;
		});

	return { areas, can, cannot, summaries };
}

const accessService = {
	AREAS,

	// Effective access for a member: role grants, per-user overrides, and the
	// record scope that applies to them.
	async forMember(c, userId) {
		const keys = await permService.userPermKeys(c, userId);
		const scope = await scopeService.resolveScope(c, userId);
		const model = buildModel(keys, scope);

		const member = await c.env.db.prepare(
			`SELECT u.user_id, u.display_name, u.username, u.email, u.job_title, u.data_scope,
				r.name AS role_name, r.role_id
			 FROM user u LEFT JOIN role r ON r.role_id = u.type
			 WHERE u.user_id = ?`
		).bind(userId).first();

		const overrides = await c.env.db.prepare(
			`SELECT perm_key, effect FROM user_perm_override WHERE user_id = ? ORDER BY perm_key`
		).bind(userId).all();

		return {
			userId,
			displayName: member?.display_name || null,
			username: member?.username || null,
			email: member?.email || null,
			position: member?.job_title || null,
			role: member?.role_id ? { roleId: member.role_id, name: member.role_name } : null,
			scope,
			overrides: overrides.results || [],
			...model
		};
	},

	// Grant, deny or clear direct per-member overrides. This is the write side of
	// the individual-member access model: a role sets the baseline, and an
	// administrator can grant or deny specific permissions for one person on top.
	async setMemberOverrides(c, { userId, permKeys, effect, actorId }) {
		const validEffects = ['allow', 'deny', 'inherit'];
		if (!validEffects.includes(effect)) {
			throw new BizError('effect must be allow, deny or inherit', 400);
		}
		const keys = Array.isArray(permKeys)
			? [...new Set(permKeys.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim()))]
			: [];
		if (!keys.length) {
			throw new BizError('At least one permission is required', 400);
		}

		const member = await c.env.db.prepare(
			`SELECT user_id FROM user WHERE user_id = ? AND COALESCE(is_del, 0) = 0`
		).bind(userId).first();
		if (!member) {
			throw new BizError('Member not found', 404);
		}

		// Reject unknown keys so a typo cannot create a dead override that never
		// matches a real permission.
		const placeholders = keys.map(() => '?').join(', ');
		const known = await c.env.db.prepare(
			`SELECT perm_key FROM perm WHERE perm_key IS NOT NULL AND perm_key <> '' AND perm_key IN (${placeholders})`
		).bind(...keys).all();
		const knownSet = new Set((known.results || []).map((r) => r.perm_key));
		const unknown = keys.filter((k) => !knownSet.has(k));
		if (unknown.length) {
			throw new BizError(`Unknown permission: ${unknown.join(', ')}`, 400);
		}

		if (effect === 'inherit') {
			await c.env.db.prepare(
				`DELETE FROM user_perm_override WHERE user_id = ? AND perm_key IN (${placeholders})`
			).bind(userId, ...keys).run();
		} else {
			for (const key of keys) {
				await c.env.db.prepare(
					`INSERT OR REPLACE INTO user_perm_override (user_id, perm_key, effect) VALUES (?, ?, ?)`
				).bind(userId, key, effect).run();
			}
		}

		await roleService.recordAudit(c, {
			roleId: null,
			roleName: null,
			actorId,
			action: 'member_override',
			summary: `${effect === 'inherit' ? 'Cleared' : effect === 'allow' ? 'Granted' : 'Denied'} ${keys.length} permission override(s)`,
			detail: keys.join(', ')
		});

		return accessService.forMember(c, userId);
	},

	// Effective access for a role definition, used before a role is saved and in
	// the role builder's preview tab. Explicit per-member overrides are excluded
	// because they belong to a member, not a role.
	async forRole(c, roleId) {
		const row = await c.env.db.prepare(
			`SELECT r.role_id, r.name, r.description, r.data_scope,
				(SELECT COUNT(*) FROM user u WHERE u.type = r.role_id AND COALESCE(u.is_del, 0) = 0) AS member_count
			 FROM role r WHERE r.role_id = ?`
		).bind(roleId).first();

		if (!row) {
			throw new BizError('Role not found', 404);
		}

		const grants = await c.env.db.prepare(
			`SELECT DISTINCT p.perm_key FROM perm p
			 INNER JOIN role_perm rp ON rp.perm_id = p.perm_id
			 WHERE rp.role_id = ? AND p.perm_key IS NOT NULL AND p.perm_key <> ''`
		).bind(roleId).all();

		const scope = scopeService.normalizeScope(row.data_scope);
		return {
			role: { roleId: row.role_id, name: row.name, description: row.description },
			memberCount: row.member_count || 0,
			scope,
			granted: grants.results.map(g => g.perm_key),
			...buildModel(grants.results.map(g => g.perm_key), scope)
		};
	}
};

export default accessService;