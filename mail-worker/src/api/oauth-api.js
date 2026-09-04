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

//以下接口以 /my 开头，需要登录后才能访问
app.get('/my/oauth/list', async (c) => {
	const list = await oauthService.curUserList(c, userContext.getUserId(c));
	return c.json(result.ok(list))
})

app.put('/my/oauth/bind', async (c) => {
	const oauthRow = await oauthService.bindCurUser(c, await c.req.json(), userContext.getUserId(c));
	return c.json(result.ok(oauthRow))
})

app.delete('/my/oauth/unbind', async (c) => {
	await oauthService.unbindCurUser(c, c.req.query(), userContext.getUserId(c));
	return c.json(result.ok())
})
