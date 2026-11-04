import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import type { OAuthBindRequest, OAuthCodeRequest } from '../types/oauth';

export function registerOauthApi(app: Hono<AppEnvironment>) {
	app.post('/oauth/linuxDo/login', async (c) => {
		const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json<OAuthCodeRequest>());
		return c.json(result.ok(loginInfo))
	});

	app.post('/oauth/github/login', async (c) => {
		const loginInfo = await oauthService.githubLogin(c, await c.req.json<OAuthCodeRequest>());
		return c.json(result.ok(loginInfo))
	});

	app.post('/oauth/google/login', async (c) => {
		const loginInfo = await oauthService.googleLogin(c, await c.req.json<OAuthCodeRequest>());
		return c.json(result.ok(loginInfo))
	});

	app.put('/oauth/bindUser', async (c) => {
		const loginInfo = await oauthService.bindUser(c, await c.req.json<OAuthBindRequest>());
		return c.json(result.ok(loginInfo))
	})
}
