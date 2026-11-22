import jwtUtils from '../utils/jwt-utils';
import constant from '../const/constant';
import KvConst from '../const/kv-const';
import permService from '../service/perm-service';

// 校验握手 token（query 或 Authorization），确认会话仍在 KV 中。
export async function getWsUser(env, token) {
	if (!token) {
		return null;
	}

	const result = await jwtUtils.verifyToken({ env }, token);
	if (!result || result.gen !== constant.AUTH_GEN) {
		return null;
	}

	const { userId, token: sessionToken } = result;
	if (!userId || !sessionToken) {
		return null;
	}

	const authInfo = await env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });
	if (!authInfo?.tokens?.includes(sessionToken)) {
		return null;
	}

	return authInfo.user;
}

// 全部邮件通道：管理员或具备 all-email:query 的用户才能订阅。
export async function canWatchAllEmail(env, user) {
	if (!user?.userId) {
		return false;
	}
	if (user.email && env.admin && user.email === env.admin) {
		return true;
	}
	const keys = await permService.userPermKeys({ env }, user.userId);
	return keys.includes('all-email:query');
}

// 校验 Origin，防止其它站点拿 token 连上。
// 生产要求 host 一致；本地允许 localhost / 127.0.0.1 跨端口（Vite + wrangler）。
export function hasValidWsOrigin(request) {
	const origin = request.headers.get('Origin');
	if (!origin) {
		return true;
	}

	try {
		const originHost = new URL(origin).hostname;
		const reqHost = new URL(request.url).hostname;
		if (originHost === reqHost) {
			return true;
		}
		return isLocalHostname(originHost) && isLocalHostname(reqHost);
	} catch {
		return false;
	}
}

function isLocalHostname(host) {
	return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
}
