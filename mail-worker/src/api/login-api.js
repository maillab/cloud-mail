import app from '../hono/hono';
import loginService from '../service/login-service';
import result from '../model/result';
import userContext from '../security/user-context';

app.post('/login', async (c) => {
	const data = await loginService.login(c, await c.req.json());
	// string → { token }（正常登录）；object → { needTotp, preAuthToken }（TOTP 第二步）
	// passkey / oauth 内部调用走 noVerifyPwd，始终返回 string，不受影响
	return c.json(result.ok(typeof data === 'string' ? { token: data } : data));
});

// TOTP 登录第二步：security.js 里 '/login' 前缀豁免已覆盖本路径，无需另加白名单
app.post('/login/totp', async (c) => {
	const token = await loginService.verifyTotpLogin(c, await c.req.json());
	return c.json(result.ok({ token: token }));
});

app.post('/verify-password', async (c) => {
	await loginService.verifyPassword(c, await c.req.json());
	return c.json(result.ok());
});

app.post('/register', async (c) => {
	const jwt = await loginService.register(c, await c.req.json());
	return c.json(result.ok(jwt));
});

app.delete('/logout', async (c) => {
	await loginService.logout(c, userContext.getUserId(c));
	return c.json(result.ok());
});

