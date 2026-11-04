import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import loginService from '../service/login-service';
import result from '../model/result';
import userContext from '../security/user-context';
import type { LoginRequest, RegisterRequest } from '../types/login';

export function registerLoginApi(app: Hono<AppEnvironment>) {
	app.post('/login', async (c) => {
		const token = await loginService.login(c, await c.req.json<LoginRequest>());
		return c.json(result.ok({ token: token }));
	});

	app.post('/register', async (c) => {
		const jwt = await loginService.register(c, await c.req.json<RegisterRequest>());
		return c.json(result.ok(jwt));
	});

	app.delete('/logout', async (c) => {
		await loginService.logout(c, userContext.getUserId(c));
		return c.json(result.ok());
	});
}
