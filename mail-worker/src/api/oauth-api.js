import app from '../hono/hono';
import result from "../model/result";
import oauthService from "../service/oauth-service";

// 处理LinuxDo登录
app.post('/oauth/linuxDo/login', async (c) => {
	const loginInfo = await oauthService.linuxDoLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

// 处理GitHub登录
app.post('/oauth/github/login', async (c) => {
	const loginInfo = await oauthService.githubLogin(c, await c.req.json());
	return c.json(result.ok(loginInfo))
});

// 处理GitHub OAuth回调（GET请求）
app.get('/oauth/github/callback', async (c) => {
	// 从URL参数中获取code
	const code = c.req.query('code');
	// 重定向到前端登录页面，带上code参数
	const redirectUrl = `https://mail.ygyang.uk/github/callback?code=${code}`;
	return c.redirect(redirectUrl, 302);
});

// 处理用户绑定
app.put('/oauth/bindUser', async (c) => {
	const loginInfo = await oauthService.bindUser(c, await c.req.json());
	return c.json(result.ok(loginInfo))
})

// 处理GitHub解绑
app.delete('/oauth/unbindGithub', async (c) => {
	const userContext = c.get('userContext');
	await oauthService.unbindGithub(c, userContext.userId);
	return c.json(result.ok())
})
