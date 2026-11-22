import BizError from '../error/biz-error';
import constant from '../const/constant';
import jwtUtils from '../utils/jwt-utils';
import KvConst from '../const/kv-const';
import dayjs from 'dayjs';
import userService from '../service/user-service';
import permService from '../service/perm-service';
import { t } from '../i18n/i18n'
import app from '../hono/hono';
import auditService from '../service/audit-service';
import securityService from '../service/security-service';

const exclude = [
	'/login',
	'/auth',
	'/register',
	'/oss',
	'/setting/websiteConfig',
	'/webhooks',
	'/init',
	'/public/genToken',
	'/public/invoice',
	'/telegram',
	'/test',
	'/oauth'
];

// Endpoints a member holding an 'onboarding' scope session may reach. This is
// the whole list on purpose: until the password is changed and the authenticator
// is enrolled, the member must not be able to touch company data.
//
// /my/loginUserInfo is included because the shell bootstrap calls it on every
// load (including a refresh mid-onboarding) to learn who the member is. It
// returns only the caller's own identity and security state, never business
// data, so it is safe to allow before onboarding completes.
const onboardingAllowed = [
	'/security/onboarding',
	'/security/mfa/setup',
	'/security/mfa/confirm',
	'/security/state',
	'/my/loginUserInfo'
];

const requirePerms = [
	'/email/send',
	'/email/list',
	'/email/latest',
	'/email/attList',
	'/email/read',
	'/mailbox',
	'/shared-mailbox',
	'/star',
	'/email/delete',
	'/account/list',
	'/account/delete',
	'/account/add',
	'/my/delete',
	'/analysis/echarts',
	'/role/add',
	'/role/list',
	'/role/people',
	'/role/delete',
	'/role/tree',
	'/role/selectUse',
	'/role/set',
	'/role/setDefault',
	'/role/history',
	'/role/members',
	'/allEmail/list',
	'/allEmail/delete',
	'/allEmail/batchDelete',
	'/allEmail/latest',
	'/setting/setBackground',
	'/setting/deleteBackground',
	'/setting/set',
	'/setting/query',
	'/setting/team',
	'/setting/setBlacklist',
	'/user/delete',
	'/user/setPwd',
	'/user/setStatus',
	'/user/setType',
	'/user/list',
	'/user/restore',
	'/user/resetSendCount',
	'/user/add',
	'/user/deleteAccount',
	'/user/allAccount',
	'/user/security',
	'/regKey/add',
	'/regKey/list',
	'/regKey/delete',
	'/regKey/clearNotUse',
	'/regKey/history',
	'/crm/contacts',
	'/crm/companies',
	'/crm/pipelines',
	'/crm/stages',
	'/crm/deals',
	'/crm/tasks',
	'/crm/leads',
	'/crm/activities',
	'/crm/organizations',
	'/crm/contact-organizations',
	'/crm/events',
	'/notifications',
	'/support',
	'/projects',
	'/calendar',
	'/notes',
	'/people',
	'/documents',
	'/finance',
	'/whatsapp',
	'/approvals',
	'/requests',
	'/automations',
	'/integrations',
	'/ai',
	'/security',
	'/team',
	'/announcements',
	'/connections',
	'/invitations'
	];

const premKey = {
	'email:delete': ['/email/delete'],
	'email:send': ['/email/send'],
	'account:add': ['/account/add'],
	'account:query': ['/account/list'],
	'account:delete': ['/account/delete'],
	'my:delete': ['/my/delete'],
	'role:add': ['/role/add'],
	'role:set': ['/role/set','/role/setDefault'],
	'role:query': ['/role/list', '/role/tree'],
	'role:delete': ['/role/delete'],
	'user:query': ['/user/list','/user/allAccount'],
	'user:add': ['/user/add'],
	'user:reset-send': ['/user/resetSendCount'],
	'user:set-pwd': ['/user/setPwd'],
	'user:set-status': ['/user/setStatus', '/user/restore'],
	'user:set-type': ['/user/setType'],
	'user:delete': ['/user/delete','/user/deleteAccount'],
	'all-email:query': ['/allEmail/list','/allEmail/latest'],
	'all-email:delete': ['/allEmail/delete','/allEmail/batchDelete'],
	'setting:query': ['/setting/query'],
	'setting:set': ['/setting/set', '/setting/setBackground','/setting/deleteBackground','/setting/setBlacklist'],
	'analysis:query': ['/analysis/echarts'],
	'reg-key:add': ['/regKey/add'],
	'reg-key:query': ['/regKey/list','/regKey/history'],
	'reg-key:delete': ['/regKey/delete','/regKey/clearNotUse'],
	'contacts:query': ['/crm/contacts'],
	'contacts:add': ['/crm/contacts'],
	'contacts:edit': ['/crm/contacts'],
	'contacts:delete': ['/crm/contacts'],
	'companies:query': ['/crm/companies'],
	'companies:add': ['/crm/companies'],
	'companies:edit': ['/crm/companies'],
	'companies:delete': ['/crm/companies'],
	'pipelines:query': ['/crm/pipelines'],
	'pipelines:add': ['/crm/pipelines'],
	'pipelines:edit': ['/crm/pipelines'],
	'pipelines:delete': ['/crm/pipelines'],
	'deals:query': ['/crm/deals'],
	'deals:add': ['/crm/deals'],
	'deals:edit': ['/crm/deals'],
	'deals:delete': ['/crm/deals'],
	'tasks:query': ['/crm/tasks'],
	'tasks:add': ['/crm/tasks'],
	'tasks:edit': ['/crm/tasks'],
	'tasks:delete': ['/crm/tasks'],
	'leads:query': ['/crm/leads'],
	'leads:add': ['/crm/leads'],
	'leads:edit': ['/crm/leads'],
	'leads:delete': ['/crm/leads'],
	'activities:query': ['/crm/activities'],
	'activities:add': ['/crm/activities'],
	'activities:delete': ['/crm/activities/:id'],
	'organizations:query': ['/crm/organizations'],
	'organizations:add': ['/crm/organizations'],
	'organizations:edit': ['/crm/organizations'],
	'organizations:delete': ['/crm/organizations'],
	'contact-organizations:query': ['/crm/contact-organizations'],
	'contact-organizations:add': ['/crm/contact-organizations'],
	'contact-organizations:edit': ['/crm/contact-organizations'],
	'contact-organizations:delete': ['/crm/contact-organizations'],
	'events:query': ['/crm/events'],
	'events:add': ['/crm/events'],
	'events:edit': ['/crm/events'],
	'events:delete': ['/crm/events'],
	'opportunities:query': ['/crm/deals'],
	'opportunities:add': ['/crm/deals'],
	'opportunities:edit': ['/crm/deals'],
	'opportunities:delete': ['/crm/deals'],
	'notifications:query': ['/notifications'],
	'notifications:add': ['/notifications'],
	'notifications:delete': ['/notifications'],
	'support:query': ['/support'],
	'support:add': ['/support'],
	'support:edit': ['/support'],
	'support:delete': ['/support'],
	'projects:query': ['/projects'],
	'projects:add': ['/projects'],
	'projects:edit': ['/projects'],
	'projects:delete': ['/projects'],
	'calendar:query': ['/calendar'],
	'calendar:add': ['/calendar'],
	'calendar:edit': ['/calendar'],
	'calendar:delete': ['/calendar'],
	'notes:query': ['/notes'],
	'notes:add': ['/notes'],
	'notes:edit': ['/notes'],
	'notes:delete': ['/notes'],
	'people:query': ['/people'],
	'people:add': ['/people'],
	'people:edit': ['/people'],
	'people:delete': ['/people'],
	'documents:query': ['/documents'],
	'documents:add': ['/documents'],
	'documents:edit': ['/documents'],
	'documents:delete': ['/documents'],
	'finance:view': ['/finance'],
	'finance:edit': ['/finance'],
	'finance:approve': ['/finance'],
	'whatsapp:query': ['/whatsapp'],
	'whatsapp:send': ['/whatsapp'],
	'automations:query': ['/automations'],
	'automations:add': ['/automations'],
	'automations:edit': ['/automations'],
	'automations:delete': ['/automations'],
	'integrations:query': ['/integrations'],
	'integrations:add': ['/integrations'],
	'integrations:edit': ['/integrations'],
	'ai:use': ['/ai']
};

app.use('*', async (c, next) => {

	const path = c.req.path;

	const index = exclude.findIndex(item => {
		return path.startsWith(item);
	});

	if (index > -1) {
		return await next();
	}

	if (path.startsWith('/public')) {

		const userPublicToken = await c.env.kv.get(KvConst.PUBLIC_KEY);
		const publicToken = c.req.header(constant.TOKEN_HEADER);
		if (publicToken !== userPublicToken) {
			throw new BizError(t('publicTokenFail'), 401);
		}
		return await next();
	}


	const jwt = c.req.header(constant.TOKEN_HEADER);

	const result = await jwtUtils.verifyToken(c, jwt);

	if (!result || result.gen !== constant.AUTH_GEN) {
		throw new BizError(t('authExpired'), 401);
	}

	const { userId, token } = result;
	const authInfoRaw = await c.env.kv.get(KvConst.AUTH_INFO + userId);
	let authInfo = authInfoRaw ? JSON.parse(authInfoRaw) : null;

	// KV is eventually consistent across Cloudflare locations. A phone can sign
	// in through one location and immediately make its first authenticated call
	// through another, where the just-issued token has not reached KV yet. The
	// session row is the durable authority for that narrow window. Falling back
	// to it only after JWT verification preserves the normal fast KV path while
	// stopping a legitimate new session from being called "expired".
	if (!authInfo || !Array.isArray(authInfo.tokens) || !authInfo.tokens.includes(token)) {
		const session = await c.env.db.prepare(
			`SELECT id FROM user_session WHERE user_id = ? AND token_id = ? AND revoked_at IS NULL LIMIT 1`
		).bind(userId, token).first();
		if (!session) {
			throw new BizError(t('authExpired'), 401);
		}

		const liveUser = await userService.selectById(c, userId);
		if (!liveUser || liveUser.isDel) {
			throw new BizError(t('authExpired'), 401);
		}

		const onboardingComplete = Boolean(liveUser.onboardingCompletedAt);
		authInfo = {
			tokens: [token],
			user: liveUser,
			scope: onboardingComplete ? 'full' : 'onboarding',
			refreshTime: dayjs().toISOString(),
			lastLoginAt: dayjs().toISOString()
		};
		// Restore the fast path for subsequent requests. This write is best effort:
		// the durable session above is already enough to authenticate this request.
		c.executionCtx.waitUntil(c.env.kv.put(
			KvConst.AUTH_INFO + userId,
			JSON.stringify(authInfo),
			{ expirationTtl: constant.TOKEN_EXPIRE }
		));
	}

	// A session explicitly revoked (password change, MFA reset, admin action)
	// must stop working even though its token has not expired.
	if (await securityService.isSessionRevoked(c, userId, token)) {
		throw new BizError(t('authExpired'), 401);
	}

	// --- Onboarding gate ---------------------------------------------------
	// A session issued before onboarding completed can only reach the onboarding
	// endpoints. Enforced here rather than per-route, so a newly added business
	// route cannot accidentally leak data to an unverified account.
	// A completed onboarding can be reflected in D1 a moment before KV's scope
	// update arrives. Upgrade the current request from the durable user state so
	// a member is never bounced back to setup after successfully finishing it.
	let scope = authInfo.scope || 'full';
	if (scope === 'onboarding') {
		const currentUser = await userService.selectById(c, userId);
		if (currentUser?.onboardingCompletedAt) {
			scope = 'full';
			authInfo.scope = 'full';
			c.executionCtx.waitUntil(c.env.kv.put(
				KvConst.AUTH_INFO + userId,
				JSON.stringify(authInfo),
				{ expirationTtl: constant.TOKEN_EXPIRE }
			));
		}
	}
	if (scope === 'onboarding') {
		const allowed = onboardingAllowed.some(item => path.startsWith(item));
		if (!allowed && path !== '/logout') {
			throw new BizError('Finish securing your account before continuing.', 428, { onboardingRequired: true });
		}
	}

	// Touch the session row so "last active" is meaningful. Best effort.
	securityService.touchSession(c, userId, token);

	const permIndex = requirePerms.findIndex(item => {
		return path.startsWith(item);
	});

	if (permIndex > -1) {

		const permKeys = await permService.userPermKeys(c, authInfo.user.userId);

		const method = c.req.method;
		const permSuffix = methodToPermSuffix(method);
		const resourcePerm = pathToResourcePerm(path, permKeys, permSuffix);

		// No identity-based bypass. The configured administrator is granted the
		// explicit permission set by permService.userPermKeys (which re-applies
		// deny overrides), so an administrator can still be restricted by an
		// explicit deny instead of silently receiving every capability.
		if (!resourcePerm) {
			throw new BizError(t('unauthorized'), 403);
		}

		if (method !== 'GET') {
			await auditService.log(c, authInfo.user.userId, method, path, authInfo.user.email);
		}
	}


	const refreshTime = dayjs(authInfo.refreshTime).startOf('day');
	const nowTime = dayjs().startOf('day')

	if (!nowTime.isSame(refreshTime)) {
		authInfo.refreshTime = dayjs().toISOString();
		await userService.updateUserInfo(c, authInfo.user.userId);
		await c.env.kv.put(KvConst.AUTH_INFO + userId, JSON.stringify(authInfo), { expirationTtl: constant.TOKEN_EXPIRE });
	}

	c.set('user',authInfo.user)
	c.set('currentTokenId', token)

	return await next();
});

function methodToPermSuffix(method) {
	switch (method) {
		case 'GET': return 'query';
		case 'POST': return 'add';
		case 'PUT':
		case 'PATCH': return 'edit';
		case 'DELETE': return 'delete';
		default: return 'query';
	}
}

function pathToResourcePerm(path, permKeys, suffix) {
	const segmentMatch = path.match(/^\/([a-zA-Z-]+)/);
	if (!segmentMatch) return false;
	// Route segments are camel case while permission keys are hyphenated.
	const resourceAliases = { regKey: 'reg-key', allEmail: 'all-email' };
	const resource = resourceAliases[segmentMatch[1]] || segmentMatch[1];
	if (resource === 'finance') {
		if (/approve/i.test(path)) return permKeys.includes('finance:approve') || permKeys.includes('*');
		if (suffix === 'query') return permKeys.includes('finance:view') || permKeys.includes('*');
		return permKeys.includes('finance:edit') || permKeys.includes('*');
	}
	if (resource === 'whatsapp') {
		if (suffix === 'query') return permKeys.includes('whatsapp:query') || permKeys.includes('*');
		return permKeys.includes('whatsapp:send') || permKeys.includes('*');
	}

	if (resource === 'approvals') {
		if (/^\/approvals\/\d+\/(approve|reject|request-changes)$/.test(path)) {
			return permKeys.includes('approvals:approve') || permKeys.includes('*');
		}
		if (/^\/approvals\/\d+\/(submit|cancel|comments)$/.test(path)) {
			return permKeys.includes('approvals:add') || permKeys.includes('*');
		}
		if (suffix === 'query') return permKeys.includes('approvals:query') || permKeys.includes('*');
		return permKeys.includes('approvals:add') || permKeys.includes('*');
	}

	if (resource === 'requests') {
		if (/^\/requests\/\d+\/act$/.test(path)) return permKeys.includes('requests:act') || permKeys.includes('*');
		if (suffix === 'query') return permKeys.includes('requests:query') || permKeys.includes('*');
		return permKeys.includes('requests:add') || permKeys.includes('*');
	}

	if (resource === 'notes') {
		if (/^\/notes\/\d+\/pin$/.test(path)) return permKeys.includes('notes:edit') || permKeys.includes('*');
		if (suffix === 'query') return permKeys.includes('notes:query') || permKeys.includes('*');
		return permKeys.includes('notes:add') || permKeys.includes('*');
	}

	if (resource === 'calendar') {
		// Invited employees may respond without create rights.
		if (/^\/calendar\/\d+\/respond$/.test(path)) return permKeys.includes('calendar:query') || permKeys.includes('*');
		return permKeys.includes(`calendar:${suffix}`) || permKeys.includes('*');
	}

	if (resource === 'notifications') {
		// Reading and marking read require only read access; there is no edit perm.
		if (/^\/notifications\/(\d+\/read|read-all)$/.test(path)) return permKeys.includes('notifications:query') || permKeys.includes('*');
		if (suffix === 'query') return permKeys.includes('notifications:query') || permKeys.includes('*');
		return permKeys.includes('notifications:add') || permKeys.includes('*');
	}
	if (resource === 'ai') {
		return permKeys.includes('ai:use') || permKeys.includes('*');
	}

	if (resource === 'setting' && /^\/setting\/teams?(\/|$)/.test(path)) {
		if (suffix === 'query') return permKeys.includes('setting:query') || permKeys.includes('*');
		return permKeys.includes('setting:set') || permKeys.includes('*');
	}
	if (resource === 'email') {
		if (/^\/email\/send$/.test(path)) return permKeys.includes('email:send') || permKeys.includes('*');
		if (/^\/email\/delete$/.test(path)) return permKeys.includes('email:delete') || permKeys.includes('*');
		return permKeys.includes('email:query') || permKeys.includes('*');
	}

	if (resource === 'mailbox') {
		// Folders, counts, moves and templates are mail data: reading needs the
		// mail read permission, changing them needs send rights.
		if (suffix === 'query') return permKeys.includes('email:query') || permKeys.includes('*');
		return permKeys.includes('email:send') || permKeys.includes('*');
	}

	// Shared company mailboxes. This is the outer role gate only: every handler
	// re-checks mailbox membership and the per-mailbox action list, so a member
	// with a role permission but no membership still gets 403/404.
	if (resource === 'shared-mailbox') {
		const seg = path.split('/')[2] || '';
		// Member management and tag catalogue are administrative.
		if (/^\/shared-mailbox\/(tags|members)/.test(path) && suffix !== 'query') {
			return permKeys.includes('mailbox:manage') || permKeys.includes('*');
		}
		if (seg === 'tags' && suffix === 'query') {
			return permKeys.includes('email:query') || permKeys.includes('*');
		}
		if (suffix === 'query') return permKeys.includes('email:query') || permKeys.includes('*');
		return permKeys.includes('email:send') || permKeys.includes('*');
	}

	if (resource === 'star') {
		return permKeys.includes('email:query') || permKeys.includes('*');
	}
	if (resource === 'integrations') {
		const k = suffix === 'delete' ? 'edit' : suffix;
		return permKeys.includes(`integrations:${k}`) || permKeys.includes('*');
	}
	if (resource === 'crm') {
		// Map /crm/<sub> to its own permission prefix so role-scoped access works.
		const seg = path.split('/')[2] || '';
		const map = {
			contacts: 'contacts',
			companies: 'companies',
			pipelines: 'pipelines',
			stages: 'pipelines',
			deals: 'deals',
			tasks: 'tasks',
			leads: 'leads',
			organizations: 'organizations',
			relationships: 'contact-organizations',
			events: 'events',
			activities: 'activities'
		};
		const prefix = map[seg];
		if (prefix) {
			if (suffix === 'query') return permKeys.includes(prefix + ':query') || permKeys.includes('*');
			if (suffix === 'delete') return permKeys.includes(prefix + ':delete') || permKeys.includes('*');
			// Editing a record must require the edit right, not the create right.
			// Some modules have no edit key, so fall back only through keys that
			// actually exist in the catalog (a granted key is always a real one).
			return [prefix + ':edit', prefix + ':add']
				.some(key => permKeys.includes(key)) || permKeys.includes('*');
		}
		return permKeys.includes('crm:*') || permKeys.includes('*');
	}
	// Role administration uses a dedicated permission per action: creating, listing,
	// editing and deleting roles are separate rights, so an access editor is not
	// silently able to delete roles.
	if (resource === 'role') {
		if (/^\/role\/(set|setDefault)$/.test(path)) return permKeys.includes('role:set') || permKeys.includes('*');
		if (/^\/role\/(add)$/.test(path)) return permKeys.includes('role:add') || permKeys.includes('*');
		if (/^\/role\/delete$/.test(path)) return permKeys.includes('role:delete') || permKeys.includes('*');
		return permKeys.includes('role:query') || permKeys.includes('*');
	}
	// Member administration has one permission per action (password, status, role,
	// send quota), so the generic PUT -> edit mapping would deny all of them.
	// Self-service access preview: every member may read their own effective access.
	// Reading another member's requires user:query, enforced in the handler.
	if (resource === 'user' && path === '/user/access') return true;
	if (resource === 'user') {
		const action = path.split('/')[2] || '';
		// Administrator assignment of role, team and position. Each field is
		// checked again inside the handler, so this is the outer gate only.
		if (/\/assignment$/.test(path)) return permKeys.includes('user:set-type') || permKeys.includes('*');
		const map = {
			setPwd: 'user:set-pwd',
			setStatus: 'user:set-status',
			setType: 'user:set-type',
			resetSendCount: 'user:reset-send',
			// Security administration on another member: resetting an
			// authenticator or issuing a temporary password are distinct,
			// auditable rights.
			resetMfa: 'user:reset-mfa',
			resetPassword: 'user:reset-password',
			// Reactivating a deleted account is a status change.
			restore: 'user:set-status'
		};
		if (map[action]) return permKeys.includes(map[action]) || permKeys.includes('*');
		if (action === 'add') return permKeys.includes('user:add') || permKeys.includes('*');
		if (action === 'delete' || action === 'deleteAccount') return permKeys.includes('user:delete') || permKeys.includes('*');
		return permKeys.includes('user:query') || permKeys.includes('*');
	}
	// Self-service security (authenticator, recovery codes, sessions, login
	// history, own password). Every handler derives the target member from the
	// token, so an authenticated member may always manage their own security.
	if (resource === 'security') {
		return true;
	}
	// XPass Team. Reading the directory needs the team permission; creating,
	// editing and suspending members are member-administration actions.
	if (resource === 'team') {
		if (path === '/team/overview') return permKeys.includes('team:query') || permKeys.includes('*');
		if (suffix === 'query') return permKeys.includes('team:query') || permKeys.includes('*');
		if (/\/status$/.test(path)) return permKeys.includes('user:set-status') || permKeys.includes('*');
		return permKeys.includes('user:add') || permKeys.includes('*');
	}
	// Announcements. Every member reads their own announcements; only the
	// management surface needs the management right.
	if (resource === 'announcements') {
		if (path.startsWith('/announcements/manage')) {
			if (suffix === 'query') return permKeys.includes('announcement:query') || permKeys.includes('*');
			return permKeys.includes('announcement:manage') || permKeys.includes('*');
		}
		return true;
	}
	// Connections. Viewing status is separate from writing credentials, which
	// is the action that can make the company look like itself to a provider.
	if (resource === 'connections') {
		if (suffix === 'query') return permKeys.includes('connections:query') || permKeys.includes('*');
		return permKeys.includes('connections:manage') || permKeys.includes('*');
	}
	// Invitations are member onboarding: creating one creates an account path.
	if (resource === 'invitations') {
		if (suffix === 'query') return permKeys.includes('user:query') || permKeys.includes('*');
		return permKeys.includes('user:add') || permKeys.includes('*');
	}
	// Appearance settings are configuration, not a separate create/delete pair.
	if (resource === 'setting' && /^\/setting\/(set|delete)?[Bb]ackground$/.test(path)) {
		return permKeys.includes('setting:set') || permKeys.includes('*');
	}
	const permKey = `${resource}:${suffix}`;
	return permKeys.includes(permKey) || permKeys.includes('*');
}
