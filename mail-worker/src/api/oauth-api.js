import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";
import userContext from "../security/user-context";

app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/github/login', async (c) => {
	const loginInfo = await oauthService.githubLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.post('/oauth/google/login', async (c) => {
	const loginInfo = await oauthService.googleLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	return c.json(result.ok(loginInfo))
})

// 已登录用户绑定第三方账号到当前账号
app.put('/oauth/bindCurrent', async (c) => {
	const data = await oauthService.bindCurrentUser(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(data))
})

// 解绑第三方账号
app.delete('/oauth/unbind', async (c) => {
	const platform = c.req.query('platform');
	await oauthService.unbind(c, platform, userContext.getUserId(c));
	return c.json(result.ok())
})

// 当前用户已绑定的第三方平台列表
app.get('/oauth/bindings', async (c) => {
	const data = await oauthService.getBindings(c, userContext.getUserId(c));
	return c.json(result.ok(data))
})
