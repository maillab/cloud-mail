import type { Hono } from 'hono';
import type { AppEnvironment } from '../types/context';
import userService from '../service/user-service';
import result from '../model/result';
import userContext from '../security/user-context';

export function registerMyApi(app: Hono<AppEnvironment>) {
	app.get('/my/loginUserInfo', async (c) => {
		const user = await userService.loginUserInfo(c, userContext.getUserId(c));
		return c.json(result.ok(user));
	});

	app.put('/my/resetPassword', async (c) => {
		await userService.resetPassword(c, await c.req.json<Parameters<typeof userService.resetPassword>[1]>(), userContext.getUserId(c));
		return c.json(result.ok());
	});

	app.delete('/my/delete', async (c) => {
		await userService.delete(c, userContext.getUserId(c));
		return c.json(result.ok());
	});
}
