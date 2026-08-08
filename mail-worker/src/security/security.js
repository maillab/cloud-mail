import BizError from '../error/biz-error';
import constant from '../const/constant';
import jwtUtils from '../utils/jwt-utils';
import KvConst from '../const/kv-const';
import dayjs from 'dayjs';
import userService from '../service/user-service';
import permService from '../service/perm-service';
import { t } from '../i18n/i18n';
import app from '../hono/hono';

const publicRoutes = [
	['GET', '/health'],
	['POST', '/login'],
	['POST', '/register'],
	['GET', '/setting/websiteConfig'],
	['POST', '/webhooks'],
	['POST', '/init'],
	['GET', /^\/init\/[^/]+$/],
	['POST', '/public/genToken'],
	['GET', /^\/telegram\/getEmail\/[^/]+$/],
	['GET', '/oauth/linuxDo/state'],
	['POST', '/oauth/linuxDo/login'],
	['PUT', '/oauth/bindUser'],
	['GET', /^\/oss(?:\/.*)?$/]
];

const permissionPaths = {
	'email:delete': [['DELETE', '/email/delete']],
	'email:send': [['POST', '/email/send']],
	'account:add': [['POST', '/account/add']],
	'account:query': [
		['GET', '/account/list'],
		['PUT', '/account/setName'],
		['PUT', '/account/setAllReceive'],
		['PUT', '/account/setAsTop']
	],
	'account:delete': [['DELETE', '/account/delete']],
	'my:delete': [['DELETE', '/my/delete']],
	'role:add': [['POST', '/role/add'], ['GET', '/role/tree']],
	'role:set': [['PUT', '/role/set'], ['PUT', '/role/setDefault'], ['GET', '/role/tree']],
	'role:query': [['GET', '/role/list'], ['GET', '/role/tree'], ['GET', '/role/selectUse']],
	'role:delete': [['DELETE', '/role/delete']],
	'user:query': [['GET', '/user/list'], ['GET', '/user/allAccount'], ['GET', '/role/selectUse']],
	'user:add': [['POST', '/user/add'], ['GET', '/role/selectUse']],
	'user:reset-send': [['PUT', '/user/resetSendCount']],
	'user:set-pwd': [['PUT', '/user/setPwd']],
	'user:set-status': [['PUT', '/user/setStatus'], ['PUT', '/user/restore']],
	'user:set-type': [['PUT', '/user/setType'], ['GET', '/role/selectUse']],
	'user:delete': [['DELETE', '/user/delete'], ['DELETE', '/user/deleteAccount']],
	'all-email:query': [['GET', '/allEmail/list'], ['GET', '/allEmail/latest']],
	'all-email:delete': [['DELETE', '/allEmail/delete'], ['DELETE', '/allEmail/batchDelete']],
	'setting:query': [['GET', '/setting/query']],
	'setting:set': [
		['PUT', '/setting/set'],
		['PUT', '/setting/setBackground'],
		['DELETE', '/setting/deleteBackground'],
		['PUT', '/setting/setBlacklist'],
		['POST', '/setting/testTelegram']
	],
	'analysis:query': [['GET', '/analysis/echarts']],
	'reg-key:add': [['POST', '/regKey/add'], ['GET', '/role/selectUse']],
	'reg-key:query': [['GET', '/regKey/list'], ['GET', '/regKey/history'], ['GET', '/role/selectUse']],
	'reg-key:delete': [['DELETE', '/regKey/delete'], ['DELETE', '/regKey/clearNotUse']]
};

const protectedPermissionRoutes = Object.values(permissionPaths).flat();

function routeMatches(route, method, path) {
	const [routeMethod, routePath] = route;
	if (routeMethod !== method) return false;
	return routePath instanceof RegExp ? routePath.test(path) : routePath === path;
}

function isAdmin(c, user) {
	return typeof c.env?.admin === 'string'
		&& typeof user?.email === 'string'
		&& user.email.toLowerCase() === c.env.admin.toLowerCase();
}

app.use('*', async (c, next) => {
	const method = c.req.method.toUpperCase();
	const path = c.req.path;

	if (publicRoutes.some(route => routeMatches(route, method, path))) return next();

	if (path.startsWith('/public/')) {
		const expectedToken = await c.env.kv.get(KvConst.PUBLIC_KEY);
		const suppliedToken = c.req.header(constant.TOKEN_HEADER);
		if (!expectedToken || typeof suppliedToken !== 'string' || suppliedToken !== expectedToken) {
			throw new BizError(t('publicTokenFail'), 401);
		}
		return next();
	}

	const jwt = c.req.header(constant.TOKEN_HEADER);
	const tokenPayload = await jwtUtils.verifyToken(c, jwt);
	if (!tokenPayload || !Number.isSafeInteger(Number(tokenPayload.userId)) || typeof tokenPayload.token !== 'string') {
		throw new BizError(t('authExpired'), 401);
	}

	const userId = Number(tokenPayload.userId);
	const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
	if (!authInfo || !authInfo.user || !Array.isArray(authInfo.tokens) || !authInfo.tokens.includes(tokenPayload.token)) {
		throw new BizError(t('authExpired'), 401);
	}

	if (protectedPermissionRoutes.some(route => routeMatches(route, method, path)) && !isAdmin(c, authInfo.user)) {
		const permKeys = await permService.userPermKeys(c, userId);
		const allowedRoutes = (Array.isArray(permKeys) ? permKeys : [])
			.flatMap(key => permissionPaths[key] || []);
		if (!allowedRoutes.some(route => routeMatches(route, method, path))) {
			throw new BizError(t('unauthorized'), 403);
		}
	}

	const refreshTime = dayjs(authInfo.refreshTime);
	if (!refreshTime.isValid() || !dayjs().startOf('day').isSame(refreshTime.startOf('day'))) {
		authInfo.refreshTime = dayjs().toISOString();
		await userService.updateUserInfo(c, userId);
		await c.env.kv.put(
			KvConst.AUTH_INFO + userId,
			JSON.stringify(authInfo),
			{ expirationTtl: constant.TOKEN_EXPIRE }
		);
	}

	c.set('user', authInfo.user);
	return next();
});
